# Longevity Scrape Data Dictionary

This file summarizes the categories and data shape in each source database.

## Common Database Tables

Each source has its own SQLite database in `data/databases/<source>.sqlite`.

Common tables:

- `pages`: fetched source pages or API payloads, including raw HTML/JSON text.
- `listings`: one row per clinic/location/listing.
- `listing_fields`: extra source-specific key/value fields that did not fit the shared columns.
- `images`: remote image URLs and optional downloaded `local_path`.
- `reviews`: review rows when exposed by the source.

Common `listings` column groups:

- Identity: `source_slug`, `source_url`, `name`, `description`
- Location/contact: `address`, `locality`, `region`, `postal_code`, `country`, `phone`, `email`, `website`, `latitude`, `longitude`
- Commercial/trust: `price_text`, `rating`, `review_count`
- Media: `image_url`
- Rich data: `services_json`, `procedures_json`, `raw_text`, `raw_json`

## Source-Specific Categories

### `biohacking_map.sqlite`

Records: 343 listings.

Primary category field: `listing_fields.category`

| Category | Count |
|---|---:|
| Medical Clinics | 247 |
| Recovery Hubs | 45 |
| Diagnostics & Labs | 33 |
| Programs & Telehealth | 18 |

Other category-like fields:

- `listing_fields.service_model`: In-person 338, Remote / Telehealth 3, Multi-location 1, Global Brand 1
- `services_json`: treatment tags such as NAD+ IV, Hyperbaric Oxygen, Stem Cell Therapy, Peptide Protocol, PRP Therapy, Exosome Therapy
- `procedures_json`: `primaryGoal`, `anchorService`, `techSpecs`, `advancedTreatments`, `foundationalTreatments`
- `listing_fields.medical_oversight`: true/false oversight flag
- `listing_fields.metadata_tags`, `verification`, `premium_tier`

No image URLs were exposed by the Biohacking Map API.

### `bookimed_longevity.sqlite`

Records: 257 listings, 1,790 image URLs, 641 reviews.

Primary category data comes from Bookimed JSON-LD hospital departments in `raw_json.department`.

Top department categories:

| Department | Count |
|---|---:|
| Longevity health | 254 |
| Aesthetic Medicine and Cosmetology | 230 |
| Orthopedics | 229 |
| Neurology | 224 |
| Pediatrics | 223 |
| Gastroenterology | 219 |
| Therapy | 212 |
| Rehabilitation | 198 |
| Plastic Surgery | 198 |
| Urology | 197 |
| Surgery | 197 |
| Oncology | 195 |
| Endocrinology | 192 |
| Diagnostics | 191 |
| Wellness retreats | 171 |
| Spa Resorts with Medical Services | 161 |
| Stem Cells | 93 |
| Medical check-up | 83 |

Other category-like fields:

- `services_json`: Bookimed `AggregateOffer` data with offer names, prices, currencies, and offer URLs.
- Offer-name tags found include IV, stem cell, therapy, check-up, rejuvenation, botox, PRP, filler, detox, vitamin.
- Countries are stored in `country`; top counts include TR 69, TH 31, MX 23, PL 18, UA 16, GB 15, US 13, DE 13.
- Reviews are in `reviews`.
- Images are in `images`; 218 listings have a downloaded local image.

### `exec_health.sqlite`

Records: 80 city-service listings.

This source is city/location pages rather than individual clinic cards. Categories are the available service categories per city.

Primary fields:

- `listing_fields.city`
- `listing_fields.services`
- `services_json`

Service categories include:

- Executive Health Checkup
- Health Screening
- Full Body MRI
- Full Body CT
- Nutrition Assessment
- Personalized Nutrition Plan
- Cardiac Screening
- Stress Test
- Bone Density Scan
- Diabetes Screening
- Thyroid Function Test
- Genetic Testing
- Sleep Study
- Cancer Screening
- Hearing Test
- Vision Test

### `human_longevity.sqlite`

Records: 2 listings.

No explicit category taxonomy was exposed. The rows are organization/location style records extracted from schema/page content.

Useful fields:

