# Places Website Backfill Report

Generated: 2026-07-08T00:47:59.473Z
Mode: DRY_RUN_ROLLED_BACK
Field mask: `id,displayName,websiteUri,nationalPhoneNumber`

## Summary

| metric | count |
| --- | --- |
| candidates | 331 |
| cached_hits | 0 |
| api_calls_made | 331 |
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
| 8124 | Advanced Holistic Center | advancedholisticcenter.com | 2 |
| 8125 | IV DRIPS | ivdrips.com | 2 |
| 8126 | Tribeca Spa of Tranquility | tribecaspanyc.com | 1 |
| 8127 | Serenity Natural Health | serenitynaturalhealth.com | 1 |
| 8128 | Kollectiv | kollectivnyc.com | 1 |
| 8129 | Cortisone Shot Specialists Brooklyn | downtownpainphysicians.com | 1 |
| 8130 | Clinique YFT | cliniqueyft.com | 1 |
| 8131 | Russian & Turkish Baths | russianturkishbaths.com | 1 |
| 8132 | Lov MedSpa New York | lovmedspa.com | 1 |
| 8133 | Tanuj P. Palvia, MD | motionis.health | 1 |
| 8134 | Ageless Skin & Body Solutions | agelessskinbody.com | 1 |
| 8135 | Dr. Syra Aesthetics & Longevity Institute | syraaesthetics.com | 1 |
| 8136 | Tree of Life Acupuncture | newyorkacupuncturecenter.com | 1 |
| 8137 | Clear Laser Skin Clinic Jersey City | clearlaserskin.com | 1 |
| 8138 | LIFEDRIPS.IV | lifedripsiv.com | 1 |
| 8139 | Simplicity Health Associates | simplicityhealthassociates.com | 1 |
| 8140 | FICS by PRTL | prtl.com | 1 |
| 8141 | Maha Rose | maharose.com | 1 |
| 8142 | chi4life | chi4life.org | 1 |
| 8143 | Raine n River Apothecary | rainenriver.com | 1 |
| 8144 | om.life Wellness * Modern Recovery Spa | om.life | 1 |
| 8145 | Doctor K Private Medicine | doctork.nyc | 1 |
| 8146 | OsteoStrong NYC Flatiron | manhattanbonehealth.com | 1 |
| 8147 | Drip Alchemy NYC | dripalchemynyc.com | 1 |
| 8148 | Emèlle Restorative Medicine, P.C. | emellemd.com | 1 |
| 8149 | Riverpoint Wellness Group | riverpointwellness.com | 1 |
| 8150 | Lift / Next Level Floats | liftfloats.com | 1 |
| 8151 | Hello Hydration | hellohydrationnj.com | 1 |
| 8152 | Zen Om Studio | zenomstudio.com | 1 |
| 8153 | Elevate Holistics | elevate-holistics.com | 1 |
| 8154 | Elite Aesthetics | eliteaestheticsnyc.com | 1 |
| 8155 | Peak By MD | peakbymd.com | 1 |
| 8156 | N4 Esthetic Clinic | n4estheticclinic.com | 1 |
| 8157 | Flora Naturopathics - Holistic Medicine | floranaturopathics.com | 1 |
| 8158 | ShemaYah Holistic Health | shemayahholistichealth.com | 1 |
| 8159 | NY Center for Functional Medicine | nyfunctionalmed.org | 1 |
| 8160 | Olympus Center for Holistic Integrative Medicine | olympuscenter.com | 1 |
| 8161 | NY Center For Integrative Health | nycintegrative.com | 1 |
| 8162 | The Gael Center: William Gael, MD | drwilliamgael.com | 1 |
| 8163 | Doody Free Girl | doodyfreegirl.com | 1 |
| 8164 | Anima Mundi Apothecary | animamundiherbals.com | 1 |
| 8165 | The SPA Club | thespaclub.com | 1 |
| 8166 | Blossom Pediatrics PC | blossompediatrics.com | 1 |
| 8167 | Kahuna Skin Clinic | kahunaskinclinic.com | 1 |
| 8168 | cityWell brooklyn | citywellbrooklyn.com | 1 |
| 8169 | BeRejuved Medical Spa & Wellness Studio - NYC | berejuved.com | 1 |
| 8170 | Purely Natural Medical Spa | purelynaturalspa.com | 1 |
| 8171 | Aura Wellness Spa | spa-aura.com | 1 |
| 8172 | Dr. Sarah Cimperman, ND | drsarahcimperman.com | 1 |
| 8173 | Dr. Susan Eisen, D.C. | drsusaneisen.com | 1 |
| 8174 | EKAH - Erin Kumpf Acupuncture & Herbs | ekahlife.com | 1 |
| 8175 | Birchwell Functional Medicine - Integrative Health & Holistic Nutrition | birchwell.clinic | 1 |
| 8176 | Elena Klimenko, MD - Functional Medicine | drelenaklimenko.com | 1 |
| 8177 | Studio 17 Cosmetics & Wellness | studio17cw.com | 1 |
| 8178 | Skin30.co / Skin Longevity Clinic | skinlongevityclinic.com | 1 |
| 8179 | Your Health Success | yourhealthsuccess.com | 1 |
| 8180 | Neighborhood Natural Medicine | neighborhoodnaturalmedicine.com | 1 |
| 8181 | Anti-Aging Medical Group | antiagingmedicalgroup.com | 1 |
| 8182 | Park Slope Integrative Medicine PLLC | drchiniwala.com | 1 |
| 8183 | +advitam® | myadvitam.com | 1 |
| 8184 | Balance Regenerative, Sports, and Rehabilitation Medicine | balancebklyn.com | 1 |
| 8185 | NYC Hormone Replacement Therapy Doctor | hormonereplacementdoctor.com | 1 |
| 8186 | Mobile IV Drip | mobileivdrip.com | 1 |
| 8187 | BNC Homeopathy Vitamins & Herbals | onlinehomeopathyusa.com | 1 |
| 8188 | Madison Health NY - NY Health & Wellness Clinic Specializing in Testosterone Replacement Therapy | madisonhealthny.com | 1 |
| 8189 | Holistic Medical Five | acuptnyc.com | 2 |
| 8190 | Château Glow East Williamsburg | chateauglowskin.com | 1 |
| 8191 | TSM Healing Center | tsmhealingcenter.com | 1 |
| 8192 | E-MOTION PHYSICAL THERAPY & WELLNESS | e-motionpt.com | 1 |
| 8193 | Drip Doc IV Infusion & Wellness | dripdocwellness.com | 1 |
| 8194 | KUR Skin Lab | kurskinlab.com | 1 |
| 8195 | Evolved Science | eshealth.com | 1 |
| 8196 | Aleksander Kanevsky, DC - Chiropractic & Functional Medicine | atlantchiropractic.com | 1 |
| 8197 | Functional Chiropractic and Nutrition Associates, Inc. | functionalchirojc.com | 1 |
| 8198 | Dr. Susan Cucchiara, Naturopathic Doctor NYC | naturallysue.com | 1 |
| 8199 | Age Management and Skin care | agemanagment.com | 1 |
| 8200 | The Jersey City Clinic | jerseycitynj.gov | 1 |
| 8201 | FRESH Medicine Dr. Robert Graham, MD | freshmednyc.com | 1 |
| 8202 | Dr. Howard Robins, DPM | ozonedoctor.net | 1 |
| 8203 | IV Drip Therapy | rebalancenyc.com | 1 |
| 8204 | OsteoStrong Park Ave | osteonewyorkcity.com | 1 |
| 8205 | L'Elite MediSpa and Wellness BK | lelitemedispa.com | 1 |
| 8206 | Comite Center for Precision Medicine & Healthy Longevity | comitemd.com | 1 |
| 8207 | EHormones MD | ehormones.com | 1 |
| 8208 | Geb Hetep Wholistic Center | gebhetep.com | 1 |
| 8209 | Dr. Robin Unger | drrobinunger.com | 1 |
| 8210 | Best IV Drips- Mobile IV Therapy | bestivdrips.com | 2 |
| 8211 | Brooklyn Bathhouse | brooklynbathhouse.nyc | 1 |
| 8212 | Inga Zilberstein, MD | drzilberstein.com | 1 |
| 8213 | Liondale Medical | liondalemedical.com | 1 |
| 8214 | OsteoStrong Upper West | osteonewyork.com | 1 |
| 8215 | Generational Health by Adult Health | generationalhealthbyadulthealth.org | 1 |
| 8216 | Unique Clinique Aesthetics | uniquecliniqueaesthetics.com | 1 |
| 8217 | Live Holistic | liveholistic.net | 1 |
| 8218 | Bioidentical Hormones NYC | bioidenticalhormones.nyc | 1 |
| 8219 | Artisans Aesthetics | artisansaesthetics.com | 1 |
| 8220 | Prime Infusions - Brooklyn Infusion Center | primeinfusions.com | 1 |
| 8221 | Drip Gym - Jackson Heights | dripgym.com | 1 |
| 8222 | Doctor Selassie at the New Flower Center for Naturopathic Medicine | doctorselassie.com | 1 |
| 8223 | Arctic Cryotherapy Bayonne | arcticcryotherapybayonne.com | 1 |
| 8224 | Larisa N. Likver, MD | drlikver.com | 1 |
| 8225 | WORLD SPA | worldspa.com | 1 |
| 8226 | Oxygen Clinic - Hyperbaric Oxygen Therapy Facility | oxygenclinicny.com | 1 |
| 8227 | Una Aesthetics | unaaesthetics.com | 1 |
| 8228 | SYLK MEDSPA | sylkmedspa.com | 1 |
| 8229 | Amita Holistic Healing Center | amitausa.com | 1 |
| 8230 | Temple of Wellness | templeofwellness.com | 1 |
| 8231 | The Center for Medical Healing | thecenterformedicalhealing.com | 1 |
| 8232 | Ironbound Physical Therapy & Wellness | ironboundptwellness.com | 1 |
| 8233 | Harmonious Life with FNP Marina Moiseyeva | liveharmoniouslife.com | 1 |
| 8234 | Time2Drip - MedSpa | time2drip.com | 1 |
| 8235 | HealthierU Natural Nutritionist Brooklyn | healthieruny.com | 1 |
| 8236 | Vitality Health Group | vitalityhealthgroup.com | 1 |
| 8237 | Shore Parkway Wellness | shoreparkwaywellness.net | 1 |
| 8238 | MedLou Drips | medloucare.com | 1 |
| 8239 | Kearny Wellness | kearnywellness.com | 1 |
| 8240 | Ironbound Acupuncture and Wellness | ironboundacu.com | 1 |
| 8241 | Body Luxe Day Spa | bodyluxdayspa.com | 1 |
| 8242 | BeAti Acupuncture Wellness Clinic | careacu.com | 1 |
| 8243 | Paukman Bioage Clinic | paukmanbioageclinic.com | 1 |
| 8244 | Boris Bobyr NP - Hormone Replacement Therapy Center | borisbobyrnp.com | 2 |
| 8245 | Dr. Olga Zilberstein Medical Aesthetics Brooklyn | drolgaz.com | 1 |
| 8246 | Natural Essential Wellness, LLC | naturalessentialwellness.net | 1 |
| 8247 | Brooklyn Integrative Medicine | brooklynintegrativemedicine.com | 1 |
| 8248 | Inspire Health | inspirehealthpro.com | 1 |
| 8249 | Inspire Med Spa | inspiremedspa.com | 1 |
| 8250 | Geria Dermatology - Rutherford | geriadermatology.com | 1 |
| 8251 | Healing Touch IV | healingtouchiv.com | 1 |
| 8252 | Humaira Quraishi ND, MS | natureshum.net | 1 |
| 8253 | Functional Wellness Medical Care | drhamzajalal.com | 1 |
| 8254 | Juventee | juventee.com | 1 |
| 8255 | Zia Communications, Sales of cryotherapy chambers, fitness and spa equipment | vacuactivus.com | 1 |
| 8256 | The Lennard Clinic | thelennardclinic.org | 1 |
| 8257 | MULTIVITA IV | multivitaiv.com | 1 |
| 8258 | Spa Castle New York | spacastleusa.com | 1 |
| 8259 | Dr. Natasha Fuksina AstraMDhealth Functional, Internal And Obesity Medicine Bioidentical Hormones | astramdhealth.com | 1 |
| 8260 | New York Spa & Sauna | nyspasauna.com | 1 |
| 8261 | Your Natural Path to Health Clinic | njnaturopath.com | 1 |
| 8262 | Health N Wellness Rx | healthnwellnessrx.com | 1 |
| 8263 | Herboganic Retail | herboganic.com | 1 |
| 8264 | Alternative Health Center PC | alternativehealthcenter.com | 1 |
| 8265 | Stunning Med Spa | stunningmedspas.com | 1 |
| 8266 | Pearl Wellness and Detox | pearlwellnessdetox.com | 1 |
| 8267 | Quantum Integrative Medicine, LLC - Monica J Johnson, DC, NP-C, L.Ac | quantumintegrativemed.com | 1 |
| 8268 | Longevity | longevitynj.com | 1 |
| 8269 | AliveDrip Montclair | alivedripmedical.com | 1 |
| 8270 | Anti-Aging and Metabolic Health Clinic | aamhclinic.com | 1 |
| 8271 | ShiCares MedSpa | shicaresmedspa.com | 1 |
| 8272 | Lewis Holistic Healing Institute | drlisalewis.com | 1 |
| 8273 | Whole Body Natural Wellness Center, LLC | drchante.com | 1 |
| 8274 | Infusion Center of NJ | infusioncenterofnj.com | 1 |
| 8275 | REVIVE Body Mind Cryotherapy & Halotherapy | revivebodymind.com | 1 |
| 8276 | Holistic Naturopathic Center | holisticnaturopath.com | 1 |
| 8277 | Holistic Pain Relief and Weight Loss Center | holisticpainreliefandweightlosscenter.com | 1 |
| 8278 | Onyx Aesthetics & Sports Medicine | onyxaasm.com | 1 |
| 8279 | Feel Natural Wellness Center | feelnaturalwellnesscenter.com | 1 |
| 8280 | True Bliss Medical Aesthetics and Wellness | trueblissmedical.com | 1 |
| 8281 | Refresh Clinic | refreshclinic.com | 1 |
| 8282 | IV Hydrate Cafe | ivhydratecafe.com | 1 |
| 8283 | Anti-aging and Weight loss | sunwellness.info | 1 |
| 8284 | Testosterone Replacement Therapy Specialists | trtspecialistnj.com | 1 |
| 8285 | VitaMineral IV Therapy | vitamineralivtherapy.com | 1 |
| 8286 | BRC Day Spa & Sauna Resort | brc-spa.com | 1 |
| 8287 | Bergen Total Health | bergentotalhealth.com | 1 |
| 8288 | Integrative Medicine of New Jersey | integrativemedicineofnj.com | 1 |
| 8289 | Cryo Energy | cryonrg.com | 1 |
| 8290 | Advanced Integrated Health - Holistic & Functional Medicine | advancedintegratedhealth.com | 1 |
| 8291 | Tideline Center for Health & Aesthetics | tidelinehealth.net | 1 |
| 8292 | Elysium Aesthetics and Vein Care: David Singh, MD | elysiumveincare.com | 1 |
| 8293 | Reset Float | resetfloat.com | 1 |
| 8294 | BouncebackIV Medspa | bouncebackiv.com | 1 |
| 8295 | Dr Radu Kramer MD - Integrative Medicine Associates - Comprehensive Healing | comprehensivehealingmd.com | 1 |
| 8296 | HeavenLee Float Spa | heavenleefloatspa.com | 1 |
| 8297 | Martin P. Goldman, MD & Jay A. Goldman, LAc. | jaygoldmanacupuncture.com | 1 |
| 8298 | Longevity Physical Therapy & Performance | longevityptperformance.com | 1 |
| 8299 | RxIV Infusions | rxivinfusions.com | 1 |
| 8300 | OsteoStrong Westfield NJ | osteostrongwestfield.com | 1 |
| 8301 | Balanced Health & Wellness | balancedhealthlb.com | 1 |
| 8302 | Integrative Med Solutions, Dr. Fred Lisanti | intmedsolutions.com | 1 |
| 8303 | Westchester Wellness Medicine | westchesterwellnessmedicine.com | 1 |
| 8304 | Regenerative Healing Center | regenerativehealingcenter.com | 1 |
| 8305 | KC Performance: High-Performance Health & Longevity for Former Athletes | kcperformanceny.com | 1 |
| 8306 | Dr. Michelle S. Yusupov | drmichnd.com | 1 |
| 8307 | prosperIV Yonkers | theprosperiv.com | 1 |
| 8308 | IVRevive | iv-revive.com | 1 |
| 8309 | Restoration Men's Health | restorationmenshealth.com | 1 |
| 8310 | Zeta Aesthetics NYC Westchester | zetaaestheticsnyc.com | 1 |
| 8311 | OsteoStrong Roslyn | osteostrongroslyn.com | 1 |
| 8312 | Within Natural Health | withinnaturalhealth.com | 1 |
| 8313 | Dr. Eric Landi Functional Medicine | drericlandi.com | 1 |
| 8314 | Infinite You Wellness Clinic | infiniteyouclinic.com | 1 |
| 8315 | Pod Spa and Wellness | podspas.com | 1 |
| 8316 | Dr. Poonam Desai | drpoonamdesai.com | 1 |
| 8317 | New Jersey HBOT | oxygennj.com | 1 |
| 8318 | Infused Health and Wellness | infusedhealthwellness.com | 1 |
| 8319 | Vitality TK Health | vitalitytkhealth.com | 1 |
| 8320 | Rescu | rescu.life | 1 |
| 8321 | Mindful Waters | mindfulwaters.com | 1 |
| 8322 | Amari Health Functional & Integrative Medicine | amarihealth.com | 1 |
| 8323 | IV Therapy Long Island At Home On Demand | ivtherapydemand.com | 1 |
| 8324 | Cloud Aquatic Float Parlor | cloudaquatic.com | 1 |
| 8325 | thebodybar | bodybar-ny.com | 1 |
| 8326 | Healthy Aging Medical Centers | newjerseyantiaging.com | 2 |
| 8327 | SeeBeyond Medicine - Scarsdale Integrative Medicine | seebeyondmedicine.com | 1 |
| 8328 | Jill Weintraub, MD | jillweintraubmd.com | 1 |
| 8329 | Iron Health Ardsley | ironhealth.co | 1 |
| 8330 | Hormone and Weight Loss Doctors of NJ | hormoneweightlossdoctorsnj.com | 1 |
| 8331 | The Functional Medicine Center of New Jersey | fmcofnj.com | 1 |
| 8332 | Cryo.BeautyBar | cryobeautybar.online | 1 |
| 8333 | Integrative Holistic Center | integrativeholisticcenter.com | 1 |
| 8334 | Hydration Medic Mobile and IV Spa | hydrationmedicny.com | 1 |
| 8335 | Aesthetics By KM | aestheticsbykm.com | 1 |
| 8336 | Dr Robert G. Silverman, DC. Westchester Integrative Health | drrobertsilverman.com | 1 |
| 8337 | Advanced Anti-Aging | advancedantiaging.com | 1 |

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
