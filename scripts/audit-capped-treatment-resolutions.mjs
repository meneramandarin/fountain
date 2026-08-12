#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { closePool, query } from "../pipeline/lib/db.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const inputPath = path.resolve(process.argv[2] || path.join(ROOT, "tmp/capped-treatment-resolutions.jsonl"));
const outputPath = path.resolve(process.argv[3] || path.join(ROOT, "tmp/capped-treatment-resolutions-audited.jsonl"));
const reportPath = path.resolve(process.argv[4] || path.join(ROOT, "tmp/capped-treatment-audit.json"));
const familyPath = path.join(ROOT, "config/conservative-treatment-families.json");

const [rows, existingResult, proposedFamilies, infusionTermResult, injectionMenuTermResult] = await Promise.all([
  readJsonLines(inputPath),
  query(`SELECT id, canonical_name, category FROM fountain.treatments ORDER BY id`),
  readFile(familyPath, "utf8").then(JSON.parse),
  query(`
    SELECT fountain_raw.normalize_treatment_term(offering.raw_name) AS term_normalized
    FROM fountain.offerings offering
    JOIN fountain.locations location ON location.id = offering.location_id
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
      AND offering.treatment_id IS NULL
    GROUP BY fountain_raw.normalize_treatment_term(offering.raw_name)
    HAVING bool_and(
      location.name ILIKE '%infusion%'
      OR coalesce(offering.source_offer_url, '') ILIKE '%infusion%'
    )
  `),
  query(`
    SELECT fountain_raw.normalize_treatment_term(offering.raw_name) AS term_normalized
    FROM fountain.offerings offering
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
      AND offering.treatment_id IS NULL
    GROUP BY fountain_raw.normalize_treatment_term(offering.raw_name)
    HAVING bool_and(coalesce(offering.description, '') ILIKE '%injections menu%')
  `),
]);

const existing = existingResult.rows.map((row) => ({
  id: Number(row.id),
  name: String(row.canonical_name),
  category: String(row.category),
  kind: "existing",
}));
const proposed = proposedFamilies.map((row) => ({
  id: null,
  name: String(row.name),
  category: String(row.category),
  kind: "new",
}));
const vocabulary = [...existing, ...proposed];
const byName = new Map(vocabulary.map((row) => [normalize(row.name), row]));
const byId = new Map(existing.map((row) => [row.id, row]));
const infusionTerms = new Set(infusionTermResult.rows.map((row) => String(row.term_normalized)));
const injectionMenuTerms = new Set(injectionMenuTermResult.rows.map((row) => String(row.term_normalized)));

if (vocabulary.length > 300) throw new Error(`Vocabulary exceeds 300: ${vocabulary.length}`);

const overrideCounts = new Map();
const audited = rows.map((row) => applyRules(row));
validateRows(audited);

const targetCounts = new Map();
const categoryCounts = new Map();
const kindCounts = new Map();
const lowConfidence = [];
const usedNew = new Set();
let occurrences = 0;
for (const row of audited) {
  const target = row.treatment_name || row.new_treatment_name || "Non-service";
  targetCounts.set(target, (targetCounts.get(target) || 0) + Number(row.occurrence_count || 0));
  categoryCounts.set(row.category || "Out of scope", (categoryCounts.get(row.category || "Out of scope") || 0) + 1);
  kindCounts.set(row.kind, (kindCounts.get(row.kind) || 0) + 1);
  occurrences += Number(row.occurrence_count || 0);
  if (row.kind === "new") usedNew.add(normalize(row.new_treatment_name));
  if (Number(row.confidence) < 0.7) lowConfidence.push({
    term: row.english_name,
    target,
    confidence: Number(row.confidence),
    occurrences: Number(row.occurrence_count || 0),
  });
}

const report = {
  generated_at: new Date().toISOString(),
  input: path.relative(ROOT, inputPath),
  output: path.relative(ROOT, outputPath),
  resolved_terms: audited.length,
  resolved_occurrences: occurrences,
  existing_treatments: existing.length,
  approved_new_families: proposed.length,
  used_new_families: usedNew.size,
  resulting_total_treatments: existing.length + usedNew.size,
  hard_maximum_if_every_family_is_used: vocabulary.length,
  counts_by_kind: Object.fromEntries([...kindCounts].sort()),
  counts_by_category: Object.fromEntries([...categoryCounts].sort()),
  deterministic_overrides: Object.fromEntries([...overrideCounts].sort()),
  most_used_targets: [...targetCounts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([target, count]) => ({ target, occurrences: count })),
  low_confidence_count: lowConfidence.length,
  low_confidence_high_impact: lowConfidence
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 500),
};

