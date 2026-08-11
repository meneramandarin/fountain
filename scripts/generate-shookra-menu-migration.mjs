import { writeFile } from "node:fs/promises";

const CATALOG_URL = "https://shookra.com/treatments";
const IV_URL = "https://shookra.com/iv-therapy";
const OUTPUT = new URL("../migrations/20260810_rebuild_shookra_full_menu.sql", import.meta.url);

const decode = (value) => String(value || "")
  .replace(/&#x27;|&#39;|&apos;/giu, "'")
  .replace(/&quot;/giu, '"')
  .replace(/&amp;/giu, "&")
  .replace(/&nbsp;/giu, " ")
  .replace(/&ndash;/giu, "–")
  .replace(/&mdash;/giu, "—")
  .replace(/&plusmn;/giu, "±")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));

const text = (value) => decode(String(value || "").replace(/<[^>]+>/gu, " "))
  .replace(/\s+/gu, " ")
  .trim();

const sql = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "Fountain directory research/1.0" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function treatmentCards(html) {
  const rows = [];
  const pattern = /<a class="group block" href="(\/treatments\/[^"]+)">([\s\S]*?)<\/a>/giu;
  for (const match of html.matchAll(pattern)) {
    const name = text(match[2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/iu)?.[1]);
    if (name) rows.push({ name, url: new URL(match[1], CATALOG_URL).href });
  }
  return rows;
}

function treatmentPage(html, fallbackName, url) {
  const h1 = html.indexOf("<h1");
  const segment = h1 >= 0 ? html.slice(h1, h1 + 12_000) : html;
  const description = text(segment.match(/<h1\b[\s\S]*?<\/h1>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/iu)?.[1]);
  const pairs = [...segment.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/giu)]
    .map((match) => ({ label: text(match[1]).toLowerCase(), value: text(match[2]) }));
  const timing = pairs.find((pair) => pair.label === "duration" || pair.label === "session")?.value || "";
  const exact = timing.match(/^(?:around\s+)?(\d+)\s*(?:min|mins|minutes)$/iu);
  return {
    name: fallbackName,
    description,
    duration: exact ? Number(exact[1]) : null,
    priceContext: "Current price confirmed on request via Shookra WhatsApp",
    url,
  };
}

function ivCards(html) {
  const rows = [];
  const pattern = /<li class="flex"><a\b([\s\S]*?)<\/a><\/li>/giu;
  for (const match of html.matchAll(pattern)) {
    const name = text(match[1].match(/<span class="relative text-base font-medium leading-tight text-ink">([\s\S]*?)<\/span>/iu)?.[1]);
    const description = text(match[1].match(/<span class="relative mt-1\.5 text-sm leading-snug text-muted">([\s\S]*?)<\/span>/iu)?.[1]);
    if (!name || !description) continue;
    const offeringName = /\bdrip$/iu.test(name)
      ? name
      : /\biv$/iu.test(name)
        ? `${name} Drip`
        : `${name} IV Drip`;
    rows.push({
      name: offeringName,
      description,
      duration: null,
      priceContext: "Current price confirmed on request via Shookra WhatsApp",
      url: IV_URL,
    });
  }
  return rows;
}

const catalogHtml = await get(CATALOG_URL);
const cards = treatmentCards(catalogHtml);
if (cards.length !== 40) throw new Error(`Expected 40 Shookra treatments; found ${cards.length}.`);

const treatments = [];
for (const card of cards) {
  treatments.push(treatmentPage(await get(card.url), card.name, card.url));
}

const ivs = ivCards(await get(IV_URL));
if (ivs.length !== 32) throw new Error(`Expected 32 Shookra IV drips; found ${ivs.length}.`);

const rows = [...treatments, ...ivs];
const values = rows.map((row) => `    (${sql(row.name)}, ${sql(row.description)}, ${row.duration ?? "NULL"}, ${sql(row.priceContext)}, ${sql(row.url)})`).join(",\n");

