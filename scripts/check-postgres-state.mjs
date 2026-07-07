#!/usr/bin/env node

import crypto from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const migrationsDir = path.resolve(ROOT, options.dir || "data_pipeline/postgres_migrations");
const canonicalSchema = normalizeIdentifier(options.canonicalSchema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });
const failures = [];
const warnings = [];
const summary = {};

try {
  await client.connect();
  await checkMigrationFiles(client);
  await checkSchemaObjects(client);
  await checkImageContract(client);
  await checkRawStaging(client);
  await checkTransientSchemas(client);
  await checkRefreshToolingRemoved();
  await checkWriteReadiness(client);
  await checkSearchMaintenance(client);
  await checkPolymorphicReferences(client);
} finally {
  await client.end();
}

if (options.json) {
  console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings, summary }, null, 2));
} else {
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }
  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }
  for (const failure of failures) {
    console.error(`failure: ${failure}`);
  }
}

if (failures.length) {
  process.exit(1);
}

async function checkMigrationFiles(pgClient) {
  if (!existsSync(migrationsDir)) {
    failures.push(`missing migration directory: ${migrationsDir}`);
    return;
  }

  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  const result = await pgClient.query("SELECT id, checksum FROM public.fountain_schema_migrations");
  const applied = new Map(result.rows.map((row) => [row.id, row.checksum]));
  summary.migration_files = files.length;

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const checksum = crypto.createHash("sha256").update(readFileSync(path.join(migrationsDir, file), "utf8")).digest("hex");
    if (!applied.has(id)) {
      failures.push(`pending migration ${file}`);
      continue;
    }
    if (applied.get(id) !== checksum) {
      failures.push(`checksum mismatch for migration ${file}`);
    }
  }
}

async function checkSchemaObjects(pgClient) {
  const objects = await pgClient.query(
    `
    SELECT
      to_regclass($1) AS images_table,
      to_regclass($2) AS raw_sources_table,
      to_regclass($3) AS old_asset_table,
      to_regclass($4) AS old_entity_asset_table
    `,
    [
      `${canonicalSchema}.images`,
      `${rawSchema}.source_databases`,
      "fountain_assets.image_assets",
      "fountain_assets.entity_images",
    ],
  );
  const row = objects.rows[0];
  if (!row.images_table) {
    failures.push(`missing ${canonicalSchema}.images`);
  }
  if (!row.raw_sources_table) {
    failures.push(`missing ${rawSchema}.source_databases`);
  }
  if (row.old_asset_table || row.old_entity_asset_table) {
    failures.push("redundant fountain_assets registry still exists");
  }
  summary.serving_schema = canonicalSchema;
  summary.raw_schema = rawSchema;
}

async function checkImageContract(pgClient) {
  const counts = await pgClient.query(
    `
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE COALESCE(blob_url, '') = '')::bigint AS without_blob,
      COUNT(*) FILTER (WHERE COALESCE(local_path, '') <> '')::bigint AS with_local_path
    FROM ${quoteIdent(canonicalSchema)}.images
    `,
  );
  const row = counts.rows[0];
  summary.images = row.total;
  summary.images_without_blob = row.without_blob;
  summary.images_with_local_path = row.with_local_path;
  if (Number(row.without_blob) !== 0) {
    failures.push(`${canonicalSchema}.images has ${row.without_blob} rows without Blob URLs`);
  }
  if (Number(row.with_local_path) !== 0) {
    failures.push(`${canonicalSchema}.images has ${row.with_local_path} local_path rows`);
  }

  const constraint = await pgClient.query(
    `
    SELECT c.convalidated
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = $1
      AND r.relname = 'images'
      AND c.conname = 'images_blob_backed'
    `,
    [canonicalSchema],
  );
  if (!constraint.rowCount) {
    failures.push(`missing ${canonicalSchema}.images_blob_backed constraint`);
  } else if (!constraint.rows[0].convalidated) {
    failures.push(`${canonicalSchema}.images_blob_backed constraint is not validated`);
  }
}

