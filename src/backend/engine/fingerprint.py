"""
CHAKRA — Repeat-Offender Fingerprint Engine
============================================

THE KILLER FEATURE.

A "fingerprint" is a normalized signature of how a crime was committed:
    {crime_type} · {modus_operandi} · {weapon} · {vehicle} · {time_bucket} · {location_type}

Two FIRs with matching fingerprints strongly suggest the SAME OFFENDER,
even if names or districts differ.

This engine:
  1. Computes fingerprints for every FIR
  2. Groups FIRs by fingerprint
  3. Returns repeat-offender clusters with confidence scores
  4. Highlights alias-based matches (same person, different alias)
"""
from __future__ import annotations

import hashlib
import re
from collections import defaultdict

from db import query


# ---------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------
_STOPWORDS = {"the", "a", "an", "and", "or", "of", "at", "in", "on", "to"}

_ALIAS_NOISE = re.compile(r"[^\w\s]", re.UNICODE)


def _norm(value: str | None) -> str:
    """Lowercase, strip punctuation/whitespace, collapse spaces."""
    if not value:
        return ""
    v = _ALIAS_NOISE.sub(" ", value.lower())
    tokens = [t for t in v.split() if t and t not in _STOPWORDS]
    return " ".join(tokens)


def _fingerprint(row: dict) -> str:
    """Deterministic hash of the offender's likely signature."""
    parts = [
        _norm(row.get("crime_type")),
        _norm(row.get("modus_operandi")),
        _norm(row.get("weapon_or_tool")),
        _norm(row.get("vehicle_used")),
        _norm(row.get("time_bucket")),
        _norm(row.get("location_type")),
    ]
    signature = "|".join(parts)
    return hashlib.sha1(signature.encode("utf-8")).hexdigest()[:16]


def _signature_human(row: dict) -> str:
    """Human-readable summary of the fingerprint."""
    bits = []
    if row.get("modus_operandi"):
        bits.append(row["modus_operandi"])
    if row.get("weapon_or_tool") and row["weapon_or_tool"] != "Not applicable":
        bits.append(f"w/ {row['weapon_or_tool']}")
    if row.get("vehicle_used") and row["vehicle_used"] not in ("Not applicable", "unknown"):
        bits.append(f"on {row['vehicle_used']}")
    if row.get("time_bucket"):
        bits.append(f"@ {row['time_bucket']}")
    if row.get("location_type"):
        bits.append(f"({row['location_type']})")
    return " · ".join(bits) if bits else "unclassified"


# ---------------------------------------------------------------
# Loader
# ---------------------------------------------------------------
def _load_all_firs() -> list[dict]:
    return query("""
        SELECT fir_id, state, district, police_station, city,
               crime_type, accused_name, accused_alias,
               modus_operandi, time_bucket, vehicle_used,
               weapon_or_tool, location_type, incident_date,
               estimated_loss_inr, arrest_status, investigation_status
        FROM firs
    """)


