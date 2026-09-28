/**
 * CHAKRA — Add FIR
 * Two modes:
 *  1. Manual — user fills structured fields
 *  2. Smart  — user pastes messy narrative, Bob extracts EVERYTHING
 */
import { api } from "../api.js";
import { escapeHtml, toast, notifyDataChanged } from "../app.js";


const BASE = "http://127.0.0.1:8000";

let CRIME_TYPES = [
  "Mobile Snatching", "Cyber Fraud", "Vehicle Theft", "Burglary",
  "Robbery", "UPI Fraud", "Extortion", "Fraud / Cheating",
  "Assault", "Murder / Homicide", "Sexual Offence",
  "Kidnapping / Abduction", "Missing Person", "Drug Possession",
];

const TIME_BUCKETS = ["morning", "afternoon", "evening", "night", "late night"];
const LOCATION_TYPES = ["online", "roadside", "market", "residential area", "commercial area", "transit area", "workplace"];
const PRIORITIES = ["Low", "Medium", "High"];
const INVESTIGATION = ["Under Investigation", "Investigation Pending", "Charge Sheet Filed", "Final Report Submitted", "Closed - Insufficient Evidence"];
const ARREST_STATUS = ["Not arrested", "Arrested", "Notice issued", "Accused unidentified"];

const MODUS_OPERANDI_OPTIONS = [
  "motorcycle approach", "two-person motorcycle team", "fake bank representative call",
  "fake refund request", "fake job offer", "steering-lock bypass", "rear-door entry",
  "threat calls", "grab-and-flee", "KYC update message", "UPI payment request",
  "collect-request scam", "window entry", "roof entry", "lock breaking",
  "key duplication", "master-key method", "false key", "group assault",
  "blunt-object assault", "argument escalated", "fake investment promise",
  "identity impersonation", "advance-payment deception", "QR-code payment trick",
  "merchant impersonation", "remote-support application", "vehicle interception",
  "delivery packet", "small quantity concealed", "street-level possession",
];

let currentTab = "smart";  // ⭐ Default to Smart mode — Bob is the star


export async function renderAddFir(container) {
  let filters = { states: [], districts: [], police_stations: [] };
  try { filters = await api.filters(); } catch { /* ignore */ }
  try {
    const tax = await api.taxonomy();
    if (tax && tax.crimes && tax.crimes.length) {
      CRIME_TYPES = tax.crimes.map(c => c.crime_type);
    }
  } catch { /* ignore */ }

  container.innerHTML = `
    <div style="max-width: 1000px; margin: 0 auto;">

      <!-- Hero -->
      <div class="card" style="
        padding: 20px;
        background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(123,95,255,0.05));
        border-color: rgba(0,212,255,0.3);
        margin-bottom: 24px;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 28px;">📝</div>
          <div>
            <div style="font-size: 18px; font-weight: 700;">Register New FIR</div>
            <div class="dim" style="font-size: 12px;">
              Paste a messy narrative and let Bob extract every field — or fill the form manually.
            </div>
          </div>
        </div>
      </div>

      <!-- Tab switcher -->
      <div style="display: flex; gap: 8px; margin-bottom: 20px;">
        <button class="btn ${currentTab === "smart" ? "btn-primary" : ""}" data-tab="smart" style="padding: 12px 20px; font-size: 13px;">
          🧠 Smart Ingest (Bob extracts everything)
        </button>
        <button class="btn ${currentTab === "manual" ? "btn-primary" : ""}" data-tab="manual" style="padding: 12px 20px; font-size: 13px;">
          ✍️ Manual Entry
        </button>
      </div>

      <div id="tab-content"></div>
    </div>
  `;

  container.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      renderAddFir(container);
    });
  });

  const tabContent = document.getElementById("tab-content");
  if (currentTab === "smart") {
    renderSmartTab(tabContent);
  } else {
    renderManualTab(tabContent, filters);
  }
}


