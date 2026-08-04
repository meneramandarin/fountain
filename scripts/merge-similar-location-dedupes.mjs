#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { closePool, getPool, query } from "../pipeline/lib/db.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REPORT_PATH = path.join(ROOT, "tmp", "location-dedupe-reassessment-20260723.json");
const PLAN_PATH = path.join(ROOT, "tmp", "location-similar-name-merge-plan-20260723.json");
const ACTOR_ID = "0c49c859-915e-4bb2-983d-f4f5f91842f7";
const REASON = "Reviewer-approved similar-name/GPS duplicate consolidation 2026-07-23";
const APPLY = process.argv.includes("--apply");
const FOLLOW_UP = process.argv.includes("--follow-up");
const EXCLUDED_DISTINCT_GROUPS = new Map([
  ["1635,1636", "Distinct sister clinics for men's versus women's health at a shared address"],
  ["1808,1975", "Distinct GIOSTAR Playa del Carmen versus Los Algodones branches; source data copied the Playa address"],
  ["2539,2553", "Distinct Healthy Longevity Clinic Boca Raton versus Prague protected source listings"],
]);
const CANONICAL_OVERRIDES = new Map([
  [2214, {
    address: "4F–5F, K Square Building, 10 Gangnam-daero 94-gil, Gangnam-gu, Seoul, South Korea",
    locality: "Gangnam-gu",
    region: "Seoul",
    country_code: "KR",
    country_name: "South Korea",
  }],
  [4522, {
    address: "65 Margaret Street, Fitzrovia, London",
    locality: "London",
    country_code: "GB",
    country_name: "United Kingdom",
  }],
  [9040, {
    address: "8305 Sunset Boulevard, West Hollywood, CA 90069",
    locality: "West Hollywood",
    region: "CA",
    postal_code: "90069",
    country_code: "US",
    country_name: "United States",
    website: "https://www.remedyplace.com/clubs/weho",
  }],
]);

try {
  const candidateReport = JSON.parse(await readFile(REPORT_PATH, "utf8"));
  const eligiblePairs = candidateReport.candidates.filter(isEligiblePair);
  const allGroups = connectedGroups(eligiblePairs);
  const excludedGroups = allGroups
    .filter((ids) => EXCLUDED_DISTINCT_GROUPS.has(ids.join(",")))
    .map((ids) => ({ location_ids: ids, reason: EXCLUDED_DISTINCT_GROUPS.get(ids.join(",")) }));
  const groups = allGroups.filter((ids) => !EXCLUDED_DISTINCT_GROUPS.has(ids.join(",")));
  const locationIds = groups.flat();
  const locations = await loadLocations(locationIds);
  const byId = new Map(locations.map((location) => [location.id, location]));
  const plans = groups.map((ids) => buildGroupPlan(ids.map((id) => required(byId, id))));
  const preflight = await loadPreflight(plans);
  const planDocument = {
    generated_at: new Date().toISOString(),
    source_report: REPORT_PATH,
    criteria: {
      tiers: ["critical", "high"],
      maximum_distance_meters: 100,
      minimum_raw_name_similarity: 0.6,
      identity_requirement: "exact/strong address similarity or shared external place ID",
    },
    counts: {
      eligible_pairs: eligiblePairs.length,
      groups: plans.length,
      affected_locations: locationIds.length,
      merges: plans.reduce((sum, plan) => sum + plan.loser_ids.length, 0),
      excluded_distinct_groups: excludedGroups.length,
    },
    excluded_distinct_groups: excludedGroups,
    preflight,
    groups: plans,
  };
  await mkdir(path.dirname(PLAN_PATH), { recursive: true });
  await writeFile(PLAN_PATH, `${JSON.stringify(planDocument, null, 2)}\n`, "utf8");

  if (!APPLY) {
    console.log(JSON.stringify({
      apply: false,
      ...planDocument.counts,
      protected_source_conflicts: preflight.protected_source_conflicts.length,
      slug_alias_conflicts: preflight.slug_alias_conflicts.length,
      plan: PLAN_PATH,
    }, null, 2));
  } else {
    assertSafePreflight(planDocument);
    const outcome = await applyPlans(plans);
    const verification = await verifyPlans(plans);
    console.log(JSON.stringify({
      apply: true,
      ...planDocument.counts,
      ...outcome,
      verification,
      plan: PLAN_PATH,
    }, null, 2));
  }
} finally {
  await closePool();
}

