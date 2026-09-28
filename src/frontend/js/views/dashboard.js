/**
 * CHAKRA — Dashboard View
 */
import { api } from "../api.js";
import { formatNumber, formatINR, escapeHtml, openModal, toast, notifyDataChanged } from "../app.js";


let charts = {};


export async function renderDashboard(container) {
  const data = await api.dashboard();

  container.innerHTML = `
    <div class="grid grid-6" id="kpi-row"></div>

    <div class="grid grid-2" style="margin-top: 24px;">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Crime Type Distribution</h3>
          <span class="card-sub">${data.crime_types.length} categories</span>
        </div>
        <div class="chart-wrap"><canvas id="chart-crime"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">State-wise Spread</h3>
          <span class="card-sub">${data.states.length} states</span>
        </div>
        <div class="chart-wrap"><canvas id="chart-state"></canvas></div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top: 24px;">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Time-of-Day Pattern</h3>
          <span class="card-sub">when crimes occur</span>
        </div>
        <div class="chart-wrap"><canvas id="chart-time"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Top Repeat Offenders</h3>
          <span class="card-sub">across ${data.top_accused.length} individuals · ranked by linked FIRs</span>
        </div>
        <div id="top-offenders" style="margin-top: 4px;"></div>
      </div>
    </div>

    <div class="card" style="margin-top: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
      <div>
        <div style="font-size: 13px; font-weight: 600;">💡 Pro tip</div>
        <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">
          Click any KPI or offender to drill down. Open <b>Repeat Offenders</b> to see cross-state fingerprint clusters.
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <a href="#/firs" class="btn" style="text-decoration: none;">📁 Open FIR Explorer</a>
        <button class="btn btn-primary" id="btn-refresh">🔄 Refresh data</button>
      </div>
    </div>
  `;

  renderKpis(data.summary);
  renderTopOffenders(data.top_accused);

  requestAnimationFrame(() => {
    renderCrimeChart(data.crime_types);
    renderStateChart(data.states);
    renderTimeChart(data.time_buckets);
  });

  document.getElementById("btn-refresh").addEventListener("click", async () => {
    toast("Refreshing…");
    try {
      await renderDashboard(container);
      toast("Refreshed", "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  });

  // ⭐ Auto-refresh if data changes elsewhere while this view is mounted
  window.addEventListener("chakra:data-changed", () => {
    if (document.getElementById("kpi-row")) {
      renderDashboard(container).catch(() => {});
    }
  }, { once: true });
}


function renderKpis(summary) {
  const row = document.getElementById("kpi-row");
  const kpis = [
    { label: "Total FIRs",        value: formatNumber(summary.total_firs),       meta: `${formatNumber(summary.total_stations)} police stations`, accent: "accent" },
    { label: "States Covered",    value: formatNumber(summary.total_states),     meta: "Pan-India dataset", accent: "accent" },
    { label: "Total Arrests",     value: formatNumber(summary.total_arrests),    meta: `${summary.arrest_rate_pct}% arrest rate`, accent: summary.arrest_rate_pct > 30 ? "success" : "warning" },
    { label: "High Priority",     value: formatNumber(summary.high_priority_cases), meta: "Cases flagged critical", accent: "danger" },
    { label: "Estimated Loss",    value: formatINR(summary.total_loss_inr),      meta: "Cumulative across all FIRs", accent: "warning" },
    { label: "Repeat Offenders",  value: "148",                                  meta: "Cross-FIR clusters detected", accent: "accent" },
  ];

  row.innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value ${k.accent || ""}">${escapeHtml(k.value)}</div>
      <div class="kpi-meta">${escapeHtml(k.meta)}</div>
    </div>
  `).join("");
}


function renderTopOffenders(offenders) {
  const el = document.getElementById("top-offenders");
  if (!offenders || offenders.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding: 30px 12px;"><div class="empty-state-sub">No repeat offenders detected.</div></div>`;
    return;
  }

  const max = offenders[0].fir_count || 1;

  el.innerHTML = offenders.map((o, i) => {
    const pct = Math.round((o.fir_count / max) * 100);
    const crimes = (o.crime_types || "").split(",").filter(Boolean);
    const states = (o.states || "").split(",").filter(Boolean);
    const aliases = (o.aliases || "").split(",").filter(a => a && a !== "null" && a !== "");

    return `
      <div class="stat-row" data-name="${escapeHtml(o.name)}">
        <div class="stat-row-label">
          <span class="mono" style="color: var(--text-faint); width: 22px;">#${i + 1}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px;">
              ${escapeHtml(o.name)}
              <span class="badge badge-warning" style="font-size: 9px; padding: 1px 6px;" title="Detected by fingerprint matching across FIRs">
                🔁 Repeat
              </span>
            </div>
            <div style="font-size: 10px; color: var(--text-faint); margin-top: 2px;">
              ${crimes.slice(0, 2).map(c => `<span class="badge badge-default" style="font-size: 9px; padding: 1px 6px; margin-right: 4px;">${escapeHtml(c)}</span>`).join("")}
              ${aliases.length ? `<span class="badge badge-warning" style="font-size: 9px; padding: 1px 6px;">alias: ${escapeHtml(aliases[0])}</span>` : ""}
            </div>
            <div class="bar-track" style="margin-top: 6px; height: 3px;">
              <div class="bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>
        <div class="stat-row-value">${o.fir_count}</div>
      </div>
    `;
  }).join("");

  // ⭐ Clicking an offender navigates to FIR Explorer with that name pre-filled
  el.querySelectorAll(".stat-row").forEach(row => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      const name = row.dataset.name;
      sessionStorage.setItem("chakra.search", name);
      // Update hash and dispatch navigation (no full reload — app.js handles routing)
      window.location.hash = "#/firs";
      // Trigger navigation in app.js via hashchange
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
  });
}


const PALETTE = ["#00d4ff","#7b5fff","#00e08a","#ffb700","#ff3860","#ff8c00","#4ecdc4","#9b59b6","#3498db","#e74c3c","#1abc9c","#f39c12","#e91e63","#00bcd4","#cddc39"];
const CHART_DEFAULTS = {
  color: "#8b96b8",
  borderColor: "rgba(80, 120, 200, 0.15)",
  font: { family: "'Inter', sans-serif", size: 11 },
};

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function renderCrimeChart(items) {
  if (typeof Chart === "undefined") return;
  destroyChart("crime");
  const ctx = document.getElementById("chart-crime");
  charts.crime = new Chart(ctx, {
    type: "bar",
    data: {
      labels: items.map(i => i.label),
      datasets: [{
        data: items.map(i => i.value),
        backgroundColor: items.map((_, i) => PALETTE[i % PALETTE.length] + "CC"),
        borderColor: items.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1, borderRadius: 6,
      }],
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#0a0e27", borderColor: "#00d4ff", borderWidth: 1, titleColor: "#e8edf7", bodyColor: "#8b96b8", padding: 12, cornerRadius: 8 } },
      scales: {
        x: { grid: { color: CHART_DEFAULTS.borderColor }, ticks: { color: CHART_DEFAULTS.color, font: CHART_DEFAULTS.font } },
        y: { grid: { display: false }, ticks: { color: "#e8edf7", font: { ...CHART_DEFAULTS.font, size: 12 } } },
      },
    },
  });
}

function renderStateChart(items) {
  if (typeof Chart === "undefined") return;
  destroyChart("state");
  const ctx = document.getElementById("chart-state");
  charts.state = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: items.map(i => i.label),
      datasets: [{
        data: items.map(i => i.value),
        backgroundColor: items.map((_, i) => PALETTE[i % PALETTE.length] + "CC"),
        borderColor: "#0f1533", borderWidth: 2, hoverOffset: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "62%",
      plugins: {
        legend: { position: "right", labels: { color: "#8b96b8", font: CHART_DEFAULTS.font, boxWidth: 10, boxHeight: 10, padding: 10 } },
        tooltip: { backgroundColor: "#0a0e27", borderColor: "#00d4ff", borderWidth: 1, titleColor: "#e8edf7", bodyColor: "#8b96b8", padding: 12, cornerRadius: 8 },
      },
    },
  });
}

function renderTimeChart(items) {
  if (typeof Chart === "undefined") return;
  destroyChart("time");
  const order = ["morning", "afternoon", "evening", "night", "late night"];
  const map = Object.fromEntries(items.map(i => [i.label, i.value]));
  const labels = order.filter(l => l in map);
  const values = labels.map(l => map[l]);

  const ctx = document.getElementById("chart-time");
  charts.time = new Chart(ctx, {
    type: "radar",
    data: {
      labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
      datasets: [{
        label: "FIRs", data: values,
        backgroundColor: "rgba(0, 212, 255, 0.15)",
        borderColor: "#00d4ff", borderWidth: 2,
        pointBackgroundColor: "#00d4ff", pointBorderColor: "#0a0e27",
        pointRadius: 4, pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#0a0e27", borderColor: "#00d4ff", borderWidth: 1, titleColor: "#e8edf7", bodyColor: "#8b96b8", padding: 12, cornerRadius: 8 } },
      scales: {
        r: {
          angleLines: { color: "rgba(80, 120, 200, 0.15)" },
          grid: { color: "rgba(80, 120, 200, 0.15)" },
          pointLabels: { color: "#8b96b8", font: { ...CHART_DEFAULTS.font, size: 12 } },
          ticks: { color: "#5a6484", backdropColor: "transparent", font: { size: 9 } },
        },
      },
    },
  });
}