# Organization Dedup Audit Report

Generated: 2026-07-07T22:32:47.880Z
Mode: AUDIT_ONLY_READ_ONLY

No database rows were modified. This report was generated from read-only SELECT queries.

## Summary

- Active organizations: 6483
- Active locations: 13118
- Contaminated orgs with 2+ clinic-like location domains: 287
- Location/org domain mismatches: 942
- Chain naming candidates: 10
- Duplicate org domains: 53

Action counts:

| action | count |
| --- | --- |
| KEEP | 11444 |
| AMBIGUOUS | 970 |
| NEW_ORG | 686 |
| RELINK | 18 |

## Root Cause

Importer code found locally: no

No importer code that inserts organizations or assigns locations.org_id was found in this checkout. Search terms used: dedup_key, website_domain, org_id, name_normalized, INSERT INTO organizations, UPDATE org_id.

DB-supported findings:

- organizations.dedup_key is unique, so any importer using the same non-null fallback key will collapse records into the first matching org.
- 287 active orgs currently parent locations across 2+ distinct clinic-like registrable domains.
- 942 active locations have both a location website domain and an org website_domain, and the two domains differ.
- The Elitra Health sample confirms one org parent currently links to unrelated location domains.

Inference: Because the importer code is absent, the exact branch cannot be proven from source here. The DB state is consistent with org lookup being keyed too broadly when source domain data was missing, malformed, or normalized to a shared fallback, then writing the resulting org id onto unrelated locations.

Dedup key shape counts:

| shape | count |
| --- | --- |
| contains_domain | 6033 |
| other | 450 |

Elitra Health child examples:

| location_id | location_name | location_domain | org_domain | city | region |
| --- | --- | --- | --- | --- | --- |
| 8 | Elitra Health | google.com | elitrahealth.com | New York | NY |
| 10 | Princeton Longevity Center | google.com | elitrahealth.com | New York | NY |
| 13 | AIRE Ancient Baths New York · Tribeca | google.com | elitrahealth.com | New York | NY |
| 15 | Clean Market | google.com | elitrahealth.com | New York | NY |
| 18 | Advanced Holistic Center | google.com | elitrahealth.com | New York | NY |
| 19 | InVita Wellness | google.com | elitrahealth.com | New York | NY |
| 25 | IV DRIPS | google.com | elitrahealth.com | New York | NY |
| 26 | Tribeca Spa of Tranquility \| Korean Body scrub NYC | google.com | elitrahealth.com | New York | NY |
| 28 | Equinox SoHo | google.com | elitrahealth.com | New York | NY |
| 31 | Serenity Natural Health | google.com | elitrahealth.com | New York | NY |
| 35 | Kollectiv \| Sauna, Cryotherapy, Massage, CRYOSKIN, Energy Healing, Spa in New York | google.com | elitrahealth.com | New York | NY |
| 36 | Equinox Orchard Street | google.com | elitrahealth.com | New York | NY |
| 37 | Equinox Bond Street | google.com | elitrahealth.com | New York | NY |
| 39 | Cortisone Shot Specialists Brooklyn | google.com | elitrahealth.com | Brooklyn | NY |
| 41 | Recoverie - Wellness Club | google.com | elitrahealth.com | Brooklyn | NY |
| 43 | QC NY SPA | google.com | elitrahealth.com | New York | NY |
| 46 | JECT | google.com | elitrahealth.com | New York | NY |
| 49 | Clinique YFT | google.com | elitrahealth.com | New York | NY |
| 50 | Integrative Health NYC | google.com | elitrahealth.com | New York | NY |
| 52 | Glowbar Jersey City | google.com | elitrahealth.com | Jersey City | NJ |
| 56 | Ageless Men's Health | google.com | elitrahealth.com | Brooklyn | NY |
| 58 | Russian & Turkish Baths | google.com | elitrahealth.com | New York | NY |
| 59 | Extension Health | google.com | elitrahealth.com | New York | NY |
| 68 | Lov MedSpa New York | google.com | elitrahealth.com | Brooklyn | NY |
| 69 | Tanuj P. Palvia, MD | google.com | elitrahealth.com | Brooklyn | NY |

## Top 20 Worst Orgs

