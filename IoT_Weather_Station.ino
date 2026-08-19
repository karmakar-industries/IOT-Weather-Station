
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


#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET_PIN);
DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BMP280 bmp;
WebServer server(80);


enum DisplayScreen {
  SCREEN_BOOT = 0,
  SCREEN_TIME = 1,    
  SCREEN_WEATHER = 2  
};

DisplayScreen currentScreen = SCREEN_BOOT;


float currentTemperature = 0.0;
float currentHumidity = 0.0;
float currentPressure = 0.0;
float currentAltitude = 0.0;

unsigned long lastSensorReadTime = 0;
unsigned long lastGithubSyncTime = 0;
unsigned long lastScreenTouchTime = 0;
bool lastTouchState = false;
bool bmpAvailable = false;
bool oledAvailable = false;
bool wifiConnected = false;
uint8_t oledAddress = 0x3C;
String currentFileSha = "";

struct tm timeinfo;

const unsigned char epd_bitmap_wifi[] PROGMEM = {
  0b00111100, 0b01000010, 0b10011001, 0b00100100,
  0b01000010, 0b00011000, 0b00011000, 0b00000000
};

const char base64_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

String base64Encode(const String &input) {
  String output = "";
  int i = 0;
  int j = 0;
  unsigned char char_array_3[3];
  unsigned char char_array_4[4];
  int in_len = input.length();
  int pos = 0;

  while (in_len--) {
    char_array_3[i++] = input[pos++];
    if (i == 3) {
      char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
      char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
      char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
      char_array_4[3] = char_array_3[2] & 0x3f;

      for (i = 0; i < 4; i++) output += base64_chars[char_array_4[i]];
      i = 0;
    }
  }

  if (i) {
    for (j = i; j < 3; j++) char_array_3[j] = '\0';
    char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
    char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
    char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
    char_array_4[3] = char_array_3[2] & 0x3f;

    for (j = 0; (j < i + 1); j++) output += base64_chars[char_array_4[j]];
    while ((i++ < 3)) output += '=';
  }

  return output;
}

void scanAndInitI2C() {
  Serial.println(F("\n[I2C] Scanning I2C Bus on SDA(21), SCL(22)..."));
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  Wire.setClock(100000);

  byte count = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.printf("[I2C] Device found at address 0x%02X\n", addr);
      count++;

      if (addr == 0x3C || addr == 0x3D) {
        oledAddress = addr;
      }
      if (addr == 0x76 || addr == 0x77) {
        if (bmp.begin(addr)) {
          bmpAvailable = true;
          Serial.printf("[BMP280] Sensor initialized successfully at 0x%02X\n", addr);
        }
      }
    }
  }

  if (count == 0) {
    Serial.println(F("[ERROR] No I2C devices found! Check wiring."));
  }

  Serial.printf("[OLED] Initializing SSD1306 0.96\" OLED at 0x%02X...\n", oledAddress);
  if (display.begin(SSD1306_SWITCHCAPVCC, oledAddress)) {
    oledAvailable = true;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.dim(false);
    Serial.println(F("[OLED] Display initialized successfully!"));
  } else {
    uint8_t altAddr = (oledAddress == 0x3C) ? 0x3D : 0x3C;
    if (display.begin(SSD1306_SWITCHCAPVCC, altAddr)) {
      oledAvailable = true;
      display.clearDisplay();
      display.setTextColor(SSD1306_WHITE);
      Serial.println(F("[OLED] Display initialized at alternate address!"));
    }
  }
}

void drawBootScreen(int progressPercent) {
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(12, 4);
  display.print(F("KARMAKAR INDUSTRY"));
  display.drawFastHLine(0, 15, SCREEN_WIDTH, SSD1306_WHITE);

  display.setCursor(34, 23);
  display.print(F("LOADING..."));

  display.drawRect(14, 36, 100, 12, SSD1306_WHITE);
  int fillWReal = 96 * progressPercent / 100;
  if (fillWReal > 0) {
    display.fillRect(16, 38, fillWReal, 8, SSD1306_WHITE);
  }

  display.setCursor(52, 52);
  display.print(progressPercent);
  display.print(F("%"));

  display.display();
}

