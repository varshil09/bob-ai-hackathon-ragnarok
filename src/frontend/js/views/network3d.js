/**
 * CHAKRA — Network Graph (2D, vis-network)
 * - Plain-text tooltips (no HTML rendering issues)
 * - Dynamic node sizing based on graph density
 * - Physics tuned for legibility at any scale
 * - Full-corpus search (finds any FIR, not just loaded ones)
 */
import { escapeHtml, formatNumber, toast } from "../app.js";


let network = null;
let currentData = null;
let currentMode = "all";
let highlightType = "all";
let selectedNodeId = null;
let showLabels = true;
let nodeLimit = 200;
let searchMatches = [];


const STYLES = {
  accused: { color: "#ff3860", shape: "dot",      size: 14, label: "Accused" },
  fir:     { color: "#00d4ff", shape: "box",      size: 10, label: "FIR" },
  state:   { color: "#00e08a", shape: "triangle", size: 18, label: "State" },
  mo:      { color: "#ffb700", shape: "diamond",  size: 14, label: "Modus Operandi" },
  alias:   { color: "#7b5fff", shape: "star",     size: 12, label: "Alias" },
};
const DEFAULT_STYLE = { color: "#8b96b8", shape: "dot", size: 10, label: "Node" };


export async function renderNetwork(container) {
  if (typeof vis === "undefined") {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">vis-network library not loaded</div>
      <div class="empty-state-sub">Add the vis-network script tag to index.html.</div>
    </div>`;
    return;
  }

  container.innerHTML = `
    <div style="display: flex; gap: 8px; margin-bottom: 16px; align-items: center; flex-wrap: wrap;">
      <button class="btn ${currentMode === "all" ? "btn-primary" : ""}" data-mode="all">🌐 All-FIR Graph</button>
      <button class="btn ${currentMode === "repeat" ? "btn-primary" : ""}" data-mode="repeat">🔁 Repeat-Offender Graph</button>
      <div style="flex: 1;"></div>
      <label class="mono faint" style="font-size: 11px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
        <input type="checkbox" id="tgl-labels" ${showLabels ? "checked" : ""} />
        Show labels
      </label>
      <label class="mono faint" style="font-size: 11px; display: flex; align-items: center; gap: 6px;">
        Load:
        <input type="number" id="input-limit" min="50" max="2000" step="50" value="${nodeLimit}"
               class="input" style="width: 80px; padding: 4px 8px; font-size: 11px;" />
        <button class="btn" id="btn-apply-limit" style="padding: 4px 10px; font-size: 11px;">Apply</button>
      </label>
    </div>

    <div class="card" style="
      background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(123,95,255,0.06));
      border-color: rgba(0,212,255,0.3); padding: 16px; margin-bottom: 16px;
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 280px;">
          <div class="mono faint" style="font-size: 11px; letter-spacing: 2px;" id="graph-title">CRIMINAL NETWORK GRAPH</div>
          <div style="font-size: 18px; font-weight: 700; margin-top: 4px;" id="graph-subtitle">Interactive 2D relationship map</div>
          <div class="dim" style="font-size: 12px; margin-top: 2px;">
            Drag to pan · Scroll to zoom · <b>Click a node to see its connections</b>
          </div>
        </div>

        <div style="width: 480px; display: flex; flex-direction: column; gap: 8px;" id="search-wrap">
          <!-- ⭐ Bob Smart Search -->
          <div style="display: flex; gap: 6px;">
            <div class="search-mini" style="flex: 1; border-color: rgba(123,95,255,0.4);">
              <span class="search-icon">🤖</span>
              <input id="bob-search" type="text" placeholder='Ask Bob: "cyber fraudsters in Maharashtra"' autocomplete="off" />
            </div>
            <button class="btn btn-primary" id="btn-bob-search" style="padding: 8px 12px; font-size: 11px; white-space: nowrap;">
              Ask Bob
            </button>
          </div>

          <!-- Regular search -->
          <div style="display: flex; gap: 6px;">
            <div class="search-mini" style="flex: 1;">
              <span class="search-icon">🔎</span>
              <input id="graph-search" type="text" placeholder="Search exact FIR, accused, state, MO…" autocomplete="off" />
            </div>
            <button class="btn" id="btn-load-match" style="padding: 8px 12px; font-size: 11px; white-space: nowrap;">
              🎯 Load
            </button>
          </div>

          <div id="search-results" style="
            position: absolute; top: 100%; left: 0; right: 0; margin-top: 6px;
            background: var(--bg-2); border: 1px solid var(--border-glow);
            border-radius: var(--radius-sm); box-shadow: 0 12px 32px rgba(0,0,0,0.6);
            max-height: 320px; overflow-y: auto; z-index: 100; display: none;
          "></div>
        </div>

        <div style="display: flex; gap: 20px;" id="graph-stats"></div>
      </div>
    </div>

    <div class="card" style="padding: 14px 18px; margin-bottom: 12px; display: flex; gap: 24px; flex-wrap: wrap; align-items: center; font-size: 12px;" id="graph-legend"></div>
    <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center;" id="graph-filters"></div>

    <div id="graph-selection" class="card" style="
      padding: 12px 16px; margin-bottom: 12px; display: none;
      background: linear-gradient(135deg, rgba(0,212,255,0.1), rgba(123,95,255,0.06));
      border-color: rgba(0,212,255,0.4);
    ">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 20px;">🎯</span>
          <div>
            <div style="font-size: 14px; font-weight: 600;" id="sel-label">—</div>
            <div class="dim" style="font-size: 11px;" id="sel-meta">—</div>
          </div>
        </div>
        <button class="btn" id="sel-clear">✕ Clear selection</button>
      </div>
    </div>

    <div id="graph-2d" style="
      width: 100%; height: calc(100vh - 520px); min-height: 620px;
      background: radial-gradient(ellipse at center, #0a0e27 0%, #05080f 100%);
      border: 1px solid var(--border); border-radius: var(--radius);
      overflow: hidden; position: relative;
    "></div>
  `;

  container.querySelectorAll("[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentMode = btn.dataset.mode;
      highlightType = "all";
      selectedNodeId = null;
      renderNetwork(container);
    });
  });

  document.getElementById("tgl-labels").addEventListener("change", (e) => {
    showLabels = e.target.checked;
    if (network) {
      const nodesDS = network.body.data.nodes;
      const all = nodesDS.get();
      nodesDS.update(all.map(n => ({
        ...n,
        label: showLabels ? (n.__meta ? truncateLabel(n.__meta.label, 20) : n.label) : "",
      })));
    }
  });

  document.getElementById("btn-apply-limit").addEventListener("click", () => {
    const v = parseInt(document.getElementById("input-limit").value, 10);
    if (!v || v < 50) { toast("Enter at least 50 nodes", "err"); return; }
    if (v > 2000) { toast("Max 2000 nodes for performance", "err"); return; }
    nodeLimit = v;
    renderNetwork(container);
  });

  document.getElementById("btn-load-match").addEventListener("click", () => {
    const q = document.getElementById("graph-search").value.trim();
    if (!q) { toast("Type something to search", "err"); return; }
    loadByQuery(q);
  });

  document.getElementById("sel-clear").addEventListener("click", () => {
    selectedNodeId = null;
    document.getElementById("graph-selection").style.display = "none";
    applyHighlight();
  });

  setupSearch();
  // ⭐ Wire Bob Smart Search
  document.getElementById("btn-bob-search").addEventListener("click", runBobSearch);
  document.getElementById("bob-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runBobSearch();
  });

  try {
    if (currentMode === "repeat") {
      currentData = await fetch(`http://127.0.0.1:8000/api/network/repeat?min_confidence=0.7&top_clusters=15`).then(r => r.json());
    } else {
      currentData = await fetch(`http://127.0.0.1:8000/api/network?max_nodes=${nodeLimit}`).then(r => r.json());
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <div class="empty-state-title">Failed to load graph</div>
      <div class="empty-state-sub">${escapeHtml(e.message)}</div>
    </div>`;
    return;
  }

  renderLegend();
  renderFilters();
  renderStats();
  renderGraph(currentData.nodes, currentData.edges);

  window.addEventListener("chakra:data-changed", () => {
    if (document.getElementById("graph-2d")) renderNetwork(container).catch(() => {});
  }, { once: true });
}


// ===============================================================
// Load by query — searches ALL FIRs
// ===============================================================
async function loadByQuery(q) {
  toast(`Loading nodes matching "${q}"…`);
  try {
    const res = await fetch(`http://127.0.0.1:8000/api/network?search=${encodeURIComponent(q)}&max_nodes=500`).then(r => r.json());
    if (!res.nodes || res.nodes.length === 0) {
      toast(`No nodes match "${q}"`, "err");
      return;
    }
    currentData = res;
    renderStats();
    renderGraph(res.nodes, res.edges);
    toast(`Loaded ${res.counts.nodes} nodes`, "ok");
  } catch (e) {
    toast(`Search failed: ${e.message}`, "err");
  }
}


