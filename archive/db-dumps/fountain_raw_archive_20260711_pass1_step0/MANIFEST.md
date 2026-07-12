# fountain_raw Pass 1 Step 0 Archive Manifest — 2026-07-11

**Status:** COMPLETE — dumps verified, scratch restores passed, source tables dropped
**Created (UTC):** 2026-07-12T01:57:05.048Z
**Completed (UTC):** 2026-07-12T02:05:13.136Z
**PostgreSQL server:** 17.10 (986efc8)
**Dump/restore client:** pg_dump (PostgreSQL) 17.10 (Homebrew)
**Snapshot:** 00000019-00000002-1

Connection credentials are intentionally omitted. Dump payloads are local-only; this manifest is versioned.

## Summary

- Tables: 28
- Owned sequences included: 5
- Snapshot rows: 178,143
- Source relation bytes: 54,673,408 (52.14 MiB)
- Compressed dump bytes: 8,590,019 (8.19 MiB)
- pg_restore --list verified: 28/28

## Scratch restore verification

| Table | Manifest rows | Restored rows | SHA before | SHA after | Result |
|---|---:|---:|---|---|---|
| final_closeout_offerings_backup_20260711 | 100,535 | 100,535 | 9eaf9b74804d64118b8a50215161829a5a9827cfe21ada992e44013a91127198 | 9eaf9b74804d64118b8a50215161829a5a9827cfe21ada992e44013a91127198 | PASS |
| taxonomy_final_corpus_20260711 | 43,647 | 43,647 | 640c6b4da935988b02597b209b01e0c0149500d93694276155b77d822671654c | 640c6b4da935988b02597b209b01e0c0149500d93694276155b77d822671654c | PASS |

## Dumps

