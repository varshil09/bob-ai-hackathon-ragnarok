"""
CHAKRA — IBM Bob Client
=======================

Two modes:
  1. MOCK (default) — deterministic rule-based logic, no API calls.
  2. REAL          — calls IBM Bob Inference API (OpenAI-compatible).

Bob API specifics:
  - Auth:    Authorization: Apikey <key>   (NOT Bearer)
  - Base:    https://api.us-east.bob.ibm.com/inference/v1
  - Endpoint: /chat/completions  (OpenAI format)
  - Model:   "premium"           (fixed tier)
  - Headers: User-Agent must be set to bypass Cloudflare WAF

Anti-hallucination:
  - Strict system prompts with grounding rules
  - Refusal script for insufficient context
  - Post-check rejects invented FIR IDs
  - Schema validation on structured output
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from config import settings


class BobClient:
    def __init__(self):
        self.use_mock = settings.use_mock_bob
        self._api_key = getattr(settings, "bob_api_key", None) or ""
        self._base_url = getattr(settings, "bob_base_url",
                                  "https://api.us-east.bob.ibm.com/inference/v1")
        self._model_id = getattr(settings, "bob_model_id", "premium")

    # -----------------------------------------------------------
    # 1. Entity extraction
    # -----------------------------------------------------------
    def extract_entities(self, narrative: str) -> dict:
        if self.use_mock:
            return _mock_extract_entities(narrative)
        return self._real_extract_entities(narrative)

    # -----------------------------------------------------------
    # 2. Station summary
    # -----------------------------------------------------------
    def summarize_station(self, station_data: dict) -> str:
        if self.use_mock:
            return _mock_summarize_station(station_data)
        return self._real_summarize_station(station_data)

    # -----------------------------------------------------------
    # 3. Natural-language Q&A
    # -----------------------------------------------------------
    def answer_query(self, question: str, context: list[dict]) -> str:
        if self.use_mock:
            return _mock_answer_query(question, context)
        return self._real_answer_query(question, context)

    # -----------------------------------------------------------
    # 4. Auto-generate FIR narrative from structured fields
    # -----------------------------------------------------------
    def generate_narrative(self, fir_data: dict) -> str:
        if self.use_mock:
            return _mock_generate_narrative(fir_data)
        return self._real_generate_narrative(fir_data)

    # -----------------------------------------------------------
    # 5. Classify a novel crime type against the taxonomy
    # -----------------------------------------------------------
    def classify_crime(self, raw_crime: str) -> dict:
        if self.use_mock:
            return _mock_classify_crime(raw_crime)
        return self._real_classify_crime(raw_crime)

        # -----------------------------------------------------------
    # 6. FIR classification — severity, urgency, priority, BNS
    # -----------------------------------------------------------
    def classify_fir(self, fir_data: dict) -> dict:
        """Full FIR classification: severity, urgency, suggested sections."""
        if self.use_mock:
            return _mock_classify_fir(fir_data)
        return self._real_classify_fir(fir_data)

    def _real_classify_fir(self, fir_data: dict) -> dict:
        system_prompt = """You are an Indian police FIR classifier.

        Given FIR fields, produce a structured classification:
        {
        "severity": "Low | Medium | High | Critical",
        "urgency": "Low | Medium | High",
        "investigation_priority": "Low | Medium | High",
        "suggested_bns_sections": ["list of suggested BNS/legal sections as strings"],
        "reasoning": "one sentence explaining the classification",
        "victim_risk": "Low | Medium | High",
        "public_interest": "Low | Medium | High"
        }

        STRICT RULES:
        1. Base every field on the FIR data provided.
        2. suggested_bns_sections must be plausible Indian law references.
        3. Return VALID JSON only, no markdown, no explanation outside the JSON."""

        clean = {k: v for k, v in fir_data.items() if v not in (None, "", "—", "Not applicable")}
        prompt = f"FIR fields:\n{json.dumps(clean, indent=2, ensure_ascii=False)}\n\nClassify:"

        try:
            raw = self._call_bob(prompt, system=system_prompt, max_tokens=350)
            raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE)
            return json.loads(raw)
        except Exception as e:
            result = _mock_classify_fir(fir_data)
            result["_fallback_reason"] = str(e)
            return result

    # -----------------------------------------------------------
    # 7. Offender case brief — full narrative
    # -----------------------------------------------------------
    def offender_brief(self, offender_data: dict) -> str:
        """Generate a detailed case brief for a repeat offender."""
        if self.use_mock:
            return _mock_offender_brief(offender_data)
        return self._real_offender_brief(offender_data)

    def _real_offender_brief(self, offender_data: dict) -> str:
        system_prompt = """You are a senior crime intelligence analyst writing a case brief for a repeat offender.

        STRUCTURE (5 short paragraphs, each 2-3 sentences):
        1. PROFILE: Who they are, aliases, span of their activity.
        2. PATTERN: Their modus operandi, crime types, preferred times and locations.
        3. EVOLUTION: Any escalation or geographic expansion visible in the data.
        4. NETWORK: Connections to other accused or clusters.
        5. ACTION RECOMMENDATION: One concrete next step for investigators.

        STRICT RULES:
        1. Use ONLY facts from the offender data provided. Do not invent names, FIRs, or numbers.
        2. Every number must appear verbatim in the input.
        3. Use **bold** for numbers and key names.
        4. No preamble, no closing pleasantries.
        5. If the data is thin (< 2 FIRs), say so explicitly rather than speculating."""

        prompt = f"Offender data:\n{json.dumps(offender_data, indent=2, ensure_ascii=False)}\n\nWrite the case brief:"

        try:
            return self._call_bob(prompt, system=system_prompt, max_tokens=600)
        except Exception as e:
            return _mock_offender_brief(offender_data) + f"\n\n[Bob fallback: {e}]"

    # -----------------------------------------------------------
    # 8. Network finder — natural-language graph search
    # -----------------------------------------------------------
    def parse_network_query(self, query: str, context: dict) -> dict:
        """Parse a natural-language network query into structured filters."""
        if self.use_mock:
            return _mock_parse_network_query(query, context)
        return self._real_parse_network_query(query, context)

    # -----------------------------------------------------------
    # 9. Smart Ingest — parse messy narrative into ALL DB fields
    # -----------------------------------------------------------
    def smart_ingest(self, narrative: str, seed: dict = None) -> dict:
        """
        Parse a messy FIR narrative into a full structured record.
        `seed` is optional — user-provided hints that should not be overwritten.
        """
        if self.use_mock:
            return _mock_smart_ingest(narrative, seed or {})
        return self._real_smart_ingest(narrative, seed or {})

    def _real_smart_ingest(self, narrative: str, seed: dict) -> dict:
        system_prompt = """You are a forensic FIR intelligence parser for Indian police.