void drawScreen1_TimeDate() {
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (wifiConnected) {
    display.drawBitmap(2, 2, epd_bitmap_wifi, 8, 8, SSD1306_WHITE);
  }
  display.setTextSize(1);
  display.setCursor(38, 2);
  display.print(F("AERO-HUD"));
  display.drawFastHLine(0, 12, SCREEN_WIDTH, SSD1306_WHITE);

  char timeString[10];
  if (getLocalTime(&timeinfo)) {
    strftime(timeString, sizeof(timeString), "%H:%M:%S", &timeinfo);
  } else {
    snprintf(timeString, sizeof(timeString), "12:00:00");
  }

  display.setTextSize(2);
  display.setCursor(16, 20);
  display.print(timeString);

  char dateString[20];
  if (getLocalTime(&timeinfo)) {
    strftime(dateString, sizeof(dateString), "%a, %d %b %Y", &timeinfo);
  } else {
    snprintf(dateString, sizeof(dateString), "WAITING NTP");
  }

  display.setTextSize(1);
  display.setCursor(18, 42);
  display.print(dateString);

  display.setCursor(14, 55);
  display.print(F("[ TOUCH SENSOR ]"));

  display.display();
}

void drawScreen2_Weather() {
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (wifiConnected) {
    display.drawBitmap(2, 2, epd_bitmap_wifi, 8, 8, SSD1306_WHITE);
  }
  display.setTextSize(1);
  display.setCursor(28, 2);
  display.print(F("WEATHER HUD"));

  unsigned long elapsed = millis() - lastScreenTouchTime;
  int remainingSec = (SCREEN_TIMEOUT_MS - elapsed) / 1000;
  if (remainingSec < 0) remainingSec = 0;

  display.setCursor(105, 2);
  display.print(remainingSec);
  display.print(F("s"));
  display.drawFastHLine(0, 12, SCREEN_WIDTH, SSD1306_WHITE);

  display.setCursor(4, 18);
  display.print(F("TEMP: "));
  display.print(currentTemperature, 1);
  display.print(F(" C"));

  display.setCursor(4, 32);
  display.print(F("HUMI: "));
  display.print((int)currentHumidity);
  display.print(F(" %"));

  display.setCursor(4, 46);
  display.print(F("PRES: "));
  display.print(currentPressure, 1);
  display.print(F(" hPa"));

  display.drawFastHLine(0, 60, SCREEN_WIDTH, SSD1306_WHITE);
  display.display();
}

void readSensors() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (!isnan(t) && !isnan(h)) {
    currentHumidity = h;
    currentTemperature = t;
  }

  if (bmpAvailable) {
    float p = bmp.readPressure() / 100.0F;
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

void fetchGithubFileSha() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String apiUrl = "https://api.github.com/repos/" + String(GITHUB_OWNER) + "/" + String(GITHUB_REPO) + "/contents/" + String(GITHUB_FILE_PATH);

  if (https.begin(client, apiUrl)) {
    https.addHeader("User-Agent", "ESP32-Weather-Station");
    https.addHeader("Accept", "application/vnd.github.v3+json");
    if (String(GITHUB_PAT_TOKEN) != "YOUR_GITHUB_TOKEN") {
      https.addHeader("Authorization", "token " + String(GITHUB_PAT_TOKEN));
    }

    int code = https.GET();
    if (code == 200) {
      String response = https.getString();
      int shaIndex = response.indexOf("\"sha\":\"");
      if (shaIndex != -1) {
        currentFileSha = response.substring(shaIndex + 7, shaIndex + 47);
        Serial.printf("[GITHUB] Found data.json SHA: %s\n", currentFileSha.c_str());
      }
    }
    https.end();
  }
}