| Table | Gate disposition | Rows | Source bytes | Dump file | Dump bytes | SHA-256 | Owned sequence(s) | TOC |
|---|---|---:|---:|---|---:|---|---|---|
| bookimed_website_backfill_location_actions_20260708 | A* | 266 | 278,528 | bookimed_website_backfill_location_actions_20260708.dump | 37,605 | 5f37620df4c8b31471d6a5f3830182151b30a4b2a6ce572f6736c16fa0b47a34 | — | PASS |
| clinic_website_offering_extractions_20260711 | A* | 636 | 819,200 | clinic_website_offering_extractions_20260711.dump | 119,979 | 5a369e281c4ca95b6c94abc1adee98e221aababbe2661ef08236b141531b9390 | — | PASS |
| field_corrections_backup_20260711 | A* | 43 | 139,264 | field_corrections_backup_20260711.dump | 8,584 | 26986d9410b83e2f49e61a24331b32ffa98bba1210c8ed1e27355ca2c22a6977 | — | PASS |
| final_closeout_offerings_backup_20260711 | A* | 100,535 | 16,695,296 | final_closeout_offerings_backup_20260711.dump | 2,014,022 | 9eaf9b74804d64118b8a50215161829a5a9827cfe21ada992e44013a91127198 | — | PASS |
| final_closeout_search_function_backup_20260711 | A* | 1 | 16,384 | final_closeout_search_function_backup_20260711.dump | 2,578 | a0e6c3c4414e2818c1208d734b8b57924163f52eca95e7b98e106283e7bf71a9 | — | PASS |
| final_closeout_search_index_backup_20260711 | A* | 14,824 | 9,183,232 | final_closeout_search_index_backup_20260711.dump | 2,357,659 | ecf37ff649e5ba4ba425193a13b4cfe00f7819f83be2ab1c487c84965b3b1583 | — | PASS |
| final_closeout_treatment_aliases_backup_20260711 | A* | 3,399 | 491,520 | final_closeout_treatment_aliases_backup_20260711.dump | 74,262 | 793ed297c21e80442c899ec9f5ae1906837195c584b6c1e0f5800536fbd40134 | — | PASS |
| final_closeout_treatments_backup_20260711 | A* | 62 | 16,384 | final_closeout_treatments_backup_20260711.dump | 3,190 | 66604069dc1673acd7a6be8ec9f7a95b31ebb5632d337d1ed965961d7b49623c | — | PASS |
| hyperbaric_app_image_audit_20260710 | L | 983 | 909,312 | hyperbaric_app_image_audit_20260710.dump | 166,831 | a4d44095ca71d1b9ff2a1982a10e342668881e863ce9e4ba2e1301525f05d760 | — | PASS |
| hyperbaric_app_promotion_audit_20260710 | L | 1,220 | 376,832 | hyperbaric_app_promotion_audit_20260710.dump | 63,270 | ff49140882780fcd71e29635b66295ee831b613f8c3b42bafe73a4efdaaeb8e8 | hyperbaric_app_promotion_audit_20260710_id_seq | PASS |
| hyperbaric_cleanup_call_ledger_20260711 | A* | 3,926 | 2,310,144 | hyperbaric_cleanup_call_ledger_20260711.dump | 203,051 | aca8fabb7e4e1b78087fdc928d125be41c1cd399372a69a15f95c2f256402115 | hyperbaric_cleanup_call_ledger_20260711_id_seq | PASS |
| hyperbaric_cleanup_queue_20260710 | A* | 983 | 385,024 | hyperbaric_cleanup_queue_20260710.dump | 25,197 | c5c3ea617694740448f1fbed0953072eb4155a51105b0d3065a165e18abc8a38 | — | PASS |
| hyperbaric_cleanup_queue_20260711 | A* | 946 | 524,288 | hyperbaric_cleanup_queue_20260711.dump | 137,048 | 3be3ce4ce745f2ce06b8c58bee1ff2eeeacc3c5d482b91691df8279943089310 | — | PASS |
| hyperbaric_cleanup_results_20260710 | A* | 983 | 1,105,920 | hyperbaric_cleanup_results_20260710.dump | 123,835 | 650cac627bba6b19308f6cb569554aab0a517d06e08ba68699a6aa14ec9b1d9c | — | PASS |
| hyperbaric_cleanup_website_fetches_20260711 | A* | 1,806 | 827,392 | hyperbaric_cleanup_website_fetches_20260711.dump | 110,113 | aff9f3e6cc7705116aae1ebc4f5604269fbec9a531cdaa1095fa151c3df9c6d4 | hyperbaric_cleanup_website_fetches_20260711_id_seq | PASS |
| hyperbaric_dedup_candidates_20260710 | A* | 4 | 32,768 | hyperbaric_dedup_candidates_20260710.dump | 2,747 | 71f39c0ce51db6ada74c43d60ae62082e500fc970e37da8bd8be519813af74c4 | — | PASS |
| hyperbaric_field_corrections_backup_20260710 | A* | 66 | 65,536 | hyperbaric_field_corrections_backup_20260710.dump | 13,222 | b007d6f6cae2d1adc9265a55eba9a6281276ecf90f8f0e081bee08b2d9bc98de | — | PASS |
| hyperbaric_price_review_20260710 | A* | 0 | 16,384 | hyperbaric_price_review_20260710.dump | 2,398 | 93a03c6b30c73ba7ea4bdd4fd57645a4ae35071b2c7d2e39eb5df27e2d082821 | — | PASS |
| hyperbaric_task_d_contact_fills_20260711 | A* | 3 | 32,768 | hyperbaric_task_d_contact_fills_20260711.dump | 2,837 | 67da82a8132488c4147197d13a4795a6eecb57b2886d031613f73fbda471b392 | — | PASS |
| hyperbaric_task_d_review_backfill_20260711 | A* | 119 | 81,920 | hyperbaric_task_d_review_backfill_20260711.dump | 6,529 | d5b296b4688582ed7a0ee80c9f9321133e50483afec0b13a1321a05e68aa201c | — | PASS |
| location_geocode_wrong_branch_address_20260707 | A* | 13 | 106,496 | location_geocode_wrong_branch_address_20260707.dump | 4,050 | 1bf81fa42d1a6966b393dedbb38d73f41b39071d706c82987a738925b8364ab8 | — | PASS |
| taxonomy_dedup_merge_audit_20260712 | A* | 9 | 16,384 | taxonomy_dedup_merge_audit_20260712.dump | 2,320 | 43ca3a4d793cdb1676b010b0a15f69da3522912c68ed3ce48a70cdb8985067f1 | — | PASS |
| taxonomy_dedup_offerings_backup_20260712 | A* | 1,260 | 253,952 | taxonomy_dedup_offerings_backup_20260712.dump | 37,090 | ac35803f2587a0790c84d728cc5a80804f803c92e398d50b77ecc431a984c557 | — | PASS |
| taxonomy_dedup_treatment_aliases_backup_20260712 | A* | 32 | 16,384 | taxonomy_dedup_treatment_aliases_backup_20260712.dump | 2,553 | 3ea03ff6e0bfbbc793e0a744aa0e39dee6c4cc8ae3b9cb4ab2fefb78861aef57 | — | PASS |
| taxonomy_dedup_treatments_backup_20260712 | A* | 15 | 16,384 | taxonomy_dedup_treatments_backup_20260712.dump | 2,283 | da78fc2b2855aa92ded45e918e95a7f8026739ff16c5c32737e1be2c78ac70ae | — | PASS |
| taxonomy_final_corpus_20260711 | A* | 43,647 | 14,368,768 | taxonomy_final_corpus_20260711.dump | 1,049,078 | 640c6b4da935988b02597b209b01e0c0149500d93694276155b77d822671654c | — | PASS |
| taxonomy_final_llm_ledger_20260711 | A* | 546 | 5,251,072 | taxonomy_final_llm_ledger_20260711.dump | 1,983,418 | 3c8b24324b6bfcea19f9207f0c7366401185c61b131864acb5cbedbde1787d57 | taxonomy_final_llm_ledger_20260711_id_seq | PASS |
| taxonomy_final_remap_audit_20260711 | A* | 1,816 | 335,872 | taxonomy_final_remap_audit_20260711.dump | 34,270 | c7a7453c554a68c93c170800d0863dacb22072b6828c3b48a187eef8a7c4caae | taxonomy_final_remap_audit_20260711_id_seq | PASS |

## Post-drop verification

- Remaining fountain_raw tables: 21
- Remaining fountain_raw sequences: 5
- Orphan/free-standing sequences: 0
- Remaining fountain_raw rows: 366,979