You receive a messy, free-text FIR narrative. Your task: extract EVERY structured field.

Return VALID JSON ONLY (no markdown, no preamble) with EXACTLY these keys:

{
  "crime_type": "one of: Mobile Snatching, Cyber Fraud, Vehicle Theft, Burglary, Robbery, UPI Fraud, Extortion, Fraud / Cheating, Assault, Murder / Homicide, Sexual Offence, Kidnapping / Abduction, Missing Person, Drug Possession, or a new Title Case category",
  "bns_section": "suggested legal section or empty string",
  "state": "state name or empty",
  "district": "district name or empty",
  "police_station": "police station name or empty",
  "city": "city name or empty",
  "incident_date": "DD-MM-YYYY or empty",
  "incident_time": "HH:MM or empty",
  "time_bucket": "morning | afternoon | evening | night | late night | empty",
  "complainant_name": "full name or empty",
  "victim_age": integer or null,
  "victim_gender": "Male | Female | Other | empty",
  "victim_occupation": "occupation or empty",
  "victim_profile": "short descriptive profile or empty",
  "accused_name": "primary accused name or empty",
  "accused_alias": "alias or empty",
  "accused_known": true | false,
  "location_type": "online | roadside | market | residential area | commercial area | transit area | workplace | empty",
  "incident_location": "specific location string or empty",
  "modus_operandi": "short phrase, e.g. 'motorcycle approach' or 'fake refund request'",
  "vehicle_used": "vehicle type or empty",
  "weapon_or_tool": "weapon/tool or empty",
  "property_or_target": "property or victim target or empty",
  "estimated_loss_inr": integer or 0,
  "evidence_type": "evidence detail or empty",
  "digital_evidence": "digital evidence type or empty",
  "cctv_status": "Available | Not available | Requested | empty",
  "witness_count": integer or 0,
  "arrest_status": "Not arrested | Arrested | Notice issued | Accused unidentified | empty",
  "recovery_status": "string or empty",
  "case_priority": "Low | Medium | High",
  "severity": "Low | Medium | High | Critical",
  "cleaned_narrative": "the narrative rewritten in clean, formal CCTNS FIR style — single paragraph, no typos, no missing transitions",
  "confidence": 0.0 to 1.0 (your confidence in the extraction),
  "notes": "one sentence on what was unclear or missing in the original"
}

STRICT RULES:
1. Extract ONLY what is present or clearly implied. Empty fields must be empty strings / null / 0.
2. NEVER invent names, dates, locations, or amounts.
3. cleaned_narrative must read like an official FIR: "On {date} at about {time}, the complainant {name}, aged {age}, reported an alleged {crime} incident at/near a {location} within the jurisdiction of {police_station}, {district}, {state}. The reported modus operandi was {mo}..."
4. If a field is provided in the seed hints, prefer the seed value.
5. Return ONLY the JSON object."""

        seed_str = json.dumps({k: v for k, v in seed.items() if v}, indent=2) if seed else "{}"

        prompt = f"""<narrative>
{narrative}
</narrative>

<seed_hints>
{seed_str}
</seed_hints>

Extract structured fields as JSON:"""

        try:
            raw = self._call_bob(prompt, system=system_prompt, max_tokens=1200)
            raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE)
            parsed = json.loads(raw)

            # Defensive coercion
            for k in ["victim_age", "estimated_loss_inr", "witness_count"]:
                if parsed.get(k) is None:
                    parsed[k] = 0 if k != "victim_age" else None
                try:
                    parsed[k] = int(parsed[k]) if parsed[k] is not None else parsed[k]
                except (ValueError, TypeError):
                    parsed[k] = None if k == "victim_age" else 0

            # Empty string defaults
            for k in ["bns_section", "state", "district", "police_station", "city",
                      "incident_date", "incident_time", "time_bucket", "complainant_name",
                      "victim_gender", "victim_occupation", "victim_profile",
                      "accused_name", "accused_alias", "location_type", "incident_location",
                      "modus_operandi", "vehicle_used", "weapon_or_tool", "property_or_target",
                      "evidence_type", "digital_evidence", "cctv_status", "arrest_status",
                      "recovery_status"]:
                if parsed.get(k) is None:
                    parsed[k] = ""

            if not parsed.get("crime_type"):
                parsed["crime_type"] = "Unclassified"
            if not parsed.get("case_priority"):
                parsed["case_priority"] = "Medium"

            return parsed
        except Exception as e:
            result = _mock_smart_ingest(narrative, seed)
            result["_fallback_reason"] = str(e)
            return result

    def _real_parse_network_query(self, query: str, context: dict) -> dict:
        system_prompt = """You are a query parser for a criminal network graph.

        Given a user's natural-language query and available filter values, extract structured filters:
        {
        "node_types": ["accused", "fir", "state", "mo", "alias"],
        "state": "state name or null",
        "district": "district name or null",
        "crime_type": "crime type or null",
        "modus_operandi": "MO string or null",
        "time_bucket": "time bucket or null",
        "accused_name": "accused name or null",
        "keywords": ["list of extra keywords"],
        "explanation": "one sentence explaining what the user wants"
        }

        STRICT RULES:
        1. Only use values that make sense given the available filter options.
        2. If a filter isn't mentioned, set it to null.
        3. Return VALID JSON only."""

        prompt = f"User query: {query}\n\nAvailable filters:\n{json.dumps(context, indent=2)}\n\nParse:"

        try:
            raw = self._call_bob(prompt, system=system_prompt, max_tokens=250)
            raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE)
            return json.loads(raw)
        except Exception as e:
            result = _mock_parse_network_query(query, context)
            result["_fallback_reason"] = str(e)
            return result


    # ===========================================================
    # REAL — Bob Inference API
    # ===========================================================
    def _call_bob(self, prompt: str, system: str = "", max_tokens: int = 500) -> str:
        if not self._api_key:
            raise RuntimeError("BOB_API_KEY not set. Set it in .env to use real Bob.")

        url = f"{self._base_url.rstrip('/')}/chat/completions"
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self._model_id,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Apikey {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "ibm-bob-openwiki-provider",
        }

        resp = httpx.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()

    # -----------------------------------------------------------
    # REAL — Entity extraction
    # -----------------------------------------------------------
    def _real_extract_entities(self, narrative: str) -> dict:
        if not narrative or len(narrative.strip()) < 20:
            return {"accused": [], "aliases": [], "modus_operandi": None,
                    "locations": [], "weapons": [], "vehicles": [], "victim_profile": None}

        system_prompt = """You are a forensic text parser for Indian police FIRs.
