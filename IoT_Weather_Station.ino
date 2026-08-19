/**
 * ==========================================================================
 * AEROMETRICS PRO - IoT Weather Station & OLED HUD Firmware
 * Platform: ESP32 (Arduino Framework)
 * Features:
 *   - DHT11 (Temperature & Humidity)
 *   - BMP280 (Barometric Pressure & Precision Temperature / Altitude)
 *   - SSD1306 OLED (128x64 I2C HUD)
 *   - Boot Animation ("KARMAKAR INDUSTRY" & Progress Bar)
 *   - Touch Sensor Switching (Screen 1: Time/Date <-> Screen 2: Weather HUD)
 *   - 10-Second Inactivity Auto-revert to Time Screen
 *   - Automated Cloud Push (Syncs to GitHub domain as soon as Wi-Fi connects!)
 *   - NTP Time Synchronization over Wi-Fi
 *   - Local REST API & mDNS (esp32-weather.local)
 *
 * Developed for: Rudra Workshop / Karmakar Industry
 * ==========================================================================
 */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <time.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <DHT.h>
#include "config.h"

// --- Hardware Object Instances ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET_PIN);
DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP280 bmp; // I2C BMP280
WebServer server(80);

// --- State Machine Enumeration ---
enum DisplayScreen {
  SCREEN_BOOT = 0,
  SCREEN_TIME = 1,    // Screen 1: NTP Time & Date
  SCREEN_WEATHER = 2  // Screen 2: Temperature, Humidity, Pressure
};

DisplayScreen currentScreen = SCREEN_BOOT;

// --- Global Sensor & Timing State Variables ---
float currentTemperature = 0.0;
float currentHumidity = 0.0;
float currentPressure = 0.0;
float currentAltitude = 0.0;

unsigned long lastSensorReadTime = 0;
unsigned long lastCloudSyncTime = 0;
unsigned long lastScreenTouchTime = 0;
bool lastTouchState = false;
bool bmpAvailable = false;
bool wifiConnected = false;

// Time tracking
struct tm timeinfo;

// ==========================================================================
// BITMAPS & GLYPHS FOR OLED HUD
// ==========================================================================
// 8x8 WiFi Connected Icon
const unsigned char epd_bitmap_wifi[] PROGMEM = {
  0b00111100,
  0b01000010,
  0b10011001,
  0b00100100,
  0b01000010,
  0b00011000,
  0b00011000,
  0b00000000
};

// ==========================================================================
// OLED DISPLAY RENDERING FUNCTIONS
// ==========================================================================

/**
 * Renders the Bootloader Screen with animated Progress Bar
 * "KARMAKAR INDUSTRY" & Progress percentage
 */
void drawBootScreen(int progressPercent) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Top Header: Branding
  display.setTextSize(1);
  display.setCursor(12, 4);
  display.print(F("KARMAKAR INDUSTRY"));
  display.drawFastHLine(0, 15, SCREEN_WIDTH, SSD1306_WHITE);

  // Center: Loading title
  display.setCursor(34, 23);
  display.print(F("LOADING..."));

  // Progress Bar Box (Outer Frame)
  int barX = 14;
  int barY = 36;
  int barW = 100;
  int barH = 12;
  display.drawRect(barX, barY, barW, barH, SSD1306_WHITE);

  // Progress Bar Fill
  int fillW = (barW - 4) * progressPercent / 100;
  if (fillW > 0) {
    display.fillRect(barX + 2, barY + 2, fillW, barH - 4, SSD1306_WHITE);
  }

  // Bottom percentage
  display.setCursor(52, 52);
  display.print(progressPercent);
  display.print(F("%"));

  display.display();
}

/**
 * Screen 1 (Default HUD): NTP Time & Date
 */
void drawScreen1_TimeDate() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Top Status Bar: WiFi Icon + Station Badge
  if (wifiConnected) {
    display.drawBitmap(2, 2, epd_bitmap_wifi, 8, 8, SSD1306_WHITE);
  }
  display.setTextSize(1);
  display.setCursor(38, 2);
  display.print(F("AERO-HUD"));
  display.drawFastHLine(0, 12, SCREEN_WIDTH, SSD1306_WHITE);

  // Format Time (HH:MM:SS)
  char timeString[10];
  if (getLocalTime(&timeinfo)) {
    strftime(timeString, sizeof(timeString), "%H:%M:%S", &timeinfo);
  } else {
    snprintf(timeString, sizeof(timeString), "12:00:00");
  }

  // Large Centered Clock Display
  display.setTextSize(2);
  display.setCursor(16, 20);
  display.print(timeString);

  // Format Date (e.g., WED, 19 AUG)
  char dateString[20];
  if (getLocalTime(&timeinfo)) {
    strftime(dateString, sizeof(dateString), "%a, %d %b %Y", &timeinfo);
  } else {
    snprintf(dateString, sizeof(dateString), "WAITING NTP");
  }

  display.setTextSize(1);
  display.setCursor(18, 42);
  display.print(dateString);

  // Bottom Footer Hint
  display.setCursor(14, 55);
  display.print(F("[ TOUCH SENSOR ]"));

  display.display();
}

