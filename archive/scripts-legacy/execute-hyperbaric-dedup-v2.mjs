#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const ACTOR_ID = "7f94c2c4-57dd-4b9a-a905-7083e8d8a4ff";
const ACTOR_LABEL = "hyperbaric_cleanup_v2_20260711";
const LOCKED_SLUG = "o3-wellness-center-dubai";
const mode = process.argv[2] || "inspect";

for (const filename of [".env.local", ".env.development.local", ".env.production.local"]) loadEnv(path.join(ROOT, filename));
const connectionString = normalize(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING);
if (!connectionString) throw new Error("Missing database connection string");

const client = new Client({ connectionString });

async function setActor() {
  await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, ACTOR_LABEL]);
}

async function inspect() {
  const queries = {
    target: `SELECT current_database() AS database, current_schema() AS current_schema`,
    location_columns: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='fountain' AND table_name='locations' ORDER BY ordinal_position`,
    event_columns: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='fountain' AND table_name='entity_change_events' ORDER BY ordinal_position`,
    audit_columns: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='fountain_raw' AND table_name='hyperbaric_app_promotion_audit_20260710' ORDER BY ordinal_position`,
    merge_function: `SELECT pg_get_functiondef('fountain.merge_locations(integer,integer,uuid,text)'::regprocedure) AS definition`,
    locked: `SELECT id, slug, status, verification_status FROM fountain.locations WHERE slug=$1`,
    active_dedup_queries: `SELECT pid,state,wait_event_type,wait_event,query_start,left(query,500) AS query FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND query ILIKE '%dedup_candidates_20260711%' ORDER BY query_start`,
    dedup_catalog: `SELECT n.nspname,t.typname,t.typtype,t.typrelid,c.relname,c.relkind FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_class c ON c.oid=t.typrelid WHERE n.nspname='fountain_raw' AND t.typname='dedup_candidates_20260711'`,
  };
  for (const [name, sql] of Object.entries(queries)) {
    const result = await client.query(sql, name === "locked" ? [LOCKED_SLUG] : []);
    console.log(`INSPECT ${name}`);
    console.log(JSON.stringify(result.rows, null, 2));
  }
}

const activeLocations = `
  SELECT l.*,
         lower(regexp_replace(coalesce(l.name,''), '[^a-z0-9]+', ' ', 'g')) AS normalized_name,
         lower(regexp_replace(coalesce(l.address,'') || '|' || coalesce(l.locality,'') || '|' || coalesce(l.region,'') || '|' || coalesce(l.postal_code,'') || '|' || coalesce(l.country_code,''), '\\s+', ' ', 'g')) AS full_address,
         lower(regexp_replace(regexp_replace(coalesce(l.website,''), '^https?://(www\\.)?', '', 'i'), '/+$', '')) AS website_full,
         lower(split_part(regexp_replace(coalesce(l.website,''), '^https?://(www\\.)?', '', 'i'), '/', 1)) AS website_domain,
         nullif('/' || array_to_string((string_to_array(regexp_replace(coalesce(l.website,''), '^https?://(www\\.)?', '', 'i'), '/'))[2:999], '/'), '/') AS website_path,
         coalesce(src.source_record_count,0)::int AS source_record_count,
         (promo.location_id IS NOT NULL) AS hyperbaric_created
  FROM fountain.locations l
  LEFT JOIN (SELECT entity_id,count(*)::int AS source_record_count FROM fountain.source_records WHERE entity_type='location' GROUP BY entity_id) src ON src.entity_id=l.id
  LEFT JOIN (SELECT DISTINCT location_id FROM fountain_raw.hyperbaric_app_promotion_audit_20260710 WHERE dry_run=false AND matched_existing_location=false) promo ON promo.location_id=l.id
  WHERE l.deleted_at IS NULL AND l.status <> 'hidden'
`;

const distanceExpression = `CASE WHEN a.latitude IS NULL OR a.longitude IS NULL OR b.latitude IS NULL OR b.longitude IS NULL THEN NULL ELSE
  6371000 * 2 * asin(sqrt(
    power(sin(radians((b.latitude-a.latitude)/2)),2) +
    cos(radians(a.latitude))*cos(radians(b.latitude))*power(sin(radians((b.longitude-a.longitude)/2)),2)
  )) END`;

const pairSelect = `
WITH active AS (${activeLocations}), hyper AS (SELECT * FROM active WHERE hyperbaric_created),
slug_pairs AS (
  SELECT a.id AS a_id, b.id AS b_id,
         a.name AS a_name, b.name AS b_name,
         a.normalized_name AS a_normalized_name, b.normalized_name AS b_normalized_name,
         a.full_address AS a_full_address, b.full_address AS b_full_address,
         a.website_full AS a_website_full, b.website_full AS b_website_full,
         a.website_domain AS a_website_domain, b.website_domain AS b_website_domain,
         a.website_path AS a_website_path, b.website_path AS b_website_path,
         a.source_record_count AS a_source_record_count, b.source_record_count AS b_source_record_count,
         a.verification_status AS a_verification_status, b.verification_status AS b_verification_status,
         a.created_at AS a_created_at, b.created_at AS b_created_at,
         a.slug AS a_slug, b.slug AS b_slug,
         ${distanceExpression} AS distance_m
  FROM active b JOIN active a ON a.slug=regexp_replace(b.slug, '-[0-9]+$', '') AND b.slug ~ '-[0-9]+$'
  WHERE a.id <> b.id
),
name_pairs AS (
  SELECT a.id AS a_id, b.id AS b_id,
         a.name AS a_name, b.name AS b_name,
         a.normalized_name AS a_normalized_name, b.normalized_name AS b_normalized_name,
         a.full_address AS a_full_address, b.full_address AS b_full_address,
         a.website_full AS a_website_full, b.website_full AS b_website_full,
         a.website_domain AS a_website_domain, b.website_domain AS b_website_domain,
         a.website_path AS a_website_path, b.website_path AS b_website_path,
         a.source_record_count AS a_source_record_count, b.source_record_count AS b_source_record_count,
         a.verification_status AS a_verification_status, b.verification_status AS b_verification_status,
         a.created_at AS a_created_at, b.created_at AS b_created_at,
         a.slug AS a_slug, b.slug AS b_slug,
         ${distanceExpression} AS distance_m
  FROM hyper a JOIN active b ON a.id <> b.id
    AND (a.id < b.id OR NOT b.hyperbaric_created)
    AND a.country_code IS NOT DISTINCT FROM b.country_code
    AND b.latitude BETWEEN a.latitude - (150.0/111320.0) AND a.latitude + (150.0/111320.0)
    AND b.longitude BETWEEN a.longitude - least(180.0, 150.0/(111320.0*greatest(abs(cos(radians(a.latitude))),0.000001)))
                        AND a.longitude + least(180.0, 150.0/(111320.0*greatest(abs(cos(radians(a.latitude))),0.000001)))
  WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL
    AND similarity(a.normalized_name,b.normalized_name) >= 0.85
    AND ${distanceExpression} <= 150
    AND NOT (a.slug=regexp_replace(b.slug, '-[0-9]+$', '') OR b.slug=regexp_replace(a.slug, '-[0-9]+$', ''))
),
pairs AS (
  SELECT 'slug_suffix'::text AS method, a_id, b_id, distance_m,
         (a_name IS NOT DISTINCT FROM b_name) AS same_name,
         (a_website_domain <> '' AND a_website_domain=b_website_domain) AS same_domain,
         (a_website_full <> '' AND a_website_full=b_website_full) AS same_full_url,
         (a_full_address <> '||||' AND a_full_address=b_full_address) AS same_full_address,
         a_website_domain AS website_domain, b_website_domain AS other_domain, a_website_path AS website_path, b_website_path AS other_path,
         a_source_record_count AS source_record_count, b_source_record_count AS other_source_record_count,
         a_verification_status AS verification_status, b_verification_status AS other_verification_status,
         a_created_at AS created_at, b_created_at AS other_created_at, a_slug AS slug, b_slug AS other_slug,
         a_normalized_name AS normalized_name, b_normalized_name AS other_normalized_name
  FROM slug_pairs
  UNION ALL
  SELECT 'name_geo', a_id, b_id, distance_m,
         (a_name IS NOT DISTINCT FROM b_name),
         (a_website_domain <> '' AND a_website_domain=b_website_domain),
         (a_website_full <> '' AND a_website_full=b_website_full),
         (a_full_address <> '||||' AND a_full_address=b_full_address),
         a_website_domain, b_website_domain, a_website_path, b_website_path,
         a_source_record_count, b_source_record_count,
         a_verification_status, b_verification_status, a_created_at, b_created_at, a_slug, b_slug,
         a_normalized_name, b_normalized_name
  FROM name_pairs
), ranked AS (
  SELECT *,
    CASE WHEN (source_record_count, (verification_status='verified')::int, -extract(epoch from created_at))
                    >= (other_source_record_count, (other_verification_status='verified')::int, -extract(epoch from other_created_at))
         THEN a_id ELSE b_id END AS keep_id,
    CASE WHEN (source_record_count, (verification_status='verified')::int, -extract(epoch from created_at))
                    >= (other_source_record_count, (other_verification_status='verified')::int, -extract(epoch from other_created_at))
         THEN b_id ELSE a_id END AS merge_id
  FROM pairs
)
SELECT keep_id, merge_id, method,
       CASE WHEN method='slug_suffix' THEN 0.95 ELSE similarity(normalized_name,other_normalized_name) END::numeric AS confidence,
       jsonb_build_object(
         'slugs', jsonb_build_array(slug,other_slug), 'same_name',same_name,
         'same_website_domain',same_domain, 'same_website_full_url',same_full_url,
         'website_domains',jsonb_build_array(website_domain,other_domain),
         'website_paths',jsonb_build_array(website_path,other_path),
         'distance_m',round(distance_m::numeric,2), 'same_full_address',same_full_address,
         'source_record_counts',jsonb_build_array(source_record_count,other_source_record_count),
         'verification_statuses',jsonb_build_array(verification_status,other_verification_status)
       ) AS evidence,
       CASE
         WHEN slug=$1 OR other_slug=$1 THEN 'review'
         WHEN method='name_geo' THEN 'review'
         WHEN (same_domain AND coalesce(website_path,'') <> coalesce(other_path,'') AND coalesce(website_path,'') <> '' AND coalesce(other_path,'') <> '') OR distance_m > 100 THEN 'review_branch_risk'
         WHEN (same_domain OR same_name) AND (distance_m <= 100 OR (distance_m IS NULL AND same_full_address)) THEN 'auto_merge'
         ELSE 'review'
       END AS decision
FROM ranked`;

async function prepare() {
  await client.query("BEGIN");
  try {
    await setActor();
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await client.query("DROP TABLE IF EXISTS fountain_raw.dedup_candidates_20260711");
    await client.query(`CREATE TABLE fountain_raw.dedup_candidates_20260711 (
      keep_id int, merge_id int, method text, confidence numeric, evidence jsonb,
      decision text DEFAULT 'pending', created_at timestamptz DEFAULT now(),
      PRIMARY KEY (keep_id, merge_id, method)
    )`);
    await client.query(`INSERT INTO fountain_raw.dedup_candidates_20260711 (keep_id,merge_id,method,confidence,evidence,decision) ${pairSelect}`, [LOCKED_SLUG]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const rows = await client.query("SELECT * FROM fountain_raw.dedup_candidates_20260711 ORDER BY method,keep_id,merge_id");
  console.log("PREPARE candidates");
  console.log(JSON.stringify(rows.rows, null, 2));
  const summary = await client.query("SELECT method,decision,count(*)::int AS count FROM fountain_raw.dedup_candidates_20260711 GROUP BY method,decision ORDER BY method,decision");
  console.log("PREPARE summary");
  console.log(JSON.stringify(summary.rows, null, 2));
}

async function applyMerges() {
  const candidates = (await client.query("SELECT keep_id,merge_id,method FROM fountain_raw.dedup_candidates_20260711 WHERE decision='auto_merge' ORDER BY keep_id,merge_id")).rows;
  for (const candidate of candidates) {
    await client.query("BEGIN");
    try {
      await setActor();
      const live = await client.query("SELECT id,slug FROM fountain.locations WHERE id=ANY($1::int[]) AND deleted_at IS NULL AND status<>'hidden'", [[candidate.keep_id,candidate.merge_id]]);
      if (live.rows.some((row) => row.slug === LOCKED_SLUG)) throw new Error("locked Dubai location encountered");
      if (live.rowCount !== 2) throw new Error(`candidate endpoints not both active (${live.rowCount}/2)`);
      await client.query("SELECT fountain.merge_locations($1,$2,$3::uuid,$4)", [candidate.keep_id,candidate.merge_id,ACTOR_ID,`${ACTOR_LABEL}: ${candidate.method} auto merge`]);
      await setActor();
      await client.query("UPDATE fountain_raw.dedup_candidates_20260711 SET decision='merged', evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('merged_at',now()) WHERE keep_id=$1 AND merge_id=$2 AND method=$3", [candidate.keep_id,candidate.merge_id,candidate.method]);
      await client.query("COMMIT");
      console.log(JSON.stringify({ merge: "success", ...candidate }));
    } catch (error) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ merge: "NOT EXECUTED", ...candidate, reason: error.message }));
      throw error;
    }
  }
  console.log(JSON.stringify({ merged_count: candidates.length }));
}

async function report() {
  const outputDir = path.join(ROOT, ".cache", "hyperbaric_cleanup_v2_20260711");
  mkdirSync(outputDir, { recursive: true });
  const queries = {
    full_candidates: `SELECT * FROM fountain_raw.dedup_candidates_20260711 ORDER BY method,keep_id,merge_id`,
    merge_events: `SELECT count(*)::int AS merge_event_count FROM fountain.entity_change_events WHERE action='merge_locations' AND actor_id=$1::uuid AND reason LIKE $2`,
    post_merge_slug_suffix: `WITH active AS (${activeLocations}), remaining AS (SELECT a.id AS base_id,a.slug AS base_slug,b.id AS suffix_id,b.slug AS suffix_slug FROM active b JOIN active a ON a.slug=regexp_replace(b.slug, '-[0-9]+$', '') AND b.slug ~ '-[0-9]+$') SELECT r.*,c.decision FROM remaining r LEFT JOIN fountain_raw.dedup_candidates_20260711 c ON c.method='slug_suffix' AND c.keep_id IN (r.base_id,r.suffix_id) AND c.merge_id IN (r.base_id,r.suffix_id) ORDER BY r.base_id,r.suffix_id`,
    aalto: `SELECT id,slug,status FROM fountain.locations WHERE slug LIKE 'aalto-hyperbaric-medical-group-los-angeles%' ORDER BY id`,
    actor_event_breakdown: `SELECT action,actor_type,reason,count(*)::int AS count FROM fountain.entity_change_events WHERE actor_id=$1::uuid AND created_at >= (SELECT min(created_at) FROM fountain_raw.dedup_candidates_20260711) GROUP BY action,actor_type,reason ORDER BY action,reason`,
    locked_actor_events: `SELECT count(*)::int AS count FROM fountain.entity_change_events WHERE entity_type='location' AND entity_id=13715 AND actor_id=$1::uuid AND created_at >= (SELECT min(created_at) FROM fountain_raw.dedup_candidates_20260711)`,
  };
  const params = { merge_events: [ACTOR_ID, `${ACTOR_LABEL}:%`], actor_event_breakdown: [ACTOR_ID], locked_actor_events: [ACTOR_ID] };
  for (const [name, sql] of Object.entries(queries)) {
    const result = await client.query(sql, params[name] || []);
    console.log(`REPORT ${name}`);
    console.log(JSON.stringify(result.rows, null, 2));
    writeFileSync(path.join(outputDir, `${name}.json`), JSON.stringify(result.rows, null, 2) + "\n");
  }
  const review = await client.query(`SELECT keep_id,merge_id,method,confidence,decision,evidence::text AS evidence,created_at FROM fountain_raw.dedup_candidates_20260711 WHERE decision IN ('review','review_branch_risk') ORDER BY decision,method,keep_id,merge_id`);
  const header = review.fields.map((field) => field.name);
  const tsv = [header.join("\t"), ...review.rows.map((row) => header.map((key) => String(row[key] ?? "").replaceAll("\t"," ").replaceAll("\n"," ")).join("\t"))].join("\n") + "\n";
  writeFileSync(path.join(outputDir, "human_review.tsv"), tsv);
  console.log("REPORT human_review_tsv");
  console.log(tsv);
  for (const decision of ["review_branch_risk", "review"]) {
    const selected = review.rows.filter((row) => row.decision === decision);
    const selectedTsv = [header.join("\t"), ...selected.map((row) => header.map((key) => String(row[key] ?? "").replaceAll("\t"," ").replaceAll("\n"," ")).join("\t"))].join("\n") + "\n";
    writeFileSync(path.join(outputDir, `${decision}.tsv`), selectedTsv);
  }
}

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    process.env[match[1]] = value;
  }
}

function normalize(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (["prefer","require","verify-ca"].includes(url.searchParams.get("sslmode"))) url.searchParams.set("sslmode","verify-full");
    return url.toString();
  } catch { return value; }
}

await client.connect();
try {
  if (mode === "inspect") await inspect();
  else if (mode === "prepare") await prepare();
  else if (mode === "apply") await applyMerges();
  else if (mode === "report") await report();
  else throw new Error("Usage: node scripts/execute-hyperbaric-dedup-v2.mjs inspect|prepare|apply|report");
} finally {
  await client.end();
}