# ---------------------------------------------------------------
# Core engine
# ---------------------------------------------------------------
def compute_repeat_offenders(min_cluster_size: int = 2, min_confidence: float = 0.6) -> list[dict]:
    """
    Detect repeat-offender clusters via fingerprint grouping.

    Returns a list of clusters sorted by FIR count (descending).
    Each cluster contains:
        fingerprint     — hash id
        signature       — human-readable signature
        fir_count       — number of FIRs in cluster
        confidence      — 0.0 to 1.0
        accused_names   — set of distinct names in cluster
        aliases         — set of aliases
        states          — set of states crossed
        crime_type      — dominant crime type
        fir_ids         — list of FIR IDs
        sample          — representative narrative-free summary
        is_cross_state  — boolean (evidence of gang migration)
    """
    firs = _load_all_firs()

    # Group by fingerprint
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in firs:
        fp = _fingerprint(row)
        if fp and any([
            _norm(row.get("modus_operandi")),
            _norm(row.get("weapon_or_tool")),
            _norm(row.get("vehicle_used")),
        ]):
            groups[fp].append(row)

    clusters = []
    for fp, rows in groups.items():
        if len(rows) < min_cluster_size:
            continue

        # Confidence: base on how many signature components matched + size
        signature_cols = [
            _norm(rows[0].get("crime_type")),
            _norm(rows[0].get("modus_operandi")),
            _norm(rows[0].get("weapon_or_tool")),
            _norm(rows[0].get("vehicle_used")),
            _norm(rows[0].get("time_bucket")),
            _norm(rows[0].get("location_type")),
        ]
        matched_components = sum(1 for c in signature_cols if c)
        base_conf = matched_components / 6.0
        size_bonus = min(0.3, (len(rows) - 1) * 0.05)
        confidence = round(min(1.0, base_conf + size_bonus), 3)

        if confidence < min_confidence:
            continue

        names = {r["accused_name"] for r in rows if r.get("accused_name")
                 and "unknown" not in r["accused_name"].lower()}
        aliases = {r["accused_alias"] for r in rows if r.get("accused_alias")
                   and r["accused_alias"].lower() not in ("", "not applicable")}
        states = {r["state"] for r in rows if r.get("state")}
        stations = {r["police_station"] for r in rows if r.get("police_station")}
        districts = {r["district"] for r in rows if r.get("district")}

        clusters.append({
            "fingerprint":    fp,
            "signature":      _signature_human(rows[0]),
            "fir_count":      len(rows),
            "confidence":     confidence,
            "crime_type":     rows[0].get("crime_type"),
            "accused_names":  sorted(names),
            "aliases":        sorted(aliases),
            "states":         sorted(states),
            "districts":      sorted(districts),
            "police_stations": sorted(stations),
            "is_cross_state": len(states) > 1,
            "fir_ids":        [r["fir_id"] for r in rows],
            "firs": [
                {
                    "fir_id":          r["fir_id"],
                    "state":           r["state"],
                    "district":        r["district"],
                    "police_station":  r["police_station"],
                    "accused_name":    r["accused_name"],
                    "accused_alias":   r["accused_alias"],
                    "incident_date":   r["incident_date"],
                }
                for r in rows
            ],
        })

    clusters.sort(key=lambda c: (-c["fir_count"], -c["confidence"]))
    return clusters


# ---------------------------------------------------------------
# Alias-based matcher
# ---------------------------------------------------------------
def find_alias_links() -> list[dict]:
    """
    Detects when the SAME accused_name appears with DIFFERENT aliases
    in different FIRs — classic signature of an evasive offender.
    """
    rows = query("""
        SELECT accused_name, accused_alias, fir_id, state, district, crime_type
        FROM firs
        WHERE accused_name IS NOT NULL
          AND accused_name NOT LIKE '%Unknown%'
          AND accused_alias IS NOT NULL
          AND accused_alias != ''
          AND accused_alias != 'Not applicable'
    """)

    by_name: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_name[r["accused_name"]].append(r)

    links = []
    for name, occurrences in by_name.items():
        aliases = {o["accused_alias"] for o in occurrences}
        if len(aliases) > 1:
            links.append({
                "accused_name": name,
                "alias_count":  len(aliases),
                "aliases":      sorted(aliases),
                "fir_count":    len(occurrences),
                "states":       sorted({o["state"] for o in occurrences}),
                "crime_types":  sorted({o["crime_type"] for o in occurrences}),
                "fir_ids":      [o["fir_id"] for o in occurrences],
            })

    links.sort(key=lambda l: (-l["alias_count"], -l["fir_count"]))
    return links


# ---------------------------------------------------------------
# Stats summary (for dashboard)
# ---------------------------------------------------------------
def repeat_offender_stats() -> dict:
    clusters = compute_repeat_offenders()
    alias_links = find_alias_links()

    total_firs_in_clusters = sum(c["fir_count"] for c in clusters)
    cross_state = sum(1 for c in clusters if c["is_cross_state"])

    return {
        "cluster_count":           len(clusters),
        "firs_flagged":            total_firs_in_clusters,
        "cross_state_clusters":    cross_state,
        "alias_link_count":        len(alias_links),
        "top_cluster":             clusters[0] if clusters else None,
    }