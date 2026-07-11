#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.phaseDate || "20260711";
const sourceSlug = `taxonomy_phase4_${phaseDate}`;
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const dryRun = Boolean(options.dryRun);
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `taxonomy-phase4-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/taxonomy-phase4-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);
const approvalReportPath = path.resolve(ROOT, options.approvalReport || "taxonomy-expansion-report-20260710.json");

const backupTreatmentsTable = `taxonomy_phase4_treatments_backup_${phaseDate}`;
const backupAliasesTable = `taxonomy_phase4_treatment_aliases_backup_${phaseDate}`;
const backupOfferingsTable = `taxonomy_phase4_offering_treatment_backup_${phaseDate}`;
const auditTable = `taxonomy_phase4_offering_remap_audit_${phaseDate}`;
const aliasAuditTable = `taxonomy_phase4_alias_remap_audit_${phaseDate}`;
const rejectedTable = `taxonomy_phase4_rejected_terms_${phaseDate}`;

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const db = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await db.connect();
  const approvalReport = JSON.parse(readFileSync(approvalReportPath, "utf8"));
  const before = await loadSummary();
  const existingTreatments = await loadTreatments();
  const desiredTreatments = buildDesiredTreatments(approvalReport);
  const mediumDecisions = buildMediumDecisions(approvalReport);
  const rejectedTerms = buildRejectedTerms();

  let report;
  if (dryRun) {
    const simulatedIds = new Map(existingTreatments.map((row) => [row.canonical_name, Number(row.id)]));
    let nextId = Math.max(...existingTreatments.map((row) => Number(row.id))) + 1;
    for (const treatment of desiredTreatments) {
      if (!simulatedIds.has(treatment.name)) simulatedIds.set(treatment.name, nextId++);
    }
    const aliasPlan = buildAliasPlan(desiredTreatments, mediumDecisions, simulatedIds);
    const offeringPlan = await buildOfferingPlan(aliasPlan, rejectedTerms);
    report = buildReport({
      before,
      after: before,
      desiredTreatments,
      treatmentIds: simulatedIds,
      aliasPlan,
      insertedTreatments: desiredTreatments.filter((row) => !existingTreatments.some((t) => t.canonical_name === row.name)),
      insertedAliases: [],
      remappedAliases: [],
      offeringPlan,
      changedOfferings: offeringPlan.updates,
      affectedLocationIds: unique(offeringPlan.updates.map((row) => row.location_id)),
      rejectedTerms,
      searchRefreshCount: 0,
      mode: "dry-run",
    });
  } else {
    await db.query("BEGIN");
    try {
      await ensureAuditTables();
      await createBackups();
      const insertedTreatments = await upsertTreatments(desiredTreatments);
      const treatmentsAfterInsert = await loadTreatments();
      const treatmentIds = new Map(treatmentsAfterInsert.map((row) => [row.canonical_name, Number(row.id)]));
      const aliasPlan = buildAliasPlan(desiredTreatments, mediumDecisions, treatmentIds);
      const { insertedAliases, remappedAliases } = await applyAliases(aliasPlan);
      const offeringPlan = await buildOfferingPlan(aliasPlan, rejectedTerms);
      await applyRejectedTerms(rejectedTerms);
      await disableOfferingSearchTrigger();
      const changedOfferings = await applyOfferingUpdates(offeringPlan.updates);
      await enableOfferingSearchTrigger();
      const affectedLocationIds = unique(changedOfferings.map((row) => row.location_id));
      const searchRefreshCount = await refreshSearchIndex(affectedLocationIds);
      const after = await loadSummary();
      report = buildReport({
        before,
        after,
        desiredTreatments,
        treatmentIds,
        aliasPlan,
        insertedTreatments,
        insertedAliases,
        remappedAliases,
        offeringPlan,
        changedOfferings,
        affectedLocationIds,
        rejectedTerms,
        searchRefreshCount,
        mode: "live",
      });
      await db.query("COMMIT");
    } catch (error) {
      try {
        await enableOfferingSearchTrigger();
      } catch {
        // Transaction rollback will restore trigger state if this ALTER was in-flight.
      }
      await db.query("ROLLBACK");
      throw error;
    }
  }

  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
  console.log(JSON.stringify({
    mode: report.mode,
    treatments_before: report.before.treatments,
    treatments_after: report.after.treatments,
    active_mapped_before_pct: report.before.active_mapped_pct,
    active_mapped_after_pct: report.after.active_mapped_pct,
    offering_rows_changed: report.offering_rows_changed,
    affected_locations_refreshed: report.search_index.locations_refreshed,
    report_md: path.relative(ROOT, reportMdPath),
    report_json: path.relative(ROOT, reportJsonPath),
  }, null, 2));
} finally {
  await db.end().catch(() => {});
}

async function loadSummary() {
  const result = await db.query(`
    SELECT
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.treatments) AS treatments,
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.treatment_aliases) AS aliases,
      count(*)::integer AS active_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NOT NULL)::integer AS active_mapped_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NULL)::integer AS active_unmapped_offerings,
      round(100.0 * count(*) FILTER (WHERE o.treatment_id IS NOT NULL) / nullif(count(*), 0), 2)::float AS active_mapped_pct
    FROM ${quoteIdent(schema)}.offerings o
    JOIN ${quoteIdent(schema)}.locations l ON l.id = o.location_id
    WHERE o.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND coalesce(o.status, 'active') = 'active'
      AND coalesce(l.status, 'active') = 'active'
  `);
  return result.rows[0];
}

async function loadTreatments() {
  const result = await db.query(`
    SELECT id, canonical_name, description, category
    FROM ${quoteIdent(schema)}.treatments
    ORDER BY id
  `);
  return result.rows;
}

function buildDesiredTreatments(approvalReport) {
  const proposalByName = new Map(approvalReport.phase_3.candidates.map((row) => [row.proposed_canonical_name, row]));
  const names = [
    "Physical therapy",
    "Chiropractic care",
    "Acupuncture",
    "Microneedling",
    "Body contouring",
    "Massage therapy",
    "Laser hair removal",
    "Hair restoration",
    "Skin tightening",
    "Hydrafacial",
    "Ozone therapy",
    "Laser skin resurfacing",
    "Lymphatic drainage",
    "Chemical peel",
    "Colon hydrotherapy",
    "Laser tattoo removal",
  ];
  const descriptions = {
    "Physical therapy": "Rehabilitation and movement therapy provided to restore mobility, function, and recovery.",
    "Chiropractic care": "Manual spine and musculoskeletal care including chiropractic adjustments and related services.",
    Acupuncture: "Needle-based traditional or medical acupuncture services.",
    Microneedling: "Collagen-induction skin treatment, including RF microneedling brands and devices.",
    "Body contouring": "Non-surgical body sculpting, fat reduction, and contouring treatments.",
    "Massage therapy": "Therapeutic, medical, sports, and recovery-focused massage services.",
    "Laser hair removal": "Laser-based hair reduction and removal services.",
    "Hair restoration": "Hair loss, regrowth, and restoration services.",
    "Skin tightening": "Non-surgical skin tightening treatments using energy-based or related modalities.",
    Hydrafacial: "Hydrafacial, hydradermabrasion, and comparable branded facial treatments.",
    "Ozone therapy": "Ozone-based medical or wellness therapies including EBOO and related protocols.",
    "Laser skin resurfacing": "Laser resurfacing and fractional laser skin treatments.",
    "Lymphatic drainage": "Manual or device-assisted lymphatic drainage and lymphatic massage.",
    "Chemical peel": "Chemical peel treatments including branded and customized peel protocols.",
    "Colon hydrotherapy": "Colonic and colon hydrotherapy services.",
    "Laser tattoo removal": "Laser tattoo and pigment-removal services.",
    "Testosterone replacement therapy (TRT)": "Testosterone-specific hormone replacement and optimization therapy.",
    "Menopause hormone therapy (HRT)": "Hormone therapy for menopause, perimenopause, and female hormone replacement.",
    "Medical weight loss": "Clinician-guided weight loss and weight management programs not limited to GLP-1 drugs.",
  };

  const treatments = names.map((name) => {
    const proposal = proposalByName.get(name);
    const aliases = new Set([name, ...(proposal?.top_aliases || [])]);
    if (name === "Microneedling") {
      const rf = proposalByName.get("RF microneedling");
      for (const alias of rf?.top_aliases || []) aliases.add(alias);
      for (const alias of ["rf microneedling", "radiofrequency microneedling", "morpheus8", "morpheus 8", "potenza"]) aliases.add(alias);
    }
    return {
      name,
      category: proposal?.category || categoryForName(name),
      description: descriptions[name],
      aliases: [...aliases],
    };
  });

  treatments.push(
    {
      name: "Testosterone replacement therapy (TRT)",
      category: "Hormone & metabolic",
      description: descriptions["Testosterone replacement therapy (TRT)"],
      aliases: [
        "Testosterone replacement therapy (TRT)",
        "trt",
        "testosterone therapy",
        "testosterone replacement therapy",
        "testosterone replacement therapy trt",
        "testosterone replacement",
        "testosterone optimization",
        "testosterone treatment",
        "testosterone injections",
        "testosterone pellets",
        "low t therapy",
        "low t",
        "male hormone therapy",
      ],
    },
    {
      name: "Menopause hormone therapy (HRT)",
      category: "Hormone & metabolic",
      description: descriptions["Menopause hormone therapy (HRT)"],
      aliases: [
        "Menopause hormone therapy (HRT)",
        "hrt",
        "menopause hormone therapy",
        "hormone therapy for women",
        "female hormone replacement",
        "female hormone replacement therapy",
        "perimenopause treatment",
        "menopause treatment",
        "menopause therapy",
        "women's hormone therapy",
        "womens hormone therapy",
      ],
    },
    {
      name: "Medical weight loss",
      category: "Hormone & metabolic",
      description: descriptions["Medical weight loss"],
      aliases: [
        "Medical weight loss",
        "medical weight loss",
        "weight loss program",
        "weight loss management",
        "weight management",
        "medically supervised weight loss",
        "weight loss consultation",
        "medical weight loss program",
        "medical weight loss programs",
        "weight loss therapy",
        "supervised medical weight loss",
        "medical weight loss injections",
      ],
    },
  );

  return treatments;
}

function categoryForName(name) {
  if (["Physical therapy", "Massage therapy", "Lymphatic drainage"].includes(name)) return "Recovery & performance";
  if (["Chiropractic care", "Acupuncture", "Colon hydrotherapy"].includes(name)) return "Lifestyle & foundational";
  if (["Hair restoration", "Ozone therapy"].includes(name)) return "Regenerative & cellular";
  return "Aesthetic";
}

function buildMediumDecisions(approvalReport) {
  const decisions = [];
  for (const row of approvalReport.phase_2.medium_confidence_review) {
    const normalized = normalizeTerm(row.normalized || row.term);
    if (!normalized || isRejectedNormalized(normalized)) continue;
    if (/weight\s+(loss|management)|medical\s+weight|supervised\s+medical\s+weight|chirothin/.test(normalized)) {
      decisions.push(decision(normalized, "Medical weight loss", "approved_redirect_weight_loss"));
    } else if (/biomarker/.test(normalized)) {
      decisions.push(decision(normalized, "Advanced biomarker panel", "approved_biomarker_family"));
    } else if (/metabolic\s+testing|pnoe\s+metabolic/.test(normalized)) {
      decisions.push(decision(normalized, "Cardiometabolic testing", "approved_metabolic_testing_family"));
    } else if (/facial\s+rejuvenation/.test(normalized)) {
      decisions.push(decision(normalized, "Aesthetic medicine", "approved_facial_rejuvenation_family"));
    } else if (normalized === "infusion services") {
      decisions.push(decision(normalized, "IV nutrient therapy", "approved_infusion_services"));
    } else if (/annual\s+wellness\s+exam|wellness\s+exam/.test(normalized)) {
      decisions.push(decision(normalized, "Executive health checkup", "approved_wellness_exam_family"));
    } else if (/lab|labs|blood\s+(test|testing|work)|diagnostic\s+labs/.test(normalized)) {
      decisions.push(decision(normalized, "Advanced blood panel", "approved_lab_testing_family"));
    } else if (normalized === "injectables" || normalized === "cosmetic injectables") {
      decisions.push(decision(normalized, "Aesthetic medicine", "redirect_ambiguous_injectables"));
    } else if (normalized === "vitamin injectables") {
      decisions.push(decision(normalized, "Vitamin infusion", "redirect_vitamin_injectables"));
    }
  }
  decisions.push(
    decision("injectables", "Aesthetic medicine", "redirect_ambiguous_injectables"),
    decision("cosmetic injectables", "Aesthetic medicine", "redirect_ambiguous_injectables"),
    decision("vitamin injectables", "Vitamin infusion", "redirect_vitamin_injectables"),
  );
  return uniqueBy(decisions, (row) => row.normalized);
}

function decision(normalized, treatmentName, reason) {
  return { normalized, alias_text: titleize(normalized), treatmentName, reason };
}

function buildRejectedTerms() {
  return [
    { normalized: "sports injury rehabilitation", reason: "rejected_hbot_mapping" },
    { normalized: "cardiac rehabilitation", reason: "rejected_cardiac_screening_mapping" },
    { normalized: "supportive injectables", reason: "rejected_ambiguous_injectables" },
    { normalized: "medical abortion non per televisit medications labs imaging additional", reason: "out_of_scope_medical_abortion" },
  ];
}

function buildAliasPlan(desiredTreatments, mediumDecisions, treatmentIds) {
  const rows = [];
  for (const treatment of desiredTreatments) {
    const treatmentId = treatmentIds.get(treatment.name);
    for (const alias of treatment.aliases) {
      rows.push(aliasRow(alias, treatmentId, treatment.name, "phase4_new_treatment_alias"));
    }
  }
  for (const medium of mediumDecisions) {
    const treatmentId = treatmentIds.get(medium.treatmentName);
    rows.push(aliasRow(medium.alias_text, treatmentId, medium.treatmentName, medium.reason, medium.normalized));
  }
  for (const alias of ["hormone replacement therapy", "hormone replacement", "bioidentical hormones", "hormone optimization", "hormone therapy"]) {
    rows.push(aliasRow(alias, treatmentIds.get("Hormone optimization"), "Hormone optimization", "hormone_generic_kept"));
  }
  for (const alias of ["semaglutide", "tirzepatide", "ozempic", "wegovy", "mounjaro", "glp 1", "glp-1", "zepbound", "semaglutide weight loss"]) {
    rows.push(aliasRow(alias, treatmentIds.get("GLP-1 weight management"), "GLP-1 weight management", "glp1_drug_explicit_kept"));
  }
  return uniqueBy(rows.filter((row) => row.treatment_id), (row) => row.alias_normalized);
}

function aliasRow(aliasText, treatmentId, treatmentName, reason, forcedNormalized = null) {
  return {
    treatment_id: Number(treatmentId),
    treatment_name: treatmentName,
    alias_text: aliasText,
    alias_normalized: forcedNormalized || normalizeTerm(aliasText),
    source_slug: sourceSlug,
    reason,
  };
}

async function buildOfferingPlan(aliasPlan, rejectedTerms) {
  const aliasByNormalized = new Map(aliasPlan.map((row) => [row.alias_normalized, row]));
  const treatmentByName = new Map(aliasPlan.map((row) => [row.treatment_name, row.treatment_id]));
  const rejectedByNormalized = new Map(rejectedTerms.map((row) => [row.normalized, row]));
  const result = await db.query(`
    SELECT o.id, o.location_id, o.raw_name, o.treatment_id
    FROM ${quoteIdent(schema)}.offerings o
    JOIN ${quoteIdent(schema)}.locations l ON l.id = o.location_id
    WHERE o.raw_name IS NOT NULL
      AND btrim(o.raw_name) <> ''
      AND o.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND coalesce(o.status, 'active') = 'active'
      AND coalesce(l.status, 'active') = 'active'
    ORDER BY o.id
  `);

  const updates = [];
  for (const offering of result.rows) {
    const normalized = normalizeTerm(offering.raw_name);
    const currentTreatmentId = offering.treatment_id == null ? null : Number(offering.treatment_id);
    const rejected = rejectedByNormalized.get(normalized);
    if (rejected) {
      if (currentTreatmentId !== null) {
        updates.push(updateRow(offering, normalized, null, "rejected_leave_unmapped", rejected.reason));
      }
      continue;
    }

    const exact = aliasByNormalized.get(normalized);
    const rule = exact || ruleBasedAlias(normalized, treatmentByName);
    if (!rule) continue;
    if (currentTreatmentId !== Number(rule.treatment_id)) {
      updates.push(updateRow(offering, normalized, Number(rule.treatment_id), rule.reason || "alias_match", rule.treatment_name));
    }
  }

  return { updates };
}

function ruleBasedAlias(normalized, treatmentByName) {
  const v = ` ${normalized} `;
  const has = (pattern) => pattern.test(v);
  if (isDrugExplicitGlp1(normalized)) return namedRule("GLP-1 weight management", "glp1_drug_explicit_rule", treatmentByName);
  if (has(/\b(weight\s+loss|weight\s+management|medical\s+weight|supervised\s+medical\s+weight|chirothin)\b/)) return namedRule("Medical weight loss", "medical_weight_loss_rule", treatmentByName);
  if (has(/\b(testosterone\s+(therapy|replacement|optimization|treatment|injections?|pellets?)|trt|low\s+t|male\s+hormone)\b/) && !has(/\b(test|testing|lab|labs|panel)\b/)) return namedRule("Testosterone replacement therapy (TRT)", "trt_rule", treatmentByName);
  if (has(/\b(menopause|perimenopause|female\s+hormone|women'?s\s+hormone|womens\s+hormone|hrt)\b/) && !has(/\btestosterone|trt|male\b/)) return namedRule("Menopause hormone therapy (HRT)", "hrt_rule", treatmentByName);
  if (has(/\b(physical\s+therapy|pelvic\s+floor\s+physical|orthopedic\s+physical|sports\s+physical)\b/)) return namedRule("Physical therapy", "proposal_family_rule", treatmentByName);
  if (has(/\b(chiropractic|chiropractor)\b/)) return namedRule("Chiropractic care", "proposal_family_rule", treatmentByName);
  if (has(/\bacupuncture\b/)) return namedRule("Acupuncture", "proposal_family_rule", treatmentByName);
  if (has(/\b(microneedling|micro\s+needling|skinpen|dermapen|rf\s+microneedling|radiofrequency\s+microneedling|morpheus\s*8|potenza|secret\s+rf|sylfirm|vivace)\b/)) return namedRule("Microneedling", "proposal_family_rule", treatmentByName);
  if (has(/\b(body\s+(contouring|sculpting)|coolsculpting|cool\s+sculpting|emsculpt|tru\s*sculpt|vanquish|cryoskin)\b/)) return namedRule("Body contouring", "proposal_family_rule", treatmentByName);
  if (has(/\b(massage\s+therapy|therapeutic\s+massage|deep\s+tissue\s+massage|sports\s+massage|medical\s+massage)\b/)) return namedRule("Massage therapy", "proposal_family_rule", treatmentByName);
  if (has(/\blaser\s+hair\s+removal\b/)) return namedRule("Laser hair removal", "proposal_family_rule", treatmentByName);
  if (has(/\b(hair\s+(restoration|regrowth|loss|rejuvenation)|keravive|keralase)\b/)) return namedRule("Hair restoration", "proposal_family_rule", treatmentByName);
  if (has(/\b(skin\s+tightening|ultherapy|thermage|sofwave)\b/)) return namedRule("Skin tightening", "proposal_family_rule", treatmentByName);
  if (has(/\b(hydrafacial|hydra\s+facial|diamondglow)\b/)) return namedRule("Hydrafacial", "proposal_family_rule", treatmentByName);
  if (has(/\b(ozone\s+therapy|ebo2|eboo|major\s+autohemotherapy)\b/)) return namedRule("Ozone therapy", "proposal_family_rule", treatmentByName);
  if (has(/\b(laser\s+(skin\s+)?resurfacing|co2\s+laser|fractional\s+laser|fraxel|clear\s+brilliant|halo\s+laser)\b/)) return namedRule("Laser skin resurfacing", "proposal_family_rule", treatmentByName);
  if (has(/\blymphatic\s+(drainage|massage)\b/)) return namedRule("Lymphatic drainage", "proposal_family_rule", treatmentByName);
  if (has(/\b(chemical\s+peel|vi\s+peel|perfect\s+derma\s+peel|glycolic\s+peel|tca\s+peel)\b/)) return namedRule("Chemical peel", "proposal_family_rule", treatmentByName);
  if (has(/\b(colon\s+hydrotherapy|colonics?|colonic\s+hydrotherapy)\b/)) return namedRule("Colon hydrotherapy", "proposal_family_rule", treatmentByName);
  if (has(/\blaser\s+tattoo\s+removal\b/)) return namedRule("Laser tattoo removal", "proposal_family_rule", treatmentByName);
  return null;
}

function namedRule(treatmentName, reason, treatmentByName) {
  const treatmentId = treatmentByName.get(treatmentName);
  return treatmentId ? { treatment_id: treatmentId, treatment_name: treatmentName, reason } : null;
}

function isDrugExplicitGlp1(normalized) {
  return /\b(glp\s*1|semaglutide|tirzepatide|ozempic|wegovy|mounjaro|zepbound)\b/.test(normalized);
}

function isRejectedNormalized(normalized) {
  return buildRejectedTerms().some((row) => row.normalized === normalized);
}

function updateRow(offering, normalized, newTreatmentId, reason, targetName) {
  return {
    offering_id: Number(offering.id),
    location_id: Number(offering.location_id),
    raw_name: offering.raw_name,
    normalized,
    old_treatment_id: offering.treatment_id == null ? null : Number(offering.treatment_id),
    new_treatment_id: newTreatmentId,
    reason,
    target_name: targetName,
  };
}

async function ensureAuditTables() {
  await db.query(`
    CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)};
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} (
      offering_id integer PRIMARY KEY,
      location_id integer NOT NULL,
      raw_name text NOT NULL,
      normalized text NOT NULL,
      old_treatment_id integer,
      new_treatment_id integer,
      reason text NOT NULL,
      target_name text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(aliasAuditTable)} (
      alias_id integer,
      alias_normalized text NOT NULL,
      alias_text text,
      old_treatment_id integer,
      new_treatment_id integer NOT NULL,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(rejectedTable)} (
      normalized text PRIMARY KEY,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function createBackups() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(backupTreatmentsTable)} AS
    SELECT * FROM ${quoteIdent(schema)}.treatments;
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(backupAliasesTable)} AS
    SELECT * FROM ${quoteIdent(rawSchema)}.treatment_aliases;
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(backupOfferingsTable)} AS
    SELECT id, treatment_id AS old_treatment_id
    FROM ${quoteIdent(schema)}.offerings;
  `);
}

async function upsertTreatments(desiredTreatments) {
  const inserted = [];
  for (const treatment of desiredTreatments) {
    const result = await db.query(`
      INSERT INTO ${quoteIdent(schema)}.treatments (canonical_name, description, category)
      VALUES ($1, $2, $3)
      ON CONFLICT (canonical_name) DO UPDATE
      SET description = excluded.description,
          category = excluded.category
      RETURNING id, canonical_name, category, xmax = 0 AS inserted
    `, [treatment.name, treatment.description, treatment.category]);
    if (result.rows[0]?.inserted) inserted.push(result.rows[0]);
  }
  return inserted;
}

async function applyAliases(aliasPlan) {
  const remappedAliases = [];
  const insertedAliases = [];
  for (const batch of chunks(aliasPlan, 1000)) {
    const remap = await db.query(`
      WITH desired AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          treatment_id integer,
          alias_text text,
          alias_normalized text,
          reason text
        )
      ), changed AS (
        UPDATE ${quoteIdent(rawSchema)}.treatment_aliases a
        SET treatment_id = desired.treatment_id
        FROM desired
        WHERE a.alias_normalized = desired.alias_normalized
          AND a.treatment_id IS DISTINCT FROM desired.treatment_id
        RETURNING a.id AS alias_id, a.alias_normalized, a.alias_text, desired.treatment_id AS new_treatment_id, desired.reason
      )
      SELECT * FROM changed
    `, [JSON.stringify(batch)]);
    remappedAliases.push(...remap.rows);

    if (remap.rows.length) {
      await db.query(`
        INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(aliasAuditTable)}
          (alias_id, alias_normalized, alias_text, old_treatment_id, new_treatment_id, reason)
        SELECT changed.alias_id, changed.alias_normalized, changed.alias_text, backup.treatment_id, changed.new_treatment_id, changed.reason
        FROM jsonb_to_recordset($1::jsonb) AS changed(
          alias_id integer,
          alias_normalized text,
          alias_text text,
          new_treatment_id integer,
          reason text
        )
        LEFT JOIN ${quoteIdent(rawSchema)}.${quoteIdent(backupAliasesTable)} backup ON backup.id = changed.alias_id
      `, [JSON.stringify(remap.rows)]);
    }

    const insert = await db.query(`
      WITH desired AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          treatment_id integer,
          alias_text text,
          alias_normalized text,
          source_slug text
        )
      )
      INSERT INTO ${quoteIdent(rawSchema)}.treatment_aliases
        (treatment_id, alias_text, alias_normalized, source_slug)
      SELECT treatment_id, alias_text, alias_normalized, source_slug
      FROM desired
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${quoteIdent(rawSchema)}.treatment_aliases existing
        WHERE existing.alias_normalized = desired.alias_normalized
      )
      ON CONFLICT (alias_normalized, source_slug) DO NOTHING
      RETURNING id, treatment_id, alias_text, alias_normalized, source_slug
    `, [JSON.stringify(batch)]);
    insertedAliases.push(...insert.rows);
  }
  return { insertedAliases, remappedAliases };
}

async function applyRejectedTerms(rejectedTerms) {
  await db.query(`
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(rejectedTable)} (normalized, reason)
    SELECT normalized, reason
    FROM jsonb_to_recordset($1::jsonb) AS x(normalized text, reason text)
    ON CONFLICT (normalized) DO UPDATE SET reason = excluded.reason
  `, [JSON.stringify(rejectedTerms)]);
}

async function applyOfferingUpdates(updates) {
  const changed = [];
  for (const batch of chunks(updates, 5000)) {
    await db.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)}
        (offering_id, location_id, raw_name, normalized, old_treatment_id, new_treatment_id, reason, target_name)
      SELECT offering_id, location_id, raw_name, normalized, old_treatment_id, new_treatment_id, reason, target_name
      FROM jsonb_to_recordset($1::jsonb) AS x(
        offering_id integer,
        location_id integer,
        raw_name text,
        normalized text,
        old_treatment_id integer,
        new_treatment_id integer,
        reason text,
        target_name text
      )
      ON CONFLICT (offering_id) DO UPDATE SET
        old_treatment_id = excluded.old_treatment_id,
        new_treatment_id = excluded.new_treatment_id,
        reason = excluded.reason,
        target_name = excluded.target_name
    `, [JSON.stringify(batch)]);

    const result = await db.query(`
      UPDATE ${quoteIdent(schema)}.offerings o
      SET treatment_id = x.new_treatment_id,
          updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS x(offering_id integer, new_treatment_id integer)
      WHERE o.id = x.offering_id
        AND o.treatment_id IS DISTINCT FROM x.new_treatment_id
      RETURNING o.id AS offering_id
    `, [JSON.stringify(batch.map((row) => ({ offering_id: row.offering_id, new_treatment_id: row.new_treatment_id })))]);
    const changedIds = new Set(result.rows.map((row) => Number(row.offering_id)));
    changed.push(...batch.filter((row) => changedIds.has(row.offering_id)));
  }
  return changed;
}

