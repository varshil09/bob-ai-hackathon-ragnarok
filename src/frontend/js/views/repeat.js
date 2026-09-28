/**
 * CHAKRA — Repeat Offender Watchlist
 * ⭐ THE KILLER FEATURE
 *
 * Shows cross-FIR fingerprint clusters + alias-linked offenders.
 */
import { api } from "../api.js";
import {
  formatNumber,
  escapeHtml,
  openModal,
  toast,
} from "../app.js";


const localState = {
  minConfidence: 0.6,
  minClusterSize: 2,
  clusters: [],
  stats: null,
  tab: "clusters", // "clusters" | "aliases"
  aliasLinks: [],
};


export async function renderRepeat(container) {
  // Fetch both datasets in parallel
  const [repeatRes, aliasRes] = await Promise.all([
    api.repeatOffenders({
      min_confidence: localState.minConfidence,
      min_cluster_size: localState.minClusterSize,
      limit: 200,
    }),
    api.aliasLinks().catch(() => ({ links: [] })),
  ]);

  localState.clusters = repeatRes.clusters;
  localState.stats = repeatRes.stats;
  localState.aliasLinks = aliasRes.links || [];

  const s = localState.stats;

  container.innerHTML = `
    <!-- Hero strip -->
    <div class="card" style="
      background: linear-gradient(135deg, rgba(255,56,96,0.10), rgba(255,183,0,0.06));
      border-color: rgba(255,56,96,0.35);
      padding: 22px;
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;">
        <div>
          <div class="mono faint" style="font-size: 11px; letter-spacing: 2px;">REPEAT-OFFENDER ENGINE</div>
          <div style="font-size: 20px; font-weight: 700; margin-top: 6px;">Cross-FIR Fingerprint Analysis</div>
          <div class="dim" style="font-size: 13px; margin-top: 4px;">
            Grouping FIRs by modus operandi + weapon + vehicle + time + location to surface repeat offenders that manual review misses.
          </div>
        </div>
        <div style="display: flex; gap: 20px;">
          <div style="text-align: center;">
            <div class="mono" style="font-size: 32px; font-weight: 700; color: var(--danger); line-height: 1;">${formatNumber(s.cluster_count)}</div>
            <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-top: 4px;">CLUSTERS</div>
          </div>
          <div style="text-align: center;">
            <div class="mono" style="font-size: 32px; font-weight: 700; color: var(--warning); line-height: 1;">${formatNumber(s.firs_flagged)}</div>
            <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-top: 4px;">FIRs FLAGGED</div>
          </div>
          <div style="text-align: center;">
            <div class="mono" style="font-size: 32px; font-weight: 700; color: var(--accent); line-height: 1;">${formatNumber(s.cross_state_clusters)}</div>
            <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-top: 4px;">CROSS-STATE</div>
          </div>
          <div style="text-align: center;">
            <div class="mono" style="font-size: 32px; font-weight: 700; color: var(--success); line-height: 1;">${formatNumber(s.alias_link_count)}</div>
            <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-top: 4px;">ALIAS-LINKED</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab switcher -->
    <div style="display: flex; gap: 8px; margin: 24px 0 16px; align-items: center; flex-wrap: wrap;">
      <button class="btn ${localState.tab === "clusters" ? "btn-primary" : ""}" data-tab="clusters">
        🔁 Clusters (${formatNumber(localState.clusters.length)})
      </button>
      <button class="btn ${localState.tab === "aliases" ? "btn-primary" : ""}" data-tab="aliases">
        🎭 Alias Links (${formatNumber(localState.aliasLinks.length)})
      </button>

      <div style="flex: 1;"></div>

      <label class="mono faint" style="font-size: 11px; display: flex; align-items: center; gap: 8px;">
        Min confidence:
        <select class="select" id="rp-conf" style="padding: 5px 10px; font-size: 12px;">
          <option value="0.4" ${localState.minConfidence === 0.4 ? "selected" : ""}>0.4</option>
          <option value="0.6" ${localState.minConfidence === 0.6 ? "selected" : ""}>0.6</option>
          <option value="0.8" ${localState.minConfidence === 0.8 ? "selected" : ""}>0.8</option>
          <option value="0.95" ${localState.minConfidence === 0.95 ? "selected" : ""}>0.95</option>
        </select>
      </label>
    </div>

    <!-- Content -->
    <div id="rp-content"></div>
  `;

  // Wire tab switcher
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      localState.tab = btn.dataset.tab;
      renderRepeat(container);
    });
  });

  // Wire confidence filter
  document.getElementById("rp-conf").addEventListener("change", (e) => {
    localState.minConfidence = parseFloat(e.target.value);
    renderRepeat(container);
  });

  // Render active tab
  if (localState.tab === "clusters") {
    renderClusters();
  } else {
    renderAliases();
  }
}


