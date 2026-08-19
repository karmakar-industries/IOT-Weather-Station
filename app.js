/**
 * ==========================================================================
 * AEROMETRICS PRO - IoT Weather Station Dashboard
 * Automated Cloud Link: ESP32 -> Cloud Endpoint -> Live Web Dashboard
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- APPLICATION STATE ---
  const state = {
    // Current Sensor Data (Initialized to null/waiting)
    temperature: null,
    humidity: null,
    pressure: null,
    altitude: null,
    lastSeenTimestamp: 0,
    
    // Status
    isOnline: false,

    // Active Chart Tab
    activeChartMetric: 'temperature',
    
    // Telemetry History for Charts (Max 15 points)
    history: {
      timestamps: [],
      temperature: [],
      humidity: [],
      pressure: []
    }
  };

  // Cloud API Endpoint where ESP32 auto-posts sensor JSON
  // Free public JSON cloud bin / Firebase endpoint for instant zero-config sync
  const CLOUD_DATA_URL = 'https://api.jsonbin.io/v3/b/66c4a8a0e41b4d34e424bb92/latest'; 
  // Fallback endpoint for direct/mock sync if cloud is establishing
  const BACKUP_DATA_URL = 'https://iot-weather-station-karmakar-default-rtdb.firebaseio.com/weather.json';

  // ==========================================================================
  // 1. CLOCK & DATE FORMATTER
  // ==========================================================================
  const updateSystemClock = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;

    const options = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', options).toUpperCase();

    const headerClock = document.getElementById('headerClock');
    const headerDate = document.getElementById('headerDate');
    if (headerClock) headerClock.textContent = timeStr;
    if (headerDate) headerDate.textContent = dateStr;
  };

  setInterval(updateSystemClock, 1000);
  updateSystemClock();

  // ==========================================================================
  // 2. TELEMETRY & SENSOR CALCULATIONS ENGINE
  // ==========================================================================
  const updateMetricCards = () => {
    const tempValue = document.getElementById('tempValue');
    const tempFahrenheit = document.getElementById('tempFahrenheit');
    const tempFeels = document.getElementById('tempFeels');
    const tempGauge = document.getElementById('tempGauge');
    const tempMin = document.getElementById('tempMin');
    const tempMax = document.getElementById('tempMax');

    const humidityValue = document.getElementById('humidityValue');
    const humidityGauge = document.getElementById('humidityGauge');
    const dewPoint = document.getElementById('dewPoint');
    const absHumidity = document.getElementById('absHumidity');
    const comfortLevel = document.getElementById('comfortLevel');

    const pressureValue = document.getElementById('pressureValue');
    const pressureGauge = document.getElementById('pressureGauge');
    const pressureMmHg = document.getElementById('pressureMmHg');
    const altitudeValue = document.getElementById('altitudeValue');
    const seaLevelPres = document.getElementById('seaLevelPres');
    const airDensityVal = document.getElementById('airDensityVal');

    if (state.temperature === null) {
      // Waiting / Offline state
      if (tempValue) tempValue.textContent = '--.-';
      if (tempFahrenheit) tempFahrenheit.textContent = '--.-°F';
      if (humidityValue) humidityValue.textContent = '--';
      if (pressureValue) pressureValue.textContent = '----.-';
      if (pressureMmHg) pressureMmHg.textContent = '---.- mmHg';
      if (altitudeValue) altitudeValue.textContent = '-- m';
      return;
    }

    // Temperature Display
    if (tempValue) tempValue.textContent = state.temperature.toFixed(1);
    const fahrenheit = (state.temperature * 9 / 5) + 32;
    if (tempFahrenheit) tempFahrenheit.textContent = `${fahrenheit.toFixed(1)}°F`;

    // Heat Index (Feels like)
    const feelsLike = state.temperature + 0.33 * (state.humidity / 100 * 6.105 * Math.exp(17.27 * state.temperature / (237.7 + state.temperature))) - 4.0;
    if (tempFeels) tempFeels.textContent = `${feelsLike.toFixed(1)}°C`;

    // Min & Max
    if (state.history.temperature.length > 0) {
      const min = Math.min(...state.history.temperature);
      const max = Math.max(...state.history.temperature);
      if (tempMin) tempMin.textContent = `${min.toFixed(1)}°C`;
      if (tempMax) tempMax.textContent = `${max.toFixed(1)}°C`;
    }

    // Temp Gauge (Range: 0°C to 50°C)
    if (tempGauge) {
      const tempPercent = Math.min(Math.max((state.temperature / 50), 0), 1);
      const circumference = 264;
      const offset = circumference - (tempPercent * circumference);
      tempGauge.style.strokeDashoffset = offset;
    }

    // Humidity Display
    if (humidityValue) humidityValue.textContent = Math.round(state.humidity);

    // Humidity Gauge (0% to 100%)
    if (humidityGauge) {
      const humPercent = state.humidity / 100;
      const circumference = 264;
      const offset = circumference - (humPercent * circumference);
      humidityGauge.style.strokeDashoffset = offset;
    }

    // Dew Point Calculation
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * state.temperature) / (b + state.temperature)) + Math.log(state.humidity / 100.0);
    const dp = (b * alpha) / (a - alpha);
    if (dewPoint) dewPoint.textContent = `${dp.toFixed(1)}°C`;

    // Absolute Humidity (g/m3)
    const absHum = (6.112 * Math.exp((17.67 * state.temperature) / (state.temperature + 243.5)) * state.humidity * 2.1674) / (273.15 + state.temperature);
    if (absHumidity) absHumidity.textContent = `${absHum.toFixed(1)} g/m³`;

    // Comfort Level Text
    if (comfortLevel) {
      if (state.humidity < 35) comfortLevel.textContent = 'Dry';
      else if (state.humidity <= 65) comfortLevel.textContent = 'Comfortable';
      else comfortLevel.textContent = 'Humid';
    }

    // Pressure Display (BMP280)
    if (pressureValue) pressureValue.textContent = state.pressure.toFixed(1);

    const mmHg = state.pressure * 0.750062;
    if (pressureMmHg) pressureMmHg.textContent = `${mmHg.toFixed(1)} mmHg`;

    // Hypsometric altitude estimation
    const p0 = 1013.25;
    const alt = 44330.0 * (1.0 - Math.pow(state.pressure / p0, 0.1903));
    state.altitude = Math.round(alt);
    if (altitudeValue) altitudeValue.textContent = `${Math.max(0, state.altitude)} m`;

    if (seaLevelPres) {
      const pSea = state.pressure / Math.pow(1 - (state.altitude / 44330.0), 5.255);
      seaLevelPres.textContent = `${pSea.toFixed(1)} hPa`;
    }

    // Pressure Gauge (950 to 1050 hPa)
    if (pressureGauge) {
      const presPercent = Math.min(Math.max((state.pressure - 950) / 100, 0), 1);
      const circumference = 264;
      const offset = circumference - (presPercent * circumference);
      pressureGauge.style.strokeDashoffset = offset;
    }

    // Air density
    if (airDensityVal) {
      const rho = (state.pressure * 100) / (287.058 * (state.temperature + 273.15));
      airDensityVal.textContent = `${rho.toFixed(3)} kg/m³`;
    }
  };

  // ==========================================================================
  // 3. CHART.JS TELEMETRY VISUALIZATION
  // ==========================================================================
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  
  const tempGradient = ctx.createLinearGradient(0, 0, 0, 240);
  tempGradient.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
  tempGradient.addColorStop(1, 'rgba(244, 63, 94, 0.0)');

  const humGradient = ctx.createLinearGradient(0, 0, 0, 240);
  humGradient.addColorStop(0, 'rgba(0, 242, 254, 0.45)');
  humGradient.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

  const presGradient = ctx.createLinearGradient(0, 0, 0, 240);
  presGradient.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
  presGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  const metricConfigs = {
    temperature: {
      label: 'Temperature (°C)',
      borderColor: '#f43f5e',
      backgroundColor: tempGradient,
      data: state.history.temperature,
      unit: '°C'
    },
    humidity: {
      label: 'Relative Humidity (%)',
      borderColor: '#00f2fe',
      backgroundColor: humGradient,
      data: state.history.humidity,
      unit: '%'
    },
    pressure: {
      label: 'Barometric Pressure (hPa)',
      borderColor: '#10b981',
      backgroundColor: presGradient,
      data: state.history.pressure,
      unit: 'hPa'
    }
  };

  const telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: state.history.timestamps,
      datasets: [{
        label: metricConfigs.temperature.label,
        data: metricConfigs.temperature.data,
        borderColor: metricConfigs.temperature.borderColor,
        backgroundColor: metricConfigs.temperature.backgroundColor,
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: metricConfigs.temperature.borderColor,
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 20, 30, 0.85)',
          titleColor: '#00f2fe',
          bodyColor: '#ffffff',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(context) {
              const currentCfg = metricConfigs[state.activeChartMetric];
              return `${currentCfg.label}: ${context.parsed.y} ${currentCfg.unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { family: 'Outfit', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { family: 'JetBrains Mono', size: 11 } }
        }
      }
    }
  });

  const chartTabs = document.querySelectorAll('.chart-tab');
  chartTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      chartTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const metric = tab.getAttribute('data-metric');
      state.activeChartMetric = metric;

      const cfg = metricConfigs[metric];
      telemetryChart.data.datasets[0].label = cfg.label;
      telemetryChart.data.datasets[0].data = cfg.data;
      telemetryChart.data.datasets[0].borderColor = cfg.borderColor;
      telemetryChart.data.datasets[0].backgroundColor = cfg.backgroundColor;
      telemetryChart.data.datasets[0].pointBorderColor = cfg.borderColor;
      telemetryChart.update();
    });
  });

  const pushTelemetryPoint = () => {
    if (state.temperature === null) return;

    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    state.history.timestamps.push(timeLabel);
    state.history.temperature.push(state.temperature);
    state.history.humidity.push(state.humidity);
    state.history.pressure.push(state.pressure);

    if (state.history.timestamps.length > 15) {
      state.history.timestamps.shift();
      state.history.temperature.shift();
      state.history.humidity.shift();
      state.history.pressure.shift();
    }

    telemetryChart.update();
  };

  // ==========================================================================
  // 4. AUTOMATIC CLOUD & ESP32 AUTO-LINK ENGINE
  // ==========================================================================
  const updateConnectionStatus = (online) => {
    state.isOnline = online;
    const connectionPill = document.getElementById('connectionPill');
    const statusDot = document.getElementById('statusDot');
    const connectionLabel = document.getElementById('connectionLabel');

    if (online) {
      if (connectionLabel) connectionLabel.textContent = 'ESP32 LIVE (ONLINE)';
      if (statusDot) statusDot.className = 'status-dot online';
      if (connectionPill) connectionPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      if (connectionLabel) connectionLabel.textContent = 'WAITING FOR ESP32...';
      if (statusDot) statusDot.className = 'status-dot';
      if (connectionPill) connectionPill.style.borderColor = 'rgba(255, 255, 255, 0.14)';
    }
  };

  const autoLinkEsp32 = async () => {
    let received = false;

    // 1. Try fetching from Cloud Endpoint
    try {
      const response = await fetch(BACKUP_DATA_URL, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const data = await response.json();
        if (data && (data.temp !== undefined || data.temperature !== undefined)) {
          state.temperature = data.temp !== undefined ? data.temp : data.temperature;
          state.humidity = data.humidity !== undefined ? data.humidity : data.humi;
          state.pressure = data.pressure !== undefined ? data.pressure : data.pres;
          state.lastSeenTimestamp = Date.now();
          received = true;
        }
      }
    } catch (e) {
      // Cloud fallback check
    }

    // 2. If not found via Cloud, try local mDNS / LAN auto-discovery
    if (!received) {
      try {
        const localRes = await fetch('http://esp32-weather.local/api/data', { signal: AbortSignal.timeout(1500) });
        if (localRes.ok) {
          const data = await localRes.json();
          if (data && data.temp !== undefined) {
            state.temperature = data.temp;
            state.humidity = data.humidity;
            state.pressure = data.pressure;
            state.lastSeenTimestamp = Date.now();
            received = true;
          }
        }
      } catch (e) {
        // Silent
      }
    }

    // Evaluate connection freshness (within last 15 seconds)
    const isFresh = received || (Date.now() - state.lastSeenTimestamp < 15000 && state.lastSeenTimestamp > 0);
    updateConnectionStatus(isFresh);

    if (isFresh) {
      updateMetricCards();
    }
  };

  // Auto-link polling loop every 2 seconds
  setInterval(autoLinkEsp32, 2000);
  setInterval(pushTelemetryPoint, 8000);
  autoLinkEsp32();

  // ==========================================================================
  // 5. ATMOSPHERIC PARTICLES (MIST & SUNBEAMS)
  // ==========================================================================
  const initParticles = () => {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    const pCtx = canvas.getContext('2d');

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const particles = [];
    const particleCount = 45;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.35 + 0.15,
        vy: (Math.random() - 0.5) * 0.25 - 0.1,
        opacity: Math.random() * 0.5 + 0.2,
        pulsing: Math.random() * 0.02
      });
    }

    const animateParticles = () => {
      pCtx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.opacity += p.pulsing;

        if (p.opacity > 0.7 || p.opacity < 0.15) {
          p.pulsing = -p.pulsing;
        }

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        pCtx.fillStyle = `rgba(165, 243, 252, ${p.opacity})`;
        pCtx.shadowBlur = 8;
        pCtx.shadowColor = 'rgba(0, 242, 254, 0.8)';
        pCtx.fill();
      });

      requestAnimationFrame(animateParticles);
    };

    animateParticles();
  };

  initParticles();

});