| org_id | canonical_name | org_domain | locations | distinct_domains | top_domains |
| --- | --- | --- | --- | --- | --- |
| 3121 | Intravene Mobile IV Therapy – Tampa | intravenewellnesstherapies.com | 38 | 2 | intravenewellnesstherapies.com (36), intravene.net (2) |
| 919 | Stem Cell Institute | stemcellinstitute.com | 33 | 25 | chicagostemcelltherapy.com (4), advancedstemcellinstitute.com (2), axisstemcell.com (2), phillysportsdoc.com (2), principalspineonline.com (2), wistemcell.com (2), americastem.com (1), dakstemcell.com (1) |
| 355 | STM Physical and Occupational Therapy | stmclinics.com | 32 | 4 | theradynamics.com (21), stmclinics.com (8), precisionrehabny.com (2), westchesterpediatricpt.com (1) |
| 2772 | MedWell Spine, OsteoArthritis & Neuropathy Center | medwellnj.com | 31 | 2 | medwellnj.com (29), puremednj.com (2) |
| 2283 | Duke Children’s Health Center Bone Marrow Transplant Clinic | dukehealth.org | 29 | 2 | dukehealth.org (27), wustl.edu (2) |
| 70 | One Medical Primary Care Clinic - City Point Brooklyn | onemedical.com | 29 | 2 | onemedical.com (28), medicalcareclinic.org (1) |
| 2032 | Carrillo Kern Center for Integrative Therapies | sentara.com | 20 | 2 | sentara.com (19), integrativetherapies.net (1) |
| 1049 | Healthspan | healthspanrecovery.com | 18 | 5 | charlestonhealthspan.com (11), healthspanrecovery.com (3), healthspanofhamptonroads.com (1), valleyhealthspan.com (1), yourmaxhealthspan.com (1) |
| 1799 | 417 Sports Medicine & Orthopedics | 417sportsmedicine.com | 17 | 12 | precisionorthosports.com (3), alphaortho.net (2), irosm.com (2), jacksonvilleorthopaedicsurgeon.com (2), 417sportsmedicine.com (1), aosmlv.com (1), delosportsmedicine.com (1), drparker.com (1) |
| 196 | Primary Care Doctor in Midtown Manhattan | medicalclinicny.com | 17 | 4 | newyorkentinstitute.com (4), medicalclinicny.com (2), manhattanprimarycaredoctorsnyc.com (1), midtownprimarycaredoctor.com (1) |
| 852 | Peace of Mind Yoga, Counseling, and Wellness Center | pomnj.com | 14 | 2 | pomnj.com (13), peacewellnesscenter.com (1) |
| 1849 | Advanced Pain Management | apmpain.com | 12 | 8 | apmpain.com (3), caovirginia.com (3), advancedpainmanagementva.com (1), advancedsportsandspine.com (1), apmaugusta.com (1), easemypainva.com (1), oklahomacitymedspa.net (1), stlouispainmanagement.com (1) |
| 11 | Biograph | biograph.com | 12 | 2 | flt.life (7), biograph.com (4) |
| 2155 | Center For Occupational Health | mbiclinics.com | 12 | 2 | concentra.com (11), mbiclinics.com (1) |
| 1855 | Advanced Regenerative Health | advancedregenhealth.com | 11 | 2 | advancedregenhealth.com (10), regenerativehealthny.com (1) |
| 281 | Primary Care Doctor Brooklyn | doralhw.org | 11 | 2 | doralhw.org (10), primarycaredoctorbrooklyn.com (1) |
| 1639 | Mercy Hospital | hcafloridahealthcare.com | 10 | 3 | commonspirit.org (6), hcafloridahealthcare.com (3), mercy.com (1) |
| 2364 | Augusta Health Multispeciality Clinic Harrisonburg | augustahealth.com | 10 | 2 | augustahealth.com (8), va.gov (2) |
| 690 | SoftWave Therapy | softwaveclinics.com | 9 | 4 | softwaveclinics.com (3), softwavelongisland.com (3), softwavelincoln.com (2), re-gensoftwave.com (1) |
| 1844 | Advanced Orthopaedic Physical Therapy PSC | myaopt.com | 9 | 3 | advancedptonline.com (7), advancedptms.com (1), myaopt.com (1) |

## Chain Naming Candidates

| org_id | canonical_name | proposed_brand_name | suffix | locations | other_child_cities |
| --- | --- | --- | --- | --- | --- |
| 1472 | Prenuvo Clinic - Atlanta, GA | Prenuvo Clinic | Atlanta, GA | 54 | Austin, TX, Boca Raton, FL, Watertown, MA, Buffalo, NY, Fort Mill, SC, Chicago, IL, Irving, TX, Denver, CO |
| 2191 | Greater Therapy Centers – Plano, TX | Greater Therapy Centers | Plano, TX | 32 | Allen, TX, Burleson, TX, Flower Mound, TX, Terrell, TX, Rowlett, TX, Rockwall, TX, Quinlan, TX, Prosper, TX |
| 1513 | Dexascans.com - Jacksonville, FL | Dexascans.com | Jacksonville, FL | 16 | Tampa, FL, San Jose, CA, Jacksonville Beach, FL, Orange Park, FL, St. Augustine, FL, Ponte Vedra Beach, FL, St. Petersburg, FL, Clearwater, FL |
| 2753 | Holsman Physical Therapy – Newark, NJ | Holsman Physical Therapy | Newark, NJ | 16 | Clifton, NJ, Lyndhurst, NJ, Rahway, NJ, Fair Lawn, NJ, Bloomfield, NJ, Caldwell, NJ, Jersey City, NJ, Jeffersonville, IN |
| 912 | Regenerative Pain & Sports Medicine - New York, NY | Regenerative Pain & Sports Medicine | New York, NY | 4 | Los Angeles, CA, New York City, NY, Indianapolis, IN |
| 3839 | Empower U – Sioux Falls, SD | Empower U | Sioux Falls, SD | 3 | Omaha, NE, Austin, TX |
| 4470 | Blain’s Farm & Fleet – Montgomery, Illinois | Blain’s Farm & Fleet | Montgomery, Illinois | 2 | Aurora, IL, St. Paul, MN |
| 2401 | Dr. Burkenstock’s – Skin Body Health – Med Spa – New Orleans, LA | Dr. Burkenstock’s – Skin Body Health – Med Spa | New Orleans, LA | 2 | Mandeville, LA |
| 849 | Maze Laboratories - Harrison, NY | Maze Laboratories | Harrison, NY | 2 | New York City, NY |
| 5294 | Regenerative Stemwave Therapy Center – Brentwood, TN | Regenerative Stemwave Therapy Center | Brentwood, TN | 2 | Nashville, TN, Boston, MA |

## Mismatch Samples

