#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const ACTOR_ID = "7f94c2c4-57dd-4b9a-a905-7083e8d8a4ff";
const ACTOR_LABEL = "hyperbaric_cleanup_v2_20260711";
const LOCKED_SLUG = "o3-wellness-center-dubai";
const SOURCE_ID = 255;
const SOURCE_SLUG = "hyperbaric_app";
const OUT_DIR = path.join(ROOT, ".cache", "hyperbaric_cleanup_v2", "task_c_20260711");

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
mkdirSync(OUT_DIR, { recursive: true });

const client = new Client({ connectionString });
await client.connect();

const summary = {
  startedAt: null,
  fieldCorrections: {
    candidates: 0,
    candidateFields: 0,
    appliedFields: 0,
    updatedLocations: 0,
    skippedIdentical: 0,
    skippedNoConfidentPlaceMatch: 0,
    skippedNonPipelineActor: 0,
    skippedLocked: 0,
    backedUpRowsInserted: 0,
  },
  prices: {
    payloadRows: 0,
    eligibleSingleSessionRows: 0,
    appliedOfferings: 0,
    conflictRows: 0,
    reviewRows: 0,
    skippedIdentical: 0,
    skippedNoOffering: 0,
  },
  suppressions: {
    candidates: 0,
    hiddenLocations: 0,
    suppressedLedgerRowsInserted: 0,
    suppressedLedgerRowsTouched: 0,
  },
  tsvs: {},
};

try {
  await client.query("BEGIN");
  await setActor();
  const start = await one(`SELECT clock_timestamp() AS started_at`);
  summary.startedAt = start.started_at;

  await createRawTables();
  await applyFieldCorrections();
  await applyPrices();
  await applySuppressions();

  await client.query("COMMIT");

  await writeTsvs();
  await printReport();
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}

async function setActor() {
  await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2::text)", [ACTOR_ID, ACTOR_LABEL]);
}

