# Fountain Pipeline Restructure — Final Enrichment Report

**FINAL RECONCILIATION COMPLETE**

Generated: 2026-07-12T16:12:25.240Z. Census population is active, non-deleted, non-suppressed locations.

## Run scope

| Run | Role(s) |
| ---: | --- |
| 57 | `stage3` |
| 59 | `redemption_partial.cancelled_59` |
| 60 | `redemption_partial.cancelled_60` |
| 61 | `redemption` |
| 69 | `enrichment.before_census` |
| 70 | `enrichment.contact_fill` |
| 73 | `enrichment.post_contact_census` |
| 74 | `enrichment.geocode` |
| 76 | `enrichment.image_harvest` |
| 79 | `enrichment.image_classify_census.initial_79` |
| 80 | `enrichment.image_classify.halted_80` |
| 82 | `enrichment.image_classify.remediation_82` |
| 85 | `enrichment.image_classify_census.retry_enqueue_85` |
| 86 | `enrichment.image_classify.retry_86` |
| 88 | `enrichment.image_classify_census.zero_verify_88` |
| 90 | `enrichment.menu_prices_census` |
| 91 | `enrichment.menu_extract.main_91` |
| 95 | `enrichment.menu_retry_enqueue` |
| 96 | `enrichment.menu_extract.retry_96` |
| 98 | `enrichment.reviews_fetch.halted_98` |
| 100 | `enrichment.reviews_fetch.smoke_100` |
| 101 | `enrichment.reviews_fetch.contention_halt_101` |
| 104 | `enrichment.reviews_fetch.pre_sequence_validation_104` |
| 108 | `enrichment.reviews_fetch.post_sequence_validation_108` |
| 109 | `enrichment.reviews_fetch.completion_109` |
| 113 | `enrichment.after_census.apply_113` |

## Before/after field coverage

Eligible population: 7,178 before; 7,178 after; delta 0.

| Field | Before covered | Before % | After covered | After % | Δ covered | Δ pp |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `website` | 6,906 | 96.21% | 7,019 | 97.78% | +113 | +1.57 |
| `phone` | 6,302 | 87.80% | 6,554 | 91.31% | +252 | +3.51 |
| `email` | 1,742 | 24.27% | 2,907 | 40.50% | +1,165 | +16.23 |
| `address` | 6,834 | 95.21% | 6,873 | 95.75% | +39 | +0.54 |
| `locality` | 7,133 | 99.37% | 7,133 | 99.37% | 0 | 0.00 |
| `region` | 6,015 | 83.80% | 6,015 | 83.80% | 0 | 0.00 |
| `postal_code` | 4,973 | 69.28% | 4,973 | 69.28% | 0 | 0.00 |
| `country_code` | 7,169 | 99.87% | 7,169 | 99.87% | 0 | 0.00 |
| `latitude` | 7,170 | 99.89% | 7,170 | 99.89% | 0 | 0.00 |
| `longitude` | 7,170 | 99.89% | 7,170 | 99.89% | 0 | 0.00 |
| `geocode` | 7,170 | 99.89% | 7,170 | 99.89% | 0 | 0.00 |
| `images` | 5,519 | 76.89% | 6,632 | 92.39% | +1,113 | +15.50 |
| `menus` | 4,967 | 69.20% | 6,050 | 84.29% | +1,083 | +15.09 |
| `reviews` | 1,723 | 24.00% | 5,323 | 74.16% | +3,600 | +50.16 |

## Legitimacy resolution

| Metric | Count |
| --- | ---: |
| Stage 3 cohort | 2,156 |
| Stage 3 keep rows | 570 |
| Stage 3 suppressed rows | 1,304 |
| Active needs_human_review | 282 |
| Redemption candidates | 5,272 |
| Redeemed locations | 173 |
| Retained suppressions | 5,099 |

## Redeemed locations