| location_id | location_name | location_domain | org_id | org_name | org_domain | action |
| --- | --- | --- | --- | --- | --- | --- |
| 11239 | Pure Health | pureivhealth.com | 2 | PURE Executive Health & Wellness | purehealthmiami.com | NEW_ORG |
| 8 | Elitra Health | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 10 | Princeton Longevity Center | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 13 | AIRE Ancient Baths New York · Tribeca | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 15 | Clean Market | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 18 | Advanced Holistic Center | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 19 | InVita Wellness | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 25 | IV DRIPS | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 26 | Tribeca Spa of Tranquility \| Korean Body scrub NYC | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 28 | Equinox SoHo | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 31 | Serenity Natural Health | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 35 | Kollectiv \| Sauna, Cryotherapy, Massage, CRYOSKIN, Energy Healing, Spa in New York | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 36 | Equinox Orchard Street | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 37 | Equinox Bond Street | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 39 | Cortisone Shot Specialists Brooklyn | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 41 | Recoverie - Wellness Club | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 43 | QC NY SPA | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 46 | JECT | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 49 | Clinique YFT | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 50 | Integrative Health NYC | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 52 | Glowbar Jersey City | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 56 | Ageless Men's Health | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 58 | Russian & Turkish Baths | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 59 | Extension Health | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 68 | Lov MedSpa New York | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 69 | Tanuj P. Palvia, MD | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 72 | Ageless Skin & Body Solutions | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 76 | Gameday Men's Health Jersey City - TRT, Peptides & ED Clinic | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 77 | Dr. Syra Aesthetics & Longevity Institute | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 78 | Tree of Life Acupuncture | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 79 | Advanced TRT Clinic | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 80 | Clear Laser Skin Clinic Jersey City | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 83 | LIFEDRIPS.IV | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 89 | Simplicity Health Associates | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 93 | FICS by PRTL | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 97 | Maha Rose | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 103 | Othership Flatiron | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 110 | chi4life | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 111 | Raine n River Apothecary | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 113 | Glowbar Cobble Hill | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 115 | Vital IV - Ketamine Therapy & IV Infusions | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 116 | om.life Wellness * Modern Recovery Spa | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 123 | Doctor K Private Medicine | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 125 | OsteoStrong NYC Flatiron | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 129 | Drip Alchemy NYC | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 132 | Emèlle Restorative Medicine, P.C. | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 140 | The Metaphysical Shoppe & Botanica | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 145 | Riverpoint Wellness Group | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 152 | Bathhouse Flatiron | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 153 | Lift / Next Level Floats | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 157 | Hello Hydration | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 159 | Zen Om Studio | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 160 | Elevate Holistics | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 172 | Elite Aesthetics | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 180 | Peak By MD | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 181 | Peachy Williamsburg | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 182 | N4 Esthetic Clinic | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 188 | REVIV New York - IV Therapy \| NAD+ \| B12 Shots \| Glutathione | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 190 | Advanced Holistic Center | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 193 | Flora Naturopathics - Holistic Medicine | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 194 | Jersey City Medical Center | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 199 | ShemaYah Holistic Health | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 208 | NY Center for Functional Medicine | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 209 | Olympus Center for Holistic Integrative Medicine | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 217 | NY Center For Integrative Health | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 222 | The Gael Center: William Gael, MD | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 225 | Doody Free Girl | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 231 | Anima Mundi Apothecary | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 232 | The SPA Club | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 235 | Blossom Pediatrics PC | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 236 | Perspire Sauna Studio | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 237 | Kahuna Skin Clinic | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 241 | Next Health | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 244 | Bathhouse Williamsburg | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 246 | cityWell brooklyn | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 248 | BeRejuved Medical Spa & Wellness Studio - NYC | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 249 | Purely Natural Medical Spa | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 257 | VitalBalance Hormone Center | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 260 | Aura Wellness Spa \| Best Sauna & Body Scrub, Day Spa in NYC | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 262 | Vessel Floats | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 265 | Dr. Sarah Cimperman, ND | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 271 | 4Ever Young Med Spa & Wellness Center - Hoboken | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 275 | Dr. Susan Eisen, D.C. | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 280 | AllCare Health & Pain | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 288 | Equinox Hudson Yards | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 297 | EKAH - Erin Kumpf Acupuncture & Herbs | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 298 | overture spa | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 302 | Dr. Neil Paulvin | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 305 | Birchwell Functional Medicine - Integrative Health & Holistic Nutrition | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 309 | Elena Klimenko, MD - Functional Medicine | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 310 | Studio 17 Cosmetics & Wellness | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 313 | CryoBodyBK - Brooklyn Cryotherapy Spa | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 316 | Skin30.co / Skin Longevity Clinic | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 318 | Your Health Success | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 321 | Neighborhood Natural Medicine | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 334 | Vitality Medicine of New York | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 335 | Anti-Aging Medical Group | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 336 | Park Slope Integrative Medicine PLLC | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 342 | Acupuncture & Alternative Medicine of Brooklyn | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |
| 344 | Santhigram Wellness | google.com | 4 | Elitra Health | elitrahealth.com | AMBIGUOUS |

## Proposed Action Samples

### RELINK

