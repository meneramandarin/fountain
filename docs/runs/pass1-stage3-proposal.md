# Pass 1 Legitimacy Triage — Stage 3 Escalation Proposal

**STAGE 3 PROPOSAL — PRE-APPROVED BY FINAL STANDING ORDERS**

**ZERO SERVING WRITES:** this proposal sample made no location, organization, suppression-ledger, or other serving-data writes.

What is proposed: Escalate 2,156 Gate B review rows as 1,187 pooled organization/standalone subjects, then auto-resolve decisions at confidence ≥ 0.75 after the documented guards.

Evidence boundary: the 50 persisted dry-run results from run 54 are joined to the fixed seed `pass1-stage3-proposal-v1`; report rendering itself makes no provider or database calls.

Open questions: None. The final standing orders pre-approved autonomous execution and lowered the auto-resolution threshold to 0.75.

## Frozen cohort

| Metric | Count |
| --- | ---: |
| Effective Gate B review rows | 2,156 |
| Classification subjects | 1,187 |
| Organization subjects | 1,133 |
| Organization rows | 2,102 |
| Standalone subjects/rows | 54 |
| Organization-conflict subjects | 62 |
| Organization-conflict rows | 723 |

Organization subjects contain every cohort branch's stored location fields, sources, offerings, tags, provider IDs, prior Gate B evidence, and unique website evidence. One verdict fans out to every member location.

## Website discovery plan

1. Start with 60 rows whose location website is blank; 11 already have a Google provider ID.
2. Use a stored Places provider ID directly when present. For the remaining 49 candidate rows, run OpenRouter Exa web search first, capped at 3 results and $0.005 per request. Reject generic/directory domains and require name plus locality/address identity evidence.
3. If agent search supplies no trustworthy official site, fall back to ID-only Places text search followed by the contact-field details mask.
4. On the approved full run only, write a discovered site to the location through recordWrite() on location.website as agent_verified after a locked null-field and hard-exclusion recheck.

