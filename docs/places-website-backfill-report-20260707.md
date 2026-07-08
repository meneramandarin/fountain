# Places Website Backfill Report

Generated: 2026-07-08T00:48:20.305Z
Mode: EXECUTED
Field mask: `id,displayName,websiteUri,nationalPhoneNumber`

## Summary

| metric | count |
| --- | --- |
| candidates | 331 |
| cached_hits | 0 |
| api_calls_made | 0 |
| matches_written | 323 |
| mismatches_flagged | 4 |
| no_website | 4 |
| fetch_errors | 0 |
| rymaps_nulled | 2 |
| relinked | 88 |
| new_orgs_created | 214 |
| new_org_locations | 220 |
| org_guardrail | 9 |
| refreshed_locations | 329 |
| estimated_api_cost_before_free_usd | 6.62 |
| estimated_api_cost_after_free_allowance_usd | 0 |

## Inventory

| metric | value |
| --- | --- |
| candidates | 331 |
| cached_hits_with_website | 0 |
| api_calls_required | 331 |
| estimated_api_cost_before_free_usd | 6.62 |
| estimated_api_cost_after_free_allowance_usd | 0 |
| free_enterprise_calls_estimate | 1000 |
| rymaps_locations_to_null | 2 |

## Backup and Audit Tables

- fountain_raw.locations_backup_20260707_places_website_backfill
- fountain_raw.organizations_backup_20260707_places_website_backfill
- fountain_raw.places_website_backfill_location_actions_20260707
- fountain_raw.places_website_backfill_org_map_20260707
- fountain_raw.places_website_backfill_new_orgs_20260707
- fountain_raw.places_website_backfill_guardrail_20260707

## Mismatches

| location_id | location_name | api_display_name | returned_website | score |
| --- | --- | --- | --- | --- |
| 43 | QC NY SPA | QC Spa New York | https://www.qcny.com/ | 0 |
| 621 | Sports, Pain​ & Regenerative Institute - Fairview | SPR Institute | https://www.sprinstitute.com/ | 0 |
| 1010 | Endure Health and Wellness: Weight Loss, Testosterone, ED, PE, Vitamin Shot, NAD+ | Endure Health Direct Primary Care, LLC | https://endure-health.com/ | 0.3333333333333333 |
| 1061 | Vitalist Healing Traditions - Dr. Carina Lopez - Your 'Holistic Doctor Near Me' - Naturopathic Doctor NYC | VHT Society | https://www.vitalisthealingtraditions.com/ | 0 |

## No Website Returned

| location_id | location_name | api_display_name |
| --- | --- | --- |
| 188 | REVIV New York - IV Therapy \| NAD+ \| B12 Shots \| Glutathione | Alive New York - Mobile IV Therapy \| Peptides |
| 313 | CryoBodyBK - Brooklyn Cryotherapy Spa | CryoBodyBK - Brooklyn Cryotherapy Spa |
| 741 | Bare Aesthetics NJ | Bare Aesthetics NJ |
| 1111 | Warren J. Bleiweiss, MD | Warren J. Bleiweiss, MD |

## New Orgs Created

