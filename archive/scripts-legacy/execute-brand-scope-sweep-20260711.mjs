#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".cache", "brand_scope_sweep_20260711");
const DOC_PATH = path.join(ROOT, "docs", "brand-scope-sweep-report-20260711.md");
const ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607110001";
const ACTOR_LABEL = "brand_scope_sweep_20260711";
const SOURCE_SLUG = "hyperbaric_app";
const WOUND_RE = /\b(wound|wounds|ulcer|ulcers|debridement|dressing|dressings|negative pressure|wound vac|\bvac\b|total contact casting|casting|ostomy|skin graft|flap|flaps|grafts|diabetic foot|diabetic wound|pressure injur|pressure sore|bedsore|venous stasis|arterial|ischemic|limb salvage|burn|radiation injur|osteomyelitis|necrot|gangrene|amputation|offloading|tissue infection|feridas|heridas|yara|queimaduras|pie diab[eé]tico|cicatrizaci[oó]n|curativos|estomaterapia)\b/i;
const WOUND_CENTER_RE = /\b(wound care|wound healing|wound center|wound centre|wound & hyperbaric|wound \+ hyperbaric|advanced wound|mobile wound|undersea|dive medicine|diving medicine|hyperbaric medicine center|hyperbaric medicine centre|hyperbaric medicine department|feridas|heridas|yara|estomaterapia|healogics)\b/i;
const INSTITUTION_RE = /\b(hospital|health system|university|regional medical|memorial|saint |st\.|department|undersea|medical center|medical centre|universit|clinic of|centro m[eé]dico|hospitalar|nhs|um bwmc|piedmont|adventhealth|mercy|sharp grossmont|trinity health|baycare|chi health|healogics)\b/i;
const CONSUMER_NAME_RE = /\b(wellness|longevity|performance|sports|recovery|integrative|regenerative|med spa|spa|chiropractic|physio|physical therapy|iv|ozone|anti-aging|aesthetic|fitness|rejuvenation|rejuven8|restore|biohacking|cryotherapy|health club|club|private clinic|clinic|studio)\b/i;
const PURE_HOSPITAL_NAME_RE = /\b(hospital|university|medical center|medical centre|health system|department|nhs|memorial|regional)\b/i;

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString = normalizePostgresConnectionString(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);

if (!connectionString) throw new Error("Missing DATABASE_URL or POSTGRES_URL.");

mkdirSync(OUT_DIR, { recursive: true });
const client = new Client({ connectionString });
const startedAt = new Date();

try {
  await client.connect();
  const before = await loadBaselineCounts();
  const classified = await classifyKeepMedical();
  const hideCandidates = classified.filter((row) => row.subclass === "medical_wound_center" && row.subclass_confidence === "high");
  const skippedClaimed = hideCandidates.filter((row) => row.claim_blocked);
  const hideable = hideCandidates.filter((row) => !row.claim_blocked);

  const hideSummary = await hideLocations(hideable);
  const reviewRows = classified.filter(
    (row) =>
      row.subclass === "unclear" ||
      (row.subclass === "medical_consumer_ok" && row.subclass_confidence === "medium"),
  );
  const dbWideNameScan = await dbWideWoundNameScan();
  const searchHygiene = await loadSearchHygieneProposal();
  const after = await loadBaselineCounts();
  const eventCounts = await loadEventCounts();

  const files = {
    high_wound_hidden: writeTsv(
      "medical_wound_center_high_hidden_20260711.tsv",
      hideable.map(formatReviewRow),
      reviewHeaders(),
    ),
    skipped_claimed: writeTsv(
      "medical_wound_center_claim_owner_skips_20260711.tsv",
      skippedClaimed.map(formatReviewRow),
      reviewHeaders(),
    ),
    review_queue: writeTsv(
      "medical_unclear_and_medium_consumer_review_20260711.tsv",
      reviewRows.map(formatReviewRow),
      reviewHeaders(),
    ),
    db_wide_name_scan: writeTsv(
      "db_wide_wound_name_token_scan_20260711.tsv",
      dbWideNameScan,
      ["location_id", "name", "locality", "country_code", "status", "sources", "website", "offering_summary"],
    ),
    search_hygiene_diff: writeText("search_hygiene_function_proposed_diff_20260711.sql", searchHygiene.diff),
  };

  const report = {
    started_at: startedAt.toISOString(),
    actor_id: ACTOR_ID,
    actor_label: ACTOR_LABEL,
    before,
    after,
    keep_medical_classification: summarizeClassification(classified),
    step1_hide: {
      high_confidence_medical_wound_center_candidates: hideCandidates.length,
      skipped_claim_or_owner_verified: skippedClaimed.length,
      hidden_locations_updated: hideSummary.hidden,
      suppression_ledger_rows_touched: hideSummary.ledgerTouched,
      suppression_ledger_reason_count: hideSummary.ledgerReasonCount,
      event_counts: eventCounts,
    },
    step2_review: {
      unclear_rows: classified.filter((row) => row.subclass === "unclear").length,
      medium_consumer_ok_rows: classified.filter((row) => row.subclass === "medical_consumer_ok" && row.subclass_confidence === "medium").length,
      combined_review_rows: reviewRows.length,
      db_wide_wound_name_token_active_rows: dbWideNameScan.length,
    },
    step3_search_hygiene_gated: searchHygiene.summary,
    files,
  };

  writeText("brand_scope_sweep_summary_20260711.json", `${JSON.stringify(report, null, 2)}\n`);
  writeMarkdownReport(report, classified, dbWideNameScan, searchHygiene);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.end();
}