| ID | Name | Final class | Confidence | Official website | Suppression rows removed |
| ---: | --- | --- | ---: | --- | ---: |
| 286 | Lux Physical Therapy and Functional Medicine | `in_scope` | 0.85 | http://www.luxphysicaltherapy.com/ | 2 |
| 323 | Healing Arts NYC | `in_scope` | 0.90 | http://www.healingartsnyc.com/ | 2 |
| 421 | Life Wellness Center | `in_scope` | 0.85 | http://lifewellnesscenter.life/ | 2 |
| 507 | Solid Movement Therapy | `in_scope` | 0.85 | http://www.solidmovementtherapy.com/ | 2 |
| 613 | Mount Sinai Physiolab | `in_scope` | 0.90 | https://www.mountsinai.org/locations/physiolab | 1 |
| 683 | HealthierU Natural Nutritionist Brooklyn | `in_scope` | 0.85 | https://www.healthieruny.com/ | 1 |
| 703 | Kearny Wellness | `in_scope` | 0.85 | http://www.kearnywellness.com/ | 1 |
| 709 | HEALTHWELL FAMILY HEALTH \| Primary Care \| Weight Loss | `in_scope` | 0.85 | https://healthwellnp.com/ | 2 |
| 876 | Falcone Family Chiropractic & Wellness | `in_scope` | 0.85 | https://www.falconefamilychiro.com/ | 2 |
| 885 | Dr. Steve Guagliardo, Staten Island Wellness Care | `in_scope` | 0.85 | https://www.statenislandwellnesscare.com/ | 1 |
| 1230 | Within Natural Health | `in_scope` | 0.90 | https://www.withinnaturalhealth.com/ | 1 |
| 1269 | Medwell Family Practice & Functional Medicine of Bergen County NJ | `in_scope` | 0.90 | https://www.medwellnj.com/ | 2 |
| 1303 | Wellness Studio Westchester | `in_scope` | 0.85 | http://wellnessstudiowestchester.com/ | 2 |
| 1369 | European Luxury Day Spa | `in_scope` | 0.95 | http://europeanluxurydayspa.com/ | 1 |
| 1410 | Lux Physical Therapy and Functional Medicine | `in_scope` | 0.85 | https://www.luxphysicaltherapy.com/ | 1 |
| 1444 | Brain & Body Longevity Center | `in_scope` | 0.95 | https://www.brainandbodylongevitycenter.com/detox/ | 1 |
| 1472 | DNA Longevity + Gene Testing. Optimize Your Human Potential | `in_scope` | 0.85 | https://drohandley.dna.clinic/ | 2 |
| 1560 | Florida Regen- Dr. Tad P. DeWald | `in_scope` | 0.90 | https://floridaregen.com/ | 1 |
| 1599 | Vivagen Life Sciences | `in_scope` | 0.98 | https://www.vivagenlifesciences.com/ | 1 |
| 1603 | Toronto Centre for Naturopathic Medicine | `in_scope` | 0.85 | https://www.torontonaturopathicmedicine.ca/ | 1 |
| 1604 | Sozo Integrative Healthcare | `in_scope` | 0.80 | https://sozoihc.wixsite.com/sozoihc | 1 |
| 1611 | Upper Room Clinic | `in_scope` | 0.98 | https://upperroomclinic.com/ | 1 |
| 1621 | Vancouver Integrated Health Centre | `in_scope` | 0.90 | https://vancouverintegratedhealthcentre.com/ | 1 |
| 1637 | Mainline Wellness | `in_scope` | 0.85 | https://mainlinewellness.ca/contact | 1 |
| 1642 | Cenegenics México | `destination_medical` | 0.95 | https://cenegenics.mx/ | 1 |
| 1674 | Simply Oxygen | `in_scope` | 0.95 | https://simplyoxygen.co.uk/hyperbaric-oxygen-therapy-twickenham-london/ | 3 |
| 1685 | Dr. Liv Clinic GmbH | `in_scope` | 0.90 | https://clinic.drliv.com/contact | 1 |
| 1710 | Logik Clinic Barcelona | `in_scope` | 0.85 | https://logikclinic.com/ | 1 |
| 1716 | Relit \| Bienvenido al futuro de tu potencial físico | `in_scope` | 0.85 | https://relit.es/nosotros/ | 1 |
| 1727 | Quartz Hospital | `in_scope` | 0.90 | https://www.quartz.com.tr/ | 2 |
| 1773 | Estexper Clinic | `in_scope` | 0.85 | https://www.estexper.com/ | 2 |
| 2197 | Precision Imaging Centers | `in_scope` | 0.85 | https://www.precisionimagingcenters.com/ | 2 |
| 2208 | DPC Family Doctor | `in_scope` | 0.80 | https://www.dpcfamilydoctor.com/dallas-fort-worth-tx-primary-care-functional-medicine-contact-us | 2 |
| 2214 | ATOP PLASTIC SURGERY | `in_scope` | 0.90 | https://en.atopps.com/ | 1 |
| 2215 | Allheart plastic surgery | `in_scope` | 0.90 | https://allheartusa.com/ | 2 |
| 2229 | JK Plastic Surgery Center | `in_scope` | 0.80 | https://www.jkplastic.com/ | 1 |
| 3167 | PRP - Platelet Rich Plasma Therapy | `in_scope` | 0.85 | https://oxygenairtherapy.com/service/plasma-therapy/ | 1 |
| 3264 | Hyperbaric Oxygen Therapy | `in_scope` | 0.90 | https://sfhyperbaric.com/ | 1 |
| 3286 | 417 Sports Medicine & Orthopedics | `in_scope` | 0.85 | https://417sportsmedicine.com/ | 2 |
| 3367 | Advanced Integrative Medicine | `in_scope` | 0.90 | https://nashvilleintegratedmedicine.com/ | 1 |
| 3500 | Aesthetic Plastic Surgery International | `in_scope` | 0.90 | https://www.cplasticsurgery.com/santa-maria-plastic-surgery/ | 1 |
| 3732 | Aspire Regenerative Therapy | `in_scope` | 0.95 | https://www.aspiretherapy.health/ | 2 |
| 3733 | Aspire Regenerative Therapy | `in_scope` | 0.95 | https://www.aspiretherapy.health/ | 1 |
| 3968 | Rainari Health | `in_scope` | 0.85 | https://rainarihealth.com/ | 2 |
| 4165 | Harrison Integrative Wellness – Formerly Harrison Chiropractic Center | `in_scope` | 0.85 | https://www.harrisonintegrative.com/ | 2 |
| 4184 | IronChiro | `in_scope` | 0.80 | https://www.ironchiro.com/ | 3 |
| 4187 | IronChiro | `in_scope` | 0.80 | https://www.ironchiro.com/about | 1 |
| 4243 | Orange County Spine and Sports Physicians | `in_scope` | 0.85 | https://www.ocspineandsports.com/ | 2 |
| 4244 | Orange County Spine and Sports Physicians | `in_scope` | 0.85 | https://www.ocspineandsports.com/location/ca/carlsbad | 2 |
| 4245 | Orange County Spine and Sports Physicians | `in_scope` | 0.85 | https://www.ocspineandsports.com/location/ca/huntington-beach | 1 |
| 4338 | Elevate Sports Performance & Healthcare Henderson | `in_scope` | 0.85 | https://elevatesph.com/ | 1 |
| 4344 | Full Spectrum Back & Body | `in_scope` | 0.85 | https://thinkfullspectrum.com/ | 2 |
| 4563 | Body Therapeutics | `in_scope` | 0.85 | https://bodytherapeutics.janeapp.com/locations/body-therapeutics | 2 |
| 4621 | Dr. Kris McLain Krussel DC | `in_scope` | 0.85 | https://www.drkrisdc.com/ | 2 |
| 4747 | Neighborhood Neuropathy Midwest | `in_scope` | 0.90 | https://yourneuropathyteam.com/ | 2 |
| 4853 | Duke Executive Health Clinic | `destination_medical` | 0.95 | https://www.dukehealth.org/locations/duke-executive-health-clinic | 11 |
| 4854 | Duke Executive Health Clinic | `destination_medical` | 0.95 | https://www.dukehealth.org/locations/duke-executive-health-clinic | 1 |
| 4855 | Duke Executive Health Clinic | `destination_medical` | 0.95 | https://www.dukehealth.org/locations/duke-executive-health-clinic | 1 |
| 4878 | Florida Regen | `in_scope` | 0.90 | https://floridaregen.com/ | 3 |
| 5323 | Belleview Spine and Wellness | `in_scope` | 0.85 | https://www.belleviewchiro.com/ | 2 |
| 5337 | Bodycare Clinic | `in_scope` | 0.85 | https://www.bodycareclinicriverside.com/ | 2 |
| 5518 | MedWell Spine, OsteoArthritis & Neuropathy Center | `in_scope` | 0.85 | https://www.medwellnj.com/ | 1 |
| 5519 | MedWell Spine, OsteoArthritis & Neuropathy Center | `in_scope` | 0.85 | https://www.medwellnj.com/areas-we-service/clifton-nj/ | 1 |
| 5531 | MedWell Spine, OsteoArthritis & Neuropathy Center | `in_scope` | 0.90 | https://www.medwellnj.com/areas-we-service/oakland--nj/ | 1 |
| 5533 | MedWell Spine, OsteoArthritis & Neuropathy Center | `in_scope` | 0.90 | https://www.medwellnj.com/areas-we-service/passaic-nj/ | 1 |
| 5534 | MedWell Spine, OsteoArthritis & Neuropathy Center | `in_scope` | 0.90 | https://www.medwellnj.com/areas-we-service/paterson-nj/ | 1 |
| 5535 | MedWell Spine, OsteoArthritis & Neuropathy Center | `in_scope` | 0.90 | https://www.medwellnj.com/areas-we-service/ramsey-nj/ | 1 |
| 5660 | Avé Holistic Health & Chiropractic | `in_scope` | 0.85 | https://www.avechiropractic.com/ | 2 |
| 5778 | ICT Muscle & Joint Clinic | `in_scope` | 0.90 | https://www.ictmjc.com/about-ict-muscle-joint-clinic-in-wichita-ks | 1 |
| 5797 | Kennedy Health Clinic | `in_scope` | 0.95 | https://www.kennedyhealthcenter.org/ | 2 |
| 5798 | Legacy Pain and Regenerative Medicine: Trace Alexander, DC, FNP | `in_scope` | 0.90 | https://www.drtracealexander.com/ | 2 |
| 6014 | Forsythe Cancer Care Center | `in_scope` | 0.95 | https://drforsythe.com/ | 2 |
| 6146 | Optilux Wellness Center | `in_scope` | 0.90 | https://optiluxwellness.com/ | 2 |
| 6211 | Amy Upton Family Practice | `in_scope` | 0.90 | https://www.familypracticeamarillo.com/ | 2 |
| 6256 | Cincinnati Health Institute | `in_scope` | 0.90 | https://www.thecincinnatihealthinstitute.com/ | 2 |
| 6488 | Dr. Philip Delli Santi, P.C. | `in_scope` | 0.85 | https://www.drpdellisanti.com/about | 2 |
| 6489 | Dr. Philip Delli Santi, P.C. | `in_scope` | 0.85 | https://www.drpdellisanti.com/about | 1 |
| 6575 | Joint Rehab and Sports Medical Center | `in_scope` | 0.95 | https://jointrehab.com/ | 3 |
| 6590 | Lincoln Wellness Center – Dr. Stan Schulte | `in_scope` | 0.90 | https://www.drstanschulte.com/ | 2 |
| 6898 | Precision Regenerative Medicine | `in_scope` | 0.90 | https://precisionmedprp.com/ | 1 |
| 6970 | Synergy Integrated Health Center | `in_scope` | 0.90 | https://www.synergydelaware.com/ | 2 |
| 7022 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/ | 2 |
| 7023 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/locations/port-st-lucie-fl/ | 1 |
| 7024 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/stuart-florida/ | 1 |
| 7025 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/jensen-beach-florida/ | 1 |
| 7026 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/port-salerno-florida/ | 1 |
| 7027 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/chiropractor-indiantown-fl/ | 1 |
| 7028 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/jupiter-florida/ | 1 |
| 7029 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/medical-center-hobe-sound-florida/ | 1 |
| 7030 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/medical-center-okeechobee-florida/ | 1 |
| 7031 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/medical-center-sewalls-point-florida/ | 1 |
| 7032 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/medical-center-tequesta-florida/ | 1 |
| 7033 | Back In Action Medical Center | `in_scope` | 0.90 | https://backinactionmedical.com/medical-center-tradition/ | 1 |
| 7076 | Chronic Care of Richmond | `in_scope` | 0.90 | https://www.chroniccareofrichmond.com/ | 2 |
| 7111 | Generations Health and Wellness Center | `in_scope` | 0.85 | https://generationshwc.com/ | 2 |
| 7133 | Integrative Sports and Spine | `in_scope` | 0.90 | https://www.integrativesportsandspine.com/ | 2 |
| 7304 | Core Therapeutics | `in_scope` | 0.90 | https://www.valleycoretherapeutics.com/ | 2 |
| 7929 | Charleston Sports Medicine | `in_scope` | 0.85 | https://www.charlestonsportsmed.com/ | 2 |
| 7950 | Dr. Mac’s Medical Pain Management, Wellness, & Weight Loss Center | `in_scope` | 0.85 | https://drmacswellness.com/ | 2 |
| 7960 | Encompass Care | `in_scope` | 0.85 | https://encompasscarelv.com/ | 2 |
| 7982 | Gonstead Chiropractic & Wellness ATX | `in_scope` | 0.90 | https://gonstead-atx.com/ | 2 |
| 8292 | Prairie Roots Health | `in_scope` | 0.95 | https://prairierootshealth.com/ | 2 |
| 8378 | Axis Medical | `in_scope` | 0.85 | https://myaxis.org/ | 2 |
| 8495 | Mutch Women’s Center for Health Enrichment | `in_scope` | 0.95 | https://www.sanfordhealth.org/locations/sanford-integrative-health-and-wellness | 3 |
| 8803 | GoPerform | `in_scope` | 0.90 | https://www.go-perform.co.uk/ | 2 |
| 9107 | Longhorn Imaging | `in_scope` | 0.85 | https://www.longhornimaging.com/ | 1 |
| 9130 | Visionary Wellness & Imaging | `in_scope` | 0.90 | https://visionarywellnessimaging.com/ | 1 |
| 9148 | River Oaks Galleria Medspa | `in_scope` | 0.95 | https://rogmedspa.com/ | 1 |
| 9158 | Happy Beats Imaging | `in_scope` | 0.85 | https://www.happybeats.net/ | 1 |
| 9436 | Physical Evidence Chiropractic | `in_scope` | 0.92 | https://physicalevidencechiropractic.com/ | 1 |
| 9466 | Addison Pain | `in_scope` | 0.85 | https://www.addisonpain.com/ | 1 |
| 9475 | Advanced Integrative Medicine | `in_scope` | 0.95 | https://eastbayinnovativemedicine.com/ | 1 |
| 9528 | AGrace Aesthetics @ EDGE IW | `in_scope` | 0.95 | https://edgeintegrativewellness.com/ | 1 |
| 9627 | Atlas Medical Center | `in_scope` | 0.85 | https://atlasmedicalcenter.com/about/areas-we-serve/irving/ | 1 |
| 9649 | Avera Functional & Integrative Medicine — 41st & Holbrook | `in_scope` | 0.95 | https://www.avera.org/locations/profile/avera-functional-integrative-medicine-41st-holbrook-sioux-falls/ | 1 |
| 9650 | Avera Human Performance Center — Sioux Falls | `in_scope` | 0.90 | https://www.avera.org/locations/profile/avera-human-performance-center-sioux-falls/ | 8 |
| 9695 | beauty skin clinic llc | `in_scope` | 0.85 | https://beautyskinclinicllc.com/about-us | 1 |
| 9888 | Chattanooga Regenerative Medicine | `in_scope` | 0.95 | https://ismdchattanooga.com/services/regenerative-medicine/ | 1 |
| 9908 | Christopher A. Park, MD | `in_scope` | 0.95 | https://www.theparkplasticsurgery.com/ | 4 |
| 10169 | Eco Iv Therapy | `in_scope` | 0.85 | https://www.fyple.com/company/eco-iv-therapy-ihr0thq/ | 1 |
| 10406 | ICT Muscle & Joint Clinic | `in_scope` | 0.85 | https://www.ictmjc.com/about-ict-muscle-joint-clinic-in-wichita-ks | 1 |
| 10444 | Inspire MedSpa | `in_scope` | 0.95 | https://www.inspiremedspava.com/ | 1 |
| 10518 | Joint Pain Specialists | `in_scope` | 0.95 | https://jointpainspecialists.janeapp.com/ | 1 |
| 10528 | Jouvence Aesthetics | `in_scope` | 0.95 | https://jouvence-ny.com/ | 1 |
| 10537 | Kansas Regencares Medical Center | `in_scope` | 0.90 | https://regencares.com/ | 1 |
| 10538 | Kansas Regenerative Medicine Center | `in_scope` | 0.85 | https://kansasrmc.com/manhattan-ks | 1 |
| 10539 | Kansas Regenerative Medicine Center – Kansas City | `in_scope` | 0.85 | https://kansasrmc.com/kansas-city | 1 |
| 10609 | Legacy Integrative Health | `in_scope` | 0.90 | https://www.revivalintegrativehealth.com/functional-integrative-medicine/plano-tx | 1 |
| 10645 | Los Angeles Metro Area Stem Cell Treatment | `in_scope` | 0.95 | https://www.stemwavepro.com/ | 1 |
| 10688 | Maverick Medical Clinic | `in_scope` | 0.85 | https://healthcaremaverick.com/ | 1 |
| 10714 | Medical Weight Management Program \| Kaiser Permanente Elk Grove Medical Offices | `in_scope` | 0.85 | https://www.kphealthyweight.com/our-locations/south-sacramento-elk-grove/ | 1 |
| 10761 | Midtown Medical | `in_scope` | 0.90 | https://www.midtownmedicalmobile.com/ | 1 |
| 10774 | Modesto Physical Medicine | `in_scope` | 0.95 | https://www.modestophysicalmedicine.com/ | 1 |
| 10865 | Nevy Health | `in_scope` | 0.90 | https://nevyhealth.com/contact-us/ | 1 |
| 10872 | New Hope Regeneration | `in_scope` | 0.90 | https://spokaneweightloss.info/spokane-regenerative-medicine/ | 1 |
| 10924 | Norwood Regenerative Medicine | `in_scope` | 0.85 | https://ritucciregenerativemed.com/ | 1 |
| 11011 | Orlando Resorts Spine and Body | `in_scope` | 0.85 | https://orlandoresortschiro.com/ | 1 |
| 11038 | OsteoStrong Hillcrest Mobile | `in_scope` | 0.95 | https://hillcrest.osteostrongmobile.com/ | 1 |
| 11167 | Precision Regenerative & Functional Medicine: Mihnea Dumitrescu, MD | `in_scope` | 0.90 | https://austinprecisionmedicine.com/ | 2 |
| 11168 | Precision Regenerative Medicine | `in_scope` | 0.90 | https://precisionmedprp.com/ | 1 |
| 11194 | Proffer Surgical Associates | `in_scope` | 0.90 | https://www.drproffer.com/contact | 1 |
| 11331 | Reagan Integrated Sports Medicine | `in_scope` | 0.85 | https://www.reagansportsmed.com/ | 1 |
| 11404 | Regenerative Medicine | `in_scope` | 0.95 | https://regenerativemedicinela.com/ | 1 |
| 11411 | Regenerative Medicine Austin | `in_scope` | 0.95 | https://austinregen.com/ | 1 |
| 11715 | Roc Integrated Med – Physical Therapy \| Chiropractic \| Wellness | `in_scope` | 0.85 | https://www.rocintegratedmed.com/ | 1 |
| 11744 | Rozenhart Family Chiropractic | `in_scope` | 0.85 | https://www.rozenhartchiro.com/ | 1 |
| 11757 | RxWellness Spine & Health | `in_scope` | 0.90 | https://www.rxwellness.net/location/herndon-chiropractor/ | 1 |
| 11758 | RxWellness Spine & Health – Alexandria | `in_scope` | 0.90 | https://www.rxwellness.net/location/alexandria-chiropractor/ | 1 |
| 11785 | Samaritan Sports Medicine: Benjamin Petty, MD | `in_scope` | 0.85 | https://www.samaritansportsmedicine.net/provider/benjamin-petty-md | 1 |
| 11937 | Simpson Advanced Chiropractic and Medical Center | `in_scope` | 0.95 | https://simpsonmedical.com/providers/dr-charles-simpson/ | 1 |
| 11941 | Sister Rosalind Massage, Wellness & Chiropractic Center – St.paul | `in_scope` | 0.85 | https://sisterrosalindmassage.com/st-paul-highland-park-location/ | 1 |
| 11947 | Skinani | `in_scope` | 0.95 | https://www.skinani.com/ | 1 |
| 11956 | SkinMD Shrewsbury | `in_scope` | 0.98 | https://skinmd1.com/locations/shrewsbury-ma/ | 1 |
| 11961 | SkinRenew Laser & Cosmetic Surgery – Grace Kwon M.D. | `in_scope` | 0.95 | https://skinrenewmedical.com/ | 1 |
| 12107 | Sports Performance Physical Therapy – Chula Vista | `in_scope` | 0.85 | https://www.sportsperformancept.com/contact-us/ | 1 |
| 12196 | Stem Cell Therapy | `in_scope` | 0.95 | https://stemshealthregenerativemedicine.com/regenerative-treatments/stem-cell-therapy/ | 1 |
| 12201 | Stem Cell Therapy Centers | `in_scope` | 0.85 | https://r3stemcell.com/scottsdale-az/regenerative-medicine/ | 1 |
| 12333 | Synergy Wellness at MidCity: Walk-In Clinic, Primary Care, MAT, and Ketamine Infusions | `in_scope` | 0.85 | https://synergywellnessal.com/ | 1 |
| 12497 | The Health Improvement Center – Dr. Katie Thompson, D.C., MSTN | `in_scope` | 0.85 | https://thehealthimprovementcenter.com/about/ | 1 |
| 12570 | The Regenerative Joint \| Mesa, AZ | `in_scope` | 0.85 | https://theregenerativejoint.com/ | 1 |
| 12634 | The Wellness Center PDX | `in_scope` | 0.90 | https://thewellnesscenterpdx.org/ | 1 |
| 12684 | Total Care Chiropractic | `in_scope` | 0.95 | https://totalcarechiro.com/ | 1 |
| 13349 | York Orthopedic Recovery | `in_scope` | 0.95 | https://yorkorthopedicrecovery.com/ | 1 |
| 13891 | Swell Chiropractic (Sports Med & Hyperbarics + Shockwave) | `in_scope` | 0.85 | https://swellchiropractic.janeapp.com/ | 2 |
| 13925 | DP World's Aviv Clinics Dubai | `destination_medical` | 0.95 | https://braindubai.com/about/ | 1 |
| 14118 | Oxygen hyperbaric therapy | `in_scope` | 0.85 | https://hyperbaric.app/clinic/oxygen-hyperbaric-therapy-rotterdam | 1 |
| 14129 | MobileHBOT | `in_scope` | 0.90 | https://www.mobilehbot.com/ | 1 |
| 14312 | Oxygen Wellness & Physical Therapy | `in_scope` | 0.95 | https://oxygenaz.com/about-us/ | 1 |
| 14447 | Cámara Hiperbárica Zamora | `in_scope` | 0.85 | https://camarahiperbarica.net/medicina-hiperbarica | 1 |
| 14469 | PROBARICA INTERLOMAS oxigenación hiperbarica | `in_scope` | 0.80 | https://probarica.com/ | 1 |
| 14473 | Fisiobárica \| Medicina Hiperbárica Madrid | `in_scope` | 0.90 | https://fisiobarica.com/ | 1 |
| 14482 | Milde Hyperbare Sauerstofftherapie - Gemeinschaftspraxis Pantzergasse | `in_scope` | 0.90 | https://www.sauerstofftherapie.net/ | 1 |
| 14487 | Wellington Hyperbarics | `in_scope` | 0.85 | https://www.wellington-hyperbarics.com/ | 1 |

