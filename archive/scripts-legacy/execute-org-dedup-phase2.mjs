#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.date || new Date().toISOString().slice(0, 10).replaceAll("-", "");
const dryRun = Boolean(options.dryRun);
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const auditPath = path.resolve(ROOT, options.audit || "org-dedup-audit-report-20260707.json");
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `org-dedup-phase2-report-${phaseDate}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/org-dedup-phase2-report-${phaseDate}.md`);
const COMMON_MULTI_LABEL_SUFFIXES = new Set([
  "ac.uk",
  "co.uk",
  "co.za",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "net.au",
  "org.au",
  "org.uk",
]);

const BRAND_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "clinic",
  "clinics",
  "health",
  "medical",
  "medicine",
  "center",
  "centre",
  "wellness",
  "care",
  "doctor",
  "doctors",
  "primary",
  "therapy",
  "physical",
  "occupational",
  "regenerative",
  "stem",
  "cell",
  "cells",
  "pain",
  "management",
  "institute",
  "group",
  "hospital",
  "spa",
  "med",
  "new",
  "york",
  "city",
  "nyc",
  "usa",
]);

const GENERIC_BRAND_TOKENS = new Set([
  "advanced",
  "center",
  "clinic",
  "health",
  "medical",
  "medicine",
  "primary",
  "care",
  "doctor",
  "doctors",
  "regenerative",
  "stem",
  "cell",
  "therapy",
  "physical",
  "wellness",
  "institute",
]);

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