// ===============================================================
// CLUSTERS tab
// ===============================================================
function renderClusters() {
  const el = document.getElementById("rp-content");

  if (!localState.clusters.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">✅</div>
      <div class="empty-state-title">No clusters above threshold</div>
      <div class="empty-state-sub">Try lowering the confidence filter.</div>
    </div>`;
    return;
  }

  el.innerHTML = `
    <div class="grid grid-3">
      ${localState.clusters.map((c, i) => clusterCard(c, i)).join("")}
    </div>
  `;

  // Wire clicks
  el.querySelectorAll(".cluster-card").forEach(card => {
    card.addEventListener("click", () => {
      const idx = parseInt(card.dataset.idx, 10);
      openClusterDetail(localState.clusters[idx]);
    });
  });
}

function clusterCard(c, idx) {
  const firCount = c.fir_count;
  const pct = Math.min(100, Math.round(c.confidence * 100));
  const isCrossState = c.is_cross_state;

  const stateStr = c.states.length > 3
    ? `${c.states.slice(0, 3).join(", ")} +${c.states.length - 3}`
    : c.states.join(", ");

  return `
    <div class="cluster-card ${isCrossState ? "cross-state" : ""}" data-idx="${idx}">
      <div class="cluster-head">
        <div style="flex: 1; min-width: 0;">
          <div class="cluster-signature">${escapeHtml(c.signature || "Unclassified")}</div>
          <div class="cluster-crime">${escapeHtml(c.crime_type || "—")}</div>
        </div>
        <div class="cluster-fir-count">
          ${firCount}
          <small>FIRs</small>
        </div>
      </div>

      <div class="cluster-meta">
        ${isCrossState ? `<span class="badge badge-danger">🌐 Cross-state</span>` : ""}
        <span class="badge badge-default">${c.states.length} state${c.states.length === 1 ? "" : "s"}</span>
        <span class="badge badge-default">${c.districts.length} district${c.districts.length === 1 ? "" : "s"}</span>
        ${c.aliases.length ? `<span class="badge badge-warning">${c.aliases.length} alias${c.aliases.length === 1 ? "" : "es"}</span>` : ""}
      </div>

      <div style="font-size: 11px; color: var(--text-dim); margin-top: 10px;">
        <b style="color: var(--text-faint); font-weight: 500;">States:</b> ${escapeHtml(stateStr)}
      </div>

      <div class="cluster-confidence">
        <span>Confidence</span>
        <div class="conf-bar"><div style="width: ${pct}%"></div></div>
        <b>${pct}%</b>
      </div>
    </div>
  `;
}


// ===============================================================
// ALIAS LINKS tab
// ===============================================================
function renderAliases() {
  const el = document.getElementById("rp-content");

  if (!localState.aliasLinks.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🎭</div>
      <div class="empty-state-title">No alias-linked offenders found</div>
      <div class="empty-state-sub">No accused used multiple aliases across FIRs.</div>
    </div>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 180px;">Accused Name</th>
            <th style="width: 100px;">Aliases</th>
            <th style="width: 100px;">FIRs</th>
            <th>Alias List</th>
            <th style="width: 220px;">States</th>
          </tr>
        </thead>
        <tbody>
          ${localState.aliasLinks.map((l, i) => `
            <tr data-idx="${i}" style="cursor: pointer;">
              <td><b>${escapeHtml(l.accused_name)}</b></td>
              <td><span class="badge badge-danger">${l.alias_count}</span></td>
              <td class="mono">${l.fir_count}</td>
              <td>
                ${l.aliases.map(a => `<span class="badge badge-warning" style="margin: 2px;">${escapeHtml(a)}</span>`).join("")}
              </td>
              <td class="dim" style="font-size: 12px;">${l.states.map(s => escapeHtml(s)).join(" · ")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  el.querySelectorAll("tbody tr").forEach(tr => {
    tr.addEventListener("click", () => {
      openAliasDetail(localState.aliasLinks[parseInt(tr.dataset.idx, 10)]);
    });
  });
}


// ===============================================================
// Detail modals
// ===============================================================
function openClusterDetail(c) {
  const stateChips = c.states.map(s => `<span class="badge badge-default" style="margin: 2px;">${escapeHtml(s)}</span>`).join("");
  const aliasChips = c.aliases.length
    ? c.aliases.map(a => `<span class="badge badge-warning" style="margin: 2px;">${escapeHtml(a)}</span>`).join("")
    : `<span class="dim" style="font-size: 12px;">None</span>`;

  openModal(`
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 0;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px;">FINGERPRINT ${escapeHtml(c.fingerprint)}</div>
        <div style="font-size: 20px; font-weight: 700; margin-top: 4px;">${escapeHtml(c.signature || "Unclassified")}</div>
        <div class="badge badge-accent" style="margin-top: 8px;">${escapeHtml(c.crime_type || "—")}</div>
        ${c.is_cross_state ? `<span class="badge badge-danger" style="margin-left: 6px;">🌐 Cross-state</span>` : ""}
      </div>
      <div style="text-align: right;">
        <div class="mono" style="font-size: 40px; font-weight: 700; color: var(--accent); line-height: 1;">${c.fir_count}</div>
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">LINKED FIRs</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div>
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">CONFIDENCE</div>
        <div class="cluster-confidence" style="margin: 0; padding: 0; border: none;">
          <div class="conf-bar"><div style="width: ${Math.round(c.confidence * 100)}%"></div></div>
          <b>${Math.round(c.confidence * 100)}%</b>
        </div>
      </div>
      <div>
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">GEOGRAPHIC SPREAD</div>
        <div style="font-size: 13px;">
          <b>${c.states.length}</b> states · <b>${c.districts.length}</b> districts · <b>${c.police_stations.length}</b> stations
        </div>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">STATES</div>
      <div>${stateChips}</div>
    </div>

    <div style="margin-bottom: 20px;">
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">ALIASES USED</div>
      <div>${aliasChips}</div>
    </div>

    <div style="margin-bottom: 20px;">
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">ACCUSED NAMES IN CLUSTER (${c.accused_names.length})</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${c.accused_names.map(n => `
          <button class="btn offender-brief-btn" data-name="${escapeHtml(n)}" style="font-size: 12px; padding: 6px 12px;">
            ${escapeHtml(n)} <span style="color: var(--accent); margin-left: 4px;">→</span>
          </button>
        `).join("")}
      </div>
    </div>

    <div>
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">LINKED FIRs (${c.firs.length})</div>
      <div class="table-wrap" style="max-height: 320px; overflow-y: auto;">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 100px;">FIR</th>
              <th>Accused</th>
              <th style="width: 200px;">Station</th>
              <th style="width: 110px;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${c.firs.map(f => `
              <tr style="cursor: pointer;" onclick="event.stopPropagation(); window.dispatchEvent(new CustomEvent('chakra:openFir', { detail: '${escapeHtml(f.fir_id)}' }));">
                <td class="mono" style="color: var(--accent);">${escapeHtml(f.fir_id)}</td>
                <td>${escapeHtml(f.accused_name || "Unknown")}</td>
                <td>
                  <div style="font-size: 12px;">${escapeHtml(f.police_station || "—")}</div>
                  <div class="faint" style="font-size: 10px;">${escapeHtml(f.district || "")}, ${escapeHtml(f.state || "")}</div>
                </td>
                <td class="mono" style="font-size: 11px;">${escapeHtml(f.incident_date || "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  // ⭐ Wire offender brief buttons
  setTimeout(() => {
    document.querySelectorAll(".offender-brief-btn").forEach(btn => {
      btn.addEventListener("click", () => openOffenderBrief(btn.dataset.name));
    });
  }, 50);
}

// ===============================================================
// ⭐ NEW: Offender Case Brief modal
// ===============================================================
async function openOffenderBrief(name) {
  openModal(`<div class="loading-screen" style="height: 300px;">
    <div class="spinner"></div>
    <p style="margin-top: 12px;">Bob is analysing ${escapeHtml(name)}'s case history…</p>
  </div>`);

  try {
    const res = await fetch(`http://127.0.0.1:8000/api/offenders/${encodeURIComponent(name)}/brief`).then(r => r.json());
    const d = res.data;

    const srcLabel = res.bob_source === "bob-live" ? "IBM BOB LIVE" : "BOB (MOCK)";

    openModal(`
      <div style="margin-bottom: 20px;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px;">OFFENDER CASE BRIEF</div>
        <div style="font-size: 26px; font-weight: 700; margin-top: 4px;">${escapeHtml(res.offender)}</div>
        ${d.aliases.length ? `<div style="margin-top: 8px;">${d.aliases.map(a => `<span class="badge badge-warning" style="margin: 2px;">alias: ${escapeHtml(a)}</span>`).join("")}</div>` : ""}
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
        <div>
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">LINKED FIRs</div>
          <div class="mono" style="font-size: 24px; font-weight: 700; color: var(--accent);">${d.fir_count}</div>
        </div>
        <div>
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">STATES</div>
          <div class="mono" style="font-size: 24px; font-weight: 700; color: var(--success);">${d.states.length}</div>
        </div>
        <div>
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">DISTRICTS</div>
          <div class="mono" style="font-size: 24px; font-weight: 700; color: var(--accent-2);">${d.districts.length}</div>
        </div>
        <div>
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">ARRESTS</div>
          <div class="mono" style="font-size: 24px; font-weight: 700; color: ${d.arrests > 0 ? "var(--success)" : "var(--danger)"};">${d.arrests}</div>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">CRIME TYPES</div>
        <div>${d.crime_types.map(c => `<span class="badge badge-accent" style="margin: 2px;">${escapeHtml(c)}</span>`).join("")}</div>
      </div>

      <div style="margin-bottom: 20px;">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">STATES</div>
        <div>${d.states.map(s => `<span class="badge badge-default" style="margin: 2px;">${escapeHtml(s)}</span>`).join("")}</div>
      </div>

      <div style="margin-bottom: 20px;">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">MODUS OPERANDI</div>
        <div>${d.modus_operandi.map(m => `<span class="badge badge-warning" style="margin: 2px;">${escapeHtml(m)}</span>`).join("") || '<span class="dim">—</span>'}</div>
      </div>

      <!-- Bob's case brief -->
      <div class="card" style="
        background: linear-gradient(135deg, rgba(123,95,255,0.08), rgba(0,212,255,0.05));
        border-color: rgba(123,95,255,0.35);
        padding: 20px;
        margin-top: 24px;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="font-size: 16px;">🤖</span>
          <span class="mono faint" style="font-size: 10px; letter-spacing: 1.5px;">CASE BRIEF · ${srcLabel}</span>
        </div>
        <div style="font-size: 14px; line-height: 1.7; color: var(--text);">
          ${formatBrief(res.brief)}
        </div>
      </div>

      <div style="margin-top: 24px;">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">ALL LINKED FIRs (${d.firs.length})</div>
        <div class="table-wrap" style="max-height: 300px; overflow-y: auto;">
          <table class="table">
            <thead>
              <tr><th>FIR</th><th>Crime</th><th>Location</th><th>Date</th></tr>
            </thead>
            <tbody>
              ${d.firs.map(f => `
                <tr>
                  <td class="mono" style="color: var(--accent);">${escapeHtml(f.fir_id)}</td>
                  <td><span class="badge badge-accent" style="font-size: 10px;">${escapeHtml(f.crime_type || "")}</span></td>
                  <td style="font-size: 12px;">${escapeHtml(f.police_station || "")}, ${escapeHtml(f.state || "")}</td>
                  <td class="mono" style="font-size: 11px;">${escapeHtml(f.incident_date || "")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (err) {
    openModal(`<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Could not generate brief</div>
      <div class="empty-state-sub">${escapeHtml(err.message)}</div>
    </div>`);
  }
}

function formatBrief(text) {
  if (!text) return "—";
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n\n/g, "<br/><br/>").replace(/\n/g, "<br/>");
}


function openAliasDetail(l) {
  openModal(`
    <div style="margin-bottom: 20px;">
      <div class="mono faint" style="font-size: 10px; letter-spacing: 2px;">ALIAS-LINKED OFFENDER</div>
      <div style="font-size: 24px; font-weight: 700; margin-top: 4px;">${escapeHtml(l.accused_name)}</div>
      <div style="font-size: 13px; color: var(--text-dim); margin-top: 4px;">
        Appears in <b>${l.fir_count}</b> FIRs using <b>${l.alias_count}</b> different aliases
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">ALIASES</div>
      ${l.aliases.map(a => `<span class="badge badge-warning" style="margin: 3px; padding: 6px 12px; font-size: 12px;">${escapeHtml(a)}</span>`).join("")}
    </div>

    <div style="margin-bottom: 20px;">
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">STATES CROSSED</div>
      ${l.states.map(s => `<span class="badge badge-default" style="margin: 3px;">${escapeHtml(s)}</span>`).join("")}
    </div>

    <div style="margin-bottom: 20px;">
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">CRIME TYPES</div>
      ${l.crime_types.map(c => `<span class="badge badge-accent" style="margin: 3px;">${escapeHtml(c)}</span>`).join("")}
    </div>

    <div>
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">LINKED FIRs</div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        ${l.fir_ids.map(id => `<span class="badge badge-mono" style="font-size: 11px;">${escapeHtml(id)}</span>`).join("")}
      </div>
    </div>
  `);
}