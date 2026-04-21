/* ============================================================
   AquaSync — script.js
   Backend Integration Contract
   ============================================================

   SENSORS USED:
   - Capacitive Soil Moisture Sensor  → soil_moisture_percent
   - DHT11 Temperature & Humidity     → temperature, humidity
   - LDR (Light Sensor)               → light_intensity
   - Relay Module                     → pump_status

   EXPECTED VALUE RANGES (for backend validation):
   - soil_moisture_percent : 0   – 100   (%)
   - temperature           : 0   – 50    (°C)
   - humidity              : 20  – 90    (%)
   - light_intensity       : 0   – 4095  (raw ADC or lux)
   - water_flow_rate       : 0   – any   (L/min)
   - total_water_used      : 0   – any   (L, cumulative)
   - irrigation_duration   : 0   – any   (seconds, cumulative)
   - pump_status           : "ON" | "OFF"
   - timestamp             : ISO 8601 string, e.g. "2024-06-01T12:00:00"

   EXPECTED JSON FROM GET /latest-data:
   {
     "soil_moisture_percent": 65.4,
     "temperature": 28.5,
     "humidity": 55.2,
     "light_intensity": 2048,
     "water_flow_rate": 2.3,
     "total_water_used": 14.7,
     "irrigation_duration": 360,
     "pump_status": "ON",
     "timestamp": "2024-06-01T12:00:00"
   }

   OPTIONAL — Water Efficiency Score (if backend computes it):
   Add to the JSON response:
   {
     ...
     "efficiency_score": 82,
     "efficiency_factors": {
       "moisture_adequacy": 90,
       "temperature_stress": 75,
       "water_consumption": 80,
       "humidity_balance": 85
     }
   }
   If omitted, the efficiency panel will display "—".

   PUMP CONTROL POST BODY → POST /pump:
   { "pump_status": "ON" }   or   { "pump_status": "OFF" }

   Expected response from POST /pump:
   { "success": true, "pump_status": "ON" }
============================================================ */


/* ============================================================
   API CONFIGURATION
   Change BASE_URL to your deployed server address when going live.
============================================================ */
const BASE_URL       = 'http://localhost:5000';
const DATA_ENDPOINT  = `${BASE_URL}/latest-data`;  // GET — sensor readings
const PUMP_ENDPOINT  = `${BASE_URL}/pump`;          // POST — pump control
const POLL_INTERVAL  = 2000;                         // ms — polling frequency


/* ============================================================
   STATE
   pumpState tracks the current pump toggle state on the frontend.
   It is initialised from the first API response and updated on
   each subsequent fetch or manual toggle.
============================================================ */
let pumpState = 'OFF';
let prev      = {};   // stores previous sensor values for trend arrows


/* ============================================================
   CHART SETUP
   Stores last 20 readings for live chart display.
============================================================ */
const HISTORY         = 20;
const chartLabels     = [];
const moistureHistory = [];
const tempHistory     = [];
const humidHistory    = [];

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: { legend: { display: false } },
  scales: {
    x: {
      ticks: { color: '#3d5a73', font: { family: 'DM Mono', size: 9 } },
      grid:  { color: 'rgba(255,255,255,0.04)' }
    },
    y: {
      ticks: { color: '#3d5a73', font: { family: 'DM Mono', size: 9 } },
      grid:  { color: 'rgba(255,255,255,0.04)' }
    }
  }
};

/* Soil Moisture Chart */
const moistureCtx  = document.getElementById('moistureChart').getContext('2d');
const moistureGrad = moistureCtx.createLinearGradient(0, 0, 0, 200);
moistureGrad.addColorStop(0, 'rgba(0,220,130,0.3)');
moistureGrad.addColorStop(1, 'rgba(0,220,130,0)');

const moistureChart = new Chart(moistureCtx, {
  type: 'line',
  data: {
    labels: chartLabels,
    datasets: [{
      data: moistureHistory,
      borderColor: '#00dc82',
      borderWidth: 2,
      backgroundColor: moistureGrad,
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: '#00dc82'
    }]
  },
  options: {
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: { ...chartDefaults.scales.y, min: 0, max: 100 }
    }
  }
});