const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  const preflight = await loadPreflight(client);
  const plan = buildPlan(audit, preflight);
  const report = await executePlan(client, plan);
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadPreflight(pgClient) {
  const existingOrgResult = await pgClient.query(`
    SELECT id, canonical_name, website_domain, dedup_key, deleted_at
    FROM ${quoteIdent(schema)}.organizations
  `);
  const locationsResult = await pgClient.query(`
    SELECT id, org_id, status, name, slug
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
  `);
  const blainResult = await pgClient.query(`
    SELECT id, name, org_id, status, slug
    FROM ${quoteIdent(schema)}.locations
    WHERE org_id = 4470
      AND deleted_at IS NULL
    ORDER BY id
  `);
  const rawTablesResult = await pgClient.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_name = ANY($2)
    `,
    [
      rawSchema,
      [
        `organizations_backup_${phaseDate}_org_dedup_phase2`,
        `locations_backup_${phaseDate}_org_dedup_phase2`,
        `org_dedup_phase2_location_org_map_${phaseDate}`,
        `org_dedup_phase2_new_orgs_${phaseDate}`,
        `org_dedup_phase2_guardrail_${phaseDate}`,
        `org_dedup_phase2_deleted_orgs_${phaseDate}`,
      ],
    ],
  );

  return {
    existingOrgs: existingOrgResult.rows.map((org) => ({
      ...org,
      normalized_domain: normalizeWebsiteToRegistrableDomain(org.website_domain),
    })),
    locationsById: new Map(locationsResult.rows.map((location) => [location.id, location])),
    blainLocations: blainResult.rows,
    existingRawTables: rawTablesResult.rows.map((row) => row.table_name),
  };
}

function buildPlan(auditReport, preflight) {
  if (preflight.existingRawTables.length && !dryRun) {
    throw new Error(`Refusing to run because Phase 2 tables already exist: ${preflight.existingRawTables.join(", ")}`);
  }

  const actions = auditReport.proposed_actions || [];
  const relinks = actions.filter((row) => row.action === "RELINK");
  const blainAuditLocationIds = new Set(preflight.blainLocations.map((location) => location.id));
  const newOrgRows = actions.filter((row) => row.action === "NEW_ORG" && !blainAuditLocationIds.has(row.location_id));
  const ambiguousRows = actions.filter((row) => row.action === "AMBIGUOUS");
  const existingDomains = new Set(
    preflight.existingOrgs
      .filter((org) => !org.deleted_at && org.normalized_domain)
      .map((org) => org.normalized_domain),
  );
  const existingDedupKeys = new Set(
    preflight.existingOrgs
      .filter((org) => !org.deleted_at && org.dedup_key)
      .map((org) => org.dedup_key),
  );

  const relinkRows = relinks.map((row) => ({
    location_id: row.location_id,
    old_org_id: row.current_org_id,
    new_org_id: row.target_org_id,
    location_name: row.location_name,
    location_domain: row.location_domain,
    old_org_name: row.current_org_name,
    new_org_name: row.target_org_name,
  }));

  const groupsByDomain = groupBy(newOrgRows, "location_domain");
  const newOrgGroups = [];
  const guardrailRows = [];
  for (const [domain, rows] of groupsByDomain.entries()) {
    if (!domain) {
      guardrailRows.push(...rows.map((row) => guardrail(row, "missing_domain")));
      continue;
    }
    if (existingDomains.has(domain)) {
      guardrailRows.push(...rows.map((row) => guardrail(row, "domain_already_has_existing_org")));
      continue;
    }
    if (existingDedupKeys.has(domain)) {
      guardrailRows.push(...rows.map((row) => guardrail(row, "dedup_key_already_exists")));
      continue;
    }
    const brand = deriveBrand(rows, domain);
    if (!brand.safe) {
      guardrailRows.push(...rows.map((row) => guardrail(row, brand.reason, brand)));
      continue;
    }
    newOrgGroups.push({
      domain,
      canonical_name: brand.canonical_name,
      name_normalized: normalizeNameForDb(brand.canonical_name),
      dedup_key: domain,
      rows: rows.map((row) => ({
        location_id: row.location_id,
        old_org_id: row.current_org_id,
        location_name: row.location_name,
        location_domain: row.location_domain,
      })),
      brand_evidence: brand,
    });
  }

  const ambiguousKeepRows = [];
  const detachRows = [];
  for (const row of ambiguousRows) {
    if (locationMatchesOrg(row.location_name, row.current_org_name)) {
      ambiguousKeepRows.push({
        location_id: row.location_id,
        location_name: row.location_name,
        current_org_id: row.current_org_id,
        current_org_name: row.current_org_name,
        reason: "location_name_matches_current_org_name",
      });
    } else {
      detachRows.push({
        location_id: row.location_id,
        old_org_id: row.current_org_id,
        new_org_id: null,
        location_name: row.location_name,
        location_domain: row.location_domain,
        old_org_name: row.current_org_name,
        reason: row.reason,
      });
    }
  }

  const chainRenames = [
    [1472, "Prenuvo Clinic"],
    [2191, "Greater Therapy Centers"],
    [1513, "Dexascans.com"],
    [2753, "Holsman Physical Therapy"],
    [912, "Regenerative Pain & Sports Medicine"],
    [3839, "Empower U"],
    [2401, "Dr. Burkenstock's Skin Body Health Med Spa"],
    [849, "Maze Laboratories"],
    [5294, "Regenerative Stemwave Therapy Center"],
  ].map(([org_id, new_name]) => ({
    org_id,
    new_name,
    name_normalized: normalizeNameForDb(new_name),
  }));

  const blainLocations = preflight.blainLocations.map((location) => ({
    location_id: location.id,
    location_name: location.name,
    old_org_id: location.org_id,
    new_org_id: location.org_id,
    old_status: location.status,
    new_status: "hidden",
    slug: location.slug,
  }));

  const validationFailures = [];
  for (const row of [...relinkRows, ...detachRows, ...blainLocations]) {
    const current = preflight.locationsById.get(row.location_id);
    if (!current) {
      validationFailures.push(`Location ${row.location_id} no longer exists or is deleted`);
      continue;
    }
    if (current.org_id !== row.old_org_id) {
      validationFailures.push(
        `Location ${row.location_id} org changed since audit: expected ${row.old_org_id}, found ${current.org_id}`,
      );
    }
  }
  for (const group of newOrgGroups) {
    for (const row of group.rows) {
      const current = preflight.locationsById.get(row.location_id);
      if (!current) {
        validationFailures.push(`Location ${row.location_id} no longer exists or is deleted`);
        continue;
      }
      if (current.org_id !== row.old_org_id) {
        validationFailures.push(
          `Location ${row.location_id} org changed since audit: expected ${row.old_org_id}, found ${current.org_id}`,
        );
      }
    }
  }
  if (validationFailures.length) {
    throw new Error(`Preflight validation failed:\n${validationFailures.slice(0, 40).join("\n")}`);
  }

  const affectedLocationIds = unique([
    ...relinkRows.map((row) => row.location_id),
    ...newOrgGroups.flatMap((group) => group.rows.map((row) => row.location_id)),
    ...detachRows.map((row) => row.location_id),
    ...blainLocations.map((row) => row.location_id),
  ]);

  return {
    relinkRows,
    newOrgGroups,
    guardrailRows,
    ambiguousKeepRows,
    detachRows,
    chainRenames,
    blainLocations,
    affectedLocationIds,
    renameCandidates: unique(
      relinkRows
        .map((row) => row.new_org_id)
        .filter(Boolean),
    ),
  };
}

async function executePlan(pgClient, plan) {
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);
    await ensureBackupAndReportTables(pgClient);

    const newOrgResults = [];
    const mappingRows = [];
    const guardrailRows = [...plan.guardrailRows];

    for (const row of plan.relinkRows) {
      mappingRows.push({
        location_id: row.location_id,
        old_org_id: row.old_org_id,
        new_org_id: row.new_org_id,
        action: "RELINK",
        detail: row,
      });
    }

    if (plan.newOrgGroups.length) {
      const orgInput = plan.newOrgGroups.map((group, index) => ({
        ord: index,
        canonical_name: group.canonical_name,
        name_normalized: group.name_normalized,
        website_domain: group.domain,
        dedup_key: group.dedup_key,
      }));
      const insertedOrgs = await pgClient.query(
        `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($1::jsonb) AS x(
            ord integer,
            canonical_name text,
            name_normalized text,
            website_domain text,
            dedup_key text
          )
        )
        INSERT INTO ${quoteIdent(schema)}.organizations (
          canonical_name,
          name_normalized,
          website_domain,
          dedup_key,
          data_origin,
          verification_status
        )
        SELECT canonical_name, name_normalized, website_domain, dedup_key, 'system', 'unverified'
        FROM input
        ORDER BY ord
        RETURNING id, canonical_name, website_domain, dedup_key
        `,
        [JSON.stringify(orgInput)],
      );
      const insertedByDomain = new Map(insertedOrgs.rows.map((org) => [org.website_domain, org]));
      for (const group of plan.newOrgGroups) {
        const org = insertedByDomain.get(group.domain);
        if (!org) {
          throw new Error(`Inserted org missing for domain ${group.domain}`);
        }
      newOrgResults.push({
        org_id: org.id,
        canonical_name: org.canonical_name,
        website_domain: org.website_domain,
        dedup_key: org.dedup_key,
        location_count: group.rows.length,
        location_ids: group.rows.map((row) => row.location_id),
        brand_evidence: group.brand_evidence,
      });
      for (const row of group.rows) {
        mappingRows.push({
          location_id: row.location_id,
          old_org_id: row.old_org_id,
          new_org_id: org.id,
          action: "NEW_ORG",
          detail: { ...row, new_org_id: org.id, new_org_name: org.canonical_name },
        });
      }
    }
      await insertNewOrgRows(pgClient, newOrgResults);
    }

    for (const row of plan.detachRows) {
      mappingRows.push({
        location_id: row.location_id,
        old_org_id: row.old_org_id,
        new_org_id: null,
        action: "DETACH_NULL",
        detail: row,
      });
    }

    for (const row of plan.blainLocations) {
      mappingRows.push({
        location_id: row.location_id,
        old_org_id: row.old_org_id,
        new_org_id: row.new_org_id,
        action: "HIDE_BLAINS",
        detail: row,
      });
    }

    await insertMappingRows(pgClient, mappingRows);
    await insertGuardrailRows(pgClient, guardrailRows);

    await pgClient.query(`
      UPDATE ${quoteIdent(schema)}.locations l
      SET org_id = m.new_org_id
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_location_org_map_${phaseDate}`)} m
      WHERE m.action IN ('RELINK', 'NEW_ORG')
        AND l.id = m.location_id
    `);
    await pgClient.query(`
      UPDATE ${quoteIdent(schema)}.locations l
      SET org_id = NULL
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_location_org_map_${phaseDate}`)} m
      WHERE m.action = 'DETACH_NULL'
        AND l.id = m.location_id
    `);
    if (plan.blainLocations.length) {
      await pgClient.query(`
        UPDATE ${quoteIdent(schema)}.locations l
        SET status = 'hidden'
        FROM ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_location_org_map_${phaseDate}`)} m
        WHERE m.action = 'HIDE_BLAINS'
          AND l.id = m.location_id
      `);
    }

    const renamedOrgs = [];
    for (const rename of plan.chainRenames) {
      const before = await pgClient.query(
        `SELECT id, canonical_name, name_normalized FROM ${quoteIdent(schema)}.organizations WHERE id = $1`,
        [rename.org_id],
      );
      await pgClient.query(
        `
        UPDATE ${quoteIdent(schema)}.organizations
        SET canonical_name = $1,
            name_normalized = $2
        WHERE id = $3
        `,
        [rename.new_name, rename.name_normalized, rename.org_id],
      );
      renamedOrgs.push({
        org_id: rename.org_id,
        old_name: before.rows[0]?.canonical_name || null,
        new_name: rename.new_name,
      });
    }

    const renamedOrgLocationResult = await pgClient.query(
      `
      SELECT id
      FROM ${quoteIdent(schema)}.locations
      WHERE org_id = ANY($1::int[])
        AND deleted_at IS NULL
      ORDER BY id
      `,
      [plan.chainRenames.map((row) => row.org_id)],
    );
    // Location row updates already fire trg_refresh_location_search_index.
    // Organization renames do not, so refresh only the renamed-org locations here.
    const refreshLocationIds = unique(renamedOrgLocationResult.rows.map((row) => row.id));
    if (refreshLocationIds.length) {
      await pgClient.query(
        `SELECT ${quoteIdent(schema)}.refresh_search_index_for_location(location_id) FROM unnest($1::int[]) AS location_id`,
        [refreshLocationIds],
      );
    }

    const emptyCandidates = await pgClient.query(`
      SELECT
        org.*,
        EXISTS (
          SELECT 1 FROM ${quoteIdent(schema)}.images i
          WHERE i.entity_type = 'organization' AND i.entity_id = org.id
        ) AS has_images,
        EXISTS (
          SELECT 1 FROM ${quoteIdent(schema)}.entity_tags et
          WHERE et.entity_type = 'organization' AND et.entity_id = org.id
        ) AS has_entity_tags
      FROM ${quoteIdent(schema)}.organizations org
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${quoteIdent(schema)}.locations l
        WHERE l.org_id = org.id
          AND l.deleted_at IS NULL
      )
        AND NOT EXISTS (
          SELECT 1
          FROM ${quoteIdent(schema)}.source_records sr
          WHERE sr.entity_type = 'organization'
            AND sr.entity_id = org.id
        )
      ORDER BY org.id
    `);
    const emptySafe = emptyCandidates.rows.filter((row) => !row.has_images && !row.has_entity_tags);
    const emptySkipped = emptyCandidates.rows.filter((row) => row.has_images || row.has_entity_tags);
    if (emptySafe.length) {
      await pgClient.query(
        `
        INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_deleted_orgs_${phaseDate}`)}
        SELECT org.*
        FROM ${quoteIdent(schema)}.organizations org
        WHERE org.id = ANY($1::int[])
        `,
        [emptySafe.map((row) => row.id)],
      );
      await pgClient.query(
        `DELETE FROM ${quoteIdent(schema)}.organizations WHERE id = ANY($1::int[])`,
        [emptySafe.map((row) => row.id)],
      );
    }

    const acceptance = await acceptanceChecks(pgClient, newOrgResults);
    if (dryRun) {
      await pgClient.query("ROLLBACK");
    } else {
      await pgClient.query("COMMIT");
    }

    return {
      generated_at: new Date().toISOString(),
      mode: dryRun ? "DRY_RUN_ROLLED_BACK" : "EXECUTED",
      backup_tables: dryRun
        ? []
        : [
            `${rawSchema}.organizations_backup_${phaseDate}_org_dedup_phase2`,
            `${rawSchema}.locations_backup_${phaseDate}_org_dedup_phase2`,
            `${rawSchema}.org_dedup_phase2_location_org_map_${phaseDate}`,
            `${rawSchema}.org_dedup_phase2_new_orgs_${phaseDate}`,
            `${rawSchema}.org_dedup_phase2_guardrail_${phaseDate}`,
            `${rawSchema}.org_dedup_phase2_deleted_orgs_${phaseDate}`,
          ],
      summary: {
        relinked_locations: plan.relinkRows.length,
        new_orgs_created: newOrgResults.length,
        new_org_locations: newOrgResults.reduce((sum, org) => sum + org.location_count, 0),
        moved_to_ambiguous_by_guardrail: guardrailRows.length,
        ambiguous_kept: plan.ambiguousKeepRows.length,
        detached_to_null: plan.detachRows.length,
        renamed_orgs: renamedOrgs.length,
        blain_locations_hidden: plan.blainLocations.length,
        empty_orgs_deleted: emptySafe.length,
        empty_orgs_skipped_due_refs: emptySkipped.length,
        refreshed_locations: refreshLocationIds.length,
      },
      relinked: plan.relinkRows,
      new_orgs_created: newOrgResults,
      moved_to_ambiguous_by_guardrail: guardrailRows,
      ambiguous_kept: plan.ambiguousKeepRows,
      detached_to_null_sample: plan.detachRows.slice(0, 200),
      detached_to_null_count: plan.detachRows.length,
      renamed_orgs: renamedOrgs,
      rename_candidates_from_relink_targets: plan.renameCandidates,
      blain_deletion_review: {
        org_id: 4470,
        org_name: "Blain's Farm & Fleet",
        action: "locations_hidden_no_org_rename",
        locations: plan.blainLocations,
      },
      empty_orgs_deleted: emptySafe.map((row) => ({
        org_id: row.id,
        canonical_name: row.canonical_name,
        website_domain: row.website_domain,
      })),
      empty_orgs_skipped_due_refs: emptySkipped.map((row) => ({
        org_id: row.id,
        canonical_name: row.canonical_name,
        website_domain: row.website_domain,
        has_images: row.has_images,
        has_entity_tags: row.has_entity_tags,
      })),
      acceptance,
    };
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function ensureBackupAndReportTables(pgClient) {
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`organizations_backup_${phaseDate}_org_dedup_phase2`)} AS
    SELECT * FROM ${quoteIdent(schema)}.organizations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_org_dedup_phase2`)} AS
    SELECT * FROM ${quoteIdent(schema)}.locations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_location_org_map_${phaseDate}`)} (
      location_id integer NOT NULL,
      old_org_id integer,
      new_org_id integer,
      action text NOT NULL,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_new_orgs_${phaseDate}`)} (
      org_id integer NOT NULL,
      canonical_name text NOT NULL,
      website_domain text NOT NULL,
      dedup_key text NOT NULL,
      location_count integer NOT NULL,
      location_ids integer[] NOT NULL,
      brand_evidence jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_guardrail_${phaseDate}`)} (
      location_id integer NOT NULL,
      location_name text,
      location_domain text,
      old_org_id integer,
      old_org_name text,
      reason text NOT NULL,
      evidence jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_deleted_orgs_${phaseDate}`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.organizations
    WHERE false
  `);
}

async function insertMappingRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_location_org_map_${phaseDate}`)} (
      location_id,
      old_org_id,
      new_org_id,
      action,
      detail
    )
    SELECT location_id, old_org_id, new_org_id, action, detail
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      old_org_id integer,
      new_org_id integer,
      action text,
      detail jsonb
    )
    `,
    [JSON.stringify(rows)],
  );
}

async function insertGuardrailRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  const payload = rows.map((row) => ({
    location_id: row.location_id,
    location_name: row.location_name,
    location_domain: row.location_domain,
    old_org_id: row.current_org_id,
    old_org_name: row.current_org_name,
    reason: row.guardrail_reason,
    evidence: row.guardrail_evidence || {},
  }));
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_guardrail_${phaseDate}`)} (
      location_id,
      location_name,
      location_domain,
      old_org_id,
      old_org_name,
      reason,
      evidence
    )
    SELECT location_id, location_name, location_domain, old_org_id, old_org_name, reason, evidence
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      location_domain text,
      old_org_id integer,
      old_org_name text,
      reason text,
      evidence jsonb
    )
    `,
    [JSON.stringify(payload)],
  );
}

async function insertNewOrgRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`org_dedup_phase2_new_orgs_${phaseDate}`)} (
      org_id,
      canonical_name,
      website_domain,
      dedup_key,
      location_count,
      location_ids,
      brand_evidence
    )
    SELECT org_id, canonical_name, website_domain, dedup_key, location_count, location_ids, brand_evidence
    FROM jsonb_to_recordset($1::jsonb) AS x(
      org_id integer,
      canonical_name text,
      website_domain text,
      dedup_key text,
      location_count integer,
      location_ids integer[],
      brand_evidence jsonb
    )
    `,
    [JSON.stringify(rows)],
  );
}