- Location/contact fields: `address`, `phone`, `email`, `website`, `latitude`, `longitude`
- Program/price text appears in `price_text` and `raw_text`
- Full raw schema/page data is in `raw_json` and `pages`

### `immortality_clinic.sqlite`

Records: 26 listings.

Primary category-like dimensions:

- Price tier in `price_text`: `$$` 6, `$$$` 12, `$$$$` 8
- Specialty/category appears in `raw_text` and card text.

Specialty counts found in profile text:

| Specialty | Count |
|---|---:|
| Diagnostic Testing | 10 |
| Longevity Programs | 6 |
| Functional Medicine | 3 |
| Epigenetics | 2 |
| Stem Cell Therapy | 2 |
| IV & NAD+ Therapy | 1 |
| Retreat & Wellness | 1 |
| Gut & Microbiome | 1 |

Extra fields:

- `listing_fields.card_text`
- `listing_fields.card_source_page`

### `longevity_technology_clinics.sqlite`

Records: 125 listings, 275 image URLs.

Primary category field: `procedures_json.categories` and `listing_fields.clinic_categories`

| Clinic Category | Count |
|---|---:|
| clinic destination | 61 |
| luxury destination | 32 |
| local destination | 18 |
| virtual clinic | 9 |
| executive health | 5 |
| gym to clinic | 3 |
| other | 2 |

Primary offering/treatment category field: `services_json`, also mirrored in `procedures_json.offerings`.

Offering categories include:

- supplementation and nutrition
- generic diagnostic
- cardiovascular
- biological age
- food as medicine
- MSK body composition
- sleep
- exercise
- client portal
- hormones and regenerative
- immunity and allergy
- wearable integration
- brain health
- pharmaceutical
- cognitive
- holistic medicine
- on site lab
- diagnostic imaging
- client app
- biohacking
- IV therapies
- aesthetic management
- stem cell therapies
- traditional Chinese medicine TCM

Other category-like fields:

- `procedures_json.locations` and `listing_fields.branch_locations`
- WordPress metadata: `wp_id`, `slug`, `status`, `protected`, `featured_media`
- 119 listings have a downloaded local image.

### `spannr.sqlite`

Records: 65 listings.

Spannr did not expose a clean category taxonomy in structured data. Category-like signals are in `raw_text` and `listing_fields.card_text`.

Detected listing flags:

| Flag | Count |
|---|---:|
| Clinic | 63 |
| Multiple Locations | 13 |
| Telehealth | 2 |
| Retreat | 2 |

Detected service terms in profile/card text include:

- Anti-Aging
- Cryotherapy
- IV Therapy
- Cold Plunge
- Sauna

Extra fields:

- `listing_fields.card_text`
- `listing_fields.card_source_page`

### `world_longevity_clinics.sqlite`

Records: 55 listings, 54 image URLs.

Primary treatment/category data:

- `services_json`: structured treatment/service names from schema data
- `listing_fields.section_available-treatments-features`
- `listing_fields.section_treatment-details`
- `listing_fields.section_programs`

Top treatment/service categories:

| Treatment/Service | Count |
|---|---:|
| IV Nutrient Therapy | 34 |
| Personalized Nutrition | 24 |
| DEXA Scan | 18 |
| Full Body MRI | 17 |
| Epigenetic Clock Testing | 14 |
| VO2 Max Testing | 11 |
| NAD+ IV Therapy | 11 |
| Cryotherapy | 10 |
| Peptide Therapy | 9 |
| Stem Cell Therapy | 8 |
| Advanced Blood Panel | 8 |
| Advanced Bloodwork | 7 |
| Body Composition Analysis | 7 |
| Exosome Therapy | 6 |
| Hormone Optimization | 6 |
| Advanced Biomarker Panel | 6 |

Other category-like dimensions:

- Country in `country`: United States 18, Switzerland 5, Germany 4, United Arab Emirates 4, Spain 3, Austria 3, United Kingdom 3, Italy 3, Thailand 2, Japan 2
- Price currency/tier in `price_text`: USD 28, EUR 14, CHF 5, GBP 3, JPY 2, AED 2, SGD 1
- Review counts are in `review_count` for 43 listings.
- 54 listings have a downloaded local image.

