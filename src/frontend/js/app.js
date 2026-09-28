/**
 * CHAKRA — App Bootstrap
 */
import { api } from "./api.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderFirs }      from "./views/firs.js";
import { renderRepeat }    from "./views/repeat.js";
import { renderNetwork }   from "./views/network3d.js";
import { renderStations }  from "./views/stations.js";
import { renderQuery }     from "./views/query.js";
import { renderAddFir }    from "./views/addfir.js";


export const state = {
  view: "dashboard",
  filters: null,
  bob: { mode: "mock" },
  cache: {},
};


const VIEWS = {
  dashboard: { render: renderDashboard, title: "Dashboard",         sub: "Real-time crime intelligence overview" },
  firs:      { render: renderFirs,      title: "FIR Explorer",      sub: "Search, filter and inspect FIRs across India" },
  repeat:    { render: renderRepeat,    title: "Repeat Offenders",  sub: "Cross-FIR fingerprint clusters & alias trails" },
  network:   { render: renderNetwork,   title: "Network Graph",     sub: "3D criminal relationship map" },
  stations:  { render: renderStations,  title: "Police Stations",   sub: "Ranked by FIR volume with AI briefings" },
  query:     { render: renderQuery,     title: "Ask CHAKRA",        sub: "Natural-language intelligence queries" },
  addfir:    { render: renderAddFir,    title: "Register FIR",      sub: "Create a new FIR — Bob writes the narrative" },
};


// ===============================================================
// Global data-change event
// ===============================================================
export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent("chakra:data-changed"));
}


async function navigate(view) {
  if (!VIEWS[view]) view = "dashboard";
  state.view = view;

  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("is-active", el.dataset.view === view);
  });

  document.getElementById("page-title").textContent = VIEWS[view].title;
  document.getElementById("page-sub").textContent   = VIEWS[view].sub;

  const container = document.getElementById("view");
  container.innerHTML = `<div class="loading-screen">
    <div class="spinner"></div><p>Loading ${VIEWS[view].title}…</p>
  </div>`;

  try {
    await VIEWS[view].render(container);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Failed to load</div>
      <div class="empty-state-sub">${escapeHtml(err.message)}</div>
    </div>`;
    toast(err.message, "err");
  }

  window.location.hash = `#/${view}`;
}


export function toast(msg, kind = "") {
  const c = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(400px)";
    setTimeout(() => el.remove(), 250);
  }, 3200);
}


export function openModal(html) {
  const backdrop = document.getElementById("modal-backdrop");
  document.getElementById("modal-body").innerHTML = html;
  backdrop.hidden = false;
}
export function closeModal() {
  document.getElementById("modal-backdrop").hidden = true;
}


export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatNumber(n) {
  if (n == null) return "–";
  return Number(n).toLocaleString("en-IN");
}

export function formatINR(n) {
  if (n == null || n === 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)} K`;
  return `₹${n}`;
}

export function priorityClass(p) {
  if (p === "High")   return "priority-High";
  if (p === "Medium") return "priority-Medium";
  return "priority-Low";
}


async function bootstrap() {
  try {
    const h = await api.health();
    state.bob.mode = h.mock_bob ? "mock" : "LIVE";
    const dot = document.getElementById("status-dot");
    dot.classList.add("ok");
    document.getElementById("status-text").textContent = `${formatNumber(h.fir_count)} FIRs loaded`;
    document.getElementById("bob-mode").textContent = state.bob.mode;
  } catch (err) {
    document.getElementById("status-dot").classList.add("err");
    document.getElementById("status-text").textContent = "Backend offline";
    toast("Cannot reach CHAKRA backend at http://127.0.0.1:8000", "err");
  }

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.view));
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });

  document.getElementById("global-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.value.trim()) {
      sessionStorage.setItem("chakra.search", e.target.value.trim());
      navigate("firs");
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

   // ⭐ Listen for hash changes (used by dashboard clicks)
  window.addEventListener("hashchange", () => {
    const h = (window.location.hash || "").replace(/^#\/?/, "");
    if (VIEWS[h] && state.view !== h) {
      navigate(h);
    }
  });

  const hash = (window.location.hash || "").replace(/^#\/?/, "");
  navigate(VIEWS[hash] ? hash : "dashboard");
}


if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}