await writeFile(outputPath, audited.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
await closePool();

function applyRules(row) {
  const label = normalizeForRules(row.english_name || row.original_name);

  if (/(^| )(membership|memberships|subscription)( |$)|\bclub (buy out|buyout)\b|\bbuy out\b/.test(label)) {
    return nonService(row, "membership_or_buyout");
  }
  if (/\b(gift card|gift certificate|financing|cancellation fee|late fee|no show fee|facility rental|room rental)\b/.test(label)) {
    return nonService(row, "commerce_or_fee");
  }
  if (/\b(onboarding|goal planning)\b/.test(label)) {
    return nonService(row, "administrative_onboarding");
  }
  if (/\bathletic recovery blends?\b/.test(label)) {
    return nonService(row, "retail_recovery_blend");
  }
  if (/\b(day|week|monthly|annual|single) pass\b/.test(label)) {
    return nonService(row, "access_pass");
  }
  if (/\b(wellness spa|wellness center|health spa)\b/.test(label)) {
    return nonService(row, "facility_label");
  }
  if (/\b(dental|dentistry|orthodontic|teeth cleaning)\b/.test(label)) {
    return nonService(row, "dental_out_of_scope");
  }
  if (/\b(pet|pets|veterinary|veterinarian|animal clinic)\b/.test(label)
      && !/\b(pet scan|pet scans|pet ct|pet imaging|positron emission)\b/.test(label)) {
    return nonService(row, "animal_care_out_of_scope");
  }
  if (/\b(class iv|class 4) laser\b/.test(label)) {
    return treatment(row, findExisting("Cold Laser Therapy"), "class_iv_laser");
  }
  if (/\b(mri|magnetic resonance imaging)\b/.test(label)) {
    return treatment(row, findExisting("MRI"), "mri");
  }
  if (/\b(ct scan|computed tomography|cat scan)\b/.test(label) && !/\bpet\b/.test(label)) {
    return treatment(row, findExisting("CT"), "ct");
  }
  if (/\b(hyperbaric|hbot)\b/.test(label) && !/\b(training|course|certification|facility|center)\b/.test(label)) {
    return treatment(row, findExisting("Hyperbaric oxygen therapy"), "hbot");
  }
  if (infusionTerms.has(row.term_normalized)) {
    return treatment(row, findExisting("IV Infusions"), "infusion_provider_catalog");
  }
  if (injectionMenuTerms.has(row.term_normalized)) {
    return treatment(row, findExisting("Supplementation"), "supplement_injection_catalog");
  }
  if (/\b(iv|intravenous|drips?|infusions?)\b/.test(label)
      && !/\b(iv sedation|contrast|training|course|certification|pharmacy|infusion center|infusion suite)\b/.test(label)) {
    return treatment(row, findExisting("IV Infusions"), "iv_infusion");
  }
  if (/\b(b12|vitamin b12)\b.*\b(injections?|shots?)\b|\b(injections?|shots?)\b.*\b(b12|vitamin b12)\b/.test(label)) {
    return treatment(row, findExisting("B12 Injections"), "b12_injection");
  }
  if (/\b(vitamin|glutathione|coq10|magnesium|zinc|biotin)\b.*\b(injections?|shots?)\b|\b(injections?|shots?)\b.*\b(vitamin|glutathione|coq10|magnesium|zinc|biotin)\b/.test(label)) {
    return treatment(row, findExisting("Supplementation"), "supplement_injection");
  }
  if (/\bglutathione\b/.test(label)) {
    return treatment(row, findExisting("Supplementation"), "glutathione_supplementation");
  }
  if (/\b(finasteride|minoxidil)\b/.test(label)) {
    return treatment(row, findExisting("Hair restoration"), "hair_medication");
  }
  if (/\b(phentermine)\b/.test(label)) {
    return treatment(row, findExisting("Medical weight loss"), "weight_loss_medication");
  }
  if (/\b(recovery blend|bpc 157|tb 500|kpv|ghk cu)\b/.test(label)) {
    return treatment(row, findExisting("Peptide therapy"), "peptide_blend");
  }
  if (/\b(lipotropic|lipo mino|lipo b|skinny shot|o slim shot)\b/.test(label)) {
    return treatment(row, findProposed("Lipotropic injections"), "lipotropic_injection");
  }
  if (/\b(natural labor induction|labor induction|prenatal care|antenatal care)\b/.test(label)) {
    return treatment(row, findExisting("Pregnancy Care"), "pregnancy_care");
  }
  if (/\b(photon sound beam|sound bath|sound healing)\b/.test(label)) {
    return treatment(row, findExisting("Sound Healing"), "sound_healing");
  }
  if (/\bmassage\b/.test(label)) {
    return treatment(row, findExisting("Massage therapy"), "massage");
  }
  if (/\b(physiotherapy|physical therapy|neuromuscular retraining|postural therapy)\b/.test(label)) {
    return treatment(row, findExisting("Physical therapy"), "physical_therapy");
  }
  if (/\b(orthopedic|orthopaedic)\b.*\b(surgery|surgical)\b/.test(label)) {
    return treatment(row, findProposed("Orthopedic surgery"), "orthopedic_surgery");
  }
  if (/\b(imaging services|diagnostic imaging|radiology services)\b/.test(label)) {
    return treatment(row, findProposed("Diagnostic imaging"), "diagnostic_imaging");
  }
  if (/\bfoundational care\b/.test(label)) {
    return treatment(row, findExisting("Functional medicine"), "foundational_functional_care");
  }
  if (/\b(well child|well baby|newborn.*(care|physical|exam)|pediatric wellness)\b/.test(label)) {
    return treatment(row, findExisting("Primary Care Services"), "pediatric_primary_care");
  }
  if (/\b(pet ct|pet scan|positron emission)\b/.test(label)) {
    return treatment(row, findProposed("PET scan"), "pet_scan");
  }
  if (/\bhalotherapy\b/.test(label)) {
    return treatment(row, findProposed("Halotherapy"), "halotherapy");
  }
  if (/\b(cancer care|cancer treatment|oncology|medical oncology)\b/.test(label)) {
    return treatment(row, findProposed("Cancer treatment"), "cancer_treatment");
  }
  if (/\bneurology\b/.test(label) && !/\bneurosurgery\b/.test(label)) {
    return treatment(row, findProposed("Neurological care"), "neurological_care");
  }
  if (/\b(multiple sclerosis|parkinson|myasthenia|neurological care|neurologic care)\b/.test(label)) {
    return treatment(row, findProposed("Neurological care"), "neurological_condition");
  }
  if (/\b(ophthalmology|retina|retinal|macular|cataract|glaucoma|intravitreal|eye disease|eye surgery|lens surgery)\b/.test(label)) {
    return treatment(row, findProposed("Ophthalmology"), "ophthalmology");
  }
  if (/\b(nephrology|kidney care|renal care|kidney disease)\b/.test(label)) {
    return treatment(row, findProposed("Kidney care"), "kidney_care");
  }
  if (/\b(ent|ear nose and throat|otolaryngology|otorhinolaryngology|sinus surgery|sinuplasty)\b/.test(label)) {
    return treatment(row, findProposed("Ear, nose and throat care"), "ent_care");
  }
  if (/\b(depression|anxiety|bipolar|panic disorder|ocd|obsessive compulsive)\b/.test(label)
      && !/\b(iv|infusion|ketamine|tms|transcranial)\b/.test(label)) {
    return treatment(row, findExisting("Psychotherapy"), "mental_health_condition");
  }
  if (/\b(psychiatry|neuropsychology|mood disorder|panic attack|emotional release|mental health)\b/.test(label)
      && !/\b(iv|infusion|ketamine|tms|transcranial)\b/.test(label)) {
    return treatment(row, findExisting("Psychotherapy"), "mental_health_service");
  }
  if (/\b(methadone|suboxone|medication assisted treatment|opioid treatment|addiction service|substance use)\b/.test(label)) {
    return treatment(row, findProposed("Substance use treatment"), "substance_use_treatment");
  }
  if (/\bimmunity and allergy\b|\ballergy care\b/.test(label)) {
    return treatment(row, findProposed("Allergy treatment"), "allergy_treatment");
  }
  if (/\b(yoga|barre|fitness class|exercise class)\b/.test(label)) {
    return treatment(row, findExisting("Exercise programming"), "exercise_class");
  }
  if (/\b(meal planning|ketogenic diet|diet plan|nutrition plan)\b/.test(label)) {
    return treatment(row, findExisting("Personalized nutrition"), "nutrition_plan");
  }
  if (/\b(postpartum|post partum|maternity care|obstetrical care|obstetric care|pre and post natal|pre post natal|breastfeeding care)\b/.test(label)) {
    return treatment(row, findExisting("Pregnancy Care"), "maternal_care");
  }
  if (/\b(abortion|nexplanon|contraceptive implant|birth control implant)\b/.test(label)) {
    return treatment(row, findProposed("Women's health"), "womens_reproductive_care");
  }
  if (/\b(reproductive surgery|vasectomy reversal|mesa|pesa|tesa|tese)\b/.test(label)) {
    return treatment(row, findProposed("Fertility treatment"), "reproductive_care");
  }
  if (/\b(fibromyalgia|joint pain|neck pain|back pain|headache|migraine|arthritis pain|osteoarthritis)\b/.test(label)) {
    return treatment(row, findProposed("Pain management"), "general_pain");
  }
  if (/\b(open wound|wound treatment|wound care)\b/.test(label)) {
    return treatment(row, findProposed("Wound care"), "wound_care");
  }
  if (/\bcar t\b/.test(label)) {
    return treatment(row, findProposed("Cancer treatment"), "car_t_cancer_treatment");
  }
  if (/\bstem cell\b/.test(label)) {
    return treatment(row, findExisting("Stem cell therapy"), "stem_cell_therapy");
  }
  if (/\b(cell therapy|cellular therapy|secretome|placenta implantation)\b/.test(label)) {
    return treatment(row, findProposed("Regenerative medicine"), "regenerative_cell_therapy");
  }
  if (/\b(electrical muscle stimulation|non invasive ems|muscle building.*ems)\b/.test(label)) {
    return treatment(row, findProposed("Electrical muscle stimulation"), "electrical_muscle_stimulation");
  }
  if (/\b(microchanneling|procell therapies)\b/.test(label)) {
    return treatment(row, findExisting("Microneedling"), "microchanneling");
  }
  if (/\b(prx peel|peel treatment|chemical peel)\b/.test(label)) {
    return treatment(row, findExisting("Chemical peel"), "chemical_peel");
  }
  if (/\b(photorefractive keratectomy|prk eye|lasik|corneal surgery)\b/.test(label)) {
    return treatment(row, findProposed("Ophthalmology"), "ophthalmic_surgery");
  }
  if (/\b(sports physical|school physical|pre employment physical)\b/.test(label)) {
    return treatment(row, findProposed("Physical examination"), "physical_exam");
  }
  if (/\b(sleep apnea evaluation|sleep apnea test)\b/.test(label)) {
    return treatment(row, findExisting("Sleep study"), "sleep_apnea_evaluation");
  }
  if (/\b(neuromuscular testing|nerve conduction|electromyography|emg test|eeg test)\b/.test(label)) {
    return treatment(row, findProposed("Neurodiagnostic testing"), "neurodiagnostic_testing");
  }
  if (/\b(spinal screening|postural screening|posture screening)\b/.test(label)) {
    return treatment(row, findProposed("Physical examination"), "postural_screening");
  }
  if (/\b(low velocity low amplitude|spinal adjustment|chiropractic technique)\b/.test(label)) {
    return treatment(row, findExisting("Chiropractic care"), "chiropractic_technique");
  }
  if (/\b(medical care|personalized healthcare|personalized medical)\b/.test(label)) {
    return treatment(row, findExisting("Primary Care Services"), "general_medical_care");
  }
  if (/\b(led therapy|light therapy|photobiomodulation)\b/.test(label) && !/\blaser\b/.test(label)) {
    return treatment(row, findExisting("Red light therapy"), "light_therapy");
  }
  if (/\b(lighter complexion|skin brightening|complexion treatment)\b/.test(label)) {
    return treatment(row, findProposed("Pigmentation treatment"), "pigmentation_treatment");
  }
  if (/\brife\b/.test(label)) {
    return treatment(row, findProposed("Rife frequency therapy"), "rife_frequency");
  }
  if (/\b(female|women|womens|woman|gynecology|gynaecology|ob gyn)\b.*\b(health|checkup|check up|care|exam|consultation|visit)\b/.test(label)) {
    return treatment(row, findProposed("Women's health"), "womens_health");
  }
  if (/\b(viagra|cialis|trimix|erectile dysfunction|male enhancement|p shot)\b/.test(label)) {
    return treatment(row, findProposed("Erectile dysfunction treatment"), "erectile_dysfunction");
  }
  if (/\b(brow|eyebrow|lash|eyelash|manicure|pedicure|nail service|waxing|wax service)\b/.test(label)
      && !/\b(brow lift|lash lift surgery|laser hair removal)\b/.test(label)) {
    return treatment(row, findProposed("Beauty treatment"), "beauty_service");
  }
  if (/\b(angioma|angiomas|mole removal|skin tag removal)\b/.test(label)) {
    return treatment(row, findProposed("Mole removal"), "mole_removal");
  }
  if (/\bfacial\b/.test(label)
      && !/\b(hydrafacial|microneedling|chemical peel|laser|ipl|microcurrent|vampire|prp|dermaplaning)\b/.test(label)) {
    return treatment(row, findExisting("Skin Care"), "generic_facial");
  }
  if (/\bgemstone gua sha\b/.test(label)) {
    return treatment(row, findExisting("Skin Care"), "gemstone_gua_sha");
  }
  return row;
}

function treatment(row, target, rule) {
  increment(rule);
  return {
    ...row,
    kind: target.kind,
    treatment_id: target.kind === "existing" ? target.id : null,
    treatment_name: target.kind === "existing" ? target.name : null,
    new_treatment_name: target.kind === "new" ? target.name : null,
    category: target.category,
    confidence: 1,
    rationale: `Deterministic capped-taxonomy rule: ${rule}.`,
  };
}

function nonService(row, rule) {
  increment(rule);
  return {
    ...row,
    kind: "non_service",
    treatment_id: null,
    treatment_name: null,
    new_treatment_name: null,
    category: null,
    confidence: 1,
    rationale: `Deterministic capped-taxonomy rule: ${rule}.`,
  };
}

function findExisting(name) {
  const target = byName.get(normalize(name));
  if (!target || target.kind !== "existing") throw new Error(`Missing existing treatment: ${name}`);
  return target;
}

function findProposed(name) {
  const target = byName.get(normalize(name));
  if (!target || target.kind !== "new") throw new Error(`Missing proposed treatment: ${name}`);
  return target;
}

function validateRows(resolutions) {
  const seen = new Set();
  for (const row of resolutions) {
    if (!row.term_normalized || seen.has(row.term_normalized)) throw new Error(`Duplicate or empty term: ${row.term_normalized}`);
    seen.add(row.term_normalized);
    if (row.kind === "existing") {
      const treatment = byId.get(Number(row.treatment_id));
      if (!treatment || treatment.name !== row.treatment_name || treatment.category !== row.category) {
        throw new Error(`Invalid existing mapping for ${row.term_normalized}`);
      }
    } else if (row.kind === "new") {
      const treatment = byName.get(normalize(row.new_treatment_name));
      if (!treatment || treatment.kind !== "new" || treatment.category !== row.category) {
        throw new Error(`Invalid proposed mapping for ${row.term_normalized}: ${row.new_treatment_name}`);
      }
    } else if (row.kind !== "non_service") {
      throw new Error(`Invalid kind for ${row.term_normalized}: ${row.kind}`);
    }
  }
}

function increment(rule) {
  overrideCounts.set(rule, (overrideCounts.get(rule) || 0) + 1);
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/gu, " ").trim();
}

function normalizeForRules(value) {
  return ` ${normalize(value)} `;
}

async function readJsonLines(filePath) {
  const text = await readFile(filePath, "utf8");
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}
