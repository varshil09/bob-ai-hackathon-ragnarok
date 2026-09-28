"""
CHAKRA — Analytics Engine
Aggregation queries feeding the dashboard.
"""
from __future__ import annotations

from db import query, query_one


def dashboard_summary() -> dict:
    """Top-level KPIs."""
    total = query_one("SELECT COUNT(*) AS c FROM firs")["c"]
    states = query_one("SELECT COUNT(DISTINCT state) AS c FROM firs")["c"]
    stations = query_one("SELECT COUNT(DISTINCT police_station) AS c FROM firs")["c"]
    arrests = query_one("SELECT COUNT(*) AS c FROM firs WHERE arrest_status = 'Arrested'")["c"]
    total_loss = query_one("SELECT COALESCE(SUM(estimated_loss_inr), 0) AS s FROM firs")["s"]
    high_priority = query_one("SELECT COUNT(*) AS c FROM firs WHERE case_priority = 'High'")["c"]

    return {
        "total_firs":          total,
        "total_states":        states,
        "total_stations":      stations,
        "total_arrests":       arrests,
        "total_loss_inr":      total_loss,
        "high_priority_cases": high_priority,
        "arrest_rate_pct":     round((arrests / total) * 100, 1) if total else 0.0,
    }


def crime_type_breakdown() -> list[dict]:
    return query("""
        SELECT crime_type AS label, COUNT(*) AS value
        FROM firs
        WHERE crime_type IS NOT NULL
        GROUP BY crime_type
        ORDER BY value DESC
    """)


def state_breakdown() -> list[dict]:
    return query("""
        SELECT state AS label, COUNT(*) AS value
        FROM firs
        WHERE state IS NOT NULL
        GROUP BY state
        ORDER BY value DESC
    """)


def time_bucket_breakdown() -> list[dict]:
    return query("""
        SELECT time_bucket AS label, COUNT(*) AS value
        FROM firs
        WHERE time_bucket IS NOT NULL
        GROUP BY time_bucket
        ORDER BY value DESC
    """)


def top_accused(limit: int = 10) -> list[dict]:
    """Most frequently appearing named accused."""
    return query("""
        SELECT accused_name AS name,
               COUNT(*) AS fir_count,
               GROUP_CONCAT(DISTINCT crime_type) AS crime_types,
               GROUP_CONCAT(DISTINCT state) AS states,
               GROUP_CONCAT(DISTINCT accused_alias) AS aliases
        FROM firs
        WHERE accused_name IS NOT NULL
          AND accused_name NOT LIKE '%Unknown%'
        GROUP BY accused_name
        HAVING fir_count > 1
        ORDER BY fir_count DESC
        LIMIT ?
    """, (limit,))


def police_station_breakdown(state: str | None = None, limit: int = 20) -> list[dict]:
    if state:
        return query("""
            SELECT police_station AS label, COUNT(*) AS value
            FROM firs WHERE state = ?
            GROUP BY police_station
            ORDER BY value DESC LIMIT ?
        """, (state, limit))
    return query("""
        SELECT police_station AS label, COUNT(*) AS value
        FROM firs
        GROUP BY police_station
        ORDER BY value DESC LIMIT ?
    """, (limit,))