| location_id | location_name | location_domain | current_org | current_org_domain | target/proposed | reason |
| --- | --- | --- | --- | --- | --- | --- |
| 471 | Primary Care Physician Brooklyn | primarycaredoctorbrooklyn.com | Primary Care Doctor Brooklyn | doralhw.org | Primary Care Physician Brooklyn | Location domain exactly matches one different existing org domain. |
| 2354 | Hyperbaric Oxygen Therapy | ucsfhealth.org | HBOTT — National Hyperbaric Oxygen Therapy Hub | hbott.com | UCSF Cartilage Repair and Regeneration Center | Location domain exactly matches one different existing org domain. |
| 3264 | Hyperbaric Oxygen Therapy | ucsfhealth.org | HBOTT — National Hyperbaric Oxygen Therapy Hub | hbott.com | UCSF Cartilage Repair and Regeneration Center | Location domain exactly matches one different existing org domain. |
| 3265 | Hyperbaric Oxygen Therapy | ucsfhealth.org | HBOTT — National Hyperbaric Oxygen Therapy Hub | hbott.com | UCSF Cartilage Repair and Regeneration Center | Location domain exactly matches one different existing org domain. |
| 3266 | Hyperbaric Oxygen Therapy | ucsfhealth.org | HBOTT — National Hyperbaric Oxygen Therapy Hub | hbott.com | UCSF Cartilage Repair and Regeneration Center | Location domain exactly matches one different existing org domain. |
| 3267 | Hyperbaric Oxygen Therapy | ucsfhealth.org | HBOTT — National Hyperbaric Oxygen Therapy Hub | hbott.com | UCSF Cartilage Repair and Regeneration Center | Location domain exactly matches one different existing org domain. |
| 3268 | Hyperbaric Oxygen Therapy | ucsfhealth.org | HBOTT — National Hyperbaric Oxygen Therapy Hub | hbott.com | UCSF Cartilage Repair and Regeneration Center | Location domain exactly matches one different existing org domain. |
| 6251 | CHI Health Advanced Wound Care & Hyperbaric Oxygen Therapy (St. Elizabeth) | chihealth.com | Advanced Wound Care & Hyperbaric Oxygen Center | trinityhealthma.org | CHI Health Clinic Family Medicine (Antelope Creek) | Location domain exactly matches one different existing org domain. |
| 6407 | Aurora Health Center: Advanced Heart Failure Therapies Clinic | aurorahealthcare.org | Advanced Health Center | advancedhealthcenter.com | Aamna Javed, PT | Location domain exactly matches one different existing org domain. |
| 6408 | Aurora Health Center: Advanced Heart Failure Therapies Clinic | aurorahealthcare.org | Advanced Health Center | advancedhealthcenter.com | Aamna Javed, PT | Location domain exactly matches one different existing org domain. |
| 9738 | Bone Marrow Transplant Center | wustl.edu | Duke Children’s Health Center Bone Marrow Transplant Clinic | dukehealth.org | Center for Advanced Medicine | Location domain exactly matches one different existing org domain. |
| 10278 | Gary C. Werths Building at Siteman Cancer Center | wustl.edu | Duke Children’s Health Center Bone Marrow Transplant Clinic | dukehealth.org | Center for Advanced Medicine | Location domain exactly matches one different existing org domain. |
| 10354 | Healing Hands Integrated Wellness and Primary Care | healinghandswinchester.com | Healing Hands Acupuncture NV | healinghandsfp.com | Healing Hands Integrated Wellness and Primary Care | Location domain exactly matches one different existing org domain. |
| 10648 | Louisville Orthopedic Clinic | baptisthealth.com | Louisville Orthopedic Clinic | louortho.com | Baptist Health Hamburg Cancer Center | Location domain exactly matches one different existing org domain. |
| 11888 | SERC Physical Therapy | urpt.com | Spear Physical Therapy | spearcenter.com | Physiofit Physical Therapy | Location domain exactly matches one different existing org domain. |
| 12521 | The McDonnell Genome Institute at Washington University | wustl.edu | University of Washington |  | Center for Advanced Medicine | Location domain exactly matches one different existing org domain. |
| 12926 | USC Stem Cell | usc.edu | SC Stem Cell | scstemchiropractic.com | Eli and Edythe Broad Center for Regenerative Medicine | Location domain exactly matches one different existing org domain. |
| 13213 | Washington University Medical Campus | wustl.edu | University of Washington |  | Center for Advanced Medicine | Location domain exactly matches one different existing org domain. |

### NEW_ORG