async function setActor() {
  await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, ACTOR_LABEL]);
}

async function loadBaselineCounts() {
  return {
    active_locations: Number((await row(`SELECT count(*)::int AS count FROM fountain.locations WHERE status='active' AND deleted_at IS NULL`)).count),
    hidden_locations: Number((await row(`SELECT count(*)::int AS count FROM fountain.locations WHERE status='hidden' AND deleted_at IS NULL`)).count),
    hyperbaric_source_active_locations: Number(
      (
        await row(`
          SELECT count(DISTINCT l.id)::int AS count
          FROM fountain.locations l
          JOIN fountain.source_records sr ON sr.entity_type='location' AND sr.entity_id=l.id AND sr.source_id=255
          WHERE l.status='active' AND l.deleted_at IS NULL
        `)
      ).count,
    ),
    search_matches: await searchCounts(),
  };
}

async function searchCounts() {
  return many(`
    WITH q(term) AS (
      VALUES
        ('wound debridement'),
        ('debridement'),
        ('total contact casting'),
        ('diabetic foot ulcer'),
        ('hyperbaric'),
        ('ozone sauna'),
        ('red light')
    )
    SELECT q.term, count(si.*)::int AS matches
    FROM q
    LEFT JOIN fountain.search_index si
      ON si.entity_type='location'
     AND si.search_text @@ websearch_to_tsquery('simple', q.term)
    GROUP BY q.term
    ORDER BY q.term
  `);
}

async function classifyKeepMedical() {
  const rows = await many(`
    SELECT
      r.location_id,
      q.source_listing_id,
      l.name,
      l.slug,
      l.locality,
      l.country_code,
      l.website,
      l.status,
      l.verification_status,
      l.owner_account_id,
      r.confidence AS original_confidence,
      r.result_json,
      coalesce(sl.payload->>'claimed', 'false')::boolean AS source_claimed,
      EXISTS (
        SELECT 1
        FROM fountain.clinic_claims cc
        WHERE (cc.location_id=l.id OR cc.org_id=l.org_id)
          AND cc.status IN ('pending','approved','verified','active')
      ) AS has_claim_record,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('raw', o.raw_name, 'canon', t.canonical_name) ORDER BY COALESCE(t.canonical_name, o.raw_name))
        FROM fountain.offerings o
        LEFT JOIN fountain.treatments t ON t.id=o.treatment_id
        WHERE o.location_id=l.id
          AND o.status='active'
          AND o.deleted_at IS NULL
      ), '[]'::jsonb) AS offerings,
      COALESCE((
        SELECT jsonb_agg(tg.facet || ':' || tg.value ORDER BY tg.facet, tg.value)
        FROM fountain.entity_tags et
        JOIN fountain.tags tg ON tg.id=et.tag_id
        WHERE et.entity_type='location'
          AND et.entity_id=l.id
      ), '[]'::jsonb) AS tags
    FROM fountain_raw.hyperbaric_cleanup_results_20260711 r
    JOIN fountain_raw.hyperbaric_cleanup_queue_20260711 q ON q.location_id=r.location_id
    JOIN fountain.locations l ON l.id=r.location_id
    LEFT JOIN fountain_raw.source_listings sl
      ON sl.source_slug=$1
     AND sl.source_listing_id=q.source_listing_id
    WHERE r.legitimacy='keep_medical'
    ORDER BY r.location_id
  `, [SOURCE_SLUG]);

  return rows.map((item) => {
    const metrics = classifyMetrics(item);
    const claimBlocked = Boolean(
      item.owner_account_id ||
        item.has_claim_record ||
        item.source_claimed ||
        ["owner_verified", "claimed"].includes(String(item.verification_status || "").toLowerCase()),
    );
    return {
      ...item,
      ...metrics,
      claim_blocked: claimBlocked,
      claim_skip_reason: claimBlocked
        ? [
            item.owner_account_id ? "owner_account_id" : null,
            item.has_claim_record ? "clinic_claims" : null,
            item.source_claimed ? "source_payload_claimed" : null,
            ["owner_verified", "claimed"].includes(String(item.verification_status || "").toLowerCase()) ? "verification_status" : null,
          ].filter(Boolean).join(",")
        : "",
    };
  });
}