### `longevitydocs_directory.sqlite`

Records: 27 physician listings, 27 image URLs, 27 downloaded local images.

Primary record type:

- `listing_fields.record_type`: `physician_directory_card`

Primary category fields:

- `listing_fields.specialties`
- `listing_fields.treatments`
- `listing_fields.practice`
- `listing_fields.degree_or_title`

Top specialties:

| Specialty | Count |
|---|---:|
| Internal Medicine | 9 |
| Family Medicine | 4 |
| Cardiovascular Disease (Cardiology) | 3 |
| Emergency Medicine | 3 |
| Preventive Medicine | 3 |
| Obstetrics and Gynecology | 2 |

Top treatment tags:

| Treatment | Count |
|---|---:|
| Hormone testing | 19 |
| Genetic testing | 17 |
| Biological age testing | 13 |
| Cardiometabolic testing | 6 |

### `bioedge_clinics.sqlite`

Records: 1,472 clinic listings, 7,744 image URLs, 496 downloaded local images.

Primary record type:

- `listing_fields.record_type`: `clinic_profile`

Primary category fields:

- `services_json`: clinic tags
- `procedures_json.tags`
- `listing_fields.tags`

Top clinic tags:

| Tag | Count |
|---|---:|
| Anti-Aging Clinic | 148 |
| Peptide Therapy | 131 |
| Membership Medicine | 125 |
| IV Therapy | 119 |
| Direct Primary Care | 118 |
| PRP Therapy | 117 |
| Microcurrent Therapy | 117 |
| Shockwave Therapy | 116 |
| Methylene Blue Therapy | 114 |
| Med Spa | 108 |
| Vibroacoustic Therapy | 107 |
| Structural Therapy | 106 |
| Hormone Therapy | 105 |
| Wellness Spa | 102 |
| Functional Medicine | 99 |
| Biohacking | 97 |
| Red Light Therapy | 89 |
| Exosome Therapy | 87 |
| NAD+ Therapy | 87 |
| PEMF Therapy | 83 |

Other useful fields:

- `website`: populated for all 1,472 listings.
- `address`, `phone`, and `image_url` are populated from clinic profile pages when available.
- Some profile image URLs are Google Places-style references; they remain in `images` even when local download failed.

### `concierge_doctors_near_me.sqlite`

Records: 1,290 practice listings, 11,931 image URLs, 1,290 downloaded local images, 629 review rows.

Primary record types:

- `listing_fields.record_type`: `listing_profile`

Primary category field:

- `listing_fields.category`

Category counts:

| Category | Count |
|---|---:|
| Primary Care Physicians | 1,126 |
| House Calls Doctors | 12 |
| Pediatricians | 8 |
| Functional Medicine | 8 |
| Integrative Medicine | 7 |
| Concierge OB-Gyns | 2 |
| Longevity Medicine | 1 |
| Lifestyle Medicine | 1 |
| Concierge Cardiologists | 1 |

Other useful fields:

- `rating` and `review_count`: populated for 1,290 listings.
- `website`: populated for 1,290 listings.
- `reviews`: Google review snippets exposed on detail pages.
- `procedures_json.categories` and `procedures_json.regions`
- `listing_fields.region_label`

### `best_executive_physical_programs.sqlite`

Records: 10 ranked program listings, 10 image URLs, 10 downloaded local images.

Primary record type:

- `listing_fields.record_type`: `independent_ranking_card`

Primary category/ranking fields:

- `listing_fields.rank`
- `procedures_json.rank`
- `website`: outbound program website
- `listing_fields.contact_page`: source contact page

Rows are the ranked executive physical programs listed on the source homepage.

### `bookimed_longevity_doctors.sqlite`

Records: 98 doctor listings.

Primary record types:

- `listing_fields.record_type`: `doctor_profile` for 97 rows
- `listing_fields.record_type`: `doctor_card` for 1 row

Primary category fields:

- `listing_fields.specialization`
- `listing_fields.experience`
- `listing_fields.workplace`
- `listing_fields.languages`
- `procedures_json.specialization`
- `procedures_json.workplace`
- `procedures_json.online_consultation`
- `procedures_json.linked_clinic`

Top experience values:

| Experience | Count |
|---|---:|
| 36 years of experience | 7 |
| 8 years of experience | 6 |
| 12 years of experience | 5 |
| 11 years of experience | 5 |
| 10 years of experience | 5 |
| 7 years of experience | 4 |
| 22 years of experience | 4 |
| 15 years of experience | 4 |

The doctor pages did not expose doctor image URLs in the fetched HTML.

### `stem_cell_authority.sqlite`

Records: 7,205 business listings, 6,914 image URLs.

Primary record type:

- `listing_fields.record_type`: `wp_business_directory_listing`

Primary category fields:

- `listing_fields.listing_category`: city/state location category
- `listing_fields.listing_tags`
- `services_json`: listing tags
- `procedures_json.tags`

Top location/category values:

| Location Category | Count |
|---|---:|
| Birmingham, AL | 149 |
| Sioux Falls, SD | 112 |
| Montgomery, AL | 112 |
| Lincoln, NE | 111 |
| Anchorage, AK | 107 |
| St. Paul, MN | 107 |
| Aurora, CO | 105 |
| Riverside, CA | 104 |
| Stockton, CA | 101 |
| Arlington, TX | 101 |
| Little Rock, AR | 100 |
| Worcester, MA | 95 |
| Norfolk, VA | 93 |
| Glendale, AZ | 92 |
| Los Angeles, CA | 91 |

Top listing tags:

| Tag | Count |
|---|---:|
| stem cell clinic | 1,965 |
| stem cell clinics | 256 |

Notes:

- `website` is populated for 7,205 listings.
- The public list pages expose name, detail URL, category/location, website, phone, tags, address, and image. Detail pages mostly repeat these fields plus a contact-owner form, so this scrape uses list pages as the source of truth.
- Local image download was not run for this large source; remote image URLs are in `images`.

### `mayo_executive_health_locations.sqlite`

Records: 4 executive-health location listings, 62 image URLs, 4 downloaded local images.

Primary record type:

- `listing_fields.record_type`: `executive_health_location_detail`

Primary category fields:

- `listing_fields.location_name`
- `listing_fields.sections`
- `services_json`: `Executive Health Program`
- `procedures_json.location_page_type`

Locations:

| Location | Count |
|---|---:|
| Rochester, Minnesota | 1 |
| Scottsdale, Arizona | 1 |
| Jacksonville, Florida | 1 |
| London, United Kingdom | 1 |

### `fountain_life_best_longevity_clinics_blog.sqlite`

Records: 10 editorial ranked clinic entries, 10 image URLs, 10 downloaded local images.

This source is a blog post, so each row is categorized as an editorial/ranked article entry rather than a directory-owned clinic profile.

Primary record type:

- `listing_fields.record_type`: `editorial_ranked_blog_entry`

Primary category/ranking fields:

- `listing_fields.rank`
- `listing_fields.article_title`
- `listing_fields.article_url`
- `listing_fields.location_text`
- `procedures_json.editorial_category`: `best_longevity_clinics`
- `procedures_json.rank`

Rows:

| Rank | Clinic | Location |
|---:|---|---|
| 1 | Fountain Life | Texas, Florida, and New York, United States |
| 2 | Clinique La Prairie | Lake Geneva, Switzerland |
| 3 | Lanserhof Lans | Austria, Denmark, Germany, United Kingdom |
| 4 | SHA Wellness Clinic | Alicante, Spain |
| 5 | Chenot Palace Weggis | Weggis, Switzerland |
| 6 | Six Senses | Ibiza, Spain |
| 7 | Chiva-Som | Thailand |
| 8 | Golden Door | California, United States |
| 9 | The Ranch Hudson Valley | New York, United States |
| 10 | Longevity Center | Zurich, Switzerland, and Warsaw, Poland |

Price text from the article is stored in `price_text`; extracted services are in `services_json` when the article section exposed a service list.
