# fountain_raw Archive Manifest — 2026-07-11

**Status:** COMPLETE — dumps verified, scratch restores passed, source tables dropped
**Created (UTC):** 2026-07-12T01:11:41.774Z
**Completed (UTC):** 2026-07-12T01:30:32.473Z
**PostgreSQL server:** 17.10 (986efc8)
**Dump/restore client:** pg_dump (PostgreSQL) 17.10 (Homebrew)
**Snapshot:** 00000038-00000002-1

Connection credentials are intentionally omitted. Dump payloads are local-only; this manifest is versioned.

## Summary

- Tables: 106
- Owned sequences included: 9
- Snapshot rows: 316,953
- Source relation bytes: 92,880,896 (88.58 MiB)
- Compressed dump bytes: 14,206,587 (13.55 MiB)
- pg_restore --list verified: 106/106

## Scratch restore verification

| Table | Manifest rows | Restored rows | SHA before | SHA after | Result |
|---|---:|---:|---|---|---|
| taxonomy_term_corpus_20260710 | 42,922 | 42,922 | 1539ee91e5c0267ec0fb696275d0399618693c7d78d84011704373857b818155 | 1539ee91e5c0267ec0fb696275d0399618693c7d78d84011704373857b818155 | PASS |
| image_promotion_audit_20260708 | 23,290 | 23,290 | 34c6138493507576e2535ba4e4612b58854a2060e5557f8d2f2959e7ed7242cc | 34c6138493507576e2535ba4e4612b58854a2060e5557f8d2f2959e7ed7242cc | PASS |

## Dumps

