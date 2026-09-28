# Solution Overview

## Core Mechanism

CHAKRA has **five layers** stacked on top of the FIR dataset:

### 1. Ingestion & Enrichment
- Load CSV into SQLite (all CCTNS-standard columns indexed)
- For each FIR narrative, Bob extracts: MO, weapon, vehicle, accused, victim profile, locations
- Cached to `fir_entities` table

### 2. Fingerprint Engine ⭐
- Each FIR has a normalized **fingerprint** = hash of:
  `{crime_type} | {modus_operandi} | {weapon} | {vehicle} | {time_bucket} | {location_type}`
- Two FIRs with matching fingerprints strongly suggest the same offender — even across districts
- Clusters are scored with **confidence** (0-1) based on matched signature components + cluster size

### 3. Alias Trail Detection
- Detects when the same `accused_name` appears with **different `accused_alias`** in different FIRs
- Classic sign of an evasive offender who changes names per jurisdiction

### 4. Network Graph
- Builds a 3-tier graph: Accused ↔ FIR ↔ {State, MO}
- Rendered client-side using 3d-force-graph (Three.js)
- Node types color-coded; click-to-fly-to-node

### 5. Bob Summarization
- For any station, Bob receives structured stats and returns a natural-language briefing
- Officer asks natural-language questions in the Query view; Bob answers with retrieved context

## What Makes It Different

| Naive alternative | CHAKRA |
|---|---|
| Filter by crime type | Fingerprint matching across 6 dimensions |
| Match on accused name | Match on behavioral signature + alias |
| Show counts per district | Show cross-state criminal networks |
| Static dashboards | Interactive 3D graph with drill-down |
| Manual SQL | Natural-language queries |

## Key Design Decisions

**Why fingerprinting, not just name matching?**
Names are easily changed. Modus operandi is a behavioral signature that survives name changes. Our 45-FIR cluster spans 19 distinct names but only 3 aliases — name-matching would miss 90% of it.

**Why SQLite?**
Zero-setup for judges. Production path is documented (Postgres + Neo4j for scale).

**Why mock Bob by default?**
Judges can reproduce without IBM Cloud credentials. The real watsonx.ai integration is coded — swap env vars to enable. Nothing else changes.

**Why 3D, not 2D graph?**
Criminal networks are visually dense. 3D force-directed layout reveals clusters that 2D plots overlap. Also — it's memorable. Judges remember what they can rotate.

## User Experience

1. Officer opens CHAKRA → sees dashboard with pan-India KPIs
2. Click "Repeat Offenders" → sees 148 clusters ranked by FIR count
3. The top card: "fake refund request · afternoon · online" — **45 FIRs across 6 states**
4. Click → drill down → sees all 45 FIRs, 19 accused names, 3 shared aliases
5. Click "Network Graph" → sees the 45-FIR cluster as a 3D cluster
6. Click "Ask CHAKRA" → types "Show me all UPI fraud in Gujarat" → Bob answers with sources