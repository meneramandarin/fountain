import { readFile, writeFile } from "node:fs/promises";

const INPUT = new URL("../pipeline/reports/dubai-sparse-menu-research-20260810.json", import.meta.url);
const OUTPUT = new URL("../migrations/20260810_expand_sparse_dubai_menus.sql", import.meta.url);
const report = JSON.parse(await readFile(INPUT, "utf8"));

const EXCLUDED_NAMES = /^(?:aesthetics|best orthopedic doctor|gynecology|orthopedic|orthopedic doctor for (?:knee|shoulders)|best orthopedic doctor for back pain|plastic surgery|psychiatry|occupational therapist)$/iu;
const sql = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

function evidenceSupportsPrice(item) {
  if (item.price_amount == null) return false;
  if (!/\bAED\b|د\.إ/iu.test(item.evidence_text || "")) return false;
  const wanted = String(item.price_amount).replace(/\.0+$/u, "").replace(/\D/gu, "");
  const candidates = [...String(item.evidence_text || "").matchAll(/\d[\d,.]*/gu)]
    .map((match) => match[0].replace(/\D/gu, ""));
  return candidates.includes(wanted);
}

const selected = [];
for (const row of report.locations) {
  for (const original of row.offerings) {
    if (EXCLUDED_NAMES.test(original.raw_name.trim())) continue;
    // Al Zahra's directory record is specifically the HBOT service, not the
    // hospital's complete bariatric, breast, dialysis, and cardiology catalog.
    if (row.location.id === 14249 && !/hyperbaric|HBOT/iu.test(original.raw_name)) continue;
    const item = structuredClone(original);
    if (!evidenceSupportsPrice(item)) {
      item.price_amount = null;
      item.price_max_amount = null;
      item.price_currency = null;
      if (item.price_type !== "on_request") item.price_type = "unknown";
    } else if (item.price_type === "exact") {
      item.price_max_amount = null;
    } else if (item.price_max_amount === item.price_amount) {
      item.price_max_amount = null;
      item.price_type = "exact";
    }
    selected.push({ locationId: row.location.id, ...item });
  }
}

const deduped = [...new Map(selected.map((item) => [`${item.locationId}:${item.raw_name.trim().toLowerCase()}`, item])).values()];
const values = deduped.map((item) => `    (${item.locationId}, ${sql(item.raw_name.trim())}, ${sql(item.description?.trim() || null)}, ${item.duration_minutes ?? "NULL"}, ${item.price_amount ?? "NULL"}, ${item.price_max_amount ?? "NULL"}, ${sql(item.price_currency)}, ${sql(item.price_type)}, ${sql(item.price_unit)}, ${sql(item.price_context)}, ${sql(item.source_url)}, ${sql(item.evidence_text)})`).join(",\n");
const locationIds = [...new Set(deduped.map((item) => item.locationId))].sort((a, b) => a - b);