async function checkRawStaging(pgClient) {
  const counts = await pgClient.query(
    `
    SELECT
      (SELECT COUNT(*)::bigint FROM ${quoteIdent(rawSchema)}.source_databases) AS source_databases,
      (SELECT COUNT(*)::bigint FROM ${quoteIdent(rawSchema)}.source_images) AS source_images
    `,
  );
  summary.raw_source_databases = counts.rows[0].source_databases;
  summary.raw_source_images = counts.rows[0].source_images;
  if (Number(counts.rows[0].source_databases) === 0) {
    warnings.push(`${rawSchema}.source_databases is empty`);
  }
}

async function checkTransientSchemas(pgClient) {
  const schemas = await pgClient.query(
    `
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = $1
       OR nspname LIKE $2
    ORDER BY nspname
    `,
    [`${canonicalSchema}_previous`, `${canonicalSchema}_import_%`],
  );
  summary.transient_schemas = schemas.rows.length;
  if (schemas.rows.length && !options.allowTransientSchemas) {
    failures.push(`transient import schemas still exist: ${schemas.rows.map((row) => row.nspname).join(", ")}`);
  }
}

async function checkRefreshToolingRemoved() {
  const packagePath = path.join(ROOT, "package.json");
  if (!existsSync(packagePath)) {
    warnings.push("package.json is unavailable; skipped legacy refresh tooling check");
    return;
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const scripts = packageJson.scripts || {};
  for (const scriptName of ["build:canonical", "db:refresh-postgres", "db:import-postgres", "db:sync-raw-sources"]) {
    if (scripts[scriptName]) {
      failures.push(`legacy canonical import script is still exposed: ${scriptName}`);
    }
  }

  if (existsSync(path.join(ROOT, "scripts/import-canonical-to-postgres.mjs"))) {
    failures.push("legacy canonical importer still exists at scripts/import-canonical-to-postgres.mjs");
  }
}

async function checkWriteReadiness(pgClient) {
  const idTables = [
    "sources",
    "organizations",
    "locations",
    "practitioners",
    "documents",
    "categories",
    "treatments",
    "affiliations",
    "treatment_aliases",
    "offerings",
    "tags",
    "entity_tags",
    "source_records",
    "images",
    "reviews",
    "external_reviews",
    "unmapped_terms",
  ];
  const idColumns = await pgClient.query(
    `
    SELECT table_name, column_default, is_identity
    FROM information_schema.columns
    WHERE table_schema = $1
      AND column_name = 'id'
      AND table_name = ANY($2::text[])
    `,
    [canonicalSchema, idTables],
  );
  const idColumnMap = new Map(idColumns.rows.map((row) => [row.table_name, row]));
  for (const table of idTables) {
    const column = idColumnMap.get(table);
    if (!column) {
      failures.push(`missing ${canonicalSchema}.${table}.id column`);
      continue;
    }
    if (column.is_identity !== "YES" && !column.column_default) {
      failures.push(`${canonicalSchema}.${table}.id has no identity/default for direct inserts`);
    }
  }

  const publicIdTables = ["organizations", "locations", "practitioners"];
  const slugTables = ["locations", "practitioners"];
  const lifecycleTables = ["organizations", "locations", "practitioners", "documents", "affiliations", "offerings", "images", "reviews"];
  const requiredLifecycleColumns = ["status", "data_origin", "verification_status", "created_at", "updated_at", "deleted_at", "owner_account_id"];
  const columns = await pgClient.query(
    `
    SELECT table_name, column_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = ANY($2::text[])
      AND (column_name = ANY($3::text[]) OR column_name IN ('public_id', 'slug'))
    `,
    [canonicalSchema, Array.from(new Set([...publicIdTables, ...lifecycleTables])), requiredLifecycleColumns],
  );
  const columnKeys = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  for (const table of lifecycleTables) {
    for (const column of requiredLifecycleColumns) {
      if (!columnKeys.has(`${table}.${column}`)) {
        failures.push(`missing ${canonicalSchema}.${table}.${column}`);
      }
    }
  }

  for (const table of publicIdTables) {
    if (!columnKeys.has(`${table}.public_id`)) {
      failures.push(`missing ${canonicalSchema}.${table}.public_id`);
      continue;
    }
    const result = await pgClient.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE public_id IS NULL)::bigint AS missing_public_id,
        (COUNT(*) - COUNT(DISTINCT public_id))::bigint AS duplicate_public_id
      FROM ${quoteIdent(canonicalSchema)}.${quoteIdent(table)}
      `,
    );
    const row = result.rows[0];
    if (Number(row.missing_public_id) !== 0) {
      failures.push(`${canonicalSchema}.${table} has ${row.missing_public_id} rows without public_id`);
    }
    if (Number(row.duplicate_public_id) !== 0) {
      failures.push(`${canonicalSchema}.${table} has ${row.duplicate_public_id} duplicate public_id rows`);
    }
  }

  for (const table of slugTables) {
    if (!columnKeys.has(`${table}.slug`)) {
      failures.push(`missing ${canonicalSchema}.${table}.slug`);
      continue;
    }
    const result = await pgClient.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE slug IS NULL OR slug = '')::bigint AS missing_slug,
        (COUNT(*) - COUNT(DISTINCT slug))::bigint AS duplicate_slug,
        COUNT(*) FILTER (WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')::bigint AS invalid_slug
      FROM ${quoteIdent(canonicalSchema)}.${quoteIdent(table)}
      `,
    );
    const row = result.rows[0];
    if (Number(row.missing_slug) !== 0) {
      failures.push(`${canonicalSchema}.${table} has ${row.missing_slug} rows without slug`);
    }
    if (Number(row.duplicate_slug) !== 0) {
      failures.push(`${canonicalSchema}.${table} has ${row.duplicate_slug} duplicate slug rows`);
    }
    if (Number(row.invalid_slug) !== 0) {
      failures.push(`${canonicalSchema}.${table} has ${row.invalid_slug} invalid slug rows`);
    }
  }

  const supportTables = await pgClient.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_name = ANY($2::text[])
    `,
    [canonicalSchema, ["accounts", "clinic_claims", "listing_submissions", "entity_change_events"]],
  );
  const supportTableSet = new Set(supportTables.rows.map((row) => row.table_name));
  for (const table of ["accounts", "clinic_claims", "listing_submissions", "entity_change_events"]) {
    if (!supportTableSet.has(table)) {
      failures.push(`missing ${canonicalSchema}.${table}`);
    }
  }
}

async function checkSearchMaintenance(pgClient) {
  const requiredFunctions = [
    "refresh_search_index()",
    "refresh_search_index_for_location(integer)",
    "refresh_search_index_for_practitioner(integer)",
    "delete_location_cascade(integer,uuid,text)",
    "merge_locations(integer,integer,uuid,text)",
    "replace_location_offerings(integer,jsonb,uuid)",
    "attach_location_image(integer,text,text,text,integer,uuid)",
    "create_location(jsonb,uuid)",
  ];
  for (const signature of requiredFunctions) {
    const result = await pgClient.query("SELECT to_regprocedure($1) AS procedure_name", [`${canonicalSchema}.${signature}`]);
    if (!result.rows[0].procedure_name) {
      failures.push(`missing ${canonicalSchema}.${signature}`);
    }
  }

  const searchIndex = await pgClient.query(
    `
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = $1
      AND indexname = 'idx_search_index_entity_unique'
    `,
    [canonicalSchema],
  );
  if (!searchIndex.rowCount) {
    failures.push(`missing ${canonicalSchema}.idx_search_index_entity_unique`);
  }

  const triggerResult = await pgClient.query(
    `
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE trigger_schema = $1
      AND trigger_name = ANY($2::text[])
    `,
    [
      canonicalSchema,
      [
        "trg_refresh_location_search_index",
        "trg_refresh_practitioner_search_index",
        "trg_refresh_document_search_index",
        "trg_refresh_offering_search_index",
        "trg_refresh_affiliation_search_index",
        "trg_refresh_entity_tag_search_index",
        "trg_refresh_treatment_search_index",
      ],
    ],
  );
  const triggerSet = new Set(triggerResult.rows.map((row) => row.trigger_name));
  for (const trigger of [
    "trg_refresh_location_search_index",
    "trg_refresh_practitioner_search_index",
    "trg_refresh_document_search_index",
    "trg_refresh_offering_search_index",
    "trg_refresh_affiliation_search_index",
    "trg_refresh_entity_tag_search_index",
    "trg_refresh_treatment_search_index",
  ]) {
    if (!triggerSet.has(trigger)) {
      failures.push(`missing search maintenance trigger ${trigger}`);
    }
  }

  const coverage = await pgClient.query(
    `
    SELECT
      (
        SELECT COUNT(*)::bigint
        FROM ${quoteIdent(canonicalSchema)}.locations l
        WHERE l.status = 'active'
          AND l.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM ${quoteIdent(canonicalSchema)}.search_index si
            WHERE si.entity_type = 'location'
              AND si.entity_id = l.id
          )
      ) AS missing_locations,
      (
        SELECT COUNT(*)::bigint
        FROM ${quoteIdent(canonicalSchema)}.practitioners p
        WHERE p.status = 'active'
          AND p.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM ${quoteIdent(canonicalSchema)}.search_index si
            WHERE si.entity_type = 'practitioner'
              AND si.entity_id = p.id
          )
      ) AS missing_practitioners,
      (
        SELECT COUNT(*)::bigint
        FROM ${quoteIdent(canonicalSchema)}.search_index si
        LEFT JOIN ${quoteIdent(canonicalSchema)}.locations l
          ON l.id = si.entity_id
         AND l.status = 'active'
         AND l.deleted_at IS NULL
        WHERE si.entity_type = 'location'
          AND l.id IS NULL
      ) AS stale_locations,
      (
        SELECT COUNT(*)::bigint
        FROM ${quoteIdent(canonicalSchema)}.search_index si
        LEFT JOIN ${quoteIdent(canonicalSchema)}.practitioners p
          ON p.id = si.entity_id
         AND p.status = 'active'
         AND p.deleted_at IS NULL
        WHERE si.entity_type = 'practitioner'
          AND p.id IS NULL
      ) AS stale_practitioners
    `,
  );
  const row = coverage.rows[0];
  summary.search_missing_locations = row.missing_locations;
  summary.search_missing_practitioners = row.missing_practitioners;
  summary.search_stale_locations = row.stale_locations;
  summary.search_stale_practitioners = row.stale_practitioners;
  for (const [key, value] of Object.entries(row)) {
    if (Number(value) !== 0) {
      failures.push(`${canonicalSchema}.search_index has ${value} ${key.replaceAll("_", " ")}`);
    }
  }
}

async function checkPolymorphicReferences(pgClient) {
  const result = await pgClient.query(
    `
    WITH checks AS (
      SELECT 'images.location' AS check_name, COUNT(*)::bigint AS count
      FROM ${quoteIdent(canonicalSchema)}.images i LEFT JOIN ${quoteIdent(canonicalSchema)}.locations l ON l.id = i.entity_id
      WHERE i.entity_type = 'location' AND l.id IS NULL
      UNION ALL SELECT 'images.practitioner', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.images i LEFT JOIN ${quoteIdent(canonicalSchema)}.practitioners p ON p.id = i.entity_id
      WHERE i.entity_type = 'practitioner' AND p.id IS NULL
      UNION ALL SELECT 'images.organization', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.images i LEFT JOIN ${quoteIdent(canonicalSchema)}.organizations o ON o.id = i.entity_id
      WHERE i.entity_type = 'organization' AND o.id IS NULL
      UNION ALL SELECT 'source_records.location', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.source_records sr LEFT JOIN ${quoteIdent(canonicalSchema)}.locations l ON l.id = sr.entity_id
      WHERE sr.entity_type = 'location' AND l.id IS NULL
      UNION ALL SELECT 'source_records.practitioner', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.source_records sr LEFT JOIN ${quoteIdent(canonicalSchema)}.practitioners p ON p.id = sr.entity_id
      WHERE sr.entity_type = 'practitioner' AND p.id IS NULL
      UNION ALL SELECT 'source_records.organization', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.source_records sr LEFT JOIN ${quoteIdent(canonicalSchema)}.organizations o ON o.id = sr.entity_id
      WHERE sr.entity_type = 'organization' AND o.id IS NULL
      UNION ALL SELECT 'source_records.document', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.source_records sr LEFT JOIN ${quoteIdent(canonicalSchema)}.documents d ON d.id = sr.entity_id
      WHERE sr.entity_type = 'document' AND d.id IS NULL
      UNION ALL SELECT 'entity_tags.location', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.entity_tags et LEFT JOIN ${quoteIdent(canonicalSchema)}.locations l ON l.id = et.entity_id
      WHERE et.entity_type = 'location' AND l.id IS NULL
      UNION ALL SELECT 'entity_tags.practitioner', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.entity_tags et LEFT JOIN ${quoteIdent(canonicalSchema)}.practitioners p ON p.id = et.entity_id
      WHERE et.entity_type = 'practitioner' AND p.id IS NULL
      UNION ALL SELECT 'entity_tags.organization', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.entity_tags et LEFT JOIN ${quoteIdent(canonicalSchema)}.organizations o ON o.id = et.entity_id
      WHERE et.entity_type = 'organization' AND o.id IS NULL
      UNION ALL SELECT 'entity_tags.document', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.entity_tags et LEFT JOIN ${quoteIdent(canonicalSchema)}.documents d ON d.id = et.entity_id
      WHERE et.entity_type = 'document' AND d.id IS NULL
      UNION ALL SELECT 'search_index.location', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.search_index si LEFT JOIN ${quoteIdent(canonicalSchema)}.locations l ON l.id = si.entity_id
      WHERE si.entity_type = 'location' AND l.id IS NULL
      UNION ALL SELECT 'search_index.practitioner', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.search_index si LEFT JOIN ${quoteIdent(canonicalSchema)}.practitioners p ON p.id = si.entity_id
      WHERE si.entity_type = 'practitioner' AND p.id IS NULL
      UNION ALL SELECT 'search_index.document', COUNT(*)::bigint
      FROM ${quoteIdent(canonicalSchema)}.search_index si LEFT JOIN ${quoteIdent(canonicalSchema)}.documents d ON d.id = si.entity_id
      WHERE si.entity_type = 'document' AND d.id IS NULL
    )
    SELECT check_name, count
    FROM checks
    WHERE count <> 0
    ORDER BY check_name
    `,
  );
  summary.polymorphic_reference_failures = result.rowCount;
  for (const row of result.rows) {
    failures.push(`${row.check_name} has ${row.count} orphan references`);
  }
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function normalizePostgresConnectionString(rawConnectionString) {
  try {
    const url = new URL(rawConnectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return rawConnectionString;
  }
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
  }
  return value;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) {
      continue;
    }
    let value = rest.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(args) {
  const parsed = { allowTransientSchemas: false, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--allow-transient-schemas") {
      parsed.allowTransientSchemas = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg.startsWith("--") && next) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "envFile") {
        parsed.envFile = [...(parsed.envFile || []), next];
      } else {
        parsed[key] = next;
      }
      index += 1;
    }
  }
  return parsed;
}