/**
 * Screen 2: Weather Sensor Metrics (Temp, Humidity, Pressure)
 * Shows 10-second auto-return countdown timer in top right
 */
void drawScreen2_Weather() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Top Status Bar
  if (wifiConnected) {
    display.drawBitmap(2, 2, epd_bitmap_wifi, 8, 8, SSD1306_WHITE);
  }
  display.setTextSize(1);
  display.setCursor(28, 2);
  display.print(F("WEATHER HUD"));

  // Inactivity countdown remaining
  unsigned long elapsed = millis() - lastScreenTouchTime;
  int remainingSec = (SCREEN_TIMEOUT_MS - elapsed) / 1000;
  if (remainingSec < 0) remainingSec = 0;

  display.setCursor(105, 2);
  display.print(remainingSec);
  display.print(F("s"));
  display.drawFastHLine(0, 12, SCREEN_WIDTH, SSD1306_WHITE);

  // 1. Temperature Row
  display.setCursor(4, 18);
  display.print(F("TEMP: "));
  display.print(currentTemperature, 1);
  display.print(F(" C"));

  // 2. Humidity Row
  display.setCursor(4, 32);
  display.print(F("HUMI: "));
  display.print((int)currentHumidity);
  display.print(F(" %"));

  // 3. Pressure Row (BMP280)
  display.setCursor(4, 46);
  display.print(F("PRES: "));
  display.print(currentPressure, 1);
  display.print(F(" hPa"));

  // Subtle bottom border
  display.drawFastHLine(0, 60, SCREEN_WIDTH, SSD1306_WHITE);

  display.display();
}

// ==========================================================================
// SENSOR ACQUISITION & TELEMETRY
// ==========================================================================
void readSensors() {
  // Read DHT11
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (!isnan(t) && !isnan(h)) {
    currentHumidity = h;
    currentTemperature = t;
  }

  // Read BMP280 if initialized
  if (bmpAvailable) {
    float p = bmp.readPressure() / 100.0F; // Convert Pa to hPa
    float bmpTemp = bmp.readTemperature();
    
    if (p > 300.0 && p < 1200.0) {
      currentPressure = p;
      currentAltitude = bmp.readAltitude(1013.25);
    }

    if (isnan(t)) {
      currentTemperature = bmpTemp;
    }
  } else {
    currentPressure = 1013.25;
  }
}

// ==========================================================================
// AUTOMATED CLOUD SYNC (AUTOLINK WITH GITHUB DOMAIN)
// ==========================================================================
void pushDataToCloud() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Allow secure HTTPS without certificate pinning

  HTTPClient https;
  if (https.begin(client, CLOUD_POST_URL)) {
    https.addHeader("Content-Type", "application/json");

    // Build JSON Payload
    String jsonPayload = "{";
    jsonPayload += "\"temp\":" + String(currentTemperature, 1) + ",";
    jsonPayload += "\"humidity\":" + String(currentHumidity, 0) + ",";
    jsonPayload += "\"pressure\":" + String(currentPressure, 1) + ",";
    jsonPayload += "\"altitude\":" + String(currentAltitude, 0) + ",";
    jsonPayload += "\"screen\":" + String((int)currentScreen) + ",";
    jsonPayload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    jsonPayload += "\"timestamp\":" + String(millis() / 1000);
    jsonPayload += "}";

    // Use HTTP PUT to update root object
    int httpCode = https.PUT(jsonPayload);
    if (httpCode > 0) {
      Serial.printf("[CLOUD SYNC] Auto-linked to domain! (HTTP %d)\n", httpCode);
    } else {
      Serial.printf("[CLOUD SYNC] Sync error: %s\n", https.errorToString(httpCode).c_str());
    }
    https.end();
  }
}

// ==========================================================================
// TOUCH SENSOR INPUT HANDLER
// ==========================================================================
bool readTouchInput() {
#if USE_CAPACITIVE_TOUCH
  int val = touchRead(TOUCH_SENSOR_PIN);
  return (val < TOUCH_THRESHOLD);
#else
  return (digitalRead(TOUCH_SENSOR_PIN) == HIGH);
#endif
}