async function createRawTables() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.field_corrections_backup_20260711 (
      location_id integer NOT NULL,
      field_name text NOT NULL,
      old_value text,
      new_value text,
      old_row jsonb NOT NULL,
      result_json jsonb NOT NULL,
      decision text NOT NULL,
      reason text,
      backed_up_at timestamptz NOT NULL DEFAULT now(),
      actor_label text NOT NULL,
      PRIMARY KEY (location_id, field_name)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.price_conflicts_20260711 (
      location_id integer NOT NULL,
      offering_id integer NOT NULL,
      source_listing_id bigint,
      current_amount double precision,
      current_currency text,
      new_amount double precision,
      new_currency text,
      price_payload jsonb NOT NULL,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      actor_label text NOT NULL,
      PRIMARY KEY (location_id, offering_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.price_review_20260711 (
      location_id integer PRIMARY KEY,
      source_listing_id bigint,
      price_payload jsonb NOT NULL,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      actor_label text NOT NULL
    )
  `);
}

async function applyFieldCorrections() {
  const rows = await many(`
    SELECT r.location_id, q.source_listing_id, l.*, r.result_json,
           (epm.location_id IS NOT NULL) AS has_external_place_match
    FROM fountain_raw.hyperbaric_cleanup_results_20260711 r
    JOIN fountain_raw.hyperbaric_cleanup_queue_20260711 q ON q.location_id=r.location_id
    JOIN fountain.locations l ON l.id=r.location_id
    LEFT JOIN fountain.external_place_matches epm
      ON epm.location_id=r.location_id
     AND epm.provider='google_places'
    WHERE r.result_json->>'address_verdict'='corrected'
       OR r.result_json->>'phone_verdict'='corrected'
       OR r.result_json->>'website_verdict'='corrected'
    ORDER BY r.location_id
  `);
  summary.fieldCorrections.candidates = rows.length;

  for (const row of rows) {
    const fields = correctionFields(row);
    summary.fieldCorrections.candidateFields += fields.length;

    if (row.slug === LOCKED_SLUG) {
      summary.fieldCorrections.skippedLocked += fields.length;
      continue;
    }

    if (!row.has_external_place_match) {
      summary.fieldCorrections.skippedNoConfidentPlaceMatch += fields.length;
      for (const field of fields) {
        await logFieldDecision(row, field, "skipped", "no_confident_place_match");
      }
      continue;
    }

    const updates = [];
    const params = [];
    const applied = [];
    for (const field of fields) {
      const currentValue = row[field.name] ?? null;
      if (normalizeValue(currentValue) === normalizeValue(field.value)) {
        summary.fieldCorrections.skippedIdentical += 1;
        await logFieldDecision(row, field, "skipped", "identical_current_value");
        continue;
      }

      const last = await lastFieldModification(row.id, field.name);
      if (last && last.actor_id !== ACTOR_ID) {
        summary.fieldCorrections.skippedNonPipelineActor += 1;
        await logFieldDecision(row, field, "skipped", `last_modified_by_non_pipeline_actor:${last.actor_id || "null"}`);
        continue;
      }

      params.push(field.value);
      updates.push(`${quoteIdent(field.name)} = $${params.length}`);
      applied.push(field);
    }

    if (!applied.length) continue;

    for (const field of applied) {
      await logFieldDecision(row, field, "applied", "confident_place_match");
    }

    params.push(row.id);
    await client.query(
      `
      UPDATE fountain.locations
      SET ${updates.join(", ")}, updated_at = now()
      WHERE id = $${params.length}
        AND slug <> '${LOCKED_SLUG}'
      `,
      params,
    );
    summary.fieldCorrections.appliedFields += applied.length;
    summary.fieldCorrections.updatedLocations += 1;
  }

  const backupCount = await one(`
    SELECT count(*)::int AS rows
    FROM fountain_raw.field_corrections_backup_20260711
    WHERE actor_label=$1
  `, [ACTOR_LABEL]);
  summary.fieldCorrections.backedUpRowsInserted = backupCount.rows;
}

function correctionFields(row) {
  const result = row.result_json || {};
  const fields = [];
  if (result.address_verdict === "corrected" && result.address_corrected) {
    const address = result.address_corrected;
    pushField(fields, "address", first(address.address, address.street, address.formatted_address));
    pushField(fields, "locality", first(address.locality, address.city));
    pushField(fields, "region", first(address.region, address.state, address.province));
    pushField(fields, "postal_code", first(address.postal_code, address.zip));
    pushField(fields, "country_code", first(address.country_code));
    pushField(fields, "country_name", first(address.country_name, address.country));
  }
  if (result.phone_verdict === "corrected" && result.phone_corrected) {
    pushField(
      fields,
      "phone",
      first(
        result.phone_corrected.number,
        result.phone_corrected.phone,
        result.phone_corrected.international_phone_number,
      ),
    );
  }
  if (result.website_verdict === "corrected" && result.website_corrected) {
    pushField(
      fields,
      "website",
      first(result.website_corrected.url, result.website_corrected.website, result.website_corrected.final_url),
    );
  }
  return fields;
}

function pushField(fields, name, value) {
  if (value === null || value === undefined || String(value).trim() === "") return;
  fields.push({ name, value: String(value).trim() });
}

async function logFieldDecision(row, field, decision, reason) {
  await client.query(
    `
    INSERT INTO fountain_raw.field_corrections_backup_20260711 (
      location_id, field_name, old_value, new_value, old_row, result_json, decision, reason, actor_label
    )
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
    ON CONFLICT (location_id, field_name) DO UPDATE
    SET old_value=EXCLUDED.old_value,
        new_value=EXCLUDED.new_value,
        old_row=EXCLUDED.old_row,
        result_json=EXCLUDED.result_json,
        decision=EXCLUDED.decision,
        reason=EXCLUDED.reason,
        actor_label=EXCLUDED.actor_label
    `,
    [
      row.id,
      field.name,
      row[field.name] == null ? null : String(row[field.name]),
      field.value,
      JSON.stringify(locationSnapshot(row)),
      JSON.stringify(row.result_json),
      decision,
      reason,
      ACTOR_LABEL,
    ],
  );
}

function locationSnapshot(row) {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    address: row.address,
    locality: row.locality,
    region: row.region,
    postal_code: row.postal_code,
    country_code: row.country_code,
    country_name: row.country_name,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    email: row.email,
    website: row.website,
    dedup_key: row.dedup_key,
    public_id: row.public_id,
    status: row.status,
    data_origin: row.data_origin,
    verification_status: row.verification_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    owner_account_id: row.owner_account_id,
    slug: row.slug,
    is_virtual: row.is_virtual,
  };
}

async function lastFieldModification(locationId, fieldName) {
  const result = await one(
    `
    SELECT actor_id::text AS actor_id, actor_type, created_at
    FROM fountain.entity_change_events
    WHERE entity_type='locations'
      AND action='update'
      AND entity_id=$1
      AND before_data->>$2 IS DISTINCT FROM after_data->>$2
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [locationId, fieldName],
  );
  return result || null;
}

async function applyPrices() {
  const rows = await many(`
    SELECT r.location_id, q.source_listing_id, l.slug, r.result_json->'price' AS price_payload
    FROM fountain_raw.hyperbaric_cleanup_results_20260711 r
    JOIN fountain_raw.hyperbaric_cleanup_queue_20260711 q ON q.location_id=r.location_id
    JOIN fountain.locations l ON l.id=r.location_id
    WHERE r.result_json->'price' IS NOT NULL
      AND r.result_json->'price' <> 'null'::jsonb
      AND l.slug <> $1
    ORDER BY r.location_id
  `, [LOCKED_SLUG]);
  summary.prices.payloadRows = rows.length;

  for (const row of rows) {
    const payload = row.price_payload;
    const parsed = parsePrice(payload);
    if (!parsed.ok) {
      await insertPriceReview(row, parsed.reason);
      summary.prices.reviewRows += 1;
      continue;
    }
    summary.prices.eligibleSingleSessionRows += 1;

    const offerings = await many(
      `
      SELECT *
      FROM fountain.offerings
      WHERE location_id=$1
        AND source_id=$2
        AND treatment_id=27
        AND status='active'
        AND deleted_at IS NULL
      ORDER BY id
      `,
      [row.location_id, SOURCE_ID],
    );
    if (!offerings.length) {
      await insertPriceReview(row, "no_active_source_255_offering");
      summary.prices.skippedNoOffering += 1;
      summary.prices.reviewRows += 1;
      continue;
    }
    if (offerings.length > 1) {
      await insertPriceReview(row, `multiple_active_source_255_offerings:${offerings.length}`);
      summary.prices.reviewRows += 1;
      continue;
    }

    const offering = offerings[0];
    const currentHasPrice = offering.price_amount !== null || offering.price_currency !== null;
    if (!currentHasPrice) {
      await client.query(
        `
        UPDATE fountain.offerings
        SET price_amount=$2, price_currency=$3, updated_at=now()
        WHERE id=$1
          AND price_amount IS NULL
          AND price_currency IS NULL
        `,
        [offering.id, parsed.amount, parsed.currency],
      );
      summary.prices.appliedOfferings += 1;
      continue;
    }

    const sameAmount = Number(offering.price_amount) === Number(parsed.amount);
    const sameCurrency = normalizeValue(offering.price_currency) === normalizeValue(parsed.currency);
    if (sameAmount && sameCurrency) {
      summary.prices.skippedIdentical += 1;
      continue;
    }

    await client.query(
      `
      INSERT INTO fountain_raw.price_conflicts_20260711 (
        location_id, offering_id, source_listing_id, current_amount, current_currency,
        new_amount, new_currency, price_payload, reason, actor_label
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'existing_price_differs',$9)
      ON CONFLICT (location_id, offering_id) DO UPDATE
      SET current_amount=EXCLUDED.current_amount,
          current_currency=EXCLUDED.current_currency,
          new_amount=EXCLUDED.new_amount,
          new_currency=EXCLUDED.new_currency,
          price_payload=EXCLUDED.price_payload,
          reason=EXCLUDED.reason,
          actor_label=EXCLUDED.actor_label
      `,
      [
        row.location_id,
        offering.id,
        row.source_listing_id,
        offering.price_amount,
        offering.price_currency,
        parsed.amount,
        parsed.currency,
        JSON.stringify(payload),
        ACTOR_LABEL,
      ],
    );
    summary.prices.conflictRows += 1;
  }
}

function parsePrice(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "price_payload_not_object" };
  if (payload.ambiguous_raw_text) return { ok: false, reason: "ambiguous_raw_text" };
  const amount = Number(payload.amount);
  const currency = typeof payload.currency === "string" ? payload.currency.trim().toUpperCase() : "";
  const unit = typeof payload.unit === "string" ? payload.unit.trim().toLowerCase() : "";
  if (!Number.isFinite(amount) || amount <= 0 || !currency) return { ok: false, reason: "missing_amount_or_currency" };

  const singleSessionUnits = new Set([
    "session",
    "per session",
    "treatment",
    "dive",
    "hour",
    "60 minutes",
    "60 minute",
    "60 mins",
    "90 minutes",
    "90 minute",
  ]);
  if (!singleSessionUnits.has(unit)) return { ok: false, reason: `not_single_session_unit:${unit || "null"}` };
  return { ok: true, amount, currency };
}

