/**
 * ==========================================================================
 * AEROMETRICS PRO - IoT Weather Station & OLED HUD Firmware
 * Platform: ESP32 (Arduino Framework)
 * Features:
 *   - DHT11 (Temperature & Humidity)
 *   - BMP280 (Barometric Pressure & Temperature / Altitude)
 *   - SSD1306 OLED (128x64 I2C HUD)
 *   - Boot Animation ("KARMAKAR INDUSTRY" & Progress Bar)
 *   - Touch Sensor Switching (Screen 1: Time/Date <-> Screen 2: Weather HUD)
 *   - 10-Second Inactivity Auto-revert to Time Screen
 *   - NTP Time Synchronization over Wi-Fi
 *   - Web Server REST API Endpoint (/api/data) with CORS support
 *
 * Developed for: Rudra Workshop / Karmakar Industry
 * ==========================================================================
 */

#include <Wire.h>
#include <WiFi.h>
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

// 8x8 Thermometer Glyph
const unsigned char epd_bitmap_temp[] PROGMEM = {
  0b00011000,
  0b00100100,
  0b00100100,
  0b00100100,
  0b01000010,
  0b01000010,
  0b00111100,
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

    // Blend BMP280 precision temperature if DHT11 fails
    if (isnan(t)) {
      currentTemperature = bmpTemp;
    }
  } else {
    // Default standard atmospheric pressure if BMP280 missing
    currentPressure = 1013.25;
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
  // Standard TTP223 Digital Touch Sensor module (Active HIGH)
  return (digitalRead(TOUCH_SENSOR_PIN) == HIGH);
#endif
}

void handleTouchSensor() {
  bool currentTouch = readTouchInput();

  // Detect Rising Edge (User tapped the touch sensor)
  if (currentTouch && !lastTouchState) {
    lastScreenTouchTime = millis();

    // Toggle Screen between 1 and 2
    if (currentScreen == SCREEN_TIME) {
      currentScreen = SCREEN_WEATHER;
      Serial.println(F("[TOUCH] Switched to Screen 2: Weather HUD"));
    } else {
      currentScreen = SCREEN_TIME;
      Serial.println(F("[TOUCH] Switched to Screen 1: Time HUD"));
    }
    
    // Hardware debounce
    delay(50);
  }

  lastTouchState = currentTouch;

  // Inactivity Auto-revert Check:
  // If in SCREEN_WEATHER and 10 seconds elapse with no touch -> Revert to SCREEN_TIME
  if (currentScreen == SCREEN_WEATHER) {
    if (millis() - lastScreenTouchTime >= SCREEN_TIMEOUT_MS) {
      currentScreen = SCREEN_TIME;
      Serial.println(F("[TIMEOUT] 10s elapsed with no touch. Auto-reverted to Screen 1 (Time/Date)"));
    }
  }
}

// ==========================================================================
// REST API & WEB SERVER HANDLERS
// ==========================================================================
void handleApiData() {
  // Add CORS headers so Web dashboard on any origin can fetch telemetry
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");

  // Build JSON Payload
  String json = "{";
  json += "\"temp\":" + String(currentTemperature, 1) + ",";
  json += "\"humidity\":" + String(currentHumidity, 0) + ",";
  json += "\"pressure\":" + String(currentPressure, 1) + ",";
  json += "\"altitude\":" + String(currentAltitude, 0) + ",";
  json += "\"screen\":" + String((int)currentScreen) + ",";
  json += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"uptime_sec\":" + String(millis() / 1000);
  json += "}";

  server.send(200, "application/json", json);
}

void handleRoot() {
  String html = F("<!DOCTYPE html><html><head><title>AeroMetrics Pro ESP32 Node</title>"
                  "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                  "<style>body{background:#0a121a;color:#fff;font-family:sans-serif;text-align:center;padding:2rem;}"
                  ".card{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:1.5rem;max-width:400px;margin:0 auto;}"
                  "h1{color:#00f2fe;font-size:1.5rem;}p{font-size:1.2rem;}</style></head>"
                  "<body><div class='card'><h1>AEROMETRICS PRO</h1>"
                  "<p>Karmakar Industry Node</p>"
                  "<p>Temp: <b>");
  html += String(currentTemperature, 1) + " &deg;C</b></p>";
  html += "<p>Humidity: <b>" + String((int)currentHumidity) + " %</b></p>";
  html += "<p>Pressure: <b>" + String(currentPressure, 1) + " hPa</b></p>";
  html += "<p><small>JSON API Endpoint: <a href='/api/data' style='color:#00f2fe'>/api/data</a></small></p>";
  html += "</div></body></html>";

  server.send(200, "text/html", html);
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
    Serial.println(F("[ERROR] SSD1306 OLED initialization failed at 0x3C!"));
    // Try alternate address 0x3D
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
      Serial.println(F("[FATAL] SSD1306 display not detected on I2C bus!"));
    }
  }

  // 2. Play Boot Animation & Progress Bar
  for (int p = 10; p <= 100; p += 15) {
    drawBootScreen(p);
    delay(150);
  }
  delay(400);

  // 3. Initialize DHT11 & BMP280 Sensors
  dht.begin();
  if (bmp.begin(BMP280_I2C_ADDR)) {
    Serial.println(F("[OK] BMP280 Barometric Pressure Sensor initialized."));
    bmpAvailable = true;
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                     Adafruit_BMP280::SAMPLING_X2,
                     Adafruit_BMP280::SAMPLING_X16,
                     Adafruit_BMP280::FILTER_X16,
                     Adafruit_BMP280::STANDBY_MS_500);
  } else {
    Serial.println(F("[WARN] BMP280 sensor not found at 0x76. Checking fallback..."));
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
    Serial.print(F("[WIFI] Station IP Address: "));
    Serial.println(WiFi.localIP());

    // 6. Initialize NTP Client
    configTime(NTP_TIMEZONE_OFFSET_SEC, NTP_DAYLIGHT_OFFSET_SEC, NTP_SERVER);
    Serial.println(F("[NTP] Configured time sync server pool.ntp.org"));
  } else {
    Serial.println(F("\n[WIFI] Could not connect. Running in standalone offline mode."));
  }

  // 7. Configure Web Server Routes
  server.on("/api/data", HTTP_GET, handleApiData);
  server.on("/", HTTP_GET, handleRoot);
  server.begin();
  Serial.println(F("[HTTP] REST API Server started on port 80"));

  // Initial sensor read
  readSensors();

  // Switch to Screen 1
  currentScreen = SCREEN_TIME;
  lastScreenTouchTime = millis();
}

// ==========================================================================
// ARDUINO MAIN LOOP
// ==========================================================================
void loop() {
  // 1. Handle incoming HTTP requests
  server.handleClient();

  // 2. Process Touch Sensor Inputs & 10s auto-revert timer
  handleTouchSensor();

  // 3. Periodic Sensor Readings
  if (millis() - lastSensorReadTime >= SENSOR_READ_MS) {
    lastSensorReadTime = millis();
    readSensors();
  }

  // 4. Refresh Active OLED Screen
  if (currentScreen == SCREEN_TIME) {
    drawScreen1_TimeDate();
  } else if (currentScreen == SCREEN_WEATHER) {
    drawScreen2_Weather();
  }

  delay(20);
}
