import { writeFile } from "node:fs/promises";

const ARCHIVE = "https://mylondonskinclinic.ae/product-category/uncategorised/";
const OUTPUT = new URL("../migrations/20260810_import_my_london_official_booking_menu.sql", import.meta.url);

const decode = (value) => String(value || "")
  .replace(/&nbsp;/giu, " ")
  .replace(/&amp;/giu, "&")
  .replace(/&ndash;/giu, "–")
  .replace(/&mdash;/giu, "—")
  .replace(/&ldquo;|&rdquo;/giu, '"')
  .replace(/&#x27;|&#39;|&apos;/giu, "'")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const strip = (value) => decode(String(value || "").replace(/<[^>]+>/gu, " "))
  .replace(/\s+/gu, " ")
  .trim();
const sql = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "Fountain directory research/1.0" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function parseProducts(html) {
  const products = [];
  for (const match of html.matchAll(/<li class="product\b[\s\S]*?<\/li>/giu)) {
    const block = match[0];
    const url = block.match(/<a href="(https:\/\/mylondonskinclinic\.ae\/product\/[^"]+)"/iu)?.[1];
    const name = strip(block.match(/<h2 class="woocommerce-loop-product__title">([\s\S]*?)<\/h2>/iu)?.[1]);
    const priceBlock = block.match(/<span class="price">([\s\S]*?)<\/span>\s*<\/a>/iu)?.[1] || "";
    const current = strip(priceBlock).match(/Current price is:\s*([\d,.]+)\s*AED/iu)?.[1];
    const amounts = [...priceBlock.matchAll(/<bdi>([\d,.]+)(?:&nbsp;|\s)*<span/giu)].map((item) => item[1]);
    const priceText = current || amounts.at(-1);
    const price = Number(String(priceText || "").replaceAll(",", ""));
    if (!url || !name || !Number.isFinite(price) || price <= 0 || /\btest\b/iu.test(name)) continue;
    const base = name.replace(/\s*\((?:Consultation|Offer)\)\s*$/iu, "");
    const description = /\(Consultation\)/iu.test(name)
      ? `Consultation for ${base}, bookable through the clinic's official online menu.`
      : /\(Offer\)/iu.test(name)
        ? `Official online booking offer for ${base}.`
        : `Official online booking menu item for ${name}.`;
    products.push({ name, price, description, url });
  }
  return products;
}

const pages = await Promise.all([
  get(ARCHIVE),
  get(`${ARCHIVE}?product-page=2`),
  get(`${ARCHIVE}?product-page=3`),
  get(`${ARCHIVE}?product-page=4`),
]);
const products = [...new Map(pages.flatMap(parseProducts).map((item) => [item.name.toLowerCase(), item])).values()]
  .sort((left, right) => left.name.localeCompare(right.name));
if (products.length < 40) throw new Error(`Expected at least 40 priced booking items; found ${products.length}.`);

const values = products.map((item) => `    (${sql(item.name)}, ${item.price}, ${sql(item.description)}, ${sql(item.url)})`).join(",\n");
const migration = `-- Generated from My London Skin Clinic's official WooCommerce booking menu.
-- Prices are the current AED amounts exposed by the clinic on 2026-08-10.
BEGIN;

SELECT set_config('fountain.actor_id', 'd3b4106a-7f23-4e60-9f12-202608100003', true);
SELECT set_config('fountain.actor_label', 'import_my_london_official_booking_menu_20260810', true);

CREATE TABLE IF NOT EXISTS fountain_raw.my_london_offerings_backup_20260810 AS
SELECT * FROM fountain.offerings WHERE location_id = 14326;

CREATE TEMP TABLE my_london_menu (
  raw_name text NOT NULL,
  price_amount numeric NOT NULL,
  description text NOT NULL,
  source_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO my_london_menu (raw_name, price_amount, description, source_url)
VALUES
${values};

UPDATE fountain.offerings offering
SET price_amount = menu.price_amount,
    price_currency = 'AED',
    price_type = 'exact',
    price_unit = 'service',
    price_context = 'official online booking price',
    description = COALESCE(NULLIF(trim(offering.description), ''), menu.description),
    source_offer_url = menu.source_url,
    verification_status = CASE WHEN offering.verification_status IN ('human_verified', 'owner_verified') THEN offering.verification_status ELSE 'agent_verified' END,
    updated_at = now()
FROM my_london_menu menu
WHERE offering.location_id = 14326
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND lower(trim(offering.raw_name)) = lower(trim(menu.raw_name));

WITH normalized AS (
  SELECT menu.*,
         CASE
           WHEN lower(raw_name) LIKE '%botox%' OR lower(raw_name) LIKE '%anti wrinkle%' THEN 34
           WHEN lower(raw_name) LIKE '%dermal filler%' THEN 35
           WHEN lower(raw_name) LIKE '%microneedling%' THEN 47
           WHEN lower(raw_name) LIKE '%body sculpting%' THEN 48
           WHEN lower(raw_name) LIKE '%hydrafacial%' THEN 53
           WHEN lower(raw_name) LIKE '%chemical peel%' THEN 57
           WHEN lower(raw_name) LIKE '%laser hair%' THEN 50
           WHEN lower(raw_name) LIKE '%laser tattoo%' THEN 59
           WHEN lower(raw_name) LIKE '%prp%' THEN 19
           WHEN lower(raw_name) LIKE '%exosome%' OR lower(raw_name) LIKE '%biosome%' THEN 18
           WHEN lower(raw_name) LIKE '%weight%' THEN 62
           ELSE NULL
         END AS treatment_id
  FROM my_london_menu menu
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status,
  duration_minutes, description, price_type, price_unit, price_context,
  created_at, updated_at
)
SELECT 14326, normalized.treatment_id, normalized.raw_name,
       normalized.price_amount, 'AED', normalized.source_url, NULL,
       'active', 'manual', 'agent_verified', NULL, normalized.description,
       'exact', 'service', 'official online booking price', now(), now()
FROM normalized
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = 14326
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
    AND lower(trim(existing.raw_name)) = lower(trim(normalized.raw_name))
);

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
VALUES (
  'location', 14326, 'offerings', 'agent_verified', false,
  'import_my_london_official_booking_menu_20260810', now(),
  'https://mylondonskinclinic.ae/product-category/uncategorised/ | official online booking catalog with current AED prices'
)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

COMMIT;
`;

await writeFile(OUTPUT, migration, "utf8");
console.log(JSON.stringify({ output: OUTPUT.pathname, priced_items: products.length }, null, 2));
