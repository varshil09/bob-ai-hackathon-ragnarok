# src/ — CHAKRA Source Code

This directory contains all application code for CHAKRA.

## Layout

- **`backend/`** — Python FastAPI server
  - `main.py` — API entrypoint & routes
  - `db.py` — SQLite data access layer
  - `config.py` — Settings loader
  - `nlp/` — IBM Bob / watsonx.ai integration + entity extraction
  - `engine/` — Analytics, repeat-offender fingerprinting, graph builder
  - `data/` — Mock FIR dataset (CSV)

- **`frontend/`** — Vanilla HTML/CSS/JS UI
  - `index.html` — Single-page shell
  - `css/` — Theme and component styles
  - `js/` — App logic, API client, view modules
  - `assets/` — Logos, icons

## Running

See `docs/setup-guide.md` for full setup instructions.