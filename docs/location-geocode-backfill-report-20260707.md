# Location Geocode Backfill Report (20260707)

Mode: live_write

## Summary

- Candidates with country: 10118
- Locality conflict rows before: 2579
- Locality conflict rows geocodable: 2507
- Total Google targets after de-dupe: 10394
- Estimated Google Geocoding cost: $51.97 at $5/1k
- Coordinate coverage: 1861 before, 10714 after
- Coordinates written: 8853
- Low-confidence/skipped: 1265
- Locality conflicts resolved: 2183
- Locality conflicts remaining/unresolved: 324

## Low-Confidence Statuses

| Status | Count |
| --- | ---: |
| low_confidence_location_type | 1119 |
| country_mismatch | 143 |
| zero_results | 3 |

## Locality Resolution Statuses

| Status | Count |
| --- | ---: |
| resolved | 2183 |
| conflict | 258 |
| unresolved | 66 |

## Tables

- Coordinate backup: `fountain_raw.location_geocode_coordinate_backup_20260707`
- Accepted audit: `fountain_raw.location_geocode_backfill_audit_20260707`
- Low-confidence review: `fountain_raw.location_geocode_low_confidence_20260707`
- Locality audit: `fountain_raw.location_geocode_locality_audit_20260707`
- Checkpoint: `location-geocode-backfill-checkpoint-20260707.json`

## Low-Confidence Sample

Showing 80 of 100.