/* Temperature & Humidity Chart */
const thCtx = document.getElementById('tempHumidChart').getContext('2d');

const tempHumidChart = new Chart(thCtx, {
  type: 'line',
  data: {
    labels: chartLabels,
    datasets: [
      {
        label: 'Temperature',
        data: tempHistory,
        borderColor: '#38bdf8',
        borderWidth: 2,
        backgroundColor: 'rgba(56,189,248,0.05)',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5
      },
      {
        label: 'Humidity',
        data: humidHistory,
        borderColor: '#a78bfa',
        borderWidth: 2,
        backgroundColor: 'rgba(167,139,250,0.05)',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5
      }
    ]
  },
  options: chartDefaults
});


/* ============================================================
   TREND HELPER
   Shows ↑ / ↓ / → beside each sensor value card.
============================================================ */
function trend(key, current) {
  if (prev[key] === undefined) { prev[key] = current; return ''; }
  const diff = current - prev[key];
  prev[key]  = current;
  if (Math.abs(diff) < 0.01) return '→ stable';
  return diff > 0 ? `↑ +${Math.abs(diff).toFixed(1)}` : `↓ −${Math.abs(diff).toFixed(1)}`;
}


/* ============================================================
   DATA FETCH
   Calls GET /latest-data every POLL_INTERVAL milliseconds.
   Maps the JSON response fields directly to DOM elements.
============================================================ */
async function fetchAndRender() {
  try {
    /* ── BACKEND: serve JSON at GET /latest-data ── */
    const response = await fetch(DATA_ENDPOINT);

    if (!response.ok) {
      showConnectionError(`HTTP ${response.status} — ${response.statusText}`);
      return;
    }

    /* ── EXPECTED JSON STRUCTURE ─────────────────────────────
       {
         "soil_moisture_percent": number,   // 0–100 %
         "temperature"          : number,   // 0–50 °C
         "humidity"             : number,   // 20–90 %
         "light_intensity"      : number,   // 0–4095 (ADC) or lux
         "water_flow_rate"      : number,   // L/min
         "total_water_used"     : number,   // L (cumulative)
         "irrigation_duration"  : number,   // seconds (cumulative)
         "pump_status"          : "ON" | "OFF",
         "timestamp"            : string    // ISO 8601
       }
    ─────────────────────────────────────────────────────── */
    const d = await response.json();

    clearConnectionError();

    /* Map JSON fields → UI */
    renderSensorCards(d);
    renderPumpUI(d.pump_status);
    renderAlerts(d);
    renderEfficiency(d);
    renderCharts(d);
    renderTimestamp(d.timestamp);

    /* Keep pumpState in sync with backend */
    pumpState = d.pump_status;

  } catch (err) {
    /* Network error, CORS issue, or backend is down */
    showConnectionError(`Cannot reach ${DATA_ENDPOINT} — ${err.message}`);
  }
}


/* ============================================================
   SENSOR CARDS RENDERER
   Maps each JSON field to its corresponding DOM element.
============================================================ */
function renderSensorCards(d) {
  /* soil_moisture_percent → Capacitive Soil Moisture Sensor */
  document.getElementById('val-moisture').innerHTML =
    `${d.soil_moisture_percent}<span class="stat-unit">%</span>`;
  document.getElementById('trend-moisture').textContent =
    trend('moisture', d.soil_moisture_percent);

  /* temperature → DHT11 */
  document.getElementById('val-temp').innerHTML =
    `${d.temperature}<span class="stat-unit">°C</span>`;
  document.getElementById('trend-temp').textContent =
    trend('temp', d.temperature);

  /* humidity → DHT11 */
  document.getElementById('val-humidity').innerHTML =
    `${d.humidity}<span class="stat-unit">%</span>`;
  document.getElementById('trend-humidity').textContent =
    trend('humidity', d.humidity);

  /* light_intensity → LDR */
  document.getElementById('val-light').innerHTML =
    `${Number(d.light_intensity).toLocaleString()}<span class="stat-unit">lux</span>`;
  document.getElementById('trend-light').textContent =
    trend('light', d.light_intensity);

  /* water_flow_rate */
  document.getElementById('val-flow').innerHTML =
    `${d.water_flow_rate}<span class="stat-unit">L/min</span>`;
  document.getElementById('trend-flow').textContent =
    trend('flow', d.water_flow_rate);

  /* total_water_used */
  document.getElementById('val-total').innerHTML =
    `${d.total_water_used}<span class="stat-unit">L</span>`;
  document.getElementById('trend-total').textContent =
    trend('total', d.total_water_used);

  /* irrigation_duration */
  document.getElementById('val-duration').innerHTML =
    `${d.irrigation_duration}<span class="stat-unit">s</span>`;
  document.getElementById('trend-duration').textContent =
    trend('duration', d.irrigation_duration);
}


