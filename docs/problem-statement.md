# Problem Statement

## The Specific Audience Affected

**Police analysts and station heads in Indian states** — particularly those running on the CCTNS (Crime and Criminal Tracking Network & Systems) platform. UP Police alone has digitized 3+ crore FIRs, but the platform has **no NLP or intelligence layer**. Every investigation is manual.

Secondary audience: **State Crime Records Bureaus (SCRB)** tasked with detecting organized crime patterns across districts.

## Why Existing Solutions Don't Solve It

1. **CCTNS stores narratives as free text** — no structured entities (accused, MO, location) extracted. Querying requires an SQL-writer.
2. **No cross-FIR linkage** — CCTNS is per-FIR. There is no mechanism to say "find me all FIRs that share this modus operandi."
3. **Manual pattern analysis** — a sub-inspector comparing 3 FIRs takes hours. Comparing 3,000 takes years.
4. **Alias evasion is invisible** — offenders use different names in different jurisdictions. Current systems match on `accused_name` only.

## Quantified Pain

- **Jamtara gang case**: evaded detection across multiple states for years despite dozens of FIRs. No connection was surfaced.
- **MTTR for a repeat-offender investigation**: weeks of manual cross-referencing.
- **Cost of missed connections**: continued offending — cyber fraud rings operate for years until caught by chance.

## Why This Problem Matters Now

- **CCTNS has reached scale** (3+ crore FIRs). Data is there. Intelligence layer is not.
- **LLMs make entity extraction affordable** — extracting 3 crore narratives cost-prohibitive in 2020, feasible in 2026.
- **Cross-jurisdictional crime is rising** — Jamtara, cyber fraud, and interstate robbery gangs require cross-district intelligence.
- **The window is short** — every month without linkage is another month of undetected repeat offending.