| location_id | location_name | location_domain | current_org | current_org_domain | target/proposed | reason |
| --- | --- | --- | --- | --- | --- | --- |
| 63 | Manhattan IV Therapy | manhattanivtherapy.com | Peach IV - Mobile IV Therapy in Lower Manhattan, Hangover IV, NAD+, Glutathione | peachiv.com | Manhattan IV Therapy | Location has a clinic-like domain that matches no existing org website_domain. |
| 360 | Midtown Primary Care Doctor, PC | midtownprimarycaredoctor.com | Primary Care Doctor in Midtown Manhattan | medicalclinicny.com | Midtown Primary Care Doctor, PC | Location has a clinic-like domain that matches no existing org website_domain. |
| 365 | Midtown Primary Care | manhattanprimarycaredoctorsnyc.com | Primary Care Doctor in Midtown Manhattan | medicalclinicny.com | Midtown Primary Care | Location has a clinic-like domain that matches no existing org website_domain. |
| 419 | Manhattan Medicine | manhattanmd.com | Manhattan Sports Medicine | msmwellness.com | Manhattan Medicine | Location has a clinic-like domain that matches no existing org website_domain. |
| 493 | Concierge Doctor | drprimas.com | Concierge Primary Care Doctor | helpmenowdoc.com | Concierge Doctor | Location has a clinic-like domain that matches no existing org website_domain. |
| 537 | Fountain Health NYC \| NYC Ketamine Therapy, Mental Health & Wellness Care | fountainnyc.com | NY Health & Wellness Care | nywellnesshealth.com | Fountain Health NYC \| NYC Ketamine Therapy, Mental Health & Wellness Care | Location has a clinic-like domain that matches no existing org website_domain. |
| 595 | Primary Care Doctor | newyorkentinstitute.com | Primary Care Doctor in Midtown Manhattan | medicalclinicny.com | Primary Care Doctor | Location has a clinic-like domain that matches no existing org website_domain. |
| 736 | NY Chiropractic & Physical Therapy | nychiropt.com | Hudson Sport & Spine Chiropractic & Physical Therapy | hudsonsportandspine.com | NY Chiropractic & Physical Therapy | Location has a clinic-like domain that matches no existing org website_domain. |
| 825 | Theradynamics Physical & Occupational Therapy - Kew Gardens, NY | theradynamics.com | STM Physical and Occupational Therapy | stmclinics.com | Theradynamics Physical & Occupational Therapy - Kew Gardens, NY | Location has a clinic-like domain that matches no existing org website_domain. |
| 894 | Precision Rehab Occupational Physical & Hand Therapy | precisionrehabny.com | STM Physical and Occupational Therapy | stmclinics.com | Precision Rehab Occupational Physical & Hand Therapy | Location has a clinic-like domain that matches no existing org website_domain. |
| 932 | Theradynamics Physical & Occupational Therapy | theradynamics.com | STM Physical and Occupational Therapy | stmclinics.com | Theradynamics Physical & Occupational Therapy | Location has a clinic-like domain that matches no existing org website_domain. |
| 945 | Sage Beauty & Wellness Inc. | sagebeautyandwellness.com | Saged NYC Beauty & Wellness | zoca.com | Sage Beauty & Wellness Inc. | Location has a clinic-like domain that matches no existing org website_domain. |
| 1006 | Integrative Therapy NJ | integrativetherapynj.com | Integrative Therapy Center | integrativetherapy.center | Integrative Therapy NJ | Location has a clinic-like domain that matches no existing org website_domain. |
| 1090 | Red Light Therapy NY | rltny.com | Red Light Therapy NY | redlighttherapyny.com | Red Light Therapy NY | Location has a clinic-like domain that matches no existing org website_domain. |
| 1108 | Peptide Testosterone Semaglutide Sermorelin Therapy Clinic | peptideedge.com | Peptide Testosterone Semaglutide Sermorelin Therapy Clinic | peakvitalityhormones.com | Peptide Testosterone Semaglutide Sermorelin Therapy Clinic | Location has a clinic-like domain that matches no existing org website_domain. |
| 1129 | StrIVe Wellness NJ(Mens Health-Testosterone Replacement Therapy, Peptide Therapy, IV Therapy, Medical Weight Loss) | strivewellnessnj.com | Wellness IV Therapy | wellnesstherapyiv.com | StrIVe Wellness NJ(Mens Health-Testosterone Replacement Therapy, Peptide Therapy, IV Therapy, Medical Weight Loss) | Location has a clinic-like domain that matches no existing org website_domain. |
| 1262 | SoftWave - Shockwave Therapy | softwavelongisland.com | SoftWave Therapy | softwaveclinics.com | SoftWave - Shockwave Therapy | Location has a clinic-like domain that matches no existing org website_domain. |
| 1287 | Infusion Wellness | infusion-wellness.com | Renue Wellness: Ketamine Infusion Therapy & Spravato Treatment | renuewellness.com | Infusion Wellness | Location has a clinic-like domain that matches no existing org website_domain. |
| 1299 | Simple Therapy | simpletherapysolutions.com | Simple Somatic Therapy | simplesomatic.com | Simple Therapy | Location has a clinic-like domain that matches no existing org website_domain. |
| 1308 | Infusion Wellness Center \| IV Hydration \| Vitamin Drip | infusionwellnesscenter.com | IV Vitamin Infusion | ivvitamininfusion.com | Infusion Wellness Center \| IV Hydration \| Vitamin Drip | Location has a clinic-like domain that matches no existing org website_domain. |
| 1325 | Westchester Physical and Occupational Therapy, PLLC - Sensory Jim ™ Pediatric Physical Therapy | westchesterpediatricpt.com | STM Physical and Occupational Therapy | stmclinics.com | Westchester Physical and Occupational Therapy, PLLC - Sensory Jim ™ Pediatric Physical Therapy | Location has a clinic-like domain that matches no existing org website_domain. |
| 1350 | Pediatric Neurology | pediatricneurologycare.com | Pediatric Neurology of NYC | pediatricneurologynyc.com | Pediatric Neurology | Location has a clinic-like domain that matches no existing org website_domain. |
| 1380 | Tranquility 3 Spa & Salt Cave | tranquility3spasaltcave.com | Tranquility Spa | tranquilityspa.com | Tranquility 3 Spa & Salt Cave | Location has a clinic-like domain that matches no existing org website_domain. |
| 1421 | Dr. Padra Nourparvar Stem Cell & PRP Institute of L.A. | stemwavepro.com | Stem Cell Institute | stemcellinstitute.com | Dr. Padra Nourparvar Stem Cell & PRP Institute of L.A. | Location has a clinic-like domain that matches no existing org website_domain. |
| 1553 | Rejuve | rejuveclinics.com | Rejuve Day Spa | rejuvedayspa.net | Rejuve | Location has a clinic-like domain that matches no existing org website_domain. |
| 1564 | The Q Institute | theqinstitute.com | Ackerman Institute for the Family | ackerman.org | The Q Institute | Location has a clinic-like domain that matches no existing org website_domain. |
| 1593 | Central Health | centralhealth.co | Central Texas Holistic Health | ctxhh.com | Central Health | Location has a clinic-like domain that matches no existing org website_domain. |
| 1642 | Cenegenics México | cenegenics.mx | Cenegenics | cenegenics.com | Cenegenics México | Location has a clinic-like domain that matches no existing org website_domain. |
| 1694 | Holistic Practice | holisticpractice.ch | Sunflower House - Holistic Health Practice | sunflowerhouse.ch | Holistic Practice | Location has a clinic-like domain that matches no existing org website_domain. |
| 2158 | The Bone Wellness Centre - DEXA TORONTO | inmetrotoronto.com | The Bone Wellness Centre - DEXA TORONTO | bonewellness.com | The Bone Wellness Centre - DEXA TORONTO | Location has a clinic-like domain that matches no existing org website_domain. |
| 2177 | BodyScan City | bodyview.co.uk | BodyScan | bodyscanuk.com | BodyScan City | Location has a clinic-like domain that matches no existing org website_domain. |
| 2178 | BodyView Birmingham | bodyview.co.uk | BodyScan | bodyscanuk.com | BodyView Birmingham | Location has a clinic-like domain that matches no existing org website_domain. |
| 2179 | BodyView Manchester | bodyview.co.uk | BodyScan | bodyscanuk.com | BodyView Manchester | Location has a clinic-like domain that matches no existing org website_domain. |
| 2213 | Gameday Men's Health – Austin | gamedaymenshealth.com | Gameday Men's Health | gamedaymenshealth.ca | Gameday Men's Health – Austin | Location has a clinic-like domain that matches no existing org website_domain. |
| 2229 | JK Plastic Surgery Center | jkplastic.com | JK Plastic Surgery Center |  | JK Plastic Surgery Center | Location has a clinic-like domain that matches no existing org website_domain. |
| 2233 | Our clinics & Specialists | samsunghospital.com | Our clinics & Specialists | severance.healthcare | Our clinics & Specialists | Location has a clinic-like domain that matches no existing org website_domain. |
| 2298 | Health Sciences Centre | easternhealth.ca | QEII Health Sciences Centre | nshealth.ca | Health Sciences Centre | Location has a clinic-like domain that matches no existing org website_domain. |
| 2299 | Barrie HBOT | cortico.health | Barrie HBOT | barriehbot.ca | Barrie HBOT | Location has a clinic-like domain that matches no existing org website_domain. |
| 2331 | Breathe Hyperbarics - HBOT | hyphoe.eu | Breathe Hyperbarics - HBOT | breathe-hbot.com | Breathe Hyperbarics - HBOT | Location has a clinic-like domain that matches no existing org website_domain. |
| 2332 | Oxygens | oxygens.co.uk | Oxygens Hyperbaric Clinic | hyperbaricclinic.co.uk | Oxygens | Location has a clinic-like domain that matches no existing org website_domain. |
| 2389 | Nescens Clinique de Genolier | nescens.com | Nescens Clinique de Genolier |  | Nescens Clinique de Genolier | Location has a clinic-like domain that matches no existing org website_domain. |
| 2399 | Clinique La Prairie | cliniquelaprairie.com | Clinique La Prairie |  | Clinique La Prairie | Location has a clinic-like domain that matches no existing org website_domain. |
| 2400 | Chenot Palace Weggis | chenot.com | Chenot Palace Weggis |  | Chenot Palace Weggis | Location has a clinic-like domain that matches no existing org website_domain. |
| 2401 | Lanserhof Tegernsee | lanserhof.com | Lanserhof Tegernsee |  | Lanserhof Tegernsee | Location has a clinic-like domain that matches no existing org website_domain. |
| 2403 | Palazzo Fiuggi | palazzofiuggi.com | Palazzo Fiuggi |  | Palazzo Fiuggi | Location has a clinic-like domain that matches no existing org website_domain. |
| 2412 | Buchinger Wilhelmi | buchinger-wilhelmi.com | Buchinger Wilhelmi |  | Buchinger Wilhelmi | Location has a clinic-like domain that matches no existing org website_domain. |
| 2442 | Seoul Stem Cell Clinic | seoulstemcellclinic.com | One Cell Clinic Gangnam Seoul \| Stem Cell Therapy & Regenerative Medicine for International Patients | gangnamstemcelltherapy.com | Seoul Stem Cell Clinic | Location has a clinic-like domain that matches no existing org website_domain. |
| 2523 | Fountain Life New York | flt.life | Biograph | biograph.com | Fountain Life New York | Location has a clinic-like domain that matches no existing org website_domain. |
| 2528 | Next Health - New York City | flt.life | Biograph | biograph.com | Next Health - New York City | Location has a clinic-like domain that matches no existing org website_domain. |
| 2530 | Longevity Center Poland | flt.life | Biograph | biograph.com | Longevity Center Poland | Location has a clinic-like domain that matches no existing org website_domain. |