async function acceptanceChecks(pgClient, newOrgResults) {
  const elitra = await pgClient.query(`
    SELECT
      COUNT(*)::int AS child_count,
      COUNT(*) FILTER (
        WHERE COALESCE(l.website, '') !~* 'elitrahealth\\.com'
      )::int AS non_elitra_website_count,
      jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'website', l.website) ORDER BY l.id)
        FILTER (WHERE COALESCE(l.website, '') !~* 'elitrahealth\\.com') AS non_elitra_examples
    FROM ${quoteIdent(schema)}.organizations org
    JOIN ${quoteIdent(schema)}.locations l ON l.org_id = org.id
    WHERE org.canonical_name = 'Elitra Health'
      AND l.deleted_at IS NULL
  `);
  const newOrgDomainConflicts = newOrgResults.length
    ? await pgClient.query(
        `
        WITH created AS (
          SELECT UNNEST($1::int[]) AS org_id, UNNEST($2::text[]) AS domain
        )
        SELECT c.org_id, c.domain, other.id AS other_org_id, other.canonical_name AS other_org_name
        FROM created c
        JOIN ${quoteIdent(schema)}.organizations other
          ON other.id <> c.org_id
         AND other.deleted_at IS NULL
         AND lower(regexp_replace(regexp_replace(COALESCE(other.website_domain, ''), '^https?://', ''), '^www\\d?\\.', '')) = c.domain
        ORDER BY c.domain, other.id
        `,
        [
          newOrgResults.map((org) => org.org_id),
          newOrgResults.map((org) => org.website_domain),
        ],
      )
    : { rows: [] };
  return {
    elitra_health: elitra.rows[0],
    new_org_domain_conflicts: newOrgDomainConflicts.rows,
  };
}