async function disableOfferingSearchTrigger() {
  await db.query(`ALTER TABLE ${quoteIdent(schema)}.offerings DISABLE TRIGGER trg_refresh_offering_search_index`);
}

async function enableOfferingSearchTrigger() {
  await db.query(`ALTER TABLE ${quoteIdent(schema)}.offerings ENABLE TRIGGER trg_refresh_offering_search_index`);
}

async function refreshSearchIndex(locationIds) {
  let count = 0;
  for (const batch of chunks(locationIds, 1000)) {
    if (!batch.length) continue;
    await db.query(
      `SELECT ${quoteIdent(schema)}.refresh_search_index_for_location(location_id) FROM unnest($1::int[]) AS location_id`,
      [batch],
    );
    count += batch.length;
  }
  return count;
}

function buildReport(input) {
  const changed = input.changedOfferings;
  const hormoneSplit = summarizeMovedRows(changed, input.treatmentIds);
  const newTreatmentRows = input.desiredTreatments.map((treatment) => {
    const id = input.treatmentIds.get(treatment.name);
    const rows = changed.filter((row) => row.new_treatment_id === id);
    return {
      id,
      canonical_name: treatment.name,
      category: treatment.category,
      alias_count: input.aliasPlan.filter((row) => row.treatment_id === id).length,
      offering_rows_changed: rows.length,
      distinct_locations_changed: new Set(rows.map((row) => row.location_id)).size,
    };
  });

  return {
    phase_date: phaseDate,
    mode: input.mode,
    backups: input.mode === "live"
      ? [
          `${rawSchema}.${backupTreatmentsTable}`,
          `${rawSchema}.${backupAliasesTable}`,
          `${rawSchema}.${backupOfferingsTable}`,
        ]
      : [],
    audit_tables: input.mode === "live"
      ? [
          `${rawSchema}.${auditTable}`,
          `${rawSchema}.${aliasAuditTable}`,
          `${rawSchema}.${rejectedTable}`,
        ]
      : [],
    before: input.before,
    after: input.after,
    expected_treatment_count: 62,
    treatment_count_ok: Number(input.after.treatments) === 62 || input.mode === "dry-run",
    inserted_treatments: input.insertedTreatments,
    inserted_aliases: input.insertedAliases.length,
    remapped_aliases: input.remappedAliases.length,
    offering_rows_changed: changed.length,
    new_treatments: newTreatmentRows,
    hormone_split: hormoneSplit,
    decisions: summarizeDecisions(changed),
    rejected_terms: input.rejectedTerms,
    search_index: {
      affected_locations: input.affectedLocationIds.length,
      locations_refreshed: input.searchRefreshCount,
    },
    sitemap: {
      treatment_feed: false,
      note: "src/app/sitemap.ts does not enumerate treatments; no sitemap regeneration needed.",
    },
  };
}