### AMBIGUOUS

| location_id | location_name | location_domain | current_org | current_org_domain | target/proposed | reason |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | Elitra Health | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 10 | Princeton Longevity Center | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 13 | AIRE Ancient Baths New York · Tribeca | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 15 | Clean Market | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 18 | Advanced Holistic Center | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 19 | InVita Wellness | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 25 | IV DRIPS | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 26 | Tribeca Spa of Tranquility \| Korean Body scrub NYC | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 28 | Equinox SoHo | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 31 | Serenity Natural Health | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 35 | Kollectiv \| Sauna, Cryotherapy, Massage, CRYOSKIN, Energy Healing, Spa in New York | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 36 | Equinox Orchard Street | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 37 | Equinox Bond Street | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 39 | Cortisone Shot Specialists Brooklyn | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 41 | Recoverie - Wellness Club | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 43 | QC NY SPA | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 44 | The Singing Bowl Sound Bath Studio LLC | facebook.com | The Singing Bowl Sound Bath Studio LLC | facebook.com |  | Location website resolves to non-clinic/profile/marketplace domain facebook.com. |
| 46 | JECT | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 49 | Clinique YFT | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 50 | Integrative Health NYC | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 52 | Glowbar Jersey City | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 56 | Ageless Men's Health | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 58 | Russian & Turkish Baths | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 59 | Extension Health | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 68 | Lov MedSpa New York | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 69 | Tanuj P. Palvia, MD | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 72 | Ageless Skin & Body Solutions | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 76 | Gameday Men's Health Jersey City - TRT, Peptides & ED Clinic | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 77 | Dr. Syra Aesthetics & Longevity Institute | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 78 | Tree of Life Acupuncture | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 79 | Advanced TRT Clinic | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 80 | Clear Laser Skin Clinic Jersey City | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 83 | LIFEDRIPS.IV | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 89 | Simplicity Health Associates | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 93 | FICS by PRTL | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 97 | Maha Rose | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 103 | Othership Flatiron | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 110 | chi4life | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 111 | Raine n River Apothecary | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 113 | Glowbar Cobble Hill | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 115 | Vital IV - Ketamine Therapy & IV Infusions | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 116 | om.life Wellness * Modern Recovery Spa | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 123 | Doctor K Private Medicine | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 125 | OsteoStrong NYC Flatiron | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 129 | Drip Alchemy NYC | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 132 | Emèlle Restorative Medicine, P.C. | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 140 | The Metaphysical Shoppe & Botanica | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 145 | Riverpoint Wellness Group | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 152 | Bathhouse Flatiron | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |
| 153 | Lift / Next Level Floats | google.com | Elitra Health | elitrahealth.com |  | Location website resolves to non-clinic/profile/marketplace domain google.com. |