/* ============================================================
   PUMP UI RENDERER
   Reflects pump_status from GET /latest-data.
   Does NOT send any request — purely visual update.
============================================================ */
function renderPumpUI(status) {
  const isOn  = status === 'ON';
  const ring  = document.getElementById('pumpRing');
  const text  = document.getElementById('pumpStatusText');
  const meta  = document.getElementById('pumpMeta');
  const btn   = document.getElementById('pumpBtn');
  const badge = document.getElementById('val-pump-badge');
  const card  = document.getElementById('card-pump');

  ring.className    = `pump-ring ${isOn ? 'on' : 'off'}`;
  text.className    = `pump-status-text ${isOn ? 'on' : 'off'}`;
  text.textContent  = isOn ? 'PUMP ACTIVE' : 'PUMP IDLE';
  meta.textContent  = isOn ? 'System pressurised' : 'System idle';
  btn.className     = `btn-pump ${isOn ? 'on' : 'off'}`;
  btn.textContent   = isOn ? 'Turn OFF' : 'Turn ON';
  badge.textContent = status;
  badge.style.color = isOn ? 'var(--accent)' : 'var(--danger)';
  card.style.setProperty('--card-accent', isOn ? 'var(--accent)' : 'var(--danger)');
}


/* ============================================================
   PUMP TOGGLE
   Called by the "Turn ON / Turn OFF" button in index.html.

   BACKEND: Handle POST /pump
   Request body  : { "pump_status": "ON" }  or  { "pump_status": "OFF" }
   Expected response: { "success": true, "pump_status": "ON" }
============================================================ */
async function togglePump() {
  const nextState = pumpState === 'ON' ? 'OFF' : 'ON';

  try {
    /* ── BACKEND: receive POST /pump ── */
    const response = await fetch(PUMP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* ── PUMP POST BODY ─────────────────────────────────────
         { "pump_status": "ON" }   to turn pump on
         { "pump_status": "OFF" }  to turn pump off
      ───────────────────────────────────────────────────── */
      body: JSON.stringify({ pump_status: nextState })
    });

    if (!response.ok) {
      console.error(`Pump control failed: HTTP ${response.status}`);
      return;
    }

    const result = await response.json();

    /* Use confirmed state from backend response if available */
    const confirmedState = result.pump_status || nextState;
    pumpState = confirmedState;
    renderPumpUI(confirmedState);

  } catch (err) {
    console.error(`Pump toggle error: ${err.message}`);
  }
}


/* ============================================================
   ALERTS
   Shows warning bar when soil_moisture_percent < 40.
============================================================ */
function renderAlerts(d) {
  const bar  = document.getElementById('alertBar');
  const msg  = document.getElementById('alertMsg');
  const card = document.getElementById('card-moisture');

  if (d.soil_moisture_percent < 40) {
    bar.classList.add('show');
    msg.textContent =
      `⚠️  Soil moisture at ${d.soil_moisture_percent}% — below 40% threshold. Irrigation recommended immediately.`;
    document.getElementById('val-moisture').className = 'stat-value warn';
    card.style.setProperty('--card-accent', 'var(--warn)');
  } else {
    bar.classList.remove('show');
    document.getElementById('val-moisture').className = 'stat-value';
    card.style.setProperty('--card-accent', 'var(--accent)');
  }
}