STRICT RULES:
1. Extract ONLY entities that appear verbatim in the narrative.
2. If a field is not mentioned, return empty list [] or null. Do NOT guess.
3. Do NOT normalize names. Do NOT invent aliases.
4. Return VALID JSON only. No markdown fences. No explanation.

SCHEMA:
{
  "accused": [...],
  "aliases": [...],
  "modus_operandi": "... or null",
  "locations": [...],
  "weapons": [...],
  "vehicles": [...],
  "victim_profile": "... or null"
}"""

        prompt = f"""Narrative:
\"\"\"{narrative}\"\"\"

Return JSON per schema:"""
        try:
            raw = self._call_bob(prompt, system=system_prompt, max_tokens=400)
            raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE)
            parsed = json.loads(raw)
            for k in ["accused", "aliases", "locations", "weapons", "vehicles"]:
                if not isinstance(parsed.get(k), list):
                    parsed[k] = []
            for k in ["modus_operandi", "victim_profile"]:
                if parsed.get(k) is not None and not isinstance(parsed[k], str):
                    parsed[k] = None
            return parsed
        except Exception as e:
            result = _mock_extract_entities(narrative)
            result["_fallback_reason"] = str(e)
            return result

    # -----------------------------------------------------------
    # REAL — Station briefing
    # -----------------------------------------------------------
    def _real_summarize_station(self, station_data: dict) -> str:
        safe_stats = {
            "police_station":     station_data.get("police_station"),
            "total_firs":         station_data.get("total_firs"),
            "top_crime_type":     station_data.get("top_crime_type"),
            "top_time_bucket":    station_data.get("top_time_bucket"),
            "top_modus_operandi": station_data.get("top_modus_operandi"),
            "arrest_rate_pct":    station_data.get("arrest_rate_pct"),
            "crime_breakdown":    station_data.get("crime_breakdown", [])[:6],
            "repeat_offenders":   station_data.get("repeat_offenders", [])[:3],
        }
        system_prompt = """You are a crime analyst briefing a police station head.
STRICT RULES:
1. Use ONLY the statistics provided.
2. Every number you cite must appear verbatim in the input data.
3. If a field is missing, do not guess.
4. Maximum 5 sentences.
5. Use **bold** for numbers and crime types. No preamble. No bullet lists.

STRUCTURE:
Sentence 1: total FIRs + dominant crime.
Sentence 2: peak time-of-day.
Sentence 3: repeat-offender observation (or state none).
Sentence 4: one actionable recommendation.
Sentence 5: notable pattern."""

        user_prompt = f"Station statistics:\n{json.dumps(safe_stats, indent=2)}\n\nWrite the briefing:"
        try:
            return self._call_bob(user_prompt, system=system_prompt, max_tokens=350)
        except Exception as e:
            return _mock_summarize_station(station_data) + f"\n\n[Bob fallback: {e}]"

    # -----------------------------------------------------------
    # REAL — Grounded Q&A
    # -----------------------------------------------------------
    def _real_answer_query(self, question: str, context: list[dict]) -> str:
        if not context:
            context_block = "(NO MATCHING FIRs WERE RETRIEVED FOR THIS QUERY)"
            grounding_note = ("The context is empty. You MUST respond with the refusal message. "
                              "Do not attempt to answer from general knowledge.")
        else:
            grounding_note = (f"You may ONLY use facts from the {len(context)} FIR records below. "
                              "Do NOT invent additional FIRs, names, or numbers.")
            lines = []
            for c in context[:10]:
                lines.append(
                    f"FIR_ID: {c.get('fir_id', '?')}\n"
                    f"  Crime: {c.get('crime_type', '?')}\n"
                    f"  State: {c.get('state', '?')} | District: {c.get('district', '?')} | "
                    f"Station: {c.get('police_station', '?')}\n"
                    f"  Accused: {c.get('accused_name', 'Unknown')} "
                    f"(alias: {c.get('accused_alias', '—')})\n"
                    f"  Narrative: {(c.get('fir_narrative', '') or '')[:300]}"
                )
            context_block = "\n\n".join(lines)

        system_prompt = """You are CHAKRA, a forensic intelligence analyst for Indian police.

STRICT OPERATING RULES:
1. Answer ONLY from the <context> block.
2. NEVER use outside knowledge or assumptions.
3. NEVER invent FIR IDs, names, locations, or numbers.
4. If the context lacks the answer, say VERBATIM:
   "I don't have enough evidence in the retrieved FIRs to answer that. Try narrowing or rephrasing your query."
5. Every number MUST appear verbatim in context. No arithmetic.
6. Every name MUST be verbatim from context.

OUTPUT:
- Max 4 sentences.
- Use **bold** for numbers and names.
- Cite FIR IDs in parentheses.
- No headers, no bullets, no preamble. Do not say "based on the context"."""

        user_prompt = f"""<context>
{context_block}
</context>

<grounding_rule>
{grounding_note}
</grounding_rule>

<question>
{question}
</question>

Answer (using ONLY the context above):"""

        try:
            answer = self._call_bob(user_prompt, system=system_prompt, max_tokens=250)

            mentioned_firs = set(re.findall(r"FIR-\d+", answer))
            valid_firs = {c.get("fir_id") for c in context if c.get("fir_id")}
            invalid_firs = mentioned_firs - valid_firs
            if invalid_firs:
                print(f"[Bob] HALLUCINATION DETECTED — invented FIRs: {invalid_firs}")
                return ("I don't have enough evidence in the retrieved FIRs to answer that. "
                        "Try narrowing or rephrasing your query.")

            if "I don't have enough evidence" in answer:
                print(f"[Bob] REFUSED — q: {question[:60]}")
            else:
                print(f"[Bob] ANSWERED ({len(answer)} chars) — q: {question[:60]}")

            return answer
        except Exception as e:
            return _mock_answer_query(question, context) + f"\n\n[Bob fallback: {e}]"

    # -----------------------------------------------------------
    # REAL — Narrative generation
    # -----------------------------------------------------------
    def _real_generate_narrative(self, fir_data: dict) -> str:
        system_prompt = """You are an Indian police FIR narrative writer.