async function insertPriceReview(row, reason) {
  await client.query(
    `
    INSERT INTO fountain_raw.price_review_20260711 (location_id, source_listing_id, price_payload, reason, actor_label)
    VALUES ($1,$2,$3::jsonb,$4,$5)
    ON CONFLICT (location_id) DO UPDATE
    SET source_listing_id=EXCLUDED.source_listing_id,
        price_payload=EXCLUDED.price_payload,
        reason=EXCLUDED.reason,
        actor_label=EXCLUDED.actor_label
    `,
    [row.location_id, row.source_listing_id, JSON.stringify(row.price_payload), reason, ACTOR_LABEL],
  );
}

async function applySuppressions() {
  const rows = await many(`
    SELECT r.location_id, q.source_listing_id, r.legitimacy, l.status
    FROM fountain_raw.hyperbaric_cleanup_results_20260711 r
    JOIN fountain_raw.hyperbaric_cleanup_queue_20260711 q ON q.location_id=r.location_id
    JOIN fountain.locations l ON l.id=r.location_id
    WHERE r.legitimacy IN ('suppress_dead','suppress_not_a_clinic','suppress_institutional')
      AND r.confidence='high'
      AND l.slug <> $1
    ORDER BY r.location_id
  `, [LOCKED_SLUG]);
  summary.suppressions.candidates = rows.length;

  for (const row of rows) {
    if (row.status !== "hidden") {
      const result = await client.query(
        `
        UPDATE fountain.locations
        SET status='hidden', updated_at=now()
        WHERE id=$1
          AND status <> 'hidden'
          AND slug <> $2
        `,
        [row.location_id, LOCKED_SLUG],
      );
      summary.suppressions.hiddenLocations += result.rowCount;
    }

    const ledger = await client.query(
      `
      INSERT INTO fountain_raw.suppressed_source_listings (source_slug, source_listing_id, reason, suppressed_by)
      VALUES ($1,$2,'classification',$3)
      ON CONFLICT (source_slug, source_listing_id) DO UPDATE
      SET reason=EXCLUDED.reason,
          suppressed_by=EXCLUDED.suppressed_by
      `,
      [SOURCE_SLUG, row.source_listing_id, ACTOR_LABEL],
    );
    summary.suppressions.suppressedLedgerRowsTouched += ledger.rowCount;
  }

  const inserted = await one(
    `
    SELECT count(*)::int AS rows
    FROM fountain_raw.suppressed_source_listings ssl
    JOIN fountain_raw.hyperbaric_cleanup_queue_20260711 q
      ON q.source_listing_id=ssl.source_listing_id
     AND ssl.source_slug=$1
    JOIN fountain_raw.hyperbaric_cleanup_results_20260711 r
      ON r.location_id=q.location_id
    WHERE r.legitimacy IN ('suppress_dead','suppress_not_a_clinic','suppress_institutional')
      AND r.confidence='high'
      AND ssl.reason='classification'
      AND ssl.suppressed_by=$2
    `,
    [SOURCE_SLUG, ACTOR_LABEL],
  );
  summary.suppressions.suppressedLedgerRowsInserted = inserted.rows;
}