/* ============================================================
   EFFICIENCY SCORE
   Reads optional efficiency fields from the API response.

   BACKEND: optionally include in GET /latest-data response:
   {
     "efficiency_score": 82,
     "efficiency_factors": {
       "moisture_adequacy" : 90,
       "temperature_stress": 75,
       "water_consumption" : 80,
       "humidity_balance"  : 85
     }
   }
   If these fields are absent, the panel shows "—".
============================================================ */
function renderEfficiency(d) {
  const score   = d.efficiency_score;
  const factors = d.efficiency_factors || {};

  const el    = document.getElementById('effScore');
  const grade = document.getElementById('effGrade');
  const bar   = document.getElementById('effBar');

  if (score === undefined || score === null) {
    el.textContent    = '—';
    grade.textContent = 'Awaiting backend data…';
    bar.style.width   = '0%';
    document.getElementById('ef-moisture').textContent = '—';
    document.getElementById('ef-temp').textContent     = '—';
    document.getElementById('ef-water').textContent    = '—';
    document.getElementById('ef-humidity').textContent = '—';
    return;
  }

  let cls, label, color;
  if (score >= 75)      { cls = '';    label = 'EXCELLENT EFFICIENCY'; color = 'var(--accent)'; }
  else if (score >= 50) { cls = 'mid'; label = 'MODERATE EFFICIENCY';  color = 'var(--warn)';  }
  else                  { cls = 'low'; label = 'LOW EFFICIENCY';        color = 'var(--danger)';}

  el.textContent        = score;
  el.className          = `eff-score ${cls}`.trim();
  grade.className       = `eff-grade ${cls || 'high'}`;
  grade.textContent     = label;
  bar.style.width       = score + '%';
  bar.style.background  = color;

  document.getElementById('ef-moisture').textContent =
    factors.moisture_adequacy  !== undefined ? factors.moisture_adequacy  + ' / 100' : '—';
  document.getElementById('ef-temp').textContent =
    factors.temperature_stress !== undefined ? factors.temperature_stress + ' / 100' : '—';
  document.getElementById('ef-water').textContent =
    factors.water_consumption  !== undefined ? factors.water_consumption  + ' / 100' : '—';
  document.getElementById('ef-humidity').textContent =
    factors.humidity_balance   !== undefined ? factors.humidity_balance   + ' / 100' : '—';
}


/* ============================================================
   CHARTS RENDERER
   Appends the latest sensor values to the rolling chart history.
============================================================ */
function renderCharts(d) {
  /* Use server timestamp as chart label if available */
  const label = d.timestamp
    ? new Date(d.timestamp).toLocaleTimeString('en-GB', { hour12: false })
    : new Date().toLocaleTimeString('en-GB', { hour12: false });

  if (chartLabels.length >= HISTORY) {
    chartLabels.shift();
    moistureHistory.shift();
    tempHistory.shift();
    humidHistory.shift();
  }

  chartLabels.push(label);
  moistureHistory.push(d.soil_moisture_percent);
  tempHistory.push(d.temperature);
  humidHistory.push(d.humidity);

  moistureChart.update();
  tempHumidChart.update();
}


/* ============================================================
   TIMESTAMP RENDERER
   Uses the timestamp field from GET /latest-data.
   Falls back to client time if field is missing.
============================================================ */
function renderTimestamp(ts) {
  const date = ts ? new Date(ts) : new Date();
  document.getElementById('timestamp').textContent =
    'Last update: ' + date.toLocaleTimeString('en-GB') + ' — ' + date.toLocaleDateString('en-GB');
  document.getElementById('footerTime').textContent = date.toISOString();
}


/* ============================================================
   CONNECTION ERROR HELPERS
   Shows/clears the alert bar for API connectivity issues.
============================================================ */
function showConnectionError(message) {
  const bar = document.getElementById('alertBar');
  const msg = document.getElementById('alertMsg');
  bar.classList.add('show');
  msg.textContent = `🔴  API Error: ${message}`;
}

function clearConnectionError() {
  /* Only clear if it was a connection error (not a sensor alert) */
  const msg = document.getElementById('alertMsg').textContent;
  if (msg.startsWith('🔴')) {
    document.getElementById('alertBar').classList.remove('show');
  }
}


/* ============================================================
   BOOT
   Fetch immediately on load, then poll every POLL_INTERVAL ms.
============================================================ */
fetchAndRender();
setInterval(fetchAndRender, POLL_INTERVAL);