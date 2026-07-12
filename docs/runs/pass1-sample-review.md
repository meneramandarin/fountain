# Pass 1 Legitimacy Triage — Gate A Sample Review

**GATE A AWAITING APPROVAL**

What was done: Classified a deterministic, mutually exclusive sample of 300 eligible active locations.

Evidence: 13,521 active; 0 hard-excluded; 13,521 eligible. Actual usage and weighted projections are below.

Deviations from rubric/plan: none. The unspecified website-cache TTL is seven days for both successes and failures.

Open questions: Review the would-be suppressions first and approve or revise the rubric/threshold.

## Step 0 housekeeping (pre-approved)

- Archived and dropped exactly 28 formerly code-referenced `fountain_raw` hold tables: 178,143 rows, 54,673,408 source bytes, and five owned sequences.
- Verified all 28 custom dumps with `pg_restore --list` and SHA-256; compressed payload total: 8,590,019 bytes.
- Scratch-restored the two largest tables with exact row reconciliation: `final_closeout_offerings_backup_20260711` 100,535/100,535 and `taxonomy_final_corpus_20260711` 43,647/43,647.
- Post-drop `fountain_raw`: 21 tables, 366,979 rows, five sequences, zero orphan sequences. All 11 unresolved workflow/review tables remain present.
- Evidence: [Pass 1 Step 0 archive manifest](../../archive/db-dumps/fountain_raw_archive_20260711_pass1_step0/MANIFEST.md).

## Execution safety

- Drain run(s): `21`.
- Queue reconciliation: 300/300 terminal classified rows; 0 serving-write attempts in task results.
- Gate A classification wrote only `fountain_ops` run/call/queue evidence and the local website cache; suppression remains gated to Gate B.

## Sample composition

| Stratum | Population | Sample |
| --- | ---: | ---: |
| hyperbaric | 859 | 50 |
| hospital | 1,876 | 50 |
| random | 10,786 | 200 |

The 50-row hospital-flavored oversample spans 31 countries.

## Class counts

| Class | Count |
| --- | ---: |
| junk | 21 |
| plain_hospital | 88 |
| review | 12 |
| destination_medical | 11 |
| in_scope | 168 |

## Observed usage

| Metric | Actual |
| --- | ---: |
| External calls | 20 |
| Stage 1 calls | 15 |
| Stage 2 calls | 5 |
| Input tokens | 57,881 |
| Output tokens | 10,747 |
| Estimated spend | $0.0151 |
| Stage 2 candidates | 35 |
| Website fetch attempts | 33 |
| Cache hits | 0 |
| Network fetches | 33 |
| Fetch failures | 7 |
| No website | 2 |

## Stratum-weighted full-run projection

The projection weights each mutually exclusive sample stratum back to its eligible population; it does not treat the oversample as a simple random sample.

| Metric | Projected |
| --- | ---: |
| Eligible locations | 13,521 |
| Input tokens | 2,708,330.2 |
| Output tokens | 489,358.6 |
| Total estimated spend | $0.6999 |
| Remaining estimated spend after sample | $0.6847 |
| Stage 2 candidates | 1,789.1 |
| Website fetch attempts | 1,697.6 |
| Cache hits | 0 |
| Network fetches | 1,697.6 |

## Full sample

Would-be suppressions (`junk`, then `plain_hospital`) are sorted first.