function summarizeMovedRows(changed, treatmentIds) {
  const hormoneOptimizationId = treatmentIds.get("Hormone optimization");
  const trtId = treatmentIds.get("Testosterone replacement therapy (TRT)");
  const hrtId = treatmentIds.get("Menopause hormone therapy (HRT)");
  const medicalWeightLossId = treatmentIds.get("Medical weight loss");
  return [
    {
      target: "Testosterone replacement therapy (TRT)",
      rows_moved_from_hormone_optimization: changed.filter((row) => row.old_treatment_id === hormoneOptimizationId && row.new_treatment_id === trtId).length,
      total_rows_changed_to_target: changed.filter((row) => row.new_treatment_id === trtId).length,
    },
    {
      target: "Menopause hormone therapy (HRT)",
      rows_moved_from_hormone_optimization: changed.filter((row) => row.old_treatment_id === hormoneOptimizationId && row.new_treatment_id === hrtId).length,
      total_rows_changed_to_target: changed.filter((row) => row.new_treatment_id === hrtId).length,
    },
    {
      target: "Medical weight loss",
      rows_moved_from_glp1_weight_management: changed.filter((row) => row.old_treatment_id === 25 && row.new_treatment_id === medicalWeightLossId).length,
      total_rows_changed_to_target: changed.filter((row) => row.new_treatment_id === medicalWeightLossId).length,
    },
  ];
}

