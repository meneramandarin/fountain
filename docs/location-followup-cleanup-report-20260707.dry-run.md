# Location Follow-Up Cleanup Report (20260707)

Mode: dry_run

## Summary

- Korean scrape-context rows set to Seoul, South Korea: 10
- Virtual providers flagged and cleared of locality/region: 8
- Empty-shell rows hidden: 7
- Deletion review rows: 7
- Field audit rows: 54
- Normalization review rows cleared: 26

## Audit By Rule

| Rule | Count |
| --- | ---: |
| korean_context_gangnam_medical_tourism | 30 |
| virtual_provider_clear_geo_junk | 9 |
| virtual_provider_flag | 7 |
| empty_shell_hidden_deletion_review | 7 |
| virtual_provider_cenegenics_global_telehealth | 1 |

## Tables

- Backup: `fountain_raw.location_followup_backup_20260707`
- Field audit: `fountain_raw.location_followup_audit_20260707`
- Deletion review: `fountain_raw.location_followup_deletion_review_20260707`
- Cleared normalization review rows: `fountain_raw.location_followup_review_cleared_20260707`
