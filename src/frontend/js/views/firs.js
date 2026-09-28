/**
 * CHAKRA — FIR Explorer
 * Searchable, filterable table of all FIRs with a detail modal.
 */
import { api } from "../api.js";
import {
  formatNumber,
  formatINR,
  escapeHtml,
  openModal,
  toast,
  priorityClass,
} from "../app.js";


// ===============================================================
// Local state
// ===============================================================
const PAGE_SIZE = 25;

const localState = {
  filters: {
    search: "",
    crime_type: "",
    state: "",
    police_station: "",
    time_bucket: "",
  },
  page: 0,
  total: 0,
  items: [],
};


// ===============================================================
// Render
// ===============================================================
export async function renderFirs(container) {
  // Fetch filter dropdown options (cached)
  const filters = await api.filters();

  // Apply a pending search from dashboard click
  const pendingSearch = sessionStorage.getItem("chakra.search");
  if (pendingSearch) {
    localState.filters.search = pendingSearch;
    localState.page = 0;
    sessionStorage.removeItem("chakra.search");
  }

  container.innerHTML = `
    <!-- Filter bar -->
    <div class="filter-bar">
      <input
        class="input"
        type="search"
        id="f-search"
        placeholder="🔎 Search narratives, FIR IDs, complainants…"
        value="${escapeHtml(localState.filters.search)}"
      />
      <select class="select" id="f-crime">
        <option value="">All crime types</option>
        ${filters.crime_types.map(c => `
          <option value="${escapeHtml(c)}" ${localState.filters.crime_type === c ? "selected" : ""}>${escapeHtml(c)}</option>
        `).join("")}
      </select>
      <select class="select" id="f-state">
        <option value="">All states</option>
        ${filters.states.map(s => `
          <option value="${escapeHtml(s)}" ${localState.filters.state === s ? "selected" : ""}>${escapeHtml(s)}</option>
        `).join("")}
      </select>
      <select class="select" id="f-station">
        <option value="">All police stations</option>
        ${filters.police_stations.map(p => `
          <option value="${escapeHtml(p)}" ${localState.filters.police_station === p ? "selected" : ""}>${escapeHtml(p)}</option>
        `).join("")}
      </select>
      <select class="select" id="f-time">
        <option value="">Any time</option>
        ${filters.time_buckets.map(t => `
          <option value="${escapeHtml(t)}" ${localState.filters.time_bucket === t ? "selected" : ""}>${escapeHtml(t)}</option>
        `).join("")}
      </select>
      <button class="btn btn-ghost" id="f-clear">✕ Clear</button>
    </div>

    <!-- Results meta -->
    <div class="section-header" style="margin-top: 0;">
      <div>
        <h3 class="section-title" id="f-count">Loading…</h3>
        <p class="section-sub">Click any row to open the full FIR</p>
      </div>
      <div class="mono faint" id="f-page-info" style="font-size: 12px;"></div>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 100px;">FIR ID</th>
            <th style="width: 130px;">Crime</th>
            <th style="width: 130px;">Accused</th>
            <th style="width: 200px;">Location</th>
            <th style="width: 100px;">Date</th>
            <th style="width: 100px;">Time</th>
            <th style="width: 90px;">Priority</th>
          </tr>
        </thead>
        <tbody id="f-tbody">
          <tr><td colspan="7"><div class="loading-screen" style="height: 200px;"><div class="spinner"></div></div></td></tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <div class="pagination-info" id="f-pag-info"></div>
      <div class="pagination-controls">
        <button class="btn" id="f-prev">← Prev</button>
        <button class="btn" id="f-next">Next →</button>
      </div>
    </div>
  `;

  // Wire filter events
  document.getElementById("f-search").addEventListener("input", debounce((e) => {
    localState.filters.search = e.target.value.trim();
    localState.page = 0;
    loadFirs();
  }, 350));

  document.getElementById("f-crime").addEventListener("change", (e) => {
    localState.filters.crime_type = e.target.value;
    localState.page = 0;
    loadFirs();
  });
  document.getElementById("f-state").addEventListener("change", (e) => {
    localState.filters.state = e.target.value;
    localState.page = 0;
    loadFirs();
  });
  document.getElementById("f-station").addEventListener("change", (e) => {
    localState.filters.police_station = e.target.value;
    localState.page = 0;
    loadFirs();
  });
  document.getElementById("f-time").addEventListener("change", (e) => {
    localState.filters.time_bucket = e.target.value;
    localState.page = 0;
    loadFirs();
  });

  document.getElementById("f-clear").addEventListener("click", () => {
    localState.filters = { search: "", crime_type: "", state: "", police_station: "", time_bucket: "" };
    localState.page = 0;
    renderFirs(container);
  });

  document.getElementById("f-prev").addEventListener("click", () => {
    if (localState.page > 0) {
      localState.page -= 1;
      loadFirs();
    }
  });
  document.getElementById("f-next").addEventListener("click", () => {
    const maxPage = Math.max(0, Math.ceil(localState.total / PAGE_SIZE) - 1);
    if (localState.page < maxPage) {
      localState.page += 1;
      loadFirs();
    }
  });

  // Initial load
  loadFirs();
}


