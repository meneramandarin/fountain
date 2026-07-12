#!/usr/bin/env node

import "./lib/pipeline-env.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { getDatabaseUrl, requirePipelineCredentials } from "./lib/pipeline-env.mjs";

const { Client } = pg;
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".cache", "taxonomy_dedup_20260712");
const ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120001";
const ACTOR_LABEL = "taxonomy_dedup_20260712";
const SOURCE_SLUG = "taxonomy_dedup_20260712";

const groups = [
  { name: "telehealth", keepId: 69, keepName: "Telehealth Services", deleteIds: [93, 99, 98] },
  { name: "sports_rehabilitation", keepId: 77, keepName: "Sports Rehabilitation", deleteIds: [81] },
  { name: "b12_injections", keepId: 87, keepName: "B12 Injections", deleteIds: [95] },
  { name: "medical_weight_loss", keepId: 62, keepName: "Medical weight loss", deleteIds: [111] },
  { name: "preventive_care", keepId: 67, keepName: "Preventive Care", deleteIds: [107] },
  { name: "orthotics", keepId: 101, keepName: "Orthotics", deleteIds: [102, 103], renameKeep: true },
];

requirePipelineCredentials({ database: true });
mkdirSync(OUT_DIR, { recursive: true });
const db = new Client({ connectionString: normalizePostgresConnectionString(getDatabaseUrl()) });
const startedAt = new Date();

