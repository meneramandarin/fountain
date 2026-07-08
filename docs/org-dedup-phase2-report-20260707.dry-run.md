# Org Dedup Phase 2 Report

Generated: 2026-07-07T23:00:58.420Z
Mode: DRY_RUN_ROLLED_BACK

## Summary

| metric | count |
| --- | --- |
| relinked_locations | 18 |
| new_orgs_created | 410 |
| new_org_locations | 580 |
| moved_to_ambiguous_by_guardrail | 106 |
| ambiguous_kept | 483 |
| detached_to_null | 487 |
| renamed_orgs | 9 |
| blain_locations_hidden | 2 |
| empty_orgs_deleted | 0 |
| empty_orgs_skipped_due_refs | 0 |
| refreshed_locations | 127 |

## Backups

- Dry run only; no backup tables committed.

## New Orgs Created

| org_id | canonical_name | website_domain | locations |
| --- | --- | --- | --- |
| 7304 | Manhattan IV Therapy | manhattanivtherapy.com | 1 |
| 7305 | Midtown Primary Care Doctor, PC | midtownprimarycaredoctor.com | 1 |
| 7306 | Midtown Primary Care | manhattanprimarycaredoctorsnyc.com | 1 |
| 7307 | Manhattan Medicine | manhattanmd.com | 1 |
| 7308 | Concierge Doctor | drprimas.com | 1 |
| 7309 | Fountain Health NYC | fountainnyc.com | 1 |
| 7310 | Primary Care Doctor | newyorkentinstitute.com | 4 |
| 7311 | NY Chiropractic & Physical Therapy | nychiropt.com | 1 |
| 7312 | Theradynamics Physical & Occupational Therapy | theradynamics.com | 21 |
| 7313 | Precision Rehab Occupational Physical & Hand Therapy | precisionrehabny.com | 2 |
| 7314 | Sage Beauty & Wellness Inc. | sagebeautyandwellness.com | 1 |
| 7315 | Integrative Therapy NJ | integrativetherapynj.com | 2 |
| 7316 | Red Light Therapy NY | rltny.com | 1 |
| 7317 | Peptide Testosterone Semaglutide Sermorelin Therapy Clinic | peptideedge.com | 1 |
| 7318 | StrIVe Wellness NJ | strivewellnessnj.com | 1 |
| 7319 | SoftWave - Shockwave Therapy | softwavelongisland.com | 3 |
| 7320 | Infusion Wellness | infusion-wellness.com | 1 |
| 7321 | Simple Therapy | simpletherapysolutions.com | 1 |
| 7322 | Infusion Wellness Center | infusionwellnesscenter.com | 1 |
| 7323 | Westchester Physical and Occupational Therapy, PLLC - Sensory Jim ™ Pediatric Physical Therapy | westchesterpediatricpt.com | 1 |
| 7324 | Pediatric Neurology | pediatricneurologycare.com | 2 |
| 7325 | Tranquility 3 Spa & Salt Cave | tranquility3spasaltcave.com | 1 |
| 7326 | Dr. Padra Nourparvar Stem Cell & PRP Institute of L.A. | stemwavepro.com | 1 |
| 7327 | Rejuve | rejuveclinics.com | 1 |
| 7328 | The Q Institute | theqinstitute.com | 1 |
| 7329 | Central Health | centralhealth.co | 1 |
| 7330 | Cenegenics México | cenegenics.mx | 1 |
| 7331 | Holistic Practice | holisticpractice.ch | 1 |
| 7332 | The Bone Wellness Centre - DEXA TORONTO | inmetrotoronto.com | 1 |
| 7333 | Gameday Men's Health | gamedaymenshealth.com | 5 |
| 7334 | JK Plastic Surgery Center | jkplastic.com | 1 |
| 7335 | Our clinics & Specialists | samsunghospital.com | 1 |
| 7336 | Health Sciences Centre | easternhealth.ca | 1 |
| 7337 | Barrie HBOT | cortico.health | 1 |
| 7338 | Breathe Hyperbarics - HBOT | hyphoe.eu | 1 |
| 7339 | Oxygens | oxygens.co.uk | 2 |
| 7340 | Nescens Clinique de Genolier | nescens.com | 2 |
| 7341 | Clinique La Prairie | cliniquelaprairie.com | 1 |
| 7342 | Chenot Palace Weggis | chenot.com | 6 |
| 7343 | Lanserhof | lanserhof.com | 2 |
| 7344 | Palazzo Fiuggi | palazzofiuggi.com | 1 |
| 7345 | Buchinger Wilhelmi | buchinger-wilhelmi.com | 1 |
| 7346 | Seoul Stem Cell Clinic | seoulstemcellclinic.com | 1 |
| 7347 | Hooke London | europepmc.org | 1 |
| 7348 | Vital IV - Ketamine Therapy & IV Infusions | cavoramindandwellness.com | 1 |
| 7349 | Apex Peptide Therapy | usapeptidecenter.com | 1 |
| 7350 | Peptide Testosterone Semaglutide Sermorelin Therapy Clinic | hrt-aa.com | 1 |
| 7351 | Columbia Stem Cell Initiative | columbia.edu | 1 |
| 7352 | Hausarzt Zürich Seefeld – Dr. Harris ROMANOS | hausarzt-zurich.ch | 1 |
| 7353 | Abundant Life Wellness Center | abundantlifewi.com | 1 |
| 7354 | Advanced Health Solutions – Mobile | youradvancedhealthsolutions.com | 2 |
| 7355 | Advanced Medical Center | baltimoreadvancedmedical.com | 5 |
| 7356 | Advanced Pain Management | apmaugusta.com | 1 |
| 7357 | Advanced Pain Management of Virginia | advancedpainmanagementva.com | 1 |
| 7358 | Advanced Physical Therapy | advancedptonline.com | 7 |
| 7359 | Advanced Physical Therapy, LLC | advancedptms.com | 1 |
| 7360 | Advanced Sports & Spine | advancedsportsandspine.com | 1 |
| 7361 | Advanced Stem Cell Institute | advancedstemcellinstitute.com | 2 |
| 7362 | Advanced Therapy Solutions | advancedtherapy.net | 3 |
| 7363 | Aesthetics Medical Spa | aestheticslansing.com | 1 |
| 7364 | Aligned Mind and Body: Chiropractic & Mental Health | drmichaelhughlett.com | 5 |
| 7365 | Alpha Orthopedics & Sports Medicine | alphaortho.net | 2 |
| 7366 | Arch Advanced Pain Management | stlouispainmanagement.com | 1 |
| 7367 | Ascend Wellness- Ketamine & IV Therapy Clinic | ascendwc.net | 2 |
| 7368 | Innate Healthcare Institute – Stem Cell and Integrative Medicine | innatehealthcare.org | 1 |
| 7369 | Peace Wellness Center | peacewellnesscenter.com | 1 |
| 7370 | Strength and Nurture Counseling, LLC | strengthandnurture.com | 2 |
| 7371 | Ageless Medical Aesthetics | agelessinspired.com | 1 |
| 7372 | CAO The Centers for Advanced Orthopedics Manassas | caovirginia.com | 3 |
| 7373 | Charleston Healthspan Institute | charlestonhealthspan.com | 11 |
| 7374 | Dakota Stem Cell Institute | dakstemcell.com | 1 |
| 7375 | Everest Medical Group | everestmedicalgroup.com | 1 |
| 7376 | New England Stem Cell Institute | newenglandstemcells.com | 1 |
| 7377 | Origin Health Center | originhealthcenter.com | 1 |
| 7378 | EA Medical Aesthetics Med Spa | easkincare.com | 1 |
| 7379 | Lendermon Sports Medicine & Regenerative Orthopedics | lendermonsportsmedicine.com | 1 |
| 7380 | R3 Stem Cell | stemcelltherapyforpelvicpain.com | 2 |
| 7381 | Cavendish Clinic | cavendishclinic.co.uk | 2 |
| 7382 | Center For Health & Wellness | chwnv.com | 1 |
| 7383 | Derma Medical of Laredo | dermalaredo.com | 1 |
| 7384 | H2O Aesthetics and Wellness | h2oaestheticswellness.com | 1 |
| 7385 | Medical Direct Care Functional Medicine Health & Wellness Center Gregory M. Fryer, MD | medicaldirectcare.com | 4 |
| 7386 | Center of laser vision correction CARE VISION in Nuremberg | care-vision.de | 29 |
| 7387 | Banobagi Clinic | banobagi.com | 1 |
| 7388 | Dr. J Regenerative Medicine | drjmed.com | 1 |
| 7389 | health and wellness center | acu-healingcenter.com | 1 |
| 7390 | Neurology Consultants | neurologyconsultants.info | 1 |
| 7391 | Performance Physical Therapy | performancept.com | 1 |
| 7392 | EmCell Cell Therapy Center | emcell.com | 1 |
| 7393 | Good Cells Clinic | goodcells.com.ua | 1 |
| 7394 | Elite Physical Therapy and Wellness | elitepainrelief.com | 2 |
| 7395 | Focused Life Clinic | focusedlifeclinic.com | 1 |
| 7396 | Integrative Therapies | integrativetherapies.net | 1 |
| 7397 | Mobile Physical Therapy | mobileptgroup.org | 1 |
| 7398 | Center for Wellbeing | centerforwell.com | 2 |
| 7399 | Charleston Wound Care | charlestonwoundcare.com | 3 |
| 7400 | CommunityMed Family Urgent Care Arlington | communitymedcare.com | 1 |
| 7401 | Delo Sports Medicine and Interventional Orthopedics | delosportsmedicine.com | 1 |
| 7402 | Hands on Health Physical Therapy and Wellness LLC | handsonhealthnola.com | 2 |
| 7403 | Integrative Medical | integrativemedical.com | 3 |
| 7404 | Occupational Health | kp.org | 1 |
| 7405 | Precision Orthopedics & Sports Medicine | precisionorthosports.com | 3 |
| 7406 | Compassionate Care Medical Clinic | compassionateclinic.org | 1 |
| 7407 | Hampton Roads Health and Wellness Care | hrhwellness.com | 1 |
| 7408 | Padda Institute Center for Interventional Pain Management | painmd.tv | 3 |
| 7409 | Regenexx Des Moines | regenexxdesmoines.com | 1 |
| 7410 | Restored Life Wellness Center PLLC | restoredlifewellnesscenter.com | 1 |
| 7411 | Hairport Clinic | hairportclinic.it | 3 |
| 7412 | Bionic Innovations Prosthetics and Orthotics | bionicinnovationspo.com | 1 |
| 7413 | Center For Cosmetic Surgery | drstaahl.com | 1 |
| 7414 | Chicago Stem Cell Therapy & Regenerative Medicine | usacelltherapy.com | 1 |
| 7415 | Empower Physical Therapy | empoweralaska.com | 3 |
| 7416 | Family Health & Wellness Center, P.C. | fhwclnk.com | 1 |
| 7417 | H2 Wellness Solutions | h2wellnesssolutions.com | 2 |
| 7418 | Integrative Physical Therapy and Wellness – Northshore | integrativeptwellness.com | 7 |
| 7419 | Milwaukee Advanced Physical Therapy LLC | milwaukeeadvancedpt.com | 1 |
| 7420 | Optimum Wellness Solutions | optimumwellnesssolutions.com | 1 |
| 7421 | Novastem | novastem.com | 2 |
| 7422 | 3D Integrated Medical | 3dintegratedmedical.com | 1 |
| 7423 | AMAVA Regenerative Medicine | amavaregenerativemedicine.com | 1 |
| 7424 | Inland Wellness & Vitality | inlandwellnessandvitality.com | 1 |
| 7425 | Integrative Wellness | integrativewellnesssd.com | 1 |
| 7426 | Neurology Consultants | ncmmgm.com | 1 |
| 7427 | North Tacoma Musculoskeletal & Regenerative Medicine | northtacomamsk.com | 1 |
| 7428 | ABClinic Art & Beauty | abclinic.com | 1 |
| 7429 | DentaVita Dental Clinique | dentavita.com.tr | 1 |
| 7430 | Natural Klinik | naturalklinik.com | 1 |
| 7431 | Sono Bello - San Jose | sonobello.com | 1 |
| 7432 | Axis Stem Cell Institute | axisstemcell.com | 2 |
| 7433 | Life Aligned Wellness Center | lifealignedwellness.com | 1 |
| 7434 | Principal Stem Cell Therapy Denton | principalspineonline.com | 2 |
| 7435 | Progressive Feet: Manassas Foot and Ankle Center and Wound Care | progressivefeet.com | 1 |
| 7436 | Re-Gen SoftWave Therapy | re-gensoftwave.com | 1 |
| 7437 | EMPCLINICS | cellavia.com | 1 |
| 7438 | Private Medicabil Hospital | medicabil.com | 2 |
| 7439 | Advanced Healthcare Solutions | ahstexas.com | 1 |
| 7440 | Boston Stem Cell & Regenerative Medicine Institute | orthopedicstemcellsboston.com | 1 |
| 7441 | LA Ageless Medical Aesthetics | laageless.com | 1 |
| 7442 | Medical Associates of RI | medassociatesofri.com | 2 |
| 7443 | Cancun Hair Restoration | cancunhairrestoration.com | 1 |
| 7444 | Humanitas Research Hospital | humanitas.it | 10 |
| 7445 | Academic Hospital | academichospital.com.tr | 1 |
| 7446 | Bahri Orthopedics & Sports Medicine Clinic | jacksonvilleorthopaedicsurgeon.com | 2 |
| 7447 | Element Wellness Center | elementwellness.me | 1 |
| 7448 | MD Pain | mdpain.clinic | 1 |
| 7449 | Natural Health & Healing Center | naturalhealthgr.com | 1 |
| 7450 | Chiropractic Wellness Center | drlemons.com | 1 |
| 7451 | Fusion Health APC | fusionhealthapc.com | 2 |
| 7452 | Luxury Medical Spa | luxurymedicalspa.com | 1 |
| 7453 | K2 Medical & Dental Clinic | com.pl | 1 |
| 7454 | Advanced Orthopedics & Sports Medicine | aosmlv.com | 1 |
| 7455 | AZ Regenerative Medicine | azregenmed.com | 1 |
| 7456 | Beautiful You Medical Spa | beautifulyoumedspa.com | 1 |
| 7457 | Center for Complex Pain Care | centerforcomplexpaincare.com | 1 |
| 7458 | Cold laser therapy Advanced Regeneration Medspa Natural healing cold laser soft tissue repair pain management | oklahomacitymedspa.net | 1 |
| 7459 | Health and Wellness Clinic at Lexington Diagnostic Center | healthandwellnesslexington.com | 1 |
| 7460 | Infinite Health Integrative Medicine Center | yourinfinitehealth.com | 1 |
| 7461 | Muela Dental Tijuana | mueladental.com | 1 |
| 7462 | All-Star Orthopaedics | allstarortho.com | 5 |
| 7463 | Anti-Aging Center | antiagingcenterorlando.com | 1 |
| 7464 | Coastal Orthopedics | coastalorthoteam.com | 1 |
| 7465 | Interventional Pain Institute | interventionalpain.com | 1 |
| 7466 | Medical Care Clinic | medicalcareclinic.org | 1 |
| 7467 | Healthspan of Hampton Roads | healthspanofhamptonroads.com | 1 |
| 7468 | Montgomery Dermatology | montgomerydermatology.com | 1 |
| 7469 | Infinity Regenerative Medicine | infinityregenmed.com | 2 |
| 7470 | Integrative Physical Therapy And Spine Treatment Center | iptalaska.com | 1 |
| 7471 | Maison Epigenetic | maisonepigenetic.com | 1 |
| 7472 | Stem Cell Therapy Institute | institutestemcell.com | 1 |
| 7473 | Regenerative PRP | regenerativeprp.com | 2 |
| 7474 | Philadelphia PRP and Stem Cell Institute | phillysportsdoc.com | 2 |
| 7475 | Windsong | windsongwny.com | 1 |
| 7476 | Kalos Health | livekalos.com | 1 |
| 7477 | Austin Medicine | austinmedicineclinic.com | 1 |
| 7478 | Drip Hydration | driphydration.com | 1 |
| 7479 | Dallas Medical Center | dallasmedcenter.com | 1 |
| 7480 | Advanced Body Scan | advancedbodyscan.com | 1 |
| 7481 | Cryohealthcare | cryohealthcare.com | 1 |
| 7482 | The Woodlands Institute for Health & Wellness | woodlandswellnessmd.com | 1 |
| 7483 | The Wellness Bar | thewellnessbaraz.com | 1 |
| 7484 | Recovery 1 Denver | recovery1denver.com | 1 |
| 7485 | SWEATHOUZ | swthzdalycity.com | 1 |
| 7486 | Live Lean Rx Houston | liveleanrxhouston.com | 1 |
| 7487 | Advanced Medical Centers | amcvirginia.com | 1 |
| 7488 | Advanced NeuroSpine Pain Management and Neurology | easemypainva.com | 1 |
| 7489 | Advanced Regenerative Orthopedics | advancedregenerativeorthopedics.com | 1 |
| 7490 | Advanced Regenerative Orthopedics | aropainfree.com | 1 |
| 7491 | Ageless Health | stemcellhenderson.com | 1 |
| 7492 | Allure Aesthetics | myallurespa.com | 1 |
| 7493 | ALTR Performance & Physical Therapy | altrperformance.com | 1 |
| 7494 | American Regenerative Medicine Institute | americanmalewellness.com | 1 |
| 7495 | Anton Matveev, MD, RMSK | pwcentermd.com | 1 |
| 7496 | Awakened Purpose: Naturally Integrated Health & Wellness | practicebetter.io | 1 |
| 7497 | Baja California Stem Cell Therapy | stem-cells-mexico.com | 1 |
| 7498 | Bakersfield Lymphatic Drainage, Oncology, Contouring Massage, and Post Op Care Center by O-Wellness. | ortizwellness.com | 1 |
| 7499 | Bakios Stephen N Dr | miriamhospital.org | 1 |
| 7500 | Blue Ridge Free Clinic | blueridgefreeclinic.org | 1 |
| 7501 | Bradley Chiropractic Center LLC | bradleychirocenter.com | 1 |
| 7502 | Brie Cure Aesthetics New Orleans | supportivwellness.com | 1 |
| 7503 | Buffalo Center for Anaplastology | bcaprosthetics.com | 1 |

