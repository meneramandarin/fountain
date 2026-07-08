# Location Geocode Addendum Report (20260707)

Mode: live_write

## Summary

- Logged low-confidence rows scanned: 1264
- Coordinates recovered from GEOMETRIC_CENTER street/premise rows: 313
- Country mismatches fixed from street-level geocoder rows: 40
- Wrong-branch address review rows: 110
- Field audit rows: 845

## Tables

- Backup: `fountain_raw.location_geocode_addendum_backup_20260707`
- Field audit: `fountain_raw.location_geocode_addendum_audit_20260707`
- Recovered GEOMETRIC_CENTER coordinates: `fountain_raw.location_geocode_addendum_recovered_20260707`
- Geocoder country fixes: `fountain_raw.location_geocode_addendum_country_fix_20260707`
- Wrong branch address review: `fountain_raw.location_geocode_wrong_branch_address_20260707`

## Wrong Branch Address List

Showing 110.

| location_id | location_name | reason | claimed_place | current_locality | current_country_code | formatted_address | result_country_code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1389 | Reviv | country_mismatch_approximate |  | UAE | AU | United Arab Emirates | AE |
| 2385 | The Mobile Wellness Group (TMWG) | country_mismatch_approximate |  | Los Angeles | CA | Los Angeles, CA 90001, USA | US |
| 2472 | LV8 Health | country_mismatch_approximate |  | London | GB | Schaumburg, IL, USA | US |
| 2479 | Body Brilliant | country_mismatch_approximate |  | Barcelona | GB | Dubai - United Arab Emirates | AE |
| 2488 | The Longevity Suite | country_mismatch_approximate |  | Arzignano | SG | 62012 Civitanova Marche, Province of Macerata, Italy | IT |
| 2507 | Executive Health | country_mismatch_approximate |  | Lund | SE | Marbella, Province of Málaga, Spain | ES |
| 2523 | Fountain Life New York | name_claim_differs_from_geocoded_address | New York | Orlando | US | Orlando, FL, USA | US |
| 2525 | Axmann & Gartenbach | country_mismatch_approximate |  | Berlin | CH | Frankfurt am Main, Germany | DE |
| 2528 | Next Health - New York City | name_claim_differs_from_geocoded_address | New York | Calabasas | US | Calabasas, CA, USA | US |
| 2529 | Longevity Sport Lab | country_mismatch_approximate |  | Longevity Center Poland | CH | Poland | PL |
| 2530 | Longevity Center Poland | country_mismatch_approximate |  | Longevity Center Poland | CH | Poland | PL |
| 2531 | Longevity Center Switzerland | country_mismatch_approximate |  | Longevity Center Poland | CH | Poland | PL |
| 2537 | Levitas - London | name_claim_differs_from_geocoded_address | London | Esher | GB | Guildford, UK | GB |
| 2625 | Cornell & Associates Marriage and Family Therapy | country_mismatch_approximate |  | Pasadena | CA | Pasadena, CA, USA | US |
| 2626 | Cornell & Associates Marriage and Family Therapy | country_mismatch_approximate |  | Del Mar | CA | Del Mar, CA 92014, USA | US |
| 2627 | Cornell & Associates Marriage and Family Therapy | country_mismatch_approximate |  | San Diego | CA | San Diego, CA, USA | US |
| 2628 | Cornell & Associates Marriage and Family Therapy | country_mismatch_approximate |  | Los Angeles | CA | Los Angeles, CA, USA | US |
| 2629 | Cornell & Associates Marriage and Family Therapy | country_mismatch_approximate |  | San Francisco | CA | San Francisco, CA, USA | US |
| 2630 | Cornell & Associates Marriage and Family Therapy | country_mismatch_approximate |  | La Jolla | CA | La Jolla, San Diego, CA, USA | US |
| 2951 | Bespoke Physical Therapy Hoboken | country_mismatch_approximate |  | Los Angeles | CA | Los Angeles, CA, USA | US |
| 3140 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Studio City | CA | Studio City, Los Angeles, CA, USA | US |
| 3141 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Beverly Hills | CA | Beverly Hills, CA, USA | US |
| 3142 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Burbank | CA | Burbank, CA, USA | US |
| 3143 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Encino | CA | Encino, Los Angeles, CA, USA | US |
| 3144 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Glendale | CA | Glendale, CA, USA | US |
| 3145 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Los Angeles | CA | Los Angeles, CA, USA | US |
| 3146 | Functional Medicine Los Angeles | country_mismatch_approximate |  | San Fernando | CA | San Fernando, CA, USA | US |
| 3147 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Santa Monica | CA | Santa Monica, CA, USA | US |
| 3148 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Tarzana | CA | Tarzana, Los Angeles, CA, USA | US |
| 3149 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Toluca Lake | CA | Toluca Lake, Los Angeles, CA, USA | US |
| 3150 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Valley Village | CA | Valley Village, Los Angeles, CA, USA | US |
| 3151 | Functional Medicine Los Angeles | country_mismatch_approximate |  | Van Nuys | CA | Van Nuys, Los Angeles, CA, USA | US |
| 3152 | Functional Medicine Los Angeles | country_mismatch_approximate |  | West Hollywood | CA | West Hollywood, CA, USA | US |
| 3200 | Dexascans.com - Jacksonville, FL | name_claim_differs_from_geocoded_address | Jacksonville | Orange Park | US | Orange Park, FL 32073, USA | US |
| 3201 | Dexascans.com - Jacksonville, FL | name_claim_differs_from_geocoded_address | Jacksonville | St. Augustine | US | St. Augustine, FL, USA | US |
| 3202 | Dexascans.com - Jacksonville, FL | name_claim_differs_from_geocoded_address | Jacksonville | Ponte Vedra Beach | US | Ponte Vedra Beach, FL 32082, USA | US |
| 3230 | Dexascans.com - San Jose, CA | country_mismatch_approximate |  | San Francisco | CA | San Francisco, CA, USA | US |
| 3231 | Dexascans.com - San Jose, CA | country_mismatch_approximate |  | Palo Alto | CA | Palo Alto, CA, USA | US |
| 3427 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Tracy | CA | Tracy, CA, USA | US |
| 3428 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Turlock | CA | Turlock, CA, USA | US |
| 3429 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Stockton | CA | Stockton, CA, USA | US |
| 3430 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Ceres | CA | Ceres, CA, USA | US |
| 3431 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Escalon | CA | Escalon, CA 95320, USA | US |
| 3432 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Hughson | CA | Hughson, CA 95326, USA | US |
| 3433 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Lodi | CA | Lodi, CA, USA | US |
| 3434 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Manteca | CA | Manteca, CA, USA | US |
| 3435 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Merced | CA | Merced, CA, USA | US |
| 3436 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Oakdale | CA | Oakdale, CA 95361, USA | US |
| 3437 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Patterson | CA | Patterson, CA 95363, USA | US |
| 3438 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Riverbank | CA | Riverbank, CA, USA | US |
| 3439 | Advanced Recovery CryoTherapy | country_mismatch_approximate |  | Ripon | CA | Ripon, CA 95366, USA | US |
| 3472 | Advanced Stem Cell Institute | country_mismatch_approximate |  | Beverly Hills | CA | Beverly Hills, CA, USA | US |
| 3951 | Payday Money Centers- Santa Ana | country_mismatch_approximate |  | Whittier | CA | Whittier, CA, USA | US |
| 4921 | Life Solutions Psychotherapy | country_mismatch_approximate |  |  | GR | Greece, NY 14626, USA | US |
| 4949 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Aliso Viejo | CA | Aliso Viejo, CA, USA | US |
| 4950 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Anaheim | CA | Anaheim, CA, USA | US |
| 4951 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Buena Park | CA | Buena Park, CA, USA | US |
| 4952 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Brea | CA | Brea, CA, USA | US |
| 4953 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Cypress | CA | Cypress, CA, USA | US |
| 4954 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Costa Mesa | CA | Costa Mesa, CA, USA | US |
| 4955 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Fullerton | CA | Fullerton, CA, USA | US |
| 4956 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Garden Grove | CA | Garden Grove, CA, USA | US |
| 4957 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Huntington Beach | CA | Huntington Beach, CA, USA | US |
| 4958 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Irvine | CA | Irvine, CA, USA | US |
| 4959 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Laguna Beach | CA | Laguna Beach, CA, USA | US |
| 4960 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Laguna Niguel | CA | Laguna Niguel, CA, USA | US |
| 4961 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Lake Forest | CA | Lake Forest, CA, USA | US |
| 4962 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Mission Viejo | CA | Mission Viejo, CA, USA | US |
| 4963 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Newport Beach | CA | Newport Beach, CA, USA | US |
| 4964 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Orange | CA | Orange, CA, USA | US |
| 4965 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Placentia | CA | Placentia, CA 92870, USA | US |
| 4966 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | San Clemente | CA | San Clemente, CA, USA | US |
| 4967 | Orange County Mobile IV Therapy | country_mismatch_approximate |  | Tustin | CA | Tustin, CA, USA | US |
| 5303 | Private Medical \| New York | name_claim_differs_from_geocoded_address | New York | Greenwich | US | Greenwich, CT, USA | US |
| 6299 | Hair Transplant Los Angeles Dr. Sean Behnam | country_mismatch_approximate |  | Beverly Hills | CA | Beverly Hills, CA, USA | US |
| 6300 | Hair Transplant Los Angeles Dr. Sean Behnam | country_mismatch_approximate |  | Santa Monica | CA | Santa Monica, CA, USA | US |
| 6301 | Hair Transplant Los Angeles Dr. Sean Behnam | country_mismatch_approximate |  | West Hollywood | CA | West Hollywood, CA, USA | US |
| 6467 | Community Memorial Health Center – Vineyard Avenue | country_mismatch_approximate |  | Ojai | CA | Ojai, CA 93023, USA | US |
| 7052 | California Rehabilitation and Sports Therapy – Santa Ana, E. 4th St. | country_mismatch_not_street_level |  | Lodi | CA | N Fairmont Ave, Lodi, CA 95240, USA | US |
| 7350 | Hydration Room Huntington Beach – Goldenwest (Inside LA Fitness) | country_mismatch_not_street_level |  | Huntington Beach | CA | Adams Ave, Huntington Beach, CA, USA | US |
| 8218 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Lodi | CA | Lodi, CA, USA | US |
| 8219 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Brentwood | CA | Brentwood, CA 94513, USA | US |
| 8220 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Oakley | CA | Oakley, CA 94561, USA | US |
| 8221 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Modesto | CA | Modesto, CA, USA | US |
| 8222 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Tracy | CA | Tracy, CA, USA | US |
| 8223 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Merced | CA | Merced, CA, USA | US |
| 8224 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Fresno | CA | Fresno, CA, USA | US |
| 8225 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Bakersfield | CA | Bakersfield, CA, USA | US |
| 8226 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Visalia | CA | Visalia, CA, USA | US |
| 8227 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Hanford | CA | Hanford, CA 93230, USA | US |
| 8228 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | San Luis Obispo | CA | San Luis Obispo, CA, USA | US |
| 8229 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Paso Robles | CA | Paso Robles, CA 93446, USA | US |
| 8230 | Infusion SMP Scalp Micropigmentation | country_mismatch_approximate |  | Fresno County | CA | Fresno County, CA, USA | US |
| 8291 | Polaris Rejuvenation | country_mismatch_approximate |  | Orange County | CA | Orange County, CA, USA | US |
| 8507 | Office Depot | country_mismatch_approximate |  | Los Gatos | CA | Los Gatos, CA, USA | US |
| 8639 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Oxnard | CA | Oxnard, CA, USA | US |
| 8640 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Ojai | CA | Ojai, CA 93023, USA | US |
| 8641 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Santa Paula | CA | Santa Paula, CA 93060, USA | US |
| 8642 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Camarillo | CA | Camarillo, CA, USA | US |
| 8643 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Santa Barbara | CA | Santa Barbara, CA, USA | US |
| 8644 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Carpinteria | CA | Carpinteria, CA, USA | US |
| 8645 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Thousand Oaks | CA | Thousand Oaks, CA, USA | US |
| 8646 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Moorpark | CA | Moorpark, CA 93021, USA | US |
| 8647 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Simi Valley | CA | Simi Valley, CA, USA | US |
| 8648 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Newbury Park | CA | Newbury Park, Thousand Oaks, CA 91320, USA | US |
| 8649 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Calabasas | CA | Calabasas, CA, USA | US |
| 8650 | Central Coast Center for Integrative Health | country_mismatch_approximate |  | Malibu | CA | Malibu, CA, USA | US |
| 8779 | Elevate Health Group | country_mismatch_approximate |  | Burbank | CA | Burbank, CA, USA | US |
| 9303 | Colorado Cryo Clinic | country_mismatch_not_street_level |  | Denver | US | Av. Lincoln, Montréal, QC, Canada | CA |
| 12171 | Stem Cell Medical Center | country_mismatch_not_street_level |  | Hialeah | US | Friars Hill Road, St John's, Antigua and Barbuda | AG |
