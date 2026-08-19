# AeroMetrics Pro - Professional IoT Weather Station & OLED HUD

![AeroMetrics Pro Banner](https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1200&q=80)

An ultra-modern, production-ready IoT Weather Station ecosystem engineered with an **ESP32 microcontroller**, **DHT11**, **BMP280**, **SSD1306 OLED HUD**, **Touch Sensor interaction**, and a **Glassmorphic Nature Video Web Dashboard**.

---

## 🌟 Key Features

- 🖥️ **Dual-Screen OLED HUD**:
  - **Bootloader Animation**: Progress bar (`0% -> 100%`) with *"KARMAKAR INDUSTRY"* branding.
  - **Screen 1 (Time & Date)**: NTP-synchronized digital clock, calendar, and Wi-Fi signal icon.
  - **Screen 2 (Weather Metrics)**: Real-time Ambient Temperature (°C), Relative Humidity (%), and Barometric Pressure (hPa).
  - **Touch Switching & 10s Inactivity Timer**: Single touch toggles between screens; automatically reverts from Screen 2 back to Screen 1 after 10 seconds of no touch.
- 💎 **Glassmorphism Web Dashboard**:
  - Frosted glass textures (`backdrop-filter: blur(24px)`), ambient glow layers, and specular highlights.
  - High-definition ambient nature video background with mist/sunbeam particle engine.
  - Ambient forest river audio player with toggle button.
  - **Interactive Hardware Digital Twin**: Live OLED simulation in browser with clickable touch sensor.
  - Real-time **Chart.js Telemetry Graph** for Temperature, Humidity, and Pressure trends.
  - AI Environmental Comfort Index (Dew Point, Mold Risk, Absolute Humidity, Air Density).
  - ESP32 Hardware Link: Connects directly via Wi-Fi REST API `/api/data` or runs in standalone simulator mode.
- 🌍 **"Any Device Through Link" / GitHub Pages**:
  - Host the `web/` folder on GitHub Pages to access the dashboard on any smartphone, tablet, laptop, or desktop across the globe.

---

## 📂 Project Structure

```
d:/RUDRA WORKSHOP/IOT weather station/
├── CIRCUIT_DIAGRAM.md         # Complete pin connection guide & circuit schematic
├── README.md                  # Project overview & quickstart guide
├── firmware/
│   ├── IoT_Weather_Station.ino# ESP32 Arduino C++ firmware
│   └── config.h               # Wi-Fi credentials, NTP timezone, pinouts
└── web/
    ├── index.html             # Glassmorphism web dashboard HTML5
    ├── style.css              # Glassmorphic stylesheet & OLED phosphorus theme
    └── app.js                 # OLED digital twin, physics engine, Chart.js, REST client
```

---

## ⚡ Quick Start: Hardware Setup

### 1. Circuit Connections
Refer to [CIRCUIT_DIAGRAM.md](file:///d:/RUDRA%20WORKSHOP/IOT%20weather%20station/CIRCUIT_DIAGRAM.md) for full pin details:
- **OLED Display (SSD1306)**: `SDA` -> `GPIO 21`, `SCL` -> `GPIO 22`, `VCC` -> `3.3V`, `GND` -> `GND`
- **BMP280 Sensor**: `SDA` -> `GPIO 21`, `SCL` -> `GPIO 22`, `VCC` -> `3.3V`, `GND` -> `GND`
- **DHT11 Sensor**: `DATA` -> `GPIO 14`, `VCC` -> `3.3V`, `GND` -> `GND`
- **Touch Sensor (TTP223)**: `OUT` -> `GPIO 4`, `VCC` -> `3.3V`, `GND` -> `GND`

### 2. Arduino IDE Setup & Libraries
Install the following libraries via Arduino Library Manager (`Ctrl + Shift + I`):
1. `Adafruit SSD1306` (by Adafruit)
2. `Adafruit GFX Library` (by Adafruit)
3. `DHT sensor library` (by Adafruit)
4. `Adafruit BMP280 Library` (by Adafruit)

### 3. Flash the Firmware
1. Open [firmware/config.h](file:///d:/RUDRA%20WORKSHOP/IOT%20weather%20station/firmware/config.h) and enter your Wi-Fi credentials:
   ```cpp
   #define WIFI_SSID     "Your_WiFi_Name"
   #define WIFI_PASSWORD "Your_WiFi_Password"
   ```
2. Select your ESP32 board (e.g. `DOIT ESP32 DEVKIT V1` or `ESP32 Dev Module`).
3. Click **Upload** (`Ctrl + U`).
4. Open the Serial Monitor at `115200 baud` to note the ESP32 IP address.

---

## 🌐 Quick Start: Web Dashboard

1. Simply open [web/index.html](file:///d:/RUDRA%20WORKSHOP/IOT%20weather%20station/web/index.html) in any modern web browser (Chrome, Edge, Safari, Firefox).
2. Click the **"ESP32 Link"** button in the top right corner.
3. Select **"ESP32 REST API"** and enter your ESP32's IP address (e.g. `192.168.1.150`).
4. Click **"Save & Connect"** to stream live telemetry straight from your physical hardware!

---

## 🚀 Deploy to GitHub Pages ("Any Device Through Link")

1. Create a GitHub repository (e.g., `iot-weather-station`).
2. Push this project to GitHub.
3. Go to **Settings > Pages** in your GitHub repository.
4. Set Source to **Deploy from a branch**, select `main` (or `master`) and directory `/web` or `/root`.
5. Your dashboard is now live on the internet (e.g. `https://yourusername.github.io/iot-weather-station/web/`)!

---

© 2026 Karmakar Industry & Rudra Workshop. All Rights Reserved.
