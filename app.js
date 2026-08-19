/**
 * ==========================================================================
 * AEROMETRICS PRO - IoT Weather Station Dashboard Controller
 * Handles: Glassmorphic UI, OLED HUD Twin, Sensors, Charts, ESP32 Link
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  
  // --- APPLICATION STATE ---
  const state = {
    // Current Sensor Data
    temperature: 26.8, // °C
    humidity: 58,      // %
    pressure: 1013.2,  // hPa
    altitude: 112,     // m
    
    // OLED State Machine
    // 0 = Boot / Loading, 1 = Screen 1 (Time & Date), 2 = Screen 2 (Weather Sensors)
    oledScreen: 1,
    oledAutoReturnTimeout: null,
    oledAutoReturnInterval: null,
    oledCountdownSec: 10,
    isBooting: false,

    // Connection & Settings
    connectionMode: 'sim', // 'sim', 'esp32_rest', 'esp32_ws'
    espIp: '192.168.1.150',
    refreshRate: 2000,
    isConnected: true,

    // Active Chart Tab
    activeChartMetric: 'temperature',
    
    // Telemetry History for Charts (last 15 points)
    history: {
      timestamps: [],
      temperature: [],
      humidity: [],
      pressure: []
    },

    // Audio
    isAudioPlaying: false
  };

  // --- INITIALIZE HISTORY DATA ---
  const initHistoryData = () => {
    const now = new Date();
    for (let i = 14; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60000);
      const timeLabel = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      state.history.timestamps.push(timeLabel);
      state.history.temperature.push(+(state.temperature + (Math.random() * 0.8 - 0.4)).toFixed(1));
      state.history.humidity.push(Math.round(state.humidity + (Math.random() * 3 - 1.5)));
      state.history.pressure.push(+(state.pressure + (Math.random() * 0.6 - 0.3)).toFixed(1));
    }
  };
  initHistoryData();

  // ==========================================================================
  // 1. CLOCK & DATE FORMATTER (NTP SIMULATION)
  // ==========================================================================
  const updateSystemClock = () => {
    const now = new Date();
    
    // Format Time: HH:MM:SS
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;

    // Format Date: DAY, DD MON YYYY
    const options = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', options).toUpperCase();

    // Update Header
    const headerClock = document.getElementById('headerClock');
    const headerDate = document.getElementById('headerDate');
    if (headerClock) headerClock.textContent = timeStr;
    if (headerDate) headerDate.textContent = dateStr;

    // Update OLED Screen 1
    const oledTimeText = document.getElementById('oledTimeText');
    const oledDateText = document.getElementById('oledDateText');
    if (oledTimeText) oledTimeText.textContent = timeStr;
    if (oledDateText) oledDateText.textContent = dateStr;
  };

  setInterval(updateSystemClock, 1000);
  updateSystemClock();

  // ==========================================================================
  // 2. OLED HARDWARE DIGITAL TWIN CONTROLLER
  // ==========================================================================
  const oledBootScreen = document.getElementById('oledBootScreen');
  const oledScreen1 = document.getElementById('oledScreen1');
  const oledScreen2 = document.getElementById('oledScreen2');
  const oledScreenLabel = document.getElementById('oledScreenLabel');
  const oledAutoReturnTimer = document.getElementById('oledAutoReturnTimer');
  const flowStep1 = document.getElementById('flowStep1');
  const flowStep2 = document.getElementById('flowStep2');
  const virtualTouchBtn = document.getElementById('virtualTouchBtn');

  // Switch OLED Display to Screen 1 (Time & Date)
  const showOledScreen1 = () => {
    if (state.isBooting) return;
    
    // Clear any active 10s auto-return timers
    if (state.oledAutoReturnTimeout) clearTimeout(state.oledAutoReturnTimeout);
    if (state.oledAutoReturnInterval) clearInterval(state.oledAutoReturnInterval);

    state.oledScreen = 1;
    oledBootScreen.classList.remove('active');
    oledScreen2.classList.remove('active');
    oledScreen1.classList.add('active');

    oledScreenLabel.textContent = 'SCREEN 1 (Time & Date)';
    oledScreenLabel.style.color = 'var(--accent-cyan)';
    
    flowStep1.classList.add('active');
    flowStep2.classList.remove('active');
  };

  // Switch OLED Display to Screen 2 (Weather HUD) with 10s Countdown Auto-Return
  const showOledScreen2 = () => {
    if (state.isBooting) return;

    // Clear previous timers
    if (state.oledAutoReturnTimeout) clearTimeout(state.oledAutoReturnTimeout);
    if (state.oledAutoReturnInterval) clearInterval(state.oledAutoReturnInterval);

    state.oledScreen = 2;
    state.oledCountdownSec = 10;
    
    oledBootScreen.classList.remove('active');
    oledScreen1.classList.remove('active');
    oledScreen2.classList.add('active');

    oledScreenLabel.textContent = 'SCREEN 2 (Weather Metrics)';
    oledScreenLabel.style.color = 'var(--accent-teal)';
    
    flowStep1.classList.remove('active');
    flowStep2.classList.add('active');

    // Update Countdown Badge
    if (oledAutoReturnTimer) {
      oledAutoReturnTimer.textContent = `${state.oledCountdownSec}s`;
    }

    // Start 1-second countdown interval
    state.oledAutoReturnInterval = setInterval(() => {
      state.oledCountdownSec -= 1;
      if (oledAutoReturnTimer) {
        oledAutoReturnTimer.textContent = `${Math.max(0, state.oledCountdownSec)}s`;
      }
      if (state.oledCountdownSec <= 0) {
        clearInterval(state.oledAutoReturnInterval);
      }
    }, 1000);

    // Auto-return to Screen 1 after exactly 10 seconds of no click
    state.oledAutoReturnTimeout = setTimeout(() => {
      showOledScreen1();
    }, 10000);
  };

  // Touch Sensor Click Trigger (Toggles between Screen 1 and Screen 2)
  const handleTouchSensorClick = () => {
    if (state.isBooting) return;

    // Tactile button effect
    virtualTouchBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
      virtualTouchBtn.style.transform = '';
    }, 120);

    // Play subtle beep sound or toggle
    if (state.oledScreen === 1) {
      showOledScreen2();
    } else {
      showOledScreen1();
    }
  };

  if (virtualTouchBtn) {
    virtualTouchBtn.addEventListener('click', handleTouchSensorClick);
  }

  // Quick Toggle Button
  const quickToggleScreenBtn = document.getElementById('quickToggleScreenBtn');
  if (quickToggleScreenBtn) {
    quickToggleScreenBtn.addEventListener('click', handleTouchSensorClick);
  }

  // Trigger Boot Animation / Karmakar Industry Branding
  const triggerBootAnimation = () => {
    state.isBooting = true;
    state.oledScreen = 0;
    
    if (state.oledAutoReturnTimeout) clearTimeout(state.oledAutoReturnTimeout);
    if (state.oledAutoReturnInterval) clearInterval(state.oledAutoReturnInterval);

    oledScreen1.classList.remove('active');
    oledScreen2.classList.remove('active');
    oledBootScreen.classList.add('active');

    oledScreenLabel.textContent = 'BOOTING (Karmakar Industry)';
    oledScreenLabel.style.color = 'var(--accent-amber)';

    const oledBootFill = document.getElementById('oledBootFill');
    const oledBootPercent = document.getElementById('oledBootPercent');
    
    let progress = 10;
    oledBootFill.style.width = '10%';
    oledBootPercent.textContent = '10%';

    const bootInterval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 10;
      if (progress > 100) progress = 100;
      
      oledBootFill.style.width = `${progress}%`;
      oledBootPercent.textContent = `${progress}%`;

      if (progress >= 100) {
        clearInterval(bootInterval);
        setTimeout(() => {
          state.isBooting = false;
          showOledScreen1();
        }, 600);
      }
    }, 200);
  };

  const triggerRebootBtn = document.getElementById('triggerRebootBtn');
  if (triggerRebootBtn) {
    triggerRebootBtn.addEventListener('click', triggerBootAnimation);
  }

  // Run initial brief boot sequence on page launch
  setTimeout(triggerBootAnimation, 400);

  // ==========================================================================
  // 3. TELEMETRY & SENSOR CALCULATIONS ENGINE
  // ==========================================================================
  const updateMetricCards = () => {
    // Temperature Elements
    const tempValue = document.getElementById('tempValue');
    const tempFahrenheit = document.getElementById('tempFahrenheit');
    const tempFeels = document.getElementById('tempFeels');
    const tempGauge = document.getElementById('tempGauge');
    const oledTempText = document.getElementById('oledTempText');

    if (tempValue) tempValue.textContent = state.temperature.toFixed(1);
    if (oledTempText) oledTempText.textContent = `${state.temperature.toFixed(1)} °C`;
    
    const fahrenheit = (state.temperature * 9 / 5) + 32;
    if (tempFahrenheit) tempFahrenheit.textContent = `${fahrenheit.toFixed(1)}°F`;

    // Heat Index (Feels like)
    const feelsLike = state.temperature + 0.33 * (state.humidity / 100 * 6.105 * Math.exp(17.27 * state.temperature / (237.7 + state.temperature))) - 4.0;
    if (tempFeels) tempFeels.textContent = `${feelsLike.toFixed(1)}°C`;

    // Temp Gauge (Range: 0°C to 50°C)
    if (tempGauge) {
      const tempPercent = Math.min(Math.max((state.temperature / 50), 0), 1);
      const circumference = 264;
      const offset = circumference - (tempPercent * circumference);
      tempGauge.style.strokeDashoffset = offset;
    }

    // Humidity Elements
    const humidityValue = document.getElementById('humidityValue');
    const humidityGauge = document.getElementById('humidityGauge');
    const dewPoint = document.getElementById('dewPoint');
    const absHumidity = document.getElementById('absHumidity');
    const comfortLevel = document.getElementById('comfortLevel');
    const oledHumiText = document.getElementById('oledHumiText');

    if (humidityValue) humidityValue.textContent = Math.round(state.humidity);
    if (oledHumiText) oledHumiText.textContent = `${Math.round(state.humidity)} %`;

    // Humidity Gauge (0% to 100%)
    if (humidityGauge) {
      const humPercent = state.humidity / 100;
      const circumference = 264;
      const offset = circumference - (humPercent * circumference);
      humidityGauge.style.strokeDashoffset = offset;
    }

    // Dew Point Calculation (Magnus formula)
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

    // Pressure Elements (BMP280)
    const pressureValue = document.getElementById('pressureValue');
    const pressureGauge = document.getElementById('pressureGauge');
    const pressureMmHg = document.getElementById('pressureMmHg');
    const altitudeValue = document.getElementById('altitudeValue');
    const seaLevelPres = document.getElementById('seaLevelPres');
    const oledPresText = document.getElementById('oledPresText');

    if (pressureValue) pressureValue.textContent = state.pressure.toFixed(1);
    if (oledPresText) oledPresText.textContent = `${state.pressure.toFixed(1)} hPa`;

    // mmHg conversion
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

    // Air density estimate
    const airDensityVal = document.getElementById('airDensityVal');
    if (airDensityVal) {
      const rho = (state.pressure * 100) / (287.058 * (state.temperature + 273.15));
      airDensityVal.textContent = `${rho.toFixed(3)} kg/m³`;
    }
  };

  // ==========================================================================
  // 4. CHART.JS TELEMETRY VISUALIZATION
  // ==========================================================================
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  
  // Custom Glassy Gradients for Chart
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

  // Chart Metric Tab Switching
  const chartTabs = document.querySelectorAll('.chart-tab');
  chartTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
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

  // ==========================================================================
  // 5. LIVE SIMULATION & REAL ESP32 DATA POLLING
  // ==========================================================================
  const pushTelemetryPoint = () => {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append to history
    state.history.timestamps.push(timeLabel);
    state.history.temperature.push(state.temperature);
    state.history.humidity.push(state.humidity);
    state.history.pressure.push(state.pressure);

    // Keep history at 15 points
    if (state.history.timestamps.length > 15) {
      state.history.timestamps.shift();
      state.history.temperature.shift();
      state.history.humidity.shift();
      state.history.pressure.shift();
    }

    telemetryChart.update();
  };

  // Simulated Weather Drift
  const runSimulationStep = () => {
    // Subtle realistic random fluctuations
    const tempDelta = (Math.random() - 0.49) * 0.25;
    state.temperature = +(Math.min(Math.max(state.temperature + tempDelta, 18), 38)).toFixed(1);

    const humDelta = (Math.random() - 0.5) * 0.8;
    state.humidity = +(Math.min(Math.max(state.humidity + humDelta, 20), 95)).toFixed(0);

    const presDelta = (Math.random() - 0.5) * 0.15;
    state.pressure = +(Math.min(Math.max(state.pressure + presDelta, 980), 1035)).toFixed(1);

    updateMetricCards();
  };

  // Poll ESP32 REST Endpoint
  const fetchEsp32Data = async () => {
    try {
      const url = `http://${state.espIp}/api/data`;
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      // Update state from ESP32 payload
      if (data.temp !== undefined) state.temperature = data.temp;
      if (data.humidity !== undefined) state.humidity = data.humidity;
      if (data.pressure !== undefined) state.pressure = data.pressure;
      if (data.screen !== undefined && !state.isBooting) {
        if (data.screen === 1 && state.oledScreen !== 1) showOledScreen1();
        else if (data.screen === 2 && state.oledScreen !== 2) showOledScreen2();
      }

      updateMetricCards();
      
      const connPill = document.getElementById('connectionPill');
      const connLabel = document.getElementById('connectionLabel');
      if (connLabel) connLabel.textContent = `ESP32 (${state.espIp})`;
      if (connPill) connPill.querySelector('.status-dot').className = 'status-dot online';

    } catch (err) {
      console.warn('ESP32 polling error:', err.message);
      const connLabel = document.getElementById('connectionLabel');
      const connPill = document.getElementById('connectionPill');
      if (connLabel) connLabel.textContent = `ESP32 RECONNECTING...`;
      if (connPill) connPill.querySelector('.status-dot').className = 'status-dot';
      
      // Fallback to slight drift so UI stays alive
      runSimulationStep();
    }
  };

  // Main Polling Loop
  let pollTimer = setInterval(() => {
    if (state.connectionMode === 'sim') {
      runSimulationStep();
    } else {
      fetchEsp32Data();
    }
  }, state.refreshRate);

  // Push chart point every 10 seconds
  setInterval(pushTelemetryPoint, 10000);
  updateMetricCards();

  // ==========================================================================
  // 6. ATMOSPHERIC PARTICLE CANVAS (MIST & SUNBEAMS)
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

  // ==========================================================================
  // 7. AMBIENT NATURE AUDIO CONTROLLER
  // ==========================================================================
  const natureAudio = document.getElementById('natureAudio');
  const audioToggleBtn = document.getElementById('audioToggleBtn');
  const audioIcon = document.getElementById('audioIcon');

  if (audioToggleBtn && natureAudio) {
    audioToggleBtn.addEventListener('click', () => {
      if (state.isAudioPlaying) {
        natureAudio.pause();
        state.isAudioPlaying = false;
        audioToggleBtn.classList.remove('playing');
        audioIcon.className = 'fa-solid fa-volume-xmark';
      } else {
        natureAudio.volume = 0.4;
        natureAudio.play().then(() => {
          state.isAudioPlaying = true;
          audioToggleBtn.classList.add('playing');
          audioIcon.className = 'fa-solid fa-volume-high';
        }).catch(e => {
          console.log('Audio autoplay policy required user gesture');
        });
      }
    });
  }

  // ==========================================================================
  // 8. SETTINGS MODAL & HARDWARE LINK CONFIG
  // ==========================================================================
  const settingsModal = document.getElementById('settingsModal');
  const settingsModalBtn = document.getElementById('settingsModalBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const footerConfigLink = document.getElementById('footerConfigLink');
  const connectionModeSelect = document.getElementById('connectionMode');
  const espIpGroup = document.getElementById('espIpGroup');
  const espIpInput = document.getElementById('espIpInput');
  const refreshRateInput = document.getElementById('refreshRateInput');
  const testConnBtn = document.getElementById('testConnBtn');
  const saveConnBtn = document.getElementById('saveConnBtn');
  const connTestResult = document.getElementById('connTestResult');

  const openSettings = () => {
    if (settingsModal) settingsModal.classList.add('active');
  };

  const closeSettings = () => {
    if (settingsModal) settingsModal.classList.remove('active');
    if (connTestResult) connTestResult.style.display = 'none';
  };

  if (settingsModalBtn) settingsModalBtn.addEventListener('click', openSettings);
  if (footerConfigLink) footerConfigLink.addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeSettings);

  // Close when clicking modal backdrop
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });
  }

  // Connection Mode Change
  if (connectionModeSelect) {
    connectionModeSelect.addEventListener('change', () => {
      const mode = connectionModeSelect.value;
      if (mode === 'sim') {
        espIpGroup.style.display = 'none';
      } else {
        espIpGroup.style.display = 'flex';
      }
    });
  }

  // Test ESP32 Link
  if (testConnBtn) {
    testConnBtn.addEventListener('click', async () => {
      const mode = connectionModeSelect.value;
      connTestResult.className = 'connection-test-result';
      connTestResult.style.display = 'block';

      if (mode === 'sim') {
        connTestResult.className = 'connection-test-result success';
        connTestResult.textContent = '✓ Virtual simulation engine is active and ready.';
        return;
      }

      const ip = espIpInput.value.trim();
      connTestResult.textContent = `Connecting to http://${ip}/api/data...`;

      try {
        const res = await fetch(`http://${ip}/api/data`, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          connTestResult.className = 'connection-test-result success';
          connTestResult.textContent = `✓ Successfully linked to ESP32 at ${ip}!`;
        } else {
          throw new Error(`HTTP Status ${res.status}`);
        }
      } catch (err) {
        connTestResult.className = 'connection-test-result error';
        connTestResult.textContent = `✗ Connection failed: ${err.message}. Check ESP32 Wi-Fi & IP.`;
      }
    });
  }

  // Save Settings
  if (saveConnBtn) {
    saveConnBtn.addEventListener('click', () => {
      state.connectionMode = connectionModeSelect.value;
      state.espIp = espIpInput.value.trim() || '192.168.1.150';
      state.refreshRate = parseInt(refreshRateInput.value, 10) || 2000;

      // Reset polling interval
      clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (state.connectionMode === 'sim') {
          runSimulationStep();
        } else {
          fetchEsp32Data();
        }
      }, state.refreshRate);

      const connLabel = document.getElementById('connectionLabel');
      if (connLabel) {
        connLabel.textContent = state.connectionMode === 'sim' ? 'LIVE SIMULATION' : `ESP32 (${state.espIp})`;
      }

      closeSettings();
    });
  }

});