TASK: Convert structured FIR fields into a formal, single-paragraph FIR narrative.

STRICT STYLE RULES:
1. Output EXACTLY ONE paragraph. No headers. No bullets. No preamble.
2. Begin with: "On {incident_date} at about {incident_time}, the complainant {complainant_name}, aged {victim_age}, reported an alleged {crime_type} incident at/near a {location_type} within the jurisdiction of {police_station}, {district}, {state}."
3. Follow with facts in this order: modus operandi, victim profile, property/subject, accused, vehicle, evidence.
4. Use ONLY the field values provided. If a field is empty, OMIT that sentence.
5. Every sentence begins with "The reported..." or "The suspected..." or "Initial evidence..."
6. End with: "The matter was entered for investigation and relevant records were requested."
7. No extra sentences. No analysis. No greetings.

REFERENCE EXAMPLE (match this style exactly):
"On 09-10-2025 at about 14:15, the complainant Riya Pandey, aged 53, reported an alleged mobile snatching incident at/near an online platform within the jurisdiction of Central Police Station, New Delhi, Delhi. The reported modus operandi was motorcycle approach. The reported target/victim profile was railway/bus transit areas. The property or subject involved was smartphone. The suspected accused was Naveen Verma. The reported vehicle/mobility detail was motorcycle. Initial evidence or investigative lead included CCTV footage. The matter was entered for investigation and relevant records were requested.\""""

        clean = {k: v for k, v in fir_data.items()
                 if v not in (None, "", "—", "Not applicable")}
        prompt = f"Structured FIR fields (JSON):\n{json.dumps(clean, indent=2, ensure_ascii=False)}\n\nWrite the FIR narrative:"

        try:
            narrative = self._call_bob(prompt, system=system_prompt, max_tokens=400)
            narrative = narrative.strip().strip('"').strip("'")
            bad_starts = ["sure", "here", "based on", "i ", "certainly", "of course"]
            if narrative.lower().startswith(tuple(bad_starts)):
                narrative = self._call_bob(
                    f"Rewrite ONLY this as one FIR paragraph, no preamble:\n\n{narrative}",
                    system="Return only the FIR narrative paragraph. No introduction.",
                    max_tokens=350,
                ).strip().strip('"').strip("'")
            return narrative
        except Exception as e:
            return _mock_generate_narrative(fir_data) + f"\n\n[Bob fallback: {e}]"

    # -----------------------------------------------------------
    # REAL — Crime classification
    # -----------------------------------------------------------
    def _real_classify_crime(self, raw: str) -> dict:
        from db import query
        existing = [r["crime_type"] for r in
                    query("SELECT DISTINCT crime_type FROM firs WHERE crime_type IS NOT NULL")]
        system = """You are a crime taxonomy classifier for Indian police FIRs.
Given a raw crime description and a list of existing categories:
- If it matches an existing category → return that category verbatim.
- Otherwise → return the raw text normalized to Title Case.
Return ONLY JSON: {"normalized": "...", "is_novel": true|false, "reasoning": "one short sentence"}"""
        prompt = f"Raw crime: {raw}\n\nExisting categories:\n- " + "\n- ".join(existing) + "\n\nClassify:"
        try:
            out = self._call_bob(prompt, system=system, max_tokens=150)
            out = re.sub(r"^```(?:json)?|```$", "", out.strip(), flags=re.MULTILINE)
            return json.loads(out)
        except Exception:
            return _mock_classify_crime(raw)


# ===============================================================
# MOCK implementations
# ===============================================================
_MO_PATTERNS = [
    ("motorcycle approach",          r"motorcycle approach"),
    ("two-person motorcycle team",   r"two-person motorcycle"),
    ("fake bank representative call", r"fake bank representative"),
    ("fake refund request",          r"fake refund"),
    ("fake job offer",               r"fake job offer"),
    ("steering-lock bypass",         r"steering[- ]lock bypass"),
    ("rear-door entry",              r"rear[- ]door entry"),
    ("threat calls",                 r"threat calls"),
    ("grab-and-flee",                r"grab[- ]and[- ]flee"),
    ("KYC update message",           r"KYC update"),
    ("UPI payment request",          r"UPI payment request"),
    ("collect-request scam",         r"collect[- ]request"),
    ("window entry",                 r"window entry"),
    ("roof entry",                   r"roof entry"),
    ("lock breaking",                r"lock breaking"),
    ("key duplication",              r"key duplication"),
    ("master-key method",            r"master[- ]key"),
    ("false key",                    r"false key"),
    ("group assault",                r"group assault"),
    ("blunt-object assault",         r"blunt[- ]object"),
    ("argument escalated",           r"argument escalated"),
]

_WEAPON_PATTERN = re.compile(
    r"\b(knife|gun|pistol|rod|blunt object|sharp weapon|iron rod|country-made)\b",
    re.IGNORECASE,
)
_VEHICLE_PATTERN = re.compile(
    r"\b(motorcycle|scooter|car|hatchback|pickup van|bus|auto|white hatchback)\b",
    re.IGNORECASE,
)


def _mock_extract_entities(narrative: str) -> dict:
    if not narrative:
        return {"accused": [], "aliases": [], "modus_operandi": None,
                "locations": [], "weapons": [], "vehicles": [], "victim_profile": None}
    text = narrative.lower()
    mo = None
    for label, pattern in _MO_PATTERNS:
        if re.search(pattern, text):
            mo = label
            break
    weapons = list({m.group(1).lower() for m in _WEAPON_PATTERN.finditer(narrative)})
    vehicles = list({m.group(1).lower() for m in _VEHICLE_PATTERN.finditer(narrative)})
    loc_match = re.search(r"at/near\s+([^,\.]+)", narrative, re.IGNORECASE)
    locations = [loc_match.group(1).strip()] if loc_match else []
    accused = []
    m = re.search(r"accused was ([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)", narrative)
    if m: accused.append(m.group(1))
    victim_profile = None
    m = re.search(r"victim profile was ([^\.]+)", narrative, re.IGNORECASE)
    if m: victim_profile = m.group(1).strip()
    return {"accused": accused, "aliases": [], "modus_operandi": mo,
            "locations": locations, "weapons": weapons, "vehicles": vehicles,
            "victim_profile": victim_profile}


