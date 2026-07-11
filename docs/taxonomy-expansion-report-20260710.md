# Taxonomy Expansion Approval Report

- Date: 20260710
- Mode: live
- Corpus table: `fountain_raw.taxonomy_term_corpus_20260710`
- Audit table: `fountain_raw.taxonomy_mapping_audit_20260710`
- Proposal table: `fountain_raw.taxonomy_new_treatment_proposals_20260710`
- LLM status: completed_within_budget
- LLM model: openai/gpt-4o-mini
- LLM classified terms: 1000
- LLM high-confidence terms: 5
- LLM medium-confidence terms: 4
- LLM spend: $0.0304 / $40.00

## Coverage

| metric | before | after |
| --- | --- | --- |
| active offerings | 100019 | 100019 |
| mapped active offerings | 15185 | 20983 |
| unmapped active offerings | 84834 | 79036 |
| mapped % | 15.18% | 20.98% |

## Phase 1 Corpus

- Normalized terms: 42922
- Terms with active location coverage: 42866
- Weight sum by distinct active locations: 82307

## Phase 2 Existing Treatment Mapping

- High-confidence normalized terms: 2995
- Offerings newly linked: 5798
- Aliases inserted: 2985
- Medium-confidence mappings awaiting approval: 356

### Top Auto-Mapped Terms

| term | treatment | locations | method | confidence |
| --- | --- | --- | --- | --- |
| sculptra | Dermal fillers | 85 | deterministic_synonym | 0.93 |
| dysport | Botox | 64 | deterministic_synonym | 0.93 |
| nutritional counseling | Personalized nutrition | 60 | deterministic_synonym | 0.93 |
| peptides | Peptide therapy | 57 | llm_openrouter | 0.9 |
| prp | PRP therapy | 57 | exact_alias | 1 |
| prp prp | PRP therapy | 55 | deterministic_synonym | 0.93 |
| radiesse | Dermal fillers | 48 | deterministic_synonym | 0.93 |
| testosterone therapy | Hormone optimization | 48 | deterministic_synonym | 0.93 |
| iv drip infusion 60 | IV nutrient therapy | 45 | deterministic_synonym | 0.93 |
| semaglutide | GLP-1 weight management | 44 | deterministic_synonym | 0.93 |
| exosomes | Exosome therapy | 43 | deterministic_synonym | 0.93 |
| hormone replacement therapy | Hormone optimization | 40 | deterministic_synonym | 0.93 |
| testosterone replacement therapy | Hormone optimization | 40 | deterministic_synonym | 0.93 |
| xeomin | Botox | 38 | deterministic_synonym | 0.93 |
| nutrition counseling | Personalized nutrition | 35 | deterministic_synonym | 0.93 |
| personal training | Exercise programming | 35 | deterministic_synonym | 0.93 |
| tirzepatide | GLP-1 weight management | 35 | deterministic_synonym | 0.93 |
| testosterone replacement therapy trt | Hormone optimization | 30 | deterministic_synonym | 0.93 |
| prp therapy | PRP therapy | 29 | exact_alias | 1 |
| juvederm | Dermal fillers | 28 | deterministic_synonym | 0.93 |
| iv hydration | IV nutrient therapy | 27 | deterministic_synonym | 0.93 |
| supplements | Supplementation | 26 | deterministic_synonym | 0.93 |
| medical spa | Med spa | 25 | deterministic_synonym | 0.93 |
| jeuveau | Botox | 24 | deterministic_synonym | 0.93 |
| sermorelin | Peptide therapy | 24 | deterministic_synonym | 0.93 |
| prp injections | PRP therapy | 23 | deterministic_synonym | 0.93 |
| prp prp therapy | PRP therapy | 23 | deterministic_synonym | 0.93 |
| hormone replacement | Hormone optimization | 22 | deterministic_synonym | 0.93 |
| nad injections | NAD+ IV therapy | 22 | deterministic_synonym | 0.93 |
| semaglutide weight loss | GLP-1 weight management | 22 | deterministic_synonym | 0.93 |
| dysport dysport | Botox | 20 | deterministic_synonym | 0.93 |
| myers cocktail | IV nutrient therapy | 20 | deterministic_synonym | 0.93 |
| sculptra sculptra | Dermal fillers | 20 | deterministic_synonym | 0.93 |
| stem cell hair restoration | Stem cell therapy | 20 | deterministic_synonym | 0.93 |
| nad | NAD+ IV therapy | 19 | deterministic_synonym | 0.93 |
| glutathione injection | Vitamin infusion | 18 | deterministic_synonym | 0.93 |
| nad injection | NAD+ IV therapy | 18 | deterministic_synonym | 0.93 |
| iv vitamin therapy | Vitamin infusion | 17 | deterministic_synonym | 0.93 |
| hyperbaric medicine physician | Hyperbaric oxygen therapy | 16 | deterministic_synonym | 0.93 |
| softwave therapy | Shockwave therapy | 16 | deterministic_synonym | 0.93 |