function isEligiblePair(pair) {
  return ["critical", "high"].includes(pair.tier)
    && pair.distance_meters <= 100
    && pair.signals.raw_name_similarity >= 0.6
    && (
      pair.signals.exact_address
      || pair.signals.address_similarity >= 0.55
      || pair.signals.shared_external_place
    );
}

function connectedGroups(pairs) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
    return parent.get(id);
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  for (const pair of pairs) union(pair.left.id, pair.right.id);
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()]
    .map((ids) => ids.sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

async function loadLocations(ids) {
  const result = await query(`
    SELECT
      location.*,
      organization.canonical_name AS organization_name,
      (SELECT count(*)::integer FROM fountain.offerings offering WHERE offering.location_id = location.id) AS offering_count,
      (SELECT count(*)::integer FROM fountain.reviews review WHERE review.location_id = location.id) AS review_count,
      (SELECT count(*)::integer FROM fountain.images image WHERE image.entity_type = 'location' AND image.entity_id = location.id) AS image_count,
      (SELECT count(*)::integer FROM fountain.source_records source_record WHERE source_record.entity_type = 'location' AND source_record.entity_id = location.id) AS source_count,
      (SELECT count(*)::integer FROM fountain.affiliations affiliation WHERE affiliation.location_id = location.id) AS affiliation_count
    FROM fountain.locations location
    LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
    WHERE location.id = ANY($1::integer[])
      AND location.status = 'active'
      AND location.deleted_at IS NULL
    ORDER BY location.id
  `, [ids]);
  if (result.rowCount !== ids.length) {
    throw new Error(`Expected ${ids.length} active duplicate-cohort locations, found ${result.rowCount}.`);
  }
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    org_id: nullableNumber(row.org_id),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    offering_count: Number(row.offering_count),
    review_count: Number(row.review_count),
    image_count: Number(row.image_count),
    source_count: Number(row.source_count),
    affiliation_count: Number(row.affiliation_count),
  }));
}

function buildGroupPlan(rows) {
  const ranked = [...rows].sort((left, right) => (
    survivorScore(right, rows) - survivorScore(left, rows)
    || right.source_count - left.source_count
    || right.offering_count - left.offering_count
    || left.id - right.id
  ));
  const survivor = ranked[0];
  const losers = ranked.slice(1);
  const geographic = [...ranked].sort((left, right) => (
    geographicScore(right) - geographicScore(left)
  ))[0];
  const canonical = {
    name: survivor.name,
    address: bestValue(ranked, "address", addressScore) || survivor.address,
    locality: geographic.locality || bestValue(ranked, "locality", localityScore) || survivor.locality,
    region: geographic.region || bestValue(ranked, "region", shortPlaceScore) || survivor.region,
    postal_code: bestValue(ranked, "postal_code", (value, row) => postalScore(value, row.country_code)) || survivor.postal_code,
    country_code: geographic.country_code || bestValue(ranked, "country_code", countryCodeScore) || survivor.country_code,
    country_name: geographic.country_name || bestValue(ranked, "country_name", textPresenceScore) || survivor.country_name,
    latitude: survivor.latitude ?? bestValue(rows, "latitude", coordinateScore),
    longitude: survivor.longitude ?? bestValue(rows, "longitude", coordinateScore),
    phone: bestValue(ranked, "phone", phoneScore) || survivor.phone,
    email: bestValue(ranked, "email", emailScore) || survivor.email,
    website: bestValue(ranked, "website", websiteScore) || survivor.website,
    org_id: survivor.org_id ?? bestValue(ranked, "org_id", organizationScore),
  };
  Object.assign(canonical, CANONICAL_OVERRIDES.get(survivor.id) || {});
  return {
    survivor_id: survivor.id,
    loser_ids: losers.map((row) => row.id),
    canonical,
    survivor_score: survivorScore(survivor, rows),
    candidates: ranked.map((row) => ({
      id: row.id,
      score: survivorScore(row, rows),
      slug: row.slug,
      name: row.name,
      address: row.address,
      locality: row.locality,
      website: row.website,
      org_id: row.org_id,
      organization_name: row.organization_name,
      offering_count: row.offering_count,
      review_count: row.review_count,
      image_count: row.image_count,
      source_count: row.source_count,
      affiliation_count: row.affiliation_count,
    })),
  };
}