// ===============================================================
// Fetch and render rows
// ===============================================================
async function loadFirs() {
  const tbody = document.getElementById("f-tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7"><div class="loading-screen" style="height: 200px;"><div class="spinner"></div></div></td></tr>`;

  try {
    const params = {
      ...localState.filters,
      limit: PAGE_SIZE,
      offset: localState.page * PAGE_SIZE,
    };
    const res = await api.listFirs(params);

    localState.total = res.total;
    localState.items = res.items;

    document.getElementById("f-count").textContent =
      `${formatNumber(res.total)} FIR${res.total === 1 ? "" : "s"}`;
    document.getElementById("f-page-info").textContent =
      `Showing ${res.items.length} of ${formatNumber(res.total)}`;

    // Pagination info
    const maxPage = Math.max(0, Math.ceil(res.total / PAGE_SIZE) - 1);
    document.getElementById("f-pag-info").textContent =
      `Page ${localState.page + 1} / ${maxPage + 1}`;
    document.getElementById("f-prev").disabled = localState.page === 0;
    document.getElementById("f-next").disabled = localState.page >= maxPage;

    renderRows(res.items);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding: 40px; text-align: center; color: var(--danger);">
      Failed to load FIRs — ${escapeHtml(err.message)}
    </td></tr>`;
  }
}


function renderRows(items) {
  const tbody = document.getElementById("f-tbody");

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">No FIRs match your filters</div>
        <div class="empty-state-sub">Try clearing a filter or adjusting search</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(f => `
    <tr data-fir-id="${escapeHtml(f.fir_id)}">
      <td class="mono">${escapeHtml(f.fir_id)}</td>
      <td><span class="badge badge-accent">${escapeHtml(f.crime_type || "—")}</span></td>
      <td>${escapeHtml(f.accused_name || "Unknown")}</td>
      <td>
        <div style="font-size: 12px;">${escapeHtml(f.police_station || "—")}</div>
        <div class="faint" style="font-size: 10px;">${escapeHtml(f.district || "")}, ${escapeHtml(f.state || "")}</div>
      </td>
      <td class="mono">${escapeHtml(f.incident_date || "—")}</td>
      <td><span class="badge badge-default">${escapeHtml(f.time_bucket || "—")}</span></td>
      <td><span class="badge ${priorityClass(f.case_priority)}">${escapeHtml(f.case_priority || "—")}</span></td>
    </tr>
  `).join("");

  // Click handlers
  tbody.querySelectorAll("tr[data-fir-id]").forEach(tr => {
    tr.addEventListener("click", () => openFirDetail(tr.dataset.firId));
  });
}


