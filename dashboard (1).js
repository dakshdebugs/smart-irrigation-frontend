/* ============================================================
   STATE
============================================================ */
let pumpOn = true;
let totalWater = parseFloat((Math.random() * 20 + 5).toFixed(1));
let irrigDuration = Math.floor(Math.random() * 60 + 30);

/* Previous values for trend arrows */
let prev = {};

/* Chart history — keep last 20 points */
const HISTORY = 20;
const labels          = [];
const moistureHistory = [];
const tempHistory     = [];
const humidHistory    = [];

/* ============================================================
   SIMULATED DATA  —  replace fetchData() body with API call
   e.g. const res = await fetch('/api/sensors'); return res.json();
============================================================ */
function fetchData() {
  const moisture = parseFloat((Math.random() * 60 + 20).toFixed(1));   // 20–80 %
  const temp     = parseFloat((Math.random() * 20 + 18).toFixed(1));   // 18–38 °C
  const humidity = parseFloat((Math.random() * 40 + 30).toFixed(1));   // 30–70 %
  const light    = Math.floor(Math.random() * 60000 + 5000);            // 5k–65k lux
  const flowRate = pumpOn ? parseFloat((Math.random() * 4 + 1).toFixed(2)) : 0;

  /* Accumulate water used when pump is on (2-second tick) */
  if (pumpOn) {
    totalWater    = parseFloat((totalWater + flowRate * (2 / 60)).toFixed(2));
    irrigDuration += 2;
  }

  return { moisture, temp, humidity, light, flowRate, totalWater, irrigDuration };
}

/* ============================================================
   TREND HELPER
============================================================ */
function trend(key, current) {
  if (prev[key] === undefined) { prev[key] = current; return ''; }
  const diff = current - prev[key];
  prev[key] = current;
  if (Math.abs(diff) < 0.01) return '→ stable';
  return diff > 0 ? `↑ +${Math.abs(diff).toFixed(1)}` : `↓ −${Math.abs(diff).toFixed(1)}`;
}

/* ============================================================
   PUMP TOGGLE  (called by onclick in HTML)
============================================================ */
function togglePump() {
  pumpOn = !pumpOn;
  renderPump();
}

function renderPump() {
  const ring  = document.getElementById('pumpRing');
  const text  = document.getElementById('pumpStatusText');
  const meta  = document.getElementById('pumpMeta');
  const btn   = document.getElementById('pumpBtn');
  const badge = document.getElementById('val-pump-badge');
  const card  = document.getElementById('card-pump');

  if (pumpOn) {
    ring.className   = 'pump-ring on';
    text.className   = 'pump-status-text on';
    text.textContent = 'PUMP ACTIVE';
    meta.textContent = `Flow: ${(Math.random() * 3 + 1).toFixed(2)} L/min\nSystem pressurised`;
    btn.className    = 'btn-pump on';
    btn.textContent  = 'Turn OFF';
    badge.textContent = 'ON';
    badge.className  = 'stat-value';
    badge.style.color = 'var(--accent)';
    card.style.setProperty('--card-accent', 'var(--accent)');
  } else {
    ring.className   = 'pump-ring off';
    text.className   = 'pump-status-text off';
    text.textContent = 'PUMP IDLE';
    meta.textContent = 'Flow: 0.00 L/min\nSystem idle';
    btn.className    = 'btn-pump off';
    btn.textContent  = 'Turn ON';
    badge.textContent = 'OFF';
    badge.className  = 'stat-value';
    badge.style.color = 'var(--danger)';
    card.style.setProperty('--card-accent', 'var(--danger)');
  }
}

/* ============================================================
   EFFICIENCY SCORE  (weighted formula)
   Weights: moisture 35%, temperature 25%, water usage 25%, humidity 15%
============================================================ */
function computeEfficiency(d) {
  const mScore = Math.max(0, Math.min(100,
    d.moisture > 70 ? 100 - (d.moisture - 70) * 2
    : d.moisture < 50 ? d.moisture * 2
    : 100
  ));
  const tScore = Math.max(0, 100 - Math.abs(d.temp - 24) * 4);          // optimal 24°C
  const wScore = Math.max(0, 100 - (d.totalWater / 50) * 100);           // baseline 50 L
  const hScore = Math.max(0, 100 - Math.abs(d.humidity - 55) * 2);       // optimal 55%

  const overall = Math.round(mScore * 0.35 + tScore * 0.25 + wScore * 0.25 + hScore * 0.15);

  return {
    overall,
    mScore: mScore.toFixed(0),
    tScore: tScore.toFixed(0),
    wScore: wScore.toFixed(0),
    hScore: hScore.toFixed(0)
  };
}