function survivorScore(row, group) {
  let score = 0;
  score += websiteScore(row.website, row) * 2;
  score += addressScore(row.address, row);
  score += localityScore(row.locality, row);
  score += postalScore(row.postal_code, row.country_code);
  score += row.org_id ? 12 : 0;
  score += Math.min(row.offering_count, 20);
  score += Math.min(row.review_count, 5);
  score += Math.min(row.image_count, 5);
  score += Math.min(row.source_count * 2, 12);
  score += Math.min(row.affiliation_count * 2, 6);
  score += namePlaceConsistency(row, group);
  if (row.verification_status && row.verification_status !== "unverified") score += 5;
  if (row.data_origin === "manual") score += 2;
  return score;
}

function namePlaceConsistency(row, group) {
  const name = normalize(row.name);
  const ownPlace = normalize(`${row.locality || ""} ${row.address || ""}`);
  const places = new Set([
    "brooklyn", "manhattan", "bronx", "queens", "staten island",
    ...group.map((candidate) => normalize(candidate.locality)).filter(Boolean),
  ]);
  let adjustment = 0;
  for (const place of places) {
    if (place && name.includes(place)) adjustment += ownPlace.includes(place) ? 10 : -30;
  }
  return adjustment;
}

async function loadPreflight(plans) {
  const allIds = plans.flatMap((plan) => [plan.survivor_id, ...plan.loser_ids]);
  const groupById = new Map();
  for (const plan of plans) {
    for (const id of [plan.survivor_id, ...plan.loser_ids]) groupById.set(id, plan.survivor_id);
  }
  const sources = await query(`
    SELECT source_record.entity_id, source.slug AS source_slug, source_record.source_listing_id
    FROM fountain.source_records source_record
    JOIN fountain.sources source ON source.id = source_record.source_id
    WHERE source_record.entity_type = 'location'
      AND source_record.entity_id = ANY($1::integer[])
      AND source_record.source_listing_id IS NOT NULL
      AND (
        source.slug LIKE 'chain\\_%' ESCAPE '\\'
        OR source.slug IN ('longevity_technology_clinics', 'hyperbaric_app')
      )
  `, [allIds]);
  const sourceBuckets = new Map();
  for (const row of sources.rows) {
    const group = groupById.get(Number(row.entity_id));
    const key = `${group}:${row.source_slug}`;
    if (!sourceBuckets.has(key)) sourceBuckets.set(key, new Set());
    sourceBuckets.get(key).add(row.source_listing_id);
  }
  const protectedSourceConflicts = [...sourceBuckets.entries()]
    .filter(([, listingIds]) => listingIds.size > 1)
    .map(([key, listingIds]) => {
      const [survivorId, sourceSlug] = key.split(":");
      return { survivor_id: Number(survivorId), source_slug: sourceSlug, source_listing_ids: [...listingIds] };
    });

  const loserSlugs = plans.flatMap((plan) => plan.candidates
    .filter((candidate) => plan.loser_ids.includes(candidate.id))
    .map((candidate) => ({ slug: candidate.slug, survivor_id: plan.survivor_id })));
  const aliases = await query(`
    SELECT slug, location_id
    FROM fountain.location_slug_aliases
    WHERE slug = ANY($1::text[])
  `, [loserSlugs.map((row) => row.slug)]);
  const expectedBySlug = new Map(loserSlugs.map((row) => [row.slug, row.survivor_id]));
  const slugAliasConflicts = aliases.rows
    .filter((row) => Number(row.location_id) !== expectedBySlug.get(row.slug))
    .map((row) => ({
      slug: row.slug,
      existing_location_id: Number(row.location_id),
      proposed_location_id: expectedBySlug.get(row.slug),
    }));
  return {
    protected_source_conflicts: protectedSourceConflicts,
    slug_alias_conflicts: slugAliasConflicts,
  };
}

