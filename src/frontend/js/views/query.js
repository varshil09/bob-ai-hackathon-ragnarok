/**
 * CHAKRA — Ask CHAKRA
 */
import { escapeHtml, toast } from "../app.js";


const SUGGESTIONS = [
  "Show me all extortion cases in Jodhpur",
  "Who are the top offenders?",
  "Which police station has the most cyber fraud?",
  "Any mobile snatching cases in Delhi?",
  "What time do burglaries happen?",
];


export async function renderQuery(container) {
  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <div class="card" style="
        padding: 32px;
        background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(123,95,255,0.06));
        border-color: rgba(0,212,255,0.3);
        text-align: center;
      ">
        <div style="font-size: 48px; margin-bottom: 8px;">💬</div>
        <div style="font-size: 22px; font-weight: 700;">Ask CHAKRA</div>
        <div class="dim" style="font-size: 13px; margin-top: 6px;">
          Natural-language intelligence queries over your FIR dataset
        </div>
      </div>

      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <input id="q-input" class="input" type="text"
          placeholder="e.g. Show me all mobile snatching in Delhi with motorcycle approach…"
          style="flex: 1; padding: 14px 18px; font-size: 14px;" autofocus />
        <button class="btn btn-primary" id="q-submit" style="padding: 14px 24px; font-size: 13px;">Ask →</button>
      </div>

      <div style="margin-top: 16px;">
        <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">TRY ASKING</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${SUGGESTIONS.map(s => `<button class="btn btn-ghost" data-suggest="${escapeHtml(s)}" style="font-size: 12px;">${escapeHtml(s)}</button>`).join("")}
        </div>
      </div>

      <div id="q-response" style="margin-top: 32px;"></div>
    </div>
  `;

  const input = document.getElementById("q-input");
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") askQuestion(); });
  document.getElementById("q-submit").addEventListener("click", askQuestion);

  document.querySelectorAll("[data-suggest]").forEach(btn => {
    btn.addEventListener("click", () => { input.value = btn.dataset.suggest; askQuestion(); });
  });
}


async function askQuestion() {
  const input = document.getElementById("q-input");
  const question = input.value.trim();
  if (!question) return;

  const response = document.getElementById("q-response");
  response.innerHTML = `<div class="loading-screen" style="height: 200px;"><div class="spinner"></div><p style="margin-top: 12px;">Bob is thinking…</p></div>`;

  try {
    const res = await fetch("http://127.0.0.1:8000/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }).then(r => r.json());

    const srcLabel = (res.bob_source === "bob-live" || res.bob_source === "watsonx") ? "LIVE" : "MOCK";
    const sourcesHtml = (res.sources || []).length
      ? `<div style="margin-top: 16px;">
          <div class="faint" style="font-size: 10px; letter-spacing: 1.5px; margin-bottom: 8px;">MATCHING FIRs (${res.sources.length})</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${res.sources.map(s => `<span class="badge badge-mono">${escapeHtml(s.fir_id)} · ${escapeHtml(s.crime_type || "")}</span>`).join("")}
          </div>
        </div>`
      : "";

    response.innerHTML = `
      <div class="card" style="
        background: linear-gradient(135deg, rgba(123,95,255,0.08), rgba(0,212,255,0.05));
        border-color: rgba(123,95,255,0.35);
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="font-size: 16px;">🤖</span>
          <span class="mono faint" style="font-size: 10px; letter-spacing: 1.5px;">BOB RESPONSE · ${srcLabel}</span>
        </div>
        <div style="font-size: 14px; line-height: 1.7; color: var(--text);">
          ${formatAnswer(res.answer)}
        </div>
        ${sourcesHtml}
      </div>
    `;
  } catch (err) {
    response.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Query failed</div>
      <div class="empty-state-sub">${escapeHtml(err.message)}</div>
    </div>`;
    toast(err.message, "err");
  }
}


function formatAnswer(text) {
  if (!text) return "—";
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br/>");
}