| org_id | canonical_name | website_domain | locations |
| --- | --- | --- | --- |
| 8338 | Advanced Holistic Center | advancedholisticcenter.com | 2 |
| 8339 | IV DRIPS | ivdrips.com | 2 |
| 8340 | Tribeca Spa of Tranquility | tribecaspanyc.com | 1 |
| 8341 | Serenity Natural Health | serenitynaturalhealth.com | 1 |
| 8342 | Kollectiv | kollectivnyc.com | 1 |
| 8343 | Cortisone Shot Specialists Brooklyn | downtownpainphysicians.com | 1 |
| 8344 | Clinique YFT | cliniqueyft.com | 1 |
| 8345 | Russian & Turkish Baths | russianturkishbaths.com | 1 |
| 8346 | Lov MedSpa New York | lovmedspa.com | 1 |
| 8347 | Tanuj P. Palvia, MD | motionis.health | 1 |
| 8348 | Ageless Skin & Body Solutions | agelessskinbody.com | 1 |
| 8349 | Dr. Syra Aesthetics & Longevity Institute | syraaesthetics.com | 1 |
| 8350 | Tree of Life Acupuncture | newyorkacupuncturecenter.com | 1 |
| 8351 | Clear Laser Skin Clinic Jersey City | clearlaserskin.com | 1 |
| 8352 | LIFEDRIPS.IV | lifedripsiv.com | 1 |
| 8353 | Simplicity Health Associates | simplicityhealthassociates.com | 1 |
| 8354 | FICS by PRTL | prtl.com | 1 |
| 8355 | Maha Rose | maharose.com | 1 |
| 8356 | chi4life | chi4life.org | 1 |
| 8357 | Raine n River Apothecary | rainenriver.com | 1 |
| 8358 | om.life Wellness * Modern Recovery Spa | om.life | 1 |
| 8359 | Doctor K Private Medicine | doctork.nyc | 1 |
| 8360 | OsteoStrong NYC Flatiron | manhattanbonehealth.com | 1 |
| 8361 | Drip Alchemy NYC | dripalchemynyc.com | 1 |
| 8362 | Emèlle Restorative Medicine, P.C. | emellemd.com | 1 |
| 8363 | Riverpoint Wellness Group | riverpointwellness.com | 1 |
| 8364 | Lift / Next Level Floats | liftfloats.com | 1 |
| 8365 | Hello Hydration | hellohydrationnj.com | 1 |
| 8366 | Zen Om Studio | zenomstudio.com | 1 |
| 8367 | Elevate Holistics | elevate-holistics.com | 1 |
| 8368 | Elite Aesthetics | eliteaestheticsnyc.com | 1 |
| 8369 | Peak By MD | peakbymd.com | 1 |
| 8370 | N4 Esthetic Clinic | n4estheticclinic.com | 1 |
| 8371 | Flora Naturopathics - Holistic Medicine | floranaturopathics.com | 1 |
| 8372 | ShemaYah Holistic Health | shemayahholistichealth.com | 1 |
| 8373 | NY Center for Functional Medicine | nyfunctionalmed.org | 1 |
| 8374 | Olympus Center for Holistic Integrative Medicine | olympuscenter.com | 1 |
| 8375 | NY Center For Integrative Health | nycintegrative.com | 1 |
| 8376 | The Gael Center: William Gael, MD | drwilliamgael.com | 1 |
| 8377 | Doody Free Girl | doodyfreegirl.com | 1 |
| 8378 | Anima Mundi Apothecary | animamundiherbals.com | 1 |
| 8379 | The SPA Club | thespaclub.com | 1 |
| 8380 | Blossom Pediatrics PC | blossompediatrics.com | 1 |
| 8381 | Kahuna Skin Clinic | kahunaskinclinic.com | 1 |
| 8382 | cityWell brooklyn | citywellbrooklyn.com | 1 |
| 8383 | BeRejuved Medical Spa & Wellness Studio - NYC | berejuved.com | 1 |
| 8384 | Purely Natural Medical Spa | purelynaturalspa.com | 1 |
| 8385 | Aura Wellness Spa | spa-aura.com | 1 |
| 8386 | Dr. Sarah Cimperman, ND | drsarahcimperman.com | 1 |
| 8387 | Dr. Susan Eisen, D.C. | drsusaneisen.com | 1 |
| 8388 | EKAH - Erin Kumpf Acupuncture & Herbs | ekahlife.com | 1 |
| 8389 | Birchwell Functional Medicine - Integrative Health & Holistic Nutrition | birchwell.clinic | 1 |
| 8390 | Elena Klimenko, MD - Functional Medicine | drelenaklimenko.com | 1 |
| 8391 | Studio 17 Cosmetics & Wellness | studio17cw.com | 1 |
| 8392 | Skin30.co / Skin Longevity Clinic | skinlongevityclinic.com | 1 |
| 8393 | Your Health Success | yourhealthsuccess.com | 1 |
| 8394 | Neighborhood Natural Medicine | neighborhoodnaturalmedicine.com | 1 |
| 8395 | Anti-Aging Medical Group | antiagingmedicalgroup.com | 1 |
| 8396 | Park Slope Integrative Medicine PLLC | drchiniwala.com | 1 |
| 8397 | +advitam® | myadvitam.com | 1 |
| 8398 | Balance Regenerative, Sports, and Rehabilitation Medicine | balancebklyn.com | 1 |
| 8399 | NYC Hormone Replacement Therapy Doctor | hormonereplacementdoctor.com | 1 |
| 8400 | Mobile IV Drip | mobileivdrip.com | 1 |
| 8401 | BNC Homeopathy Vitamins & Herbals | onlinehomeopathyusa.com | 1 |
| 8402 | Madison Health NY - NY Health & Wellness Clinic Specializing in Testosterone Replacement Therapy | madisonhealthny.com | 1 |
| 8403 | Holistic Medical Five | acuptnyc.com | 2 |
| 8404 | Château Glow East Williamsburg | chateauglowskin.com | 1 |
| 8405 | TSM Healing Center | tsmhealingcenter.com | 1 |
| 8406 | E-MOTION PHYSICAL THERAPY & WELLNESS | e-motionpt.com | 1 |
| 8407 | Drip Doc IV Infusion & Wellness | dripdocwellness.com | 1 |
| 8408 | KUR Skin Lab | kurskinlab.com | 1 |
| 8409 | Evolved Science | eshealth.com | 1 |
| 8410 | Aleksander Kanevsky, DC - Chiropractic & Functional Medicine | atlantchiropractic.com | 1 |
| 8411 | Functional Chiropractic and Nutrition Associates, Inc. | functionalchirojc.com | 1 |
| 8412 | Dr. Susan Cucchiara, Naturopathic Doctor NYC | naturallysue.com | 1 |
| 8413 | Age Management and Skin care | agemanagment.com | 1 |
| 8414 | The Jersey City Clinic | jerseycitynj.gov | 1 |
| 8415 | FRESH Medicine Dr. Robert Graham, MD | freshmednyc.com | 1 |
| 8416 | Dr. Howard Robins, DPM | ozonedoctor.net | 1 |
| 8417 | IV Drip Therapy | rebalancenyc.com | 1 |
| 8418 | OsteoStrong Park Ave | osteonewyorkcity.com | 1 |
| 8419 | L'Elite MediSpa and Wellness BK | lelitemedispa.com | 1 |
| 8420 | Comite Center for Precision Medicine & Healthy Longevity | comitemd.com | 1 |
| 8421 | EHormones MD | ehormones.com | 1 |
| 8422 | Geb Hetep Wholistic Center | gebhetep.com | 1 |
| 8423 | Dr. Robin Unger | drrobinunger.com | 1 |
| 8424 | Best IV Drips- Mobile IV Therapy | bestivdrips.com | 2 |
| 8425 | Brooklyn Bathhouse | brooklynbathhouse.nyc | 1 |
| 8426 | Inga Zilberstein, MD | drzilberstein.com | 1 |
| 8427 | Liondale Medical | liondalemedical.com | 1 |
| 8428 | OsteoStrong Upper West | osteonewyork.com | 1 |
| 8429 | Generational Health by Adult Health | generationalhealthbyadulthealth.org | 1 |
| 8430 | Unique Clinique Aesthetics | uniquecliniqueaesthetics.com | 1 |
| 8431 | Live Holistic | liveholistic.net | 1 |
| 8432 | Bioidentical Hormones NYC | bioidenticalhormones.nyc | 1 |
| 8433 | Artisans Aesthetics | artisansaesthetics.com | 1 |
| 8434 | Prime Infusions - Brooklyn Infusion Center | primeinfusions.com | 1 |
| 8435 | Drip Gym - Jackson Heights | dripgym.com | 1 |
| 8436 | Doctor Selassie at the New Flower Center for Naturopathic Medicine | doctorselassie.com | 1 |
| 8437 | Arctic Cryotherapy Bayonne | arcticcryotherapybayonne.com | 1 |
| 8438 | Larisa N. Likver, MD | drlikver.com | 1 |
| 8439 | WORLD SPA | worldspa.com | 1 |
| 8440 | Oxygen Clinic - Hyperbaric Oxygen Therapy Facility | oxygenclinicny.com | 1 |
| 8441 | Una Aesthetics | unaaesthetics.com | 1 |
| 8442 | SYLK MEDSPA | sylkmedspa.com | 1 |
| 8443 | Amita Holistic Healing Center | amitausa.com | 1 |
| 8444 | Temple of Wellness | templeofwellness.com | 1 |
| 8445 | The Center for Medical Healing | thecenterformedicalhealing.com | 1 |
| 8446 | Ironbound Physical Therapy & Wellness | ironboundptwellness.com | 1 |
| 8447 | Harmonious Life with FNP Marina Moiseyeva | liveharmoniouslife.com | 1 |
| 8448 | Time2Drip - MedSpa | time2drip.com | 1 |
| 8449 | HealthierU Natural Nutritionist Brooklyn | healthieruny.com | 1 |
| 8450 | Vitality Health Group | vitalityhealthgroup.com | 1 |
| 8451 | Shore Parkway Wellness | shoreparkwaywellness.net | 1 |
| 8452 | MedLou Drips | medloucare.com | 1 |
| 8453 | Kearny Wellness | kearnywellness.com | 1 |
| 8454 | Ironbound Acupuncture and Wellness | ironboundacu.com | 1 |
| 8455 | Body Luxe Day Spa | bodyluxdayspa.com | 1 |
| 8456 | BeAti Acupuncture Wellness Clinic | careacu.com | 1 |
| 8457 | Paukman Bioage Clinic | paukmanbioageclinic.com | 1 |
| 8458 | Boris Bobyr NP - Hormone Replacement Therapy Center | borisbobyrnp.com | 2 |
| 8459 | Dr. Olga Zilberstein Medical Aesthetics Brooklyn | drolgaz.com | 1 |
| 8460 | Natural Essential Wellness, LLC | naturalessentialwellness.net | 1 |
| 8461 | Brooklyn Integrative Medicine | brooklynintegrativemedicine.com | 1 |
| 8462 | Inspire Health | inspirehealthpro.com | 1 |
| 8463 | Inspire Med Spa | inspiremedspa.com | 1 |
| 8464 | Geria Dermatology - Rutherford | geriadermatology.com | 1 |
| 8465 | Healing Touch IV | healingtouchiv.com | 1 |
| 8466 | Humaira Quraishi ND, MS | natureshum.net | 1 |
| 8467 | Functional Wellness Medical Care | drhamzajalal.com | 1 |
| 8468 | Juventee | juventee.com | 1 |
| 8469 | Zia Communications, Sales of cryotherapy chambers, fitness and spa equipment | vacuactivus.com | 1 |
| 8470 | The Lennard Clinic | thelennardclinic.org | 1 |
| 8471 | MULTIVITA IV | multivitaiv.com | 1 |
| 8472 | Spa Castle New York | spacastleusa.com | 1 |
| 8473 | Dr. Natasha Fuksina AstraMDhealth Functional, Internal And Obesity Medicine Bioidentical Hormones | astramdhealth.com | 1 |
| 8474 | New York Spa & Sauna | nyspasauna.com | 1 |
| 8475 | Your Natural Path to Health Clinic | njnaturopath.com | 1 |
| 8476 | Health N Wellness Rx | healthnwellnessrx.com | 1 |
| 8477 | Herboganic Retail | herboganic.com | 1 |
| 8478 | Alternative Health Center PC | alternativehealthcenter.com | 1 |
| 8479 | Stunning Med Spa | stunningmedspas.com | 1 |
| 8480 | Pearl Wellness and Detox | pearlwellnessdetox.com | 1 |
| 8481 | Quantum Integrative Medicine, LLC - Monica J Johnson, DC, NP-C, L.Ac | quantumintegrativemed.com | 1 |
| 8482 | Longevity | longevitynj.com | 1 |
| 8483 | AliveDrip Montclair | alivedripmedical.com | 1 |
| 8484 | Anti-Aging and Metabolic Health Clinic | aamhclinic.com | 1 |
| 8485 | ShiCares MedSpa | shicaresmedspa.com | 1 |
| 8486 | Lewis Holistic Healing Institute | drlisalewis.com | 1 |
| 8487 | Whole Body Natural Wellness Center, LLC | drchante.com | 1 |
| 8488 | Infusion Center of NJ | infusioncenterofnj.com | 1 |
| 8489 | REVIVE Body Mind Cryotherapy & Halotherapy | revivebodymind.com | 1 |
| 8490 | Holistic Naturopathic Center | holisticnaturopath.com | 1 |
| 8491 | Holistic Pain Relief and Weight Loss Center | holisticpainreliefandweightlosscenter.com | 1 |
| 8492 | Onyx Aesthetics & Sports Medicine | onyxaasm.com | 1 |
| 8493 | Feel Natural Wellness Center | feelnaturalwellnesscenter.com | 1 |
| 8494 | True Bliss Medical Aesthetics and Wellness | trueblissmedical.com | 1 |
| 8495 | Refresh Clinic | refreshclinic.com | 1 |
| 8496 | IV Hydrate Cafe | ivhydratecafe.com | 1 |
| 8497 | Anti-aging and Weight loss | sunwellness.info | 1 |
| 8498 | Testosterone Replacement Therapy Specialists | trtspecialistnj.com | 1 |
| 8499 | VitaMineral IV Therapy | vitamineralivtherapy.com | 1 |
| 8500 | BRC Day Spa & Sauna Resort | brc-spa.com | 1 |
| 8501 | Bergen Total Health | bergentotalhealth.com | 1 |
| 8502 | Integrative Medicine of New Jersey | integrativemedicineofnj.com | 1 |
| 8503 | Cryo Energy | cryonrg.com | 1 |
| 8504 | Advanced Integrated Health - Holistic & Functional Medicine | advancedintegratedhealth.com | 1 |
| 8505 | Tideline Center for Health & Aesthetics | tidelinehealth.net | 1 |
| 8506 | Elysium Aesthetics and Vein Care: David Singh, MD | elysiumveincare.com | 1 |
| 8507 | Reset Float | resetfloat.com | 1 |
| 8508 | BouncebackIV Medspa | bouncebackiv.com | 1 |
| 8509 | Dr Radu Kramer MD - Integrative Medicine Associates - Comprehensive Healing | comprehensivehealingmd.com | 1 |
| 8510 | HeavenLee Float Spa | heavenleefloatspa.com | 1 |
| 8511 | Martin P. Goldman, MD & Jay A. Goldman, LAc. | jaygoldmanacupuncture.com | 1 |
| 8512 | Longevity Physical Therapy & Performance | longevityptperformance.com | 1 |
| 8513 | RxIV Infusions | rxivinfusions.com | 1 |
| 8514 | OsteoStrong Westfield NJ | osteostrongwestfield.com | 1 |
| 8515 | Balanced Health & Wellness | balancedhealthlb.com | 1 |
| 8516 | Integrative Med Solutions, Dr. Fred Lisanti | intmedsolutions.com | 1 |
| 8517 | Westchester Wellness Medicine | westchesterwellnessmedicine.com | 1 |
| 8518 | Regenerative Healing Center | regenerativehealingcenter.com | 1 |
| 8519 | KC Performance: High-Performance Health & Longevity for Former Athletes | kcperformanceny.com | 1 |
| 8520 | Dr. Michelle S. Yusupov | drmichnd.com | 1 |
| 8521 | prosperIV Yonkers | theprosperiv.com | 1 |
| 8522 | IVRevive | iv-revive.com | 1 |
| 8523 | Restoration Men's Health | restorationmenshealth.com | 1 |
| 8524 | Zeta Aesthetics NYC Westchester | zetaaestheticsnyc.com | 1 |
| 8525 | OsteoStrong Roslyn | osteostrongroslyn.com | 1 |
| 8526 | Within Natural Health | withinnaturalhealth.com | 1 |
| 8527 | Dr. Eric Landi Functional Medicine | drericlandi.com | 1 |
| 8528 | Infinite You Wellness Clinic | infiniteyouclinic.com | 1 |
| 8529 | Pod Spa and Wellness | podspas.com | 1 |
| 8530 | Dr. Poonam Desai | drpoonamdesai.com | 1 |
| 8531 | New Jersey HBOT | oxygennj.com | 1 |
| 8532 | Infused Health and Wellness | infusedhealthwellness.com | 1 |
| 8533 | Vitality TK Health | vitalitytkhealth.com | 1 |
| 8534 | Rescu | rescu.life | 1 |
| 8535 | Mindful Waters | mindfulwaters.com | 1 |
| 8536 | Amari Health Functional & Integrative Medicine | amarihealth.com | 1 |
| 8537 | IV Therapy Long Island At Home On Demand | ivtherapydemand.com | 1 |
| 8538 | Cloud Aquatic Float Parlor | cloudaquatic.com | 1 |
| 8539 | thebodybar | bodybar-ny.com | 1 |
| 8540 | Healthy Aging Medical Centers | newjerseyantiaging.com | 2 |
| 8541 | SeeBeyond Medicine - Scarsdale Integrative Medicine | seebeyondmedicine.com | 1 |
| 8542 | Jill Weintraub, MD | jillweintraubmd.com | 1 |
| 8543 | Iron Health Ardsley | ironhealth.co | 1 |
| 8544 | Hormone and Weight Loss Doctors of NJ | hormoneweightlossdoctorsnj.com | 1 |
| 8545 | The Functional Medicine Center of New Jersey | fmcofnj.com | 1 |
| 8546 | Cryo.BeautyBar | cryobeautybar.online | 1 |
| 8547 | Integrative Holistic Center | integrativeholisticcenter.com | 1 |
| 8548 | Hydration Medic Mobile and IV Spa | hydrationmedicny.com | 1 |
| 8549 | Aesthetics By KM | aestheticsbykm.com | 1 |
| 8550 | Dr Robert G. Silverman, DC. Westchester Integrative Health | drrobertsilverman.com | 1 |
| 8551 | Advanced Anti-Aging | advancedantiaging.com | 1 |

