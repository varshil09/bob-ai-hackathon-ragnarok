"""
CHAKRA — Entity Extractor
=========================

Wraps the Bob client to enrich FIR rows with extracted entities.
Caches results in SQLite to avoid repeated Bob calls.
"""
from __future__ import annotations

import json
from typing import Any

from db import query, query_one, get_connection
from nlp.bob_client import get_bob


# ---------------------------------------------------------------
# Enrichment cache table
# ---------------------------------------------------------------
CACHE_SCHEMA = """
CREATE TABLE IF NOT EXISTS fir_entities (
    fir_id      TEXT PRIMARY KEY,
    entities    TEXT,
    bob_source  TEXT
);
"""


def ensure_cache_table() -> None:
    conn = get_connection()
    try:
        conn.executescript(CACHE_SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_cached_entities(fir_id: str) -> dict | None:
    row = query_one("SELECT entities FROM fir_entities WHERE fir_id = ?", (fir_id,))
    if row and row.get("entities"):
        try:
            return json.loads(row["entities"])
        except json.JSONDecodeError:
            return None
    return None


def save_entities(fir_id: str, entities: dict, source: str) -> None:
    conn = get_connection()
    try:
        conn.execute(
            """INSERT OR REPLACE INTO fir_entities (fir_id, entities, bob_source)
               VALUES (?, ?, ?)""",
            (fir_id, json.dumps(entities), source),
        )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------
def extract_for_fir(fir_id: str, use_cache: bool = True) -> dict:
    """Extract entities for a single FIR (cached)."""
    ensure_cache_table()

    if use_cache:
        cached = get_cached_entities(fir_id)
        if cached:
            return cached

    row = query_one("SELECT fir_narrative FROM firs WHERE fir_id = ?", (fir_id,))
    if not row:
        return {"error": f"FIR {fir_id} not found"}

    bob = get_bob()
    entities = bob.extract_entities(row["fir_narrative"] or "")
    source = "mock" if bob.use_mock else "watsonx"
    save_entities(fir_id, entities, source)
    return entities


def extract_all(limit: int | None = None) -> dict:
    """
    Pre-compute entities for all FIRs. Called on first request to
    /api/repeat-offenders so we don't recompute every time.
    """
    ensure_cache_table()

    sql = "SELECT fir_id, fir_narrative FROM firs WHERE fir_id NOT IN (SELECT fir_id FROM fir_entities)"
    if limit:
        sql += f" LIMIT {int(limit)}"
    pending = query(sql)

    bob = get_bob()
    processed = 0
    for row in pending:
        entities = bob.extract_entities(row["fir_narrative"] or "")
        save_entities(row["fir_id"], entities, "mock" if bob.use_mock else "watsonx")
        processed += 1

    return {"processed": processed, "pending": len(pending)}


def get_all_entities() -> list[dict]:
    """Return all cached entities joined with FIR metadata."""
    ensure_cache_table()
    rows = query("""
        SELECT f.fir_id, f.accused_name, f.accused_alias, f.crime_type,
               f.state, f.district, f.police_station, f.modus_operandi,
               f.time_bucket, f.weapon_or_tool, f.vehicle_used,
               f.location_type, e.entities
        FROM firs f
        LEFT JOIN fir_entities e ON e.fir_id = f.fir_id
    """)
    out = []
    for r in rows:
        try:
            r["entities"] = json.loads(r["entities"]) if r.get("entities") else {}
        except json.JSONDecodeError:
            r["entities"] = {}
        out.append(r)
    return out