const migration = `-- Generated from high-confidence official-site research (pipeline run ${report.run_id}).
-- Numeric prices survive only when the saved verbatim evidence contains both
-- the amount and AED. Al Zahra's HBOT-specific record is kept service-scoped.
BEGIN;

SELECT set_config('fountain.actor_id', 'd3b4106a-7f23-4e60-9f12-202608100005', true);
SELECT set_config('fountain.actor_label', 'expand_sparse_dubai_menus_20260810', true);

CREATE TABLE IF NOT EXISTS fountain_raw.sparse_dubai_offerings_backup_20260810 AS
SELECT * FROM fountain.offerings WHERE location_id IN (${locationIds.join(", ")});

CREATE TEMP TABLE sparse_menu (
  location_id integer NOT NULL,
  raw_name text NOT NULL,
  description text,
  duration_minutes integer,
  price_amount numeric,
  price_max_amount numeric,
  price_currency text,
  price_type text NOT NULL,
  price_unit text NOT NULL,
  price_context text,
  source_url text NOT NULL,
  evidence_text text NOT NULL
) ON COMMIT DROP;

INSERT INTO sparse_menu (
  location_id, raw_name, description, duration_minutes, price_amount,
  price_max_amount, price_currency, price_type, price_unit, price_context,
  source_url, evidence_text
)
VALUES
${values};

CREATE TEMP TABLE sparse_menu_normalized ON COMMIT DROP AS
SELECT menu.*,
       CASE
         WHEN lower(raw_name) LIKE '%hyperbaric%' OR lower(raw_name) LIKE '%hbot%' THEN 27
         WHEN lower(raw_name) LIKE '%nad+%' OR lower(raw_name) LIKE '%nad iv%' THEN 22
         WHEN lower(raw_name) LIKE '%iv %' OR lower(raw_name) LIKE '%iv&%' OR lower(raw_name) LIKE '%infusion%' THEN 74
         WHEN lower(raw_name) LIKE '%exosome%' THEN 18
         WHEN lower(raw_name) LIKE '%stem cell%' OR lower(raw_name) LIKE '%muse cell%' THEN 17
         WHEN lower(raw_name) LIKE '%prp%' THEN 19
         WHEN lower(raw_name) LIKE '%peptide%' THEN 20
         WHEN lower(raw_name) LIKE '%ozone%' OR lower(raw_name) LIKE '%eboo%' THEN 54
         WHEN lower(raw_name) LIKE '%cryotherap%' OR lower(raw_name) LIKE '%localised cryo%' THEN 28
         WHEN lower(raw_name) LIKE '%red light%' OR lower(raw_name) LIKE '%led light%' THEN 31
         WHEN lower(raw_name) LIKE '%lymph%' THEN 56
         WHEN lower(raw_name) LIKE '%physiotherap%' OR lower(raw_name) LIKE '%physical therap%' THEN 44
         WHEN lower(raw_name) LIKE '%nutrition%' OR lower(raw_name) LIKE '%dietitian%' THEN 39
         WHEN lower(raw_name) LIKE '%vo2%' THEN 8
         WHEN lower(raw_name) LIKE '%blood panel%' OR lower(raw_name) LIKE '%blood test%' THEN 7
         WHEN lower(raw_name) LIKE '%genetic%' THEN 9
         WHEN lower(raw_name) LIKE '%cancer screen%' THEN 10
         WHEN lower(raw_name) LIKE '%body composition%' OR lower(raw_name) LIKE '%inbody%' THEN 4
         WHEN lower(raw_name) LIKE '%functional medicine%' THEN 43
         WHEN lower(raw_name) LIKE '%botox%' OR lower(raw_name) LIKE '%anti-wrinkle%' THEN 34
         WHEN lower(raw_name) LIKE '%filler%' THEN 35
         WHEN lower(raw_name) LIKE '%hydrafacial%' THEN 53
         WHEN lower(raw_name) LIKE '%microneedl%' OR lower(raw_name) LIKE '%dermapen%' OR lower(raw_name) LIKE '%morpheus8%' THEN 47
         WHEN lower(raw_name) LIKE '%chemical peel%' OR lower(raw_name) LIKE '%carbon peel%' THEN 57
         WHEN lower(raw_name) LIKE '%laser hair%' THEN 50
         WHEN lower(raw_name) LIKE '%tattoo removal%' THEN 59
         WHEN lower(raw_name) LIKE '%laser skin%' OR lower(raw_name) LIKE '%photofacial%' THEN 96
         WHEN lower(raw_name) LIKE '%body contour%' OR lower(raw_name) LIKE '%body sculpt%' OR lower(raw_name) LIKE '%cooltech%' OR lower(raw_name) LIKE '%emsculpt%' THEN 48
         WHEN lower(raw_name) LIKE '%cellulite%' THEN 88
         WHEN lower(raw_name) LIKE '%weight loss%' OR lower(raw_name) LIKE '%metabolic weight%' THEN 62
         WHEN lower(raw_name) LIKE '%hair regrowth%' OR lower(raw_name) LIKE '%hair restoration%' OR lower(raw_name) LIKE '%hair loss%' THEN 51
         WHEN lower(raw_name) LIKE '%massage%' OR lower(raw_name) LIKE '%reflexology%' THEN 49
         WHEN lower(raw_name) LIKE '%chiropractic%' THEN 45
         WHEN lower(raw_name) LIKE '%acupuncture%' OR lower(raw_name) LIKE '%dry needle%' THEN 46
         WHEN lower(raw_name) LIKE '%shockwave%' THEN 33
         WHEN lower(raw_name) LIKE '%permanent makeup%' THEN 104
         WHEN lower(raw_name) LIKE '%pilates%' THEN 79
         ELSE NULL
       END::integer AS treatment_id
FROM sparse_menu menu;

UPDATE fountain.offerings offering
SET treatment_id = COALESCE(offering.treatment_id, menu.treatment_id),
    description = COALESCE(NULLIF(menu.description, ''), offering.description),
    duration_minutes = COALESCE(menu.duration_minutes, offering.duration_minutes),
    price_amount = COALESCE(menu.price_amount, offering.price_amount),
    price_max_amount = CASE WHEN menu.price_amount IS NOT NULL THEN menu.price_max_amount ELSE offering.price_max_amount END,
    price_currency = COALESCE(menu.price_currency, offering.price_currency),
    price_type = CASE WHEN menu.price_amount IS NOT NULL OR menu.price_type = 'on_request' THEN menu.price_type ELSE offering.price_type END,
    price_unit = CASE WHEN menu.price_amount IS NOT NULL OR menu.price_type = 'on_request' THEN menu.price_unit ELSE offering.price_unit END,
    price_context = COALESCE(menu.price_context, offering.price_context),
    source_offer_url = menu.source_url,
    verification_status = CASE WHEN offering.verification_status IN ('human_verified', 'owner_verified') THEN offering.verification_status ELSE 'agent_verified' END,
    updated_at = now()
FROM sparse_menu_normalized menu
WHERE offering.location_id = menu.location_id
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND lower(trim(offering.raw_name)) = lower(trim(menu.raw_name));

INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_max_amount,
  price_currency, source_offer_url, source_id, status, data_origin,
  verification_status, duration_minutes, description, price_type,
  price_unit, price_context, created_at, updated_at
)
SELECT menu.location_id, menu.treatment_id, menu.raw_name, menu.price_amount,
       menu.price_max_amount, menu.price_currency, menu.source_url, NULL,
       'active', 'manual', 'agent_verified', menu.duration_minutes,
       menu.description, menu.price_type, menu.price_unit, menu.price_context,
       now(), now()
FROM sparse_menu_normalized menu
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = menu.location_id
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
    AND lower(trim(existing.raw_name)) = lower(trim(menu.raw_name))
);

-- Fill only blank descriptions, using the canonical treatment copy when an
-- extracted name maps cleanly to the Fountain taxonomy.
UPDATE fountain.offerings offering
SET description = treatment.description,
    updated_at = now()
FROM fountain.treatments treatment
WHERE offering.location_id IN (${locationIds.join(", ")})
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND offering.treatment_id = treatment.id
  AND NULLIF(trim(offering.description), '') IS NULL
  AND NULLIF(trim(treatment.description), '') IS NOT NULL;

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT 'location', location_id, 'offerings', 'agent_verified', false,
       'expand_sparse_dubai_menus_20260810', now(),
       'Official-site menu research run ${report.run_id}; evidence URL and verbatim evidence retained in the research report'
FROM (VALUES ${locationIds.map((id) => `(${id})`).join(", ")}) locations(location_id)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

COMMIT;
`;

await writeFile(OUTPUT, migration, "utf8");
console.log(JSON.stringify({
  output: OUTPUT.pathname,
  source_run: report.run_id,
  locations: locationIds.length,
  offerings: deduped.length,
  numeric_prices: deduped.filter((item) => item.price_amount != null).length,
  described_before_taxonomy_fallback: deduped.filter((item) => item.description).length,
}, null, 2));
