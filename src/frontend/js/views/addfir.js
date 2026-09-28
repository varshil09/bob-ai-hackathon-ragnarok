/**
 * CHAKRA — Add FIR
 * Bob generates the narrative + classifies crime type.
 */
import { api } from "../api.js";
import { escapeHtml, toast, notifyDataChanged } from "../app.js";


const BASE = "http://127.0.0.1:8000";

// Fallback taxonomy (until fetched)
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


export async function renderAddFir(container) {
  // ⭐ Fetch live taxonomy + filter options
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
              Fill the structured fields below. Bob will auto-write the FIR narrative in CCTNS format and classify the crime type.
            </div>
          </div>
        </div>
      </div>

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
              <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Crime Type * (pick or type a new one)</span>
              <input class="input" name="crime_type" required list="crime-list" placeholder="e.g., Mobile Snatching" style="width: 100%;" />
              <datalist id="crime-list">
                ${CRIME_TYPES.map(c => `<option value="${escapeHtml(c)}">`).join("")}
              </datalist>
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
                <option value="">—</option>
                ${LOCATION_TYPES.map(l => `<option value="${l}">${l}</option>`).join("")}
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
              <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Report Date (optional)</span>
              <input class="input" name="report_date" placeholder="defaults to incident date" style="width: 100%;" />
            </label>
            <label style="display: block;">
              <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Incident Time</span>
              <input class="input" name="incident_time" placeholder="14:15" style="width: 100%;" />
            </label>
            <label style="display: block;">
              <span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Time Bucket</span>
              <select class="select" name="time_bucket" style="width: 100%;">
                <option value="">—</option>
                ${TIME_BUCKETS.map(t => `<option value="${t}">${t}</option>`).join("")}
              </select>
            </label>
          </div>
        </div>

        <!-- Narrative with Bob auto-gen -->
        <div class="card" style="margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <div class="mono faint" style="font-size: 10px; letter-spacing: 2px;">NARRATIVE *</div>
            <button type="button" class="btn btn-primary" id="btn-gen-narrative" style="padding: 6px 14px; font-size: 12px;">
              ✨ Auto-generate with Bob
            </button>
          </div>
          <label style="display: block;">
            <textarea class="input" name="fir_narrative" id="fir-narrative-input" required rows="6"
              placeholder="Fill the fields above, then click '✨ Auto-generate with Bob' to write a formal FIR narrative. You can edit it afterward."
              style="width: 100%; font-family: inherit; resize: vertical;"></textarea>
          </label>
          <div id="narrative-hint" style="margin-top: 8px; font-size: 11px; color: var(--text-faint);">
            💡 Bob will produce a narrative matching the CCTNS FIR format — same style as the existing dataset.
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

        <!-- MO & Tools -->
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

        <!-- Evidence & Status -->
        <div class="card" style="margin-bottom: 16px;">
          <div class="mono faint" style="font-size: 10px; letter-spacing: 2px; margin-bottom: 16px;">EVIDENCE & STATUS</div>
          <div class="grid grid-3" style="gap: 16px;">
            <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Evidence Type</span><input class="input" name="evidence_type" style="width: 100%;" /></label>
            <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Digital Evidence</span><input class="input" name="digital_evidence" style="width: 100%;" /></label>
            <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">CCTV Status</span><input class="input" name="cctv_status" style="width: 100%;" /></label>
            <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Witness Count</span><input class="input" name="witness_count" type="number" min="0" value="0" style="width: 100%;" /></label>
            <label style="display: block;"><span class="faint" style="font-size: 11px; display: block; margin-bottom: 4px;">Evidence Items</span><input class="input" name="evidence_item_count" type="number" min="0" value="0" style="width: 100%;" /></label>
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
    </div>
  `;

  const form = document.getElementById("addfir-form");
  form.addEventListener("submit", onSubmit);
  document.getElementById("addfir-reset").addEventListener("click", () => form.reset());

  // ⭐ Bob narrative generation
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
    hint.innerHTML = `<span style="color: var(--accent);">⏳ Bob is analysing fields and drafting the narrative…</span>`;

    try {
      const res = await fetch(`${BASE}/api/firs/generate-narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      textarea.value = data.narrative;
      hint.innerHTML = `<span style="color: var(--success);">✅ Generated via ${data.bob_source === "bob-live" ? "IBM Bob Live" : "Bob (mock)"}. Edit if needed, then submit.</span>`;
      toast(`Narrative generated`, "ok");
    } catch (err) {
      hint.innerHTML = `<span style="color: var(--danger);">❌ Generation failed: ${escapeHtml(err.message)}</span>`;
      toast(`Generation failed: ${err.message}`, "err");
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
    toast(`✅ FIR ${data.fir_id} registered — crime classified as "${data.crime_type}"`, "ok");

    // ⭐ Tell the rest of the app to refresh
    notifyDataChanged();

    const banner = document.createElement("div");
    banner.className = "card";
    banner.style.cssText = "background: linear-gradient(135deg, rgba(0,224,138,0.1), rgba(0,212,255,0.05)); border-color: rgba(0,224,138,0.4); margin-bottom: 16px; padding: 16px;";
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div>
          <div style="font-size: 14px; font-weight: 600; color: var(--success);">✅ FIR ${escapeHtml(data.fir_id)} created</div>
          <div class="dim" style="font-size: 12px; margin-top: 4px;">Crime type: <b>${escapeHtml(data.crime_type)}</b> · Dashboard, Explorer, Repeat Offenders will refresh automatically.</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="#/dashboard" class="btn btn-primary" style="text-decoration: none;">View Dashboard →</a>
        </div>
      </div>
    `;
    form.parentElement.insertBefore(banner, form);
    form.reset();
    setTimeout(() => banner.remove(), 8000);
  } catch (err) {
    toast(`Failed: ${err.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "✅ Register FIR";
  }
}