async function writeTsvs() {
  const keepMedical = await many(`
    SELECT l.name, l.locality, coalesce(l.country_name,l.country_code) AS country, l.website,
           r.legitimacy, r.confidence,
           left(regexp_replace(coalesce(r.result_json->'evidence'->>0, r.result_json->>'evidence', ''), E'[\\n\\r\\t]+', ' ', 'g'), 500) AS evidence_summary
    FROM fountain_raw.hyperbaric_cleanup_results_20260711 r
    JOIN fountain.locations l ON l.id=r.location_id
    WHERE r.legitimacy='keep_medical'
    ORDER BY l.country_code, l.locality, l.name
  `);
  writeTsv("keep_medical_20260711.tsv", keepMedical);

  const reviewSuppressions = await many(`
    SELECT l.name, l.locality, coalesce(l.country_name,l.country_code) AS country, l.website,
           r.legitimacy, r.confidence,
           left(regexp_replace(coalesce(r.result_json->'evidence'->>0, r.result_json->>'evidence', ''), E'[\\n\\r\\t]+', ' ', 'g'), 500) AS evidence_summary
    FROM fountain_raw.hyperbaric_cleanup_results_20260711 r
    JOIN fountain.locations l ON l.id=r.location_id
    WHERE r.legitimacy='review'
       OR (r.legitimacy LIKE 'suppress_%' AND r.confidence IN ('medium','low'))
    ORDER BY r.legitimacy, r.confidence, l.country_code, l.locality, l.name
  `);
  writeTsv("review_and_medium_low_suppressions_20260711.tsv", reviewSuppressions);

  const conflicts = await many(`
    SELECT l.name, l.locality, coalesce(l.country_name,l.country_code) AS country, l.website,
           'price_conflict' AS legitimacy, pc.reason AS confidence,
           concat('current=', coalesce(pc.current_amount::text,'null'), ' ', coalesce(pc.current_currency,'null'),
                  '; new=', pc.new_amount::text, ' ', pc.new_currency,
                  '; raw=', pc.price_payload::text) AS evidence_summary
    FROM fountain_raw.price_conflicts_20260711 pc
    JOIN fountain.locations l ON l.id=pc.location_id
    ORDER BY l.country_code, l.locality, l.name
  `);
  if (conflicts.length) writeTsv("price_conflicts_20260711.tsv", conflicts);

  const reviews = await many(`
    SELECT l.name, l.locality, coalesce(l.country_name,l.country_code) AS country, l.website,
           'price_review' AS legitimacy, pr.reason AS confidence,
           pr.price_payload::text AS evidence_summary
    FROM fountain_raw.price_review_20260711 pr
    JOIN fountain.locations l ON l.id=pr.location_id
    ORDER BY pr.reason, l.country_code, l.locality, l.name
  `);
  if (reviews.length) writeTsv("price_review_20260711.tsv", reviews);
}