// ===============================================================
// Search autocomplete
// ===============================================================
function setupSearch() {
  const input = document.getElementById("graph-search");
  const results = document.getElementById("search-results");

  input.addEventListener("input", debounce(async (e) => {
    const q = e.target.value.trim();
    if (!q || q.length < 2) { results.style.display = "none"; searchMatches = []; return; }

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/network/search?q=${encodeURIComponent(q)}&limit=30`).then(r => r.json());
      searchMatches = res.results || [];
    } catch { searchMatches = []; }

    if (!searchMatches.length) {
      results.innerHTML = `<div style="padding: 12px 16px; color: var(--text-faint); font-size: 12px;">No matches — try "🎯 Load match" for full search</div>`;
      results.style.display = "block";
      return;
    }

    results.innerHTML = searchMatches.map((n, i) => {
      const style = STYLES[n.type] || DEFAULT_STYLE;
      return `
        <div class="search-result-row" data-idx="${i}" style="
          padding: 10px 14px; cursor: pointer;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 10px;
        ">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${style.color}; box-shadow: 0 0 8px ${style.color}; flex-shrink: 0;"></span>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(n.label)}</div>
            <div class="faint mono" style="font-size: 10px;">${style.label} · ${escapeHtml(n.hint || "")}</div>
          </div>
        </div>
      `;
    }).join("");
    results.style.display = "block";

    results.querySelectorAll(".search-result-row").forEach(row => {
      row.addEventListener("click", () => {
        const n = searchMatches[parseInt(row.dataset.idx, 10)];
        input.value = n.label;
        results.style.display = "none";
        loadByQuery(n.label);
      });
    });
  }, 300));

  input.addEventListener("blur", () => {
    setTimeout(() => { results.style.display = "none"; }, 200);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = input.value.trim();
      if (q) document.getElementById("btn-load-match").click();
    }
    if (e.key === "Escape") { input.value = ""; results.style.display = "none"; }
  });
}


function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}


// ===============================================================
// Legend / filters / stats
// ===============================================================
function renderLegend() {
  const el = document.getElementById("graph-legend");
  const order = currentMode === "repeat"
    ? ["accused", "mo", "alias"]
    : ["accused", "fir", "state", "mo"];

  el.innerHTML = `
    <span class="faint mono" style="font-size: 10px; letter-spacing: 1.5px;">LEGEND</span>
    ${order.map(key => {
      const s = STYLES[key];
      return `<span style="display: flex; align-items: center; gap: 8px;">
        ${shapeSvg(s.shape, s.color, 18)}
        <span style="color: var(--text-dim);">${s.label}</span>
      </span>`;
    }).join("")}
  `;
}


function shapeSvg(shape, color, size = 16) {
  const s = size, half = s / 2;
  const uid = `glow-${shape}-${Math.random().toString(36).slice(2, 8)}`;
  const glow = `<defs><filter id="${uid}"><feGaussianBlur stdDeviation="1.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const f = `filter="url(#${uid})"`;
  switch (shape) {
    case "box":      return `<svg width="${s}" height="${s}" style="display:inline-block;vertical-align:middle;">${glow}<rect x="2" y="2" width="${s - 4}" height="${s - 4}" rx="2" fill="${color}" ${f}/></svg>`;
    case "diamond":  return `<svg width="${s}" height="${s}" style="display:inline-block;vertical-align:middle;">${glow}<polygon points="${half},1 ${s - 1},${half} ${half},${s - 1} 1,${half}" fill="${color}" ${f}/></svg>`;
    case "triangle": return `<svg width="${s}" height="${s}" style="display:inline-block;vertical-align:middle;">${glow}<polygon points="${half},1 ${s - 2},${s - 2} 2,${s - 2}" fill="${color}" ${f}/></svg>`;
    case "star":     return `<svg width="${s}" height="${s}" style="display:inline-block;vertical-align:middle;">${glow}<polygon points="${half},1 ${half + 2},${half - 2} ${s - 1},${half - 2} ${half + 3},${half + 2} ${s - 2},${s - 2} ${half},${half + 3} 2,${s - 2} ${half - 3},${half + 2} 1,${half - 2} ${half - 2},${half - 2}" fill="${color}" ${f}/></svg>`;
    default:         return `<svg width="${s}" height="${s}" style="display:inline-block;vertical-align:middle;">${glow}<circle cx="${half}" cy="${half}" r="${half - 2}" fill="${color}" ${f}/></svg>`;
  }
}


function renderFilters() {
  const el = document.getElementById("graph-filters");
  const chips = currentMode === "repeat"
    ? [["all", "All"], ["accused", "👤 Accused"], ["mo", "🔁 MO Clusters"], ["alias", "🎭 Aliases"]]
    : [["all", "All"], ["accused", "👤 Accused"], ["fir", "📁 FIRs"], ["state", "🗺️ States"], ["mo", "🔁 MO"]];

  el.innerHTML = chips.map(([val, label]) => `
    <button class="btn ${highlightType === val && !selectedNodeId ? "is-active" : ""}" data-htype="${val}">${label}</button>
  `).join("") + `<div style="flex: 1;"></div>
    <button class="btn btn-ghost" id="net-reset">🔄 Fit to Screen</button>`;

  el.querySelectorAll("[data-htype]").forEach(btn => {
    btn.addEventListener("click", () => {
      highlightType = btn.dataset.htype;
      selectedNodeId = null;
      document.getElementById("graph-selection").style.display = "none";
      renderFilters();
      applyHighlight();
    });
  });

  document.getElementById("net-reset").addEventListener("click", () => {
    if (network) {
      const nCount = network.body.data.nodes.length;
      const scale = nCount <= 100 ? 1.8
                  : nCount <= 300 ? 1.4
                  : nCount <= 600 ? 1.0
                  : nCount <= 1200 ? 0.75
                  : 0.55;
      network.moveTo({
        position: { x: 0, y: 0 },
        scale,
        animation: { duration: 600, easingFunction: "easeInOutQuad" },
      });
    }
    selectedNodeId = null;
    document.getElementById("graph-selection").style.display = "none";
    applyHighlight();
  });
}


function renderStats() {
  const el = document.getElementById("graph-stats");
  const c = currentData.counts || {};

  const stats = currentMode === "repeat"
    ? [{ v: c.accused || 0, l: "ACCUSED", col: "var(--danger)" },
       { v: c.clusters || 0, l: "CLUSTERS", col: "var(--warning)" },
       { v: c.nodes || 0, l: "NODES", col: "var(--accent)" }]
    : [{ v: c.nodes || 0, l: "NODES", col: "var(--accent)" },
       { v: c.edges || 0, l: "EDGES", col: "var(--accent-2)" }];

  el.innerHTML = stats.map(s => `
    <div style="text-align: center;">
      <div class="mono" style="font-size: 24px; font-weight: 700; color: ${s.col};">${formatNumber(s.v)}</div>
      <div class="faint" style="font-size: 10px; letter-spacing: 1.5px;">${s.l}</div>
    </div>
  `).join("");

  document.getElementById("graph-title").textContent = currentMode === "repeat" ? "REPEAT-OFFENDER NETWORK" : "CRIMINAL NETWORK GRAPH";
  document.getElementById("graph-subtitle").textContent = currentMode === "repeat" ? "Clusters linked by shared modus operandi" : "All FIRs, accused, states, and MOs";
}


// ===============================================================
// ⭐ DYNAMIC SIZING — scale nodes based on graph density
// ===============================================================
function computeScale(nodeCount) {
  // At 50 nodes → full size (1.0)
  // At 200 nodes → 0.75
  // At 500 nodes → 0.5
  // At 1000 nodes → 0.35
  // At 2000 nodes → 0.25
  if (nodeCount <= 50) return 2.5;
  if (nodeCount <= 100) return 2.2;
  if (nodeCount <= 200) return 1.75;
  if (nodeCount <= 350) return 1.6;
  if (nodeCount <= 600) return 1.3;
  if (nodeCount <= 1000) return 1.0;
  return 0.3;
}

function computeFontSize(nodeCount) {
  if (nodeCount <= 50) return 25;
  if (nodeCount <= 100) return 23;
  if (nodeCount <= 200) return 22;
  if (nodeCount <= 350) return 21;
  if (nodeCount <= 600) return 20;
  if (nodeCount <= 1000) return 9;
  return 8;
}

function computePhysics(nodeCount) {
  if (nodeCount <= 100) {
    return {
      gravitationalConstant: -6000,
      centralGravity: 0.4,
      springLength: 130,
      springConstant: 0.05,
      damping: 0.25,
      avoidOverlap: 0.5,
    };
  }
  if (nodeCount <= 300) {
    return {
      gravitationalConstant: -10000,
      centralGravity: 0.25,
      springLength: 150,
      springConstant: 0.04,
      damping: 0.3,
      avoidOverlap: 0.6,
    };
  }
  if (nodeCount <= 600) {
    return {
      gravitationalConstant: -18000,
      centralGravity: 0.15,
      springLength: 170,
      springConstant: 0.03,
      damping: 0.35,
      avoidOverlap: 0.7,
    };
  }
  if (nodeCount <= 1200) {
    return {
      gravitationalConstant: -30000,
      centralGravity: 0.08,
      springLength: 200,
      springConstant: 0.02,
      damping: 0.4,
      avoidOverlap: 0.9,
    };
  }
  return {
    gravitationalConstant: -50000,
    centralGravity: 0.05,
    springLength: 230,
    springConstant: 0.015,
    damping: 0.5,
    avoidOverlap: 1.0,
  };
}

// ===============================================================
// Render graph — physics back ON with smooth, calm motion
// ===============================================================
function renderGraph(nodes, edges) {
  const container = document.getElementById("graph-2d");

  if (network) {
    network.destroy();
    network = null;
  }

  const nodeCount = nodes.length;
  const sizeScale = computeScale(nodeCount);
  const fontSize  = computeFontSize(nodeCount);
  const physics   = computePhysics(nodeCount);

  // Build neighbor map
  const neighborMap = new Map();
  for (const e of edges) {
    const s = typeof e.source === "object" ? e.source.id : e.source;
    const t = typeof e.target === "object" ? e.target.id : e.target;
    if (!neighborMap.has(s)) neighborMap.set(s, new Set());
    if (!neighborMap.has(t)) neighborMap.set(t, new Set());
    neighborMap.get(s).add(t);
    neighborMap.get(t).add(s);
  }
  window.__chakraNeighborMap = neighborMap;

  // Build vis nodes
  const visNodes = nodes.map(n => {
    const s = STYLES[n.type] || DEFAULT_STYLE;
    const scaledSize = Math.max(4, Math.round(s.size * sizeScale));

    return {
      id: n.id,
      label: showLabels ? truncateLabel(n.label, nodeCount > 400 ? 14 : 20) : "",
      shape: s.shape,
      size: scaledSize,
      color: {
        background: s.color,
        border: s.color,
        highlight: { background: "#ffffff", border: "#ffffff" },
        hover: { background: s.color, border: "#ffffff" },
      },
      font: {
        color: "#e8edf7",
        size: showLabels ? fontSize : 0,
        face: "Inter, system-ui, sans-serif",
        strokeWidth: 3,
        strokeColor: "#05080f",
      },
      borderWidth: Math.max(1, Math.round(2 * sizeScale)),
      title: buildPlainTooltip(n, neighborMap),
      __meta: n,
    };
  });

  const visEdges = edges.map(e => ({
    from: typeof e.source === "object" ? e.source.id : e.source,
    to:   typeof e.target === "object" ? e.target.id : e.target,
    color: { color: currentMode === "repeat" ? "rgba(255,183,0,0.3)" : "rgba(80,120,200,0.3)", highlight: "#00d4ff" },
    width: Math.max(0.4, 1 * sizeScale),
    smooth: { type: "continuous" },
    arrows: { to: { enabled: false } },
  }));

  const options = {
    nodes: {
      borderWidth: Math.max(1, Math.round(2 * sizeScale)),
      borderWidthSelected: Math.max(2, Math.round(4 * sizeScale)),
      shapeProperties: { borderDashes: false },
    },
    edges: {
      selectionWidth: 2,
      hoverWidth: 1.5,
      smooth: { type: "continuous" },
    },
    // ⭐ PHYSICS ON — but stabilized quickly so jiggle is short and gentle
    physics: {
      enabled: true,
      solver: "barnesHut",
      barnesHut: physics,
      stabilization: {
        enabled: true,
        iterations: nodeCount > 500 ? 300 : 200,
        updateInterval: 25,
        fit: true,              // fit view once stabilized
      },
      maxVelocity: 30,          // ⭐ capped — prevents violent flings
      minVelocity: 0.5,
      timestep: 0.35,           // ⭐ smaller step = smoother motion
      adaptiveTimestep: true,
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      navigationButtons: false,
      keyboard: false,
      zoomView: true,
      dragView: true,
      dragNodes: true,
      hoverConnectedEdges: true,
    },
    layout: {
      improvedLayout: nodeCount <= 500,
      randomSeed: 42,
    },
  };

  network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, options);

  // ⭐ Large default zoom — user zooms out with mouse
  const initialScale = nodeCount <= 100 ? 1.5
                    : nodeCount <= 300 ? 1.2
                    : nodeCount <= 600 ? 0.9
                    : nodeCount <= 1200 ? 0.7
                    : 0.5;

  // Set scale after stabilization completes
  network.once("stabilizationIterationsDone", () => {
    network.moveTo({
      position: { x: 0, y: 0 },
      scale: initialScale,
      animation: { duration: 500, easingFunction: "easeInOutQuad" },
    });
  });

  // Click handler — unchanged
  network.on("click", (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      selectedNodeId = nodeId;
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const neighbors = Array.from(neighborMap.get(nodeId) || []).length;
      document.getElementById("graph-selection").style.display = "block";
      document.getElementById("sel-label").textContent = node.label;
      document.getElementById("sel-meta").textContent =
        `Type: ${(STYLES[node.type] || DEFAULT_STYLE).label} · ${neighbors} connection${neighbors === 1 ? "" : "s"}` +
        (node.meta?.cluster_size ? ` · ${node.meta.cluster_size} FIRs in cluster` : "");

      applyHighlight();
      network.focus(nodeId, {
        scale: Math.max(initialScale, 1.2),
        animation: { duration: 500, easingFunction: "easeInOutQuad" },
      });
    } else {
      if (selectedNodeId) {
        selectedNodeId = null;
        document.getElementById("graph-selection").style.display = "none";
        applyHighlight();
      }
    }
  });
}


// ⭐ Plain text tooltip — no HTML tags
function buildPlainTooltip(n, neighborMap) {
  const s = STYLES[n.type] || DEFAULT_STYLE;
  const neighbors = neighborMap.get(n.id)?.size || 0;
  const lines = [
    `▸ ${n.label}`,
    `Type: ${s.label}`,
  ];
  if (n.meta?.cluster_size) lines.push(`Cluster: ${n.meta.cluster_size} FIRs`);
  if (n.meta?.crime_type) lines.push(`Crime: ${n.meta.crime_type}`);
  if (n.meta?.alias) lines.push(`Alias: ${n.meta.alias}`);
  lines.push(`Connections: ${neighbors}`);
  return lines.join("\n");
}


function truncateLabel(s, max = 20) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}