Maximum planned Places-details cost: $1.20 ($0.02 per details call).
The full run binds agent search to a ledger-aware OpenRouter web-search adapter and meters reported web-search requests. Provider behavior and request pricing are documented in the [OpenRouter web-search guide](https://openrouter.ai/docs/guides/features/server-tools/web-search).

## Escalation model and projection

| Metric | Proposal |
| --- | --- |
| Tier | escalation |
| Model | `google/gemini-3.5-flash` |
| Reasoning | medium; reasoning trace excluded, tokens retained in usage ledger |
| Input price | $1.50 / 1M tokens |
| Output price | $9.00 / 1M tokens |
| Projected input tokens | 2,390,000 |
| Projected output tokens | 623,000 |
| Projected model cost | $9.20 |
| Projected Places cost | $1.20 |
| Projected web-search request cost | $0.30 plus model tokens |
| Projected total | ~$10.70 before retries |
| Stage budget cap | $15.00 within the $500 global LLM ceiling |

Model availability, structured-output support, context, and current unit pricing were verified against the [OpenRouter Gemini 3.5 Flash catalog](https://openrouter.ai/google/gemini-3.5-flash).

## Dry-run execution evidence

Final sample run: 54; superseded calibration run(s): 53.

| Sample class | Subjects |
| --- | ---: |
| junk | 5 |
| plain_hospital | 19 |
| review | 9 |
| destination_medical | 2 |
| in_scope | 15 |

The final fixed sample auto-resolved 41/50 subjects and held 9. Row-weighted by the frozen strata, the full run projects 1,930 auto-resolved rows and 226 final human-review rows (planning range 150–450).

Final sample usage: 13 LLM calls, 5 Places ID searches, 9 contact-details calls, 100,582 input tokens, 26,260 output tokens (20,596 reasoning). Final spend: $0.57; all sample attempts: $1.15.

Serving writes attempted/written: 0/0. The superseded attempt used an undersized completion ceiling for medium reasoning; no rubric, threshold, model, or serving data changed between attempts.

## AAI Rejuvenation reference case

- Location: 9390, AAI Rejuvenation (organization:4308).
- Expected class: `in_scope`.
- Actual final dry-run class: `in_scope` at confidence 0.95.
- Website discovery: official_website_found; would write: https://www.aaiclinics.com/.
- Rationale: The business provides consumer-facing anti-aging treatments, hormone replacement therapy, and wellness solutions, which are in-scope elective wellness services.
- Serving writes attempted/written: 0/0.

## Deterministic 50-row dry-run sample

Seed: `pass1-stage3-proposal-v1`. Results below are persisted run evidence; the proposal renderer does not call external providers.

| # | ID | Name | Stratum | Subject | Locations | Prior | Actual | Confidence | Discovery | Would write website | Rationale |
| ---: | ---: | --- | --- | --- | ---: | --- | --- | ---: | --- | --- | --- |
| 1 | 9390 | AAI Rejuvenation | reference | organization:4308 | 1 | review | in_scope | 0.95 | official_website_found | https://www.aaiclinics.com/ | The business provides consumer-facing anti-aging treatments, hormone replacement therapy, and wellness solutions, which are in-scope elective wellness services. |
| 2 | 1827 | ABLOU Stem Cell Clinic | missing_site_provider | organization:1309 | 1 | review | plain_hospital | 0.90 | official_website_not_found | — | The clinic focuses on treatment tourism for serious medical diseases and chronic conditions, which falls under plain_hospital. |
| 3 | 13641 | Clínica de Oxigenación Hiperbárica | missing_site_provider | organization:9533 | 1 | review | review | 0.85 | official_website_not_found | — | There is no website or detailed description available to verify if this hyperbaric clinic is oriented toward consumer wellness/recovery or clinical medical treatment. |
| 4 | 13585 | Breathe 02 Hbot | missing_site_provider | organization:9477 | 1 | review | review | 0.85 | official_website_not_found | — | Lacks a website or detailed service descriptions to determine if the hyperbaric oxygen therapy is offered as a consumer wellness/recovery service or for clinical medical rehabilitation. |
| 5 | 14026 | Hyperbaric Life | missing_site_provider | organization:9885 | 1 | review | in_scope | 0.90 | official_website_not_found | — | The business provides hyperbaric oxygen therapy, which is an in-scope elective wellness and recovery service. |
| 6 | 313 | CryoBodyBK - Brooklyn Cryotherapy Spa | missing_site_provider | location:313 | 1 | review | in_scope | 0.95 | official_website_not_found | — | The location is a cryotherapy spa offering elective wellness and recovery services. |
| 7 | 9408 | Soaks+Senses Club | missing_site_search | organization:4320 | 1 | review | review | 1.00 | official_website_not_found | — | No website or specific wellness offerings are available to confirm the business's scope. |
| 8 | 9441 | Tringali Vibrant Health | missing_site_search | organization:4349 | 1 | review | in_scope | 1.00 | official_website_found | http://www.tringali-health.com/ | The business is a functional medicine practice providing a wide range of elective wellness, longevity, and recovery treatments. |
| 9 | 9428 | RESET Cryotherapy | missing_site_search | organization:4337 | 1 | review | in_scope | 0.90 | official_website_not_found | — | The business provides cryotherapy, which is a core recovery and wellness service. |
| 10 | 9398 | Casa Privee | missing_site_search | organization:4314 | 1 | review | review | 0.90 | official_website_not_found | — | Insufficient evidence to determine if the business is in-scope or out-of-scope due to lack of website and detailed offerings. |
| 11 | 2698 | NewYork-Presbyterian Medical Group Queens - Primary Care - Sunnyside | org_conflict | organization:309 | 40 | review | plain_hospital | 0.95 | stored_website_present | — | Reconciling all branches shows this is a large hospital system providing ordinary medical care, which falls under plain_hospital. |
| 12 | 9979 | CoolSculpting St Lucie | org_conflict | organization:2268 | 4 | in_scope | in_scope | 0.95 | stored_website_present | — | The business specializes in non-invasive body contouring and aesthetic treatments, which are in-scope elective wellness services. |
| 13 | 5032 | Center of laser vision correction CARE VISION in Nuremberg | org_conflict | organization:7796 | 30 | plain_hospital | plain_hospital | 0.95 | stored_website_present | — | The core business is refractive eye surgery and ophthalmology, which represents ordinary specialized medical care rather than preventive longevity or consumer wellness. |
| 14 | 9092 | SimonMed | org_conflict | organization:4062 | 6 | destination_medical | destination_medical | 0.95 | stored_website_present | — | SimonMed Longevity provides explicit consumer-facing preventive diagnostics and whole-body MRI scans designed for early detection and longevity planning in asymptomatic individuals. |
| 15 | 3402 | Advanced Pain Care | org_conflict | organization:1847 | 19 | in_scope | plain_hospital | 0.95 | stored_website_present | — | The core business is clinical pain management and interventional pain medicine, which constitutes ordinary medical care rather than elective consumer wellness or longevity. |
| 16 | 2038 | iCRYO Dallas – Preston Hollow | org_conflict | organization:1471 | 46 | in_scope | in_scope | 0.99 | stored_website_present | — | The core business is consumer-facing elective wellness, recovery, and longevity therapies, which are fully in scope. |
| 17 | 7203 | National Neuropathy Center | org_conflict | organization:3336 | 9 | in_scope | plain_hospital | 0.95 | stored_website_present | — | The core business is treating neuropathy, chronic pain, and orthopedic issues, which represents ordinary medical care and rehabilitation. |
| 18 | 2001 | BodySpec | org_conflict | organization:1470 | 20 | in_scope | in_scope | 0.95 | stored_website_present | — | DEXA scans and elective full-body MRIs for health tracking and body composition are in-scope preventive and wellness services. |
| 19 | 6830 | Heartland Dermatology | org_conflict | organization:3205 | 16 | in_scope | plain_hospital | 0.90 | stored_website_present | — | Despite offering some cosmetic services, the core business is medical dermatology and skin cancer treatment, which constitutes ordinary medical care. |
| 20 | 327 | One Medical Primary Care Clinic - Park Slope | org_conflict | organization:70 | 28 | review | plain_hospital | 0.95 | stored_website_present | — | One Medical is a primary care clinic focused on ordinary healthcare delivery and general medicine. |
| 21 | 13306 | William Mcwhorter | org_conflict | organization:6395 | 2 | plain_hospital | plain_hospital | 0.90 | stored_website_present | — | The business is primarily an orthopedic medical practice focusing on joint treatment and physical therapy, which constitutes ordinary medical care. |
| 22 | 7955 | Duke Cancer Center Cary | org_conflict | organization:2283 | 27 | plain_hospital | plain_hospital | 0.95 | stored_website_present | — | Although it includes an executive health clinic, the pooled organization is a major academic medical center and hospital system providing ordinary healthcare delivery. |
| 23 | 2061 | Next Health | org_conflict | organization:1 | 33 | review | in_scope | 0.95 | stored_website_present | — | The core business is elective consumer longevity, recovery, and wellness care. |
| 24 | 2113 | Prenuvo Clinic - Jacksonville, FL | org_conflict | organization:1472 | 54 | review | destination_medical | 0.95 | stored_website_present | — | The core business is a consumer-facing preventive diagnostic imaging program for well individuals. |
| 25 | 7774 | Dermatology Clinic of Laredo – Oasis Dermatology Group PLLC | org_conflict | organization:3562 | 6 | in_scope | plain_hospital | 0.90 | stored_website_present | — | Although the clinic offers elective cosmetic procedures like Botox and body contouring, its core business is medical dermatology, which constitutes ordinary healthcare delivery. |
| 26 | 4043 | Central Rappahannock Regional Library Salem Church Branch | guard_junk_evidence | organization:2157 | 2 | review | junk | 1.00 | stored_website_present | — | A public library is a non-wellness business and is out of scope for a longevity and wellness catalog. |
| 27 | 12618 | The Therapy Network – Chesapeake | guard_junk_evidence | organization:6010 | 2 | review | review | 0.85 | stored_website_present | — | Physical therapy and injury rehabilitation clinics represent ordinary healthcare delivery and are classified as plain hospital. |
| 28 | 3730 | Aspire Physical Recovery Center at Cahaba River, LLC | guard_junk_evidence | organization:2004 | 2 | review | plain_hospital | 0.90 | stored_website_present | — | Physical recovery and rehabilitation centers fall under ordinary medical care and rehabilitation, which is classified as plain hospital. |
| 29 | 1474 | Centre for Commercialization of Regenerative Medicine | guard_junk_evidence | organization:971 | 1 | review | junk | 0.95 | stored_website_present | — | It is a research, development, and venture incubation organization with no consumer-bookable longevity or wellness services. |
| 30 | 7540 | Creating Space Therapy PLLC | guard_junk_evidence | organization:3466 | 11 | review | plain_hospital | 0.95 | stored_website_present | — | The business is a standard mental health and psychotherapy practice, which falls under ordinary healthcare delivery rather than elective consumer longevity or wellness. |
| 31 | 13072 | Vital Infusions & Performance | guard_junk_evidence | organization:6284 | 1 | review | review | 0.90 | stored_website_present | — | The available evidence only contains the name and website with no listed offerings or detailed descriptions of services, requiring manual review. |
| 32 | 9004 | Op. Dr. Ozan Balik | guard_destination | location:9004 | 1 | review | in_scope | 0.95 | stored_website_present | — | The business provides elective aesthetic, plastic surgery, and anti-aging/longevity treatments, which are in-scope consumer wellness and aesthetic services. |
| 33 | 1877 | Dunyagoz Eye Hospital Çorlu | guard_destination | organization:9145 | 4 | review | plain_hospital | 0.95 | stored_website_present | — | The organization is a specialized eye care hospital network, which represents ordinary medical care rather than consumer longevity or wellness. |
| 34 | 12367 | Tekton Research | guard_research | organization:5853 | 2 | review | junk | 0.90 | stored_website_present | — | The business is a clinical research site conducting trials, making it a research-only institution with no consumer-bookable wellness services. |
| 35 | 9765 | BTX Clinical Research | guard_research | organization:4485 | 1 | review | junk | 0.90 | stored_website_present | — | The organization is a clinical research facility, which qualifies as a research-only institution without consumer-bookable wellness care. |
| 36 | 1331 | Healthy Aroma & Reflexology Inc | parser_failure | organization:856 | 1 | review | in_scope | 0.95 | stored_website_present | — | The business provides elective wellness, recovery, and aesthetic services such as reflexology, bodywork, and facials, which are in scope for consumer wellness. |
| 37 | 11673 | Rise Physical Therapy- West Fayetteville | parser_failure | organization:5439 | 1 | review | plain_hospital | 0.95 | stored_website_present | — | Ordinary physical therapy and rehabilitation clinics are classified as plain_hospital under ordinary healthcare delivery. |
| 38 | 11649 | Revolution Wellness | parser_failure | organization:5422 | 1 | review | review | 0.90 | stored_website_present | — | The available evidence is insufficient to determine if the clinic's core business is in-scope wellness or ordinary medical care. |
| 39 | 11658 | Rhyneer Caylor Clinic | parser_failure | organization:5428 | 1 | review | review | 0.90 | stored_website_present | — | The available evidence is insufficient to determine if the clinic's core business is in-scope wellness or ordinary medical care. |
| 40 | 11669 | Riordan Medical Institute | parser_failure | organization:5435 | 1 | review | in_scope | 0.95 | stored_website_present | — | Riordan Medical Institute's offerings in regenerative medicine, aesthetic procedures, and wellness infusions align with in-scope elective wellness and longevity care. |
| 41 | 1631 | Sanare Wellness Centre - Bio Energy Therapy | non_us | organization:1120 | 1 | review | in_scope | 0.90 | stored_website_present | — | The business focuses on alternative and integrative wellness therapies (Bio Energy Therapy, holistic medicine), which are in-scope consumer wellness services. |
| 42 | 12742 | Trinity Stem Cells Guadalajara | non_us | organization:6098 | 4 | review | review | 0.90 | stored_website_present | — | The pooled branches represent highly contradictory services, combining ordinary oncology care, myotherapy, and stem cell clinics under a single organization profile, requiring manual reconciliation. |
| 43 | 2216 | CBK Plastic Surgery | non_us | organization:1543 | 1 | review | in_scope | 0.90 | stored_website_present | — | The clinic's core business is elective aesthetic and plastic surgery, which falls under in-scope aesthetic and elective wellness care. |
| 44 | 1723 | Bwell Clinic -Fisioterapia Deportiva-Osteopatía-Nutrición-Fisio Embarazo Y Post Parto-Fisio Pediátrica-Entrenamiento | non_us | organization:1209 | 1 | review | plain_hospital | 0.90 | stored_website_present | — | The core business is physical therapy and rehabilitation, which is classified as ordinary healthcare delivery (plain_hospital). |
| 45 | 1706 | Dra. Couce Meradi - We Glow Barceloneta | non_us | organization:1192 | 1 | review | in_scope | 0.90 | stored_website_present | — | Aesthetic and skin care clinics are in-scope as elective wellness and aesthetic care destinations. |
| 46 | 8627 | BioSerenity | general | organization:3887 | 2 | review | junk | 0.95 | stored_website_present | — | BioSerenity is a medical technology and diagnostic device manufacturer, not a consumer-bookable wellness or longevity destination. |
| 47 | 10344 | Harrisonburg VA Clinic | general | location:10344 | 1 | review | plain_hospital | 0.98 | stored_website_present | — | Ordinary healthcare delivery facilities, such as primary care and VA clinics, are classified as plain_hospital. |
| 48 | 9579 | American Med | general | organization:4401 | 1 | review | plain_hospital | 0.90 | stored_website_present | — | Standard medical clinics providing ordinary healthcare services are classified as plain_hospital. |
| 49 | 10295 | Gerhard C. Hildebrandt, MD | general | organization:1796 | 6 | review | plain_hospital | 0.95 | stored_website_present | — | The organization is a podiatric medical clinic focusing on foot and ankle care, which constitutes ordinary medical treatment rather than consumer wellness or longevity. |
| 50 | 5178 | Gateway Dysphagia Diagnostics | general | organization:2630 | 1 | review | plain_hospital | 0.95 | stored_website_present | — | The organization specializes in dysphagia diagnostics and swallowing evaluations, which is ordinary medical diagnostic care and not consumer wellness or longevity. |

## Approval-gated full-run behavior

- One escalation judgment per pooled subject; confidence below 0.75, model class `review`, invalid structured evidence, discovery mismatch, or hard-exclusion drift remains active with `needs_human_review` and goes to the final human-review document.
- `junk` requires affirmative cited junk evidence; research requires explicit research-only/no-consumer-care evidence.
- `destination_medical` remains limited to preventive, diagnostic, or longevity destination programs; treatment tourism remains `plain_hospital`.
- Only high-confidence `junk` and `plain_hospital` rows use the same atomic hidden-status plus raw-source suppression recipe and hard exclusions as Gate B.
- Website writes use the field ledger guard; no organization domain is inferred or written from a branch website.

**EXECUTION AUTHORIZED — continue under the final standing orders.**
