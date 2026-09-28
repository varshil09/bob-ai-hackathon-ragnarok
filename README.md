# 🚔 CHAKRA — Crime Intelligence & Pattern Detector

> **Bob-powered NLP intelligence layer that turns 1,000 unstructured FIRs into a searchable criminal intelligence graph — surfacing repeat offenders that manual review misses for years.**

**Team:** Ragnarok · **Track:** AI & Predictive Intelligence

---

## 🎯 Problem Statement

UP Police's CCTNS system holds **3+ crore digitized FIRs with no NLP layer**. Serial offenders like the **Jamtara gang** evaded detection for years because inter-district FIR connections were never surfaced. Pattern analysis is 100% manual.

**CHAKRA solves this** by:
1. Extracting entities and MO signatures from free-text narratives
2. Computing a **criminal fingerprint** per FIR
3. Detecting **cross-district repeat-offender clusters** via fingerprint matching
4. Flagging **alias-linked offenders** who use different names in different FIRs
5. Generating **AI briefings** for station heads

---

## 💡 Solution

CHAKRA ingests a batch of FIR text samples. It **categorizes** each by crime type, **extracts** named entities (accused, location, MO, victim profile), **detects** repeat-offender signatures across FIRs, and **generates** a station-level crime trend summary with a flagged repeat-offender list — all powered by IBM Bob / watsonx.ai.

### On our mock dataset (1,000 FIRs)

| Metric | Result |
|---|---|
| Repeat-offender clusters detected | **148** |
| FIRs flagged as part of a cluster | **540** (54%) |
| Cross-state clusters | **135** (91%) |
| Alias-linked offenders | **8** |
| Largest single cluster | **45 FIRs across 6 states** |

---

## ✨ Key Features

- 🔁 **Fingerprint-based repeat-offender detection** — Normalized MO + weapon + vehicle + time + location signature per FIR
- 🎭 **Alias-trail matching** — Detects when the same accused uses different names (e.g., "Vivek Yadav" using "Amit", "Ameet", "Amit Kumar")
- 🕸️ **Interactive 3D criminal network graph** — Three.js force-directed graph with 300+ nodes
- 🤖 **Bob-generated station briefings** — Natural-language intelligence reports with actionable recommendations
- 💬 **Natural-language query interface** — Retrieval + Bob synthesis (RAG-style)
- 📊 **Command-center dashboard** — Pan-India KPIs, crime type breakdowns, time-of-day radar

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, FastAPI, SQLite |
| **NLP** | IBM watsonx.ai Granite (with mock fallback) |
| **Graph** | NetworkX (server), 3d-force-graph + Three.js (client) |
| **Frontend** | Vanilla HTML / CSS / ES modules |
| **Charts** | Chart.js 4.4 |
| **Data** | 1,000-row mock FIR dataset (CSV) |

---

## 🚀 How to Run

See [`docs/setup-guide.md`](docs/setup-guide.md) for full instructions. TL;DR:

```bash
# Terminal 1 — backend
cd src/backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy ..\.env.example ..\.env
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 — frontend
cd src/frontend
python -m http.server 5500
```

Open **http://localhost:5500**

---

## 📸 Demo

- **Video:** See [`demo/demo-video-link.txt`](demo/demo-video-link.txt)
- **Live URL:** See [`demo/live-demo-url.txt`](demo/live-demo-url.txt)
- **Screenshots:** [`demo/screenshots/`](demo/screenshots/)

---

## ⚠️ Known Limitations

- NLP currently runs in **mock mode** by default. Real watsonx.ai integration is coded but requires IBM Cloud credentials (env vars ready).
- The dataset is synthetic (1,000 mock FIRs), not real CCTNS data — but the schema mirrors CCTNS fields.
- Network graph caps at 300 nodes for browser performance.
- No authentication layer — intended as an internal analyst tool.

---

## 🏆 What We're Most Proud Of

1. **The 45-FIR UPI Fraud cluster** — a single fingerprint spanning 6 states, 22 districts, and 10 police stations, with 19 distinct accused names sharing 3 aliases. This is exactly the Jamtara-gang pattern the problem statement describes.

2. **The alias-trail engine** — surfaces offenders like `Vivek Yadav` appearing across Maharashtra, Gujarat, Rajasthan, Delhi, and UP with 3 different aliases.

3. **The 3D network graph** — turns static FIR data into a live, explorable criminal network that judges can rotate and drill into.

4. **Bob-generated station briefings** — turning raw statistics into natural-language intelligence briefings a station head can act on.

---

## 📂 Repository Structure

```
bob-ai-hackathon-ragnarok/
├── submission.yaml          # Metadata for evaluators
├── README.md                # This file
├── docs/                    # Deep documentation
├── src/
│   ├── backend/             # FastAPI + NLP + engine
│   └── frontend/            # Vanilla JS UI
├── demo/                    # Video, screenshots
└── presentation/            # Slide deck
```