## Org Guardrail

| location_id | location_name | domain | reason |
| --- | --- | --- | --- |
| 140 | The Metaphysical Shoppe & Botanica | square.site | multiple_existing_orgs_share_domain |
| 344 | Santhigram Wellness | zoca.com | multiple_existing_orgs_share_domain |
| 346 | The DRIPBaR Manhattan | thedripbar.com | multiple_existing_orgs_share_domain |
| 546 | CryoHealLLC - Whole Body Cryotherapy | google.com | non_clinic_or_marketplace_domain |
| 1020 | ChillRx Cryotherapy Montclair | chillcryo.net | multiple_existing_orgs_share_domain |
| 1147 | Yasthetics and Wellness | square.site | multiple_existing_orgs_share_domain |
| 1175 | ChillRx Cryotherapy | chillcryo.net | multiple_existing_orgs_share_domain |
| 769 | Mary Eliza Mahoney Health Center | newarknj.gov | no_shared_obvious_brand_token |
| 777 | Newark Department of Health & Community Wellness | newarknj.gov | no_shared_obvious_brand_token |

## Acceptance

```json
{
  "active_maps_place_id_remaining_count": 4,
  "active_maps_place_id_remaining_sample": [
    {
      "id": 43,
      "name": "QC NY SPA",
      "website": "https://www.google.com/maps/place/?q=place_id:ChIJ6QzFjltbwokRhjgdHc01agI"
    },
    {
      "id": 621,
      "name": "Sports, Pain​ & Regenerative Institute - Fairview",
      "website": "https://www.google.com/maps/place/?q=place_id:ChIJW7uH43r3wokRhzvtDkWnNy0"
    },
    {
      "id": 1010,
      "name": "Endure Health and Wellness: Weight Loss, Testosterone, ED, PE, Vitamin Shot, NAD+",
      "website": "https://www.google.com/maps/place/?q=place_id:ChIJv9l6drGtw4kRnvOJS2IT1E0"
    },
    {
      "id": 1061,
      "name": "Vitalist Healing Traditions - Dr. Carina Lopez - Your 'Holistic Doctor Near Me' - Naturopathic Doctor NYC",
      "website": "https://www.google.com/maps/place/?q=place_id:ChIJpz3Qh1vywokRkDV1L1udjNY"
    }
  ],
  "remaining_explained_by_mismatch_or_fetch_error": true,
  "elitra_health_location_8": {
    "id": 8,
    "name": "Elitra Health",
    "website": "http://www.elitrahealth.com/",
    "org_id": 4,
    "org_name": "Elitra Health",
    "org_domain": "elitrahealth.com"
  },
  "new_org_domain_conflicts": []
}
```
