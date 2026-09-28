"""
CHAKRA — SQLite Data Layer
Loads the FIR CSV into SQLite on first run, exposes query helpers.
"""
from __future__ import annotations

import csv
import sqlite3
from pathlib import Path
from typing import Any

from config import settings


# ---------------------------------------------------------------
# Schema
# ---------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS firs (
    fir_id                  TEXT PRIMARY KEY,
    state                   TEXT,
    district                TEXT,
    police_station          TEXT,
    city                    TEXT,
    incident_date           TEXT,
    report_date             TEXT,
    incident_time           TEXT,
    crime_type              TEXT,
    bns_section             TEXT,
    fir_narrative           TEXT,
    complainant_name        TEXT,
    victim_age              INTEGER,
    victim_gender           TEXT,
    victim_occupation       TEXT,
    victim_profile          TEXT,
    accused_name            TEXT,
    accused_alias           TEXT,
    accused_known           INTEGER,
    location_type           TEXT,
    incident_location       TEXT,
    modus_operandi          TEXT,
    time_bucket             TEXT,
    vehicle_used            TEXT,
    weapon_or_tool          TEXT,
    property_or_target      TEXT,
    estimated_loss_inr      INTEGER,
    evidence_type           TEXT,
    digital_evidence        TEXT,
    cctv_status             TEXT,
    witness_count           INTEGER,
    evidence_item_count     INTEGER,
    arrest_status           TEXT,
    recovery_status         TEXT,
    investigation_status    TEXT,
    case_priority           TEXT,
    pattern_keywords        TEXT,
    linked_phone            TEXT,
    linked_upi_or_account   TEXT
);

CREATE INDEX IF NOT EXISTS idx_crime_type      ON firs(crime_type);
CREATE INDEX IF NOT EXISTS idx_state           ON firs(state);
CREATE INDEX IF NOT EXISTS idx_district        ON firs(district);
CREATE INDEX IF NOT EXISTS idx_police_station  ON firs(police_station);
CREATE INDEX IF NOT EXISTS idx_accused_name    ON firs(accused_name);
CREATE INDEX IF NOT EXISTS idx_time_bucket     ON firs(time_bucket);
CREATE INDEX IF NOT EXISTS idx_incident_date   ON firs(incident_date);

-- ⭐ NEW: Dynamic crime taxonomy (auto-populated when new crime types arrive)
CREATE TABLE IF NOT EXISTS crime_taxonomy (
    crime_type   TEXT PRIMARY KEY,
    first_seen   TEXT,
    fir_count    INTEGER DEFAULT 1
);
"""


# CSV column → DB column mapping
CSV_TO_DB = {
    "fir_id":                 "fir_id",
    "state":                  "state",
    "district":               "district",
    "police_station":         "police_station",
    "city":                   "city",
    "incident_date":          "incident_date",
    "report_date":            "report_date",
    "incident_time":          "incident_time",
    "crime_type":             "crime_type",
    "indicative_bns_or_law_section": "bns_section",
    "fir_narrative":          "fir_narrative",
    "complainant_name":       "complainant_name",
    "victim_age":             "victim_age",
    "victim_gender":          "victim_gender",
    "victim_occupation":      "victim_occupation",
    "victim_profile":         "victim_profile",
    "accused_name":           "accused_name",
    "accused_alias":          "accused_alias",
    "accused_known_at_registration": "accused_known",
    "location_type":          "location_type",
    "incident_location":      "incident_location",
    "modus_operandi":         "modus_operandi",
    "time_bucket":            "time_bucket",
    "vehicle_used":           "vehicle_used",
    "weapon_or_tool":         "weapon_or_tool",
    "property_or_target":     "property_or_target",
    "estimated_loss_inr":     "estimated_loss_inr",
    "evidence_type":          "evidence_type",
    "digital_evidence":       "digital_evidence",
    "cctv_status":            "cctv_status",
    "witness_count":          "witness_count",
    "evidence_item_count":    "evidence_item_count",
    "arrest_status":          "arrest_status",
    "recovery_status":        "recovery_status",
    "investigation_status":   "investigation_status",
    "case_priority":          "case_priority",
    "pattern_keywords":       "pattern_keywords",
    "linked_phone":           "linked_phone",
    "linked_upi_or_account":  "linked_upi_or_account",
}

DB_COLUMNS = list(CSV_TO_DB.values())


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------
def _coerce(value: str, target_col: str) -> Any:
    """Coerce CSV string to correct SQLite type."""
    if value is None:
        return None
    v = value.strip()
    if v == "" or v.lower() in ("not applicable", "na", "none", "null"):
        return None

    if target_col in ("victim_age", "estimated_loss_inr",
                      "witness_count", "evidence_item_count"):
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return None

    if target_col == "accused_known":
        return 1 if v.upper() in ("TRUE", "1", "YES") else 0

    return v


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_full_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(force_reload: bool = False) -> dict:
    """
    Create schema, load CSV if DB is empty (or force_reload=True).
    Also seeds crime_taxonomy from the distinct crime types found in FIRs.
    """
    settings.db_full_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path = settings.dataset_full_path

    if not csv_path.exists():
        raise FileNotFoundError(
            f"FIR dataset not found at {csv_path}. "
            f"Place your CSV at src/backend/data/fir_dataset.csv"
        )

    conn = get_connection()
    conn.executescript(SCHEMA)

    existing = conn.execute("SELECT COUNT(*) AS c FROM firs").fetchone()["c"]
    if existing > 0 and not force_reload:
        # Ensure taxonomy is seeded
        _seed_taxonomy(conn)
        conn.close()
        return {"status": "cached", "rows": existing}

    if force_reload:
        conn.execute("DELETE FROM firs")
        conn.execute("DELETE FROM crime_taxonomy")

    inserted = 0
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        placeholders = ",".join(["?"] * len(DB_COLUMNS))
        insert_sql = (
            f"INSERT OR REPLACE INTO firs ({','.join(DB_COLUMNS)}) "
            f"VALUES ({placeholders})"
        )
        for row in reader:
            values = []
            for csv_col, db_col in CSV_TO_DB.items():
                values.append(_coerce(row.get(csv_col), db_col))
            try:
                conn.execute(insert_sql, values)
                inserted += 1
            except sqlite3.IntegrityError:
                continue

    conn.commit()
    _seed_taxonomy(conn)
    conn.close()
    return {"status": "loaded", "rows": inserted}


def _seed_taxonomy(conn: sqlite3.Connection) -> None:
    """Populate crime_taxonomy from distinct crime types in firs (idempotent)."""
    from datetime import datetime
    rows = conn.execute("""
        SELECT crime_type, COUNT(*) AS c FROM firs
        WHERE crime_type IS NOT NULL AND crime_type != ''
        GROUP BY crime_type
    """).fetchall()
    now = datetime.now().isoformat()
    for r in rows:
        existing = conn.execute(
            "SELECT crime_type FROM crime_taxonomy WHERE crime_type = ?",
            (r["crime_type"],)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE crime_taxonomy SET fir_count = ? WHERE crime_type = ?",
                (r["c"], r["crime_type"])
            )
        else:
            conn.execute(
                "INSERT INTO crime_taxonomy (crime_type, first_seen, fir_count) VALUES (?, ?, ?)",
                (r["crime_type"], now, r["c"])
            )
    conn.commit()


# ---------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------
def query(sql: str, params: tuple = ()) -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def query_one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None