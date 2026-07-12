# Image Classification Completion

Completed at `2026-07-12T08:14:44Z`.

## Outcome

- Eligible active, non-suppressed images classified: **12,984 / 12,984**.
- Residual unclassified images: **0** across **0** locations (dry census run 88).
- Total guarded image update events: **12,984**.
- Total `image_kind` field-ledger rows stamped by the three classification runs: **12,984**.
- Total OpenRouter spend: **$40.10244825**.
- Junk policy: all **163** junk images remain active and undeleted; `image_kind = 'junk'` makes them ineligible for future primary selection.

## Kind counts

| `image_kind` | Images | Locations |
| --- | ---: | ---: |
| `photo` | 9,376 | 5,225 |
| `text_graphic` | 2,379 | 1,037 |
| `logo` | 1,066 | 729 |
| `junk` | 163 | 137 |
| **Total** | **12,984** | — |

## Run sequence

| Run | Outcome | Done locations | Failed locations | Image events | Successful calls | Error calls | Spend |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 80 | Halted at the standing-order rolling threshold | 1,498 | 54 | 5,122 | 5,082 | 163 | $19.51246920 |
| 82 | Queue drained after AVIF remediation; opaque `.img`/SVG cluster isolated | 5,068 | 12 | 7,483 | 7,446 | 36 | $19.71169950 |
| 86 | Repaired residual drain | 66 | 0 | 379 | 377 | 0 | $0.87827955 |

The **79** event/call difference is deterministic classification that did not require an LLM call. All 199 provider error rows were HTTP 400 format rejections and carried zero estimated cost.

## Failure diagnosis and remediation

Run 80 halted exactly at **126 failures / 500 outcomes (25.2%)**. OpenRouter rejected public AVIF image URLs. The repaired classifier downloads those assets through the existing SSRF, redirect, timeout, pixel, and 15 MB guards and converts them to bounded JPEG data URLs.

Run 82 then isolated 12 locations whose first image was an opaque `.img` blob backed by a MyMediTravel SVG placeholder. The second remediation extends the same guarded conversion path to opaque `.img` and direct SVG inputs, rejects active/external SVG references before rendering, and leaves supported JPEG/PNG/WebP URLs on the original remote path.

Residual census run 85 atomically reconciled and inserted exactly **66** tasks covering **379** images with zero drift and zero active conflicts. Run 86 completed the entire residual cohort with zero failures. Run 88 independently confirmed zero remaining candidates.

## Reconciliation

| Evidence | Run 80 | Run 82 | Run 86 | Total |
| --- | ---: | ---: | ---: | ---: |
| Guarded `images` update events | 5,122 | 7,483 | 379 | 12,984 |
| `field_status` rows stamped by run | 5,122 | 7,483 | 379 | 12,984 |

The event and field-ledger counts are exact for every run. No images were deleted or hidden by classification. Historical failed task rows from runs 80 and 82 remain as immutable audit evidence; every image they left unclassified was re-enqueued and completed in run 86.