| location_id | location_name | status | formatted_address | location_type | country_code | result_country_code |
| --- | --- | --- | --- | --- | --- | --- |
| 1382 | Fountain Life | low_confidence_location_type | Orlando, FL, USA | APPROXIMATE | US | US |
| 1383 | Regenexx | low_confidence_location_type | Broomfield, CO, USA | APPROXIMATE | US | US |
| 1384 | The London Clinic (Longevity Wing) | low_confidence_location_type | Harley St, London W1G, UK | GEOMETRIC_CENTER | GB | GB |
| 1385 | Human Longevity Inc. (HLI) Clinic | low_confidence_location_type | New York, NY, USA | APPROXIMATE | US | US |
| 1387 | TruDiagnostic | low_confidence_location_type | Toronto, ON, Canada | APPROXIMATE | CA | CA |
| 1389 | Reviv | country_mismatch | United Arab Emirates | APPROXIMATE | AU | AE |
| 1390 | The Regeneration Center | low_confidence_location_type | Bangkok, Thailand | APPROXIMATE | TH | TH |
| 1461 | Harmony Functional Medicine | low_confidence_location_type | 3903 S Congress Ave, Austin, TX 78704, USA | GEOMETRIC_CENTER | US | US |
| 1495 | Stem Cell Clinics of Mexico \| Mexico City | low_confidence_location_type | Mexico City, CDMX, Mexico | APPROXIMATE | MX | MX |
| 1497 | Clínica Hiperbárica COLIBRI | low_confidence_location_type | Avenida Montevideo & La Loma, San Bartolo Atepehuacan, 07730 Ciudad de México, CDMX, Mexico | GEOMETRIC_CENTER | MX | MX |
| 1498 | Hyperbaric Medicine CENTER TLAHUAC | low_confidence_location_type | Carr. a Sta. Catarina & Eje 10 Sur, Santa Catarina Yecahuizotl, 56619 Xico, Méx., Mexico | GEOMETRIC_CENTER | MX | MX |
| 1512 | London Regenerative Institute | low_confidence_location_type | Whitehall Pl, London SW1A 2BD, UK | GEOMETRIC_CENTER | GB | GB |
| 1527 | Aeterna Longevity Lab | low_confidence_location_type | Av. de Vallcarca, 151, Gràcia, 08023 Barcelona, Spain | GEOMETRIC_CENTER | ES | ES |
| 1528 | Vita Longevity | low_confidence_location_type | Barcelona, Spain | APPROXIMATE | ES | ES |
| 1529 | ATA Medical | low_confidence_location_type | Passeig de Manuel Girona, 33, Sarrià-Sant Gervasi, 08034 Barcelona, Spain | GEOMETRIC_CENTER | ES | ES |
| 1675 | Biowell Health | low_confidence_location_type | Circus Rd W, Nine Elms, London SW11 8AH, UK | GEOMETRIC_CENTER | GB | GB |
| 1678 | Re:nu Optimum Health | low_confidence_location_type | Woolwich Rd, London SE7 7AJ, UK | GEOMETRIC_CENTER | GB | GB |
| 1689 | Sunflower House - Holistic Health Practice | low_confidence_location_type | Dufourstrasse, 8008 Zürich, Switzerland | GEOMETRIC_CENTER | CH | CH |
| 1698 | Loungevity Genève | low_confidence_location_type | Bd Helvétique, 1207 Genève, Switzerland | GEOMETRIC_CENTER | CH | CH |
| 1991 | BodySpec | low_confidence_location_type | 5847 Uplander Wy, Culver City, CA 90230, USA | GEOMETRIC_CENTER | US | US |
| 2133 | I-MED Radiology Darwin Private Hospital | low_confidence_location_type | Rocklands Dr, Tiwi NT 0810, Australia | GEOMETRIC_CENTER | AU | AU |
| 2136 | Body Scan Queensland | low_confidence_location_type | 197 Murarrie Rd, Murarrie QLD 4172, Australia | GEOMETRIC_CENTER | AU | AU |
| 2146 | Newcastle Body Scans | low_confidence_location_type | Newcastle NSW, Australia | APPROXIMATE | AU | AU |
| 2153 | Fitnescity | country_mismatch | 550 Broad St 4th Floor, Newark, NJ 07102, USA | ROOFTOP | CA | US |
| 2181 | DexaFit | low_confidence_location_type | London, UK | APPROXIMATE | GB | GB |
| 2188 | Dexascans.com - Jacksonville, FL | low_confidence_location_type | Jacksonville, FL, USA | APPROXIMATE | US | US |
| 2193 | Dexascans.com - Tampa, FL | low_confidence_location_type | Tampa, FL, USA | APPROXIMATE | US | US |
| 2201 | 1101 Beacon Street | low_confidence_location_type | Brookline, MA 02446, USA | APPROXIMATE | US | US |
| 2207 | MyBodeeScan | low_confidence_location_type | Richardson, TX, USA | APPROXIMATE | US | US |
| 2210 | Dexascans.com - San Jose, CA | low_confidence_location_type | San Jose, CA, USA | APPROXIMATE | US | US |
| 2252 | Australian Clinic of Biological Medicine | low_confidence_location_type | South Rd, Thebarton SA 5031, Australia | GEOMETRIC_CENTER | AU | AU |
| 2286 | LondonCryo | low_confidence_location_type | London, UK | APPROXIMATE | GB | GB |
| 2300 | Hyperbaric Oxygen Therapy Ireland | low_confidence_location_type | Naas, Co. Kildare, Ireland | APPROXIMATE | IE | IE |
| 2301 | OXY Health | low_confidence_location_type | Staplestown, Co. Kildare, W91 H7EK, Ireland | APPROXIMATE | IE | IE |
| 2302 | ReWell | low_confidence_location_type | Kingsfurze, Fishery Lane, Co. Kildare, Ireland | APPROXIMATE | IE | IE |
| 2310 | The Irish Examiner | low_confidence_location_type | Assumption Rd, Blackpool, Cork, Ireland | GEOMETRIC_CENTER | IE | IE |
| 2314 | Athlone Therapy Centre | low_confidence_location_type | Tormey Villas, Athlone, Co. Westmeath, N37 W7P3, Ireland | GEOMETRIC_CENTER | IE | IE |
| 2315 | YOUtherapies | low_confidence_location_type | Lahinch Rd, Claureen, Co. Clare, Ireland | GEOMETRIC_CENTER | IE | IE |
| 2320 | Oxygens Hyperbaric Clinic | low_confidence_location_type | Halesowen B62 8EP, UK | APPROXIMATE | GB | GB |
| 2328 | Breathe | low_confidence_location_type | Southwick, Brighton BN42 4BW, UK | APPROXIMATE | GB | GB |
| 2348 | HBOT UK Ltd | low_confidence_location_type | East Riding of Yorkshire, UK | APPROXIMATE | GB | GB |
| 2372 | 8th Element Hyperbaric Medicine | country_mismatch | 901 Campus Dr Ste 206B, Daly City, CA 94015, USA | ROOFTOP | CA | US |
| 2376 | Atlanta Integrative & Internal Medicine | low_confidence_location_type | Roswell, GA, USA | APPROXIMATE | US | US |
| 2385 | The Mobile Wellness Group (TMWG) | country_mismatch | Los Angeles, CA 90001, USA | APPROXIMATE | CA | US |
| 2469 | Tall Tree Health | low_confidence_location_type | Victoria, BC, Canada | APPROXIMATE | CA | CA |
| 2472 | LV8 Health | country_mismatch | Schaumburg, IL, USA | APPROXIMATE | GB | US |
| 2479 | Body Brilliant | country_mismatch | Dubai - United Arab Emirates | APPROXIMATE | GB | AE |
| 2481 | Drips | low_confidence_location_type | Auckland, New Zealand | APPROXIMATE | NZ | NZ |
| 2482 | Swissmed Health | zero_results |  |  | CY |  |
| 2487 | Supernatural | low_confidence_location_type | GTHA, ON, Canada | APPROXIMATE | CA | CA |
| 2488 | The Longevity Suite | country_mismatch | 62012 Civitanova Marche, Province of Macerata, Italy | APPROXIMATE | SG | IT |
| 2489 | GENEVIV Clinic | low_confidence_location_type | Mississauga, ON, Canada | APPROXIMATE | CA | CA |
| 2492 | Dripfy | low_confidence_location_type | Dubai - United Arab Emirates | APPROXIMATE | AE | AE |
| 2499 | TotalFusion | low_confidence_location_type | Newstead QLD, Australia | APPROXIMATE | AU | AU |
| 2504 | CLNQ | low_confidence_location_type | Manchester, UK | APPROXIMATE | GB | GB |
| 2507 | Executive Health | country_mismatch | Marbella, Province of Málaga, Spain | APPROXIMATE | SE | ES |
| 2511 | Revi Health | low_confidence_location_type | Västerås, Sweden | APPROXIMATE | SE | SE |
| 2514 | House of Gaia | low_confidence_location_type | Lorenzo St, Manila, Metro Manila, Philippines | GEOMETRIC_CENTER | PH | PH |
| 2519 | Biograph | low_confidence_location_type | San Francisco, CA, USA | APPROXIMATE | US | US |
| 2523 | Fountain Life New York | low_confidence_location_type | Orlando, FL, USA | APPROXIMATE | US | US |
| 2524 | Maison Epigenetic | low_confidence_location_type | Paris, France | APPROXIMATE | FR | FR |
| 2525 | Axmann & Gartenbach | country_mismatch | Frankfurt am Main, Germany | APPROXIMATE | CH | DE |
| 2527 | Next Health | low_confidence_location_type | Calabasas, CA, USA | APPROXIMATE | US | US |
| 2528 | Next Health - New York City | low_confidence_location_type | Calabasas, CA, USA | APPROXIMATE | US | US |
| 2529 | Longevity Sport Lab | country_mismatch | Poland | APPROXIMATE | CH | PL |
| 2530 | Longevity Center Poland | country_mismatch | Poland | APPROXIMATE | CH | PL |
| 2531 | Longevity Center Switzerland | country_mismatch | Poland | APPROXIMATE | CH | PL |
| 2532 | Everlab | low_confidence_location_type | Brisbane QLD, Australia | APPROXIMATE | AU | AU |
| 2536 | Levitas | low_confidence_location_type | Guildford, UK | APPROXIMATE | GB | GB |
| 2537 | Levitas - London | low_confidence_location_type | Guildford, UK | APPROXIMATE | GB | GB |
| 2539 | Healthy Longevity Clinic | low_confidence_location_type | Prague, Czechia | APPROXIMATE | CZ | CZ |
| 2540 | meta[bolic] | low_confidence_location_type | Dubai - United Arab Emirates | APPROXIMATE | AE | AE |
| 2547 | RoseBar Longevity | low_confidence_location_type | Ibiza, Balearic Islands, Spain | APPROXIMATE | ES | ES |
| 2553 | Healthy Longevity Clinic - Prague | low_confidence_location_type | Prague, Czechia | APPROXIMATE | CZ | CZ |
| 2556 | Mayo Clinic Executive Health - Rochester, Minnesota | low_confidence_location_type | Rochester, MN, USA | APPROXIMATE | US | US |
| 2557 | Mayo Clinic Executive Health - Scottsdale, Arizona | low_confidence_location_type | Scottsdale, AZ, USA | APPROXIMATE | US | US |
| 2558 | Mayo Clinic Executive Health - Jacksonville, Florida | low_confidence_location_type | Jacksonville, FL, USA | APPROXIMATE | US | US |
| 2559 | Mayo Clinic Executive Health - London, United Kingdom | low_confidence_location_type | London, UK | APPROXIMATE | GB | GB |
| 2561 | Midlife Glow Retreat | low_confidence_location_type | Bangkok, Thailand | APPROXIMATE | TH | TH |
| 2562 | Enriched Gut | low_confidence_location_type | Ko Samui, Ko Samui District, Surat Thani, Thailand | APPROXIMATE | TH | TH |