// ===============================================================
// Highlight
// ===============================================================
function applyHighlight() {
  if (!network) return;

  const nodesDS = network.body.data.nodes;
  const edgesDS = network.body.data.edges;
  const allNodes = nodesDS.get();
  const allEdges = edgesDS.get();

  const neighborMap = window.__chakraNeighborMap || new Map();
  const nodeCount = allNodes.length;
  const sizeScale = computeScale(nodeCount);

  // Ego-network
  if (selectedNodeId) {
    const neighbors = neighborMap.get(selectedNodeId) || new Set();

    const updatedNodes = allNodes.map(n => {
      const s = STYLES[n.__meta.type] || DEFAULT_STYLE;
      const baseSize = Math.max(4, Math.round(s.size * sizeScale));

      if (n.id === selectedNodeId) {
        return { ...n, color: { background: "#ffffff", border: "#ffffff" }, borderWidth: 4, size: Math.round(baseSize * 1.5) };
      }
      if (neighbors.has(n.id)) {
        return { ...n, color: { background: s.color, border: "#ffffff" }, borderWidth: 2, size: baseSize };
      }
      return {
        ...n,
        color: { background: "rgba(80,90,120,0.1)", border: "rgba(80,90,120,0.1)" },
        font: { ...n.font, color: "rgba(139,150,184,0.2)" },
      };
    });

    const updatedEdges = allEdges.map(e => {
      const active = e.from === selectedNodeId || e.to === selectedNodeId;
      return {
        ...e,
        color: { color: active ? "rgba(0,212,255,0.95)" : "rgba(80,90,120,0.03)" },
        width: active ? 2 : 0.2,
      };
    });

    nodesDS.update(updatedNodes);
    edgesDS.update(updatedEdges);
    return;
  }

  // Type filter
  if (highlightType !== "all") {
    const updatedNodes = allNodes.map(n => {
      const s = STYLES[n.__meta.type] || DEFAULT_STYLE;
      const isMatch = n.__meta.type === highlightType;
      const baseSize = Math.max(4, Math.round(s.size * sizeScale));
      return isMatch
        ? { ...n, color: { background: s.color, border: s.color }, borderWidth: 2, size: baseSize }
        : { ...n, color: { background: "rgba(80,90,120,0.1)", border: "rgba(80,90,120,0.1)" }, font: { ...n.font, color: "rgba(139,150,184,0.2)" } };
    });

    const updatedEdges = allEdges.map(e => {
      const fromNode = allNodes.find(n => n.id === e.from);
      const toNode = allNodes.find(n => n.id === e.to);
      const active = fromNode?.__meta?.type === highlightType || toNode?.__meta?.type === highlightType;
      return { ...e, color: { color: active ? "rgba(0,212,255,0.6)" : "rgba(80,90,120,0.03)" }, width: active ? 1.5 : 0.2 };
    });

    nodesDS.update(updatedNodes);
    edgesDS.update(updatedEdges);
    return;
  }

  // Reset
  const resetNodes = allNodes.map(n => {
    const s = STYLES[n.__meta.type] || DEFAULT_STYLE;
    const baseSize = Math.max(4, Math.round(s.size * sizeScale));
    return {
      ...n,
      color: { background: s.color, border: s.color },
      size: baseSize,
      borderWidth: Math.max(1, Math.round(2 * sizeScale)),
      font: { ...n.font, color: "#e8edf7" },
    };
  });

  const resetEdges = allEdges.map(e => ({
    ...e,
    color: { color: currentMode === "repeat" ? "rgba(255,183,0,0.3)" : "rgba(80,120,200,0.3)" },
    width: Math.max(0.4, 1 * sizeScale),
  }));

  nodesDS.update(resetNodes);
  edgesDS.update(resetEdges);
}
// ===============================================================
// ⭐ Bob Smart Search
// ===============================================================
async function runBobSearch() {
  const input = document.getElementById("bob-search");
  const q = input.value.trim();
  if (!q) { toast("Type a natural-language query first", "err"); return; }

  const btn = document.getElementById("btn-bob-search");
  btn.disabled = true;
  btn.textContent = "🤖 Thinking…";

  try {
    const res = await fetch("http://127.0.0.1:8000/api/network/smart-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    }).then(r => r.json());

    if (!res.nodes || res.nodes.length === 0) {
      toast("Bob found no matching nodes. Try broadening your query.", "err");
      return;
    }

    // Show what Bob parsed
    const parsed = res.parsed || {};
    const parsedSummary = Object.entries(parsed)
      .filter(([k, v]) => v && k !== "node_types" && k !== "keywords" && k !== "explanation")
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ") || "no specific filters";

    toast(`Bob loaded ${res.counts.nodes} nodes · ${parsedSummary}`);

    // Replace graph
    currentData = res;
    renderStats();
    renderGraph(res.nodes, res.edges);
  } catch (err) {
    toast(`Bob search failed: ${err.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Ask Bob";
  }
}