function assertSafePreflight(document) {
  if (FOLLOW_UP) {
    if (
      document.counts.eligible_pairs !== 4
      || document.counts.groups !== 1
      || document.counts.merges !== 1
      || document.counts.excluded_distinct_groups !== 3
    ) {
      throw new Error(
        `Expected the post-merge Cheongdam follow-up plus 3 exclusions; got ${document.counts.eligible_pairs} pairs, ${document.counts.groups} groups, ${document.counts.merges} merges, and ${document.counts.excluded_distinct_groups} exclusions.`,
      );
    }
  } else {
  if (document.counts.eligible_pairs !== 56) {
    throw new Error(`Expected 56 eligible pair edges, got ${document.counts.eligible_pairs}.`);
  }
  if (
    document.counts.groups !== 51
    || document.counts.merges !== 52
    || document.counts.excluded_distinct_groups !== 3
  ) {
    throw new Error(
      `Expected 51 merge groups, 52 merges, and 3 distinct-group exclusions; got ${document.counts.groups}, ${document.counts.merges}, and ${document.counts.excluded_distinct_groups}.`,
    );
  }
  }
  if (document.preflight.protected_source_conflicts.length) {
    throw new Error(`Protected distinct-branch source conflicts remain: ${JSON.stringify(document.preflight.protected_source_conflicts)}`);
  }
  if (document.preflight.slug_alias_conflicts.length) {
    throw new Error(`Slug alias conflicts remain: ${JSON.stringify(document.preflight.slug_alias_conflicts)}`);
  }
}

