#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { put } from "@vercel/blob";
import dotenv from "dotenv";
import pg from "pg";
import { chromium } from "playwright";

const { Client } = pg;
const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");
const RUN_DATE = "20260724";
const LOGO_PATH = path.resolve(
  process.env.THE_IV_DOC_LOGO_PATH || "/Users/marleneronstedt/Desktop/the-iv-doc-logo.svg",
);
const REPORT_PATH = path.join(
  ROOT,
  "pipeline",
  "reports",
  `the-iv-doc-menu-sync-${RUN_DATE}.json`,
);
const OFFICIAL_MENU_SOURCE_SLUG = "the_iv_doc_official_booking_menu";
const ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607240001";
const TARGET_CHAIN_NAME = "The IV Doc";
const MENU_CONCURRENCY = 6;
const MINIMUM_MENU_ITEMS = 30;

dotenv.config({
  path: path.join(ROOT, ".env.production.local"),
  override: true,
  quiet: true,
});

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;
const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN ||
  process.env.VERCEL_BLOB_READ_WRITE_TOKEN;

if (!connectionString) throw new Error("Missing production database URL.");
if (APPLY && !blobToken) throw new Error("Missing Vercel Blob write token.");

const client = new Client({ connectionString });
await client.connect();

let browser;
try {
  const locations = await loadLocations();
  if (locations.length !== 38) {
    throw new Error(`Expected 38 The IV Doc locations; found ${locations.length}.`);
  }

  browser = await chromium.launch({ headless: true });
  const menus = await mapWithConcurrency(
    locations,
    MENU_CONCURRENCY,
    (location) => extractLocationMenu(browser, location),
  );
  validateMenus(menus);

  const report = buildReport({ locations, menus, applied: false });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  if (!APPLY) {
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`Dry run only. Wrote ${path.relative(ROOT, REPORT_PATH)}`);
    process.exitCode = 0;
  } else {
    const logo = await uploadLogo();
    const result = await applySync({ locations, menus, logo });
    const appliedReport = buildReport({
      locations,
      menus,
      applied: true,
      logo,
      result,
    });
    await writeFile(REPORT_PATH, `${JSON.stringify(appliedReport, null, 2)}\n`);
    console.log(JSON.stringify(appliedReport.summary, null, 2));
    console.log(`Applied. Wrote ${path.relative(ROOT, REPORT_PATH)}`);
  }
} finally {
  await browser?.close().catch(() => {});
  await client.end();
}

async function loadLocations() {
  const result = await client.query(
    `
      SELECT DISTINCT ON (location.id)
        location.id,
        location.name,
        location.locality,
        location.region,
        location.website,
        location.status
      FROM fountain.locations location
      JOIN fountain_raw.agent_discovery_candidates candidate
        ON candidate.promoted_location_id = location.id
      WHERE candidate.chain_name = $1
        AND candidate.promoted_location_id IS NOT NULL
        AND location.status = 'active'
        AND location.deleted_at IS NULL
      ORDER BY location.id, candidate.id
    `,
    [TARGET_CHAIN_NAME],
  );
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    menu_url:
      row.locality === "San Francisco"
        ? "https://www.theivdoc.com/make-an-appointment/locations/San-Francisco"
        : row.website,
  }));
}

async function extractLocationMenu(browserInstance, location) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const page = await browserInstance.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    try {
      await page.goto(location.menu_url, {
        waitUntil: "networkidle",
        timeout: 120_000,
      });
      await page.waitForSelector(".service_item h2", { timeout: 45_000 });
      const items = await page.evaluate(() =>
        [...document.querySelectorAll(".service_item")]
          .map((element) => ({
            name: (element.querySelector(".service_item_intro h2")?.textContent || "")
              .trim()
              .replace(/\s+/g, " "),
            description: (
              element.querySelector(".service_item_intro p")?.textContent || ""
            )
              .trim()
              .replace(/\s+/g, " ")
              .replace(/\s*\.\.\.more$/i, ""),
            price_text: (element.querySelector(".cost")?.textContent || "")
              .trim()
              .replace(/\s+/g, " "),
          }))
          .filter((item) => item.name && /^\$[\d,]+(?:\.\d{2})?$/.test(item.price_text)),
      );
      return {
        location_id: location.id,
        location_name: location.name,
        locality: location.locality,
        region: location.region,
        menu_url: page.url(),
        page_title: await page.title(),
        item_count: items.length,
        items: items.map((item) => ({
          ...item,
          price_amount: Number(item.price_text.replace(/[$,]/g, "")),
          price_currency: "USD",
        })),
      };
    } catch (error) {
      lastError = error;
    } finally {
      await page.close();
    }
  }
  throw new Error(
    `Menu extraction failed for ${location.name}: ${lastError?.message || lastError}`,
  );
}