void pushDataToGithub() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (String(GITHUB_PAT_TOKEN) == "YOUR_GITHUB_TOKEN") {
    Serial.println(F("[GITHUB] Note: Please add your GITHUB_PAT_TOKEN in config.h to push to GitHub!"));
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String apiUrl = "https://api.github.com/repos/" + String(GITHUB_OWNER) + "/" + String(GITHUB_REPO) + "/contents/" + String(GITHUB_FILE_PATH);

  if (currentFileSha == "") {
    fetchGithubFileSha();
  }

  if (https.begin(client, apiUrl)) {
    https.addHeader("User-Agent", "ESP32-Weather-Station");
    https.addHeader("Accept", "application/vnd.github.v3+json");
    https.addHeader("Authorization", "token " + String(GITHUB_PAT_TOKEN));
    https.addHeader("Content-Type", "application/json");

    String rawJson = "{\n";
    rawJson += "  \"temp\": " + String(currentTemperature, 1) + ",\n";
    rawJson += "  \"humidity\": " + String(currentHumidity, 0) + ",\n";
    rawJson += "  \"pressure\": " + String(currentPressure, 1) + ",\n";
    rawJson += "  \"altitude\": " + String(currentAltitude, 0) + ",\n";
    rawJson += "  \"timestamp\": " + String(millis() / 1000) + "\n";
    rawJson += "}";

    String base64Content = base64Encode(rawJson);

    String requestBody = "{\n";
    requestBody += "  \"message\": \"ESP32 Live Telemetry Update\",\n";
    requestBody += "  \"content\": \"" + base64Content + "\"";
    if (currentFileSha.length() == 40) {
      requestBody += ",\n  \"sha\": \"" + currentFileSha + "\"\n";
    } else {
      requestBody += "\n";
    }
    requestBody += "}";

    int httpCode = https.PUT(requestBody);
    if (httpCode == 200 || httpCode == 201) {
      String res = https.getString();
      int newShaIndex = res.indexOf("\"sha\":\"");
      if (newShaIndex != -1) {
        currentFileSha = res.substring(newShaIndex + 7, newShaIndex + 47);
      }
      Serial.println(F("[GITHUB] Pushed live weather data directly to GitHub repo!"));
    } else {
      Serial.printf("[GITHUB] Push status: HTTP %d\n", httpCode);
      if (httpCode == 409) {
        currentFileSha = "";
      }
    }
    https.end();
  }
}

bool readTouchInput() {
#if USE_CAPACITIVE_TOUCH
  return (touchRead(TOUCH_SENSOR_PIN) < TOUCH_THRESHOLD);
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

  if (currentScreen == SCREEN_WEATHER) {
    if (millis() - lastScreenTouchTime >= SCREEN_TIMEOUT_MS) {
      currentScreen = SCREEN_TIME;
    }
  }
}

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

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println(F("\n=========================================="));
  Serial.println(F("  AEROMETRICS PRO - IoT Weather Station  "));
  Serial.println(F("  Karmakar Industry & Rudra Workshop     "));
  Serial.println(F("=========================================="));

  scanAndInitI2C();

  if (oledAvailable) {
    for (int p = 10; p <= 100; p += 15) {
      drawBootScreen(p);
      delay(100);
    }
    delay(200);
  }

  dht.begin();
  Serial.println(F("[DHT11] Sensor initialized."));

#if !USE_CAPACITIVE_TOUCH
  pinMode(TOUCH_SENSOR_PIN, INPUT);
#endif

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print(F("[WIFI] Connecting to Wi-Fi"));

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

    if (MDNS.begin("esp32-weather")) {
      Serial.println(F("[mDNS] Responder started at http://esp32-weather.local"));
    }

    configTime(NTP_TIMEZONE_OFFSET_SEC, NTP_DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  }

  server.on("/api/data", HTTP_GET, handleApiData);
  server.begin();
  Serial.println(F("[HTTP] Local REST API started at /api/data"));

  readSensors();
  pushDataToGithub();

  currentScreen = SCREEN_TIME;
  lastScreenTouchTime = millis();
}

void loop() {
  if (wifiConnected) {
    server.handleClient();
  }

  handleTouchSensor();

  if (millis() - lastSensorReadTime >= SENSOR_READ_MS) {
    lastSensorReadTime = millis();
    readSensors();
  }

  if (millis() - lastGithubSyncTime >= GITHUB_SYNC_MS) {
    lastGithubSyncTime = millis();
    pushDataToGithub();
  }
  
  if (currentScreen == SCREEN_TIME) {
    drawScreen1_TimeDate();
  } else if (currentScreen == SCREEN_WEATHER) {
    drawScreen2_Weather();
  }

  delay(20);
}