## Guardrail Ambiguous

| location_id | location_name | domain | reason |
| --- | --- | --- | --- |
| 2177 | BodyScan City | bodyview.co.uk | no_shared_obvious_brand_token |
| 2178 | BodyView Birmingham | bodyview.co.uk | no_shared_obvious_brand_token |
| 2179 | BodyView Manchester | bodyview.co.uk | no_shared_obvious_brand_token |
| 2523 | Fountain Life New York | flt.life | known_mixed_brand_domain_flt_life |
| 2528 | Next Health - New York City | flt.life | known_mixed_brand_domain_flt_life |
| 2530 | Longevity Center Poland | flt.life | known_mixed_brand_domain_flt_life |
| 2537 | Levitas - London | flt.life | known_mixed_brand_domain_flt_life |
| 2552 | Osler Health | flt.life | known_mixed_brand_domain_flt_life |
| 2553 | Healthy Longevity Clinic - Prague | flt.life | known_mixed_brand_domain_flt_life |
| 2554 | YEARS | flt.life | known_mixed_brand_domain_flt_life |
| 2556 | Mayo Clinic Executive Health - Rochester, Minnesota | mayoclinic.org | no_shared_obvious_brand_token |
| 2557 | Mayo Clinic Executive Health - Scottsdale, Arizona | mayoclinic.org | no_shared_obvious_brand_token |
| 2558 | Mayo Clinic Executive Health - Jacksonville, Florida | mayoclinic.org | no_shared_obvious_brand_token |
| 2559 | Mayo Clinic Executive Health - London, United Kingdom | mayoclinic.org | no_shared_obvious_brand_token |
| 9723 | Blood & Marrow Transplant | mayoclinic.org | no_shared_obvious_brand_token |
| 10694 | Mayo Clinic CAR-T Cell Therapy Program | mayoclinic.org | no_shared_obvious_brand_token |
| 13423 | Mayo Clinic Executive Health | mayoclinic.org | no_shared_obvious_brand_token |
| 3514 | Ageless Health | fitfutureclinic.com | no_shared_obvious_brand_token |
| 11703 | Roanoke Semaglutide Injections Center | fitfutureclinic.com | no_shared_obvious_brand_token |
| 4583 | Chicago Stem Cell Therapy and Pain Management Institute | chicagostemcelltherapy.com | no_shared_obvious_brand_token |
| 8274 | Pain Management Institute | chicagostemcelltherapy.com | no_shared_obvious_brand_token |
| 11068 | Pain Relief Laser Center • Madison Central | chicagostemcelltherapy.com | no_shared_obvious_brand_token |
| 11073 | Pain Therapy USA | chicagostemcelltherapy.com | no_shared_obvious_brand_token |
| 4818 | Channel Islands Surgery Center – Dignity Health – Oxnard, CA | commonspirit.org | no_shared_obvious_brand_token |
| 5511 | Marian Pain Management – Dignity Health – Santa Maria, CA | commonspirit.org | no_shared_obvious_brand_token |
| 5989 | CHI Memorial Physical Therapy at Hamilton Family YMCA | commonspirit.org | no_shared_obvious_brand_token |
| 6770 | Dignity Health Medical Group – Stockton | commonspirit.org | no_shared_obvious_brand_token |
| 7780 | Dignity Health Advanced Imaging – Elk Grove | commonspirit.org | no_shared_obvious_brand_token |
| 9350 | Imaging & Diagnostic Procedures - The Woodlands, TX | commonspirit.org | no_shared_obvious_brand_token |
| 6898 | Precision Regenerative Medicine | precisionmedprp.com | no_shared_obvious_brand_token |
| 11168 | Precision Regenerative Medicine | precisionmedprp.com | no_shared_obvious_brand_token |
| 12342 | Tammy J. Penhollow, DO | precisionmedprp.com | no_shared_obvious_brand_token |
| 7077 | Clinic 5C \| Functional Medicine | clinic5c.com | no_shared_obvious_brand_token |
| 7078 | Clinic 5C \| Functional Medicine | clinic5c.com | no_shared_obvious_brand_token |
| 7079 | Clinic 5C \| Functional Medicine | clinic5c.com | no_shared_obvious_brand_token |
| 9925 | Clinica Bienestar Familiar | clinic5c.com | no_shared_obvious_brand_token |
| 9927 | Clinica Latina Divino Nazareno | clinic5c.com | no_shared_obvious_brand_token |
| 7184 | Miami Stem Cell | stemcellmia.com | no_shared_obvious_brand_token |
| 7185 | Miami Stem Cell | stemcellmia.com | no_shared_obvious_brand_token |
| 7186 | Miami Stem Cell | stemcellmia.com | no_shared_obvious_brand_token |
| 7865 | Michael Bombardier | stemcellmia.com | no_shared_obvious_brand_token |
| 10751 | Michael Becker, MD | stemcellmia.com | no_shared_obvious_brand_token |
| 10752 | Michael Bombardier | stemcellmia.com | no_shared_obvious_brand_token |
| 7738 | Center MedSpa | centermedspa.com | no_shared_obvious_brand_token |
| 9870 | Central Alabama Pain Management Center permanently CLOSED | centermedspa.com | no_shared_obvious_brand_token |
| 9871 | Central Arkansas Radiation Therapy Institute | centermedspa.com | no_shared_obvious_brand_token |
| 9520 | Ageless Solutions Nashville | agelesssolutionsnashville.com | no_shared_obvious_brand_token |
| 9526 | AgeWise Performance Clinic \| Hormone Replacement Therapy- HRT \| Stem Cell Therapy Garland | agelesssolutionsnashville.com | no_shared_obvious_brand_token |
| 9819 | Carolina Center for Occupational Health | concentra.com | no_shared_obvious_brand_token |
| 9956 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9957 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9958 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9959 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9960 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9961 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9962 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9963 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9964 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 9965 | Concentra Urgent Care | concentra.com | no_shared_obvious_brand_token |
| 10728 | Melaney A. Caldwell | puremednj.com | no_shared_obvious_brand_token |
| 10729 | Memorial Medical Center Infusion Center | puremednj.com | no_shared_obvious_brand_token |
| 11133 | Physicians Wellness | rymaps.xyz | no_shared_obvious_brand_token |
| 11475 | Regen Rx, PLLC | rymaps.xyz | no_shared_obvious_brand_token |
| 11145 | Pivot PT-Richmond (Midlothian), an Athletico company | pivotphysicaltherapy.com | no_shared_obvious_brand_token |
| 11146 | Pivot PT-Richmond (Westhampton), an Athletico company | pivotphysicaltherapy.com | no_shared_obvious_brand_token |
| 11147 | Pivot PT-Wilmington (Foulkstone), an Athletico company | pivotphysicaltherapy.com | no_shared_obvious_brand_token |
| 11154 | Plymouth Neuropathy & Regenerative Care | pivotphysicaltherapy.com | no_shared_obvious_brand_token |
| 11375 | Regenerative Centers of Maryland | rbiverobeach.com | no_shared_obvious_brand_token |
| 11376 | Regenerative Clinic (Pain Management Dr) | rbiverobeach.com | no_shared_obvious_brand_token |
| 11377 | Regenerative Health, Beverly Hills | rbiverobeach.com | no_shared_obvious_brand_token |
| 11379 | Regenerative Health Centers of Florida | rbiverobeach.com | no_shared_obvious_brand_token |
| 11380 | Regenerative Health Centers of Florida | rbiverobeach.com | no_shared_obvious_brand_token |
| 11381 | Regenerative Health Centers of Florida | rbiverobeach.com | no_shared_obvious_brand_token |
| 11382 | Regenerative Health Group | restorehealthaz.com | no_shared_obvious_brand_token |
| 11384 | Regenerative Health Medicine of St. Louis | restorehealthaz.com | no_shared_obvious_brand_token |
| 11407 | Regenerative Medicine & Biologics | rmbinstitute.com | no_shared_obvious_brand_token |
| 11409 | Regenerative Medicine & Stem Cell Therapy | rmbinstitute.com | no_shared_obvious_brand_token |
| 11414 | Regenerative Medicine Doctors of Florida | rmbinstitute.com | no_shared_obvious_brand_token |
| 11415 | Regenerative Medicine Doctors of Florida | rmbinstitute.com | no_shared_obvious_brand_token |
| 11416 | Regenerative Medicine Institute | rmi-international.com | no_shared_obvious_brand_token |
| 11419 | Regenerative Medicine Institute of Nevada | rmi-international.com | no_shared_obvious_brand_token |
| 11422 | Regenerative Medicine of Michigan | rmi-international.com | no_shared_obvious_brand_token |
| 11423 | Regenerative Medicine of New England | rmi-international.com | no_shared_obvious_brand_token |
| 11424 | Regenerative Medicine of New Jersey | rmi-international.com | no_shared_obvious_brand_token |
| 11426 | Regenerative Medicine of Texas | mesquitechiro.com | no_shared_obvious_brand_token |
| 11428 | Regenerative Orthopedics and Pain Management | mesquitechiro.com | no_shared_obvious_brand_token |
| 11496 | Rejuvenate Wellness Center | rejuvenatewellnesscenter.co | no_shared_obvious_brand_token |
| 11500 | Rejuveneer | rejuvenatewellnesscenter.co | no_shared_obvious_brand_token |
| 11588 | Restore Health | restorehealthnebraska.com | no_shared_obvious_brand_token |
| 12241 | Stephen E. Newburn, DC | restorehealthnebraska.com | no_shared_obvious_brand_token |
| 11994 | SoftWave Therapy Lincoln | softwavelincoln.com | no_shared_obvious_brand_token |
| 12003 | Solutions Infusion Therapy | softwavelincoln.com | no_shared_obvious_brand_token |
| 12156 | Stem Cell Centers of Colorado | stemcelldoctorsbeverlyhills.com | no_shared_obvious_brand_token |
| 12157 | Stem Cell Centers of Fairfax | stemcelldoctorsbeverlyhills.com | no_shared_obvious_brand_token |
| 12158 | Stem Cell Centers of the Palm Beaches | stemcelldoctorsbeverlyhills.com | no_shared_obvious_brand_token |
| 12159 | Stem Cell Doctors Of Beverly Hills | stemcelldoctorsbeverlyhills.com | no_shared_obvious_brand_token |
| 12162 | STEM CELL GENETIC MED | stemcelldoctorsbeverlyhills.com | no_shared_obvious_brand_token |
| 12166 | Stem Cell International | stemcellinternational.org | no_shared_obvious_brand_token |
| 12167 | Stem Cell International | stemcellinternational.org | no_shared_obvious_brand_token |
| 12168 | Stemcellix | stemcellinternational.org | no_shared_obvious_brand_token |
| 12170 | Stemcelllife LLC | stemcellinternational.org | no_shared_obvious_brand_token |
| 12174 | Stem Cell Pain Management Clinics of South Florida | stemcellinternational.org | no_shared_obvious_brand_token |
| 12214 | Stem Cell Therapy Tijuana Mexico | stemcellmexico.org | no_shared_obvious_brand_token |
| 12217 | Stem Cell Treatment for Fibromyalgia | stemcellmexico.org | no_shared_obvious_brand_token |
| 13320 | Wisconsin Stem Cell Institute | wistemcell.com | no_shared_obvious_brand_token |
| 13324 | Women’s Cancer & Wellness Center | wistemcell.com | no_shared_obvious_brand_token |