| Name | Locality | Source | Stratum | Class | Confidence | Rationale |
| --- | --- | --- | --- | --- | ---: | --- |
| 865PT | Knoxville, TN, US | menu_enrichment, stem_cell_authority | random | junk | 1.00 | Physical therapy center lacks a clear focus on wellness or longevity. |
| Advanced Physical Therapy Solutions | Hope Mills, NC, US | menu_enrichment | random | junk | 0.90 | No wellness or longevity services mentioned. |
| Aletheia House | Selma, AL, US | menu_enrichment_agent_run_15 | random | junk | 0.95 | Non-medical organization with no wellness services. |
| Alternative Wellness Centers | Holyoke, MA, US | menu_enrichment_agent_run_18 | random | junk | 0.90 | Focus on cannabis and general wellness without specific longevity services makes it a junk business. |
| Animal Emergency & Referral Center of Minnesota (AERC) | St. Paul, MN, US | menu_enrichment_agent_run_10, stem_cell_authority | random | junk | 0.95 | Veterinary clinic, not related to human wellness or longevity. |
| Brain Injury Connections of the Shenandoah Valley, Inc. | Buena Vista, VA, US | menu_enrichment_agent_run_04 | random | junk | 0.85 | Focuses on support services, not wellness or longevity. |
| Cornell & Associates Marriage and Family Therapy | New York, NY, US | menu_enrichment | random | junk | 0.95 | Therapy practice without a wellness or longevity focus. |
| CVS | Hialeah, FL, US | menu_enrichment_agent_run_04, stem_cell_authority | random | junk | 0.95 | Retail pharmacy with no wellness or longevity services. |
| Greg Martin Skin | Modesto, CA, US | stem_cell_authority | random | junk | 0.90 | No wellness offerings or services mentioned. |
| Intravene Mobile IV Therapy – Tampa | Centennial, CO, US | menu_enrichment_agent_run_10 | random | junk | 0.90 | No wellness or longevity services mentioned. |
| Just Breathe O2 | London, GB | hyperbaric_app | hyperbaric | junk | 0.90 | Instagram is not a legitimate business website; lacks evidence of wellness services. |
| Lowe’s Home Improvement | Kernersville, NC, US | menu_enrichment_agent_run_19 | random | junk | 1.00 | Not a wellness business; it's a home improvement store. |
| Neuro Rehab Collaborative | Roanoke, VA, US | stem_cell_authority | random | junk | 0.85 | Focuses on rehabilitation services, not wellness. |
| Office Depot | Houston, TX, US | menu_enrichment_agent_run_18 | random | junk | 1.00 | Office supply store is not a wellness business. |
| Second Stage \| Amherst | Amherst, VA, US | stem_cell_authority | random | junk | 0.90 | Community arts center, not a wellness or healthcare business. |
| Smash It Rage Room | Montgomery, AL, US | stem_cell_authority | random | junk | 1.00 | Not a wellness business; it's an entertainment venue. |
| StemLife; Stem Cell Therapy | Overland Park, KS, US | stem_cell_authority | random | junk | 0.85 | Sells a supplement, not a wellness clinic or service. |
| Target | Riverside, CA, US | stem_cell_authority | random | junk | 1.00 | Target is a retail store, not a wellness business. |
| Target | Riverside, CA, US | stem_cell_authority | random | junk | 1.00 | Not a wellness business; it's a retail store. |
| Vadim Fitness Studio, Ltd | Scarsdale, NY, US | bioedge_clinics, menu_enrichment | random | junk | 0.85 | Pure fitness studio with no wellness or recovery services. |
| Walmart Supercenter | Riverside, CA, US | stem_cell_authority | random | junk | 1.00 | Supercenter is a retail store, not a wellness business. |
| Adult & Pediatric Dermatology | Lexington, MA, US | menu_enrichment | random | plain_hospital | 0.80 | Dermatology practice likely provides standard medical care, not wellness-focused services. |
| Advanced Dermatology & Skin Cancer Associates | Oxford, MS, US | menu_enrichment_agent_run_16 | random | plain_hospital | 0.80 | A dermatology clinic focused on skin cancer, typical of conventional healthcare. |
| Advanced Therapy Solutions | Clarksville, TN, US | menu_enrichment | random | plain_hospital | 0.90 | Offers pediatric therapy services, not specifically longevity or wellness. |
| AdvantageCare Physicians - Clove Road Medical Office | Staten Island, NY, US | bioedge_clinics, menu_enrichment_agent_run_06 | random | plain_hospital | 0.90 | General medical office with no specific wellness focus. |
| All-Star Orthopaedics | Southlake, TX, US | menu_enrichment_agent_run_19 | random | plain_hospital | 0.90 | Orthopaedic services are standard healthcare, not focused on wellness. |
| Arthritis Center of New Jersey | Jersey City, NJ, US | stem_cell_authority | random | plain_hospital | 0.90 | An arthritis center focused on treatment rather than wellness or longevity. |
| Associated Pain Specialists | Gray, TN, US | menu_enrichment_agent_run_09 | random | plain_hospital | 0.85 | Pain management clinic without a specific wellness or longevity focus. |
| Atlantic Orthopaedic Specialist – Kempsville | Virginia Beach, VA, US | menu_enrichment_agent_run_03 | random | plain_hospital | 0.80 | An orthopedic specialist, primarily focused on traditional medical care. |
| Atlantic Orthopaedic Specialist – Kempsville | Virginia Beach, VA, US | menu_enrichment_agent_run_03 | random | plain_hospital | 0.85 | Part of a hospital system, primarily focused on traditional medical care. |
| Autism Specialist in Kolkata - HBOT Therapy | Kolkata, IN | clinic_websites, hyperbaric_app | hyperbaric | plain_hospital | 0.85 | Focus on autism treatment indicates a medical rather than wellness approach. |
| Barron Bremner, DO | Des Moines, IA, US | menu_enrichment_agent_run_19 | random | plain_hospital | 0.90 | Focuses on interventional physiatry, primarily a medical treatment. |
| Brooklyn Integrative Psychiatry | Brooklyn, NY, US | bioedge_clinics, menu_enrichment | random | plain_hospital | 0.85 | Focuses on psychiatric services, not wellness. |
| California Dermatology Physicians | Huntington Beach, CA, US | menu_enrichment_agent_run_12, stem_cell_authority | random | plain_hospital | 0.90 | Dermatology practice focused on medical skin conditions. |
| cCARE Cancer Center | Chula Vista, CA, US | menu_enrichment_agent_run_12 | random | plain_hospital | 0.90 | A cancer center focused on treatment rather than wellness. |
| cCARE Cancer Center | San Diego, CA, US | menu_enrichment_agent_run_12 | random | plain_hospital | 0.90 | cCARE Cancer Center focuses on cancer treatment, not wellness or longevity care. |
| Center for Sports Medicine & Orthopaedics | Cleveland, TN, US | menu_enrichment_agent_run_08, menu_enrichment_agent_run_10 | random | plain_hospital | 0.80 | An orthopedic center providing standard medical services, not focused on wellness. |
| Center for Vein Restoration \| Dr. Michelle Nguyen | McLean, VA, US | menu_enrichment_agent_run_13 | random | plain_hospital | 0.90 | Focuses on vein restoration, primarily a medical treatment. |
| City of Hope Cancer Center Phoenix | Goodyear, AZ, US | stem_cell_authority | random | plain_hospital | 0.90 | A cancer center focused on treatment rather than wellness or longevity. |
| CMH Center For Family Health: Armijo Cristina A MD | Oxnard, CA, US | stem_cell_authority | random | plain_hospital | 0.90 | A cancer center primarily focused on treatment, not wellness or longevity. |
| Collaborative Health Specialty Services | Lynchburg, VA, US | menu_enrichment_agent_run_14 | random | plain_hospital | 0.90 | Offers general healthcare services, not focused on longevity or wellness care. |
| Complete Health – Simon-Williamson Urgent Care | Birmingham, AL, US | stem_cell_authority | random | plain_hospital | 0.85 | Urgent care facility with no specific wellness focus. |
| Complexions Dermatology | Greensboro, NC, US | menu_enrichment_agent_run_07, menu_enrichment_agent_run_16 | random | plain_hospital | 0.90 | Dermatology practice focused on general skin care, not wellness. |
| Cone Health Regional Center for Infectious Disease | Greensboro, NC, US | menu_enrichment_agent_run_11, stem_cell_authority | random | plain_hospital | 0.90 | Infectious disease center, primarily focused on treatment, not wellness. |
| Cooper Green Mercy Health Services an Affiliate of UAB | Birmingham, AL, US | menu_enrichment_agent_run_07, stem_cell_authority | random | plain_hospital | 0.90 | General healthcare services provided, not specifically focused on wellness or longevity. |
| Curex Cancer Centre (Oncology care by Dr. Ringta Mukherjee & Dr. Ankit Khandelwal, Unit of CUREX CLINIC. (HBOT Therapy) | Kolkata, IN | clinic_websites, hyperbaric_app | hyperbaric | plain_hospital | 0.85 | Oncology care suggests a focus on treating illness rather than wellness. |
| Direct Performance Physical Therapy | Virginia Beach, VA, US | menu_enrichment_agent_run_09 | random | plain_hospital | 0.85 | Physical therapy service without a clear wellness or longevity focus. |
| Doctors Regional Cancer Treatment | Laredo, TX, US | menu_enrichment_agent_run_12, stem_cell_authority | random | plain_hospital | 0.90 | Cancer treatment center within a hospital, focused on traditional medical care. |
| Dr. Anthony M. Bevilacqua, DO | Suffolk, VA, US | menu_enrichment_agent_run_03 | random | plain_hospital | 0.85 | Offers standard medical treatments, not focused on wellness or longevity. |
| Dr. Mindee Flippin, MD | Wolfforth, TX, US | menu_enrichment_agent_run_17, stem_cell_authority | random | plain_hospital | 0.90 | Standard medical practice, not focused on wellness or longevity. |
| Duly Health and Care | Shorewood, IL, US | menu_enrichment_agent_run_00 | random | plain_hospital | 0.85 | General healthcare provider with no specific wellness focus. |
| Erlanger Physical Therapy | Cleveland, TN, US | menu_enrichment_agent_run_01 | random | plain_hospital | 0.85 | Part of a hospital system, primarily focused on traditional medical care. |
| Excelsior Orthopaedics | Elma, NY, US | menu_enrichment_agent_run_01, menu_enrichment_agent_run_07 | random | plain_hospital | 0.90 | Orthopaedic services are standard healthcare, not focused on wellness. |
| Expert Clinic | Uzhhorod, UA | bookimed_longevity | hospital | plain_hospital | 0.80 | Expert Clinic is a general private hospital offering various medical services, not specifically focused on wellness. |
| Family Care Center | Pawtucket, RI, US | menu_enrichment_agent_run_01, stem_cell_authority | random | plain_hospital | 0.90 | General healthcare services, not focused on wellness or longevity. |
| Galway Clinic Dexa | Galway, IE | dexa_ireland_scan_providers, menu_enrichment | hospital | plain_hospital | 0.90 | General hospital services do not cater to self-paying wellness travelers. |
| Genesis Cancer Center, Davenport | Davenport, IA, US | stem_cell_authority | random | plain_hospital | 0.80 | Cancer center provides standard medical care, not wellness-focused services. |
| Hands on Health Physical Therapy and Wellness LLC | New Orleans, LA, US | menu_enrichment_agent_run_07, stem_cell_authority | random | plain_hospital | 0.90 | Physical therapy is a standard healthcare service, not focused on wellness or longevity. |
| HealthPartners Orthopedics St. Paul | Saint Paul, MN, US | menu_enrichment_agent_run_08, stem_cell_authority | random | plain_hospital | 0.90 | Orthopedic clinic focused on general medical care, not wellness. |
| Hillcrest Firethorn | Gretna, NE, US | menu_enrichment_agent_run_08 | random | plain_hospital | 0.80 | General healthcare facility likely does not focus on wellness or longevity. |
| Hospital Havelhoehe | Berlin, DE | bookimed_longevity, menu_enrichment_agent_run_18 | hospital | plain_hospital | 0.95 | General hospital services do not cater to self-paying wellness travelers. |
| Hughston Rehabilitation | LaGrange, GA, US | menu_enrichment_agent_run_15 | random | plain_hospital | 0.85 | Rehabilitation services are part of standard healthcare, not specifically wellness-focused. |
| Humanitas Research Hospital | Torino, IT | menu_enrichment_agent_run_15 | hospital | plain_hospital | 0.80 | Standard hospital services, not specifically wellness-focused. |
| I-MED Radiology Cairns | Cairns, AU | dexa_australia_scan_providers, menu_enrichment | hospital | plain_hospital | 0.80 | Provides standard radiology services, not specifically wellness-focused. |
| Imaging Healthcare Specialists | San Diego, CA, US | service_discovery_18 | random | plain_hospital | 0.80 | Primarily a diagnostic imaging center, not focused on wellness or longevity. |
| In Motion at Ghent Station | Colonial Heights, VA, US | menu_enrichment_agent_run_08, menu_enrichment_agent_run_16 | random | plain_hospital | 0.85 | General ENT clinic without a specific wellness focus. |
| Jacksonville Orthopaedic Institute- San Marco | Nocatee, FL, US | menu_enrichment_agent_run_10 | random | plain_hospital | 0.90 | Orthopedic institute focused on general medical care, not wellness. |
| JenCare Senior Medical Center | Colonial Heights, VA, US | menu_enrichment_agent_run_17, stem_cell_authority | hospital | plain_hospital | 0.80 | Provides standard medical services, not specifically wellness-focused. |
| Kern Medical Emergency Room | Bakersfield, CA, US | menu_enrichment_agent_run_12, menu_enrichment_agent_run_15 | random | plain_hospital | 0.80 | An emergency room, primarily focused on urgent medical care. |
| Lakeview Center For Urology | Audubon, IA, US | menu_enrichment_agent_run_19 | random | plain_hospital | 0.80 | Urology center likely provides standard medical care, not wellness-focused services. |
| Las Vegas Neurology Center | Las Vegas, NV, US | menu_enrichment_agent_run_18 | random | plain_hospital | 0.80 | Neurology center likely provides standard medical care rather than wellness-focused services. |
| Lewis Pain & Physical Medicine | Frisco, TX, US | menu_enrichment_agent_run_03, stem_cell_authority | random | plain_hospital | 0.80 | Focuses on pain management and physical medicine, typical of conventional healthcare. |
| Little Peach Pediatric Therapy – Prattville | Prattville, AL, US | menu_enrichment_agent_run_14 | random | plain_hospital | 0.90 | Provides therapy services primarily for children, not focused on wellness or longevity. |
| Mercy Therapy Services – Quailbrook | Oklahoma City, OK, US | hyperbaric_app, menu_enrichment_agent_run_04, stem_cell_authority | hyperbaric | plain_hospital | 0.85 | Provides general rehabilitation services, not focused on wellness. |
| Methodist Sports Medicine | Grand Prairie, TX, US | menu_enrichment_agent_run_16, stem_cell_authority | random | plain_hospital | 0.85 | Sports medicine services are standard healthcare, not focused on wellness. |
| Michael Rytel, MD (GPOA) | Pittsburgh, PA, US | stem_cell_authority | random | plain_hospital | 0.85 | Michael Rytel, MD provides sports medicine and orthopedic treatments, which are not primarily wellness-focused. |
| Montgomery Osteopractic Physical Therapy & Acupuncture | Montgomery, AL, US | stem_cell_authority | random | plain_hospital | 0.90 | Offers physical therapy and acupuncture, but primarily focuses on rehabilitation rather than wellness. |
| Mountainview Cardiovascular and Thoracic Surgery Associates | North Las Vegas, NV, US | menu_enrichment_agent_run_14, stem_cell_authority | random | plain_hospital | 0.90 | Surgical center focused on cardiovascular procedures. |
| National Spine & Pain Centers – Harrisonburg | Harrisonburg, VA, US | menu_enrichment_agent_run_07, stem_cell_authority | random | plain_hospital | 0.90 | Part of a hospital system, primarily focused on traditional medical care. |
| Nevada Retina Center | Henderson, NV, US | menu_enrichment_agent_run_00 | random | plain_hospital | 0.85 | Specialized eye care clinic without a wellness focus. |
| Newark Podiatrists – Podiatry Center of New Jersey | Hawthorne, NJ, US | menu_enrichment_agent_run_10 | random | plain_hospital | 0.90 | Podiatry center focused on general foot care, not wellness or longevity. |
| NewYork-Presbyterian Medical Group Queens - Primary Care | Whitestone, NY, US | menu_enrichment_agent_run_13, menu_enrichment_agent_run_15 | random | plain_hospital | 0.90 | Primary care focus, not a wellness destination. |
| Ocean Emotion Therapy Associates Hudson County (EMDR, Individual, Couple and Family Therapy) | Morris County, NJ, US | menu_enrichment | random | plain_hospital | 0.85 | Provides mental health services, but not focused on longevity or wellness. |
| Parkland Pediatric center | Garland, TX, US | stem_cell_authority | random | plain_hospital | 0.85 | Pediatric center likely focuses on standard healthcare, not wellness or longevity. |
| Pike Creek Sports Medicine And Professional Center | Wilmington, DE, US | stem_cell_authority | random | plain_hospital | 0.90 | Standard medical practice, not focused on wellness or longevity. |
| Pinewood Family Care - Northern NJ | Wyckoff, NJ, US | menu_enrichment | random | plain_hospital | 0.85 | Pinewood Family Care offers primary care services, not specifically focused on wellness or longevity. |
| ProRehab Physical Therapy – GE Appliance Park | Louisville, KY, US | stem_cell_authority | random | plain_hospital | 0.90 | Physical therapy is a standard healthcare service, not focused on wellness or longevity. |
| PT Solutions of Brimhall | Bakersfield, CA, US | stem_cell_authority | random | plain_hospital | 0.90 | Standard physical therapy services, not focused on wellness or longevity. |
| Radiology SA | Darwin, Northern Territory, AU | menu_enrichment_agent_run_07 | random | plain_hospital | 0.90 | Radiology practice, focused on imaging services, not wellness. |
| Recovia Grant Rd – Eastside | Tucson, AZ, US | menu_enrichment_agent_run_02, stem_cell_authority | random | plain_hospital | 0.85 | Focuses on addiction and mental health treatment, not wellness. |
| Richard Scheinberg, M.D. | Bakersfield, CA, US | stem_cell_authority | random | plain_hospital | 0.90 | Orthopedic practice focused on surgical and medical treatments, not wellness. |
| Sentara Pain Management Specialists | Hampton, VA, US | stem_cell_authority | random | plain_hospital | 0.80 | Pain management specialists likely provide standard medical care, not wellness-focused services. |
| Shaun S. Daneshrad, MD, FACC | Los Angeles, CA, US | service_discovery_11 | random | plain_hospital | 0.90 | A cardiology practice focused on treatment rather than wellness or longevity. |
| St. Luke’s Cancer Institute – Center for Blood Cancer Therapy: Boise | Boise, ID, US | hyperbaric_app, stem_cell_authority | hyperbaric | plain_hospital | 0.85 | Focus on cancer therapy indicates a medical rather than wellness approach. |
| Stem Cell Transplant Center | Boston, MA, US | stem_cell_authority | random | plain_hospital | 0.90 | Part of a children's hospital, primarily focused on transplant services. |
| Surgecenter of Louisville | Louisville, KY, US | stem_cell_authority | random | plain_hospital | 0.80 | Surgical center offering standard medical procedures, not wellness-focused. |
| Susan Chobanian, M.D. | Glendale, CA, US | stem_cell_authority | random | plain_hospital | 0.90 | An individual doctor practice without a clear wellness focus. |
| Tennessee Oncology | Clarksville, TN, US | stem_cell_authority | random | plain_hospital | 0.80 | Oncology services are standard healthcare, not wellness-focused. |
| Texas Oncology Stem Cell Center | Dallas, TX, US | stem_cell_authority | random | plain_hospital | 0.90 | An oncology center primarily focused on treatment, not wellness or longevity. |
| The Institute for Sports and Spine Rehabilitation | Plano, TX, US | stem_cell_authority | random | plain_hospital | 0.85 | Rehabilitation center without a clear wellness or longevity focus. |
| Theradynamics Physical & Occupational Therapy | New York, NY, US | menu_enrichment | random | plain_hospital | 0.80 | Physical and occupational therapy are standard healthcare services. |
| Toronto General Hospital / UHN | Toronto, ON, CA | menu_enrichment | hospital | plain_hospital | 0.95 | General hospital services do not cater to self-paying wellness travelers. |
| Twin Boro Physical Therapy \| Hoboken, NJ | Fair Lawn, NJ, US | menu_enrichment, menu_enrichment_agent_run_03 | random | plain_hospital | 0.90 | Physical therapy is a standard healthcare service, not focused on wellness or longevity. |
| University of Iowa Health Care Davenport – Dexter Court | Davenport, IA, US | stem_cell_authority | random | plain_hospital | 0.85 | Part of a hospital system, primarily focused on general healthcare services. |
| Urgentology Care – Arlington | Arlington, TX, US | stem_cell_authority | random | plain_hospital | 0.85 | Urgent care facility focused on general medical services. |
| Virginia Sport & Spine Institute | Forest, VA, US | stem_cell_authority | random | plain_hospital | 0.90 | A sports and spine institute focused on treatment rather than wellness. |
| Woven Care – Aurora | Aurora, CO, US | stem_cell_authority | random | plain_hospital | 0.80 | Therapies offered are standard medical services, not wellness-focused. |
| Xiamen Humanity Hospital | Xiamen, CN | bookimed_longevity | hospital | plain_hospital | 0.85 | General hospital services, not primarily wellness-focused. |
| Yanda International Hospital | Beijing, CN | bookimed_longevity | hospital | plain_hospital | 0.90 | General hospital services do not cater to self-paying wellness travelers. |
| AccuRX Infusion Center | Birmingham, AL, US | stem_cell_authority | random | review | 0.00 | Website evidence could not be used (http_error); manual review is required. |
| ATA Medical | Madrid, ES | menu_enrichment_agent_run_05 | random | review | 0.00 | Website evidence could not be used (robots_disallowed); manual review is required. |
| Celpa Clinic | Tampa, FL, US | stem_cell_authority | hospital | review | 0.00 | Website evidence could not be used (http_error); manual review is required. |
| EE System/Quantum Scalar Wave Wellness Center of Cape Coral | Cape Coral, FL, US | stem_cell_authority | random | review | 0.00 | Website evidence could not be used (robots_disallowed); manual review is required. |
| Equity Therapy | New York, NY, US | bioedge_clinics, menu_enrichment | random | review | 0.00 | Website evidence could not be used (too_large); manual review is required. |
| FYZICAL Therapy & Balance Centers | Birmingham, AL, US | menu_enrichment_agent_run_12, stem_cell_authority | random | review | 0.00 | Website evidence could not be used (robots_disallowed); manual review is required. |
| Heights Psychotherapy | Jersey City, NJ, US | bioedge_clinics, menu_enrichment | random | review | 0.00 | Website evidence could not be used (too_large); manual review is required. |
| NuVivo Regenerative Medicine | Knoxville, TN, US | stem_cell_authority | random | review | 0.00 | Website evidence could not be used (robots_disallowed); manual review is required. |
| Precision Medical Center | Minsk, BY | bookimed_longevity | hospital | review | 0.00 | No website was available for the required second-stage evidence check. |
| Realief Neuropathy Centers of Milwaukee | Greenfield, WI, US | stem_cell_authority | random | review | 0.00 | Website evidence could not be used (http_error); manual review is required. |
| Transitions Float Studio | Old Brick Road Glen Allen, VA, US | spannr | random | review | 0.00 | No website was available for the required second-stage evidence check. |
| Twin Boro Physical Therapy \| Hoboken, NJ | North Brunswick, NJ, US | menu_enrichment, menu_enrichment_agent_run_03 | random | review | 0.70 | Twin Boro Physical Therapy is a generic physical therapy provider without specific wellness or longevity focus. Website-assisted confidence remained below threshold. |
| Baltic Vein Clinic | Rīga, LV | bookimed_longevity | hospital | destination_medical | 0.90 | Offers specialized services for medical tourism and wellness. |
| Center For Diagnostic Imaging Miami | Miami, FL, US | service_discovery_12 | random | destination_medical | 0.90 | Offers advanced diagnostics like full-body MRI, appealing to self-paying wellness consumers. |
| Dental Smile Pattaya | Muang Pattaya, TH | bookimed_longevity, bookimed_longevity_thailand, menu_enrichment_agent_run_10 | random | destination_medical | 0.90 | Dental clinic offering extensive cosmetic and restorative dental services. |
| Heart Center Dresden University Hospital | Dresden, DE | bookimed_longevity | hospital | destination_medical | 0.90 | Hospital with a focus on wellness and medical tourism. |
| Hospital Matopat | Torun, PL | bookimed_longevity | hospital | destination_medical | 0.90 | Offers services for medical tourism and wellness. |
| Hospital Universitario HM Puerta Del Sur | Madrid, ES | bookimed_longevity | hospital | destination_medical | 0.90 | Offers services for medical tourism and wellness. |
| Instituto Assaly | Sao Paulo, BR | longevity_technology_clinics | random | destination_medical | 0.90 | Offers a range of longevity and wellness services, indicating a focus on medical tourism. |
| Prevention Clinic Tokyo | Tokyo, JP | world_longevity_clinics | hospital | destination_medical | 0.90 | Offers advanced diagnostics and wellness services, suitable for medical tourism. |
| Safe Urology | Istanbul, TR | bookimed_longevity, bookimed_longevity_turkey | random | destination_medical | 0.85 | Offers specialized surgical treatments related to longevity. |
| SKHealth | Seoul, Gangnam-gu, KR | korea_health_pages_medical_tourism_services | random | destination_medical | 0.90 | Health screening clinics indicate a focus on wellness and preventive care. |
| Wockhardt Hospital | Nashik, IN | bookimed_longevity | hospital | destination_medical | 0.90 | Hospital offering wellness services, suitable for medical tourism. |
| +advitam® | New York, NY, US | bioedge_clinics | random | in_scope | 0.85 | Offers hormone and peptide therapy, aligning with wellness and longevity. |
| ABClinic Art & Beauty | Prague, CZ | bookimed_longevity, menu_enrichment_agent_run_12 | hospital | in_scope | 0.90 | Offers various aesthetic and beauty procedures, aligning with elective wellness care. |
| Advanced Stem Cell Institute | Los Angeles, CA, US | biohacking_map, menu_enrichment, menu_enrichment_agent_run_04, stem_cell_authority | random | in_scope | 0.90 | Focuses on stem cell therapy and regenerative medicine, indicating a wellness focus. |
| AEON Clinic | Dubai, AE | longevity_technology_clinics | hospital | in_scope | 0.90 | Offers a range of longevity and wellness services. |
| Agni Hyperbaric Center (AHC 1) | Jakarta, ID | hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers Hyperbaric Oxygen Therapy, a wellness treatment. |
| Agni Hyperbaric Center (AHC 2) | Jakarta, ID | hyperbaric_app | hyperbaric | in_scope | 0.80 | Focuses on hyperbaric oxygen therapy, a wellness treatment. |
| Alist Wellness Center LLC | Union, NJ, US | bioedge_clinics, menu_enrichment | random | in_scope | 0.90 | Offers wellness services like colon hydrotherapy. |
| Altos Clinic | Prague, CZ | bookimed_longevity | hospital | in_scope | 0.90 | Offers aesthetic procedures, fitting the wellness and longevity category. |
| Aqua Vitae iVitality Spa | Greenville, SC, US | menu_enrichment_agent_run_05 | random | in_scope | 0.80 | Spa offering wellness services, though specifics are unclear. |
| Ärzte-Zentrum für hyperbare Sauerstofftherapie | Cologne, DE | hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers hyperbaric oxygen therapy, a wellness service. |
| Aspire Rejuvenation Clinic – Plano | Dubai, AE | menu_enrichment_agent_run_00 | hospital | in_scope | 0.95 | Aspire Rejuvenation Clinic specializes in hormone therapy and anti-aging treatments, fitting the longevity wellness category. |
| Australian Clinic of Biological Medicine | Thebarton, SA, AU | hbot_australia_providers | hospital | in_scope | 0.85 | Specializes in hyperbaric oxygen therapy, a recognized wellness treatment. |
| Ayusya® Medical Spa & Clinic | T Gooi, NL | longevity_technology_clinics | hospital | in_scope | 0.85 | Offers a range of wellness and aesthetic services, aligning with longevity care. |
| Beam Hyperbarics | Austin, TX, US | biohacking_map, hyperbaric_app, menu_enrichment_agent_run_05 | hyperbaric | in_scope | 0.90 | Offers Hyperbaric Oxygen Therapy, a wellness treatment. |
| Bio-Communications Research | Wichita, KS, US | menu_enrichment_agent_run_07, stem_cell_authority | random | in_scope | 0.85 | Offers integrative and functional medicine services, focusing on wellness and longevity. |
| Body Luxe Day Spa \| Women's Only Spa | Newark, NJ, US | bioedge_clinics | random | in_scope | 0.90 | Offers various wellness and recovery services. |
| BodySpec | Houston, TX, US | chain_bodyspec, service_discovery_6 | random | in_scope | 0.85 | Offers DEXA scans, which are relevant for health and wellness monitoring. |
| Brie Cure Aesthetics New Orleans | New Orleans, LA, US | stem_cell_authority | random | in_scope | 0.80 | Aesthetic services offered, relevant to wellness. |
| C.O.R.A.MED HRT & Regeneration Center | Springfield, MO, US | stem_cell_authority | random | in_scope | 0.90 | Offers various regenerative and wellness treatments. |
| Cal Sports and Orthopaedic Institute | Oakland, CA, US | menu_enrichment_agent_run_18, stem_cell_authority | random | in_scope | 0.80 | Offers regenerative medicine and orthopedic treatments, relevant to wellness and longevity. |
| Cámara Hiperbárica | Mexico City, MX | hyperbaric_app | hyperbaric | in_scope | 0.90 | Specializes in hyperbaric oxygen therapy, a wellness service. |
| Cámara Hiperbárica Recovery Polanco | Mexico City, MX | hyperbaric_app | hyperbaric | in_scope | 0.80 | Provides hyperbaric oxygen therapy, a wellness service. |
| Carolina Integrative Wellness | Cary, NC, US | menu_enrichment_agent_run_13, stem_cell_authority | random | in_scope | 0.85 | Offers integrative wellness services, including IV therapy and hormone balancing. |
| Cell Renew Medical Spa Downtown | Tampa, FL, US | menu_enrichment_agent_run_02, stem_cell_authority | random | in_scope | 0.90 | A medical spa offering aesthetic and wellness treatments. |
| Center for Vein Restoration \| Dr. Michelle Nguyen | Manassas, VA, US | menu_enrichment_agent_run_13, stem_cell_authority | random | in_scope | 0.85 | Focuses on vein treatments, which can be part of wellness care. |
| Center for Vein Restoration \| Dr. Michelle Nguyen | Leesburg, VA, US | menu_enrichment_agent_run_13 | random | in_scope | 0.80 | Focuses on vein restoration, relevant to wellness. |
| Centner Wellness Coral Gables | Miami, FL, US | service_discovery_2 | random | in_scope | 0.95 | Offers a variety of wellness therapies and treatments. |
| Charleston Spine Institute, LLC | Charleston, SC, US | menu_enrichment_src_stem_09, stem_cell_authority | random | in_scope | 0.80 | Provides chiropractic and rehabilitation services, which are part of wellness care. |
| CHOIEXPERT Hair Transplant Clinic | Thessaloniki, GR | bookimed_longevity | hospital | in_scope | 0.80 | Focuses on hair transplant services, fitting within elective wellness care. |
| Classical Acupuncture & Herbs | Louisville, KY, US | menu_enrichment_agent_run_08, stem_cell_authority | random | in_scope | 0.90 | Offers various wellness services including acupuncture and herbal medicine. |
| Clinica Hyperbaric Las Condes - Camara Hiperbárica | Santiago, CL | hyperbaric_app | hyperbaric | in_scope | 0.90 | Specializes in hyperbaric oxygen therapy, a wellness service. |
| Colts Neck Stem Cells & Regenerative Medicine | Colts Neck, NJ, US | stem_cell_authority | random | in_scope | 0.90 | Offers various regenerative and wellness treatments, fitting the longevity category. |
| Complete Health at Green Oaks PLLC. | Arlington, TX, US | menu_enrichment_agent_run_11, stem_cell_authority | random | in_scope | 0.95 | Offers various wellness and hormone therapy services. |
| Coolzoone X Cryodukt Kältekammer Zürich | Zürich, CH | biohacking_map, hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers multiple wellness therapies including HBOT and lymph drainage. |
| COVENANT WOMEN’S HEALTH PLLC | Arlington, TX, US | menu_enrichment_agent_run_19, stem_cell_authority | random | in_scope | 0.85 | Offers fertility and hormone management services, relevant to wellness. |
| Cutis Wellness Dermatology & Dermatopathology: Adaobi Nwaneshiudu Obasi, MD | Laredo, TX, US | menu_enrichment_agent_run_01, stem_cell_authority | random | in_scope | 0.90 | Offers various dermatological and aesthetic treatments, aligning with wellness. |
| Delo Sports Medicine and Interventional Orthopedics | Green Bay, WI, US | menu_enrichment_agent_run_07, stem_cell_authority | random | in_scope | 0.85 | Offers advanced treatments like PRP and stem cell therapy, aligning with wellness and longevity. |
| Dental Clinic Dr. Mark Ratner | Tel Aviv, IL | bookimed_longevity | hospital | in_scope | 0.85 | Focuses on dental care with a wellness retreat model, suitable for medical tourism. |
| Dental Land The Implant Clinic | San Rafael, CR | bookimed_longevity | hospital | in_scope | 0.85 | Dental clinic with a focus on wellness and medical tourism. |
| Divine Elements Naturopathic Clinic | Vancouver, BC, CA | biohacking_map | hospital | in_scope | 0.90 | Offers a range of naturopathic and wellness services. |
| Dove Hydration & Wellness | Milwaukee, WI, US | menu_enrichment_agent_run_10 | random | in_scope | 0.85 | Offers hydration and wellness IV therapies, which are wellness-focused services. |
| Dr. Liv Clinic GmbH | Zürich, CH | biohacking_map | hospital | in_scope | 0.90 | Provides various wellness and aesthetic services. |
| DRS2Health Naturopathic & Holistic Medicine | Bronx, NY, US | biohacking_map | random | in_scope | 0.85 | Naturopathic and holistic medicine focus on wellness and preventive care. |
| Elite Physical Therapy and Wellness | Glendale, AZ, US | menu_enrichment_agent_run_06 | random | in_scope | 0.90 | Offers various wellness services including chiropractic and injury care. |
| Endospheres Brooklyn/Cryoskin Original🇮🇹 A Revolutionary Italian devices - partner with Artemis Distributor | Brooklyn, NY, US | bioedge_clinics, menu_enrichment | random | in_scope | 0.80 | Offers cryotherapy and peptide therapy, aligning with wellness. |
| European Valley Health | Curitiba, BR | bookimed_longevity | random | in_scope | 0.85 | Offers dental services with a focus on aesthetics, fitting wellness criteria. |
| Ezra | Hayward, CA, US | service_discovery_18 | random | in_scope | 0.90 | Offers advanced diagnostic imaging, relevant for wellness assessments. |
| Functional Medicine Wimbledon | London, GB | biohacking_map, menu_enrichment | random | in_scope | 0.90 | Focuses on functional medicine, which is directly related to wellness and longevity. |
| Gameday Men's Health – Calgary – South | Calgary, AB, CA | dexa_canada_scan_providers, menu_enrichment | random | in_scope | 0.90 | Provides various men's health treatments, including hormone therapies, aligning with wellness care. |
| GEDUNG TOHB LAKESLA (Terapi Oksigen Hiperbarik) | Surabaya, ID | hyperbaric_app | hyperbaric | in_scope | 0.80 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| Good Cells Clinic | Kyiv, UA | bookimed_longevity, menu_enrichment_agent_run_06 | hospital | in_scope | 0.90 | Provides various anti-aging and stem cell services, aligning with wellness and longevity. |
| Gravitas Medspa | Santa Clarita, CA, US | menu_enrichment_agent_run_19 | random | in_scope | 0.85 | Medspa offering aesthetic treatments, relevant to wellness. |
| Gregory A. Moore, MD | Eugene, OR, US | menu_enrichment_agent_run_03, stem_cell_authority | random | in_scope | 0.85 | Provides interventional pain management and regenerative treatments, fitting wellness and longevity care. |
| HBO Zentrum München | Munich, DE | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers hyperbaric oxygen therapy, a wellness service. |
| HBOT \| Parker | Denver, US | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers Hyperbaric Oxygen Therapy and Red Light Therapy, wellness services. |
| HBOT Liverpool | Liverpool, Merseyside, GB | hbot_uk_providers, hyperbaric_app | hyperbaric | in_scope | 0.90 | Provides hyperbaric oxygen therapy, a wellness service. |
| HBOT Slovenija | Ljubljana, SI | hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers hyperbaric oxygen therapy, a wellness service. |
| Health & Wellness with HBOT | Paramus, NJ, US | bioedge_clinics, hyperbaric_app, menu_enrichment | hyperbaric | in_scope | 0.90 | Offers multiple wellness services including Hyperbaric Oxygen Therapy. |
| Hills Hyperbarics | Perth, AU | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.90 | Provides hyperbaric oxygen therapy and infrared sauna, both wellness services. |
| Hiperbarica Riviera Maya | Playa del Carmen, MX | hyperbaric_app | hyperbaric | in_scope | 0.80 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| Hipermer Hiperbarik Oksijen Tedavi Merkezi | Istanbul, TR | hyperbaric_app | hyperbaric | in_scope | 0.90 | Provides hyperbaric oxygen therapy, which is a wellness treatment. |
| hiperO2 camara hiperbárica | Merida, MX | hyperbaric_app | hyperbaric | in_scope | 0.80 | Specializes in hyperbaric oxygen therapy, relevant for wellness. |
| Holistic Medical Center | Coyoacán, Mexico City, MX | biohacking_map | hospital | in_scope | 0.85 | Offers alternative and holistic medical services, aligning with wellness care. |
| Hormone and Weight Loss Doctors of NJ | Wayne, NJ, US | bioedge_clinics | random | in_scope | 0.90 | Offers hormone and peptide therapy, related to wellness. |
| HUM2N \| Longevity clinic London | London, GB | biohacking_map | hospital | in_scope | 0.85 | Focuses on longevity and wellness services, suitable for medical tourism. |
| Hydration Room Huntington Beach – Adams Ave. | Huntington Beach, CA, US | menu_enrichment_agent_run_06, stem_cell_authority | random | in_scope | 0.90 | Offers various IV therapies aimed at wellness and recovery. |
| Hydration Room Huntington Beach – Goldenwest (Inside LA Fitness) | Huntington Beach, CA, US | menu_enrichment_agent_run_13 | random | in_scope | 0.85 | Offers hydration therapy, relevant to wellness and recovery. |
| Hyperbaric Fitness | Hannover, DE | hyperbaric_app | hyperbaric | in_scope | 0.90 | Provides hyperbaric oxygen therapy, a wellness treatment. |
| Hyperbaric O2 Health | Brisbane, AU | hbot_australia_providers, hyperbaric_app, menu_enrichment | hyperbaric | in_scope | 0.90 | Offers various wellness therapies including Hyperbaric Oxygen Therapy. |
| Hyperbarická komora | Plzeň, CZ | hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers Hyperbaric Oxygen Therapy, a wellness treatment. |
| Ikigai Medical Clinic | SG | longevity_technology_clinics | hospital | in_scope | 0.90 | Provides a range of wellness and aesthetic services, suitable for medical tourism. |
| INNOVA CLINIC PUNTA CANA | Punta Cana, DO | bookimed_longevity | hospital | in_scope | 0.85 | Offers various medical services with a focus on wellness tourism. |
| Jaber Al-Ahmed Hyperbaric Oxygen Therapy | Kuwait City, KW | hyperbaric_app | hyperbaric | in_scope | 0.90 | Provides hyperbaric oxygen therapy, a wellness service. |
| Laurel Fertility Care | Modesto, CA, US | stem_cell_authority | random | in_scope | 0.90 | Offers egg freezing, a service related to fertility and longevity. |
| Le Vira Clinic | Pathum Wan, TH | placidway_antiaging_thailand | hospital | in_scope | 0.90 | Offers aesthetic and anti-aging services, fitting the longevity wellness category. |
| Lewis Holistic Healing Institute | Montclair, NJ, US | bioedge_clinics | random | in_scope | 0.85 | Focuses on functional medicine, which is part of wellness care. |
| LIFTIQUE DERMATOLOGY CLINIC - English-Speaking, Board-Certified Dermatologists | Seoul, Seocho-gu, KR | korea_health_pages_anti_aging_gangnam, korea_health_pages_iv_drip, korea_health_pages_prp_skin, korea_health_pages_rejuran | hospital | in_scope | 0.90 | Specializes in anti-aging and dermatological treatments, fitting wellness care. |
| Longevity Clinic by Medkos | Petaling Jaya, MY | longevity_technology_clinics | hospital | in_scope | 0.85 | Offers a variety of wellness and diagnostic services, aligning with longevity care. |
| LSG Imaging | Santa Monica, CA, US | service_discovery_11 | random | in_scope | 0.85 | Imaging services can be part of preventive wellness care. |
| Lumiere Cosmetic Vein Center, P.A. | Cape Coral, FL, US | menu_enrichment_agent_run_04, stem_cell_authority | random | in_scope | 0.90 | Offers various cosmetic and aesthetic treatments. |
| Magnolia Health PLLC Dba Chattanooga Wellness Centers | Chattanooga, TN, US | menu_enrichment_agent_run_19, stem_cell_authority | random | in_scope | 0.90 | Offers various wellness and anti-aging treatments. |
| Mahbobeh Joint and Spine Clinic عیادة محبوبه للمفاصل و العمود الفقری | Muscat, OM | hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers hyperbaric oxygen therapy, a recognized wellness treatment. |
| Mild Hyperbaric Oxygen Therapy (mHBOT) in Benoni & Kempton Park | Johannesburg, ZA | hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers Hyperbaric Oxygen Therapy, a wellness treatment. |
| Moolman Physiotherapy and Oxygen Therapy Milnerton | Cape Town, ZA | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.90 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| MORROW Medical | SG | longevity_technology_clinics | random | in_scope | 0.90 | Focus on holistic medicine and wellness services aligns with longevity care. |
| Movement Medicine \| Toronto Naturopathic Doctor | Toronto, ON, CA | biohacking_map | random | in_scope | 0.90 | Offers naturopathic treatments and individualized wellness care. |
| Nascent Health | Scottsdale, AZ, US | menu_enrichment_agent_run_08 | random | in_scope | 0.95 | Offers various IV therapies and hormone treatments related to wellness. |
| Neo Dentica. Dental Clinic | Lodz, PL | bookimed_longevity | hospital | in_scope | 0.85 | Dental clinic with a focus on wellness and medical tourism. |
| neoteric stem cell centers | Oklahoma City, OK, US | stem_cell_authority | random | in_scope | 0.90 | Focuses on stem cell therapy, a preventive wellness treatment. |
| Nescens Clinique de Genolier | Genolier, CH | world_longevity_clinics | random | in_scope | 0.95 | Offers comprehensive wellness and longevity services. |
| New England Stem Cell Institute of the Palm Beaches | Jupiter, FL, US | stem_cell_authority | random | in_scope | 0.90 | Stem cell institute suggests a focus on longevity and wellness treatments. |
| Northwest Center for Regenerative Medicine | Spokane, WA, US | menu_enrichment_agent_run_07, menu_enrichment_agent_run_13, stem_cell_authority | random | in_scope | 0.85 | Offers regenerative medicine treatments, which align with longevity and wellness. |
| Nutricionista Ayala Isis | São Paulo, BR | biohacking_map | random | in_scope | 0.85 | Provides wellness and nutrition services, indicating a focus on health and longevity. |
| Orange County Mobile IV Therapy | San Clemente, CA, US | menu_enrichment_agent_run_04 | random | in_scope | 0.85 | Mobile IV therapy aligns with wellness and longevity services. |
| Oregon Regenerative Medicine | Lake Oswego, OR, US | stem_cell_authority | random | in_scope | 0.90 | Offers a range of regenerative and functional medicine services. |
| Oxigenate Camaras Hiperbaricas | Cali, CO | hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers hyperbaric oxygen therapy, a wellness service. |
| Oxxanar Medicina Hiperbárica | Santander, ES | hyperbaric_app | hyperbaric | in_scope | 0.80 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| Oxygen hyperbaric therapy | Rotterdam, NL | hyperbaric_app | hyperbaric | in_scope | 0.80 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| Oxygens Hyperbaric Clinic | Halesowen, ENG, GB | hbot_uk_providers, menu_enrichment | hospital | in_scope | 0.85 | Specializes in hyperbaric oxygen therapy, a recognized wellness treatment. |
| OxyTerapia | Warsaw, PL | hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers hyperbaric oxygen therapy, a wellness treatment. |
| Özel Mersin Hiperbarik Oksijen Tedavi Merkezi | Mersin, TR | hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers hyperbaric oxygen therapy, a recognized wellness treatment. |
| Pallas Clinic | Jūrmala, LV | bookimed_longevity | hospital | in_scope | 0.85 | Offers wellness and medical tourism services, fitting the longevity category. |
| Paradise Hyperbarics | Cali, CO | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers Hyperbaric Oxygen Therapy, a wellness service. |
| Patients Medical PC, Functional and Holistic Medicine | New York, NY, US | bioedge_clinics | random | in_scope | 0.90 | Functional medicine practice focusing on holistic wellness. |
| Pause Studio Brickell | Miami, FL, US | service_discovery_2 | random | in_scope | 0.90 | Offers various wellness therapies including IV nutrient therapy and cryotherapy. |
| Perfect Touch MedSpa Laredo | Laredo, TX, US | stem_cell_authority | random | in_scope | 0.85 | MedSpa likely offers aesthetic and wellness services, fitting the in_scope category. |
| Philippine South Hyperbarics and Wellness Center | Davao, PH | hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers Hyperbaric Oxygen Therapy, a wellness treatment. |
| PhysiO2sport Clinic | Geneva, CH | biohacking_map, menu_enrichment | hospital | in_scope | 0.85 | Provides various physiotherapy and wellness services, relevant to longevity. |
| Prana Hyperbaric Oxygen Therapy Centre | Mumbai, IN | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.80 | Specializes in hyperbaric oxygen therapy, relevant for wellness. |
| ProloAustin | Austin, TX, US | stem_cell_authority | random | in_scope | 0.90 | Offers regenerative treatments like PRP, aligning with wellness and longevity care. |
| PRP - Platelet Rich Plasma Therapy | Colorado Springs, CO, US | menu_enrichment | random | in_scope | 0.85 | PRP therapy is a wellness-focused treatment option. |
| PRP - Platelet Rich Plasma Therapy | Bastrop, TX, US | menu_enrichment | random | in_scope | 0.90 | Offers PRP therapy, which is a wellness treatment. |
| PRP Treatment | Beverly Hills, CA, US | stem_cell_authority | random | in_scope | 0.85 | PRP treatment suggests a focus on wellness and regenerative therapies. |
| QC Kinetix (Kansas City) | Kansas City, MO, US | stem_cell_authority | random | in_scope | 0.90 | Focuses on regenerative medicine, which is part of wellness care. |
| R3 Stem Cell | Chandler, AZ, US | menu_enrichment_agent_run_02, stem_cell_authority | random | in_scope | 0.90 | Offers various stem cell therapies, aligning with wellness and regenerative medicine. |
| R3 Stem Cell | Oklahoma City, OK, US | stem_cell_authority | random | in_scope | 0.85 | R3 Stem Cell offers regenerative medicine therapies, aligning with longevity and wellness services. |
| Raha Health Center — HBOT | Riyadh, SA | hyperbaric_app | hyperbaric | in_scope | 0.80 | Focuses on hyperbaric oxygen therapy, a wellness treatment. |
| Reborn Clinics | Istanbul, TR | bookimed_longevity, bookimed_longevity_turkey | hospital | in_scope | 0.90 | Reborn Clinics offers functional medicine and aesthetic treatments, aligning with longevity and wellness care. |
| Reclaim Hyperbarics & Wellness | Nice, FR | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers multiple wellness services including HBOT and IV Drip Therapy. |
| Regenerative Health Institute | Carmel, IN, US | stem_cell_authority | random | in_scope | 0.95 | Offers regenerative medicine and wellness services, aligning with longevity and preventive care. |
| ReHydrate | Mobile, AL, US | menu_enrichment_retry1_03, menu_enrichment_stem9_01, stem_cell_authority | random | in_scope | 0.95 | Offers various IV hydration therapies, aligning with wellness and longevity. |
| Reju Stem Cell Clinic | Medellín, CO | bookimed_longevity | hospital | in_scope | 0.90 | Focuses on stem cell therapies, relevant for wellness. |
| Rejuv Medical | Waite Park, MN, US | stem_cell_authority | random | in_scope | 0.95 | Offers various regenerative and aesthetic treatments, aligning with wellness care. |
| Rejuven8 Wellness Club | Dubai, AE | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers multiple wellness therapies including hyperbaric oxygen therapy. |
| Restore Hyper Wellness - Austin, TX - Gateway | Austin, TX, US | service_discovery_24 | random | in_scope | 0.95 | Offers various wellness therapies including cryotherapy and IV drips. |
| Restore PT | Richmond, VA, US | stem_cell_authority | random | in_scope | 0.85 | Restore PT offers myofascial release therapy, which aligns with wellness and recovery services. |
| Revive Drip Lounge | Laredo, TX, US | stem_cell_authority | random | in_scope | 0.90 | Focuses on IV therapies, aligning with wellness and recovery. |
| Revive Pain Management | Hacienda Heights, CA, US | menu_enrichment_agent_run_11 | random | in_scope | 0.80 | Revive Pain Management provides pain management and regenerative treatments, fitting within wellness care. |
| Roche Injury Clinic \| Fresha | Kilkenny, IE | hbot_ireland_providers | hospital | in_scope | 0.85 | Roche Injury Clinic provides hyperbaric oxygen therapy, which is a wellness service related to recovery. |
| Royal Dental Clinic - Fogászati Rendelő | Budapest, HU | bookimed_longevity | hospital | in_scope | 0.90 | Focuses on dental aesthetics, relevant for wellness. |
| Ryan McWhorter, MD – Alabama Functional Medicine – Functional Pelvic Health | Montgomery, AL, US | stem_cell_authority | random | in_scope | 0.90 | Focuses on functional medicine and pelvic health. |
| S.M.R.T Therapeutic Massage & Pain Relief Center | Aurora, CO, US | stem_cell_authority | random | in_scope | 0.90 | Provides therapeutic massage and wellness services. |
| Sage + Sound | New York, NY, US | bioedge_clinics | random | in_scope | 0.90 | Provides a range of aesthetic and wellness treatments. |
| Saint Haven | Collingwood, AU | hyperbaric_app | hyperbaric | in_scope | 0.80 | Focuses on hyperbaric oxygen therapy, a wellness treatment. |
| Sanare Wellness Centre - Bio Energy Therapy | Vancouver, BC, CA | biohacking_map | random | in_scope | 0.80 | Wellness center offering holistic medicine and bio-energy therapy. |
| Sano Health Club | Camarillo, CA, US | stem_cell_authority | random | in_scope | 0.90 | Sano Health Club focuses on functional medicine and health optimization, fitting the wellness category. |
| Save on Dental Care - SODC Dental Clinic | Budapest, HU | bookimed_longevity | hospital | in_scope | 0.85 | Dental clinic with a focus on wellness and medical tourism. |
| Sereniti Health | Gateshead, Tyne and Wear, GB | hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers hyperbaric oxygen therapy, relevant for wellness. |
| SHA Wellness Clinic | ES | immortality_clinic | hospital | in_scope | 0.90 | Offers functional medicine and genetic testing, relevant to wellness and longevity. |
| Skin by E LLC | Bronx, NY, US | bioedge_clinics, menu_enrichment | random | in_scope | 0.95 | Offers various aesthetic and wellness treatments. |
| Sonría Dental Clinic - Costa Rica Dental Implants | San Rafael de Escazú, CR | bookimed_longevity | hospital | in_scope | 0.90 | Dental clinic specializing in implants and cosmetic dentistry, fitting wellness care. |
| Southwest Hyperbarics | Fort Worth, US | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.90 | Offers hyperbaric oxygen therapy, a recognized wellness treatment. |
| Spa Mellow | Staten Island, NY, US | bioedge_clinics, menu_enrichment | random | in_scope | 0.90 | Spa offering various wellness treatments, including anti-aging. |
| SportCryo | Scottsdale, AZ, US | service_discovery_27 | random | in_scope | 0.95 | Specializes in cryotherapy and related recovery services. |
| Stem Cells Philadelphia | Villanova, PA, US | stem_cell_authority | random | in_scope | 0.90 | Provides various regenerative therapies, including aesthetic and wellness services. |
| Synergy Integrated Health Center | Wilmington, DE, US | menu_enrichment_agent_run_11 | random | in_scope | 0.80 | Synergy Integrated Health Center provides chiropractic and wellness services, fitting the longevity care category. |
| The Biostation | Boca Raton, FL, US | menu_enrichment_agent_run_03 | random | in_scope | 0.95 | Offers various wellness and anti-aging treatments. |
| The Oxygen Therapy Centre | Larne, Antrim, GB | hyperbaric_app | hyperbaric | in_scope | 0.80 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| The VIP Doctor | Belleville, NJ, US | bioedge_clinics | random | in_scope | 0.80 | Concierge model suggests a focus on personalized wellness services. |
| Tokyo Relife Clinic | Tokyo, JP | longevity_technology_clinics | hospital | in_scope | 0.90 | Focuses on various wellness and longevity treatments, aligning with the category. |
| Tony Ridley Hyperbaric Associates Ltd | Norwich, GB | hyperbaric_app | hyperbaric | in_scope | 0.80 | Offers Hyperbaric Oxygen Therapy, a wellness treatment. |
| Transformational Tones | Brooklyn, NY, US | bioedge_clinics, menu_enrichment | random | in_scope | 0.80 | Offers wellness-related services like sound therapy and red light therapy. |
| Trifecta Med Spa Downtown | Hewlett, NY, US | menu_enrichment | random | in_scope | 0.90 | Med spa offering aesthetic and wellness services. |
| UC Davis Institute for Regenerative Cures | Sacramento, CA, US | stem_cell_authority | random | in_scope | 0.85 | Focuses on regenerative medicine, aligning with wellness and longevity. |
| Unchained Psychiatry & Wellness | Gilbert, AZ, US | service_discovery_7, stem_cell_authority | random | in_scope | 0.95 | Offers a range of IV therapies and wellness modalities. |
| Uzm. Dr. Kemal Kutay Külahcı, Sualtı Hekimliği Ve Hiperbarik Tıp | Antalya, TR | hyperbaric_app | hyperbaric | in_scope | 0.80 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| Valley Healing Hands LLC | Brownsville, TX, US | stem_cell_authority | random | in_scope | 0.90 | Offers various physical therapy and rehabilitation services. |
| Vancouver Hyperbarics | Vancouver, BC, CA | biohacking_map, hbot_canada_providers, hyperbaric_app, menu_enrichment, menu_enrichment_agent_run_18 | hyperbaric | in_scope | 0.90 | Offers Hyperbaric Oxygen Therapy, a wellness treatment. |
| Vibrance 360 | Greenvale, NY, US | bioedge_clinics | random | in_scope | 0.90 | Offers various aesthetic and wellness treatments, including cryotherapy. |
| Virginia Wellness Group | Winchester, VA, US | stem_cell_authority | random | in_scope | 0.85 | Offers various wellness treatments including cryotherapy and body contouring. |
| Visionary Wellness & Imaging | Irving, TX, US | service_discovery_15 | random | in_scope | 0.85 | Offers advanced imaging and screening services relevant to wellness. |
| Vita Hydration and Wellness | Worcester, MA, US | stem_cell_authority | random | in_scope | 0.80 | Offers wellness memberships, indicating a focus on health and longevity. |
| Vitalize IV Therapy | Prosper, TX, US | stem_cell_authority | random | in_scope | 0.95 | Specializes in IV therapy with various wellness-focused drips. |
| Wellness One Memphis, PC | Memphis, TN, US | stem_cell_authority | random | in_scope | 0.90 | Offers various wellness and regenerative treatments. |
| Wings Hyperbarics | Cape Town, ZA | clinic_websites, hyperbaric_app | hyperbaric | in_scope | 0.90 | Provides Hyperbaric Oxygen Therapy, a wellness service. |
| Wolistic Center - Aesthetic & Wellness Clinic in Istanbul Turkey | Istanbul, Turkey, TR | placidway_antiaging_turkey | hospital | in_scope | 0.90 | Offers a range of aesthetic and wellness services, fitting the longevity category. |
| Wonjin Plastic Surgery Clinic | Seoul, Seocho-gu, KR | bookimed_longevity, bookimed_longevity_korea | hospital | in_scope | 0.85 | Plastic surgery clinic with a focus on aesthetic wellness. |
| Специјализиран HBO2T-Центар | Skopje, MK | hyperbaric_app | hyperbaric | in_scope | 0.90 | Specializes in hyperbaric oxygen therapy, a wellness service. |

**STOP — AWAITING APPROVAL.**