## Queue task outcomes and serving writes

Selected-run task rows: 26,906; serving writes attempted by 17,644 task(s), completed by 16,540 task(s); needs_human_review outcomes: 282.
Historical failed rows: 70; recovered by a selected-run done row for the same task/entity: 70; unresolved: 0.
| Task | Total | Pending | Claimed | Done | Failed | Skipped | Write attempted | Written | Needs human |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `contact_fill` | 5,518 | 0 | 0 | 5,518 | 0 | 0 | 1,343 | 1,343 | 0 |
| `image_classify` | 6,698 | 0 | 0 | 6,632 | 66 | 0 | 6,632 | 6,632 | 0 |
| `image_harvest` | 1,550 | 0 | 0 | 1,550 | 0 | 0 | 1,113 | 1,113 | 0 |
| `legitimacy_check` | 2,156 | 0 | 0 | 2,156 | 0 | 0 | 1,304 | 1,304 | 282 |
| `menu_extract` | 5,529 | 0 | 0 | 5,525 | 4 | 0 | 2,967 | 2,325 | 0 |
| `reviews_fetch` | 5,455 | 0 | 0 | 5,455 | 0 | 0 | 4,285 | 3,823 | 0 |

## Menu and price enrichment

Supplemental pre-menu baseline: `menu_prices_enrichment` (2026-07-12T08:26:16.855Z). The frozen initial census remains unchanged.