## Renamed Orgs

| org_id | old_name | new_name |
| --- | --- | --- |
| 1472 | Prenuvo Clinic - Atlanta, GA | Prenuvo Clinic |
| 2191 | Greater Therapy Centers – Plano, TX | Greater Therapy Centers |
| 1513 | Dexascans.com - Jacksonville, FL | Dexascans.com |
| 2753 | Holsman Physical Therapy – Newark, NJ | Holsman Physical Therapy |
| 912 | Regenerative Pain & Sports Medicine - New York, NY | Regenerative Pain & Sports Medicine |
| 3839 | Empower U – Sioux Falls, SD | Empower U |
| 2401 | Dr. Burkenstock’s – Skin Body Health – Med Spa – New Orleans, LA | Dr. Burkenstock's Skin Body Health Med Spa |
| 849 | Maze Laboratories - Harrison, NY | Maze Laboratories |
| 5294 | Regenerative Stemwave Therapy Center – Brentwood, TN | Regenerative Stemwave Therapy Center |

## Blain's Review

Org 4470 was not renamed. Locations hidden: 2.

## Acceptance

```json
{
  "elitra_health": {
    "child_count": 1,
    "non_elitra_website_count": 1,
    "non_elitra_examples": [
      {
        "id": 8,
        "name": "Elitra Health",
        "website": "https://www.google.com/maps/place/?q=place_id:ChIJ10_aSxlawokRZZm6EuNuwVw"
      }
    ]
  },
  "new_org_domain_conflicts": []
}
```

Full details are in `org-dedup-phase2-report-20260707.dry-run.json`.
