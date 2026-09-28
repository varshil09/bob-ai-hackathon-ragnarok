"""
CHAKRA — FastAPI Backend
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import settings
from db import init_db, query, query_one, get_connection
from engine.analytics import (
    dashboard_summary, crime_type_breakdown, state_breakdown,
    time_bucket_breakdown, top_accused, police_station_breakdown,
)
from engine.fingerprint import (
    compute_repeat_offenders, find_alias_links, repeat_offender_stats,
)
from nlp.extractor import extract_for_fir, extract_all, get_all_entities
from nlp.summarizer import station_briefing, all_stations_ranked
from nlp.bob_client import get_bob


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    print("  CHAKRA — Crime Intelligence Console")
    print("=" * 60)
    print(f"  Dataset : {settings.dataset_full_path}")
    print(f"  DB      : {settings.db_full_path}")
    print(f"  Mock Bob: {settings.use_mock_bob}")
    print("-" * 60)
    try:
        stats = init_db()
        print(f"  DB init : {stats}")
    except FileNotFoundError as e:
        print(f"  [WARN] {e}")
    print("=" * 60)
    yield
    print("Shutting down CHAKRA...")


app = FastAPI(title="CHAKRA API", version="0.4.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===============================================================
# Meta
# ===============================================================
@app.get("/")
def root():
    return {
        "name": "CHAKRA",
        "tagline": "Crime Intelligence & Pattern Detector",
        "team": "Ragnarok",
        "version": "0.4.0",
        "status": "alive",
    }


@app.get("/api/health")
def health():
    row = query_one("SELECT COUNT(*) AS c FROM firs")
    return {
        "status": "ok",
        "fir_count": row["c"] if row else 0,
        "mock_bob": settings.use_mock_bob,
    }


# ===============================================================
# Dashboard
# ===============================================================
@app.get("/api/dashboard")
def get_dashboard():
    try:
        return {
            "summary":      dashboard_summary(),
            "crime_types":  crime_type_breakdown(),
            "states":       state_breakdown(),
            "time_buckets": time_bucket_breakdown(),
            "top_accused":  top_accused(limit=10),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===============================================================
# FIR listing + detail
# ===============================================================
@app.get("/api/firs")
def list_firs(
    crime_type: Optional[str] = None,
    state: Optional[str] = None,
    district: Optional[str] = None,
    police_station: Optional[str] = None,
    time_bucket: Optional[str] = None,
    accused_name: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    where, params = [], []
    if crime_type:     where.append("crime_type = ?");     params.append(crime_type)
    if state:          where.append("state = ?");          params.append(state)
    if district:       where.append("district = ?");       params.append(district)
    if police_station: where.append("police_station = ?"); params.append(police_station)
    if time_bucket:    where.append("time_bucket = ?");    params.append(time_bucket)
    if accused_name:   where.append("accused_name LIKE ?"); params.append(f"%{accused_name}%")
    if search:
        where.append("(fir_narrative LIKE ? OR fir_id LIKE ? OR complainant_name LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    total = query_one(f"SELECT COUNT(*) AS c FROM firs {where_sql}", tuple(params))
    rows = query(
        f"""SELECT fir_id, state, district, police_station, city,
                   incident_date, incident_time, crime_type,
                   accused_name, accused_alias, victim_gender,
                   victim_age, modus_operandi, time_bucket,
                   vehicle_used, weapon_or_tool, case_priority,
                   investigation_status, fir_narrative
            FROM firs {where_sql} ORDER BY fir_id LIMIT ? OFFSET ?""",
        tuple(params) + (limit, offset),
    )
    return {
        "total":  total["c"] if total else 0,
        "limit":  limit, "offset": offset,
        "count":  len(rows), "items": rows,
    }


@app.get("/api/firs/{fir_id}")
def get_fir(fir_id: str):
    row = query_one("SELECT * FROM firs WHERE fir_id = ?", (fir_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"FIR {fir_id} not found")
    return row


@app.get("/api/firs/{fir_id}/entities")
def get_fir_entities(fir_id: str):
    result = extract_for_fir(fir_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return {"fir_id": fir_id, "entities": result}


# ===============================================================
# Filters + taxonomy
# ===============================================================
@app.get("/api/filters")
def filter_options():
    return {
        "crime_types":     [r["crime_type"]     for r in query("SELECT DISTINCT crime_type FROM firs WHERE crime_type IS NOT NULL ORDER BY crime_type")],
        "states":          [r["state"]          for r in query("SELECT DISTINCT state FROM firs WHERE state IS NOT NULL ORDER BY state")],
        "districts":       [r["district"]       for r in query("SELECT DISTINCT district FROM firs WHERE district IS NOT NULL ORDER BY district")],
        "police_stations": [r["police_station"] for r in query("SELECT DISTINCT police_station FROM firs WHERE police_station IS NOT NULL ORDER BY police_station")],
        "time_buckets":    [r["time_bucket"]    for r in query("SELECT DISTINCT time_bucket FROM firs WHERE time_bucket IS NOT NULL ORDER BY time_bucket")],
    }


@app.get("/api/crime-taxonomy")
def get_crime_taxonomy():
    """All known crime types (from FIRs + dynamically learned)."""
    try:
        rows = query("""
            SELECT crime_type, fir_count, first_seen FROM crime_taxonomy
            ORDER BY fir_count DESC, crime_type ASC
        """)
    except Exception:
        rows = []
    return {"crimes": rows}


# ===============================================================
# Repeat offenders + aliases
# ===============================================================
@app.get("/api/repeat-offenders")
def get_repeat_offenders(
    min_cluster_size: int = Query(2, ge=2, le=20),
    min_confidence:   float = Query(0.6, ge=0.0, le=1.0),
    limit:            int   = Query(50, ge=1, le=500),
):
    try:
        clusters = compute_repeat_offenders(min_cluster_size=min_cluster_size,
                                            min_confidence=min_confidence)
        return {
            "stats":    repeat_offender_stats(),
            "clusters": clusters[:limit],
            "count":    len(clusters),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/alias-links")
def get_alias_links():
    return {"links": find_alias_links()}


# ===============================================================
# Stations
# ===============================================================
@app.get("/api/stations")
def get_stations():
    return {"stations": all_stations_ranked()}


@app.get("/api/stations/{police_station}/summary")
def get_station_summary(police_station: str):
    return station_briefing(police_station)


# ===============================================================
# Entity extraction batch
# ===============================================================
@app.post("/api/entities/refresh")
def refresh_entities(limit: int = Query(100, ge=1, le=2000)):
    return extract_all(limit=limit)


@app.get("/api/entities")
def list_entities():
    return {"items": get_all_entities()}


# ===============================================================
# Ask CHAKRA
# ===============================================================
class AskRequest(BaseModel):
    question: str
    context: list[dict] = []


@app.post("/api/ask")
def ask_bob(req: AskRequest):
    q = (req.question or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Question is required")

    keywords = [w for w in q.lower().split() if len(w) > 3][:5]
    matches: list[dict] = []

    if keywords:
        clauses = " OR ".join(["fir_narrative LIKE ?"] * len(keywords))
        like_params = [f"%{k}%" for k in keywords]
        matches = query(
            f"""SELECT fir_id, crime_type, state, district, police_station,
                       accused_name, fir_narrative
                FROM firs WHERE {clauses} LIMIT 20""",
            tuple(like_params),
        )

    bob = get_bob()
    answer = bob.answer_query(q, matches or req.context)
    return {
        "question": q,
        "answer":   answer,
        "sources":  [
            {"fir_id": m["fir_id"], "crime_type": m.get("crime_type"),
             "state": m.get("state"), "police_station": m.get("police_station")}
            for m in matches[:10]
        ],
        "bob_source": "mock" if bob.use_mock else "bob-live",
    }


# ===============================================================
# CREATE FIR + DELETE FIR
# ===============================================================
class CreateFirRequest(BaseModel):
    fir_id: str | None = None
    state: str
    district: str
    police_station: str
    city: str | None = ""
    incident_date: str
    report_date: str | None = None
    incident_time: str | None = ""
    crime_type: str
    bns_section: str | None = ""
    fir_narrative: str
    complainant_name: str | None = ""
    victim_age: int | None = None
    victim_gender: str | None = ""
    victim_occupation: str | None = ""
    victim_profile: str | None = ""
    accused_name: str | None = ""
    accused_alias: str | None = ""
    accused_known: bool | None = False
    location_type: str | None = ""
    incident_location: str | None = ""
    modus_operandi: str | None = ""
    time_bucket: str | None = ""
    vehicle_used: str | None = ""
    weapon_or_tool: str | None = ""
    property_or_target: str | None = ""
    estimated_loss_inr: int | None = 0
    evidence_type: str | None = ""
    digital_evidence: str | None = ""
    cctv_status: str | None = ""
    witness_count: int | None = 0
    evidence_item_count: int | None = 0
    arrest_status: str | None = ""
    recovery_status: str | None = ""
    investigation_status: str | None = "Under Investigation"
    case_priority: str | None = "Medium"
    pattern_keywords: str | None = ""
    linked_phone: str | None = ""
    linked_upi_or_account: str | None = ""


@app.post("/api/firs")
def create_fir(req: CreateFirRequest):
    fir_id = (req.fir_id or "").strip()
    if not fir_id:
        row = query_one("SELECT MAX(CAST(SUBSTR(fir_id, 5) AS INTEGER)) AS m FROM firs WHERE fir_id LIKE 'FIR-%'")
        next_n = (row["m"] or 0) + 1
        fir_id = f"FIR-{next_n:04d}"

    existing = query_one("SELECT fir_id FROM firs WHERE fir_id = ?", (fir_id,))
    if existing:
        raise HTTPException(status_code=409, detail=f"FIR ID {fir_id} already exists")

    report_date = req.report_date or req.incident_date

    # ⭐ Auto-classify crime type (adds novel crimes to the taxonomy)
    crime_raw = (req.crime_type or "").strip()
    if crime_raw:
        bob = get_bob()
        try:
            classification = bob.classify_crime(crime_raw)
            normalized_crime = classification.get("normalized", crime_raw)
        except Exception:
            normalized_crime = crime_raw
    else:
        normalized_crime = crime_raw

    conn = get_connection()
    try:
        conn.execute("""
            INSERT INTO firs (
                fir_id, state, district, police_station, city,
                incident_date, report_date, incident_time, crime_type, bns_section,
                fir_narrative, complainant_name, victim_age, victim_gender,
                victim_occupation, victim_profile, accused_name, accused_alias,
                accused_known, location_type, incident_location, modus_operandi,
                time_bucket, vehicle_used, weapon_or_tool, property_or_target,
                estimated_loss_inr, evidence_type, digital_evidence, cctv_status,
                witness_count, evidence_item_count, arrest_status, recovery_status,
                investigation_status, case_priority, pattern_keywords,
                linked_phone, linked_upi_or_account
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            fir_id, req.state, req.district, req.police_station, req.city or "",
            req.incident_date, report_date, req.incident_time or "", normalized_crime, req.bns_section or "",
            req.fir_narrative, req.complainant_name or "", req.victim_age, req.victim_gender or "",
            req.victim_occupation or "", req.victim_profile or "", req.accused_name or "", req.accused_alias or "",
            1 if req.accused_known else 0, req.location_type or "", req.incident_location or "", req.modus_operandi or "",
            req.time_bucket or "", req.vehicle_used or "", req.weapon_or_tool or "", req.property_or_target or "",
            req.estimated_loss_inr or 0, req.evidence_type or "", req.digital_evidence or "", req.cctv_status or "",
            req.witness_count or 0, req.evidence_item_count or 0, req.arrest_status or "", req.recovery_status or "",
            req.investigation_status or "Under Investigation", req.case_priority or "Medium",
            req.pattern_keywords or "", req.linked_phone or "", req.linked_upi_or_account or "",
        ))

        # Upsert taxonomy
        existing_tax = conn.execute(
            "SELECT crime_type FROM crime_taxonomy WHERE LOWER(crime_type) = LOWER(?)",
            (normalized_crime,)
        ).fetchone()
        if existing_tax:
            conn.execute(
                "UPDATE crime_taxonomy SET fir_count = fir_count + 1 WHERE crime_type = ?",
                (existing_tax["crime_type"],)
            )
        else:
            conn.execute(
                "INSERT INTO crime_taxonomy (crime_type, first_seen, fir_count) VALUES (?, ?, 1)",
                (normalized_crime, datetime.now().isoformat())
            )

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to insert: {e}")
    finally:
        conn.close()

    return {"status": "created", "fir_id": fir_id, "crime_type": normalized_crime}

