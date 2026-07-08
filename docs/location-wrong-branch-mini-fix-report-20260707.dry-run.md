# Location Wrong-Branch Mini-Fix Report (20260707)

Mode: dry_run

## Summary

- Wrong-branch rows before: 110
- Accepted geocoder rows: 95
- Accepted CA-as-Canada to US rows: 89
- Accepted named one-off rows: 6
- Hidden/deletion-review rows: 2
- Rows left flagged: 13
- Wrong-branch rows remaining in active review table: 13

## Tables

- Backup: `fountain_raw.location_wrong_branch_mini_fix_backup_20260707`
- Field audit: `fountain_raw.location_wrong_branch_mini_fix_audit_20260707`
- Accepted rows: `fountain_raw.location_wrong_branch_mini_fix_accepted_20260707`
- Deletion review: `fountain_raw.location_wrong_branch_mini_fix_deletion_review_20260707`
- Resolved review: `fountain_raw.location_wrong_branch_mini_fix_resolved_review_20260707`
- Active wrong-branch review: `fountain_raw.location_geocode_wrong_branch_address_20260707`

## Hidden Rows

Showing 2.

| location_id | location_name | old_status | new_status | formatted_address | rule |
| --- | --- | --- | --- | --- | --- |
| 3951 | Payday Money Centers- Santa Ana | active | hidden | Whittier, CA, USA | non_longevity_business_hidden_deletion_review |
| 8507 | Office Depot | active | hidden | Los Gatos, CA, USA | non_longevity_business_hidden_deletion_review |

## Rows Left Flagged

Showing 13.

| location_id | location_name | reason | claimed_place | current_locality | current_country_code | formatted_address | result_country_code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2472 | LV8 Health | country_mismatch_approximate |  | London | GB | Schaumburg, IL, USA | US |
| 2523 | Fountain Life New York | name_claim_differs_from_geocoded_address | New York | Orlando | US | Orlando, FL, USA | US |
| 2528 | Next Health - New York City | name_claim_differs_from_geocoded_address | New York | Calabasas | US | Calabasas, CA, USA | US |
| 2529 | Longevity Sport Lab | country_mismatch_approximate |  | Longevity Center Poland | CH | Poland | PL |
| 2530 | Longevity Center Poland | country_mismatch_approximate |  | Longevity Center Poland | CH | Poland | PL |
| 2531 | Longevity Center Switzerland | country_mismatch_approximate |  | Longevity Center Poland | CH | Poland | PL |
| 2537 | Levitas - London | name_claim_differs_from_geocoded_address | London | Esher | GB | Guildford, UK | GB |
| 3200 | Dexascans.com - Jacksonville, FL | name_claim_differs_from_geocoded_address | Jacksonville | Orange Park | US | Orange Park, FL 32073, USA | US |
| 3201 | Dexascans.com - Jacksonville, FL | name_claim_differs_from_geocoded_address | Jacksonville | St. Augustine | US | St. Augustine, FL, USA | US |
| 3202 | Dexascans.com - Jacksonville, FL | name_claim_differs_from_geocoded_address | Jacksonville | Ponte Vedra Beach | US | Ponte Vedra Beach, FL 32082, USA | US |
| 5303 | Private Medical \| New York | name_claim_differs_from_geocoded_address | New York | Greenwich | US | Greenwich, CT, USA | US |
| 9303 | Colorado Cryo Clinic | country_mismatch_not_street_level |  | Denver | US | Av. Lincoln, Montréal, QC, Canada | CA |
| 12171 | Stem Cell Medical Center | country_mismatch_not_street_level |  | Hialeah | US | Friars Hill Road, St John's, Antigua and Barbuda | AG |
