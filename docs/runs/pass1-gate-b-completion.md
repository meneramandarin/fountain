# Pass 1 Legitimacy Triage — Gate B Completion

**GATE B COMPLETE**

What was done: Atomically suppressed 5,212 approved Gate B locations. Each location was hidden, removed from serving search by the existing trigger, linked source listings were added to the re-ingestion suppression ledger, task evidence was updated, and the generated location event was stamped with apply run 52.

Evidence: Apply run 52; classification runs 39 and 40; actor `pass1_gate_b_apply_run_52` / `b5c71897-83d0-4c30-a7a3-202607120002`.

Deviations from rubric/plan: None. The approved effective suppression set was unchanged at apply time.

Open questions: None for Gate B. Stage 3 review resolution remains separately approval-gated.

## Atomic reconciliation

| Check | Expected | Actual |
| --- | ---: | ---: |
| Terminal classified cohort | 13,521 | 13,521 |
| Organization-conflict keys excluded | 62 | 62 |
| Approved suppressions | 5,212 | 5,212 |
| Location change events stamped with run_id | 5,212 | 5,212 |
| Task serving-write evidence rows | 5,212 | 5,212 |
| Guarded status ledger rows | 5,212 | 5,212 |
| Source-record fan-out / suppression-ledger delta | 8,175 | 8,175 |
| Candidate locations without source records | 0 | 0 |
| Pre-existing candidate status-ledger rows | 0 | 0 |
| Remaining suppressed-location search rows | 0 | 0 |
| Hard-excluded locations touched | 0 | 0 |

Suppression ledger: 345 → 8,520. Active serving locations after apply: 8,309; hidden locations: 5,569.

## Applied classes

| Class | Suppressed |
| --- | ---: |
| junk | 412 |
| plain_hospital | 4,800 |

## Budget evidence

Final classification evidence runs used $0.8543 of $40.0000 across 2 run(s); all calibration and final classification attempts used $2.7273. The atomic apply made no external calls and added $0 model/provider spend.

## Ten deterministic spot checks

| ID | Name | Location | Class | Confidence | Model | Source rows | Rationale |
| ---: | --- | --- | --- | ---: | --- | ---: | --- |
| 12398 | Texas Comprehensive Spine Center | Arlington, TX, US | plain_hospital | 0.85 | openai/gpt-4o-mini | 1 | Cancer center indicates ordinary healthcare delivery. |
| 1355 | Dr Robert G. Silverman, DC. Westchester Integrative Health | Hartsdale, NY, US | plain_hospital | 0.90 | openai/gpt-4o-mini | 1 | Primarily provides chiropractic and rehabilitation services. |
| 7342 | HII Family Health Center | Newport News, VA, US | plain_hospital | 0.90 | openai/gpt-4o-mini | 2 | Offers general healthcare services, not focused on wellness. |
| 4865 | Entira Family Clinics – West St. Paul | Woodbury, MN, US | plain_hospital | 0.80 | openai/gpt-4o-mini | 1 | Provides a range of family medicine services, including chronic care. |
| 5182 | Hampton Roads Orthopaedics Spine & Sports Medicine – Southside | Newport News, VA, US | plain_hospital | 0.85 | openai/gpt-4o-mini | 1 | Offers orthopedic and physical therapy services, typical of standard medical practices. |
| 5191 | Henrico Doctors’ Hospital | Richmond, VA, US | plain_hospital | 0.90 | openai/gpt-4o-mini | 2 | Provides general hospital services, typical of a healthcare facility. |
| 12881 | University of Minnesota Health-Blood & Marrow Transplant Clinic | Minneapolis, MN, US | junk | 0.90 | openai/gpt-4o-mini | 1 | Research center, not a consumer wellness destination. |
| 10104 | Dr. Jianguo Cheng, MD | Cleveland, OH, US | plain_hospital | 0.90 | openai/gpt-4o-mini | 1 | Offers ordinary healthcare services including cancer care and rehabilitation. |
| 2744 | Richmond Health Network | Staten Island, NY, US | plain_hospital | 0.90 | openai/gpt-4o-mini | 1 | Richmond University Medical Center is a nonprofit hospital providing a full spectrum of acute and primary care services. |
| 12143 | Staunton Chiropractic Center | Staunton, VA, US | plain_hospital | 0.90 | openai/gpt-4o-mini | 2 | Focuses on physical therapy and rehabilitation, typical of ordinary healthcare delivery. |

## Restore recipe

A restore must run in one guarded transaction and target apply run 52 only: restore each location's status from the stamped event's `before_data`; delete the 8,175 suppression-ledger rows whose `suppressed_by` is `pass1_gate_b_apply_run_52`; remove only that actor's run-created `status` field-ledger rows; and append run-linked restore events. The pre-apply audit found zero candidate status-ledger rows, so all 5,212 actor-marked rows were created by run 52. Abort unless all three counts reconcile before commit.

The applied task results retain the original class, confidence, model, and rationale plus `serving_write` and `suppression` evidence for this run.
