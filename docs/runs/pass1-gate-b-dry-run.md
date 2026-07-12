# Pass 1 Legitimacy Triage — Gate B Full Dry Run

**GATE B AWAITING APPROVAL**

What was done: Classified all 13,521 eligible active locations under rubric v2 and computed the complete dry-run suppression set. No suppression was applied.

Evidence: 13,521/13,521 eligible tasks are terminal and classified with zero serving-write attempts. Class reconciliation, rubric guards, suppression samples, and run-ledger usage follow.

Deviations from rubric/plan: The Gate A re-run was skipped at the operator's explicit direction. Safety-sample calibration superseded 5 earlier drain run(s) after a cached-NUL serialization defect and fail-closed guard refinements. The ledgered deterministic policy replay updated 33 research-only row(s). All classification attempts spent $2.7273; final usage is isolated to evidence runs 39 and 40. No serving writes occurred.

Open questions: Approve, reject, or revise the dry-run `junk` and `plain_hospital` suppression set before any serving write.

## Safety and reconciliation

- Active locations: 13,521; hard-excluded: 0; eligible: 13,521.
- Queue reconciliation: 13,521/13,521 tasks; zero missing, unexpected, or duplicate entity rows.
- Every task is terminal and classified; task evidence records zero serving-write attempts.
- Organization conflict backstop: 62 classification key(s), covering 723 location(s), were conservatively converted to effective `review`.

## Effective class counts

| Class | Count |
| --- | ---: |
| junk | 412 |
| plain_hospital | 4,800 |
| review | 2,156 |
| destination_medical | 81 |
| in_scope | 6,072 |

**Total would-be suppressions: 5,212.**

## Rubric guard outcomes

Counts are derived from each location task's final-stage classification evidence (Stage 2 when present; otherwise Stage 1). Organization siblings remain distinct outputs.

| Guard outcome | Flag | Outputs |
| --- | --- | ---: |
| Ambiguous research signal → review | `ambiguous_research_to_review` | 5 |
| Treatment destination → plain_hospital | `destination_treatment_to_plain_hospital` | 16 |
| Unsupported destination_medical → review | `destination_without_qualifying_program` | 41 |
| Id set mismatch | `id_set_mismatch` | 9 |
| Ordinary PT/chiro/rehab in_scope → plain_hospital | `in_scope_ordinary_rehab_to_plain_hospital` | 21 |
| Invalid json response | `invalid_json_response` | 148 |
| Ordinary-care junk → plain_hospital | `junk_ordinary_care_to_plain_hospital` | 940 |
| Junk without positive evidence → review | `junk_without_positive_evidence` | 1,020 |
| Missing location result | `missing_location_result` | 3 |
| Affirmative research-only/non-consumer evidence → junk | `research_without_consumer_care` | 84 |

## Budget and usage

| Metric | Actual |
| --- | ---: |
| Final-evidence budget total | $40.0000 |
| Final-evidence run-recorded spend | $0.8543 |
| Final-evidence call-ledger spend | $0.8543 |
| Final-evidence remaining budget | $39.1457 |
| All-attempt run-recorded spend | $2.7273 |
| Superseded-attempt run-recorded spend | $1.8730 |
| External calls | 891 |
| Stage 1 calls | 677 |
| Stage 2 calls | 214 |
| Input tokens | 4,452,218 |
| Output tokens | 310,713 |
| Stage 2 candidates | 1,774 |
| Website fetch attempts | 1,721 |
| Cache hits | 1,588 |
| Network fetches | 133 |
| Fetch failures | 253 |
| No website | 53 |

### Classification attempt ledger

Drain runs are non-preview because they persist classification evidence only in `fountain_ops`; the serving suppression set remains unapplied.

| Run | Role | Stage | Status | Concurrency | Budget | Spend | Queue preview only |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 31 | superseded calibration | stage_1 | completed | 16 | $25.0000 | $0.6986 | false |
| 32 | superseded calibration | stage_2 | failed | 16 | $15.0000 | $0.1602 | false |
| 33 | superseded calibration | stage_2 | completed | 24 | $15.0000 | $0.1618 | false |
| 36 | superseded calibration | stage_1 | completed | 24 | $25.0000 | $0.6990 | false |
| 37 | superseded calibration | stage_2 | completed | 24 | $15.0000 | $0.1534 | false |
| 39 | final evidence | stage_1 | completed | 24 | $25.0000 | $0.6995 | false |
| 40 | final evidence | stage_2 | completed | 24 | $15.0000 | $0.1548 | false |