function summarizeDecisions(changed) {
  const map = new Map();
  for (const row of changed) {
    const key = row.reason;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([reason, rows]) => ({ reason, rows })).sort((a, b) => b.rows - a.rows || a.reason.localeCompare(b.reason));
}

function renderMarkdown(report) {
  return [
    "# Taxonomy Phase 4 Report",
    "",
    `- Date: ${report.phase_date}`,
    `- Mode: ${report.mode}`,
    `- Treatments before/after: ${report.before.treatments} -> ${report.after.treatments}`,
    `- Expected treatment count: ${report.expected_treatment_count}`,
    `- Treatment count OK: ${report.treatment_count_ok}`,
    `- Active mapped offering coverage: ${report.before.active_mapped_pct}% -> ${report.after.active_mapped_pct}%`,
    `- Offering rows changed: ${report.offering_rows_changed}`,
    `- Inserted aliases: ${report.inserted_aliases}`,
    `- Remapped aliases: ${report.remapped_aliases}`,
    `- Search-index locations refreshed: ${report.search_index.locations_refreshed}`,
    "",
    "## Backups",
    "",
    report.backups.length ? report.backups.map((table) => `- \`${table}\``).join("\n") : "- None; dry run.",
    "",
    "## New Treatments",
    "",
    markdownTable(
      ["id", "canonical_name", "category", "aliases", "offering rows changed", "locations changed"],
      report.new_treatments.map((row) => [row.id, row.canonical_name, row.category, row.alias_count, row.offering_rows_changed, row.distinct_locations_changed]),
    ),
    "",
    "## Hormone Split",
    "",
    markdownTable(
      ["target", "rows moved from source", "total rows changed to target"],
      report.hormone_split.map((row) => [
        row.target,
        row.rows_moved_from_hormone_optimization ?? row.rows_moved_from_glp1_weight_management ?? 0,
        row.total_rows_changed_to_target,
      ]),
    ),
    "",
    "## Decision Row Counts",
    "",
    markdownTable(["reason", "rows"], report.decisions.map((row) => [row.reason, row.rows])),
    "",
    "## Rejected Terms",
    "",
    markdownTable(["normalized", "reason"], report.rejected_terms.map((row) => [row.normalized, row.reason])),
    "",
    "## Sitemap",
    "",
    `- Treatment feed present: ${report.sitemap.treatment_feed}`,
    `- ${report.sitemap.note}`,
    "",
  ].join("\n");
}

