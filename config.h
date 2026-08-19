/**
 * ==========================================================================
 * AEROMETRICS PRO - IoT Weather Station Configuration
 * Karmakar Industry & Rudra Workshop
 * ==========================================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

// --- Wi-Fi Credentials ---
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// --- NTP Timezone Settings ---
// Default: UTC+5:30 (India Standard Time = 19800 seconds)
// Change to your local offset in seconds: e.g., UTC-5 (EST) = -18000
#define NTP_TIMEZONE_OFFSET_SEC 19800
#define NTP_DAYLIGHT_OFFSET_SEC 0
#define NTP_SERVER              "pool.ntp.org"

// --- Hardware Pin Definitions ---
// OLED Display (I2C)
#define OLED_SDA_PIN    21
#define OLED_SCL_PIN    22
#define OLED_RESET_PIN  -1     // -1 if sharing Arduino reset pin
#define OLED_I2C_ADDR   0x3C   // Default I2C address for SSD1306 128x64

// DHT11 Sensor
#define DHT_PIN         14     // GPIO 14 (Digital Input)
#define DHT_TYPE        DHT11  // DHT 11 sensor model

// BMP280 Sensor (I2C)
#define BMP280_I2C_ADDR 0x76   // Standard 0x76 (or 0x77 on some clone modules)

// Touch Sensor Module (TTP223 or ESP32 Capacitive Pin)
#define TOUCH_SENSOR_PIN   4   // GPIO 4 (Digital In from TTP223 or Capacitive Touch T0)
#define USE_CAPACITIVE_TOUCH false // Set to true if using raw wire on ESP32 Touch Pin without TTP223 module
#define TOUCH_THRESHOLD    40  // Threshold for touchRead() if USE_CAPACITIVE_TOUCH is true

// Timing Constants
#define SCREEN_TIMEOUT_MS  10000 // 10 seconds auto-revert to Time Screen
#define SENSOR_READ_MS     2000  // Read sensor telemetry every 2 seconds
#define NTP_UPDATE_MS      60000 // Refresh NTP time every 60 seconds

#endif // CONFIG_H
