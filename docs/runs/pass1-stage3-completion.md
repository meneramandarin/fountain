# Pass 1 Legitimacy Triage — Stage 3 Completion

**STAGE 3 COMPLETE**

Run 57; campaign `pass1_stage3_full`; model `google/gemini-3.5-flash`; confidence threshold 0.75; concurrency 24.

## Cohort and disposition reconciliation

| Metric | Count |
| --- | ---: |
| Effective review rows | 2,156 |
| Pooled subjects | 1,187 |
| Keep rows | 570 |
| Atomically suppressed rows | 1,304 |
| Active needs_human_review rows | 282 |
| Task evidence rows inserted | 2,156 |

Partition: 570 + 1,304 + 282 = 2,156.

## Classification counts

| Class | Subjects | Rows |
| --- | ---: | ---: |
| junk | 249 | 360 |
| plain_hospital | 444 | 944 |
| review | 257 | 282 |
| destination_medical | 6 | 112 |
| in_scope | 231 | 458 |

## Website discovery

- Blank website rows searched: 60.
- Official websites validated: 21.
- Ledger-guarded writes attempted/completed: 21/21.
- Guarded skips: 0.
- Order: stored provider ID may use direct contact details; otherwise agent web search precedes Places search/contact fallback.

## Atomic suppression reconciliation

| Check | Expected | Actual |
| --- | ---: | ---: |
| Hidden locations | 1,304 | 1,304 |
| Suppression-ledger rows | 1,849 | 1,849 |
| Stamped events | 1,304 | 1,304 |
| Residual search rows | 0 | 0 |
| Hard exclusions touched | 0 | 0 |

## Provider evidence and safety

- LLM calls/subjects: 149/1,187.
- Provider/parser failures: 8; rolling-500 halt threshold was not breached.
- Ledgered run spend at report time: $6.6516.
- AAI Rejuvenation (location 9390): `in_scope` at 0.95.

All keep-class rows remained active. Ambiguous, invalid, below-threshold, or hard-excluded rows remained active with `needs_human_review` task evidence.