### Deterministic policy replay ledger

Replay totals: 1 run(s), 987 candidate row(s), 33 updated row(s). These updates touched task evidence only, never serving tables.

| Run | Status | Reason | Source runs | Selected | Updated | Queue preview only |
| ---: | --- | --- | --- | ---: | ---: | --- |
| 42 | completed | research_positive_evidence_guard | 39, 40 | 987 | 33 | false |

## Top 20 largest would-be suppressions

Ordered by live review count, then live offering count.

| ID | Name | Location | Class | Confidence | Reviews | Offerings | Rationale |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 1813 | Wockhardt Hospital | Nashik, IN | plain_hospital | 0.85 | 12925 | 0 | Delivers general healthcare services without a specific preventive or longevity program. |
| 799 | Skyview Wellness Center | Flushing, NY, US | plain_hospital | 0.90 | 12372 | 15 | Offers a variety of medical services but lacks a clear focus on wellness or longevity. |
| 13587 | Sheikh Shakhbout Medical City (SSMC) | Abu Dhabi, AE | plain_hospital | 0.90 | 5904 | 1 | Functions as a large hospital providing complex healthcare services. |
| 1937 | EKOL International HOSPITALS - İzmir | İzmir, TR | plain_hospital | 0.90 | 4959 | 8 | Offers various hand surgeries, indicating a focus on ordinary healthcare delivery. |
| 1878 | Patient centered Pain Clinic | Istanbul, TR | plain_hospital | 0.90 | 3949 | 0 | Offers various surgeries and health check-ups, indicating a focus on ordinary healthcare. |
| 1363 | White Plains Hospital | White Plains, NY, US | plain_hospital | 0.90 | 3682 | 0 | General hospital providing comprehensive medical services, not focused on elective wellness. |
| 10727 | Meijer | Aurora, IL, US | junk | 0.90 | 3595 | 0 | Meijer is a retail store, not a wellness or medical destination. |
| 389 | Medical Offices of Manhattan - Midtown | New York, NY, US | plain_hospital | 0.85 | 3478 | 30 | Provides primary care and specialist services, emphasizing acute and chronic condition management. |
| 462 | Medical Offices of Manhattan - Upper East Side | New York, NY, US | plain_hospital | 0.85 | 3354 | 30 | Provides primary care and specialist services, emphasizing acute and chronic condition management. |
| 665 | Pain Physicians NY | Brooklyn, NY, US | plain_hospital | 0.85 | 2267 | 1 | Pain management clinic offering treatments for acute and chronic pain conditions. |
| 177 | Prompt-MD Urgent Care Center Of Hoboken | Hoboken, NJ, US | plain_hospital | 0.90 | 2232 | 5 | Prompt-MD is an urgent care clinic, providing ordinary healthcare services, not elective wellness. |
| 11095 | Patient Plus Urgent Care – Bocage | Baton Rouge, LA, US | plain_hospital | 0.85 | 2148 | 0 | Urgent care services indicate ordinary healthcare delivery. |
| 2197 | Precision Imaging Centers | Jacksonville, FL, US | plain_hospital | 0.85 | 2131 | 14 | Provides various imaging services, primarily for diagnostic purposes, not wellness-focused. |
| 12908 | Urgentology Care – Arlington | Arlington, TX, US | plain_hospital | 0.90 | 1938 | 19 | Urgentology Care – Arlington is primarily an urgent care service, not a wellness destination. |
| 10572 | Kohl’s | Aurora, IL, US | junk | 0.90 | 1776 | 0 | Kohl's is a retail store, not a wellness destination. |
| 1777 | Medipol University Pendik Hospital | Istanbul, TR | plain_hospital | 0.90 | 1724 | 14 | Offers various surgeries and health check-ups, indicating a focus on ordinary healthcare. |
| 105 | Prompt-MD Urgent Care Center Of Jersey City | Jersey City, NJ, US | plain_hospital | 0.90 | 1718 | 7 | Prompt-MD is an urgent care clinic, providing ordinary healthcare services, not elective wellness. |
| 760 | MyDoc Urgent Care Forest Hills and Kew Gardens | Forest Hills, NY, US | plain_hospital | 0.90 | 1528 | 12 | Urgent care clinic treating non-life-threatening medical conditions. |
| 1811 | Medical Center Rechts der Isar | Munich, DE | plain_hospital | 0.85 | 1481 | 0 | Delivers general healthcare services without a specific preventive or longevity program. |
| 1938 | Private Medicabil Hospital | Bursa, TR | plain_hospital | 0.85 | 1460 | 33 | General hospital services do not align with elective wellness or longevity care. |