function classifyMetrics(item) {
  const offeringTexts = item.offerings.map((offering) => [offering.raw, offering.canon].filter(Boolean).join(" / ")).filter(Boolean);
  const woundOfferings = offeringTexts.filter((text) => WOUND_RE.test(text));
  const evidence = evidenceText(item.result_json);
  const fullText = [item.name, item.website, evidence, ...offeringTexts, ...item.tags].filter(Boolean).join(" | ");
  let subclass = "unclear";
  let subclassConfidence = "low";
  let reason = "mixed/thin medical evidence";

  if (
    WOUND_CENTER_RE.test(item.name || "") ||
    WOUND_CENTER_RE.test(evidence) ||
    (offeringTexts.length > 0 && woundOfferings.length / offeringTexts.length >= 0.5 && woundOfferings.length >= 2) ||
    (INSTITUTION_RE.test(fullText) && woundOfferings.length >= 2)
  ) {
    subclass = "medical_wound_center";
    subclassConfidence =
      WOUND_CENTER_RE.test(item.name || "") ||
      WOUND_CENTER_RE.test(evidence) ||
      (offeringTexts.length > 0 && woundOfferings.length / offeringTexts.length >= 0.5)
        ? "high"
        : "medium";
    reason = WOUND_CENTER_RE.test(item.name || "")
      ? "wound/dive/hyperbaric department token in name"
      : WOUND_CENTER_RE.test(evidence)
        ? "stored evidence says wound/dive/hyperbaric center"
        : `wound offerings ${woundOfferings.length}/${offeringTexts.length}`;
  } else if (woundOfferings.length >= 1 && offeringTexts.length > 0 && woundOfferings.length / offeringTexts.length >= 0.25) {
    subclass = "medical_wound_center";
    subclassConfidence = "medium";
    reason = `substantial wound offering mix ${woundOfferings.length}/${offeringTexts.length}`;
  } else if (CONSUMER_NAME_RE.test(item.name || "") && !PURE_HOSPITAL_NAME_RE.test(item.name || "") && woundOfferings.length / Math.max(1, offeringTexts.length) < 0.25) {
    subclass = "medical_consumer_ok";
    subclassConfidence = "high";
    reason = "private/consumer clinic identity in name with low wound ratio";
  } else if (CONSUMER_NAME_RE.test(fullText) && !PURE_HOSPITAL_NAME_RE.test(item.name || "") && woundOfferings.length / Math.max(1, offeringTexts.length) < 0.25) {
    subclass = "medical_consumer_ok";
    subclassConfidence = "medium";
    reason = "consumer wellness/sports/integrative signals with low wound ratio";
  } else if (INSTITUTION_RE.test(fullText)) {
    subclass = "unclear";
    subclassConfidence = "medium";
    reason = "legitimate medical/institutional HBOT but not clearly consumer-bookable";
  }

  return {
    subclass,
    subclass_confidence: subclassConfidence,
    subclass_reason: reason,
    evidence,
    offering_count: offeringTexts.length,
    wound_offering_count: woundOfferings.length,
    wound_examples: woundOfferings.slice(0, 8),
    offering_summary: offeringTexts.slice(0, 18).join("; "),
  };
}