def _mock_summarize_station(station_data: dict) -> str:
    name = station_data.get("police_station", "Unknown Station")
    total = station_data.get("total_firs", 0)
    top_crime = station_data.get("top_crime_type", "N/A")
    top_time = station_data.get("top_time_bucket", "N/A")
    repeat = station_data.get("repeat_offenders", [])
    if total == 0: return f"{name}: No FIRs on record."
    parts = [
        f"**{name}** has **{total}** FIRs on record.",
        f"The dominant crime type is **{top_crime}**.",
        f"Activity peaks during the **{top_time}** window.",
    ]
    if repeat:
        names = ", ".join(r.get("name", "?") for r in repeat[:3])
        parts.append(f"**{len(repeat)} repeat offenders** detected; top names: {names}.")
    else:
        parts.append("No repeat offenders detected in this station's data.")
    parts.append(f"**Recommendation:** Deploy additional patrol focus on '{top_crime}' incidents during {top_time} hours.")
    return " ".join(parts)


def _mock_generate_narrative(fir: dict) -> str:
    def val(key, default="—"):
        v = fir.get(key)
        if v is None or v == "" or v == "Not applicable": return default
        return v

    date = val("incident_date", "[date]")
    time = val("incident_time", "[time]")
    complainant = val("complainant_name", "[complainant]")
    age = val("victim_age", "")
    age_str = f", aged {age}," if age and age != "—" else ","
    crime = val("crime_type", "[crime type]")
    loc_type = val("location_type", "public place")
    station = val("police_station", "[police station]")
    district = val("district", "[district]")
    state = val("state", "[state]")

    parts = [
        f"On {date} at about {time}, the complainant {complainant}{age_str} "
        f"reported an alleged {crime} incident at/near a {loc_type} "
        f"within the jurisdiction of {station}, {district}, {state}."
    ]
    if fir.get("modus_operandi") and fir["modus_operandi"] != "—":
        parts.append(f"The reported modus operandi was {fir['modus_operandi']}.")
    if fir.get("victim_profile") and fir["victim_profile"] != "—":
        parts.append(f"The reported target/victim profile was {fir['victim_profile']}.")
    if fir.get("property_or_target") and fir["property_or_target"] != "—":
        parts.append(f"The property or subject involved was {fir['property_or_target']}.")
    if fir.get("accused_name") and fir["accused_name"] != "—":
        line = f"The suspected accused was {fir['accused_name']}."
        if fir.get("accused_alias") and fir["accused_alias"] != "—":
            line = line[:-1] + f", alias '{fir['accused_alias']}'."
        parts.append(line)
    if fir.get("vehicle_used") and fir["vehicle_used"] != "—":
        parts.append(f"The reported vehicle/mobility detail was {fir['vehicle_used']}.")
    if fir.get("evidence_type") and fir["evidence_type"] != "—":
        parts.append(f"Initial evidence or investigative lead included {fir['evidence_type']}.")
    parts.append("The matter was entered for investigation and relevant records were requested.")
    return " ".join(parts)

# ===============================================================
# Mock: FIR classification
# ===============================================================
def _mock_classify_fir(fir: dict) -> dict:
    crime = (fir.get("crime_type") or "").lower()
    loss = fir.get("estimated_loss_inr") or 0
    weapon = (fir.get("weapon_or_tool") or "").lower()
    victim_profile = (fir.get("victim_profile") or "").lower()

    # Severity
    if any(k in crime for k in ["murder", "homicide", "sexual", "kidnapping"]):
        severity = "Critical"
    elif "robbery" in crime or weapon in ("knife", "gun", "pistol"):
        severity = "High"
    elif any(k in crime for k in ["burglary", "extortion", "vehicle theft"]):
        severity = "High" if loss > 50000 else "Medium"
    elif any(k in crime for k in ["mobile snatching", "assault"]):
        severity = "Medium"
    elif any(k in crime for k in ["fraud", "upi", "cyber"]):
        severity = "High" if loss > 100000 else "Medium"
    else:
        severity = "Low"

    # Urgency
    urgency = {"Critical": "High", "High": "High", "Medium": "Medium"}.get(severity, "Low")

    # Priority
    priority = {"Critical": "High", "High": "High", "Medium": "Medium"}.get(severity, "Low")

    # Suggested BNS sections
    section_map = {
        "mobile snatching": ["304 (snatching)", "BNS 304"],
        "cyber fraud": ["318(4) (cheating)", "IT Act 66D"],
        "upi fraud": ["318(4)", "IT Act 66D"],
        "vehicle theft": ["303 (theft)", "BNS 303"],
        "burglary": ["305 (house-breaking)", "BNS 305"],
        "robbery": ["309 (robbery)", "BNS 309"],
        "extortion": ["308 (extortion)", "BNS 308"],
        "fraud / cheating": ["318 (cheating)", "BNS 318"],
        "assault": ["115 (voluntarily causing hurt)", "BNS 115"],
        "murder / homicide": ["103 (murder)", "BNS 103"],
        "sexual offence": ["63 (rape)", "POCSO if minor"],
        "kidnapping / abduction": ["137 (kidnapping)", "BNS 137"],
        "missing person": ["BNSS procedure / missing-person record"],
        "drug possession": ["NDPS Act"],
    }
    sections = []
    for k, v in section_map.items():
        if k in crime:
            sections = v
            break
    if not sections:
        sections = ["To be determined"]

    # Risk levels
    victim_risk = "High" if any(k in victim_profile for k in ["minor", "elderly", "woman"]) else "Medium"
    public_interest = "High" if severity in ("Critical", "High") else "Medium"

    return {
        "severity": severity,
        "urgency": urgency,
        "investigation_priority": priority,
        "suggested_bns_sections": sections,
        "reasoning": f"Classified as {severity} severity based on crime type '{fir.get('crime_type', 'unknown')}'"
                     + (f" with estimated loss of ₹{loss}" if loss else ""),
        "victim_risk": victim_risk,
        "public_interest": public_interest,
    }