### Medium-Confidence Review

| term | proposed treatment | locations | confidence | reason |
| --- | --- | --- | --- | --- |
| medical weight loss | GLP-1 weight management | 141 | 0.72 | possible_glp1_or_general_weight_loss |
| injectables | Botox | 45 | 0.62 | ambiguous_botox_or_fillers |
| weight loss program | GLP-1 weight management | 40 | 0.72 | possible_glp1_or_general_weight_loss |
| weight loss management | GLP-1 weight management | 32 | 0.72 | possible_glp1_or_general_weight_loss |
| lab testing | Advanced blood panel | 27 | 0.74 | possible_advanced_blood_panel |
| facial rejuvenation | Aesthetic medicine | 24 | 0.64 | possible_aesthetic_medicine |
| medical weight loss program | GLP-1 weight management | 14 | 0.72 | possible_glp1_or_general_weight_loss |
| sports injury rehabilitation | Hyperbaric oxygen therapy | 13 | 0.8 | llm_openrouter: Related to recovery and performance treatments. |
| weight management | GLP-1 weight management | 13 | 0.8 | llm_openrouter: Maps to existing treatment 'GLP-1 weight management'. |
| cardiac rehabilitation | Cardiac screening | 12 | 0.8 | llm_openrouter: Maps to existing treatment 'Cardiac screening'. |
| infusion services | IV nutrient therapy | 12 | 0.8 | llm_openrouter: Maps to existing treatment 'IV nutrient therapy'. |
| lab work | Advanced blood panel | 12 | 0.74 | possible_advanced_blood_panel |
| blood testing | Advanced blood panel | 10 | 0.74 | possible_advanced_blood_panel |
| blood work | Advanced blood panel | 9 | 0.74 | possible_advanced_blood_panel |
| labs | Advanced blood panel | 7 | 0.74 | possible_advanced_blood_panel |
| weight loss therapy | GLP-1 weight management | 7 | 0.72 | possible_glp1_or_general_weight_loss |
| blood testing service | Advanced blood panel | 6 | 0.74 | possible_advanced_blood_panel |
| metabolic testing | Cardiometabolic testing | 6 | 0.72 | possible_cardiometabolic_testing |
| comprehensive labs | Advanced blood panel | 5 | 0.74 | possible_advanced_blood_panel |
| functional lab testing | Advanced blood panel | 5 | 0.74 | possible_advanced_blood_panel |
| medically supervised weight loss program | GLP-1 weight management | 5 | 0.72 | possible_glp1_or_general_weight_loss |
| facial rejuvenation treatment | Aesthetic medicine | 5 | 0.64 | possible_aesthetic_medicine |
| advanced heart labs | Advanced blood panel | 4 | 0.74 | possible_advanced_blood_panel |
| advanced lab testing | Advanced blood panel | 4 | 0.74 | possible_advanced_blood_panel |
| medical weight loss programs | GLP-1 weight management | 4 | 0.72 | possible_glp1_or_general_weight_loss |
| weight loss consultation | GLP-1 weight management | 4 | 0.72 | possible_glp1_or_general_weight_loss |
| facial rejuvenation acupuncture | Aesthetic medicine | 4 | 0.64 | possible_aesthetic_medicine |
| cosmetic injectables | Botox | 4 | 0.62 | ambiguous_botox_or_fillers |
| anti aging treatment and labs | Advanced blood panel | 3 | 0.74 | possible_advanced_blood_panel |
| blood test | Advanced blood panel | 3 | 0.74 | possible_advanced_blood_panel |
| insulin and thyroid labs | Advanced blood panel | 3 | 0.74 | possible_advanced_blood_panel |
| lab testing at home | Advanced blood panel | 3 | 0.74 | possible_advanced_blood_panel |
| metabolic weight loss program | GLP-1 weight management | 3 | 0.72 | possible_glp1_or_general_weight_loss |
| minuteclinic weight loss program | GLP-1 weight management | 3 | 0.72 | possible_glp1_or_general_weight_loss |
| new wave weight loss program | GLP-1 weight management | 3 | 0.72 | possible_glp1_or_general_weight_loss |
| supportive injectables | Botox | 3 | 0.62 | ambiguous_botox_or_fillers |
| vitamin injectables | Botox | 3 | 0.62 | ambiguous_botox_or_fillers |
| biomarker testing | Advanced biomarker panel | 2 | 0.76 | possible_biomarker_panel |
| biomarkers | Advanced biomarker panel | 2 | 0.76 | possible_biomarker_panel |
| advanced functional lab testing | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| comprehensive blood work | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| comprehensive lab testing | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| diagnostic labs | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| in house labs | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| in house labs and tests | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| laboratory blood work | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| medical abortion non per televisit medications labs imaging additional | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| on site lab testing | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| onsite x rays and labs | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| routine lab work | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| specialty labs | Advanced blood panel | 2 | 0.74 | possible_advanced_blood_panel |
| chirothin weight loss program | GLP-1 weight management | 2 | 0.72 | possible_glp1_or_general_weight_loss |
| medical weight loss injections | GLP-1 weight management | 2 | 0.72 | possible_glp1_or_general_weight_loss |
| onsite medical weight loss program | GLP-1 weight management | 2 | 0.72 | possible_glp1_or_general_weight_loss |
| pnoe metabolic testing | Cardiometabolic testing | 2 | 0.72 | possible_cardiometabolic_testing |
| supervised medical weight loss | GLP-1 weight management | 2 | 0.72 | possible_glp1_or_general_weight_loss |
| synergy weight loss program | GLP-1 weight management | 2 | 0.72 | possible_glp1_or_general_weight_loss |
| annual wellness exam | Executive health checkup | 2 | 0.68 | possible_executive_checkup |
| wellness exam | Executive health checkup | 2 | 0.68 | possible_executive_checkup |
| prf facial rejuvenation | Aesthetic medicine | 2 | 0.64 | possible_aesthetic_medicine |