| Location-level coverage | Pre-menu | Final | Δ |
| --- | ---: | ---: | ---: |
| Eligible locations | 7,178 | 7,178 | 0 |
| Locations with a menu | 4,967 | 6,050 | +1,083 |
| Locations with at least one priced offering | 1,502 | 1,967 | +465 |
| Missing menus | 2,211 | 1,128 | -1,083 |
| Menu present, zero priced offerings | 3,465 | 4,083 | +618 |
| Priced coverage of all eligible locations | 20.93% | 27.40% | +6.48 pp |
| Priced coverage among menu-bearing locations | 30.24% | 32.51% | +2.27 pp |

Selected menu tasks: 5,529; guarded location applications: 2,967.

| Run | Tasks | Location applications | Offerings inserted | Full-pair price backfills | Amount-only price backfills | Total price backfills | Treatment backfills | Price conflicts | Price reviews | Existing prices overwritten |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 91 | 5,525 | 2,963 | 5,998 | 34 | 2 | 36 | 1 | 0 | 411 | 0 |
| 96 | 4 | 4 | 82 | 0 | 0 | 0 | 0 | 0 | 25 | 0 |

## External-call ledger

Ledgered calls: 38,850; failures: 203; estimated spend: $295.5809.

### Spend by selected run/stage