# ===============================================================
# Mock: Smart Ingest
# ===============================================================
def _mock_smart_ingest(narrative: str, seed: dict) -> dict:
    """
    Rule-based extraction of every field from a narrative.
    Falls back to seed values where present.
    """
    text = (narrative or "").strip()
    lower = text.lower()

    # --- Crime type ---
    crime_map = [
        (r"mobile snatch|phone snatch|snatched.*mobile", "Mobile Snatching"),
        (r"cyber fraud|cyber crime", "Cyber Fraud"),
        (r"upi|upi fraud", "UPI Fraud"),
        (r"vehicle theft|car theft|bike theft|scooter.*theft|motorcycle.*theft", "Vehicle Theft"),
        (r"burglar|break[- ]in|housebreak", "Burglary"),
        (r"robber|dacoity", "Robbery"),
        (r"extort|ransom|threat calls", "Extortion"),
        (r"cheat|fraud", "Fraud / Cheating"),
        (r"assault|attack|hurt", "Assault"),
        (r"murder|homicide|kill", "Murder / Homicide"),
        (r"rape|sexual", "Sexual Offence"),
        (r"kidnap|abduct", "Kidnapping / Abduction"),
        (r"missing", "Missing Person"),
        (r"drug|narcotic|ganja|heroin", "Drug Possession"),
    ]
    crime_type = seed.get("crime_type")
    if not crime_type:
        for pat, ct in crime_map:
            if re.search(pat, lower):
                crime_type = ct
                break
    if not crime_type:
        crime_type = "Unclassified"

    # --- Modus operandi ---
    mo_patterns = [
        (r"motorcycle approach|on motorcycle", "motorcycle approach"),
        (r"two[- ]person|two men on", "two-person motorcycle team"),
        (r"fake bank|bank representative", "fake bank representative call"),
        (r"fake refund", "fake refund request"),
        (r"fake job", "fake job offer"),
        (r"steering[- ]lock", "steering-lock bypass"),
        (r"rear[- ]door", "rear-door entry"),
        (r"threat call|threatened", "threat calls"),
        (r"grab[- ]and[- ]flee|snatched and fled", "grab-and-flee"),
        (r"kyc", "KYC update message"),
        (r"upi payment request", "UPI payment request"),
        (r"collect request", "collect-request scam"),
        (r"window entry", "window entry"),
        (r"roof", "roof entry"),
        (r"lock break", "lock breaking"),
        (r"duplicate key", "key duplication"),
        (r"master key", "master-key method"),
        (r"qr code", "QR-code payment trick"),
        (r"remote support", "remote-support application"),
    ]
    mo = seed.get("modus_operandi")
    if not mo:
        for pat, m in mo_patterns:
            if re.search(pat, lower):
                mo = m
                break

    # --- Time bucket ---
    time_bucket = seed.get("time_bucket")
    if not time_bucket:
        if re.search(r"\b(morning|am hours|dawn)\b", lower):
            time_bucket = "morning"
        elif re.search(r"\b(afternoon|noon|midday)\b", lower):
            time_bucket = "afternoon"
        elif re.search(r"\b(evening|dusk|sunset)\b", lower):
            time_bucket = "evening"
        elif re.search(r"\b(late night|midnight|1 am|2 am|3 am|4 am)\b", lower):
            time_bucket = "late night"
        elif re.search(r"\b(night|pm hours|dark)\b", lower):
            time_bucket = "night"

    # --- Weapon ---
    weapon = seed.get("weapon_or_tool")
    if not weapon:
        for w in ["knife", "gun", "pistol", "rod", "sharp weapon", "blunt object", "iron rod"]:
            if w in lower:
                weapon = w
                break

    # --- Vehicle ---
    vehicle = seed.get("vehicle_used")
    if not vehicle:
        for v in ["motorcycle", "scooter", "car", "hatchback", "pickup van", "auto", "bus"]:
            if v in lower:
                vehicle = v
                break

    # --- Victim age ---
    victim_age = seed.get("victim_age")
    if not victim_age:
        m = re.search(r"aged\s+(\d{1,3})", lower)
        if m:
            victim_age = int(m.group(1))

    # --- Victim gender ---
    victim_gender = seed.get("victim_gender")
    if not victim_gender:
        if re.search(r"\b(he|male|man)\b", lower):
            victim_gender = "Male"
        elif re.search(r"\b(she|female|woman|lady)\b", lower):
            victim_gender = "Female"

    # --- Complainant (complainant X reported) ---
    complainant = seed.get("complainant_name")
    if not complainant:
        m = re.search(r"complainant\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})", text)
        if m:
            complainant = m.group(1)

    # --- Accused ---
    accused = seed.get("accused_name")
    if not accused:
        m = re.search(r"(?:accused|suspected accused)\s+(?:was|is)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})", text)
        if m:
            accused = m.group(1)

    # --- Location type ---
    loc_type = seed.get("location_type")
    if not loc_type:
        if re.search(r"\bonline|internet|website|app\b", lower):
            loc_type = "online"
        elif re.search(r"\broadside|highway\b", lower):
            loc_type = "roadside"
        elif re.search(r"\bmarket\b", lower):
            loc_type = "market"
        elif re.search(r"\bresidential|house\b", lower):
            loc_type = "residential area"
        elif re.search(r"\bcommercial\b", lower):
            loc_type = "commercial area"
        elif re.search(r"\bbus stand|railway|transit\b", lower):
            loc_type = "transit area"
        elif re.search(r"\bworkplace|office\b", lower):
            loc_type = "workplace"

    # --- Loss ---
    loss = seed.get("estimated_loss_inr")
    if not loss:
        m = re.search(r"(?:₹|rs\.?|inr)\s*([\d,]+)", lower)
        if m:
            try:
                loss = int(m.group(1).replace(",", ""))
            except ValueError:
                loss = 0

    # --- CCTV ---
    cctv = seed.get("cctv_status")
    if not cctv:
        if re.search(r"cctv|surveillance.*available", lower):
            cctv = "Available"

    # --- Evidence ---
    evidence = seed.get("evidence_type")
    if not evidence:
        if "cctv" in lower:
            evidence = "CCTV footage"
        elif "fingerprint" in lower:
            evidence = "fingerprint lift"
        elif "forensic" in lower:
            evidence = "forensic examination"
        elif "witness" in lower:
            evidence = "witness statement"

    # --- Time of day from HH:MM ---
    incident_time = seed.get("incident_time")
    if not incident_time:
        m = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text)
        if m:
            incident_time = f"{int(m.group(1)):02d}:{m.group(2)}"

    # --- Date ---
    incident_date = seed.get("incident_date")
    if not incident_date:
        m = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b", text)
        if m:
            d, mo_, y = m.group(1), m.group(2), m.group(3)
            incident_date = f"{int(d):02d}-{int(mo_):02d}-{y}"

    # --- Cleaned narrative ---
    cleaned = text.strip()
    if not cleaned.endswith("."):
        cleaned += "."
    # Collapse whitespace
    cleaned = re.sub(r"\s+", " ", cleaned)

    # --- Confidence ---
    filled = sum(1 for v in [
        crime_type if crime_type != "Unclassified" else None,
        mo, time_bucket, weapon, vehicle, victim_age, victim_gender,
        complainant, accused, loc_type, loss, incident_date, incident_time,
    ] if v)
    confidence = round(min(1.0, filled / 13.0), 2)

    return {
        "crime_type": crime_type,
        "bns_section": seed.get("bns_section", ""),
        "state": seed.get("state", ""),
        "district": seed.get("district", ""),
        "police_station": seed.get("police_station", ""),
        "city": seed.get("city", ""),
        "incident_date": incident_date or "",
        "incident_time": incident_time or "",
        "time_bucket": time_bucket or "",
        "complainant_name": complainant or "",
        "victim_age": victim_age,
        "victim_gender": victim_gender or "",
        "victim_occupation": seed.get("victim_occupation", ""),
        "victim_profile": seed.get("victim_profile", ""),
        "accused_name": accused or "",
        "accused_alias": seed.get("accused_alias", ""),
        "accused_known": bool(accused),
        "location_type": loc_type or "",
        "incident_location": seed.get("incident_location", ""),
        "modus_operandi": mo or "",
        "vehicle_used": vehicle or "",
        "weapon_or_tool": weapon or "",
        "property_or_target": seed.get("property_or_target", ""),
        "estimated_loss_inr": loss or 0,
        "evidence_type": evidence or "",
        "digital_evidence": seed.get("digital_evidence", ""),
        "cctv_status": cctv or "",
        "witness_count": seed.get("witness_count", 0),
        "arrest_status": seed.get("arrest_status", ""),
        "recovery_status": seed.get("recovery_status", ""),
        "case_priority": "High" if confidence > 0.7 else "Medium",
        "severity": "High" if crime_type in ("Murder / Homicide", "Robbery", "Sexual Offence", "Kidnapping / Abduction") else "Medium",
        "cleaned_narrative": cleaned,
        "confidence": confidence,
        "notes": f"Extracted {filled}/13 key fields from narrative." if confidence < 0.8 else "Strong extraction — all key fields present.",
    }