function renderEfficiency(e) {
  const el    = document.getElementById('effScore');
  const grade = document.getElementById('effGrade');
  const bar   = document.getElementById('effBar');

  el.textContent = e.overall;

  let cls, label, color;
  if (e.overall >= 75)      { cls = '';    label = 'EXCELLENT EFFICIENCY'; color = 'var(--accent)'; }
  else if (e.overall >= 50) { cls = 'mid'; label = 'MODERATE EFFICIENCY';  color = 'var(--warn)';  }
  else                      { cls = 'low'; label = 'LOW EFFICIENCY';        color = 'var(--danger)';}

  el.className         = `eff-score ${cls}`.trim();
  grade.className      = `eff-grade ${cls || 'high'}`;
  grade.textContent    = label;
  bar.style.width      = e.overall + '%';
  bar.style.background = color;

  document.getElementById('ef-moisture').textContent = e.mScore + ' / 100';
  document.getElementById('ef-temp').textContent     = e.tScore + ' / 100';
  document.getElementById('ef-water').textContent    = e.wScore + ' / 100';
  document.getElementById('ef-humidity').textContent = e.hScore + ' / 100';
}

/* ============================================================
   ALERTS
============================================================ */
function checkAlerts(d) {
  const bar  = document.getElementById('alertBar');
  const msg  = document.getElementById('alertMsg');
  const card = document.getElementById('card-moisture');

  if (d.moisture < 40) {
    bar.classList.add('show');
    msg.textContent = `⚠️  Soil moisture at ${d.moisture}% — below 40% threshold. Irrigation recommended immediately.`;
    document.getElementById('val-moisture').className = 'stat-value warn';
    card.style.setProperty('--card-accent', 'var(--warn)');
  } else {
    bar.classList.remove('show');
    document.getElementById('val-moisture').className = 'stat-value';
    card.style.setProperty('--card-accent', 'var(--accent)');
  }
}

/* ============================================================
   RENDER STATS CARDS
============================================================ */
function renderStats(d) {
  document.getElementById('val-moisture').innerHTML  = `${d.moisture}<span class="stat-unit">%</span>`;
  document.getElementById('trend-moisture').textContent = trend('moisture', d.moisture);

  document.getElementById('val-temp').innerHTML      = `${d.temp}<span class="stat-unit">°C</span>`;
  document.getElementById('trend-temp').textContent  = trend('temp', d.temp);

  document.getElementById('val-humidity').innerHTML  = `${d.humidity}<span class="stat-unit">%</span>`;
  document.getElementById('trend-humidity').textContent = trend('humidity', d.humidity);

  document.getElementById('val-light').innerHTML     = `${d.light.toLocaleString()}<span class="stat-unit">lux</span>`;
  document.getElementById('trend-light').textContent = trend('light', d.light);

  document.getElementById('val-flow').innerHTML      = `${d.flowRate}<span class="stat-unit">L/min</span>`;
  document.getElementById('trend-flow').textContent  = trend('flow', d.flowRate);

  document.getElementById('val-total').innerHTML     = `${d.totalWater}<span class="stat-unit">L</span>`;
  document.getElementById('trend-total').textContent = trend('total', d.totalWater);

  document.getElementById('val-duration').innerHTML  = `${d.irrigDuration}<span class="stat-unit">s</span>`;
  document.getElementById('trend-duration').textContent = trend('duration', d.irrigDuration);
}

/* ============================================================
   CHARTS SETUP
============================================================ */
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

/* Moisture Chart */
const moistureCtx  = document.getElementById('moistureChart').getContext('2d');
const moistureGrad = moistureCtx.createLinearGradient(0, 0, 0, 200);
moistureGrad.addColorStop(0, 'rgba(0,220,130,0.3)');
moistureGrad.addColorStop(1, 'rgba(0,220,130,0)');

const moistureChart = new Chart(moistureCtx, {
  type: 'line',
  data: {
    labels,
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

const tempChart = new Chart(thCtx, {
  type: 'line',
  data: {
    labels,
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
   CHART UPDATE
============================================================ */
function updateCharts(d) {
  const now = new Date().toLocaleTimeString('en-GB', { hour12: false });

  if (labels.length >= HISTORY) {
    labels.shift();
    moistureHistory.shift();
    tempHistory.shift();
    humidHistory.shift();
  }

  labels.push(now);
  moistureHistory.push(d.moisture);
  tempHistory.push(d.temp);
  humidHistory.push(d.humidity);

  moistureChart.update();
  tempChart.update();
}

/* ============================================================
   TIMESTAMP
============================================================ */
function updateTimestamp() {
  const now = new Date();
  document.getElementById('timestamp').textContent =
    'Last update: ' + now.toLocaleTimeString('en-GB') + ' — ' + now.toLocaleDateString('en-GB');
  document.getElementById('footerTime').textContent = now.toISOString();
}

/* ============================================================
   MAIN TICK  — runs every 2 seconds
============================================================ */
function tick() {
  const d = fetchData();
  renderStats(d);
  renderPump();
  checkAlerts(d);
  renderEfficiency(computeEfficiency(d));
  updateCharts(d);
  updateTimestamp();
}

/* ============================================================
   BOOT
============================================================ */
renderPump();
tick();
setInterval(tick, 2000);