void handleTouchSensor() {
  bool currentTouch = readTouchInput();

  if (currentTouch && !lastTouchState) {
    lastScreenTouchTime = millis();

    if (currentScreen == SCREEN_TIME) {
      currentScreen = SCREEN_WEATHER;
      Serial.println(F("[TOUCH] Switched to Screen 2: Weather HUD"));
    } else {
      currentScreen = SCREEN_TIME;
      Serial.println(F("[TOUCH] Switched to Screen 1: Time HUD"));
    }
    delay(50);
  }

  lastTouchState = currentTouch;

  // Inactivity Auto-revert Check (10s)
  if (currentScreen == SCREEN_WEATHER) {
    if (millis() - lastScreenTouchTime >= SCREEN_TIMEOUT_MS) {
      currentScreen = SCREEN_TIME;
      Serial.println(F("[TIMEOUT] 10s elapsed with no touch. Auto-reverted to Screen 1"));
    }
  }
}

// ==========================================================================
// LOCAL REST API HANDLERS
// ==========================================================================
void handleApiData() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");

  String json = "{";
  json += "\"temp\":" + String(currentTemperature, 1) + ",";
  json += "\"humidity\":" + String(currentHumidity, 0) + ",";
  json += "\"pressure\":" + String(currentPressure, 1) + ",";
  json += "\"altitude\":" + String(currentAltitude, 0) + ",";
  json += "\"screen\":" + String((int)currentScreen) + ",";
  json += "\"wifi_rssi\":" + String(WiFi.RSSI());
  json += "}";

  server.send(200, "application/json", json);
}

// ==========================================================================
// ARDUINO SETUP & INITIALIZATION
// ==========================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("\n=========================================="));
  Serial.println(F("  AEROMETRICS PRO - IoT Weather Station  "));
  Serial.println(F("  Karmakar Industry & Rudra Workshop     "));
  Serial.println(F("=========================================="));

  // 1. Initialize I2C Bus & OLED Display
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println(F("[ERROR] SSD1306 OLED init failed at 0x3C!"));
    display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  }

  // 2. Play Boot Animation & Progress Bar
  for (int p = 10; p <= 100; p += 15) {
    drawBootScreen(p);
    delay(150);
  }
  delay(300);

  // 3. Initialize DHT11 & BMP280 Sensors
  dht.begin();
  if (bmp.begin(BMP280_I2C_ADDR)) {
    Serial.println(F("[OK] BMP280 Sensor initialized."));
    bmpAvailable = true;
  }

  // 4. Configure Touch Sensor Input
#if !USE_CAPACITIVE_TOUCH
  pinMode(TOUCH_SENSOR_PIN, INPUT);
#endif

  // 5. Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print(F("[WIFI] Connecting to "));
  Serial.print(WIFI_SSID);

  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 20) {
    delay(300);
    Serial.print(F("."));
    wifiAttempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println(F("\n[WIFI] Connected Successfully!"));
    Serial.print(F("[WIFI] Station IP: "));
    Serial.println(WiFi.localIP());

    // 6. Setup mDNS (esp32-weather.local)
    if (MDNS.begin("esp32-weather")) {
      Serial.println(F("[mDNS] Responder started at http://esp32-weather.local"));
    }

    // 7. Initialize NTP Client
    configTime(NTP_TIMEZONE_OFFSET_SEC, NTP_DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  }

  // 8. Configure Web Server Routes
  server.on("/api/data", HTTP_GET, handleApiData);
  server.begin();

  // Initial sensor read and cloud push
  readSensors();
  pushDataToCloud();

  // Switch to Screen 1
  currentScreen = SCREEN_TIME;
  lastScreenTouchTime = millis();
}

// ==========================================================================
// ARDUINO MAIN LOOP
// ==========================================================================
void loop() {
  server.handleClient();
  handleTouchSensor();

  // 1. Periodic Sensor Readings (Every 2 seconds)
  if (millis() - lastSensorReadTime >= SENSOR_READ_MS) {
    lastSensorReadTime = millis();
    readSensors();
  }

  // 2. Automated Cloud Push (Every 3 seconds)
  if (millis() - lastCloudSyncTime >= CLOUD_SYNC_MS) {
    lastCloudSyncTime = millis();
    pushDataToCloud();
  }

  // 3. Refresh Active OLED Screen
  if (currentScreen == SCREEN_TIME) {
    drawScreen1_TimeDate();
  } else if (currentScreen == SCREEN_WEATHER) {
    drawScreen2_Weather();
  }

  delay(20);
}