| Run | Role(s) | Calls | LLM | Places contact | Places reviews | Places geocode | Places other | Other providers | Total |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 57 | `stage3` | 280 | $6.1516 | $0.8000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $6.9516 |
| 59 | `redemption_partial.cancelled_59` | 887 | $1.7391 | $10.3800 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $12.1191 |
| 60 | `redemption_partial.cancelled_60` | 566 | $0.7377 | $8.5200 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $9.2577 |
| 61 | `redemption` | 8,304 | $54.6975 | $31.1000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $85.7975 |
| 69 | `enrichment.before_census` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 70 | `enrichment.contact_fill` | 272 | $1.5336 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $1.5336 |
| 73 | `enrichment.post_contact_census` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 74 | `enrichment.geocode` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 76 | `enrichment.image_harvest` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 79 | `enrichment.image_classify_census.initial_79` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 80 | `enrichment.image_classify.halted_80` | 5,245 | $19.5125 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $19.5125 |
| 82 | `enrichment.image_classify.remediation_82` | 7,482 | $19.7117 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $19.7117 |
| 85 | `enrichment.image_classify_census.retry_enqueue_85` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 86 | `enrichment.image_classify.retry_86` | 377 | $0.8783 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.8783 |
| 88 | `enrichment.image_classify_census.zero_verify_88` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 90 | `enrichment.menu_prices_census` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 91 | `enrichment.menu_extract.main_91` | 4,734 | $3.0793 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $3.0793 |
| 95 | `enrichment.menu_retry_enqueue` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |
| 96 | `enrichment.menu_extract.retry_96` | 5 | $0.0147 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0147 |
| 98 | `enrichment.reviews_fetch.halted_98` | 348 | $0.0000 | $0.0000 | $6.8750 | $0.0000 | $0.0000 | $0.0000 | $6.8750 |
| 100 | `enrichment.reviews_fetch.smoke_100` | 1 | $0.0000 | $0.0000 | $0.0250 | $0.0000 | $0.0000 | $0.0000 | $0.0250 |
| 101 | `enrichment.reviews_fetch.contention_halt_101` | 290 | $0.0000 | $0.0000 | $5.8500 | $0.0000 | $0.0000 | $0.0000 | $5.8500 |
| 104 | `enrichment.reviews_fetch.pre_sequence_validation_104` | 71 | $0.0000 | $0.0000 | $1.6000 | $0.0000 | $0.0000 | $0.0000 | $1.6000 |
| 108 | `enrichment.reviews_fetch.post_sequence_validation_108` | 123 | $0.0000 | $0.0000 | $1.5000 | $0.0000 | $0.0000 | $0.0000 | $1.5000 |
| 109 | `enrichment.reviews_fetch.completion_109` | 9,865 | $0.0000 | $0.0000 | $120.8750 | $0.0000 | $0.0000 | $0.0000 | $120.8750 |
| 113 | `enrichment.after_census.apply_113` | 0 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 | $0.0000 |