async function openFirDetail(firId) {
  openModal(`<div class="loading-screen" style="height: 200px;"><div class="spinner"></div></div>`);

  try {
    const f = await api.getFir(firId);

    openModal(`
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">
        <div>
          <div class="mono faint" style="font-size: 11px; letter-spacing: 1px;">FIR</div>
          <div class="mono" style="font-size: 22px; font-weight: 700; color: var(--accent);">${escapeHtml(f.fir_id)}</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <span class="badge badge-accent">${escapeHtml(f.crime_type || "—")}</span>
          <span class="badge ${priorityClass(f.case_priority)}">${escapeHtml(f.case_priority || "—")}</span>
        </div>
      </div>

      <!-- ⭐ Bob Analysis Panel (auto-loads) -->
      <div id="bob-analysis-panel" class="card" style="
        background: linear-gradient(135deg, rgba(123,95,255,0.08), rgba(0,212,255,0.05));
        border-color: rgba(123,95,255,0.35);
        margin-bottom: 20px;
        padding: 18px;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">🤖</span>
            <span class="mono faint" style="font-size: 10px; letter-spacing: 1.5px;">BOB ANALYSIS</span>
          </div>
          <button class="btn" id="btn-classify" style="padding: 4px 12px; font-size: 11px;">Analyse with Bob</button>
        </div>
        <div id="bob-analysis-content" style="font-size: 13px; color: var(--text-dim);">
          Click "Analyse with Bob" to classify severity, urgency, and suggested legal sections.
        </div>
      </div>

      <div class="narrative">${escapeHtml(f.fir_narrative || "No narrative available.")}</div>

      <dl class="detail-grid" style="margin-top: 24px;">
        <dt>State</dt>       <dd>${escapeHtml(f.state || "—")}</dd>
        <dt>District</dt>    <dd>${escapeHtml(f.district || "—")}</dd>
        <dt>Station</dt>     <dd>${escapeHtml(f.police_station || "—")}</dd>
        <dt>City</dt>        <dd>${escapeHtml(f.city || "—")}</dd>
        <dt>Location</dt>    <dd>${escapeHtml(f.incident_location || "—")}</dd>

        <dt>Incident Date</dt><dd class="mono">${escapeHtml(f.incident_date || "—")} · ${escapeHtml(f.incident_time || "")}</dd>
        <dt>Report Date</dt> <dd class="mono">${escapeHtml(f.report_date || "—")}</dd>
        <dt>Time Bucket</dt> <dd>${escapeHtml(f.time_bucket || "—")}</dd>

        <dt>Complainant</dt> <dd>${escapeHtml(f.complainant_name || "—")}</dd>
        <dt>Victim Age</dt>  <dd>${escapeHtml(f.victim_age ?? "—")}</dd>
        <dt>Victim Gender</dt><dd>${escapeHtml(f.victim_gender || "—")}</dd>
        <dt>Victim Profile</dt><dd>${escapeHtml(f.victim_profile || "—")}</dd>

        <dt>Accused</dt>     <dd>${escapeHtml(f.accused_name || "Unknown")}</dd>
        <dt>Accused Alias</dt><dd>${escapeHtml(f.accused_alias || "—")}</dd>

        <dt>Modus Operandi</dt><dd>${escapeHtml(f.modus_operandi || "—")}</dd>
        <dt>Vehicle Used</dt> <dd>${escapeHtml(f.vehicle_used || "—")}</dd>
        <dt>Weapon / Tool</dt><dd>${escapeHtml(f.weapon_or_tool || "—")}</dd>

        <dt>Evidence</dt>    <dd>${escapeHtml(f.evidence_type || "—")}</dd>
        <dt>Digital Evidence</dt><dd>${escapeHtml(f.digital_evidence || "—")}</dd>
        <dt>CCTV Status</dt> <dd>${escapeHtml(f.cctv_status || "—")}</dd>

        <dt>Estimated Loss</dt><dd class="mono">${formatINR(f.estimated_loss_inr)}</dd>
        <dt>Arrest Status</dt><dd>${escapeHtml(f.arrest_status || "—")}</dd>
        <dt>Recovery</dt>    <dd>${escapeHtml(f.recovery_status || "—")}</dd>
        <dt>Investigation</dt><dd>${escapeHtml(f.investigation_status || "—")}</dd>
      </dl>
    `);

    // ⭐ Wire Bob Analysis button
    document.getElementById("btn-classify").addEventListener("click", async () => {
      const btn = document.getElementById("btn-classify");
      const panel = document.getElementById("bob-analysis-content");
      btn.disabled = true;
      btn.textContent = "Analysing…";
      panel.innerHTML = `<div class="loading-screen" style="height: 80px;"><div class="spinner"></div></div>`;

      try {
        const res = await fetch(`http://127.0.0.1:8000/api/firs/${firId}/classify`).then(r => r.json());
        const c = res.classification;

        const sevColor = { "Critical": "var(--danger)", "High": "var(--danger)", "Medium": "var(--warning)", "Low": "var(--success)" }[c.severity] || "var(--text)";

        panel.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
            <div>
              <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">SEVERITY</div>
              <div class="mono" style="font-size: 20px; font-weight: 700; color: ${sevColor};">${escapeHtml(c.severity)}</div>
            </div>
            <div>
              <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">URGENCY</div>
              <div class="mono" style="font-size: 20px; font-weight: 700; color: var(--accent);">${escapeHtml(c.urgency)}</div>
            </div>
            <div>
              <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">PRIORITY</div>
              <div class="mono" style="font-size: 20px; font-weight: 700; color: var(--accent-2);">${escapeHtml(c.investigation_priority)}</div>
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 4px;">SUGGESTED BNS SECTIONS</div>
            <div>${(c.suggested_bns_sections || []).map(s => `<span class="badge badge-accent" style="margin: 2px;">${escapeHtml(s)}</span>`).join("")}</div>
          </div>

          <div style="display: flex; gap: 20px; margin-bottom: 12px;">
            <div>
              <span class="faint" style="font-size: 10px; letter-spacing: 1.5px;">VICTIM RISK:</span>
              <span class="mono" style="color: var(--text);">${escapeHtml(c.victim_risk || "—")}</span>
            </div>
            <div>
              <span class="faint" style="font-size: 10px; letter-spacing: 1.5px;">PUBLIC INTEREST:</span>
              <span class="mono" style="color: var(--text);">${escapeHtml(c.public_interest || "—")}</span>
            </div>
          </div>

          <div class="narrative" style="border-left-color: var(--accent-2); margin-top: 12px;">
            <b style="color: var(--text-faint); font-size: 10px; letter-spacing: 1.5px;">REASONING</b><br/>
            ${escapeHtml(c.reasoning || "—")}
          </div>

          <div style="margin-top: 10px; font-size: 10px; color: var(--text-faint); text-align: right;">
            Source: ${res.bob_source === "bob-live" ? "IBM Bob Live" : "Bob (mock)"}
          </div>
        `;
      } catch (err) {
        panel.innerHTML = `<span style="color: var(--danger);">Classification failed: ${escapeHtml(err.message)}</span>`;
      } finally {
        btn.disabled = false;
        btn.textContent = "Analyse with Bob";
      }
    });
  } catch (err) {
    openModal(`<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Failed to load FIR</div>
      <div class="empty-state-sub">${escapeHtml(err.message)}</div>
    </div>`);
  }
}


// ===============================================================
// Tiny debounce util
// ===============================================================
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}