# ===============================================================
# Mock: Offender brief
# ===============================================================
def _mock_offender_brief(data: dict) -> str:
    name = data.get("name", "Unknown")
    aliases = data.get("aliases", [])
    fir_count = data.get("fir_count", 0)
    crime_types = data.get("crime_types", [])
    states = data.get("states", [])
    districts = data.get("districts", [])
    mos = data.get("modus_operandi", [])
    time_buckets = data.get("time_buckets", [])
    fir_ids = data.get("fir_ids", [])

    alias_str = ", ".join(f"'{a}'" for a in aliases) if aliases else "none"
    crime_str = ", ".join(crime_types) if crime_types else "unspecified"
    state_str = ", ".join(states) if states else "unknown"
    mo_str = mos[0] if mos else "unknown"
    time_str = time_buckets[0] if time_buckets else "unspecified"

    profile = (
        f"**{name}** appears in **{fir_count}** linked FIRs across "
        f"**{len(states)}** state(s): {state_str}. "
        + (f"Known aliases: {alias_str}." if aliases else "")
    )

    pattern = (
        f"Primary involvement in **{crime_str}**. "
        f"Signature modus operandi: **{mo_str}**. "
        f"Activity concentrates during the **{time_str}** window."
    )

    evolution = (
        f"Activity spans **{len(districts)}** district(s), suggesting "
        f"{'cross-jurisdictional mobility' if len(districts) > 2 else 'localized operations'}. "
        f"Linked FIRs: {', '.join(fir_ids[:6])}" + ("..." if len(fir_ids) > 6 else ".")
    )

    network = (
        "This offender belongs to a fingerprint cluster — visit the "
        "**Network Graph → Repeat-Offender mode** to see connections to "
        "co-accused and shared modus operandi."
    )

    action = (
        f"**Recommendation:** Open a consolidated investigation file for "
        f"{name} covering all {fir_count} FIRs. Verify aliases against "
        f"national databases and coordinate across the involved police stations."
    )

    return "\n\n".join([profile, pattern, evolution, network, action])


# ===============================================================
# Mock: Network query parser
# ===============================================================
def _mock_parse_network_query(query: str, context: dict) -> dict:
    q = query.lower()
    result = {
        "node_types": ["accused", "fir", "state", "mo"],
        "state": None,
        "district": None,
        "crime_type": None,
        "modus_operandi": None,
        "time_bucket": None,
        "accused_name": None,
        "keywords": [],
        "explanation": query,
    }

    # State match
    for s in context.get("states", []):
        if s.lower() in q:
            result["state"] = s
            break

    # District
    for d in context.get("districts", []):
        if d.lower() in q:
            result["district"] = d
            break

    # Crime type
    for c in context.get("crime_types", []):
        if c.lower() in q:
            result["crime_type"] = c
            break

    # MO
    for mo in context.get("modus_operandi", []):
        if mo.lower() in q:
            result["modus_operandi"] = mo
            break

    # Time
    for t in ["morning", "afternoon", "evening", "night", "late night"]:
        if t in q:
            result["time_bucket"] = t
            break

    # If "offenders" / "criminals" / "accused" mentioned → prioritize accused
    if any(k in q for k in ["offender", "criminal", "accused", "gang"]):
        result["node_types"] = ["accused"]
    if any(k in q for k in ["fir", "case", "incident"]):
        result["node_types"] = ["fir"]

    return result


def _mock_classify_crime(raw: str) -> dict:
    from db import query
    existing = [r["crime_type"] for r in
                query("SELECT DISTINCT crime_type FROM firs WHERE crime_type IS NOT NULL")]
    normalized = raw.strip().title()
    for e in existing:
        if e.lower() == normalized.lower():
            return {"normalized": e, "is_novel": False, "reasoning": "matched existing category"}
    return {"normalized": normalized, "is_novel": True, "reasoning": "no match in existing taxonomy"}