function deriveBrand(rows, domain) {
  if (domain === "flt.life") {
    return {
      safe: false,
      reason: "known_mixed_brand_domain_flt_life",
      distinct_names: distinctPreparedNames(rows),
    };
  }
  if (rows.length === 1) {
    const canonicalName = displayBrand(rows[0].location_name);
    return {
      safe: true,
      reason: "single_location_domain",
      canonical_name: canonicalName,
      distinct_names: distinctPreparedNames(rows),
    };
  }

  const distinctNames = distinctPreparedNames(rows);
  if (distinctNames.length === 1) {
    return {
      safe: true,
      reason: "all_location_names_match_after_suffix_stripping",
      canonical_name: distinctNames[0],
      distinct_names: distinctNames,
    };
  }

  const tokenSets = rows.map((row) => significantTokens(row.location_name));
  const commonTokens = [...tokenSets[0]].filter((token) => tokenSets.every((set) => set.has(token)));
  const domainTokens = significantDomainTokens(domain);
  const commonDomainTokens = commonTokens.filter((token) => domainTokens.has(token));
  const usableCommonTokens = commonTokens.filter((token) => !GENERIC_BRAND_TOKENS.has(token));

  if (usableCommonTokens.length || commonDomainTokens.length) {
    const canonicalName = shortestNameWithToken(rows, usableCommonTokens[0] || commonDomainTokens[0]);
    return {
      safe: true,
      reason: "shared_non_generic_brand_token",
      canonical_name: canonicalName,
      distinct_names: distinctNames,
      common_tokens: commonTokens,
      domain_tokens: [...domainTokens],
    };
  }

  return {
    safe: false,
    reason: "no_shared_obvious_brand_token",
    distinct_names: distinctNames,
    common_tokens: commonTokens,
    domain_tokens: [...domainTokens],
  };
}

