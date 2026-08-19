/**
 * ==========================================================================
 * AEROMETRICS PRO - IoT Weather Station Dashboard
 * Architecture: ESP32 ---> GitHub (data.json) ---> Phone / Browser
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {

  const state = {
    temperature: null,
    humidity: null,
    pressure: null,
    altitude: null,
    lastSeenTimestamp: 0,
    isOnline: false,
    activeChartMetric: 'temperature',
    
    // Direct GitHub Data Endpoints (Same-Origin & Raw Fallback)
    dataEndpoints: [
      `./data.json?t=${Date.now()}`,
      `https://raw.githubusercontent.com/karmakar-industries/IOT-Weather-Station/main/data.json?t=${Date.now()}`
    ],
    
    history: {
      timestamps: [],
      temperature: [],
      humidity: [],
      pressure: []
    }
  };

  // ==========================================================================
  // 1. SYSTEM CLOCK & CALENDAR
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
  // 2. SENSOR METRICS & GAUGES
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
      if (tempValue) tempValue.textContent = '--.-';
      if (tempFahrenheit) tempFahrenheit.textContent = '--.-°F';
      if (humidityValue) humidityValue.textContent = '--';
      if (pressureValue) pressureValue.textContent = '----.-';
      if (pressureMmHg) pressureMmHg.textContent = '---.- mmHg';
      if (altitudeValue) altitudeValue.textContent = '-- m';
      return;
    }

    // Temperature
    if (tempValue) tempValue.textContent = state.temperature.toFixed(1);
    const fahrenheit = (state.temperature * 9 / 5) + 32;
    if (tempFahrenheit) tempFahrenheit.textContent = `${fahrenheit.toFixed(1)}°F`;

    // Feels like
    const feelsLike = state.temperature + 0.33 * (state.humidity / 100 * 6.105 * Math.exp(17.27 * state.temperature / (237.7 + state.temperature))) - 4.0;
    if (tempFeels) tempFeels.textContent = `${feelsLike.toFixed(1)}°C`;

    // Min/Max
    if (state.history.temperature.length > 0) {
      const min = Math.min(...state.history.temperature);
      const max = Math.max(...state.history.temperature);
      if (tempMin) tempMin.textContent = `${min.toFixed(1)}°C`;
      if (tempMax) tempMax.textContent = `${max.toFixed(1)}°C`;
    }

    if (tempGauge) {
      const tempPercent = Math.min(Math.max((state.temperature / 50), 0), 1);
      tempGauge.style.strokeDashoffset = 264 - (tempPercent * 264);
    }

    // Humidity
    if (humidityValue) humidityValue.textContent = Math.round(state.humidity);

    if (humidityGauge) {
      const humPercent = state.humidity / 100;
      humidityGauge.style.strokeDashoffset = 264 - (humPercent * 264);
    }

    // Dew point
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * state.temperature) / (b + state.temperature)) + Math.log(state.humidity / 100.0);
    const dp = (b * alpha) / (a - alpha);
    if (dewPoint) dewPoint.textContent = `${dp.toFixed(1)}°C`;

    // Absolute humidity
    const absHum = (6.112 * Math.exp((17.67 * state.temperature) / (state.temperature + 243.5)) * state.humidity * 2.1674) / (273.15 + state.temperature);
    if (absHumidity) absHumidity.textContent = `${absHum.toFixed(1)} g/m³`;

    if (comfortLevel) {
      if (state.humidity < 35) comfortLevel.textContent = 'Dry';
      else if (state.humidity <= 65) comfortLevel.textContent = 'Comfortable';
      else comfortLevel.textContent = 'Humid';
    }

    // Pressure & Altitude
    if (pressureValue) pressureValue.textContent = state.pressure.toFixed(1);

    const mmHg = state.pressure * 0.750062;
    if (pressureMmHg) pressureMmHg.textContent = `${mmHg.toFixed(1)} mmHg`;

    const p0 = 1013.25;
    const alt = 44330.0 * (1.0 - Math.pow(state.pressure / p0, 0.1903));
    state.altitude = Math.round(alt);
    if (altitudeValue) altitudeValue.textContent = `${Math.max(0, state.altitude)} m`;

    if (seaLevelPres) {
      const pSea = state.pressure / Math.pow(1 - (state.altitude / 44330.0), 5.255);
      seaLevelPres.textContent = `${pSea.toFixed(1)} hPa`;
    }

    if (pressureGauge) {
      const presPercent = Math.min(Math.max((state.pressure - 950) / 100, 0), 1);
      pressureGauge.style.strokeDashoffset = 264 - (presPercent * 264);
    }

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
  // 4. DIRECT GITHUB DATA SYNC ENGINE (data.json)
  // ==========================================================================
  const updateConnectionStatus = (online) => {
    state.isOnline = online;
    const connectionPill = document.getElementById('connectionPill');
    const statusDot = document.getElementById('statusDot');
    const connectionLabel = document.getElementById('connectionLabel');

    if (online) {
      if (connectionLabel) connectionLabel.textContent = 'ESP32 LIVE (GITHUB SYNC)';
      if (statusDot) statusDot.className = 'status-dot online';
      if (connectionPill) connectionPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      if (connectionLabel) connectionLabel.textContent = 'CONNECTING TO GITHUB...';
      if (statusDot) statusDot.className = 'status-dot';
      if (connectionPill) connectionPill.style.borderColor = 'rgba(255, 255, 255, 0.14)';
    }
  };

  const fetchGithubData = async () => {
    let payload = null;

    // Try same-origin ./data.json first
    try {
      const res = await fetch(`./data.json?cache_bust=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        payload = await res.json();
      }
    } catch (e) {
      // Fallback to raw github
    }

    if (!payload) {
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/karmakar-industries/IOT-Weather-Station/main/data.json?cache_bust=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        if (rawRes.ok) {
          payload = await rawRes.json();
        }
      } catch (e) {
        // Offline
      }
    }

    if (payload && (payload.temp !== undefined || payload.temperature !== undefined)) {
      state.temperature = payload.temp !== undefined ? payload.temp : payload.temperature;
      state.humidity = payload.humidity !== undefined ? payload.humidity : payload.humi;
      state.pressure = payload.pressure !== undefined ? payload.pressure : payload.pres;
      state.lastSeenTimestamp = Date.now();

      updateConnectionStatus(true);
      updateMetricCards();
    } else {
      const isFresh = (Date.now() - state.lastSeenTimestamp < 15000 && state.lastSeenTimestamp > 0);
      updateConnectionStatus(isFresh);
    }
  };

  // Poll data.json every 2.5 seconds
  setInterval(fetchGithubData, 2500);
  setInterval(pushTelemetryPoint, 8000);
  fetchGithubData();

  // ==========================================================================
  // 5. ATMOSPHERIC PARTICLES
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
    for (let i = 0; i < 45; i++) {
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