### KEEP

| location_id | location_name | location_domain | current_org | current_org_domain | target/proposed | reason |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Biograph | biograph.com | Biograph | biograph.com |  | Location website domain matches current org website_domain. |
| 2 | Hudson Medical | hudson.health | Hudson Medical | hudson.health |  | Location website domain matches current org website_domain. |
| 3 | Gotham Footcare and Podiatry - Downtown | gothamfootcare.com | Gotham Footcare and Podiatry - Downtown | gothamfootcare.com |  | Location website domain matches current org website_domain. |
| 4 | Tribeca Physical Therapy | tribecaphysicaltherapy.com | Tribeca Physical Therapy | tribecaphysicaltherapy.com |  | Location website domain matches current org website_domain. |
| 5 | ILM Wellness \| Endospheres Therapy + Laser Lipo + RF | ilmwellnessstudio.com | ILM Wellness \| Endospheres Therapy + Laser Lipo + RF | ilmwellnessstudio.com |  | Location website domain matches current org website_domain. |
| 6 | RESET Physical Therapy | resetpt.com | RESET Physical Therapy | resetpt.com |  | Location website domain matches current org website_domain. |
| 7 | MD Hyperbaric | mdhyperbaric.com | MD Hyperbaric | mdhyperbaric.com |  | Location website domain matches current org website_domain. |
| 9 | Evolve Med Spa | evolvemedspa.com | Evolve Med Spa | evolvemedspa.com |  | Location website domain matches current org website_domain. |
| 11 | Ora Pearlstein, MD | drorapearlstein.com | Ora Pearlstein, MD | drorapearlstein.com |  | Location website domain matches current org website_domain. |
| 12 | Trifecta Med Spa Downtown | trifectamedspanyc.com | Trifecta Med Spa Downtown | trifectamedspanyc.com |  | Location website domain matches current org website_domain. |
| 14 | Manhattan Sports Medicine | msmwellness.com | Manhattan Sports Medicine | msmwellness.com |  | Location website domain matches current org website_domain. |
| 16 | Tribeca Medspa | tribecamedspa.com | Tribeca Medspa | tribecamedspa.com |  | Location website domain matches current org website_domain. |
| 17 | SoHo Men's Health | sohomenshealth.com | SoHo Men's Health | sohomenshealth.com |  | Location website domain matches current org website_domain. |
| 20 | Remedy Place SoHo | remedyplace.com | Remedy Place SoHo | remedyplace.com |  | Location website domain matches current org website_domain. |
| 21 | JW Wellness NYC | jw-wellnessnyc.com | JW Wellness NYC | jw-wellnessnyc.com |  | Location website domain matches current org website_domain. |
| 22 | Pediatric Neurology of NYC | pediatricneurologynyc.com | Pediatric Neurology of NYC | pediatricneurologynyc.com |  | Location website domain matches current org website_domain. |
| 23 | Dari Esthetics | glossgenius.com | Dari Esthetics | glossgenius.com |  | Location website domain matches current org website_domain. |
| 24 | Bel Angé Medical Spa | belangemedspa.com | Bel Angé Medical Spa | belangemedspa.com |  | Location website domain matches current org website_domain. |
| 27 | Fresh IV Drips-Mobile IV Therapy NYC | freshivdrips.com | Fresh IV Drips-Mobile IV Therapy NYC | freshivdrips.com |  | Location website domain matches current org website_domain. |
| 29 | hol+ | holplus.co | hol+ | holplus.co |  | Location website domain matches current org website_domain. |
| 30 | Bamford Wellness Spa | 1hotels.com | Bamford Wellness Spa | 1hotels.com |  | Location website domain matches current org website_domain. |
| 32 | Manhattan Restorative Primary Care | mrhsclinics.com | Manhattan Restorative Primary Care | mrhsclinics.com |  | Location website domain matches current org website_domain. |
| 33 | Great Many Noho | greatmany.com | Great Many Noho | greatmany.com |  | Location website domain matches current org website_domain. |
| 34 | Clean Market | cleanmarket.com | Clean Market | cleanmarket.com |  | Location website domain matches current org website_domain. |
| 38 | HealingandRetreats – Brooklyn QHHT 量子催眠, Past Life Regression & Deep Healing of Depression, Anxiety, Trauma, Blockage | healingandretreats.com | HealingandRetreats – Brooklyn QHHT 量子催眠, Past Life Regression & Deep Healing of Depression, Anxiety, Trauma, Blockage | healingandretreats.com |  | Location website domain matches current org website_domain. |
| 40 | New York PEMF | newyorkpemf.com | New York PEMF | newyorkpemf.com |  | Location website domain matches current org website_domain. |
| 42 | NJ Primary Care | njprimary.com | NJ Primary Care | njprimary.com |  | Location website domain matches current org website_domain. |
| 45 | Exchange Physical Therapy Group Jersey City | exchangephysicaltherapygroup.com | Exchange Physical Therapy Group Jersey City | exchangephysicaltherapygroup.com |  | Location website domain matches current org website_domain. |
| 47 | Neuropathу Treatmеnt Doctоr Broоklyn | neuroinjuryspecialists.com | Neuropathу Treatmеnt Doctоr Broоklyn | neuroinjuryspecialists.com |  | Location website domain matches current org website_domain. |
| 48 | Forbidden Well | forbiddenwell.com | Forbidden Well | forbiddenwell.com |  | Location website domain matches current org website_domain. |
| 51 | Radiant Beauty & Health Brooklyn | radiantbeautyandhealth.com | Radiant Beauty & Health Brooklyn | radiantbeautyandhealth.com |  | Location website domain matches current org website_domain. |
| 53 | [Intuitive Touch Physiotherapy]:[Vilma Wong, PT, DPT, OCS, FFMT, FAAOMPT] | clientsecure.me | [Intuitive Touch Physiotherapy]:[Vilma Wong, PT, DPT, OCS, FFMT, FAAOMPT] | clientsecure.me |  | Location website domain matches current org website_domain. |
| 54 | Neuro Injury Care Institute \| Workers' Compensation Neurologist, No-Fault, Major Medical | neuroinjurycare.com | Neuro Injury Care Institute \| Workers' Compensation Neurologist, No-Fault, Major Medical | neuroinjurycare.com |  | Location website domain matches current org website_domain. |
| 55 | Peach IV - Mobile IV Therapy in Lower Manhattan, Hangover IV, NAD+, Glutathione | peachiv.com | Peach IV - Mobile IV Therapy in Lower Manhattan, Hangover IV, NAD+, Glutathione | peachiv.com |  | Location website domain matches current org website_domain. |
| 57 | Space For Wellness | spaceforwellness.nyc | Space For Wellness | spaceforwellness.nyc |  | Location website domain matches current org website_domain. |
| 60 | BASI Pilates Academy - NYC | basipilatesacademynyc.com | BASI Pilates Academy - NYC | basipilatesacademynyc.com |  | Location website domain matches current org website_domain. |
| 61 | Megan-Marie PT LLC | brainbodywithmeg.com | Megan-Marie PT LLC | brainbodywithmeg.com |  | Location website domain matches current org website_domain. |
| 62 | Frontline Wellness Group-Kristen Plake, LCSW | frontlinewellnessgroup.com | Frontline Wellness Group-Kristen Plake, LCSW | frontlinewellnessgroup.com |  | Location website domain matches current org website_domain. |
| 64 | Manhattan Medical Arts - W 13th St Union Square | manhattanmedicalarts.com | Manhattan Medical Arts - W 13th St Union Square | manhattanmedicalarts.com |  | Location website domain matches current org website_domain. |
| 65 | JAG Physical Therapy | jagpt.com | JAG Physical Therapy | jagpt.com |  | Location website domain matches current org website_domain. |
| 66 | META Bodywork | metabodywork.com | META Bodywork | metabodywork.com |  | Location website domain matches current org website_domain. |
| 67 | Urban Aesthetic Med Spa | urbanaestheticmedspa.com | Urban Aesthetic Med Spa | urbanaestheticmedspa.com |  | Location website domain matches current org website_domain. |
| 70 | Peachy Brooklyn Heights | peachystudio.com | Peachy Brooklyn Heights | peachystudio.com |  | Location website domain matches current org website_domain. |
| 71 | Lukin Center for Psychotherapy \| Jersey City | lukincenter.com | Lukin Center for Psychotherapy \| Jersey City | lukincenter.com |  | Location website domain matches current org website_domain. |
| 73 | Rejuvenate Yourself- Jersey Shore | rejuvenateyourselfnyc.com | Rejuvenate Yourself- Jersey Shore | rejuvenateyourselfnyc.com |  | Location website domain matches current org website_domain. |
| 74 | Complete Physical Rehabilitation - Jersey City | cprnj.com | Complete Physical Rehabilitation - Jersey City | cprnj.com |  | Location website domain matches current org website_domain. |
| 75 | Transformational Healthcare Services | transformationalhealth.net | Transformational Healthcare Services | transformationalhealth.net |  | Location website domain matches current org website_domain. |
| 81 | The Me Project | themeproject.com | The Me Project | themeproject.com |  | Location website domain matches current org website_domain. |
| 82 | Vanguard Medical Group | vanguardmedgroup.com | Vanguard Medical Group | vanguardmedgroup.com |  | Location website domain matches current org website_domain. |
| 84 | Restore Hyper Wellness | restore.com | Restore Hyper Wellness | restore.com |  | Location website domain matches current org website_domain. |

## Full JSON

The full per-location proposed action list is in `org-dedup-audit-report-20260707.json`.