async function applyPlans(plans) {
  const pool = getPool();
  const client = await pool.connect();
  const allIds = plans.flatMap((plan) => [plan.survivor_id, ...plan.loser_ids]);
  let deletedReviews = 0;
  let repointedOfferingBackups = 0;
  let deletedDuplicateOfferingBackups = 0;
  try {
    await client.query("BEGIN");
    await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, REASON]);
    await createBackups(client, allIds, plans);
    for (const plan of plans) {
      const ids = [plan.survivor_id, ...plan.loser_ids];
      const locked = await client.query(`
        SELECT id FROM fountain.locations
        WHERE id = ANY($1::integer[])
          AND status = 'active'
          AND deleted_at IS NULL
        ORDER BY id
        FOR UPDATE
      `, [ids]);
      if (locked.rowCount !== ids.length) {
        throw new Error(`Merge group ${ids.join(",")} changed after planning.`);
      }
      await client.query(`
        UPDATE fountain.locations
        SET name = $2,
            address = $3,
            locality = $4,
            region = $5,
            postal_code = $6,
            country_code = $7,
            country_name = $8,
            latitude = $9,
            longitude = $10,
            phone = $11,
            email = $12,
            website = $13,
            org_id = $14,
            data_origin = 'manual'
        WHERE id = $1
      `, [
        plan.survivor_id,
        plan.canonical.name,
        plan.canonical.address,
        plan.canonical.locality,
        plan.canonical.region,
        plan.canonical.postal_code,
        plan.canonical.country_code,
        plan.canonical.country_name,
        plan.canonical.latitude,
        plan.canonical.longitude,
        plan.canonical.phone,
        plan.canonical.email,
        plan.canonical.website,
        plan.canonical.org_id,
      ]);
      for (const loserId of plan.loser_ids) {
        const loser = plan.candidates.find((candidate) => candidate.id === loserId);
        await client.query(`
          INSERT INTO fountain.location_slug_aliases(slug, location_id, reason)
          VALUES ($1, $2, $3)
          ON CONFLICT (slug) DO UPDATE
          SET location_id = EXCLUDED.location_id,
              reason = EXCLUDED.reason
        `, [loser.slug, plan.survivor_id, REASON]);
        const deduped = await client.query(`
          DELETE FROM fountain.reviews duplicate_review
          WHERE duplicate_review.location_id = $2
            AND EXISTS (
              SELECT 1
              FROM fountain.reviews retained_review
              WHERE retained_review.location_id = $1
                AND retained_review.provider IS NOT DISTINCT FROM duplicate_review.provider
                AND retained_review.provider_place_id IS NOT DISTINCT FROM duplicate_review.provider_place_id
                AND retained_review.author IS NOT DISTINCT FROM duplicate_review.author
                AND retained_review.rating IS NOT DISTINCT FROM duplicate_review.rating
                AND retained_review.review_date IS NOT DISTINCT FROM duplicate_review.review_date
                AND retained_review.text IS NOT DISTINCT FROM duplicate_review.text
            )
        `, [plan.survivor_id, loserId]);
        deletedReviews += deduped.rowCount;
        const duplicateOfferingBackups = await client.query(`
          WITH duplicate_offerings AS (
            SELECT DISTINCT ON (loser_offering.id)
              loser_offering.id AS loser_offering_id,
              winner_offering.id AS winner_offering_id
            FROM fountain.offerings loser_offering
            JOIN fountain.offerings winner_offering
              ON winner_offering.location_id = $1
             AND winner_offering.source_id IS NOT DISTINCT FROM loser_offering.source_id
             AND COALESCE(winner_offering.raw_name, '') = COALESCE(loser_offering.raw_name, '')
            WHERE loser_offering.location_id = $2
            ORDER BY loser_offering.id, winner_offering.id
          )
          DELETE FROM fountain_raw.treatment_mapping_offering_backup loser_backup
          USING duplicate_offerings duplicate
          WHERE loser_backup.offering_id = duplicate.loser_offering_id
            AND EXISTS (
              SELECT 1
              FROM fountain_raw.treatment_mapping_offering_backup winner_backup
              WHERE winner_backup.review_id = loser_backup.review_id
                AND winner_backup.offering_id = duplicate.winner_offering_id
            )
        `, [plan.survivor_id, loserId]);
        deletedDuplicateOfferingBackups += duplicateOfferingBackups.rowCount;
        const repointed = await client.query(`
          WITH duplicate_offerings AS (
            SELECT DISTINCT ON (loser_offering.id)
              loser_offering.id AS loser_offering_id,
              winner_offering.id AS winner_offering_id
            FROM fountain.offerings loser_offering
            JOIN fountain.offerings winner_offering
              ON winner_offering.location_id = $1
             AND winner_offering.source_id IS NOT DISTINCT FROM loser_offering.source_id
             AND COALESCE(winner_offering.raw_name, '') = COALESCE(loser_offering.raw_name, '')
            WHERE loser_offering.location_id = $2
            ORDER BY loser_offering.id, winner_offering.id
          )
          UPDATE fountain_raw.treatment_mapping_offering_backup backup
          SET offering_id = duplicate.winner_offering_id
          FROM duplicate_offerings duplicate
          WHERE backup.offering_id = duplicate.loser_offering_id
        `, [plan.survivor_id, loserId]);
        repointedOfferingBackups += repointed.rowCount;
        await client.query(
          "SELECT fountain.merge_locations($1, $2, $3::uuid, $4)",
          [plan.survivor_id, loserId, ACTOR_ID, REASON],
        );
      }
      // An address correction can cause the stale-coordinate trigger to clear
      // unchanged coordinates. Reapply the reviewed pair after all merges.
      await client.query(`
        UPDATE fountain.locations
        SET latitude = $2,
            longitude = $3
        WHERE id = $1
      `, [
        plan.survivor_id,
        plan.canonical.latitude,
        plan.canonical.longitude,
      ]);
    }
    await client.query("SELECT fountain.refresh_city_index()");
    await client.query("COMMIT");
    return {
      merged_locations: plans.reduce((sum, plan) => sum + plan.loser_ids.length, 0),
      deleted_duplicate_reviews: deletedReviews,
      repointed_treatment_mapping_offering_backups: repointedOfferingBackups,
      deleted_duplicate_treatment_mapping_offering_backups: deletedDuplicateOfferingBackups,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createBackups(client, ids, plans) {
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS fountain_raw;
    CREATE TABLE IF NOT EXISTS fountain_raw.similar_name_location_dedupe_plan_20260723 (
      survivor_id integer PRIMARY KEY,
      loser_ids integer[] NOT NULL,
      plan jsonb NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  for (const plan of plans) {
    await client.query(`
      INSERT INTO fountain_raw.similar_name_location_dedupe_plan_20260723(survivor_id, loser_ids, plan)
      VALUES ($1, $2::integer[], $3::jsonb)
      ON CONFLICT (survivor_id) DO UPDATE
      SET loser_ids = EXCLUDED.loser_ids,
          plan = EXCLUDED.plan,
          recorded_at = now()
    `, [plan.survivor_id, plan.loser_ids, JSON.stringify(plan)]);
  }
  const backupSpecs = [
    ["locations", "id = ANY($1::integer[])"],
    ["offerings", "location_id = ANY($1::integer[])"],
    ["reviews", "location_id = ANY($1::integer[])"],
    ["affiliations", "location_id = ANY($1::integer[])"],
    ["clinic_claims", "location_id = ANY($1::integer[])"],
    ["external_place_matches", "location_id = ANY($1::integer[])"],
    ["source_records", "entity_type = 'location' AND entity_id = ANY($1::integer[])"],
    ["images", "entity_type = 'location' AND entity_id = ANY($1::integer[])"],
    ["entity_tags", "entity_type = 'location' AND entity_id = ANY($1::integer[])"],
    ["location_slug_aliases", "location_id = ANY($1::integer[])"],
  ];
  for (const [table, where] of backupSpecs) {
    const backup = `similar_name_location_dedupe_${table}_backup_20260723`;
    await client.query(`CREATE TABLE IF NOT EXISTS fountain_raw.${backup} AS SELECT * FROM fountain.${table} WHERE false`);
    await client.query(`INSERT INTO fountain_raw.${backup} SELECT * FROM fountain.${table} WHERE ${where}`, [ids]);
  }
  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.similar_name_location_dedupe_listing_submissions_backup_20260723
    AS SELECT * FROM fountain.listing_submissions WHERE false
  `);
  await client.query(`
    INSERT INTO fountain_raw.similar_name_location_dedupe_listing_submissions_backup_20260723
    SELECT * FROM fountain.listing_submissions
    WHERE target_entity_type = 'location' AND target_entity_id = ANY($1::integer[])
  `, [ids]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.similar_name_location_dedupe_treatment_mapping_offering_backup_20260723
    AS SELECT mapping_backup.*
    FROM fountain_raw.treatment_mapping_offering_backup mapping_backup
    WHERE false
  `);
  await client.query(`
    INSERT INTO fountain_raw.similar_name_location_dedupe_treatment_mapping_offering_backup_20260723
    SELECT mapping_backup.*
    FROM fountain_raw.treatment_mapping_offering_backup mapping_backup
    JOIN fountain.offerings offering ON offering.id = mapping_backup.offering_id
    WHERE offering.location_id = ANY($1::integer[])
  `, [ids]);
}

async function verifyPlans(plans) {
  const survivorIds = plans.map((plan) => plan.survivor_id);
  const loserIds = plans.flatMap((plan) => plan.loser_ids);
  const result = await query(`
    SELECT
      (SELECT count(*)::integer FROM fountain.locations WHERE id = ANY($1::integer[])) AS survivors_present,
      (SELECT count(*)::integer FROM fountain.locations WHERE id = ANY($2::integer[])) AS losers_present,
      (SELECT count(*)::integer FROM fountain.location_slug_aliases alias
       JOIN fountain_raw.similar_name_location_dedupe_locations_backup_20260723 loser ON loser.slug = alias.slug
       WHERE loser.id = ANY($2::integer[]) AND alias.location_id = ANY($1::integer[])) AS loser_aliases,
      (SELECT count(*)::integer FROM fountain.entity_change_events
       WHERE actor_id = $3::uuid AND action = 'merge_locations') AS merge_events
  `, [survivorIds, loserIds, ACTOR_ID]);
  return result.rows[0];
}

function bestValue(rows, field, scorer) {
  return [...rows]
    .filter((row) => row[field] != null && String(row[field]).trim() !== "")
    .sort((left, right) => scorer(right[field], right) - scorer(left[field], left))
    .map((row) => row[field])[0] ?? null;
}

function websiteScore(value) {
  if (!value) return -100;
  let url;
  try {
    url = new URL(value);
  } catch {
    return -80;
  }
  const host = url.hostname.toLowerCase();
  if (host.includes("gofundme.com")) return -100;
  if (["facebook.com", "instagram.com", "linktr.ee", "whatsapp.com"].some((domain) => host.includes(domain))) return -25;
  let score = 20;
  if (url.protocol === "https:") score += 3;
  if (/contact|location|clinic|center|centre|health|medical|wellness|spa/u.test(host + url.pathname)) score += 2;
  return score;
}

function addressScore(value) {
  const text = String(value || "").trim();
  if (!text) return -100;
  if (/all rights reserved|mon\s*-\s*thu|opening hours|\b9 am\b|phone:/iu.test(text)) return -80;
  let score = 10;
  if (/\d/u.test(text)) score += 5;
  if (text.length >= 12 && text.length <= 180) score += 5;
  if (text.length > 260) score -= 10;
  return score;
}

function localityScore(value, row) {
  const text = String(value || "").trim();
  if (!text) return -50;
  if (text.length > 40 || /\b(st|street|road|rd|ave|avenue|blvd|highway|hwy)\b/iu.test(text)) return -20;
  if (!row?.address) return 10;
  return normalize(row.address).includes(normalize(text)) ? 25 : -20;
}

function geographicScore(row) {
  let score = addressScore(row.address, row);
  const address = normalize(row.address);
  const locality = normalize(row.locality);
  const countryName = normalize(row.country_name);
  if (locality && address.includes(locality)) score += 30;
  else if (locality) score -= 10;
  if (countryName && address.includes(countryName)) score += 10;
  if (row.postal_code && address.includes(normalize(row.postal_code))) score += 8;
  return score;
}

function shortPlaceScore(value) {
  const text = String(value || "").trim();
  return text && text.length <= 40 ? 8 : -10;
}

function postalScore(value, countryCode) {
  const text = String(value || "").trim();
  if (!text) return -30;
  if (countryCode === "US" && /^\d{5}(?:-\d{4})?$/u.test(text)) return 15;
  if (countryCode === "US" && /^\d{4}$/u.test(text)) return 5;
  return text.length <= 12 ? 10 : -10;
}

function countryCodeScore(value) {
  return /^[A-Z]{2}$/u.test(String(value || "")) ? 10 : -10;
}

function textPresenceScore(value) {
  return String(value || "").trim() ? 5 : -5;
}

function coordinateScore(value) {
  return Number.isFinite(Number(value)) ? 5 : -10;
}

function phoneScore(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? 8 : -10;
}

function emailScore(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(value || "")) ? 8 : -10;
}

function organizationScore(value) {
  return Number.isInteger(Number(value)) ? 10 : -10;
}

function required(map, id) {
  const value = map.get(id);
  if (!value) throw new Error(`Missing location ${id}.`);
  return value;
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
