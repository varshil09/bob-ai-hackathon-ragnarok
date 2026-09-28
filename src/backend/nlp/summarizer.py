"""
CHAKRA — Station Summarizer
===========================

Builds structured stats for a police station, then asks Bob to
write a natural-language briefing.
"""
from __future__ import annotations

from db import query, query_one
from nlp.bob_client import get_bob
from engine.analytics import police_station_breakdown


def station_stats(police_station: str) -> dict:
    """Gather all the stats needed for a briefing."""
    total = query_one(
        "SELECT COUNT(*) AS c FROM firs WHERE police_station = ?",
        (police_station,),
    )["c"]

    if total == 0:
        return {"police_station": police_station, "total_firs": 0}

    top_crime = query_one("""
        SELECT crime_type AS v FROM firs
        WHERE police_station = ?
        GROUP BY crime_type ORDER BY COUNT(*) DESC LIMIT 1
    """, (police_station,))

    top_time = query_one("""
        SELECT time_bucket AS v FROM firs
        WHERE police_station = ?
        GROUP BY time_bucket ORDER BY COUNT(*) DESC LIMIT 1
    """, (police_station,))

    top_mo = query_one("""
        SELECT modus_operandi AS v FROM firs
        WHERE police_station = ? AND modus_operandi IS NOT NULL
        GROUP BY modus_operandi ORDER BY COUNT(*) DESC LIMIT 1
    """, (police_station,))

    crimes = query("""
        SELECT crime_type AS label, COUNT(*) AS value
        FROM firs WHERE police_station = ?
        GROUP BY crime_type ORDER BY value DESC
    """, (police_station,))

    times = query("""
        SELECT time_bucket AS label, COUNT(*) AS value
        FROM firs WHERE police_station = ?
        GROUP BY time_bucket ORDER BY value DESC
    """, (police_station,))

    repeat_accused = query("""
        SELECT accused_name AS name, COUNT(*) AS fir_count
        FROM firs
        WHERE police_station = ?
          AND accused_name IS NOT NULL
          AND accused_name NOT LIKE '%Unknown%'
        GROUP BY accused_name
        HAVING fir_count > 1
        ORDER BY fir_count DESC
        LIMIT 5
    """, (police_station,))

    arrests = query_one(
        "SELECT COUNT(*) AS c FROM firs WHERE police_station = ? AND arrest_status = 'Arrested'",
        (police_station,),
    )["c"]

    return {
        "police_station":     police_station,
        "total_firs":         total,
        "top_crime_type":     top_crime["v"] if top_crime else None,
        "top_time_bucket":    top_time["v"] if top_time else None,
        "top_modus_operandi": top_mo["v"] if top_mo else None,
        "crime_breakdown":    crimes,
        "time_breakdown":     times,
        "repeat_offenders":   repeat_accused,
        "arrests":            arrests,
        "arrest_rate_pct":    round((arrests / total) * 100, 1) if total else 0.0,
    }


def station_briefing(police_station: str) -> dict:
    """Full briefing: structured stats + Bob-generated narrative."""
    stats = station_stats(police_station)
    if stats.get("total_firs", 0) == 0:
        return {
            "police_station": police_station,
            "stats":          stats,
            "briefing":       f"No FIRs on record for {police_station}.",
        }

    bob = get_bob()
    narrative = bob.summarize_station(stats)
    return {
        "police_station": police_station,
        "stats":          stats,
        "briefing":       narrative,
        "bob_source":     "mock" if bob.use_mock else "watsonx",
    }


def all_stations_ranked() -> list[dict]:
    """Rank police stations by FIR count, with top crime type."""
    return query("""
        SELECT police_station,
               state,
               COUNT(*) AS fir_count,
               (SELECT crime_type FROM firs f2
                WHERE f2.police_station = f1.police_station
                GROUP BY crime_type ORDER BY COUNT(*) DESC LIMIT 1) AS top_crime
        FROM firs f1
        WHERE police_station IS NOT NULL
        GROUP BY police_station, state
        ORDER BY fir_count DESC
    """)