### LLM calls by model

| Model | Calls | Failed | Input tokens | Output tokens | Total tokens | Estimated cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.5-flash` | 808 | 0 | 6,619,926 | 2,524,301 | 9,144,227 | $32.6486 |
| `openai/gpt-4o-mini` | 23,544 | 199 | 301,050,893 | 2,907,725 | 303,958,618 | $75.4073 |

### Google Places calls by use

| Use | Calls | Failed | Estimated cost |
| --- | ---: | ---: | ---: |
| Contact / legitimacy discovery | 3,800 | 0 | $50.8000 |
| Reviews | 10,698 | 4 | $136.7250 |
| Geocode | 0 | 0 | $0.0000 |
| Other / unclassified | 0 | 0 | $0.0000 |

Other-provider calls: 0; estimated cost $0.0000.

## Final serving and mutation state

| Metric | Count |
| --- | ---: |
| Non-deleted locations | 13,878 |
| Active locations | 7,178 |
| Hidden locations | 6,700 |
| Other non-deleted statuses | 0 |
| Deleted rows | 0 |
| Suppression-ledger rows | 10,116 |
| Distinct linked suppressed locations | 6,686 |
| Location search rows | 7,178 |
| Location field-ledger rows | 16,490 |
| Run-linked entity change events | 41,303 |

### Run-linked events

| Run | Events |
| ---: | ---: |
| 57 | 1,304 |
| 61 | 173 |
| 70 | 1,569 |
| 76 | 1,113 |
| 80 | 5,122 |
| 82 | 7,483 |
| 86 | 379 |
| 91 | 6,035 |
| 96 | 82 |
| 101 | 47 |
| 104 | 80 |
| 108 | 241 |
| 109 | 17,675 |

## Explicit ledger reconciliation

| Check | Expected | Actual | Status |
| --- | ---: | ---: | --- |
| External calls partitioned | 38,850 | 38,850 | OK |
| External-call cost partitioned (USD) | 295.580867 | 295.580867 | OK |
| External calls partitioned by selected run | 38,850 | 38,850 | OK |
| External-call cost partitioned by selected run (USD) | 295.580867 | 295.580867 | OK |
| Task rows partitioned by status | 26,906 | 26,906 | OK |
| Task rows partitioned by outcome | 26,906 | 26,906 | OK |
| Supplemental pre-menu population matches frozen before census | 7,178 | 7,178 | OK |
| Final menu-price population matches after census | 7,178 | 7,178 | OK |
| Pre-menu and final menu-price populations match | 7,178 | 7,178 | OK |
| Pre-menu price-coverage population partition | 7,178 | 7,178 | OK |
| Pre-menu price-coverage location rows | 7,178 | 7,178 | OK |
| Pre-menu missing-menu cohort matches rows | 2,211 | 2,211 | OK |
| Pre-menu zero-priced-menu cohort matches rows | 3,465 | 3,465 | OK |
| Final price-coverage population partition | 7,178 | 7,178 | OK |
| Final price-coverage location rows | 7,178 | 7,178 | OK |
| Final missing-menu cohort matches rows | 1,128 | 1,128 | OK |
| Final zero-priced-menu cohort matches rows | 4,083 | 4,083 | OK |
| Menu run 91 has task evidence | 1 | 1 | OK |
| Menu run 91 offering inserts have exact events | 5,998 | 5,998 | OK |
| Menu run 91 full-pair price backfills have exact events | 34 | 34 | OK |
| Menu run 91 amount-only price backfills have exact events | 2 | 2 | OK |
| Menu run 91 total price backfills have exact events | 36 | 36 | OK |
| Menu run 91 treatment backfills have exact events | 1 | 1 | OK |
| Menu run 91 guarded applications have location offerings ledger rows | 2,963 | 2,963 | OK |
| Menu run 91 price backfills have price_amount ledger rows | 36 | 36 | OK |
| Menu run 91 full-pair price events have price_currency ledger rows | 34 | 34 | OK |
| Menu run 91 treatment backfills have treatment ledger rows | 1 | 1 | OK |
| Menu run 91 existing prices overwritten | 0 | 0 | OK |
| Menu run 96 has task evidence | 1 | 1 | OK |
| Menu run 96 offering inserts have exact events | 82 | 82 | OK |
| Menu run 96 full-pair price backfills have exact events | 0 | 0 | OK |
| Menu run 96 amount-only price backfills have exact events | 0 | 0 | OK |
| Menu run 96 total price backfills have exact events | 0 | 0 | OK |
| Menu run 96 treatment backfills have exact events | 0 | 0 | OK |
| Menu run 96 guarded applications have location offerings ledger rows | 4 | 4 | OK |
| Menu run 96 price backfills have price_amount ledger rows | 0 | 0 | OK |
| Menu run 96 full-pair price events have price_currency ledger rows | 0 | 0 | OK |
| Menu run 96 treatment backfills have treatment ledger rows | 0 | 0 | OK |
| Menu run 96 existing prices overwritten | 0 | 0 | OK |
| Non-deleted locations partitioned by status | 13,878 | 13,878 | OK |
| Active locations represented in search | 7,178 | 7,178 | OK |
| After-census population matches active serving locations | 7,178 | 7,178 | OK |
| Stage 3 cohort disposition partition | 2,156 | 2,156 | OK |
| Stage 3 hidden locations | 1,304 | 1,304 | OK |
| Stage 3 suppression-ledger writes | 1,849 | 1,849 | OK |
| Stage 3 stamped events | 1,304 | 1,304 | OK |
| Stage 3 suppression events found by run ledger query | 1,304 | 1,304 | OK |
| Stage 3 residual search rows | 0 | 0 | OK |
| Stage 3 hard exclusions touched | 0 | 0 | OK |
| Stage 3 task evidence rows | 2,156 | 2,156 | OK |
| Stage 3 needs_human_review task rows | 282 | 282 | OK |
| Redemption candidate decision partition | 5,272 | 5,272 | OK |
| Redeemed decision list | 173 | 173 | OK |
| Redemptions reactivated | 173 | 173 | OK |
| Redemption search rows restored | 173 | 173 | OK |
| Redemption events stamped | 173 | 173 | OK |
| Redemption events found by run ledger query | 173 | 173 | OK |
| Redemption task evidence | 173 | 173 | OK |
| Redemption status-ledger rows | 173 | 173 | OK |
| Owned suppression rows removed | 253 | 253 | OK |
| Final active locations after redemption | 7,178 | 7,178 | OK |
| Final hidden locations after redemption | 6,700 | 6,700 | OK |
| Final suppression-ledger rows | 10,116 | 10,116 | OK |

Every required partition and campaign apply check reconciles.

## Remaining enrichment gaps

| Task | Remaining gap | Actionable | Attempted unresolved | Enqueueable | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: |
| `contact_fill` | 4,390 | 4,390 | 0 | 4,390 | 0 |
| `geocode` | 0 | 0 | 0 | 0 | 0 |
| `image_harvest` | 544 | 437 | 0 | 437 | 107 |
| `menu_extract` | 1,128 | 1,089 | 0 | 1,089 | 39 |
| `reviews_fetch` | 1,855 | 1,855 | 1,855 | 0 | 0 |

## Follow-ups

- Resolve the 282 active Stage 3 needs_human_review location(s) through the final human-review queue.
- Re-enqueue 4,390 remaining enqueueable `contact_fill` gap(s) after reviewing no-change/provider outcomes.
- Re-enqueue 437 remaining enqueueable `image_harvest` gap(s) after reviewing no-change/provider outcomes.
- Re-enqueue 1,089 remaining enqueueable `menu_extract` gap(s) after reviewing no-change/provider outcomes.
- Repeat the completeness census monthly and investigate any newly introduced gaps or suppression/search drift.
