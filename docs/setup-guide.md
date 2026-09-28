# Setup Guide

**Estimated time:** 5–10 minutes. Tested on Windows 10/11 with Python 3.11.

## Prerequisites

- **Python 3.11** (⚠️ NOT 3.13 — see Troubleshooting)
  - Download: https://www.python.org/downloads/release/python-3119/
  - During install, **check "Add python.exe to PATH"**
- A modern browser (Chrome, Edge, Firefox)
- Git (for cloning)

## Step 1 — Clone and enter repo

```bash
git clone https://github.com/YOUR_USERNAME/bob-ai-hackathon-ragnarok.git
cd bob-ai-hackathon-ragnarok
```

## Step 2 — Backend setup

```bash
cd src/backend

# Create virtual environment
py -3.11 -m venv .venv

# Activate
.venv\Scripts\activate.bat          # Windows CMD
# or: .venv\Scripts\Activate.ps1    # Windows PowerShell
# or: source .venv/bin/activate     # macOS/Linux
```

Verify Python inside venv:
```bash
python --version   # Should print: Python 3.11.9
```

Install dependencies:
```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Step 3 — Environment variables

Copy the example env file to `.env` (one level up, inside `src/`):

```bash
# From src/backend, Windows CMD:
copy ..\.env.example ..\.env

# PowerShell:
Copy-Item ..\.env.example ..\.env

# macOS/Linux:
cp ../.env.example ../.env
```

Defaults work out-of-the-box (mock Bob, no credentials needed).

## Step 4 — Verify dataset

Confirm your CSV is present:

```bash
dir data
```

Should show `fir_dataset.csv` and `__init__.py`. If your CSV has a different name, rename it:

```bash
ren "data\FIR DATASET.csv" fir_dataset.csv
```

## Step 5 — Run the backend

```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

You should see:
```
============================================================
  CHAKRA — Crime Intelligence Console
============================================================
  Dataset : ...\data\fir_dataset.csv
  DB      : ...\data\chakra.db
  Mock Bob: True
------------------------------------------------------------
  DB init : {'status': 'loaded', 'rows': 1000}
============================================================
INFO:     Uvicorn running on http://127.0.0.1:8000
```

**Verify:** open http://localhost:8000/api/health — should return `{"status":"ok","fir_count":1000,"mock_bob":true}`.

## Step 6 — Frontend setup

**New terminal** (keep backend running):

```bash
cd src/frontend
python -m http.server 5500
```

## Step 7 — Open the app

Go to: **http://localhost:5500**

You should see:
- Sidebar with 6 nav items
- Green status dot + "1,000 FIRs loaded"
- KPI cards with real numbers
- 3 charts rendering

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `uvicorn is not recognized` | Venv not activated | Run `.venv\Scripts\activate.bat` first |
| `ModuleNotFoundError: pydantic_settings` | Wrong Python version | Use Python 3.11, not 3.13 |
| `pandas requires GCC >= 8.4` | Python 3.13 + old GCC | Use Python 3.11 (prebuilt wheels) |
| `FIR dataset not found` | CSV missing or wrong name | Place at `src/backend/data/fir_dataset.csv` |
| Frontend shows "Backend offline" | Backend not running | Start uvicorn in another terminal |
| CORS error in console | Origin not whitelisted | Add origin to `CHAKRA_CORS_ORIGINS` in `.env` and restart backend |
| 3D graph empty | 3d-force-graph script not loaded | Add `<script>` tags for Three.js + 3d-force-graph to `index.html` |
| Charts blank | Chart.js script missing | Add `<script src="https://cdn.jsdelivr.net/npm/chart.js">` to `index.html` |
| Port 8000 in use | Another process | `python -m uvicorn main:app --port 8001` and update `api.js` BASE |
| `python-dotenv could not parse` | BOM in .env | Delete `.env`, recopy from `.env.example` |

## Verify everything works

Run these checks:

1. **Health:** `curl http://localhost:8000/api/health` → `fir_count: 1000`
2. **Dashboard:** `curl http://localhost:8000/api/dashboard | python -m json.tool`
3. **Repeat offenders:** `curl http://localhost:8000/api/repeat-offenders` → 148 clusters
4. **Frontend:** Open `http://localhost:5500` → dashboard renders
5. **3D graph:** Click "Network Graph" → spinning 3D graph

## Swapping mock Bob → real watsonx.ai

1. Get IBM Cloud API key + watsonx project ID
2. Edit `src/.env`:
   ```
   CHAKRA_USE_MOCK_BOB=false
   WATSONX_API_KEY=<your-key>
   WATSONX_PROJECT_ID=<your-project>
   ```
3. Restart backend. No code changes needed.