function markdownTable(headers, rows) {
  if (!rows.length) return "_None._";
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function normalizeTerm(input) {
  let value = String(input || "").toLowerCase();
  value = value
    .replace(/[™®©℠]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/\bglp[-\s]?1\b/g, "glp 1")
    .replace(/\bnad\s*plus\b/g, "nad")
    .replace(/\bnad\+\b/g, "nad")
    .replace(/\bintravenous\b/g, "iv")
    .replace(/\bv\s*o\s*2\b/g, "vo2")
    .replace(/\bconsultation\s+for\b/g, " ")
    .replace(/\bconsult\s+for\b/g, " ")
    .replace(/\b(new\s+patient|initial|introductory|intro|follow\s+up|followup|couples?|members?|membership|special|specials|promo|promotion|package\s+of\s+\d+|package|packages|bundle|virtual|mobile|online)\b/g, " ")
    .replace(/\$[\d,.]+/g, " ")
    .replace(/\b\d+(\.\d+)?\s*(minutes?|mins?|hours?|hrs?|sessions?|visits?|packs?|units?|mg|mcg|g|ml|cc|iu|oz)\b/g, " ")
    .replace(/\b\d+\s*(x|for)\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value
    .replace(/\bnad\s+plus\b/g, "nad")
    .replace(/\bcryo\s+therapy\b/g, "cryotherapy")
    .replace(/\bplatelet\s+rich\s+plasma\b/g, "prp")
    .replace(/\s+/g, " ")
    .trim();
}

function titleize(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.length <= 3 ? part.toUpperCase() : `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${identifier}`);
  }
  return value;
}

function normalizePostgresConnectionString(value) {
  if (!value) return value;
  return value.startsWith("postgres://") ? `postgresql://${value.slice("postgres://".length)}` : value;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      parsed[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = rest.join("=");
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const next = args[index + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        index += 1;
      }
    }
  }
  return parsed;
}