// ===============================================================
// SMART TAB — paste narrative, Bob extracts everything
// ===============================================================
function renderSmartTab(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom: 16px;">
      <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 12px;">RAW NARRATIVE</div>
      <label style="display: block;">
        <textarea id="raw-narrative" class="input" rows="10"
          placeholder="Paste the raw FIR narrative here. Example:
On 15-10-2025 at around 14:15, Ramesh Kumar (32) complained that while he was walking near Central Market in New Delhi, two men on a motorcycle approached him and snatched his phone. Both fled towards the highway. Approximate value 25000. CCTV from a nearby shop may have captured the incident."
          style="width: 100%; font-family: inherit; resize: vertical; font-size: 14px; line-height: 1.6;"></textarea>
      </label>

      <div style="margin-top: 12px; font-size: 12px; color: var(--text-dim);">
        💡 Bob will extract: <b>crime type, MO, weapon, vehicle, victim details, accused, location, time bucket, evidence, loss, priority</b> — and clean the narrative into CFFNS format.
      </div>

      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button class="btn btn-primary" id="btn-smart-extract" style="padding: 12px 22px; font-size: 13px;">
          🧠 Extract & Save with Bob
        </button>
        <button class="btn" id="btn-smart-preview" style="padding: 12px 22px; font-size: 13px;">
          👁️ Preview only (don't save)
        </button>
      </div>
    </div>

    <div id="smart-result"></div>
  `;

  document.getElementById("btn-smart-extract").addEventListener("click", () => runSmartIngest(true));
  document.getElementById("btn-smart-preview").addEventListener("click", () => runSmartIngest(false));
}


async function runSmartIngest(save) {
  const narrative = document.getElementById("raw-narrative").value.trim();
  if (narrative.length < 20) {
    toast("Narrative too short — paste at least one paragraph", "err");
    return;
  }

  const resultEl = document.getElementById("smart-result");
  resultEl.innerHTML = `<div class="loading-screen" style="height: 200px;">
    <div class="spinner"></div>
    <p style="margin-top: 12px;">Bob is reading, cleaning, and classifying…</p>
  </div>`;

  const btnId = save ? "btn-smart-extract" : "btn-smart-preview";
  const btn = document.getElementById(btnId);
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "🤖 Working…";

  try {
    const endpoint = save
      ? "/api/firs/smart-ingest-and-save"
      : "/api/firs/smart-ingest";

    const res = await fetch(BASE + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const ex = data.extracted;
    const cls = data.classification || {};

    renderSmartResult(resultEl, ex, cls, data, save);

    if (save) {
      toast(`✅ FIR ${data.fir_id} created · crime: ${ex.crime_type}`, "ok");
      notifyDataChanged();
      document.getElementById("raw-narrative").value = "";
    } else {
      toast("Preview only — not saved", "ok");
    }
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Extraction failed</div>
      <div class="empty-state-sub">${escapeHtml(err.message)}</div>
    </div>`;
    toast(err.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}


function renderSmartResult(el, ex, cls, data, saved) {
  const confidencePct = Math.round((ex.confidence || 0) * 100);
  const srcLabel = data.bob_source === "bob-live" ? "IBM BOB LIVE" : "BOB (MOCK)";

  const row = (label, value) => `
    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px;">
      <span class="faint" style="font-size: 11px; letter-spacing: 1px;">${escapeHtml(label)}</span>
      <span class="mono" style="color: ${value ? "var(--text)" : "var(--text-faint)"};">${escapeHtml(value || "—")}</span>
    </div>
  `;

  el.innerHTML = `
    <!-- Save banner -->
    ${saved ? `
      <div class="card" style="
        background: linear-gradient(135deg, rgba(0,224,138,0.12), rgba(0,212,255,0.06));
        border-color: rgba(0,224,138,0.4);
        padding: 16px;
        margin-bottom: 16px;
        display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      ">
        <div>
          <div style="font-size: 15px; font-weight: 700; color: var(--success);">✅ FIR ${escapeHtml(data.fir_id)} saved</div>
          <div class="dim" style="font-size: 12px; margin-top: 4px;">Bob extracted ${confidencePct}% confidence · ${srcLabel}</div>
        </div>
        <a href="#/dashboard" class="btn btn-primary" style="text-decoration: none;">View Dashboard →</a>
      </div>
    ` : `
      <div class="card" style="
        background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(123,95,255,0.05));
        border-color: rgba(0,212,255,0.3);
        padding: 12px 16px;
        margin-bottom: 16px;
      ">
        <div style="font-size: 13px;">👁️ <b>Preview mode</b> — Bob extracted the fields below. Click "Extract & Save" to persist.</div>
      </div>
    `}

    <!-- Confidence + Notes -->
    <div class="grid grid-2" style="margin-bottom: 16px;">
      <div class="card">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 6px;">EXTRACTION CONFIDENCE</div>
        <div class="mono" style="font-size: 32px; font-weight: 700; color: ${confidencePct > 70 ? "var(--success)" : confidencePct > 40 ? "var(--warning)" : "var(--danger)"};">
          ${confidencePct}%
        </div>
        <div class="bar-track" style="margin-top: 10px;">
          <div class="bar-fill ${confidencePct > 70 ? '' : confidencePct > 40 ? 'warn' : 'danger'}" style="width: ${confidencePct}%"></div>
        </div>
        <div class="dim" style="font-size: 12px; margin-top: 12px;">${escapeHtml(ex.notes || "")}</div>
      </div>

      <div class="card">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 6px;">BOB CLASSIFICATION</div>
        <div style="display: flex; gap: 12px; margin-bottom: 8px;">
          <div>
            <div class="faint" style="font-size: 9px;">SEVERITY</div>
            <div class="mono" style="font-size: 18px; font-weight: 700; color: ${cls.severity === "Critical" ? "var(--danger)" : cls.severity === "High" ? "var(--danger)" : cls.severity === "Medium" ? "var(--warning)" : "var(--success)"};">
              ${escapeHtml(cls.severity || "—")}
            </div>
          </div>
          <div>
            <div class="faint" style="font-size: 9px;">PRIORITY</div>
            <div class="mono" style="font-size: 18px; font-weight: 700; color: var(--accent);">${escapeHtml(cls.investigation_priority || "—")}</div>
          </div>
        </div>
        ${(cls.suggested_bns_sections || []).length ? `
          <div class="faint" style="font-size: 9px; letter-spacing: 1px; margin-top: 8px;">SUGGESTED BNS</div>
          <div>${(cls.suggested_bns_sections || []).map(s => `<span class="badge badge-accent" style="margin: 2px; font-size: 10px;">${escapeHtml(s)}</span>`).join("")}</div>
        ` : ""}
      </div>
    </div>

    <!-- Extracted fields -->
    <div class="grid grid-2" style="margin-bottom: 16px;">
      <div class="card">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 12px;">CASE</div>
        ${row("Crime Type", ex.crime_type)}
        ${row("BNS Section", ex.bns_section)}
        ${row("State", ex.state)}
        ${row("District", ex.district)}
        ${row("Police Station", ex.police_station)}
        ${row("Location Type", ex.location_type)}
        ${row("Incident Location", ex.incident_location)}
      </div>
      <div class="card">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 12px;">TIMING</div>
        ${row("Incident Date", ex.incident_date)}
        ${row("Incident Time", ex.incident_time)}
        ${row("Time Bucket", ex.time_bucket)}
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom: 16px;">
      <div class="card">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 12px;">VICTIM</div>
        ${row("Complainant", ex.complainant_name)}
        ${row("Age", ex.victim_age)}
        ${row("Gender", ex.victim_gender)}
        ${row("Occupation", ex.victim_occupation)}
        ${row("Profile", ex.victim_profile)}
      </div>
      <div class="card">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 12px;">ACCUSED</div>
        ${row("Name", ex.accused_name)}
        ${row("Alias", ex.accused_alias)}
        ${row("Known at registration", ex.accused_known ? "Yes" : "No")}
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom: 16px;">
      <div class="card">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 12px;">MODUS OPERANDI & TOOLS</div>
        ${row("MO", ex.modus_operandi)}
        ${row("Vehicle", ex.vehicle_used)}
        ${row("Weapon", ex.weapon_or_tool)}
        ${row("Property", ex.property_or_target)}
        ${row("Estimated Loss", ex.estimated_loss_inr ? `₹${ex.estimated_loss_inr.toLocaleString("en-IN")}` : "")}
      </div>
      <div class="card">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 12px;">EVIDENCE & STATUS</div>
        ${row("Evidence Type", ex.evidence_type)}
        ${row("Digital Evidence", ex.digital_evidence)}
        ${row("CCTV", ex.cctv_status)}
        ${row("Witness Count", ex.witness_count)}
        ${row("Case Priority", ex.case_priority)}
      </div>
    </div>

    <!-- Cleaned narrative -->
    <div class="card" style="
      background: linear-gradient(135deg, rgba(123,95,255,0.08), rgba(0,212,255,0.05));
      border-color: rgba(123,95,255,0.35);
      padding: 20px;
    ">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
        <span style="font-size: 16px;">✨</span>
        <span class="mono faint" style="font-size: 10px; letter-spacing: 1.5px;">CLEANED NARRATIVE · ${srcLabel}</span>
      </div>
      <div style="font-size: 14px; line-height: 1.7; color: var(--text);">
        ${escapeHtml(ex.cleaned_narrative)}
      </div>
    </div>
  `;
}


// ===============================================================
// MANUAL TAB — existing form (unchanged from prior version)
// ===============================================================
function renderManualTab(container, filters) {
  container.innerHTML = `
    <form id="addfir-form">
      <!-- Case Identity -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 16px;">CASE IDENTITY</div>
        <div class="grid grid-3" style="gap: 16px;">
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">FIR ID (leave blank to auto-generate)</span>
            <input class="input" name="fir_id" placeholder="FIR-XXXX" style="width: 100%;" />
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Crime Type * (pick or type new)</span>
            <input class="input" name="crime_type" required list="crime-list" placeholder="e.g., Mobile Snatching" style="width: 100%;" />
            <datalist id="crime-list">${CRIME_TYPES.map(c => `<option value="${escapeHtml(c)}">`).join("")}</datalist>
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">BNS / Law Section</span>
            <input class="input" name="bns_section" placeholder="e.g., 304" style="width: 100%;" />
          </label>
        </div>
      </div>

      <!-- Location -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 16px;">LOCATION</div>
        <div class="grid grid-3" style="gap: 16px;">
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">State *</span>
            <input class="input" name="state" required list="states-list" placeholder="e.g., Delhi" style="width: 100%;" />
            <datalist id="states-list">${filters.states.map(s => `<option value="${escapeHtml(s)}">`).join("")}</datalist>
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">District *</span>
            <input class="input" name="district" required list="districts-list" placeholder="e.g., New Delhi" style="width: 100%;" />
            <datalist id="districts-list">${filters.districts.map(d => `<option value="${escapeHtml(d)}">`).join("")}</datalist>
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">City</span>
            <input class="input" name="city" placeholder="e.g., New Delhi" style="width: 100%;" />
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Police Station *</span>
            <input class="input" name="police_station" required list="stations-list" placeholder="e.g., Central Police Station" style="width: 100%;" />
            <datalist id="stations-list">${filters.police_stations.map(p => `<option value="${escapeHtml(p)}">`).join("")}</datalist>
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Location Type</span>
            <select class="select" name="location_type" style="width: 100%;">
              <option value="">—</option>${LOCATION_TYPES.map(l => `<option value="${l}">${l}</option>`).join("")}
            </select>
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Incident Location (free text)</span>
            <input class="input" name="incident_location" placeholder="e.g., Industrial Estate" style="width: 100%;" />
          </label>
        </div>
      </div>

      <!-- Timing -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 16px;">TIMING</div>
        <div class="grid grid-4" style="gap: 16px;">
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Incident Date * (DD-MM-YYYY)</span>
            <input class="input" name="incident_date" required placeholder="01-10-2026" style="width: 100%;" />
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Report Date</span>
            <input class="input" name="report_date" placeholder="optional" style="width: 100%;" />
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Incident Time</span>
            <input class="input" name="incident_time" placeholder="14:15" style="width: 100%;" />
          </label>
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Time Bucket</span>
            <select class="select" name="time_bucket" style="width: 100%;">
              <option value="">—</option>${TIME_BUCKETS.map(t => `<option value="${t}">${t}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <!-- Narrative with Bob auto-gen -->
      <div class="card" style="margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <div class="mono faint" style="font-size: 10px; letter-spacing: 2px;">NARRATIVE *</div>
          <button type="button" class="btn btn-primary" id="btn-gen-narrative" style="padding: 6px 14px; font-size: 12px;">✨ Auto-generate with Bob</button>
        </div>
        <label style="display: block;">
          <textarea class="input" name="fir_narrative" id="fir-narrative-input" required rows="6"
            placeholder="Fill the fields above, then click '✨ Auto-generate with Bob'."
            style="width: 100%; font-family: inherit; resize: vertical;"></textarea>
        </label>
        <div id="narrative-hint" style="margin-top: 8px; font-size: 11px; color: var(--text-faint);">
          💡 Bob will produce a narrative matching the CCTNS FIR format.
        </div>
      </div>

      <!-- Parties -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 16px;">PARTIES</div>
        <div class="grid grid-3" style="gap: 16px;">
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Complainant Name</span><input class="input" name="complainant_name" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Victim Age</span><input class="input" name="victim_age" type="number" min="0" max="120" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Victim Gender</span>
            <select class="select" name="victim_gender" style="width: 100%;"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select>
          </label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Victim Occupation</span><input class="input" name="victim_occupation" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Victim Profile</span><input class="input" name="victim_profile" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Accused Name</span><input class="input" name="accused_name" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Accused Alias</span><input class="input" name="accused_alias" style="width: 100%;" /></label>
          <label style="display: flex; align-items: center; gap: 8px; margin-top: 24px;">
            <input type="checkbox" name="accused_known" />
            <span class="faint" style="font-size: 12px;">Accused known at registration</span>
          </label>
        </div>
      </div>

      <!-- MO -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 16px;">MODUS OPERANDI & TOOLS</div>
        <div class="grid grid-3" style="gap: 16px;">
          <label style="display: block;">
            <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Modus Operandi</span>
            <input class="input" name="modus_operandi" list="mo-list" placeholder="pick or type" style="width: 100%;" />
            <datalist id="mo-list">${MODUS_OPERANDI_OPTIONS.map(m => `<option value="${escapeHtml(m)}">`).join("")}</datalist>
          </label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Vehicle Used</span><input class="input" name="vehicle_used" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Weapon / Tool</span><input class="input" name="weapon_or_tool" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Property / Target</span><input class="input" name="property_or_target" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Estimated Loss (INR)</span><input class="input" name="estimated_loss_inr" type="number" min="0" value="0" style="width: 100%;" /></label>
        </div>
      </div>

      <!-- Evidence -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 16px;">EVIDENCE & STATUS</div>
        <div class="grid grid-3" style="gap: 16px;">
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Evidence Type</span><input class="input" name="evidence_type" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Digital Evidence</span><input class="input" name="digital_evidence" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">CCTV Status</span><input class="input" name="cctv_status" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Witness Count</span><input class="input" name="witness_count" type="number" min="0" value="0" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Case Priority</span>
            <select class="select" name="case_priority" style="width: 100%;">${PRIORITIES.map(p => `<option value="${p}" ${p === "Medium" ? "selected" : ""}>${p}</option>`).join("")}</select>
          </label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Arrest Status</span>
            <select class="select" name="arrest_status" style="width: 100%;"><option value="">—</option>${ARREST_STATUS.map(a => `<option value="${a}">${a}</option>`).join("")}</select>
          </label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Recovery Status</span><input class="input" name="recovery_status" style="width: 100%;" /></label>
          <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Investigation Status</span>
            <select class="select" name="investigation_status" style="width: 100%;">${INVESTIGATION.map(i => `<option value="${i}">${i}</option>`).join("")}</select>
          </label>
        </div>
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end; padding-bottom: 32px;">
        <button type="button" class="btn btn-ghost" id="addfir-reset">Clear Form</button>
        <button type="submit" class="btn btn-primary" id="addfir-submit">✅ Register FIR</button>
      </div>
    </form>
  `;

  const form = document.getElementById("addfir-form");
  form.addEventListener("submit", onSubmit);
  document.getElementById("addfir-reset").addEventListener("click", () => form.reset());

  document.getElementById("btn-gen-narrative").addEventListener("click", async () => {
    const btn = document.getElementById("btn-gen-narrative");
    const textarea = document.getElementById("fir-narrative-input");
    const hint = document.getElementById("narrative-hint");

    const fd = new FormData(form);
    const payload = {};
    for (const [k, v] of fd.entries()) {
      if (v === "" || k === "fir_narrative") continue;
      if (["victim_age", "estimated_loss_inr", "witness_count", "evidence_item_count"].includes(k)) {
        payload[k] = parseInt(v, 10) || 0;
      } else if (k === "accused_known") {
        payload[k] = true;
      } else {
        payload[k] = v;
      }
    }

    if (!payload.crime_type || !payload.state || !payload.police_station || !payload.incident_date) {
      toast("Fill Crime Type, State, Police Station, and Incident Date first", "err");
      return;
    }

    btn.disabled = true;
    btn.textContent = "🤖 Bob is writing…";
    hint.innerHTML = `<span style="color: var(--accent);">⏳ Bob is analysing fields…</span>`;

    try {
      const res = await fetch(`${BASE}/api/firs/generate-narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      textarea.value = data.narrative;
      hint.innerHTML = `<span style="color: var(--success);">✅ Generated. Edit if needed, then submit.</span>`;
      toast("Narrative generated", "ok");
    } catch (err) {
      hint.innerHTML = `<span style="color: var(--danger);">❌ ${escapeHtml(err.message)}</span>`;
      toast(err.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ Auto-generate with Bob";
    }
  });
}


async function onSubmit(evt) {
  evt.preventDefault();
  const form = evt.target;
  const btn = document.getElementById("addfir-submit");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const fd = new FormData(form);
  const payload = {};
  for (const [k, v] of fd.entries()) {
    if (v === "") continue;
    if (["victim_age", "estimated_loss_inr", "witness_count", "evidence_item_count"].includes(k)) {
      payload[k] = parseInt(v, 10) || 0;
    } else if (k === "accused_known") {
      payload[k] = true;
    } else {
      payload[k] = v;
    }
  }
  payload.accused_known = form.querySelector('[name="accused_known"]').checked;

  try {
    const res = await fetch(`${BASE}/api/firs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    toast(`✅ FIR ${data.fir_id} registered`, "ok");
    notifyDataChanged();
    form.reset();
  } catch (err) {
    toast(`Failed: ${err.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "✅ Register FIR";
  }
}