try {
  await db.connect();
  const targetIds = [...new Set(groups.flatMap((group) => [group.keepId, ...group.deleteIds]))];
  const before = await loadState(targetIds);
  const mergePlan = buildMergePlan(before.treatments);
  const merge = await executeMerge(mergePlan, targetIds);
  const after = await loadState(groups.map((group) => group.keepId));
  const verification = await verify(groups);
  const report = {
    actor_id: ACTOR_ID,
    actor_label: ACTOR_LABEL,
    started_at: startedAt.toISOString(),
    before,
    merge,
    after,
    verification,
    not_executed: [],
  };
  writeFileSync(path.join(OUT_DIR, "taxonomy_dedup_summary_20260712.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(ROOT, "docs", "taxonomy-dedup-report-20260712.md"), renderReport(report));
  console.log(JSON.stringify({
    aliases_inserted: merge.aliases_inserted,
    aliases_repointed: merge.aliases_repointed,
    offerings_remapped: merge.offerings_remapped,
    treatments_deleted: merge.treatments_deleted,
    affected_locations_refreshed: merge.affected_locations_refreshed,
    report: "docs/taxonomy-dedup-report-20260712.md",
  }, null, 2));
} finally {
  await db.end().catch(() => {});
}

function buildMergePlan(treatments) {
  const byId = new Map(treatments.map((row) => [Number(row.id), row]));
  return groups.map((group) => ({
    ...group,
    keepBefore: byId.get(group.keepId),
    duplicates: group.deleteIds.map((id) => byId.get(id)).filter(Boolean),
  }));
}

async function executeMerge(mergePlan, targetIds) {
  const affectedBefore = await many(`
    SELECT DISTINCT location_id
    FROM fountain.offerings
    WHERE treatment_id = ANY($1::int[])
      AND deleted_at IS NULL
  `, [targetIds]);
  const affected = new Set(affectedBefore.map((row) => Number(row.location_id)));
  let aliasesInserted = 0;
  let aliasesRepointed = 0;
  let offeringsRemapped = 0;
  let treatmentsDeleted = 0;

  await db.query("BEGIN");
  try {
    await db.query("SELECT fountain.set_mutation_actor($1::uuid, $2::text)", [ACTOR_ID, ACTOR_LABEL]);
    await db.query(`
      CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_dedup_treatments_backup_20260712 AS
      SELECT *
      FROM fountain.treatments
      WHERE false
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_dedup_treatment_aliases_backup_20260712 AS
      SELECT *
      FROM fountain_raw.treatment_aliases
      WHERE false
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_dedup_offerings_backup_20260712 AS
      SELECT *
      FROM fountain.offerings
      WHERE false
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_dedup_merge_audit_20260712 (
        group_name text NOT NULL,
        keep_treatment_id integer NOT NULL,
        duplicate_treatment_id integer NOT NULL,
        duplicate_canonical_name text NOT NULL,
        duplicate_offerings integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      INSERT INTO fountain_raw.taxonomy_dedup_treatments_backup_20260712
      SELECT *
      FROM fountain.treatments t
      WHERE id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1 FROM fountain_raw.taxonomy_dedup_treatments_backup_20260712 b WHERE b.id=t.id
        )
    `, [targetIds]);
    await db.query(`
      INSERT INTO fountain_raw.taxonomy_dedup_treatment_aliases_backup_20260712
      SELECT *
      FROM fountain_raw.treatment_aliases ta
      WHERE treatment_id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1 FROM fountain_raw.taxonomy_dedup_treatment_aliases_backup_20260712 b WHERE b.id=ta.id
        )
    `, [targetIds]);
    await db.query(`
      INSERT INTO fountain_raw.taxonomy_dedup_offerings_backup_20260712
      SELECT *
      FROM fountain.offerings o
      WHERE treatment_id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1 FROM fountain_raw.taxonomy_dedup_offerings_backup_20260712 b WHERE b.id=o.id
        )
    `, [targetIds]);

    for (const group of mergePlan) {
      if (group.renameKeep) {
        await db.query(`
          UPDATE fountain.treatments
          SET canonical_name=$2
          WHERE id=$1
        `, [group.keepId, group.keepName]);
      }
      const aliasNames = [
        group.keepName,
        group.keepBefore?.canonical_name,
        ...group.duplicates.map((row) => row.canonical_name),
      ].filter(Boolean);
      for (const alias of aliasNames) {
        const result = await db.query(`
          INSERT INTO fountain_raw.treatment_aliases (treatment_id, alias_text, alias_normalized, source_slug)
          VALUES ($1,$2,$3,$4)
          ON CONFLICT (alias_normalized, source_slug) DO UPDATE
          SET treatment_id=EXCLUDED.treatment_id,
              alias_text=EXCLUDED.alias_text
        `, [group.keepId, alias, normalizeTerm(alias), SOURCE_SLUG]);
        aliasesInserted += result.rowCount;
      }
      if (group.deleteIds.length) {
        const aliasUpdate = await db.query(`
          UPDATE fountain_raw.treatment_aliases
          SET treatment_id=$1
          WHERE treatment_id = ANY($2::int[])
        `, [group.keepId, group.deleteIds]);
        aliasesRepointed += aliasUpdate.rowCount;

        const offeringUpdate = await db.query(`
          UPDATE fountain.offerings
          SET treatment_id=$1,
              updated_at=now()
          WHERE treatment_id = ANY($2::int[])
        `, [group.keepId, group.deleteIds]);
        offeringsRemapped += offeringUpdate.rowCount;

        await db.query(`
          INSERT INTO fountain_raw.taxonomy_dedup_merge_audit_20260712
            (group_name, keep_treatment_id, duplicate_treatment_id, duplicate_canonical_name, duplicate_offerings)
          SELECT $1, $2, t.id, t.canonical_name,
                 (SELECT count(*)::integer FROM fountain_raw.taxonomy_dedup_offerings_backup_20260712 o WHERE o.treatment_id=t.id)
          FROM fountain.treatments t
          WHERE t.id = ANY($3::int[])
        `, [group.name, group.keepId, group.deleteIds]);

        const deleteResult = await db.query(`
          DELETE FROM fountain.treatments
          WHERE id = ANY($1::int[])
        `, [group.deleteIds]);
        treatmentsDeleted += deleteResult.rowCount;
      }
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  const affectedAfter = await many(`
    SELECT DISTINCT location_id
    FROM fountain.offerings
    WHERE treatment_id = ANY($1::int[])
      AND deleted_at IS NULL
  `, [groups.map((group) => group.keepId)]);
  for (const row of affectedAfter) affected.add(Number(row.location_id));

  for (const locationId of affected) {
    await db.query(`SELECT fountain.refresh_search_index_for_location($1)`, [locationId]);
  }

  return {
    aliases_inserted: aliasesInserted,
    aliases_repointed: aliasesRepointed,
    offerings_remapped: offeringsRemapped,
    treatments_deleted: treatmentsDeleted,
    affected_locations_refreshed: affected.size,
  };
}

async function loadState(ids) {
  const treatments = await many(`
    SELECT t.id, t.canonical_name, t.category,
           count(o.*) FILTER (WHERE o.deleted_at IS NULL)::integer AS offerings,
           count(DISTINCT o.location_id) FILTER (WHERE o.deleted_at IS NULL)::integer AS locations
    FROM fountain.treatments t
    LEFT JOIN fountain.offerings o ON o.treatment_id=t.id
    WHERE t.id = ANY($1::int[])
    GROUP BY t.id
    ORDER BY t.id
  `, [ids]);
  const aliases = await many(`
    SELECT treatment_id, count(*)::integer AS aliases
    FROM fountain_raw.treatment_aliases
    WHERE treatment_id = ANY($1::int[])
    GROUP BY treatment_id
    ORDER BY treatment_id
  `, [ids]);
  return { treatments, aliases };
}

async function verify() {
  return {
    deleted_rows_remaining: await many(`
      SELECT id, canonical_name
      FROM fountain.treatments
      WHERE id = ANY($1::int[])
      ORDER BY id
    `, [groups.flatMap((group) => group.deleteIds)]),
    survivors: await loadState(groups.map((group) => group.keepId)),
    duplicate_offerings_remaining: await many(`
      SELECT treatment_id, count(*)::integer AS offerings
      FROM fountain.offerings
      WHERE treatment_id = ANY($1::int[])
      GROUP BY treatment_id
      ORDER BY treatment_id
    `, [groups.flatMap((group) => group.deleteIds)]),
    search_counts: await searchCounts(groups.map((group) => group.keepName)),
    event_counts: await many(`
      SELECT entity_type, action, count(*)::integer AS events
      FROM fountain.entity_change_events
      WHERE actor_id=$1::uuid
        AND actor_type=$2
        AND created_at >= $3::timestamptz
      GROUP BY 1,2
      ORDER BY 1,2
    `, [ACTOR_ID, ACTOR_LABEL, startedAt.toISOString()]),
  };
}

async function searchCounts(terms) {
  return many(`
    WITH q(term) AS (SELECT unnest($1::text[]) AS term)
    SELECT q.term, count(si.*)::integer AS matches
    FROM q
    LEFT JOIN fountain.search_index si
      ON si.entity_type='location'
     AND si.search_text @@ websearch_to_tsquery('simple', q.term)
    GROUP BY q.term
    ORDER BY q.term
  `, [terms]);
}

function renderReport(report) {
  return `# Taxonomy Dedup Report

- Date: 20260712
- Actor: \`${report.actor_label}\` / \`${report.actor_id}\`
- Backups: \`fountain_raw.taxonomy_dedup_treatments_backup_20260712\`, \`fountain_raw.taxonomy_dedup_treatment_aliases_backup_20260712\`, \`fountain_raw.taxonomy_dedup_offerings_backup_20260712\`
- No unrelated hard deletes executed; duplicate treatment rows deleted after backup.

## Merge Counts

- Aliases inserted/upserted: ${report.merge.aliases_inserted}
- Existing aliases repointed: ${report.merge.aliases_repointed}
- Offerings remapped: ${report.merge.offerings_remapped}
- Duplicate treatment rows deleted: ${report.merge.treatments_deleted}
- Affected locations refreshed: ${report.merge.affected_locations_refreshed}

## Before

${markdownTable(["id", "canonical", "offerings", "locations"], report.before.treatments.map((row) => [row.id, row.canonical_name, row.offerings, row.locations]))}

## After Survivors

${markdownTable(["id", "canonical", "offerings", "locations"], report.after.treatments.map((row) => [row.id, row.canonical_name, row.offerings, row.locations]))}

## Verification

- Deleted treatment rows remaining: ${report.verification.deleted_rows_remaining.length}
- Duplicate offerings remaining: ${report.verification.duplicate_offerings_remaining.length}

### Search Counts

${markdownTable(["term", "matches"], report.verification.search_counts.map((row) => [row.term, row.matches]))}

### Entity Events

${markdownTable(["entity_type", "action", "events"], report.verification.event_counts.map((row) => [row.entity_type, row.action, row.events]))}

## NOT EXECUTED

- None
`;
}

function markdownTable(headers, rows) {
  if (!rows.length) return "_None._";
  const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.map(esc).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(esc).join(" | ")} |`),
  ].join("\n");
}

function normalizeTerm(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function many(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

function normalizePostgresConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}
