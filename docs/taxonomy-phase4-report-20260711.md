# Taxonomy Phase 4 Report

- Date: 20260711
- Mode: live
- Treatments before/after: 43 -> 62
- Expected treatment count: 62
- Treatment count OK: true
- Active mapped offering coverage: 21.31% -> 28.25%
- Offering rows changed: 7738
- Inserted aliases: 319
- Remapped aliases: 8
- Search-index locations refreshed: 2801

## Backups

- `fountain_raw.taxonomy_phase4_treatments_backup_20260711`
- `fountain_raw.taxonomy_phase4_treatment_aliases_backup_20260711`
- `fountain_raw.taxonomy_phase4_offering_treatment_backup_20260711`

## New Treatments

| id | canonical_name | category | aliases | offering rows changed | locations changed |
| --- | --- | --- | --- | --- | --- |
| 44 | Physical therapy | Recovery & performance | 12 | 1087 | 684 |
| 45 | Chiropractic care | Lifestyle & foundational | 12 | 753 | 442 |
| 46 | Acupuncture | Lifestyle & foundational | 11 | 531 | 319 |
| 47 | Microneedling | Aesthetic | 22 | 724 | 449 |
| 48 | Body contouring | Aesthetic | 12 | 435 | 303 |
| 49 | Massage therapy | Recovery & performance | 12 | 399 | 292 |
| 50 | Laser hair removal | Aesthetic | 12 | 359 | 241 |
| 51 | Hair restoration | Regenerative & cellular | 12 | 501 | 388 |
| 52 | Skin tightening | Aesthetic | 12 | 248 | 161 |
| 53 | Hydrafacial | Aesthetic | 12 | 203 | 153 |
| 54 | Ozone therapy | Regenerative & cellular | 12 | 182 | 143 |
| 55 | Laser skin resurfacing | Aesthetic | 12 | 140 | 110 |
| 56 | Lymphatic drainage | Recovery & performance | 12 | 137 | 103 |
| 57 | Chemical peel | Aesthetic | 12 | 114 | 87 |
| 58 | Colon hydrotherapy | Lifestyle & foundational | 11 | 49 | 23 |
| 59 | Laser tattoo removal | Aesthetic | 4 | 29 | 29 |
| 60 | Testosterone replacement therapy (TRT) | Hormone & metabolic | 12 | 317 | 250 |
| 61 | Menopause hormone therapy (HRT) | Hormone & metabolic | 11 | 184 | 144 |
| 62 | Medical weight loss | Hormone & metabolic | 18 | 1046 | 858 |

## Hormone Split

| target | rows moved from source | total rows changed to target |
| --- | --- | --- |
| Testosterone replacement therapy (TRT) | 276 | 317 |
| Menopause hormone therapy (HRT) | 97 | 184 |
| Medical weight loss | 55 | 1046 |

## Decision Row Counts

| reason | rows |
| --- | --- |
| phase4_new_treatment_alias | 3925 |
| proposal_family_rule | 2500 |
| medical_weight_loss_rule | 704 |
| trt_rule | 163 |
| approved_lab_testing_family | 149 |
| hrt_rule | 127 |
| redirect_ambiguous_injectables | 49 |
| approved_facial_rejuvenation_family | 32 |
| approved_biomarker_family | 25 |
| approved_redirect_weight_loss | 19 |
| hormone_generic_kept | 14 |
| approved_infusion_services | 12 |
| approved_metabolic_testing_family | 8 |
| approved_wellness_exam_family | 4 |
| glp1_drug_explicit_rule | 4 |
| redirect_vitamin_injectables | 3 |

## Rejected Terms

| normalized | reason |
| --- | --- |
| sports injury rehabilitation | rejected_hbot_mapping |
| cardiac rehabilitation | rejected_cardiac_screening_mapping |
| supportive injectables | rejected_ambiguous_injectables |
| medical abortion non per televisit medications labs imaging additional | out_of_scope_medical_abortion |

## Sitemap

- Treatment feed present: false
- src/app/sitemap.ts does not enumerate treatments; no sitemap regeneration needed.

## Render Verification

Checked against the existing local Next dev server on `http://127.0.0.1:3000`.

| page | url | status | result cards | no-results state |
| --- | --- | --- | --- | --- |
| Homepage | `/` | 200 | yes | no |
| TRT filter | `/directory?kind=locations&treatment_id=60` | 200 | yes | no |
| Medical weight loss filter | `/directory?kind=locations&treatment_id=62` | 200 | yes | no |
| Physical therapy filter | `/directory?kind=locations&treatment_id=44` | 200 | yes | no |
| Microneedling filter | `/directory?kind=locations&treatment_id=47` | 200 | yes | no |