function locationMatchesOrg(locationName, orgName) {
  const location = comparableName(locationName);
  const org = comparableName(orgName);
  if (!location || !org || Math.min(location.length, org.length) < 4) {
    return false;
  }
  return location === org || location.includes(org) || org.includes(location);
}

function guardrail(row, reason, evidence = {}) {
  return {
    ...row,
    guardrail_reason: reason,
    guardrail_evidence: evidence,
  };
}

function distinctPreparedNames(rows) {
  return unique(rows.map((row) => displayBrand(row.location_name)).filter(Boolean));
}

function shortestNameWithToken(rows, token) {
  const names = distinctPreparedNames(rows);
  const matching = names.filter((name) => significantTokens(name).has(token));
  return (matching.length ? matching : names).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

function displayBrand(value) {
  let text = String(value || "").trim();
  text = text.replace(/\s*\([^)]*\)\s*/g, " ");
  text = text.replace(/\s+\|\s+.*$/, "");
  text = text.replace(/\s+-\s+[A-Za-z .'-]+,\s*(?:[A-Z]{2}|[A-Za-z ]+)$/u, "");
  text = text.replace(/\s+[–—-]\s+[A-Za-z .'-]+,\s*(?:[A-Z]{2}|[A-Za-z ]+)$/u, "");
  text = text.replace(/\s+[–—-]\s+(?:New York City|New York|Brooklyn|Austin|Tampa|Denver|Atlanta|Chicago|Boston|Miami|Dallas|Houston|Phoenix|Scottsdale|Jacksonville|London|Prague|Paris|Rome|Berlin)$/iu, "");
  text = text.replace(/\s+/g, " ").trim();
  return text || String(value || "").trim();
}

function comparableName(value) {
  return stripDiacritics(displayBrand(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(clinic|medical|center|centre|pc|pllc|llc|inc|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value) {
  const tokens = stripDiacritics(displayBrand(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !BRAND_STOPWORDS.has(token));
  return new Set(tokens);
}

function significantDomainTokens(domain) {
  const sld = String(domain || "").split(".")[0] || "";
  const tokens = sld
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !BRAND_STOPWORDS.has(token));
  if (sld.length >= 3 && !BRAND_STOPWORDS.has(sld.toLowerCase())) {
    tokens.push(sld.toLowerCase());
  }
  return new Set(tokens);
}

function normalizeNameForDb(value) {
  return stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeWebsiteToHost(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  let text = value.trim().toLowerCase();
  if (!text) {
    return null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = `https://${text}`;
  }
  try {
    const url = new URL(text);
    return url.hostname.replace(/\.$/, "").replace(/^www\d?\./, "") || null;
  } catch {
    return text
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .split(/[/?#]/)[0]
      .split(":")[0]
      .replace(/^www\d?\./, "")
      .replace(/\.$/, "");
  }
}

function normalizeWebsiteToRegistrableDomain(value) {
  const host = normalizeWebsiteToHost(value);
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host || null;
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  if (parts.length === 2) {
    return host;
  }
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (COMMON_MULTI_LABEL_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return lastThree;
  }
  return lastTwo;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Org Dedup Phase 2 Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(markdownTable(["metric", "count"], Object.entries(report.summary)));
  lines.push("");
  lines.push("## Backups");
  lines.push("");
  if (report.backup_tables.length) {
    for (const table of report.backup_tables) {
      lines.push(`- ${table}`);
    }
  } else {
    lines.push("- Dry run only; no backup tables committed.");
  }
  lines.push("");
  lines.push("## New Orgs Created");
  lines.push("");
  lines.push(
    markdownTable(
      ["org_id", "canonical_name", "website_domain", "locations"],
      report.new_orgs_created.slice(0, 200).map((org) => [org.org_id, org.canonical_name, org.website_domain, org.location_count]),
    ),
  );
  lines.push("");
  lines.push("## Guardrail Ambiguous");
  lines.push("");
  lines.push(
    markdownTable(
      ["location_id", "location_name", "domain", "reason"],
      report.moved_to_ambiguous_by_guardrail.slice(0, 200).map((row) => [
        row.location_id,
        row.location_name,
        row.location_domain,
        row.guardrail_reason,
      ]),
    ),
  );
  lines.push("");
  lines.push("## Renamed Orgs");
  lines.push("");
  lines.push(markdownTable(["org_id", "old_name", "new_name"], report.renamed_orgs.map((row) => [row.org_id, row.old_name, row.new_name])));
  lines.push("");
  lines.push("## Blain's Review");
  lines.push("");
  lines.push(`Org ${report.blain_deletion_review.org_id} was not renamed. Locations hidden: ${report.blain_deletion_review.locations.length}.`);
  lines.push("");
  lines.push("## Acceptance");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.acceptance, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`Full details are in \`${path.basename(reportJsonPath)}\`.`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ].join("\n");
}

function markdownCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    const bucket = groups.get(value) || [];
    bucket.push(row);
    groups.set(value, bucket);
  }
  return groups;
}

function unique(values) {
  return [...new Set(values)];
}

function parseArgs(args) {
  const parsed = { envFile: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--database-url") {
      parsed.databaseUrl = next;
      index += 1;
    } else if (arg === "--schema") {
      parsed.schema = next;
      index += 1;
    } else if (arg === "--raw-schema") {
      parsed.rawSchema = next;
      index += 1;
    } else if (arg === "--env-file") {
      parsed.envFile.push(next);
      index += 1;
    } else if (arg === "--audit") {
      parsed.audit = next;
      index += 1;
    } else if (arg === "--json-out") {
      parsed.jsonOut = next;
      index += 1;
    } else if (arg === "--md-out") {
      parsed.mdOut = next;
      index += 1;
    } else if (arg === "--date") {
      parsed.date = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizePostgresConnectionString(value) {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return value;
}

function quoteIdent(value) {
  return `"${normalizeIdentifier(value).replaceAll('"', '""')}"`;
}
