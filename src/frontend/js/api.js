/**
 * CHAKRA — API Client (cache-busted)
 */

const BASE = "http://127.0.0.1:8000";

async function request(path, options = {}) {
  // ⭐ Cache-bust every GET
  const sep = path.includes("?") ? "&" : "?";
  const bust = `${path}${sep}_t=${Date.now()}`;

  const res = await fetch(BASE + bust, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = err.detail || err.error || detail;
    } catch { /* ignore */ }
    throw new Error(`${res.status} — ${detail}`);
  }
  return res.json();
}

export const api = {
  health:        () => request("/api/health"),
  filters:       () => request("/api/filters"),
  taxonomy:      () => request("/api/crime-taxonomy"),
  dashboard:     () => request("/api/dashboard"),

  listFirs: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v != null)
    ).toString();
    return request(`/api/firs?${qs}`);
  },
  getFir:      (id) => request(`/api/firs/${encodeURIComponent(id)}`),
  getEntities: (id) => request(`/api/firs/${encodeURIComponent(id)}/entities`),

  repeatOffenders: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/repeat-offenders?${qs}`);
  },
  aliasLinks: () => request("/api/alias-links"),

  stations:       () => request("/api/stations"),
  stationSummary: (name) => request(`/api/stations/${encodeURIComponent(name)}/summary`),

  network: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/network?${qs}`);
  },

  ask: (q) => request("/api/ask", {
    method: "POST",
    body: JSON.stringify({ question: q, context: [] }),
  }),
};