| Table | Rows | Source bytes | Dump file | Dump bytes | SHA-256 | Owned sequence(s) | TOC |
|---|---:|---:|---|---:|---|---|---|
| assure_wellness_purge_20260709_affiliations | 0 | 8,192 | assure_wellness_purge_20260709_affiliations.dump | 2,198 | 186919be8d3ab703303f9918adbbfb68d1efbd2a4542eea9b9233bfec8028243 | — | PASS |
| assure_wellness_purge_20260709_clinic_claims | 0 | 8,192 | assure_wellness_purge_20260709_clinic_claims.dump | 2,172 | d3df78fa6130b93d25b01c2840be57aecd4265f65d400d300cf013b5c20b9f38 | — | PASS |
| assure_wellness_purge_20260709_entity_tags | 0 | 8,192 | assure_wellness_purge_20260709_entity_tags.dump | 1,842 | 0ec1be25bb0458d9bb1967ce04d6c216b3cd3029c793849f1e46f3a4c9dada80 | — | PASS |
| assure_wellness_purge_20260709_external_place_matches | 0 | 8,192 | assure_wellness_purge_20260709_external_place_matches.dump | 2,275 | 6f7a4c06f7531e82bc9cd56c575a7daf2f0e78bd68b43593d152627d40b2f688 | — | PASS |
| assure_wellness_purge_20260709_images | 1 | 16,384 | assure_wellness_purge_20260709_images.dump | 2,539 | 8f4bae261df15c6e1f1d7cdbcb0d33c05a3669d8b524d389afe25195e015601c | — | PASS |
| assure_wellness_purge_20260709_locations | 2 | 16,384 | assure_wellness_purge_20260709_locations.dump | 2,980 | b774b9ccf41b2201a45183b2a5e842bcdbaf9796113db0aafe3f52755490bfab | — | PASS |
| assure_wellness_purge_20260709_offerings | 17 | 16,384 | assure_wellness_purge_20260709_offerings.dump | 2,708 | 13ad85be3a9e2d95ed1f627c7b60d0d5060632ba5dd85162432a5ead2acf6b74 | — | PASS |
| assure_wellness_purge_20260709_organizations | 1 | 16,384 | assure_wellness_purge_20260709_organizations.dump | 2,448 | 2c392624aa05e1bc6590a3c76e99873d36df527863bfd7801a7dd5e9a2ea2e89 | — | PASS |
| assure_wellness_purge_20260709_outbound_clicks | 1 | 16,384 | assure_wellness_purge_20260709_outbound_clicks.dump | 2,245 | ec9e4927081f3d749a1f8ec8315b66254a911034fc6fd093f4a2309698e27a2d | — | PASS |
| assure_wellness_purge_20260709_reviews | 0 | 8,192 | assure_wellness_purge_20260709_reviews.dump | 2,386 | 8b1579b928966dc5053727052f469cf8ba3e724d4da5660fb6892be7a7e1d751 | — | PASS |
| assure_wellness_purge_20260709_search_index | 2 | 16,384 | assure_wellness_purge_20260709_search_index.dump | 2,544 | 6ca0c4114fcc0e3a92f4cdd8e6ea41be271308c1ea928bae8841db0854037d64 | — | PASS |
| assure_wellness_purge_20260709_source_records | 6 | 16,384 | assure_wellness_purge_20260709_source_records.dump | 2,244 | ce58422ca2021805017019a994c6116cff49a32aa1a75dca6554100501f7b448 | — | PASS |
| assure_wellness_purge_20260709_summary | 1 | 16,384 | assure_wellness_purge_20260709_summary.dump | 2,142 | aa18b8d73b7d170899d9853874571216a0661c2f341a126dfc0fa467c7a34caa | — | PASS |
| blob_orphan_sweep_20260708 | 2 | 32,768 | blob_orphan_sweep_20260708.dump | 2,770 | 99ee2d6d5971076b4702916c76017c10c9804066571b1b32c4d0defed2665b69 | — | PASS |
| bookimed_cleanup_addendum_location_actions_20260708 | 1 | 16,384 | bookimed_cleanup_addendum_location_actions_20260708.dump | 2,374 | f3a70779c26c5aaa4aec13f078797736e8b116114c91ec6296af2a9c0d293da2 | — | PASS |
| bookimed_cleanup_addendum_new_orgs_20260708 | 4 | 16,384 | bookimed_cleanup_addendum_new_orgs_20260708.dump | 2,461 | f689e671b5ecc2ce7c756d653ba4173a0138c4448deeb09e7db5fb211da5cfc3 | — | PASS |
| bookimed_cleanup_addendum_org_map_20260708 | 9 | 16,384 | bookimed_cleanup_addendum_org_map_20260708.dump | 2,823 | 1c01a565d303fbe10ce5b9600e0aa666520a1f7829594e59bf2091c5aae5576f | — | PASS |
| bookimed_mismatch_approval_guardrail_20260708 | 0 | 8,192 | bookimed_mismatch_approval_guardrail_20260708.dump | 2,036 | 7709ce4ca2c648ebd561d919ba983ea9df72a3d9028aeb47f5d33037b4ff76bb | — | PASS |
| bookimed_mismatch_approval_location_actions_20260708 | 5 | 16,384 | bookimed_mismatch_approval_location_actions_20260708.dump | 3,408 | 790da807823b801e790320aca9225dbb8dcc5a964933f55ef8684a6edd4f2046 | — | PASS |
| bookimed_mismatch_approval_new_orgs_20260708 | 5 | 16,384 | bookimed_mismatch_approval_new_orgs_20260708.dump | 2,596 | cec5249afbca73b1113642ddaf5899dedb6f7861c1fa1ceb1ce582d46b3f3746 | — | PASS |
| bookimed_mismatch_approval_org_map_20260708 | 5 | 16,384 | bookimed_mismatch_approval_org_map_20260708.dump | 2,381 | 5bd8c8530eb5e23c77a0345b1000dfd03ec36b84d2dba2a3aa3ddc9a797ff007 | — | PASS |
| bookimed_website_backfill_guardrail_20260708 | 13 | 16,384 | bookimed_website_backfill_guardrail_20260708.dump | 2,619 | 553e4cf1361cc6d17d4907f47856a9452f5aad44a419cdf3871c44e4bc9e02d5 | — | PASS |
| bookimed_website_backfill_new_orgs_20260708 | 192 | 98,304 | bookimed_website_backfill_new_orgs_20260708.dump | 10,253 | bc274b5647754e3fb23d5a1b9312d2685db214412e3e1617349af8f3d72f41bd | — | PASS |
| bookimed_website_backfill_org_map_20260708 | 222 | 98,304 | bookimed_website_backfill_org_map_20260708.dump | 12,315 | 8df726a9ee76d0f779c954d6909ee6ddf6bdffd345a9a5e8e9cacb028c3f7299 | — | PASS |
| browser_swarm_jobs_20260708 | 1,473 | 2,064,384 | browser_swarm_jobs_20260708.dump | 112,257 | 1ee8c05d9479bf1873885ef7f5768831c06cc32b76f0d5da9f438a538df11637 | browser_swarm_jobs_20260708_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_ae | 4 | 65,536 | browser_swarm_jobs_20260708_tier3_ae.dump | 5,747 | 61e3f0691f94049b84200a6016515ffae8bbf8d352bd97e32ae3838b96822e56 | browser_swarm_jobs_20260708_tier3_ae_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_batch4_nonus_run1 | 405 | 524,288 | browser_swarm_jobs_20260708_tier3_batch4_nonus_run1.dump | 32,625 | 6eeaa5ed65c84c6caf14d617f77361ea49437d82d197a5f7361df024f88659e1 | browser_swarm_jobs_20260708_tier3_batch4_nonus_run1_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_gb | 52 | 106,496 | browser_swarm_jobs_20260708_tier3_gb.dump | 8,138 | 61cf8ada3a500b71ff9327dadd53249a300f7488de0c8075e6ef909127c2ed0b | browser_swarm_jobs_20260708_tier3_gb_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_us_batch1 | 2,001 | 2,154,496 | browser_swarm_jobs_20260708_tier3_us_batch1.dump | 128,536 | 5e1437b794580688aa6416a7908e53e442af13146255e348e80c80668475c146 | browser_swarm_jobs_20260708_tier3_us_batch1_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_us_batch1_run1 | 2,014 | 2,400,256 | browser_swarm_jobs_20260708_tier3_us_batch1_run1.dump | 144,914 | 4b12a759b4c3c9c1459ae1e99df3933f96cc482112235d3e88ee87733c704984 | browser_swarm_jobs_20260708_tier3_us_batch1_run1_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_us_batch2 | 1,800 | 1,024,000 | browser_swarm_jobs_20260708_tier3_us_batch2.dump | 115,560 | d8b5c68aef28640ea29e59fccaf54df97d9c0e58a3787b218d06ee73a3ca6034 | browser_swarm_jobs_20260708_tier3_us_batch2_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_us_batch2_run1 | 1,800 | 2,236,416 | browser_swarm_jobs_20260708_tier3_us_batch2_run1.dump | 148,909 | 70e418fd96d8d1b5b847b495a35d8bc826a5607d0e1116adcf82b8c135cfa0e9 | browser_swarm_jobs_20260708_tier3_us_batch2_run1_id_seq | PASS |
| browser_swarm_jobs_20260708_tier3_us_batch3_run1 | 1,355 | 1,695,744 | browser_swarm_jobs_20260708_tier3_us_batch3_run1.dump | 117,516 | 7b2bf34311a4ac2f7e107f076ae9a2ee72d7bb96b74d8e1e887051b5f4dde260 | browser_swarm_jobs_20260708_tier3_us_batch3_run1_id_seq | PASS |
| browser_swarm_menu_tier1_nav_deleted_20260708 | 65 | 49,152 | browser_swarm_menu_tier1_nav_deleted_20260708.dump | 5,157 | c3ca7bde23dd3aaa13ac3706355f4e4b7f3b181829db9d5f34b6ea024089b8db | — | PASS |
| closeout_approved_website_matches_20260707 | 4 | 16,384 | closeout_approved_website_matches_20260707.dump | 2,775 | 58ea89fdadc5b51ce5de03a830fa29f97dd6b458a4baead70e335f05f5c9d943 | — | PASS |
| closeout_documents_deleted_20260707 | 1 | 8,192 | closeout_documents_deleted_20260707.dump | 1,993 | c5dfefc9096105e663fdc4cedbd864975a8afa8938c803156bbb482a7ab25dd8 | — | PASS |
| closeout_duplicate_domain_review_20260707 | 47 | 57,344 | closeout_duplicate_domain_review_20260707.dump | 6,087 | db0eb35182a1c6c7968ae6712c76df3d3b2950df887ac7619f4d74d06a2a709a | — | PASS |
| closeout_hidden_locations_20260707 | 3 | 16,384 | closeout_hidden_locations_20260707.dump | 2,122 | bc7e0d2bad475fbc8e731cd8fd06644a881e2ac7b1c2f4014069a97839478e96 | — | PASS |
| closeout_org_merges_20260707 | 9 | 16,384 | closeout_org_merges_20260707.dump | 3,020 | 08fea908e3e3b3a2296bf4b7e15b247ce6001a6280d337ec9f00e9d7b69dc905 | — | PASS |
| closeout_source_records_org_backup_20260707 | 114 | 40,960 | closeout_source_records_org_backup_20260707.dump | 5,496 | b5591a17c26da0b00f0dfacd832beebfe08db8bb6777648a7c2dd422981c62ed | — | PASS |
| external_place_matches_backup_20260708_bookimed_cleanup_addendu | 14 | 16,384 | external_place_matches_backup_20260708_bookimed_cleanup_addendu.dump | 2,774 | 685ca0f5df67c3cf3d19e39077a001c80c36e6f48f1ba9507f0b7d639b7d1a3c | — | PASS |
| image_promotion_audit_20260708 | 23,290 | 10,567,680 | image_promotion_audit_20260708.dump | 678,271 | 34c6138493507576e2535ba4e4612b58854a2060e5557f8d2f2959e7ed7242cc | — | PASS |
| image_promotion_results_20260708 | 6,085 | 2,187,264 | image_promotion_results_20260708.dump | 209,651 | 299194fcabf03c15a2de59ae53738c9ddc3ad30155aac1dd41b79ea77eafb1ec | — | PASS |
| location_followup_audit_20260707 | 54 | 16,384 | location_followup_audit_20260707.dump | 2,372 | 7437593c5d69e4ff41b89e592e51e1526f676d1c15ae0d532ad5385a3c1d11eb | — | PASS |
| location_followup_backup_20260707 | 25 | 16,384 | location_followup_backup_20260707.dump | 4,587 | 34568daf29675b2f9b6ca6387ed444ac48cd885d20fead466017d86e214ff035 | — | PASS |
| location_followup_deletion_review_20260707 | 9 | 32,768 | location_followup_deletion_review_20260707.dump | 3,051 | 8feb3073cb6a44734cd14014f7a3e4df724c1b0133d269dd468dbb38f64c1bbc | — | PASS |
| location_followup_review_cleared_20260707 | 26 | 16,384 | location_followup_review_cleared_20260707.dump | 2,614 | 7dd85729f50eee3634ddac5fcbc827880e9c5e223b6f6c25673facae98ba9828 | — | PASS |
| location_geocode_addendum_audit_20260707 | 845 | 155,648 | location_geocode_addendum_audit_20260707.dump | 18,485 | ddb12e0768c14dcb1bd13aebd8cb57f62b62e9c0bc0804dae2e06dc9b14f0437 | — | PASS |
| location_geocode_addendum_backup_20260707 | 353 | 180,224 | location_geocode_addendum_backup_20260707.dump | 50,686 | 37f4e0136384fb74da01e55c3608ad5cf8122b8af5701cff9de9e9e1afff5eab | — | PASS |
| location_geocode_addendum_country_fix_20260707 | 40 | 65,536 | location_geocode_addendum_country_fix_20260707.dump | 5,880 | 1f896f7d8f3faf2998ae247fc49fd96c72070e1366687e3199202326b3bd420f | — | PASS |
| location_geocode_addendum_recovered_20260707 | 313 | 131,072 | location_geocode_addendum_recovered_20260707.dump | 18,047 | ae6a8f395ab79f92e6fd4f5c03eb0e3283c44094fdb540a2bf05358e1b611cc3 | — | PASS |
| location_geocode_backfill_audit_20260707 | 8,853 | 2,351,104 | location_geocode_backfill_audit_20260707.dump | 329,218 | b8b2ae7522259719d8dbf53525a193b2b6e71d03916c7c06b6ee33b08cbbaad9 | — | PASS |
| location_geocode_coordinate_backup_20260707 | 10,394 | 1,597,440 | location_geocode_coordinate_backup_20260707.dump | 327,582 | 974bb75807647aa4a75ca244176e6c2f53d9b096d67eabf884bd4e2e7047fb6e | — | PASS |
| location_geocode_coordinate_backup_20260709 | 1,978 | 475,136 | location_geocode_coordinate_backup_20260709.dump | 51,262 | b9c143e82882663fd84ecc1349aa53a358f262e34cce82c9eed37c4dc74021f4 | — | PASS |
| location_geocode_locality_audit_20260707 | 2,183 | 581,632 | location_geocode_locality_audit_20260707.dump | 88,922 | d5ba6bb7c9d376a427bd03af6f90ae29676dfc74c157816aa6de97ea1d4c603d | — | PASS |
| location_jsonld_contamination_20260709 | 6 | 16,384 | location_jsonld_contamination_20260709.dump | 4,163 | 9e59827b6607408229c104047c7c5b8378a292e4777213ca94c35b3bfe9486f9 | — | PASS |
| location_manual_address_geocode_fix_20260709 | 3 | 32,768 | location_manual_address_geocode_fix_20260709.dump | 4,805 | d90b943a345380f37b89d20c2ec578fb468752912f712c46e0a557b31f26401d | — | PASS |
| location_normalization_audit_20260707 | 9,398 | 1,261,568 | location_normalization_audit_20260707.dump | 120,996 | 92cdba7829d95b48acd3f43e05e937637c5a688e02a76ea365e067f76e56dc3c | — | PASS |
| location_website_serp_wrapper_audit_20260709 | 15 | 16,384 | location_website_serp_wrapper_audit_20260709.dump | 3,426 | 0c5795ccf230f49ef599dba645a41319da9a50ee8909d103f130b79387ac67a8 | — | PASS |
| location_wrong_branch_mini_fix_accepted_20260707 | 95 | 81,920 | location_wrong_branch_mini_fix_accepted_20260707.dump | 6,584 | 410c629e95ede8674fcf557f4b51deff483e861373c2230aae9ae1db97bb345e | — | PASS |
| location_wrong_branch_mini_fix_audit_20260707 | 480 | 98,304 | location_wrong_branch_mini_fix_audit_20260707.dump | 6,460 | 3548410a8a300ec05c597beaddc498fbc1ff6f8e234234bad52a09ee86ffea86 | — | PASS |
| location_wrong_branch_mini_fix_backup_20260707 | 97 | 73,728 | location_wrong_branch_mini_fix_backup_20260707.dump | 9,955 | 60336aacaf178337705f980d4bf0016468780077e89a58452d61413c2706f22f | — | PASS |
| location_wrong_branch_mini_fix_deletion_review_20260707 | 2 | 32,768 | location_wrong_branch_mini_fix_deletion_review_20260707.dump | 2,975 | 4a43ad29112b5e7a5a20447884f499f22e03534357291da9e7c572323c7c4214 | — | PASS |
| location_wrong_branch_mini_fix_resolved_review_20260707 | 97 | 73,728 | location_wrong_branch_mini_fix_resolved_review_20260707.dump | 4,579 | ede8ae6115bf3f6242155baa84d1249d46dca5728184af71f3cd6b765bc02343 | — | PASS |
| locations_backup_20260708_bookimed_cleanup_addendum | 9 | 16,384 | locations_backup_20260708_bookimed_cleanup_addendum.dump | 4,226 | fc72f045ed4835ec3d49a3698d99bd53f08dc843038c934923ed217affa88e7f | — | PASS |
| locations_backup_20260708_bookimed_mismatch_approvals | 5 | 16,384 | locations_backup_20260708_bookimed_mismatch_approvals.dump | 3,628 | 55f2b39dcfba16a0f5906ddb9c633ef5f0f8d0aaa4d61475927c865adee9778b | — | PASS |
| locations_backup_20260708_bookimed_website_backfill | 13,118 | 5,578,752 | locations_backup_20260708_bookimed_website_backfill.dump | 1,729,326 | b4fd6052d87dc6b73ba643f3e0f9e5c2e1aa009ce66049a3ed1b9f2eab91b3a0 | — | PASS |
| locations_backup_20260708_utm_tracking_hygiene | 13,118 | 5,578,752 | locations_backup_20260708_utm_tracking_hygiene.dump | 1,733,272 | 9ea1dd768f0c311f937f0a7fe66ab5db5e259e093d3206cd6f9e8ff9d5a238bd | — | PASS |
| locations_backup_20260709_google_serp_wrapper_hygiene | 13,118 | 5,578,752 | locations_backup_20260709_google_serp_wrapper_hygiene.dump | 1,733,287 | cce3630b09865d9d4293c7a3b280e39ea3b940e3b65e89c0562083b1f99d4a2f | — | PASS |
| locations_price_text_backup | 610 | 139,264 | locations_price_text_backup.dump | 19,612 | 2fa0b7b3b8067938f133429f4c1d002a1b29a28674965633cf3adaea96ebde1e | — | PASS |
| org_dedup_phase2_deleted_orgs_20260707 | 1 | 16,384 | org_dedup_phase2_deleted_orgs_20260707.dump | 2,386 | 294b8aa204a4b44155153959469c70bb47f73769473a7f93e0faa97cd74e223d | — | PASS |
| org_dedup_phase2_guardrail_20260707 | 106 | 81,920 | org_dedup_phase2_guardrail_20260707.dump | 5,283 | e3462bb03d6bc1f891a7aca933e32b46261a70ec2e32029d96bce0699855f93e | — | PASS |
| org_dedup_phase2_location_org_map_20260707 | 1,088 | 401,408 | org_dedup_phase2_location_org_map_20260707.dump | 37,251 | 41f1e4ae6416338fa3f4af33c5b829b1a7b39e7afa492728464eef3cb703a97e | — | PASS |
| org_dedup_phase2_new_orgs_20260707 | 410 | 172,032 | org_dedup_phase2_new_orgs_20260707.dump | 19,114 | cbfab6e255c838a115bcbca2e852dc9a486381ddb0b3b460813b6cc1f2fe9575 | — | PASS |
| organizations_backup_20260708_bookimed_cleanup_addendum | 7,286 | 4,251,648 | organizations_backup_20260708_bookimed_cleanup_addendum.dump | 1,117,194 | 2d441da5981f6b3e8bbc2a52d35150c74715fa29934cd5e798d398bb2a3975e0 | — | PASS |
| organizations_backup_20260708_bookimed_mismatch_approvals | 7,281 | 4,251,648 | organizations_backup_20260708_bookimed_mismatch_approvals.dump | 1,116,913 | 9bd06c111d65356072b175a72a27b5f6803d1d485b880cc885b2cf1993754b8e | — | PASS |
| organizations_backup_20260708_bookimed_website_backfill | 7,089 | 4,251,648 | organizations_backup_20260708_bookimed_website_backfill.dump | 1,105,364 | 15337fb16a7d107ff3d8541cb23973590378ecc04e934ddfd8c0a2d4ee4dad84 | — | PASS |
| places_website_backfill_guardrail_20260707 | 9 | 16,384 | places_website_backfill_guardrail_20260707.dump | 3,029 | 38647b0f30104bcaae0c741224bac857df17abbdfbd510fd24121ec1df798530 | — | PASS |
| places_website_backfill_location_actions_20260707 | 331 | 278,528 | places_website_backfill_location_actions_20260707.dump | 37,800 | c0730904ea20f236a809b51f3516f2f8d2ac0a784c172e2b873a992cb6b26b7c | — | PASS |
| places_website_backfill_new_orgs_20260707 | 214 | 106,496 | places_website_backfill_new_orgs_20260707.dump | 11,119 | 20ac3a3c4f85a412c4b31853af2869e5b40b5147e033b38663b576f2b3a84919 | — | PASS |
| places_website_backfill_org_map_20260707 | 308 | 122,880 | places_website_backfill_org_map_20260707.dump | 14,681 | b37308743db1c45901e720b19270ceb6eb5cfc2a639ae07fa1172f747bf5f5fb | — | PASS |
| reviews_dedupe_deleted_20260708 | 627 | 1,196,032 | reviews_dedupe_deleted_20260708.dump | 161,175 | e2e669b34a5001f8e3f319ec4623db0d4ea651fc3060ed7e58f4570e70be3e4a | — | PASS |
| reviews_dedupe_report_20260708 | 1 | 8,192 | reviews_dedupe_report_20260708.dump | 1,930 | 0eef58558b4224b767e4b6d933510563ab77c02b2022ceb37e44d9f03cd98781 | — | PASS |
| schema_streamlining_categories_backup_20260708 | 7 | 16,384 | schema_streamlining_categories_backup_20260708.dump | 1,990 | 594046f9c425aa69ac2f84e18f53a149c8fe0693f2a9490d1b39429ecdc9838a | — | PASS |
| schema_streamlining_documents_backup_20260708 | 0 | 8,192 | schema_streamlining_documents_backup_20260708.dump | 2,304 | 8ba19cf46353659692f280729be95140c8c3d654848bc2e4bf4ae34d83451f9d | — | PASS |
| schema_streamlining_external_place_matches_text_backup_20260708 | 2,544 | 352,256 | schema_streamlining_external_place_matches_text_backup_20260708.dump | 30,049 | 955bf6b6227956c7dc5ccdec7ca0096cf08b0ae67527995eb4cf864fe2f3a076 | — | PASS |
| schema_streamlining_images_local_path_backup_20260708 | 0 | 8,192 | schema_streamlining_images_local_path_backup_20260708.dump | 1,833 | 93b89344bd62b479aa5c26e0c055928c9558216267fa016af41db30c5efd6c70 | — | PASS |
| schema_streamlining_pre_migration_counts_20260708 | 1 | 8,192 | schema_streamlining_pre_migration_counts_20260708.dump | 2,259 | 44de395b7f5e4f239bb4e3b3b17fd8746c2112acdba56c59cc7fc6c7254ca316 | — | PASS |
| schema_streamlining_retired_raw_tables_20260708 | 15 | 8,192 | schema_streamlining_retired_raw_tables_20260708.dump | 2,191 | f0dde00871814fc3e9421c7fab09c336bebb9be5b9190ffe6bc3ee9f7bd9d6d7 | — | PASS |
| schema_streamlining_review_format_audit_20260708 | 2 | 16,384 | schema_streamlining_review_format_audit_20260708.dump | 2,264 | 63c521c38b89950a9bd7869f03cbcb8d2c88a92d63c0e01489d417bb7bca8f0a | — | PASS |
| schema_streamlining_review_migration_audit_20260708 | 1 | 8,192 | schema_streamlining_review_migration_audit_20260708.dump | 2,341 | 8fc416695e488a2691fbdfa744b9ff3b124ceccd90b3c1be0501e17b9850e220 | — | PASS |
| schema_streamlining_sources_backup_20260708 | 254 | 73,728 | schema_streamlining_sources_backup_20260708.dump | 7,262 | 5075945b7352c24b879c4db0771cf82b2fe41debd454c3f4fe2f6c73be550d16 | — | PASS |
| schema_streamlining_treatments_backup_20260708 | 43 | 16,384 | schema_streamlining_treatments_backup_20260708.dump | 2,412 | 8009457c216fb5c977e5fd228e3132d6eda431260ddc3abfa1dec408eef41cb7 | — | PASS |
| source_images_purged_20260708 | 6,368 | 2,138,112 | source_images_purged_20260708.dump | 388,640 | 5e246f630ecc0be59fd450ea634c8b8ac11a3e99f10270a603b025bf68ebdcb9 | — | PASS |
| taxonomy_mapping_audit_20260710 | 5,798 | 1,220,608 | taxonomy_mapping_audit_20260710.dump | 122,205 | 2e500028a29d2622914e7f4e9ba8e8def63e7c44276da9d35832bac02ef77996 | — | PASS |
| taxonomy_new_treatment_proposals_20260710 | 20 | 49,152 | taxonomy_new_treatment_proposals_20260710.dump | 4,951 | c8452fb6c5a5a02fa1b9143c019236c45384c1c06172fee5d326d9a4d527b43f | — | PASS |
| taxonomy_phase4_alias_remap_audit_20260711 | 8 | 16,384 | taxonomy_phase4_alias_remap_audit_20260711.dump | 2,272 | 43ebedba1f0c2fd754343fbb86e89ddb36030c421ba7dd70c614da5919b1457f | — | PASS |
| taxonomy_phase4_offering_remap_audit_20260711 | 7,738 | 1,441,792 | taxonomy_phase4_offering_remap_audit_20260711.dump | 139,428 | 2419f7a3d61e4a83182673705c2294100070e4ac12ae178ff68136c32afb6a97 | — | PASS |
| taxonomy_phase4_offering_treatment_backup_20260711 | 100,535 | 3,686,400 | taxonomy_phase4_offering_treatment_backup_20260711.dump | 262,734 | 7c04a5e1e89639b44da4f5f0ab6c79a087f3ebf35f20ba4d40c666eb50c2e612 | — | PASS |
| taxonomy_phase4_rejected_terms_20260711 | 4 | 32,768 | taxonomy_phase4_rejected_terms_20260711.dump | 2,576 | ed26df1c5962b21fb390f4d74b93ab6e5bf48a75d20d84e859fb59fff9e4c375 | — | PASS |
| taxonomy_phase4_treatment_aliases_backup_20260711 | 3,080 | 450,560 | taxonomy_phase4_treatment_aliases_backup_20260711.dump | 69,242 | 6cbfdac6f0eccc64ee1bea6b6dbd1ef5025bc5207e1b06b5b7d2e4c4d6fcd507 | — | PASS |
| taxonomy_phase4_treatments_backup_20260711 | 43 | 16,384 | taxonomy_phase4_treatments_backup_20260711.dump | 2,461 | ff578ec068b633e9979bfb70da32b6b1232cfba79d0f677e40b1cdeb5a41202e | — | PASS |
| taxonomy_term_corpus_20260710 | 42,922 | 14,344,192 | taxonomy_term_corpus_20260710.dump | 1,031,308 | 1539ee91e5c0267ec0fb696275d0399618693c7d78d84011704373857b818155 | — | PASS |
| url_tracking_hygiene_audit_20260708 | 4 | 16,384 | url_tracking_hygiene_audit_20260708.dump | 2,588 | 49b8b1753f258c344112508e66cd20faaf5b98645b96cca8e94e58bfcf5ea5e5 | — | PASS |
| website_image_harvest_candidates_20260708 | 4,263 | 2,818,048 | website_image_harvest_candidates_20260708.dump | 244,222 | 07464f7d58d386e64cf2992b7dfc225d4ec41c9da62a516585fc62858d221e73 | — | PASS |
| website_image_harvest_results_20260708 | 2,283 | 991,232 | website_image_harvest_results_20260708.dump | 147,509 | 2c63a6959b2ec1d97c066c9550f0c8cd8829ae8d2a7b40bab5ad065161d5e6cd | — | PASS |

## Post-drop verification

- Remaining fountain_raw tables: 49
- Remaining fountain_raw sequences: 10
- Orphan/free-standing sequences: 0
- Remaining fountain_raw rows: 545,122