function validateMenus(menus) {
  for (const menu of menus) {
    if (menu.item_count < MINIMUM_MENU_ITEMS) {
      throw new Error(
        `${menu.location_name} returned only ${menu.item_count} menu items.`,
      );
    }
    const names = new Set(menu.items.map((item) => item.name));
    if (names.size !== menu.items.length) {
      throw new Error(`${menu.location_name} returned duplicate menu item names.`);
    }
    for (const item of menu.items) {
      if (!Number.isFinite(item.price_amount) || item.price_amount <= 0) {
        throw new Error(
          `${menu.location_name} has an invalid price for ${item.name}.`,
        );
      }
    }
  }
}

async function uploadLogo() {
  const buffer = await readFile(LOGO_PATH);
  const contentSha256 = createHash("sha256").update(buffer).digest("hex");
  const pathname =
    `listing-images/manual/the-iv-doc/` +
    `the-iv-doc-logo-${contentSha256.slice(0, 20)}.svg`;
  const uploaded = await put(pathname, buffer, {
    access: "public",
    contentType: "image/svg+xml",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken,
  });
  return {
    source_path: LOGO_PATH,
    blob_url: uploaded.url,
    content_sha256: contentSha256,
    bytes: buffer.length,
  };
}

async function applySync({ locations, menus, logo }) {
  const locationIds = locations.map((location) => location.id);
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT fountain.set_mutation_actor($1::uuid, $2::text)",
      [ACTOR_ID, `the_iv_doc_logo_menu_sync_${RUN_DATE}`],
    );
    await createBackups();
    const sourceId = await ensureOfficialMenuSource();
    await persistRawMenuEvidence(menus);

    const imageResult = await client.query(
      `
        INSERT INTO fountain.images (
          id,
          entity_type,
          entity_id,
          image_url,
          blob_url,
          content_sha256,
          alt,
          source_id,
          status,
          data_origin,
          verification_status,
          image_kind
        )
        SELECT
          nextval('fountain.images_id_seq'),
          'location',
          location_id,
          $2,
          $2,
          $3,
          'The IV Doc logo',
          NULL,
          'active',
          'manual',
          'human_verified',
          'logo'
        FROM unnest($1::integer[]) AS location_id
        WHERE NOT EXISTS (
          SELECT 1
          FROM fountain.images existing
          WHERE existing.entity_type = 'location'
            AND existing.entity_id = location_id
            AND existing.content_sha256 = $3
            AND existing.status = 'active'
            AND existing.deleted_at IS NULL
        )
        RETURNING id, entity_id
      `,
      [locationIds, logo.blob_url, logo.content_sha256],
    );

    const retiredResult = await client.query(
      `
        UPDATE fountain.offerings
        SET
          status = 'deleted',
          deleted_at = now(),
          updated_at = now()
        WHERE location_id = ANY($1::integer[])
          AND status = 'active'
          AND deleted_at IS NULL
        RETURNING id
      `,
      [locationIds],
    );

    let offeringsUpserted = 0;
    for (const menu of menus) {
      for (const item of menu.items) {
        await client.query(
          `
            INSERT INTO fountain.offerings (
              id,
              location_id,
              treatment_id,
              raw_name,
              price_amount,
              price_currency,
              source_offer_url,
              source_id,
              status,
              data_origin,
              verification_status,
              deleted_at
            )
            VALUES (
              nextval('fountain.offerings_id_seq'),
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              'active',
              'scraped',
              'human_verified',
              NULL
            )
            ON CONFLICT (location_id, source_id, raw_name)
            DO UPDATE SET
              treatment_id = EXCLUDED.treatment_id,
              price_amount = EXCLUDED.price_amount,
              price_currency = EXCLUDED.price_currency,
              source_offer_url = EXCLUDED.source_offer_url,
              status = 'active',
              data_origin = 'scraped',
              verification_status = 'human_verified',
              deleted_at = NULL,
              updated_at = now()
          `,
          [
            menu.location_id,
            treatmentIdFor(item.name),
            item.name,
            item.price_amount,
            item.price_currency,
            menu.menu_url,
            sourceId,
          ],
        );
        offeringsUpserted += 1;
      }
    }

    for (const menu of menus) {
      await client.query(
        `
          INSERT INTO fountain.entity_change_events (
            id,
            entity_type,
            entity_id,
            action,
            actor_type,
            actor_id,
            reason,
            metadata
          )
          VALUES (
            nextval('fountain.entity_change_events_id_seq'),
            'location',
            $1,
            'the_iv_doc_logo_menu_sync',
            'admin',
            $2::uuid,
            'manual_logo_and_official_branch_menu_sync',
            jsonb_build_object(
              'run_date', $3::text,
              'menu_url', $4::text,
              'menu_item_count', $5::integer,
              'logo_blob_url', $6::text,
              'menu_source_id', $7::integer
            )
          )
        `,
        [
          menu.location_id,
          ACTOR_ID,
          RUN_DATE,
          menu.menu_url,
          menu.item_count,
          logo.blob_url,
          sourceId,
        ],
      );
    }

    await client.query("COMMIT");
    return {
      source_id: sourceId,
      logo_rows_inserted: imageResult.rowCount,
      old_offerings_retired: retiredResult.rowCount,
      offerings_upserted: offeringsUpserted,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function createBackups() {
  await client.query("CREATE SCHEMA IF NOT EXISTS fountain_raw");
  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.the_iv_doc_images_backup_${RUN_DATE} AS
    SELECT image.*
    FROM fountain.images image
    WHERE image.entity_type = 'location'
      AND image.entity_id IN (
        SELECT DISTINCT candidate.promoted_location_id
        FROM fountain_raw.agent_discovery_candidates candidate
        WHERE candidate.chain_name = '${TARGET_CHAIN_NAME}'
          AND candidate.promoted_location_id IS NOT NULL
      )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.the_iv_doc_offerings_backup_${RUN_DATE} AS
    SELECT offering.*
    FROM fountain.offerings offering
    WHERE offering.location_id IN (
      SELECT DISTINCT candidate.promoted_location_id
      FROM fountain_raw.agent_discovery_candidates candidate
      WHERE candidate.chain_name = '${TARGET_CHAIN_NAME}'
        AND candidate.promoted_location_id IS NOT NULL
    )
  `);
}

async function ensureOfficialMenuSource() {
  const result = await client.query(
    `
      INSERT INTO fountain.sources (
        id,
        slug,
        trust_weight,
        offering_granularity
      )
      VALUES (
        nextval('fountain.sources_id_seq'),
        $1,
        1.0,
        'menu_item'
      )
      ON CONFLICT (slug)
      DO UPDATE SET
        trust_weight = EXCLUDED.trust_weight,
        offering_granularity = EXCLUDED.offering_granularity
      RETURNING id
    `,
    [OFFICIAL_MENU_SOURCE_SLUG],
  );
  return Number(result.rows[0].id);
}

async function persistRawMenuEvidence(menus) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.the_iv_doc_official_menu_${RUN_DATE} (
      location_id integer PRIMARY KEY,
      menu_url text NOT NULL,
      page_title text,
      item_count integer NOT NULL,
      items jsonb NOT NULL,
      extracted_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const menu of menus) {
    await client.query(
      `
        INSERT INTO fountain_raw.the_iv_doc_official_menu_${RUN_DATE} (
          location_id,
          menu_url,
          page_title,
          item_count,
          items,
          extracted_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT (location_id)
        DO UPDATE SET
          menu_url = EXCLUDED.menu_url,
          page_title = EXCLUDED.page_title,
          item_count = EXCLUDED.item_count,
          items = EXCLUDED.items,
          extracted_at = now()
      `,
      [
        menu.location_id,
        menu.menu_url,
        menu.page_title,
        menu.item_count,
        JSON.stringify(menu.items),
      ],
    );
  }
}

function treatmentIdFor(name) {
  if (/^NAD\+/i.test(name)) return 22;
  if (/^Vitamin B(?:12| Complex)/i.test(name)) return 87;
  if (
    /\b(?:Relief|Boost|Cocktail|Beautify|Antioxidant)\b/i.test(name) &&
    !/\bShot\b/i.test(name)
  ) {
    return 74;
  }
  return null;
}

function buildReport({ locations, menus, applied, logo = null, result = null }) {
  const itemCounts = menus.map((menu) => menu.item_count);
  const offerings = menus.reduce((sum, menu) => sum + menu.item_count, 0);
  return {
    run_date: RUN_DATE,
    chain: TARGET_CHAIN_NAME,
    applied,
    generated_at: new Date().toISOString(),
    summary: {
      locations: locations.length,
      locations_with_valid_menu: menus.length,
      offerings,
      minimum_items_per_location: Math.min(...itemCounts),
      maximum_items_per_location: Math.max(...itemCounts),
      distinct_menu_signatures: new Set(
        menus.map((menu) =>
          menu.items.map((item) => `${item.name}|${item.price_amount}`).join(";;"),
        ),
      ).size,
      logo_blob_url: logo?.blob_url || null,
      ...(result || {}),
    },
    logo,
    locations: menus,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}
