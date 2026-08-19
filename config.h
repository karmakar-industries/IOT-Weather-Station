/**
 * ==========================================================================
 * AEROMETRICS PRO - IoT Weather Station Configuration
 * Direct Pipeline: ESP32 ---> GitHub (data.json) ---> Phone / Browser
 * Karmakar Industry & Rudra Workshop
 * ==========================================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

// --- Wi-Fi Credentials ---
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// --- GitHub Direct Cloud Sync Settings ---
#define GITHUB_OWNER     "karmakar-industries"
#define GITHUB_REPO      "IOT-Weather-Station"
#define GITHUB_FILE_PATH "data.json"
#define GITHUB_PAT_TOKEN "YOUR_GITHUB_TOKEN"

// --- NTP Timezone Settings ---
#define NTP_TIMEZONE_OFFSET_SEC 19800 // UTC+5:30 (IST)
#define NTP_DAYLIGHT_OFFSET_SEC 0
#define NTP_SERVER              "pool.ntp.org"

// --- Hardware Pin Definitions ---
#define OLED_SDA_PIN    21
#define OLED_SCL_PIN    22
#define OLED_RESET_PIN  -1
#define OLED_I2C_ADDR   0x3C

#define DHT_PIN         14
#define DHT_TYPE        DHT11

#define BMP280_I2C_ADDR 0x76

#define TOUCH_SENSOR_PIN   4
#define USE_CAPACITIVE_TOUCH false
#define TOUCH_THRESHOLD    40

#define SCREEN_TIMEOUT_MS  10000
#define SENSOR_READ_MS     2000
#define GITHUB_SYNC_MS     10000

#endif // CONFIG_H