# ===============================================================
# ⭐ Bob's FIR Classification
# ===============================================================
class ClassifyFirRequest(BaseModel):
    fir_id: str | None = None
    state: str = ""
    district: str = ""
    police_station: str = ""
    crime_type: str = ""
    fir_narrative: str = ""
    victim_age: int | None = None
    victim_gender: str = ""
    victim_profile: str = ""
    accused_name: str = ""
    modus_operandi: str = ""
    weapon_or_tool: str = ""
    vehicle_used: str = ""
    property_or_target: str = ""
    estimated_loss_inr: int | None = None
    time_bucket: str = ""


@app.post("/api/firs/classify")
def classify_fir(req: ClassifyFirRequest):
    """Bob classifies an FIR into severity, urgency, priority, and BNS sections."""
    data = req.model_dump(exclude_none=True)
    bob = get_bob()
    try:
        result = bob.classify_fir(data)
        return {
            "classification": result,
            "bob_source": "mock" if bob.use_mock else "bob-live",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/firs/{fir_id}/classify")
def classify_fir_by_id(fir_id: str):
    """Classify an existing FIR by ID."""
    row = query_one("SELECT * FROM firs WHERE fir_id = ?", (fir_id,))
    if not row:
        raise HTTPException(status_code=404, detail=f"FIR {fir_id} not found")

    bob = get_bob()
    try:
        result = bob.classify_fir(row)
        return {
            "fir_id": fir_id,
            "classification": result,
            "bob_source": "mock" if bob.use_mock else "bob-live",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===============================================================
# ⭐ Offender Case Brief
# ===============================================================
@app.get("/api/offenders/{name}/brief")
def offender_brief(name: str):
    """Generate a detailed case brief for a named offender across all their FIRs."""
    # Gather all FIRs with this name (exact or alias match)
    firs = query("""
        SELECT fir_id, state, district, police_station, city,
               incident_date, crime_type, modus_operandi, time_bucket,
               vehicle_used, weapon_or_tool, property_or_target,
               estimated_loss_inr, arrest_status, investigation_status,
               accused_alias, victim_profile, case_priority
        FROM firs
        WHERE LOWER(accused_name) = LOWER(?)
           OR LOWER(COALESCE(accused_alias, '')) = LOWER(?)
    """, (name, name))

    if not firs:
        raise HTTPException(status_code=404, detail=f"No FIRs found for offender '{name}'")

    # Aggregate
    aliases = sorted({f["accused_alias"] for f in firs if f.get("accused_alias")})
    crime_types = sorted({f["crime_type"] for f in firs if f.get("crime_type")})
    states = sorted({f["state"] for f in firs if f.get("state")})
    districts = sorted({f["district"] for f in firs if f.get("district")})
    police_stations = sorted({f["police_station"] for f in firs if f.get("police_station")})
    mos = sorted({f["modus_operandi"] for f in firs if f.get("modus_operandi")})
    time_buckets = sorted({f["time_bucket"] for f in firs if f.get("time_bucket")})
    weapons = sorted({f["weapon_or_tool"] for f in firs if f.get("weapon_or_tool") and f["weapon_or_tool"] != "Not applicable"})
    total_loss = sum(f["estimated_loss_inr"] or 0 for f in firs)
    arrest_count = sum(1 for f in firs if f.get("arrest_status") == "Arrested")

    offender_data = {
        "name": name,
        "aliases": aliases,
        "fir_count": len(firs),
        "crime_types": crime_types,
        "states": states,
        "districts": districts,
        "police_stations": police_stations,
        "modus_operandi": mos,
        "time_buckets": time_buckets,
        "weapons": weapons,
        "total_estimated_loss_inr": total_loss,
        "arrests": arrest_count,
        "fir_ids": [f["fir_id"] for f in firs],
        "firs": firs,
    }

    bob = get_bob()
    try:
        brief = bob.offender_brief(offender_data)
        return {
            "offender": name,
            "data": offender_data,
            "brief": brief,
            "bob_source": "mock" if bob.use_mock else "bob-live",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===============================================================
# ⭐ Network Finder using Bob
# ===============================================================
class NetworkQueryRequest(BaseModel):
    query: str


@app.post("/api/network/smart-search")
def network_smart_search(req: NetworkQueryRequest):
    """
    Natural-language network search — Bob parses intent, we return matching nodes.
    """
    q = (req.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query is required")

    # Get available filter options for Bob's context
    context = {
        "states": [r["state"] for r in query("SELECT DISTINCT state FROM firs WHERE state IS NOT NULL")],
        "districts": [r["district"] for r in query("SELECT DISTINCT district FROM firs WHERE district IS NOT NULL")],
        "crime_types": [r["crime_type"] for r in query("SELECT DISTINCT crime_type FROM firs WHERE crime_type IS NOT NULL")],
        "modus_operandi": [r["modus_operandi"] for r in query("SELECT DISTINCT modus_operandi FROM firs WHERE modus_operandi IS NOT NULL LIMIT 100")],
    }

    bob = get_bob()
    try:
        parsed = bob.parse_network_query(q, context)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query parsing failed: {e}")

    # Build SQL WHERE from parsed filters
    where, params = [], []
    if parsed.get("state"):
        where.append("state = ?"); params.append(parsed["state"])
    if parsed.get("district"):
        where.append("district = ?"); params.append(parsed["district"])
    if parsed.get("crime_type"):
        where.append("crime_type = ?"); params.append(parsed["crime_type"])
    if parsed.get("modus_operandi"):
        where.append("modus_operandi = ?"); params.append(parsed["modus_operandi"])
    if parsed.get("time_bucket"):
        where.append("time_bucket = ?"); params.append(parsed["time_bucket"])
    if parsed.get("accused_name"):
        where.append("accused_name LIKE ?"); params.append(f"%{parsed['accused_name']}%")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = query(f"""
        SELECT fir_id, accused_name, accused_alias, state,
               district, police_station, crime_type,
               modus_operandi, location_type
        FROM firs
        {where_sql}
        LIMIT 400
    """, tuple(params))

    # Build nodes + edges (same shape as /api/network)
    nodes_map: dict[str, dict] = {}
    edges: list[dict] = []
    edge_set: set[tuple[str, str]] = set()

    def add_node(id_, label, type_, meta=None):
        if id_ not in nodes_map:
            nodes_map[id_] = {"id": id_, "label": label, "type": type_, "meta": meta or {}}

    def add_edge(a, b, kind="linked"):
        key = tuple(sorted([a, b]))
        if key in edge_set: return
        edge_set.add(key)
        edges.append({"source": a, "target": b, "kind": kind})

    for r in rows:
        fir_id = r["fir_id"]
        add_node(f"fir:{fir_id}", fir_id, "fir", {"crime_type": r["crime_type"]})
        if r.get("accused_name"):
            acc_id = f"accused:{r['accused_name']}"
            add_node(acc_id, r["accused_name"], "accused", {"alias": r.get("accused_alias")})
            add_edge(acc_id, f"fir:{fir_id}", "appeared_in")
        if r.get("state"):
            st_id = f"state:{r['state']}"
            add_node(st_id, r["state"], "state")
            add_edge(f"fir:{fir_id}", st_id, "in_state")
        if r.get("modus_operandi"):
            mo_id = f"mo:{r['modus_operandi']}"
            add_node(mo_id, r["modus_operandi"], "mo")
            add_edge(f"fir:{fir_id}", mo_id, "used_mo")

    return {
        "query": q,
        "parsed": parsed,
        "nodes": list(nodes_map.values()),
        "edges": edges,
        "counts": {"nodes": len(nodes_map), "edges": len(edges)},
        "bob_source": "mock" if bob.use_mock else "bob-live",
    }

@app.delete("/api/firs/{fir_id}")
def delete_fir(fir_id: str):
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM firs WHERE fir_id = ?", (fir_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"FIR {fir_id} not found")
    finally:
        conn.close()
    return {"status": "deleted", "fir_id": fir_id}


# ===============================================================
# Auto-generate narrative
# ===============================================================
class GenerateNarrativeRequest(BaseModel):
    state: str = ""
    district: str = ""
    police_station: str = ""
    city: str = ""
    incident_date: str = ""
    incident_time: str = ""
    crime_type: str = ""
    location_type: str = ""
    incident_location: str = ""
    complainant_name: str = ""
    victim_age: int | None = None
    victim_gender: str = ""
    victim_occupation: str = ""
    victim_profile: str = ""
    accused_name: str = ""
    accused_alias: str = ""
    modus_operandi: str = ""
    time_bucket: str = ""
    vehicle_used: str = ""
    weapon_or_tool: str = ""
    property_or_target: str = ""
    estimated_loss_inr: int | None = None
    evidence_type: str = ""
    digital_evidence: str = ""
    cctv_status: str = ""
    arrest_status: str = ""
    recovery_status: str = ""
    investigation_status: str = ""
    case_priority: str = ""


@app.post("/api/firs/generate-narrative")
def generate_narrative(req: GenerateNarrativeRequest):
    fir_data = req.model_dump(exclude_none=True)
    bob = get_bob()
    try:
        narrative = bob.generate_narrative(fir_data)
        return {
            "narrative": narrative,
            "bob_source": "mock" if bob.use_mock else "bob-live",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===============================================================
# ⭐ SMART INGEST — Parse messy narrative into full structured record
# ===============================================================
class SmartIngestRequest(BaseModel):
    narrative: str
    # Optional seed fields the user may have already filled
    state: str = ""
    district: str = ""
    police_station: str = ""
    city: str = ""
    crime_type: str = ""
    incident_date: str = ""
    incident_time: str = ""
    complainant_name: str = ""
    victim_age: int | None = None
    victim_gender: str = ""
    accused_name: str = ""
    modus_operandi: str = ""


@app.post("/api/firs/smart-ingest")
def smart_ingest(req: SmartIngestRequest):
    """
    Bob parses a raw narrative and returns a full structured record,
    ready to be saved to the DB. Also cleans the narrative.
    """
    if not req.narrative or len(req.narrative.strip()) < 20:
        raise HTTPException(status_code=400, detail="Narrative too short to parse")

    seed = {
        "state": req.state,
        "district": req.district,
        "police_station": req.police_station,
        "city": req.city,
        "crime_type": req.crime_type,
        "incident_date": req.incident_date,
        "incident_time": req.incident_time,
        "complainant_name": req.complainant_name,
        "victim_age": req.victim_age,
        "victim_gender": req.victim_gender,
        "accused_name": req.accused_name,
        "modus_operandi": req.modus_operandi,
    }

    bob = get_bob()
    try:
        result = bob.smart_ingest(req.narrative, seed=seed)
        return {
            "extracted": result,
            "bob_source": "mock" if bob.use_mock else "bob-live",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===============================================================
# ⭐ SMART INGEST + SAVE — Extract AND persist in one call
# ===============================================================
@app.post("/api/firs/smart-ingest-and-save")
def smart_ingest_and_save(req: SmartIngestRequest):
    """
    Full pipeline: parse narrative → structure → classify → save.
    """
    if not req.narrative or len(req.narrative.strip()) < 20:
        raise HTTPException(status_code=400, detail="Narrative too short to parse")

    seed = {
        "state": req.state,
        "district": req.district,
        "police_station": req.police_station,
        "city": req.city,
        "crime_type": req.crime_type,
        "incident_date": req.incident_date,
        "incident_time": req.incident_time,
        "complainant_name": req.complainant_name,
        "victim_age": req.victim_age,
        "victim_gender": req.victim_gender,
        "accused_name": req.accused_name,
        "modus_operandi": req.modus_operandi,
    }

    bob = get_bob()

    # 1. Extract
    try:
        extracted = bob.smart_ingest(req.narrative, seed=seed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")

    # 2. Also classify for severity/priority
    try:
        classification = bob.classify_fir(extracted)
    except Exception:
        classification = {}

    # 3. Auto-generate FIR ID
    row = query_one("SELECT MAX(CAST(SUBSTR(fir_id, 5) AS INTEGER)) AS m FROM firs WHERE fir_id LIKE 'FIR-%'")
    next_n = (row["m"] or 0) + 1
    fir_id = f"FIR-{next_n:04d}"

    # 4. Insert
    conn = get_connection()
    try:
        conn.execute("""
            INSERT INTO firs (
                fir_id, state, district, police_station, city,
                incident_date, report_date, incident_time, crime_type, bns_section,
                fir_narrative, complainant_name, victim_age, victim_gender,
                victim_occupation, victim_profile, accused_name, accused_alias,
                accused_known, location_type, incident_location, modus_operandi,
                time_bucket, vehicle_used, weapon_or_tool, property_or_target,
                estimated_loss_inr, evidence_type, digital_evidence, cctv_status,
                witness_count, evidence_item_count, arrest_status, recovery_status,
                investigation_status, case_priority, pattern_keywords,
                linked_phone, linked_upi_or_account
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            fir_id,
            extracted.get("state", ""),
            extracted.get("district", ""),
            extracted.get("police_station", ""),
            extracted.get("city", ""),
            extracted.get("incident_date", ""),
            extracted.get("incident_date", ""),
            extracted.get("incident_time", ""),
            extracted.get("crime_type", "Unclassified"),
            extracted.get("bns_section", ""),
            extracted.get("cleaned_narrative", req.narrative),
            extracted.get("complainant_name", ""),
            extracted.get("victim_age"),
            extracted.get("victim_gender", ""),
            extracted.get("victim_occupation", ""),
            extracted.get("victim_profile", ""),
            extracted.get("accused_name", ""),
            extracted.get("accused_alias", ""),
            1 if extracted.get("accused_known") else 0,
            extracted.get("location_type", ""),
            extracted.get("incident_location", ""),
            extracted.get("modus_operandi", ""),
            extracted.get("time_bucket", ""),
            extracted.get("vehicle_used", ""),
            extracted.get("weapon_or_tool", ""),
            extracted.get("property_or_target", ""),
            extracted.get("estimated_loss_inr") or 0,
            extracted.get("evidence_type", ""),
            extracted.get("digital_evidence", ""),
            extracted.get("cctv_status", ""),
            extracted.get("witness_count") or 0,
            0,
            extracted.get("arrest_status", ""),
            extracted.get("recovery_status", ""),
            "Under Investigation",
            extracted.get("case_priority", "Medium"),
            "",
            "",
            "",
        ))

        # Upsert taxonomy
        crime = extracted.get("crime_type", "Unclassified")
        existing_tax = conn.execute(
            "SELECT crime_type FROM crime_taxonomy WHERE LOWER(crime_type) = LOWER(?)",
            (crime,)
        ).fetchone()
        if existing_tax:
            conn.execute(
                "UPDATE crime_taxonomy SET fir_count = fir_count + 1 WHERE crime_type = ?",
                (existing_tax["crime_type"],)
            )
        else:
            conn.execute(
                "INSERT INTO crime_taxonomy (crime_type, first_seen, fir_count) VALUES (?, ?, 1)",
                (crime, datetime.now().isoformat())
            )

        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Save failed: {e}")
    finally:
        conn.close()

    return {
        "status": "created",
        "fir_id": fir_id,
        "extracted": extracted,
        "classification": classification,
        "bob_source": "mock" if bob.use_mock else "bob-live",
    }


@app.get("/api/network")
def network_graph(
    max_nodes: int = Query(300, ge=10, le=5000),
    cluster_id: Optional[str] = None,
    search: Optional[str] = None,
):
    if search:
        q = f"%{search.lower()}%"
        rows = query("""
            SELECT fir_id, accused_name, accused_alias, state,
                   district, police_station, crime_type,
                   modus_operandi, location_type
            FROM firs
            WHERE LOWER(COALESCE(accused_name, '')) LIKE ?
               OR LOWER(COALESCE(accused_alias, '')) LIKE ?
               OR LOWER(fir_id) LIKE ?
               OR LOWER(COALESCE(state, '')) LIKE ?
               OR LOWER(COALESCE(district, '')) LIKE ?
               OR LOWER(COALESCE(police_station, '')) LIKE ?
               OR LOWER(COALESCE(modus_operandi, '')) LIKE ?
               OR LOWER(COALESCE(crime_type, '')) LIKE ?
            LIMIT ?
        """, (q, q, q, q, q, q, q, q, max_nodes))
    elif cluster_id:
        rows = query("""
            SELECT fir_id, accused_name, accused_alias, state,
                   district, police_station, crime_type,
                   modus_operandi, location_type
            FROM firs
            WHERE fir_id IN (SELECT fir_id FROM firs WHERE modus_operandi = ?)
            LIMIT ?
        """, (cluster_id, max_nodes))
    else:
        rows = query("""
            SELECT fir_id, accused_name, accused_alias, state,
                   district, police_station, crime_type,
                   modus_operandi, location_type
            FROM firs
            WHERE accused_name IS NOT NULL AND accused_name NOT LIKE '%Unknown%'
            ORDER BY fir_id DESC
            LIMIT ?
        """, (max_nodes,))

    nodes_map: dict[str, dict] = {}
    edges: list[dict] = []
    edge_set: set[tuple[str, str]] = set()

    def add_node(id_, label, type_, meta=None):
        if id_ not in nodes_map:
            nodes_map[id_] = {"id": id_, "label": label, "type": type_, "meta": meta or {}}

    def add_edge(a, b, kind="linked"):
        key = tuple(sorted([a, b]))
        if key in edge_set: return
        edge_set.add(key)
        edges.append({"source": a, "target": b, "kind": kind})

    for r in rows:
        fir_id = r["fir_id"]
        add_node(f"fir:{fir_id}", fir_id, "fir", {"crime_type": r["crime_type"]})
        if r.get("accused_name"):
            acc_id = f"accused:{r['accused_name']}"
            add_node(acc_id, r["accused_name"], "accused", {"alias": r.get("accused_alias")})
            add_edge(acc_id, f"fir:{fir_id}", "appeared_in")
        if r.get("state"):
            st_id = f"state:{r['state']}"
            add_node(st_id, r["state"], "state")
            add_edge(f"fir:{fir_id}", st_id, "in_state")
        if r.get("modus_operandi"):
            mo_id = f"mo:{r['modus_operandi']}"
            add_node(mo_id, r["modus_operandi"], "mo")
            add_edge(f"fir:{fir_id}", mo_id, "used_mo")

    node_list = list(nodes_map.values())

    return {
        "nodes": node_list,
        "edges": edges,
        "counts": {"nodes": len(node_list), "edges": len(edges)},
    }


# ===============================================================
# ⭐ LIST nodes for search autocomplete (all FIRs, paginated)
# ===============================================================
@app.get("/api/network/search")
def network_search(
    q: str = Query("", min_length=0),
    limit: int = Query(50, ge=1, le=500),
):
    """
    Fast search across ALL FIRs regardless of position — used by
    the graph search box so users can find FIR-1001 even if it's not in top 300.
    """
    if not q or len(q) < 2:
        return {"results": []}

    like = f"%{q.lower()}%"
    rows = query("""
        SELECT DISTINCT
            fir_id, accused_name, accused_alias, state, district,
            police_station, crime_type, modus_operandi
        FROM firs
        WHERE LOWER(fir_id) LIKE ?
           OR LOWER(COALESCE(accused_name, '')) LIKE ?
           OR LOWER(COALESCE(accused_alias, '')) LIKE ?
           OR LOWER(COALESCE(state, '')) LIKE ?
           OR LOWER(COALESCE(district, '')) LIKE ?
           OR LOWER(COALESCE(police_station, '')) LIKE ?
           OR LOWER(COALESCE(modus_operandi, '')) LIKE ?
        LIMIT ?
    """, (like, like, like, like, like, like, like, limit))

    results = []
    for r in rows:
        if r.get("accused_name"):
            results.append({
                "id": f"accused:{r['accused_name']}",
                "label": r["accused_name"],
                "type": "accused",
                "fir_id": r["fir_id"],
                "hint": f"{r.get('crime_type','')} · {r.get('state','')}",
            })
        results.append({
            "id": f"fir:{r['fir_id']}",
            "label": r["fir_id"],
            "type": "fir",
            "fir_id": r["fir_id"],
            "hint": f"{r.get('crime_type','')} · {r.get('police_station','')}",
        })

    # Dedupe by id
    seen = set()
    deduped = []
    for x in results:
        if x["id"] in seen: continue
        seen.add(x["id"])
        deduped.append(x)

    return {"results": deduped[:limit]}

@app.get("/api/network/repeat")
def network_repeat(
    min_cluster_size: int = Query(2, ge=2, le=20),
    min_confidence:   float = Query(0.7, ge=0.0, le=1.0),
    top_clusters:     int   = Query(15, ge=1, le=50),
):
    clusters = compute_repeat_offenders(
        min_cluster_size=min_cluster_size, min_confidence=min_confidence,
    )[:top_clusters]

    nodes_map: dict[str, dict] = {}
    edges: list[dict] = []
    edge_set: set[tuple[str, str, str]] = set()

    def add_node(id_, label, type_, meta=None):
        if id_ not in nodes_map:
            nodes_map[id_] = {"id": id_, "label": label, "type": type_, "meta": meta or {}}

    def add_edge(a, b, kind):
        key = (a, b, kind)
        if key in edge_set: return
        edge_set.add(key)
        edges.append({"source": a, "target": b, "kind": kind})

    for c in clusters:
        mo_label = c["signature"] or c["crime_type"] or "unknown-mo"
        mo_id = f"mo:{c['fingerprint']}"
        add_node(mo_id, mo_label[:60], "mo", {
            "fir_count": c["fir_count"], "confidence": c["confidence"],
            "crime_type": c["crime_type"], "states": c["states"],
        })
        for name in c["accused_names"]:
            acc_id = f"accused:{name}"
            add_node(acc_id, name, "accused", {
                "cluster_size": c["fir_count"], "confidence": c["confidence"],
            })
            add_edge(acc_id, mo_id, "used_mo")
        for alias in c["aliases"]:
            al_id = f"alias:{alias}"
            add_node(al_id, alias, "alias")
            add_edge(al_id, mo_id, "used_mo")

        # ⭐ Pre-position
    node_list = list(nodes_map.values())
    return {
        "mode": "repeat",
        "nodes": node_list,
        "edges": edges,
        "cluster_count": len(clusters),
        "counts": {
            "nodes": len(node_list), "edges": len(edges),
            "accused": sum(1 for n in node_list if n["type"] == "accused"),
            "clusters": len(clusters),
        },
    }


# ===============================================================
# Global exception handler
# ===============================================================
@app.exception_handler(Exception)
async def unhandled(request, exc):
    return JSONResponse(status_code=500, content={"error": str(exc), "type": exc.__class__.__name__})