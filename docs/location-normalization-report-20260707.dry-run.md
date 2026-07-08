# Location Normalization Report (20260707)

Mode: dry run

## Summary

- Locations scanned: 13118
- Locations changed: 7659
- Audited field changes: 9398
- Review rows: 2615
- Website tracking URLs cleaned: 2850
- Coordinate coverage: 1861 before, 1861 after
- Geocode candidates: 10119
- Estimated geocoding cost: $50.59 at $5/1k
- Geocoding attempted: no
- Geocoding cost gate: blocked pending confirmation

## Acceptance Counts

| Check | Before | After |
| --- | ---: | ---: |
| locality = USA | 423 | 0 |
| bad region comma/continent | 376 | 0 |
| invalid US/CA region values | 280 | 0 |
| country_code missing | 142 | 25 |
| bad country_name | 6 | 0 |
| websites with tracking params | 1777 | 0 |

## Changes By Field

| Value | Count |
| --- | ---: |
| postal_code | 4635 |
| website | 2850 |
| region | 759 |
| locality | 490 |
| country_name | 398 |
| country_code | 266 |

## Changes By Rule

| Value | Count |
| --- | ---: |
| postal_code_from_address | 4635 |
| website_tracking_params_removed | 2850 |
| locality_from_address | 469 |
| country_name_iso3166 | 398 |
| region_from_address | 396 |
| country_code_from_address_or_city | 266 |
| continent_region_cleared | 133 |
| invalid_us_ca_region_cleared | 116 |
| region_equal_country_cleared | 45 |
| region_from_address_non_us_ca | 37 |
| region_normalized_to_code | 31 |
| junk_locality_cleared | 21 |
| compound_region_cleared | 1 |

## Review Reasons

| Value | Count |
| --- | ---: |
| address_city_differs_from_locality | 2579 |
| country_unresolved | 25 |
| locality_country_possible_mismatch | 11 |

## Remaining No-Country Rows

Showing 25.

| id | name | address | locality | region |
| --- | --- | --- | --- | --- |
| 1386 | AgelessRx | Telehealth / Clinics in AZ & FL |  | Remote / Global |
| 1392 | Cenegenics | Washington, D.C. | Washington | Global |
| 2222 | LIFF Plastic Surgery |  |  |  |
| 2223 | OLO plastic surgery |  |  |  |
| 2224 | Ruby Plastic Surgery |  |  |  |
| 2231 | Luarc Plastic Surgery |  |  |  |
| 2235 | Wink Plastic Surgery |  |  |  |
| 2237 | Gangnam JS Hospital |  |  |  |
| 2241 | DAEYOUNG PLASTIC SURGERY | Gangnamgu Apgujeongro 338 2F 203 MAP |  |  |
| 2422 | Cheongdam Min Clinic - Top-Rated Skin Clinic in Gangnam for Expats |  |  |  |
| 2442 | Seoul Stem Cell Clinic |  |  |  |
| 2443 | Listings in Best Stem Cell Clinics Seoul Gangnam |  |  |  |
| 2451 | PAAR London |  |  |  |
| 2454 | Nao Longevity Hub |  |  |  |
| 2457 | Biotier Longevity | virtual | Virtual |  |
| 2495 | AgelessRx | virtual | Virtual |  |
| 2506 | California Center for Functional Medicine | virtual | Virtual |  |
| 2509 | Lifespire | remote | Remote |  |
| 2522 | Human Sync | virtual | Virtual |  |
| 2544 | Lifeforce | various virtual | Various Virtual |  |
| 2563 | Longevity |  |  |  |
| 9411 | Pura Vida Wellness |  |  |  |
| 9417 | Elevated Embers |  |  |  |
| 9421 | Amplivive |  |  |  |
| 9422 | Primeval Human Performance |  |  |  |

## Contradiction / Cleanup Leftovers

_None._

## Audit Tables

- Backup: `fountain_raw.locations_backup_20260707_location_normalization`
- Field audit: `fountain_raw.location_normalization_audit_20260707`
- Review list: `fountain_raw.location_normalization_review_20260707`