async function hideLocations(hideable) {
  if (!hideable.length) return { hidden: 0, ledgerTouched: 0, ledgerReasonCount: 0 };

  let hidden = 0;
  let ledgerTouched = 0;
  await client.query("BEGIN");
  try {
    await setActor();
    for (const item of hideable) {
      const updated = await client.query(
        `
        UPDATE fountain.locations
        SET status='hidden', updated_at=now()
        WHERE id=$1
          AND status='active'
          AND deleted_at IS NULL
          AND owner_account_id IS NULL
          AND coalesce(verification_status, '') NOT IN ('owner_verified','claimed')
          AND NOT EXISTS (
            SELECT 1
            FROM fountain.clinic_claims cc
            WHERE (cc.location_id=fountain.locations.id OR cc.org_id=fountain.locations.org_id)
              AND cc.status IN ('pending','approved','verified','active')
          )
        `,
        [item.location_id],
      );
      hidden += updated.rowCount;
      if (updated.rowCount > 0) {
        const ledger = await client.query(
          `
          INSERT INTO fountain_raw.suppressed_source_listings (source_slug, source_listing_id, reason, suppressed_by)
          VALUES ($1,$2,'off_brand_wound_care',$3)
          ON CONFLICT (source_slug, source_listing_id) DO UPDATE
          SET reason=EXCLUDED.reason,
              suppressed_by=EXCLUDED.suppressed_by,
              suppressed_at=now()
          `,
          [SOURCE_SLUG, item.source_listing_id, ACTOR_LABEL],
        );
        ledgerTouched += ledger.rowCount;
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const ledgerReasonCount = Number(
    (
      await row(
        `
        SELECT count(*)::int AS count
        FROM fountain_raw.suppressed_source_listings ssl
        JOIN fountain_raw.hyperbaric_cleanup_queue_20260711 q
          ON q.source_listing_id=ssl.source_listing_id
         AND ssl.source_slug=$1
        WHERE q.location_id = ANY($2::int[])
          AND ssl.reason='off_brand_wound_care'
          AND ssl.suppressed_by=$3
        `,
        [SOURCE_SLUG, hideable.map((item) => item.location_id), ACTOR_LABEL],
      )
    ).count,
  );

  return { hidden, ledgerTouched, ledgerReasonCount };
}

async function dbWideWoundNameScan() {
  return many(`
    SELECT
      l.id AS location_id,
      l.name,
      l.locality,
      l.country_code,
      l.status,
      COALESCE(string_agg(DISTINCT s.slug, ', ' ORDER BY s.slug), '') AS sources,
      l.website,
      COALESCE((
        SELECT string_agg(x.label, '; ' ORDER BY x.label)
        FROM (
          SELECT DISTINCT COALESCE(t.canonical_name, o.raw_name) AS label
          FROM fountain.offerings o
          LEFT JOIN fountain.treatments t ON t.id=o.treatment_id
          WHERE o.location_id=l.id
            AND o.status='active'
            AND o.deleted_at IS NULL
            AND COALESCE(t.canonical_name, o.raw_name) IS NOT NULL
            AND COALESCE(t.canonical_name, o.raw_name) <> ''
          ORDER BY label
          LIMIT 20
        ) x
      ), '') AS offering_summary
    FROM fountain.locations l
    LEFT JOIN fountain.source_records sr ON sr.entity_type='location' AND sr.entity_id=l.id
    LEFT JOIN fountain.sources s ON s.id=sr.source_id
    WHERE l.status='active'
      AND l.deleted_at IS NULL
      AND l.name ~* '(\\mwound care\\M|\\mwound healing\\M|\\mwound center\\M|\\mwound centre\\M|\\mwound solutions\\M|\\mulcer clinic\\M)'
    GROUP BY l.id
    ORDER BY l.country_code, l.locality, l.name, l.id
  `);
}

async function loadSearchHygieneProposal() {
  const current = await row(`
    SELECT pg_get_functiondef(to_regprocedure('fountain.refresh_search_index_for_location(integer)')) AS def
  `);
  const proposed = proposedRefreshLocationFunction();
  const affected = await row(`
    WITH current_index AS (
      SELECT
        l.id,
        concat_ws(' ', nullif(COALESCE((
          SELECT string_agg(DISTINCT COALESCE(t.canonical_name, o.raw_name), ' ' ORDER BY COALESCE(t.canonical_name, o.raw_name))
          FROM fountain.offerings o
          LEFT JOIN fountain.treatments t ON t.id=o.treatment_id
          WHERE o.location_id=l.id
            AND o.status='active'
            AND o.deleted_at IS NULL
            AND COALESCE(t.canonical_name, o.raw_name) IS NOT NULL
            AND COALESCE(t.canonical_name, o.raw_name) <> ''
        ), ''), ''), nullif(COALESCE((
          SELECT string_agg(DISTINCT tg.facet || ':' || tg.value, ' ' ORDER BY tg.facet || ':' || tg.value)
          FROM fountain.entity_tags et
          JOIN fountain.tags tg ON tg.id=et.tag_id
          WHERE et.entity_type='location'
            AND et.entity_id=l.id
            AND tg.facet NOT IN ('service_area_city', 'service_area_service')
        ), ''), '')) AS current_surface,
        COALESCE((
          SELECT string_agg(DISTINCT COALESCE(t.canonical_name, o.raw_name), ' ' ORDER BY COALESCE(t.canonical_name, o.raw_name))
          FROM fountain.offerings o
          LEFT JOIN fountain.treatments t ON t.id=o.treatment_id
          WHERE o.location_id=l.id
            AND o.status='active'
            AND o.deleted_at IS NULL
            AND COALESCE(t.canonical_name, o.raw_name) IS NOT NULL
            AND COALESCE(t.canonical_name, o.raw_name) <> ''
        ), '') AS current_treatments,
        COALESCE((
          SELECT string_agg(DISTINCT tg.facet || ':' || tg.value, ' ' ORDER BY tg.facet || ':' || tg.value)
          FROM fountain.entity_tags et
          JOIN fountain.tags tg ON tg.id=et.tag_id
          WHERE et.entity_type='location'
            AND et.entity_id=l.id
            AND tg.facet NOT IN ('service_area_city', 'service_area_service')
        ), '') AS current_tags,
        COALESCE((
          SELECT string_agg(DISTINCT label, ' ' ORDER BY label)
          FROM (
            SELECT t.canonical_name AS label
            FROM fountain.offerings o
            JOIN fountain.treatments t ON t.id=o.treatment_id
            WHERE o.location_id=l.id
              AND o.status='active'
              AND o.deleted_at IS NULL
              AND t.canonical_name IS NOT NULL
              AND t.canonical_name <> ''
            UNION
            SELECT o.raw_name AS label
            FROM fountain.offerings o
            JOIN fountain.treatments t ON t.id=o.treatment_id
            WHERE o.location_id=l.id
              AND o.status='active'
              AND o.deleted_at IS NULL
              AND o.raw_name IS NOT NULL
              AND o.raw_name <> ''
          ) mapped_labels
        ), '') AS proposed_treatments,
        EXISTS (
          SELECT 1
          FROM fountain.offerings o
          WHERE o.location_id=l.id
            AND o.status='active'
            AND o.deleted_at IS NULL
            AND o.treatment_id IS NULL
            AND o.raw_name IS NOT NULL
            AND o.raw_name <> ''
        ) AS has_unmapped_raw_offering
      FROM fountain.locations l
      WHERE l.status='active'
        AND l.deleted_at IS NULL
    )
    SELECT
      count(*) FILTER (WHERE current_surface <> proposed_treatments)::int AS affected_locations,
      count(*) FILTER (WHERE length(current_surface) > length(proposed_treatments))::int AS locations_whose_indexed_text_would_shrink,
      count(*) FILTER (WHERE has_unmapped_raw_offering)::int AS locations_with_unmapped_raw_offering_text_removed,
      count(*) FILTER (WHERE current_tags <> '')::int AS locations_with_raw_tags_removed,
      sum(greatest(0, length(current_surface) - length(proposed_treatments)))::bigint AS total_chars_removed,
      sum(greatest(0, length(proposed_treatments) - length(current_surface)))::bigint AS total_chars_added
    FROM current_index
  `);
  return {
    diff: [
      "-- GATED: proposal only. Do not apply before taxonomy triage re-map confirmation.",
      "-- Current function:",
      current.def,
      "",
      "-- Proposed replacement:",
      proposed,
    ].join("\n"),
    summary: affected,
  };
}

function proposedRefreshLocationFunction() {
  return `CREATE OR REPLACE FUNCTION fountain.refresh_search_index_for_location(p_location_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM fountain.locations l
        WHERE l.id = p_location_id
          AND l.status = 'active'
          AND l.deleted_at IS NULL
    ) THEN
        DELETE FROM fountain.search_index
        WHERE entity_type = 'location'
          AND entity_id = p_location_id;
        RETURN;
    END IF;

    INSERT INTO fountain.search_index(
        entity_type,
        entity_id,
        name,
        locality,
        country,
        treatments,
        specialties,
        tags
    )
    SELECT
        'location',
        l.id,
        COALESCE(l.name, org.canonical_name),
        l.locality,
        COALESCE(l.country_name, l.country_code),
        COALESCE((
            SELECT string_agg(DISTINCT label, ' ' ORDER BY label)
            FROM (
                SELECT t.canonical_name AS label
                FROM fountain.offerings o
                JOIN fountain.treatments t ON t.id = o.treatment_id
                WHERE o.location_id = l.id
                  AND o.status = 'active'
                  AND o.deleted_at IS NULL
                  AND t.canonical_name IS NOT NULL
                  AND t.canonical_name <> ''
                UNION
                SELECT o.raw_name AS label
                FROM fountain.offerings o
                JOIN fountain.treatments t ON t.id = o.treatment_id
                WHERE o.location_id = l.id
                  AND o.status = 'active'
                  AND o.deleted_at IS NULL
                  AND o.raw_name IS NOT NULL
                  AND o.raw_name <> ''
            ) mapped_labels
        ), ''),
        '',
        ''
    FROM fountain.locations l
    LEFT JOIN fountain.organizations org ON org.id = l.org_id
    WHERE l.id = p_location_id
    ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        name = EXCLUDED.name,
        locality = EXCLUDED.locality,
        country = EXCLUDED.country,
        treatments = EXCLUDED.treatments,
        specialties = EXCLUDED.specialties,
        tags = EXCLUDED.tags;
END;
$function$;`;
}

async function loadEventCounts() {
  return many(`
    SELECT entity_type, action, count(*)::int AS events
    FROM fountain.entity_change_events
    WHERE actor_id=$1::uuid
      AND actor_type=$2
      AND created_at >= $3::timestamptz
    GROUP BY 1,2
    ORDER BY 1,2
  `, [ACTOR_ID, ACTOR_LABEL, startedAt.toISOString()]);
}

function summarizeClassification(rows) {
  const counts = new Map();
  for (const item of rows) {
    const key = `${item.subclass}|${item.subclass_confidence}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort().map(([key, count]) => {
    const [subclass, confidence] = key.split("|");
    return { subclass, confidence, rows: count };
  });
}

function reviewHeaders() {
  return [
    "location_id",
    "name",
    "locality",
    "country_code",
    "website",
    "status",
    "subclass",
    "confidence",
    "reason",
    "claim_skip_reason",
    "wound_ratio",
    "wound_examples",
    "evidence",
    "offering_summary",
  ];
}

function formatReviewRow(item) {
  return {
    location_id: item.location_id,
    name: item.name,
    locality: item.locality,
    country_code: item.country_code,
    website: item.website,
    status: item.status,
    subclass: item.subclass,
    confidence: item.subclass_confidence,
    reason: item.subclass_reason,
    claim_skip_reason: item.claim_skip_reason || "",
    wound_ratio: `${item.wound_offering_count}/${item.offering_count}`,
    wound_examples: item.wound_examples.join("; "),
    evidence: item.evidence,
    offering_summary: item.offering_summary,
  };
}

function writeTsv(filename, rows, headers) {
  const filePath = path.join(OUT_DIR, filename);
  const body = [headers.join("\t")];
  for (const item of rows) {
    body.push(headers.map((header) => tsv(item[header])).join("\t"));
  }
  writeFileSync(filePath, `${body.join("\n")}\n`);
  return filePath;
}

function writeText(filename, text) {
  const filePath = path.join(OUT_DIR, filename);
  writeFileSync(filePath, text);
  return filePath;
}

function writeMarkdownReport(report, classified, dbWideNameScan, searchHygiene) {
  const hideSamples = classified
    .filter((row) => row.subclass === "medical_wound_center" && row.subclass_confidence === "high")
    .slice(0, 10)
    .map((row) => [row.location_id, row.name, row.locality, row.country_code, row.subclass_reason]);
  const reviewSamples = classified
    .filter((row) => row.subclass === "unclear" || (row.subclass === "medical_consumer_ok" && row.subclass_confidence === "medium"))
    .slice(0, 10)
    .map((row) => [row.location_id, row.name, row.subclass, row.subclass_confidence, row.subclass_reason]);
  const dbWideSamples = dbWideNameScan.slice(0, 15).map((row) => [row.location_id, row.name, row.locality, row.country_code, row.sources]);

  const lines = [
    "# Brand Scope Sweep Report",
    "",
    `- Date: 20260711`,
    `- Actor: \`${ACTOR_LABEL}\` / \`${ACTOR_ID}\``,
    `- Step 3 search hygiene status: gated; proposal only, not applied.`,
    "",
    "## Step 1 Hide",
    "",
    `- High-confidence medical wound-center candidates: ${report.step1_hide.high_confidence_medical_wound_center_candidates}`,
    `- Claim/owner skips: ${report.step1_hide.skipped_claim_or_owner_verified}`,
    `- Locations hidden: ${report.step1_hide.hidden_locations_updated}`,
    `- Suppression ledger rows with reason \`off_brand_wound_care\`: ${report.step1_hide.suppression_ledger_reason_count}`,
    `- Entity change events for actor since start: ${report.step1_hide.event_counts.map((row) => `${row.entity_type}/${row.action}: ${row.events}`).join(", ") || "0"}`,
    "",
    markdownTable(["id", "name", "locality", "country", "reason"], hideSamples),
    "",
    "## Step 2 Review Queues",
    "",
    `- Unclear rows: ${report.step2_review.unclear_rows}`,
    `- Medium-confidence consumer_ok rows: ${report.step2_review.medium_consumer_ok_rows}`,
    `- Combined review TSV rows: ${report.step2_review.combined_review_rows}`,
    "- Note: research/flagship institutions such as Sagol/Bumrungrad-style rows are in the review TSV and likely stay unless you approve otherwise.",
    "",
    markdownTable(["id", "name", "subclass", "confidence", "reason"], reviewSamples),
    "",
    "## DB-Wide Wound Name Scan",
    "",
    `- Active locations from any source matching wound-care identity name patterns: ${report.step2_review.db_wide_wound_name_token_active_rows}`,
    "",
    markdownTable(["id", "name", "locality", "country", "sources"], dbWideSamples),
    "",
    "## Search Hygiene Proposal",
    "",
    "- Not applied. Waiting for taxonomy triage re-map confirmation.",
    `- Affected locations: ${searchHygiene.summary.affected_locations}`,
    `- Locations whose indexed text would shrink: ${searchHygiene.summary.locations_whose_indexed_text_would_shrink}`,
    `- Locations with unmapped raw offering text removed: ${searchHygiene.summary.locations_with_unmapped_raw_offering_text_removed}`,
    `- Locations with raw tag text removed: ${searchHygiene.summary.locations_with_raw_tags_removed}`,
    `- Estimated chars removed from indexed location text: ${searchHygiene.summary.total_chars_removed}`,
    `- Estimated chars added from mapped raw names: ${searchHygiene.summary.total_chars_added}`,
    "",
    "## Search Counts",
    "",
    markdownTable(
      ["term", "before", "after_step1"],
      report.before.search_matches.map((beforeRow) => {
        const afterRow = report.after.search_matches.find((item) => item.term === beforeRow.term);
        return [beforeRow.term, beforeRow.matches, afterRow?.matches ?? ""];
      }),
    ),
    "",
    "## Files",
    "",
    ...Object.entries(report.files).map(([name, file]) => `- ${name}: \`${path.relative(ROOT, file)}\``),
    "",
  ];
  writeFileSync(DOC_PATH, `${lines.join("\n")}\n`);
}

function evidenceText(resultJson) {
  const evidence = resultJson?.evidence || [];
  return Array.isArray(evidence) ? evidence.join(" | ") : JSON.stringify(evidence || "");
}

function tsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
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
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquoteEnvValue(match[2].trim());
  }
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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