function writeTsv(filename, rows) {
  const headers = ["name", "locality", "country", "website", "legitimacy", "confidence", "evidence_summary"];
  const body = [headers.join("\t")];
  for (const row of rows) {
    body.push(headers.map((h) => tsvCell(row[h])).join("\t"));
  }
  const file = path.join(OUT_DIR, filename);
  writeFileSync(file, `${body.join("\n")}\n`);
  summary.tsvs[filename] = { rows: rows.length, path: file };
}

function tsvCell(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

async function printReport() {
  const checks = {};
  checks.queueCounts = await many(`
    SELECT status, count(*)::int AS rows
    FROM fountain_raw.hyperbaric_cleanup_queue_20260711
    GROUP BY 1 ORDER BY 1
  `);
  checks.fieldBackupDecisions = await many(`
    SELECT decision, reason, count(*)::int AS rows
    FROM fountain_raw.field_corrections_backup_20260711
    WHERE actor_label=$1
    GROUP BY 1,2 ORDER BY 1,2
  `, [ACTOR_LABEL]);
  checks.priceReviewReasons = await many(`
    SELECT reason, count(*)::int AS rows
    FROM fountain_raw.price_review_20260711
    WHERE actor_label=$1
    GROUP BY 1 ORDER BY 1
  `, [ACTOR_LABEL]);
  checks.priceConflicts = await many(`
    SELECT reason, count(*)::int AS rows
    FROM fountain_raw.price_conflicts_20260711
    WHERE actor_label=$1
    GROUP BY 1 ORDER BY 1
  `, [ACTOR_LABEL]);
  checks.suppressionLedger = await many(`
    SELECT reason, suppressed_by, count(*)::int AS rows
    FROM fountain_raw.suppressed_source_listings
    WHERE source_slug=$1 AND suppressed_by=$2
    GROUP BY 1,2 ORDER BY 1,2
  `, [SOURCE_SLUG, ACTOR_LABEL]);
  checks.legitimacyDistribution = await many(`
    SELECT legitimacy, confidence, count(*)::int AS rows
    FROM fountain_raw.hyperbaric_cleanup_results_20260711
    GROUP BY 1,2 ORDER BY 1,2
  `);
  checks.auditCountsSinceStart = await many(`
    SELECT entity_type, action, count(*)::int AS events
    FROM fountain.entity_change_events
    WHERE actor_id=$1::uuid
      AND actor_type=$2
      AND created_at >= $3::timestamptz
    GROUP BY 1,2 ORDER BY 1,2
  `, [ACTOR_ID, ACTOR_LABEL, summary.startedAt]);
  checks.hiddenHyperbaricScope = await many(`
    SELECT l.status, count(*)::int AS rows
    FROM fountain_raw.hyperbaric_app_promotion_audit_20260710 a
    JOIN fountain.locations l ON l.id=a.location_id
    GROUP BY 1 ORDER BY 1
  `);
  checks.lockedSlugEventsSinceStart = await many(`
    SELECT count(*)::int AS events
    FROM fountain.entity_change_events e
    JOIN fountain.locations l ON l.id=e.entity_id
    WHERE e.entity_type='locations'
      AND e.actor_id=$1::uuid
      AND e.actor_type=$2
      AND e.created_at >= $3::timestamptz
      AND l.slug=$4
  `, [ACTOR_ID, ACTOR_LABEL, summary.startedAt, LOCKED_SLUG]);

  console.log(JSON.stringify({ summary, checks }, null, 2));
}

async function one(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

async function many(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

function first(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizeValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function loadEnvFile(filePath) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