# ===============================================================
# Mock answer_query — question-aware
# ===============================================================
_CRIME_TYPES = [
    "Mobile Snatching", "Cyber Fraud", "Vehicle Theft", "Burglary",
    "Robbery", "UPI Fraud", "Extortion", "Fraud / Cheating",
    "Assault", "Murder / Homicide", "Sexual Offence",
    "Kidnapping / Abduction", "Missing Person", "Drug Possession",
]
_STATES = ["Delhi", "Gujarat", "Maharashtra", "Madhya Pradesh", "Rajasthan", "Uttar Pradesh"]
_KNOWN_CITIES = [
    "New Delhi", "East Delhi", "North Delhi", "Central Delhi",
    "Vadodara", "Ahmedabad", "Surat", "Rajkot",
    "Nagpur", "Nashik", "Pune", "Mumbai",
    "Indore", "Bhopal", "Gwalior", "Jabalpur",
    "Jodhpur", "Jaipur", "Kota", "Udaipur",
    "Noida", "Prayagraj", "Varanasi", "Lucknow", "Kanpur Nagar",
]
_TIME_BUCKETS = ["morning", "afternoon", "evening", "night", "late night"]


def _parse_question(q: str) -> dict:
    ql = q.lower()
    out = {"intent": None, "crime": None, "state": None, "city": None, "time": None}
    if any(w in ql for w in ["who", "which accused", "which offender", "which criminal"]):
        out["intent"] = "who"
    elif any(w in ql for w in ["when", "what time", "which time", "what hour"]):
        out["intent"] = "when"
    elif any(w in ql for w in ["where", "which station", "which district", "which city"]):
        out["intent"] = "where"
    elif any(w in ql for w in ["top", "most", "highest", "worst", "leading", "dominant"]):
        out["intent"] = "top"
    for ct in _CRIME_TYPES:
        if ct.lower() in ql: out["crime"] = ct; break
    for s in _STATES:
        if s.lower() in ql: out["state"] = s; break
    for c in _KNOWN_CITIES:
        if c.lower() in ql: out["city"] = c; break
    for t in _TIME_BUCKETS:
        if t in ql: out["time"] = t; break
    return out


def _mock_answer_query(question: str, context: list[dict]) -> str:
    from db import query, query_one
    parsed = _parse_question(question)

    where, params = [], []
    if parsed["crime"]: where.append("crime_type = ?"); params.append(parsed["crime"])
    if parsed["state"]: where.append("state = ?"); params.append(parsed["state"])
    if parsed["city"]:
        where.append("(district LIKE ? OR city LIKE ?)")
        params += [f"%{parsed['city']}%"] * 2
    if parsed["time"]: where.append("time_bucket = ?"); params.append(parsed["time"])
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    total = query_one(f"SELECT COUNT(*) AS c FROM firs {where_sql}", tuple(params))["c"]

    if parsed["intent"] == "top":
        top = query_one(f"SELECT crime_type, COUNT(*) AS c FROM firs {where_sql} GROUP BY crime_type ORDER BY c DESC LIMIT 1",
                        tuple(params)) if total else None
        if not top: return f"No FIRs found matching **{question}**."
        return (f"Analysing **{total}** FIRs matching your filters. "
                f"The dominant crime type is **{top['crime_type']}** with **{top['c']}** cases. "
                f"Check the Network Graph to see the clusters behind these incidents.")

    if parsed["intent"] == "where":
        top = query_one(f"SELECT police_station, state, COUNT(*) AS c FROM firs {where_sql} GROUP BY police_station ORDER BY c DESC LIMIT 1",
                        tuple(params)) if total else None
        if not top: return f"No FIRs found matching **{question}**."
        return (f"Across **{total}** matching FIRs, "
                f"**{top['police_station']}** ({top['state']}) leads with **{top['c']}** cases.")

    if parsed["intent"] == "when":
        top = query_one(f"SELECT time_bucket, COUNT(*) AS c FROM firs {where_sql} GROUP BY time_bucket ORDER BY c DESC LIMIT 1",
                        tuple(params)) if total else None
        if not top: return f"No FIRs found matching **{question}**."
        return (f"Among **{total}** matching FIRs, the peak time bucket is **{top['time_bucket']}** "
                f"with **{top['c']}** incidents. Focus patrol resources during this window.")

    if parsed["intent"] == "who":
        if where_sql:
            top = query_one(f"SELECT accused_name, COUNT(*) AS c FROM firs {where_sql} AND accused_name IS NOT NULL AND accused_name NOT LIKE '%Unknown%' GROUP BY accused_name ORDER BY c DESC LIMIT 1",
                            tuple(params))
        else:
            top = query_one("SELECT accused_name, COUNT(*) AS c FROM firs WHERE accused_name IS NOT NULL AND accused_name NOT LIKE '%Unknown%' GROUP BY accused_name ORDER BY c DESC LIMIT 1")
        if not top: return f"No named accused found for **{question}**."
        return (f"The most frequently appearing named accused is **{top['accused_name']}** "
                f"with **{top['c']}** linked FIRs. Open **Repeat Offenders** to see their full cluster.")

    if total == 0:
        return (f"No FIRs matched **{question}**.\n\nTry one of these:\n"
                f"- Show me mobile snatching in Delhi\n"
                f"- Which station has the most cyber fraud?\n"
                f"- What time do burglaries happen?\n"
                f"- Who are the top offenders?")

    rows = query(f"SELECT crime_type, COUNT(*) AS c FROM firs {where_sql} GROUP BY crime_type ORDER BY c DESC LIMIT 5",
                 tuple(params))
    breakdown = ", ".join(f"**{r['crime_type']}** ({r['c']})" for r in rows)

    filters = []
    if parsed["crime"]: filters.append(f"crime: {parsed['crime']}")
    if parsed["state"]: filters.append(f"state: {parsed['state']}")
    if parsed["city"]:  filters.append(f"location: {parsed['city']}")
    if parsed["time"]:  filters.append(f"time: {parsed['time']}")
    filter_str = " · ".join(filters) if filters else "no filters applied"

    return (f"Found **{total}** matching FIRs ({filter_str}).\n\n"
            f"Top crime types: {breakdown}.\n\n"
            f"**Recommendation:** open the FIR Explorer or Network Graph with these filters to drill down.")


# ===============================================================
# Singleton
# ===============================================================
_bob_instance: BobClient | None = None


def get_bob() -> BobClient:
    global _bob_instance
    if _bob_instance is None:
        _bob_instance = BobClient()
    return _bob_instance