const migration = `-- Generated from Shookra's official 40-treatment catalog and 32-protocol IV menu.
-- Source pages were fetched on 2026-08-10. Numeric prices are not published;
-- Shookra explicitly confirms current pricing through WhatsApp.
BEGIN;

SELECT set_config('fountain.actor_id', 'd3b4106a-7f23-4e60-9f12-202608100002', true);
SELECT set_config('fountain.actor_label', 'rebuild_shookra_full_menu_20260810', true);

CREATE TABLE IF NOT EXISTS fountain_raw.shookra_offerings_backup_20260810 AS
SELECT * FROM fountain.offerings WHERE location_id = 15934;

WITH menu(raw_name, description, duration_minutes, price_context, source_url) AS (
  VALUES
${values}
), normalized AS (
  SELECT menu.*,
         CASE
           WHEN lower(raw_name) LIKE '%nad+%' THEN 22
           WHEN lower(raw_name) LIKE '%exosome%' THEN 18
           WHEN lower(raw_name) LIKE '%stem cell%' THEN 17
           WHEN lower(raw_name) LIKE '%prp%' THEN 19
           WHEN lower(raw_name) LIKE '%hydrafacial%' THEN 53
           WHEN lower(raw_name) LIKE '%chemical peel%' THEN 57
           WHEN lower(raw_name) LIKE '%morpheus8%' THEN 47
           WHEN lower(raw_name) LIKE '%anti-wrinkle%' THEN 34
           WHEN lower(raw_name) LIKE '%dermal filler%' THEN 35
           WHEN lower(raw_name) LIKE '%hair loss%' THEN 51
           WHEN lower(raw_name) LIKE '%microneedling%' THEN 47
           WHEN lower(raw_name) LIKE '%laser skin rejuvenation%' THEN 96
           WHEN lower(raw_name) LIKE '%laser tattoo%' THEN 59
           WHEN lower(raw_name) LIKE '%semi-permanent makeup%' THEN 104
           WHEN lower(raw_name) LIKE '%laser hair removal%' THEN 50
           WHEN lower(raw_name) LIKE '%hifu%' THEN 52
           WHEN lower(raw_name) LIKE '%body sculpting%' THEN 48
           WHEN lower(raw_name) LIKE '%cryolipolysis%' THEN 48
           WHEN lower(raw_name) LIKE '%cellulite reduction%' THEN 88
           WHEN lower(raw_name) LIKE '%medical weight loss%' THEN 62
           WHEN lower(raw_name) LIKE '%pressotherapy%' THEN 56
           WHEN lower(raw_name) LIKE '%iv drip%' THEN 74
           ELSE NULL
         END AS treatment_id
  FROM menu
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status,
  duration_minutes, description, price_type, price_unit, price_context,
  created_at, updated_at
)
SELECT 15934, treatment_id, raw_name, NULL, 'AED', source_url, NULL,
       'active', 'manual', 'agent_verified', duration_minutes::integer, description,
       'on_request', 'service', price_context, now(), now()
FROM normalized
ON CONFLICT DO NOTHING;

-- Retire the four old generic/duplicate IV rows now superseded by the literal menu.
UPDATE fountain.offerings
SET status = 'deleted', deleted_at = COALESCE(deleted_at, now()), updated_at = now()
WHERE location_id = 15934
  AND id IN (119313, 119314, 119315, 119316)
  AND status = 'active';

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
VALUES (
  'location', 15934, 'offerings', 'agent_verified', false,
  'rebuild_shookra_full_menu_20260810', now(),
  'https://shookra.com/treatments | 40 treatments; https://shookra.com/iv-therapy | 32 named IV protocols with provider descriptions; pricing explicitly on request'
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
console.log(JSON.stringify({ output: OUTPUT.pathname, treatments: treatments.length, iv_drips: ivs.length, total: rows.length }, null, 2));