## 20 deterministic random would-be suppressions

Seed: `pass1-gate-b-dry-run-v2`.

| ID | Name | Location | Class | Confidence | Reviews | Offerings | Rationale |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 8656 | Coast Spine Sport Medicine | Rancho Cucamonga, CA, US | plain_hospital | 0.90 | 0 | 6 | Core business is orthopedic surgery and pain management, typical of a plain hospital. |
| 10610 | Legacy Pain and Regenerative Medicine | Addison, TX, US | plain_hospital | 0.90 | 0 | 0 | Sports medicine facility providing ordinary care, not focused on wellness or longevity. |
| 10579 | K Peter Huber, DC | Stockton, CA, US | plain_hospital | 0.90 | 0 | 32 | Chiropractic care is the primary offering, which is classified as ordinary healthcare delivery. |
| 198 | The Pelvic PT | Hoboken, NJ, US | plain_hospital | 0.85 | 29 | 1 | Pelvic floor physical therapy is not classified as elective wellness care. |
| 8410 | CareSTL Health | St. Louis, MO, US | plain_hospital | 0.80 | 0 | 20 | Offers general healthcare services, not focused on wellness. |
| 8536 | Neuropathy Treatment | Valley Stream, NY, NY, US | plain_hospital | 0.90 | 0 | 0 | Focus on diagnosing and treating nerve disorders indicates ordinary healthcare delivery. |
| 5244 | Midwestern University Multispecialty Clinics | Downers Grove, IL, US | junk | 0.80 | 0 | 0 | Focuses on dental and animal care, not consumer wellness or longevity services. |
| 7580 | Greater Austin Pain Center – Pain Doctor | Dripping Springs, TX, US | plain_hospital | 0.90 | 0 | 10 | Offers pain management treatments but is primarily a pain clinic. |
| 12548 | The Providence Center Crisis Stabilization Unit | Providence, RI, US | plain_hospital | 0.90 | 0 | 0 | The Providence Center provides standard healthcare services, classifying it as ordinary healthcare. |
| 11163 | Powered by Movement Physical Therapy & Performance | St. Louis, MO, US | plain_hospital | 0.95 | 0 | 0 | Purely a physical therapy center without elective wellness services. |
| 6606 | Long Beach Comprehensive Health Center | Downey, CA, US | plain_hospital | 0.90 | 0 | 0 | Offers primary care and urgent care services, typical of a hospital setting. |
| 4871 | Entira Family Clinics – West St. Paul | Saint Paul, MN, US | plain_hospital | 0.80 | 0 | 0 | Provides a range of family medicine services, including chronic care. |
| 5328 | Bionic Prosthetics & Orthotics | Laredo, TX, US | plain_hospital | 0.90 | 0 | 11 | Focus on prosthetics and orthotics indicates a non-wellness business. |
| 9149 | Houston Healing Chiropractic | Houston, TX, US | plain_hospital | 0.90 | 0 | 2 | Chiropractic services do not qualify as consumer wellness/medical destinations. |
| 8109 | Advanced Physical Therapy – Maumelle Boulevard | Little Rock, AR, US | plain_hospital | 0.90 | 0 | 2 | Offers physical therapy and rehabilitation services, not elective wellness. |
| 5314 | Anesis Therapy | Madison, WI, US | plain_hospital | 0.90 | 0 | 9 | Evidence shows focus on mental health services, not wellness or longevity care. |
| 6154 | Pass Physical Therapy | Moreno Valley, CA, US | plain_hospital | 0.90 | 0 | 39 | Focus on physical therapy, typical of a plain hospital. |
| 2738 | NY Family Practice Physicians PC | Williamsburg, NY, US | plain_hospital | 0.85 | 0 | 0 | NY Family Practice Physicians offers primary care services, typical of a healthcare delivery organization. |
| 11638 | ReVive Health Centre | Naperville, IL, US | plain_hospital | 0.85 | 0 | 0 | Focuses on chiropractic care and physical therapy, which are ordinary healthcare services. |
| 12392 | Texas Bone and Joint – Las Colinas | Irving, TX, US | plain_hospital | 0.80 | 0 | 0 | Orthopedic services indicate ordinary healthcare delivery. |

## Review queue

2,156 effective review row(s) are rendered in `docs/runs/pass1-review-queue.md`.

**STOP — AWAITING CONFIRMATION BEFORE SUPPRESSION APPLY.**
