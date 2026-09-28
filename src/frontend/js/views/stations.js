/**
 * CHAKRA — Stations View
 */
import { api } from "../api.js";
import { formatNumber, escapeHtml, openModal, toast } from "../app.js";


let stationsCache = null;


export async function renderStations(container) {
  const res = await api.stations();
  stationsCache = res.stations;

  const stations = stationsCache;
  const totalFirs = stations.reduce((a, s) => a + s.fir_count, 0);
  const maxFirs = stations[0]?.fir_count || 1;

  container.innerHTML = `
    <div class="section-header">
      <div>
        <h3 class="section-title">${stations.length} Police Stations Ranked</h3>
        <p class="section-sub">Click any station to open its AI-generated intelligence briefing</p>
      </div>
      <div class="badge badge-accent">${formatNumber(totalFirs)} FIRs total</div>
    </div>

    <div class="grid grid-3">
      ${stations.map((s, i) => stationCard(s, i, maxFirs)).join("")}
    </div>
  `;

  container.querySelectorAll(".station-card").forEach(card => {
    card.addEventListener("click", () => openStationBriefing(card.dataset.name));
  });
}


function stationCard(s, idx, maxFirs) {
  const pct = Math.round((s.fir_count / maxFirs) * 100);
  const rank = idx + 1;
  const rankColor = rank <= 3 ? "var(--danger)" : rank <= 10 ? "var(--warning)" : "var(--text-faint)";

  return `
    <div class="station-card" data-name="${escapeHtml(s.police_station)}">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
        <div style="flex: 1; min-width: 0;">
          <div class="station-name">${escapeHtml(s.police_station)}</div>
          <div class="station-state">${escapeHtml(s.state || "")}</div>
        </div>
        <div class="mono" style="font-size: 18px; font-weight: 700; color: ${rankColor}; line-height: 1;">#${rank}</div>
      </div>

      <div class="station-stats" style="margin-top: 10px;">
        <div>
          <div class="station-count">${s.fir_count}</div>
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-top: 4px;">FIRs</div>
        </div>
        <div class="station-top-crime">
          Top: <span style="color: var(--accent); font-weight: 600;">${escapeHtml(s.top_crime || "—")}</span>
        </div>
      </div>

      <div class="bar-track" style="margin-top: 12px;">
        <div class="bar-fill" style="width: ${pct}%"></div>
      </div>
    </div>
  `;
}


async function openStationBriefing(stationName) {
  openModal(`<div class="loading-screen" style="height: 200px;"><div class="spinner"></div></div>`);

  try {
    const res = await api.stationSummary(stationName);
    const s = res.stats;

    const crimeBars = (s.crime_breakdown || []).slice(0, 6).map(c => `
      <div style="margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px;">
          <span>${escapeHtml(c.label)}</span>
          <span class="mono" style="color: var(--accent);">${c.value}</span>
        </div>
        <div class="bar-track" style="height: 4px;">
          <div class="bar-fill" style="width: ${Math.round((c.value / s.total_firs) * 100)}%"></div>
        </div>
      </div>
    `).join("");

    const timeBars = (s.time_breakdown || []).map(t => `
      <span class="badge badge-default" style="margin: 2px;">${escapeHtml(t.label)}: <b class="mono" style="color: var(--accent);">${t.value}</b></span>
    `).join("");

    const repeatList = (s.repeat_offenders || []).length
      ? (s.repeat_offenders || []).map(r => `
          <div class="stat-row" style="cursor: default;">
            <div class="stat-row-label"><span>${escapeHtml(r.name)}</span></div>
            <div class="stat-row-value">${r.fir_count} FIRs</div>
          </div>
        `).join("")
      : `<div class="dim" style="font-size: 12px;">No repeat offenders in this station.</div>`;

    const srcLabel = (res.bob_source === "bob-live" || res.bob_source === "watsonx") ? "LIVE" : "MOCK";

    openModal(`
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;">
        <div>
          <div class="mono faint" style="font-size: 10px; letter-spacing: 2px;">POLICE STATION BRIEFING</div>
          <div style="font-size: 22px; font-weight: 700; margin-top: 4px;">${escapeHtml(res.police_station)}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <span class="badge badge-accent">${formatNumber(s.total_firs)} FIRs</span>
          <span class="badge badge-success">${s.arrest_rate_pct}% arrested</span>
        </div>
      </div>

      <div class="narrative" style="border-left-color: var(--accent-2); background: linear-gradient(135deg, rgba(123,95,255,0.08), rgba(0,212,255,0.05));">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-size: 14px;">🤖</span>
          <span class="mono faint" style="font-size: 10px; letter-spacing: 1.5px;">BOB BRIEFING · ${srcLabel}</span>
        </div>
        ${formatBriefing(res.briefing)}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
        <div>
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 12px;">TOP CRIME TYPES</div>
          ${crimeBars || '<div class="dim" style="font-size: 12px;">—</div>'}
        </div>
        <div>
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 12px;">TIME-OF-DAY DISTRIBUTION</div>
          <div>${timeBars || '<div class="dim" style="font-size: 12px;">—</div>'}</div>
        </div>
      </div>

      <div style="margin-top: 24px;">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">REPEAT OFFENDERS IN THIS STATION</div>
        ${repeatList}
      </div>
    `);
  } catch (err) {
    openModal(`<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Failed to load briefing</div>
      <div class="empty-state-sub">${escapeHtml(err.message)}</div>
    </div>`);
  }
}


function formatBriefing(text) {
  if (!text) return "—";
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br/>");
}