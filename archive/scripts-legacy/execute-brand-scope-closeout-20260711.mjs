#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".cache", "brand_scope_closeout_20260711");
const TSV_PATH = path.join(ROOT, ".cache", "brand_scope_sweep_20260711", "db_wide_wound_name_token_scan_20260711.tsv");
const ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607110002";
const ACTOR_LABEL = "brand_scope_closeout_20260711";
const LOCKED_SLUG = "o3-wellness-center-dubai";
const SEARCH_TERMS = [
  "wound debridement",
  "debridement",
  "total contact casting",
  "diabetic foot ulcer",
  "lyme disease",
  "hyperbaric",
  "ozone sauna",
  "red light",
];

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString = normalizePostgresConnectionString(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

mkdirSync(OUT_DIR, { recursive: true });
const client = new Client({ connectionString });
const startedAt = new Date();

try {
  await client.connect();

  const report = {
    actor_id: ACTOR_ID,
    actor_label: ACTOR_LABEL,
    started_at: startedAt.toISOString(),
    locked_slug: LOCKED_SLUG,
    step1_state_check: await stateCheck(),
    step2_taxonomy_triage: await taxonomyTriageStatus(),
    step3_hide_68: null,
    step4_offering_display_gate: {
      read_only_count_before_code_change: await unmappedOfferingCountBySource(),
      sample_raw_names: await unmappedOfferingSample(),
    },
    step5_search_hygiene: {
      status: "NOT EXECUTED",
      reason: "Step 2 real LLM triage and re-map was not committed because no LLM API key is configured.",
    },
    step6_verify: {
      before_search_counts: await searchCounts(),
    },
    not_executed: [],
  };

  report.step3_hide_68 = await hideDbWideWoundRows();
  report.step6_verify.after_step3_search_counts = await searchCounts();
  report.step6_verify.reconstructed_before_step3_search_counts = await reconstructedBeforeStep3SearchCounts();
  report.step6_verify.mapped_coverage = await mappedCoverage();
  report.step6_verify.hidden_totals_by_reason = await hiddenTotalsByReason();
  report.step6_verify.locked_slug_check = await lockedSlugCheck();
  report.step6_verify.actor_events = await actorEvents();
  report.step6_verify.aalto_onlyhealth_db_check = await aaltoOnlyHealthCheck();
  report.step6_verify.llm_call_ledgers = await callLedgerSummary("llm");
  report.step6_verify.places_call_ledgers = await callLedgerSummary("places");
  report.step6_verify.new_treatments = {
    count: 0,
    auto_promoted_terms: [],
    search_count_terms: [],
    reason: "No new treatments were auto-promoted because Step 2 could not run without real LLM calls.",
  };

  if (report.step2_taxonomy_triage.status !== "executed") {
    report.not_executed.push(`STEP 2 — TAXONOMY TRIAGE: ${report.step2_taxonomy_triage.reason}`);
    report.not_executed.push("STEP 5 — SEARCH HYGIENE: blocked by Step 2 re-map not being committed.");
    report.not_executed.push("STEP 6 — 5 new-treatment filter pages: no newly auto-promoted treatments exist this run.");
    report.not_executed.push("STEP 6 — 3 newly auto-promoted treatment search counts: no newly auto-promoted treatments exist this run.");
  }

  const jsonPath = path.join(OUT_DIR, "brand_scope_closeout_summary_20260711.json");
  const mdPath = path.join(ROOT, "docs", "brand-scope-closeout-report-20260711.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, renderMarkdown(report));

  console.log(JSON.stringify({
    actor_label: ACTOR_LABEL,
    step2_status: report.step2_taxonomy_triage.status,
    hide_candidates: report.step3_hide_68.tsv_rows,
    hidden_locations_updated: report.step3_hide_68.hidden_locations_updated,
    suppression_ledger_rows_touched: report.step3_hide_68.suppression_ledger_rows_touched,
    skipped_claim_or_owner_verified: report.step3_hide_68.skipped_claim_or_owner_verified.length,
    unmapped_offering_rows: report.step4_offering_display_gate.read_only_count_before_code_change.reduce((sum, row) => sum + Number(row.rows), 0),
    report_md: path.relative(ROOT, mdPath),
    report_json: path.relative(ROOT, jsonPath),
  }, null, 2));
} finally {
  await client.end().catch(() => {});
}

async function stateCheck() {
  const taxonomyTables = await many(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('fountain', 'fountain_raw')
      AND (
        table_name ILIKE '%triage%'
        OR table_name ILIKE '%unmapped%'
        OR table_name ILIKE '%alias%'
        OR table_name ILIKE '%taxonomy%'
      )
    ORDER BY table_schema, table_name
  `);
  const tableCounts = [];
  for (const table of taxonomyTables) {
    const count = await row(`SELECT count(*)::integer AS rows FROM ${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`);
    tableCounts.push({ ...table, rows: count.rows });
  }
  const triageTables = taxonomyTables.filter((table) => /triage/i.test(table.table_name));
  const aliases = await many(`
    SELECT coalesce(source_slug, '') AS source_slug, count(*)::integer AS rows
    FROM fountain_raw.treatment_aliases
    GROUP BY 1
    ORDER BY rows DESC, source_slug
    LIMIT 20
  `);
  const treatments = await row(`SELECT count(*)::integer AS rows FROM fountain.treatments`);
  const unmapped = await row(`
    SELECT count(*)::integer AS rows, coalesce(sum(occurrences), 0)::integer AS occurrences
    FROM fountain_raw.unmapped_terms
  `);
  return {
    triage_results_tables_found: triageTables,
    conclusion: triageTables.length
      ? "Triage-like tables exist; inspect counts above for run status."
      : "No taxonomy triage results table found for the requested decision classes.",
    taxonomy_related_table_counts: tableCounts,
    treatment_count: treatments.rows,
    unmapped_terms: unmapped,
    alias_source_counts: aliases,
  };
}

async function taxonomyTriageStatus() {
  const hasKey = Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  );
  if (!hasKey) {
    return {
      status: "NOT EXECUTED",
      reason: "No LLM API key configured; checked OPENAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY.",
      alias_inserts: 0,
      rejected_terms_marked: 0,
      new_treatments_inserted: 0,
      remapped_offerings: 0,
      affected_locations_refreshed: 0,
    };
  }
  return {
    status: "NOT EXECUTED",
    reason: "LLM key exists, but this closeout script intentionally refuses to run an unimplemented classifier path.",
  };
}

async function hideDbWideWoundRows() {
  const tsvRows = readTsv(TSV_PATH);
  const ids = [...new Set(tsvRows.map((row) => Number(row.location_id)).filter(Number.isFinite))];
  const candidates = await many(`
    WITH target AS (
      SELECT unnest($1::int[]) AS location_id
    ),
    source_links AS (
      SELECT
        sr.entity_id AS location_id,
        s.slug AS source_slug,
        sr.source_listing_id,
        EXISTS (
          SELECT 1
          FROM fountain_raw.source_listings sl
          WHERE sl.source_slug = s.slug
            AND sl.source_listing_id = sr.source_listing_id
        ) AS has_source_listing,
        row_number() OVER (
          PARTITION BY sr.entity_id
          ORDER BY
            CASE WHEN sr.source_listing_id IS NOT NULL THEN 0 ELSE 1 END,
            CASE WHEN EXISTS (
              SELECT 1
              FROM fountain_raw.source_listings sl
              WHERE sl.source_slug = s.slug
                AND sl.source_listing_id = sr.source_listing_id
            ) THEN 0 ELSE 1 END,
            sr.id
        ) AS rn
      FROM fountain.source_records sr
      JOIN fountain.sources s ON s.id = sr.source_id
      JOIN target t ON t.location_id = sr.entity_id
      WHERE sr.entity_type = 'location'
    )
    SELECT
      l.id,
      l.name,
      l.slug,
      l.status,
      l.verification_status,
      l.owner_account_id,
      l.org_id,
      coalesce(sl.source_slug, '') AS source_slug,
      sl.source_listing_id,
      coalesce(sl.has_source_listing, false) AS has_source_listing,
      EXISTS (
        SELECT 1
        FROM fountain.clinic_claims cc
        WHERE (cc.location_id = l.id OR cc.org_id = l.org_id)
          AND cc.status IN ('pending','approved','verified','active')
      ) AS has_claim_record
    FROM target t
    JOIN fountain.locations l ON l.id = t.location_id
    LEFT JOIN source_links sl ON sl.location_id = l.id AND sl.rn = 1
    ORDER BY l.id
  `, [ids]);

  const skipped = [];
  const noLedgerLink = [];
  const eligible = [];
  for (const item of candidates) {
    const reasons = [];
    if (item.slug === LOCKED_SLUG) reasons.push("locked_slug");
    if (item.owner_account_id) reasons.push("owner_account_id");
    if (["owner_verified", "claimed"].includes(String(item.verification_status || "").toLowerCase())) reasons.push("verification_status");
    if (item.has_claim_record) reasons.push("clinic_claims");
    if (reasons.length) {
      skipped.push({ ...item, skip_reason: reasons.join(",") });
      continue;
    }
    if (!item.source_slug || item.source_listing_id == null) {
      noLedgerLink.push(item);
    }
    eligible.push(item);
  }

  let hidden = 0;
  let ledgerTouched = 0;
  let refreshCount = 0;
  await client.query("BEGIN");
  try {
    await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2::text)", [ACTOR_ID, ACTOR_LABEL]);
    const updated = await client.query(`
      UPDATE fountain.locations l
      SET status = 'hidden', updated_at = now()
      WHERE l.id = ANY($1::int[])
        AND l.status = 'active'
        AND l.deleted_at IS NULL
        AND l.slug <> $2
        AND l.owner_account_id IS NULL
        AND coalesce(l.verification_status, '') NOT IN ('owner_verified','claimed')
        AND NOT EXISTS (
          SELECT 1
          FROM fountain.clinic_claims cc
          WHERE (cc.location_id = l.id OR cc.org_id = l.org_id)
            AND cc.status IN ('pending','approved','verified','active')
        )
    `, [eligible.map((row) => Number(row.id)), LOCKED_SLUG]);
    hidden = updated.rowCount;

    for (const item of eligible) {
      if (!item.source_slug || item.source_listing_id == null) continue;
      const ledger = await client.query(`
        INSERT INTO fountain_raw.suppressed_source_listings (source_slug, source_listing_id, reason, suppressed_by)
        VALUES ($1, $2, 'off_brand_wound_care_dbwide', $3)
        ON CONFLICT (source_slug, source_listing_id) DO UPDATE
        SET reason = EXCLUDED.reason,
            suppressed_by = EXCLUDED.suppressed_by,
            suppressed_at = now()
      `, [item.source_slug, item.source_listing_id, ACTOR_LABEL]);
      ledgerTouched += ledger.rowCount;
    }

    for (const item of eligible) {
      await client.query("SELECT fountain.refresh_search_index_for_location($1)", [Number(item.id)]);
      refreshCount += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  writeTsv(
    path.join(OUT_DIR, "dbwide_wound_claim_or_owner_skips_20260711.tsv"),
    skipped,
    ["id", "name", "slug", "status", "verification_status", "source_slug", "source_listing_id", "skip_reason"],
  );
  writeTsv(
    path.join(OUT_DIR, "dbwide_wound_no_ledger_link_20260711.tsv"),
    noLedgerLink,
    ["id", "name", "slug", "status", "source_slug", "source_listing_id"],
  );

  const postStatus = await many(`
    SELECT status, count(*)::integer AS rows
    FROM fountain.locations
    WHERE id = ANY($1::int[])
    GROUP BY status
    ORDER BY status
  `, [ids]);
  const reasonCount = await row(`
    SELECT count(*)::integer AS rows
    FROM fountain_raw.suppressed_source_listings
    WHERE reason = 'off_brand_wound_care_dbwide'
      AND suppressed_by = $1
  `, [ACTOR_LABEL]);

  return {
    tsv_rows: ids.length,
    eligible_locations: eligible.length,
    hidden_locations_updated: hidden,
    committed_hidden_locations_current: postStatus.find((row) => row.status === "hidden")?.rows || 0,
    suppression_ledger_rows_touched: ledgerTouched,
    suppression_ledger_rows_for_actor_reason: reasonCount.rows,
    refreshed_locations: refreshCount,
    skipped_claim_or_owner_verified: skipped,
    no_source_record_ledger_link: noLedgerLink,
    post_status_counts_for_tsv_ids: postStatus,
  };
}

async function unmappedOfferingCountBySource() {
  return many(`
    SELECT coalesce(s.slug, 'unknown') AS source, count(*)::integer AS rows
    FROM fountain.offerings o
    JOIN fountain.locations l ON l.id = o.location_id
    LEFT JOIN fountain.sources s ON s.id = o.source_id
    WHERE o.treatment_id IS NULL
      AND o.deleted_at IS NULL
      AND coalesce(o.status, 'active') = 'active'
      AND l.deleted_at IS NULL
      AND coalesce(l.status, 'active') = 'active'
    GROUP BY 1
    ORDER BY rows DESC, source
  `);
}

async function unmappedOfferingSample() {
  return many(`
    SELECT coalesce(s.slug, 'unknown') AS source, o.raw_name, l.id AS location_id, l.name, l.slug
    FROM fountain.offerings o
    JOIN fountain.locations l ON l.id = o.location_id
    LEFT JOIN fountain.sources s ON s.id = o.source_id
    WHERE o.treatment_id IS NULL
      AND o.deleted_at IS NULL
      AND coalesce(o.status, 'active') = 'active'
      AND l.deleted_at IS NULL
      AND coalesce(l.status, 'active') = 'active'
    ORDER BY o.id
    LIMIT 20
  `);
}

async function searchCounts() {
  return many(`
    WITH q(term) AS (
      SELECT unnest($1::text[]) AS term
    )
    SELECT q.term, count(si.*)::integer AS matches
    FROM q
    LEFT JOIN fountain.search_index si
      ON si.entity_type = 'location'
     AND si.search_text @@ websearch_to_tsquery('simple', q.term)
    GROUP BY q.term
    ORDER BY q.term
  `, [SEARCH_TERMS]);
}

async function reconstructedBeforeStep3SearchCounts() {
  const ids = readTsv(TSV_PATH).map((row) => Number(row.location_id)).filter(Number.isFinite);
  return many(`
    WITH q(term) AS (
      SELECT unnest($1::text[]) AS term
    ),
    virtual_hidden_index AS (
      SELECT
        l.id AS entity_id,
        (
          setweight(to_tsvector('simple', coalesce(coalesce(l.name, org.canonical_name), '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(l.locality, '') || ' ' || coalesce(coalesce(l.country_name, l.country_code), '')), 'B') ||
          setweight(to_tsvector('simple', coalesce((
            SELECT string_agg(DISTINCT coalesce(t.canonical_name, o.raw_name), ' ' ORDER BY coalesce(t.canonical_name, o.raw_name))
            FROM fountain.offerings o
            LEFT JOIN fountain.treatments t ON t.id = o.treatment_id
            WHERE o.location_id = l.id
              AND o.status = 'active'
              AND o.deleted_at IS NULL
              AND coalesce(t.canonical_name, o.raw_name) IS NOT NULL
              AND coalesce(t.canonical_name, o.raw_name) <> ''
          ), '') || ' ' || coalesce((
            SELECT string_agg(DISTINCT tg.facet || ':' || tg.value, ' ' ORDER BY tg.facet || ':' || tg.value)
            FROM fountain.entity_tags et
            JOIN fountain.tags tg ON tg.id = et.tag_id
            WHERE et.entity_type = 'location'
              AND et.entity_id = l.id
              AND tg.facet NOT IN ('service_area_city', 'service_area_service')
          ), '')), 'C')
        ) AS search_text
      FROM fountain.locations l
      LEFT JOIN fountain.organizations org ON org.id = l.org_id
      WHERE l.id = ANY($2::int[])
        AND l.deleted_at IS NULL
    ),
    active_matches AS (
      SELECT q.term, count(si.*)::integer AS matches
      FROM q
      LEFT JOIN fountain.search_index si
        ON si.entity_type = 'location'
       AND si.search_text @@ websearch_to_tsquery('simple', q.term)
      GROUP BY q.term
    ),
    hidden_matches AS (
      SELECT q.term, count(v.*)::integer AS matches
      FROM q
      LEFT JOIN virtual_hidden_index v
        ON v.search_text @@ websearch_to_tsquery('simple', q.term)
      GROUP BY q.term
    )
    SELECT q.term, (coalesce(a.matches, 0) + coalesce(h.matches, 0))::integer AS matches
    FROM q
    LEFT JOIN active_matches a ON a.term = q.term
    LEFT JOIN hidden_matches h ON h.term = q.term
    ORDER BY q.term
  `, [SEARCH_TERMS, ids]);
}

async function mappedCoverage() {
  return row(`
    SELECT
      count(*)::integer AS active_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NOT NULL)::integer AS mapped_active_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NULL)::integer AS unmapped_active_offerings,
      round(100.0 * count(*) FILTER (WHERE o.treatment_id IS NOT NULL) / nullif(count(*), 0), 2)::float AS mapped_pct
    FROM fountain.offerings o
    JOIN fountain.locations l ON l.id = o.location_id
    WHERE o.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND coalesce(o.status, 'active') = 'active'
      AND coalesce(l.status, 'active') = 'active'
  `);
}

async function hiddenTotalsByReason() {
  return many(`
    SELECT reason, suppressed_by, count(*)::integer AS rows
    FROM fountain_raw.suppressed_source_listings
    WHERE reason IN ('off_brand_wound_care', 'off_brand_wound_care_dbwide')
    GROUP BY reason, suppressed_by
    ORDER BY reason, suppressed_by
  `);
}

async function lockedSlugCheck() {
  return row(`
    SELECT id, slug, name, status, updated_at
    FROM fountain.locations
    WHERE slug = $1
  `, [LOCKED_SLUG]);
}

async function actorEvents() {
  return many(`
    SELECT entity_type, action, count(*)::integer AS events, min(created_at) AS first_event_at, max(created_at) AS last_event_at
    FROM fountain.entity_change_events
    WHERE actor_id = $1::uuid
      AND actor_type = $2
    GROUP BY 1,2
    ORDER BY 1,2
  `, [ACTOR_ID, ACTOR_LABEL]);
}

async function aaltoOnlyHealthCheck() {
  return many(`
    SELECT
      l.id,
      l.name,
      l.slug,
      count(o.*) FILTER (WHERE o.treatment_id IS NOT NULL)::integer AS mapped_offerings,
      count(o.*) FILTER (WHERE o.treatment_id IS NULL)::integer AS unmapped_offerings,
      (array_remove(array_agg(o.raw_name ORDER BY o.id) FILTER (WHERE o.treatment_id IS NOT NULL), NULL))[1:20] AS mapped_raw_names,
      (array_remove(array_agg(o.raw_name ORDER BY o.id) FILTER (WHERE o.treatment_id IS NULL), NULL))[1:20] AS unmapped_raw_names
    FROM fountain.locations l
    LEFT JOIN fountain.offerings o
      ON o.location_id = l.id
     AND o.deleted_at IS NULL
     AND coalesce(o.status, 'active') = 'active'
    WHERE l.slug IN ('aalto-hyperbaric-medical-group-los-angeles', 'onlyhealth-co-istanbul')
    GROUP BY l.id
    ORDER BY l.slug
  `);
}

async function callLedgerSummary(kind) {
  const pattern = kind === "places" ? "%place%" : "%llm%";
  return many(`
    SELECT call_type, provider, status, count(*)::integer AS rows
    FROM fountain_raw.hyperbaric_cleanup_call_ledger_20260711
    WHERE call_type ILIKE $1
    GROUP BY call_type, provider, status
    ORDER BY call_type, provider, status
  `, [pattern]);
}

function renderMarkdown(report) {
  const lines = [
    "# Brand Scope Closeout Report",
    "",
    `- Date: 20260711`,
    `- Actor: \`${report.actor_label}\` / \`${report.actor_id}\``,
    `- Locked slug: \`${report.locked_slug}\``,
    "",
    "## Step 1 State Check",
    "",
    `- Triage tables found: ${report.step1_state_check.triage_results_tables_found.length}`,
    `- Conclusion: ${report.step1_state_check.conclusion}`,
    `- Treatments: ${report.step1_state_check.treatment_count}`,
    `- Unmapped terms: ${report.step1_state_check.unmapped_terms.rows} rows / ${report.step1_state_check.unmapped_terms.occurrences} occurrences`,
    "",
    markdownTable(["schema", "table", "rows"], report.step1_state_check.taxonomy_related_table_counts.map((row) => [row.table_schema, row.table_name, row.rows])),
    "",
    "## Step 2 Taxonomy Triage",
    "",
    `- Status: ${report.step2_taxonomy_triage.status}`,
    `- Reason: ${report.step2_taxonomy_triage.reason}`,
    "",
    "## Step 3 Hide The 68",
    "",
    `- TSV location ids: ${report.step3_hide_68.tsv_rows}`,
    `- Eligible locations: ${report.step3_hide_68.eligible_locations}`,
    `- Hidden locations updated: ${report.step3_hide_68.hidden_locations_updated}`,
    `- Current committed hidden locations from TSV: ${report.step3_hide_68.committed_hidden_locations_current}`,
    `- Suppression ledger rows touched: ${report.step3_hide_68.suppression_ledger_rows_touched}`,
    `- Claim/owner skips: ${report.step3_hide_68.skipped_claim_or_owner_verified.length}`,
    `- No source-record ledger link: ${report.step3_hide_68.no_source_record_ledger_link.length}`,
    "",
    markdownTable(["status", "rows"], report.step3_hide_68.post_status_counts_for_tsv_ids.map((row) => [row.status, row.rows])),
    "",
    "## Step 4 Offering Display Gate",
    "",
    `- Active unmapped offering rows before code change: ${report.step4_offering_display_gate.read_only_count_before_code_change.reduce((sum, row) => sum + Number(row.rows), 0)}`,
    "",
    markdownTable(["source", "rows"], report.step4_offering_display_gate.read_only_count_before_code_change.slice(0, 30).map((row) => [row.source, row.rows])),
    "",
    "## Step 5 Search Hygiene",
    "",
    `- Status: ${report.step5_search_hygiene.status}`,
    `- Reason: ${report.step5_search_hygiene.reason}`,
    "",
    "## Step 6 Verify",
    "",
    "### Search Counts",
    "",
    markdownTable(
      ["term", "reconstructed_before_step3", "after_step3"],
      report.step6_verify.reconstructed_before_step3_search_counts.map((before) => {
        const after = report.step6_verify.after_step3_search_counts.find((row) => row.term === before.term);
        return [before.term, before.matches, after?.matches ?? ""];
      }),
    ),
    "",
    "### Mapped Coverage",
    "",
    markdownTable(["active_offerings", "mapped", "unmapped", "mapped_pct"], [[
      report.step6_verify.mapped_coverage.active_offerings,
      report.step6_verify.mapped_coverage.mapped_active_offerings,
      report.step6_verify.mapped_coverage.unmapped_active_offerings,
      report.step6_verify.mapped_coverage.mapped_pct,
    ]]),
    "",
    "### Hidden Totals By Reason",
    "",
    markdownTable(["reason", "suppressed_by", "rows"], report.step6_verify.hidden_totals_by_reason.map((row) => [row.reason, row.suppressed_by, row.rows])),
    "",
    "### Aalto / OnlyHealth DB Check",
    "",
    markdownTable(
      ["slug", "mapped_offerings", "unmapped_offerings", "mapped_raw_names", "unmapped_raw_names"],
      report.step6_verify.aalto_onlyhealth_db_check.map((row) => [
        row.slug,
        row.mapped_offerings,
        row.unmapped_offerings,
        (row.mapped_raw_names || []).join("; "),
        (row.unmapped_raw_names || []).join("; "),
      ]),
    ),
    "",
    "### Ledgers",
    "",
    `- LLM call ledger rows: ${report.step6_verify.llm_call_ledgers.reduce((sum, row) => sum + Number(row.rows), 0)}`,
    `- Places call ledger rows: ${report.step6_verify.places_call_ledgers.reduce((sum, row) => sum + Number(row.rows), 0)}`,
    "",
    "## NOT EXECUTED",
    "",
    ...(report.not_executed.length ? report.not_executed.map((item) => `- ${item}`) : ["- None"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function readTsv(filePath) {
  const text = readFileSync(filePath, "utf8").trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split("\t");
    const row = {};
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = cells[index] || "";
    }
    return row;
  });
}

function writeTsv(filePath, rows, headers) {
  const escape = (value) => String(value ?? "").replaceAll("\t", " ").replaceAll("\n", " ");
  const body = [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join("\t")),
  ].join("\n");
  writeFileSync(filePath, `${body}\n`);
}

async function many(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function row(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
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

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