## Phase 3 Proposed New Treatments

These are proposals only. Nothing here was inserted into `fountain.treatments` or applied to offerings.

| canonical name | category | locations | top aliases | examples |
| --- | --- | --- | --- | --- |
| Physical therapy | Recovery & performance | 1048 | physical therapy, orthopedic physical therapy, pediatric physical therapy, physical therapy and rehabilitation, pelvic floor physical therapy | Physical Therapy; Virtual Physical Therapy; Physical therapy |
| Chiropractic care | Lifestyle & foundational | 746 | chiropractic care, chiropractic, chiropractic adjustments, chiropractic adjustment, chiropractic services | Chiropractic Care; Chiropractic care; CHIROPRACTIC CARE |
| Acupuncture | Lifestyle & foundational | 522 | acupuncture, acupuncture clinic, acupuncture therapy, acupuncture treatment, electro acupuncture | Acupuncture; Acupuncture Follow Up; Acupuncture Membership |
| Microneedling | Aesthetic | 516 | microneedling, rf microneedling, skinpen microneedling, micro needling, potenza rf microneedling | Microneedling; Microneedling Packages; MicroNeedling |
| Body contouring | Aesthetic | 413 | body contouring, emsculpt neo, coolsculpting, body sculpting, emsculpt | Body Contouring; Body contouring; BODY CONTOURING |
| Massage therapy | Recovery & performance | 357 | massage therapy, deep tissue massage, sports massage, therapeutic massage, medical massage therapy | Massage Therapy; Massage Therapy - 60 Minutes; Massage Therapy - 75 Minutes |
| Laser hair removal | Aesthetic | 345 | laser hair removal, laser hair removal bikini, laser hair removal brazilian, laser hair removal chin, laser hair removal full face | Laser Hair Removal; laser hair removal; LASER HAIR REMOVAL |
| Hair restoration | Regenerative & cellular | 317 | hair restoration, hair loss treatment, hair loss, hair loss therapy, hair restoration therapy | Hair restoration; Hair Restoration; HAIR RESTORATION |
| Skin tightening | Aesthetic | 239 | skin tightening, ultherapy, rf skin tightening, xerf skin tightening, venus freeze skin tightening butt and thighs | Skin Tightening; Skin tightening; SKIN TIGHTENING |
| RF microneedling | Aesthetic | 221 | morpheus8, rf microneedling, potenza rf microneedling, morpheus 8, morpheus8 body | Morpheus8; Morpheus8™; Morpheus8® |
| Hydrafacial | Aesthetic | 204 | hydrafacial, hydrafacial hydrafacial, diamondglow, hydra facial, signature hydrafacial | HYDRAFACIAL; Hydrafacial; HydraFacial |
| Ozone therapy | Regenerative & cellular | 168 | ozone therapy, eboo therapy, ebo2 therapy, eboo, ebo2 | Ozone Therapy; Ozone therapy; ozone therapy |
| Laser skin resurfacing | Aesthetic | 141 | laser skin resurfacing, laser resurfacing, co2 laser, halo laser, co2 fractional laser | Laser Skin Resurfacing; Laser Resurfacing; CO2 Laser |
| Lymphatic drainage | Recovery & performance | 129 | lymphatic drainage massage, lymphatic drainage, lymphatic massage, manual lymphatic drainage, lymphatic drainage therapy | Lymphatic Drainage Massage; LYMPHATIC DRAINAGE MASSAGE; Lymphatic Drainage |
| Chemical peel | Aesthetic | 114 | chemical peel, vi peel, vi peel vi peel, perfect derma peel, customized chemical peel | Chemical Peel; CHEMICAL PEEL; VI Peel |
| Colon hydrotherapy | Lifestyle & foundational | 41 | colon hydrotherapy, 3 pack colonics, colon hydrotherapy 1 colonic session, colon hydrotherapy first session includes half hour consultation, colon hydrotherapy follow up | Colon Hydrotherapy - 1 session, 1 session; Colon Hydrotherapy - 3 sessions, 3 sessions; Colon Hydrotherapy - 6 sessions, 6 sessions |
| Laser tattoo removal | Aesthetic | 29 | laser tattoo removal, laser tattoo removal and dark pigment correction, no ragrets laser tattoo removal, picosure laser tattoo removal | Laser Tattoo Removal; LASER TATTOO REMOVAL; Laser Tattoo Removal & Dark Pigment Correction |

## Borderline 10-14 Location Calls

No borderline deterministic proposal groups found.

## Out Of Scope

| group | count | reason | examples |
| --- | --- | --- | --- |
| Retail products | 208 | retail or gift-card commerce | Skincare Products; SKINCARE PRODUCTS; Skin Care Products; Health and beauty shop |
| Memberships and packages | 30 | pricing/package construct, not a treatment | Memberships; Monthly memberships; MONTHLY MEMBERSHIPS; VIP Memberships |
| Tanning | 29 | commerce/beauty service outside longevity treatment taxonomy | Spray Tanning; Airbrush Tanning; Brazilian Tanning; Dolce Glow Sunless Tanning |

## Guardrails

- No rows were inserted into fountain.treatments.
- Medium-confidence mappings were not applied to offerings.
- Candidate new treatments were written only to the raw proposal table.
- High-confidence writes were limited to treatment_aliases inserts and offerings.treatment_id updates.
