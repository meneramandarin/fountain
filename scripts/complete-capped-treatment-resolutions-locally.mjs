#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

import { closePool, query } from "../pipeline/lib/db.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const outputPath = path.resolve(process.argv[2] || path.join(ROOT, "tmp/capped-treatment-resolutions.jsonl"));
const priorPath = path.resolve(process.argv[3] || path.join(ROOT, "tmp/treatment-resolution-pass-2.jsonl"));
const familyPath = path.join(ROOT, "config/conservative-treatment-families.json");

const [completed, prior, existingResult, proposedFamilies, termResult] = await Promise.all([
  readJsonLines(outputPath, "term_normalized"),
  readJsonLines(priorPath, "term_normalized"),
  query(`SELECT id, canonical_name, category FROM fountain.treatments ORDER BY id`),
  readFile(familyPath, "utf8").then(JSON.parse),
  query(`
    SELECT
      fountain_raw.normalize_treatment_term(offering.raw_name) AS term_normalized,
      min(offering.raw_name) AS original_name,
      min(coalesce(translation.english_text, offering.raw_name)) AS english_name,
      min(translation.source_language) AS source_language,
      count(*)::integer AS occurrence_count
    FROM fountain.offerings offering
    LEFT JOIN fountain.offering_term_translations translation
      ON translation.source_text = offering.raw_name
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
      AND offering.treatment_id IS NULL
      AND coalesce(fountain_raw.normalize_treatment_term(offering.raw_name), '') <> ''
    GROUP BY fountain_raw.normalize_treatment_term(offering.raw_name)
  `),
]);

const existing = existingResult.rows.map((row) => ({
  kind: "existing",
  id: Number(row.id),
  name: String(row.canonical_name),
  category: String(row.category),
}));
const proposed = proposedFamilies.map((row) => ({
  kind: "new",
  id: null,
  name: String(row.name),
  category: String(row.category),
}));
const vocabulary = [...existing, ...proposed];
if (vocabulary.length > 300) throw new Error(`Vocabulary exceeds cap: ${vocabulary.length}`);
const byName = new Map(vocabulary.map((row) => [normalize(row.name), row]));
const byId = new Map(existing.map((row) => [row.id, row]));
const termByKey = new Map(termResult.rows.map((row) => [String(row.term_normalized), {
  term_normalized: String(row.term_normalized),
  original_name: String(row.original_name),
  english_name: String(row.english_name || row.original_name),
  source_language: row.source_language ? String(row.source_language) : null,
  occurrence_count: Number(row.occurrence_count || 0),
}]));

const learnedTargets = learnProposalTargets(completed, prior);
const pending = [...termByKey.values()].filter((term) => !completed.has(term.term_normalized));
const written = [];
const methodCounts = new Map();

for (const term of pending) {
  const priorRow = prior.get(term.term_normalized);
  const resolution = resolveLocally(term, priorRow);
  written.push(resolution);
  methodCounts.set(resolution.local_method, (methodCounts.get(resolution.local_method) || 0) + 1);
}

if (written.length) {
  await appendFile(outputPath, written.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

console.log(JSON.stringify({
  prior_completed: completed.size,
  locally_completed: written.length,
  total: completed.size + written.length,
  expected: termByKey.size,
  vocabulary_size: vocabulary.length,
  methods: Object.fromEntries([...methodCounts].sort()),
  output: path.relative(ROOT, outputPath),
}, null, 2));
await closePool();

function resolveLocally(term, priorRow) {
  if (!priorRow) return nonService(term, "missing_prior", 0.2);
  if (obviousNonService(term.english_name)) return nonService(term, "explicit_non_service", 0.95);
  if (priorRow.kind === "non_service") {
    const explicitTreatment = keywordTarget(term.english_name);
    if (explicitTreatment) return mapped(term, explicitTreatment, "recovered_explicit_treatment", 0.78);
    return nonService(term, "prior_non_service", bounded(priorRow.confidence, 0.75));
  }

  if (priorRow.kind === "existing") {
    const target = byId.get(Number(priorRow.treatment_id));
    if (target) return mapped(term, target, "prior_existing", bounded(priorRow.confidence, 0.8));
  }

  const proposalName = String(priorRow.new_treatment_name || priorRow.treatment_name || "");
  const exact = byName.get(normalize(proposalName));
  if (exact) return mapped(term, exact, "exact_family", 0.96);

  const learned = learnedTargets.get(normalize(proposalName));
  if (learned) return mapped(term, learned, "learned_family", 0.9);

  const combined = `${term.english_name} ${proposalName}`;
  const keyword = keywordTarget(combined);
  if (keyword) return mapped(term, keyword, "keyword_family", 0.84);

  const lexical = closestVocabulary(proposalName || term.english_name);
  if (lexical && lexical.score >= 0.42) return mapped(term, lexical.target, "lexical_family", Math.min(0.86, 0.58 + lexical.score * 0.3));

  const fallback = broadFallback(combined, priorRow.category);
  return mapped(term, fallback, "broad_fallback", 0.48);
}

function obviousNonService(value) {
  const label = ` ${normalize(value)} `;
  return /\b(membership|subscription|gift card|gift certificate|financing|deposit|cancellation fee|late fee|no show fee|club buyout|club buy out|facility rental|room rental|onboarding|goal planning)\b/.test(label)
    || /\b(day|week|monthly|annual) pass\b/.test(label);
}

function learnProposalTargets(completedRows, priorRows) {
  const votes = new Map();
  for (const [term, completedRow] of completedRows) {
    const priorRow = priorRows.get(term);
    if (!priorRow || priorRow.kind !== "new" || !priorRow.new_treatment_name || completedRow.kind === "non_service") continue;
    const target = targetFromResolution(completedRow);
    if (!target) continue;
    const key = normalize(priorRow.new_treatment_name);
    const targets = votes.get(key) || new Map();
    const targetKey = `${target.kind}:${target.id || normalize(target.name)}`;
    const current = targets.get(targetKey) || { target, weight: 0 };
    current.weight += Math.max(1, Number(completedRow.occurrence_count || 0));
    targets.set(targetKey, current);
    votes.set(key, targets);
  }
  const learned = new Map();
  for (const [proposal, targets] of votes) {
    const winner = [...targets.values()].sort((a, b) => b.weight - a.weight)[0];
    if (winner) learned.set(proposal, winner.target);
  }
  return learned;
}

function targetFromResolution(row) {
  if (row.kind === "existing") return byId.get(Number(row.treatment_id)) || null;
  if (row.kind === "new") return byName.get(normalize(row.new_treatment_name)) || null;
  return null;
}

function keywordTarget(value) {
  const label = ` ${normalize(value)} `;
  const rules = [
    [/\b(mri|magnetic resonance)\b/, "MRI"],
    [/\b(ct scan|computed tomography|cat scan)\b/, "CT"],
    [/\b(dexa|bone density)\b/, "DEXA scan"],
    [/\b(x ray|radiograph)\b/, "X-ray"],
    [/\b(mammogram|mammography)\b/, "Mammography"],
    [/\b(pet scan|positron emission)\b/, "PET scan"],
    [/\b(ultrasound|sonogram|sonography)\b/, "Ultrasound imaging"],
    [/\b(echocardiogram|echocardiography)\b/, "Echocardiography"],
    [/\b(electrocardiogram|ecg|ekg)\b/, "Electrocardiography"],
    [/\b(endoscopy|gastroscopy)\b/, "Endoscopy"],
    [/\b(colonoscopy)\b/, "Colonoscopy"],
    [/\b(fluoroscopy)\b/, "Fluoroscopy"],
    [/\b(pathology|biopsy)\b/, "Pathology and biopsy"],
    [/\b(covid|coronavirus|sars cov 2)\b.*\b(test|testing|screen)\b/, "COVID-19 testing"],
    [/\b(allergy|food sensitivity)\b.*\b(test|testing|panel)\b/, "Allergy testing"],
    [/\b(fertility|ovarian reserve)\b.*\b(test|testing|assessment|panel)\b/, "Fertility testing"],
    [/\b(lab|laboratory|blood test|urine test|diagnostic test)\b/, "General laboratory testing"],
    [/\b(functional capacity|work capacity)\b.*\b(eval|evaluation|test)\b/, "Functional capacity evaluation"],
    [/\b(physical exam|medical exam|annual exam)\b/, "Physical examination"],
    [/\b(audiology|hearing test|hearing evaluation)\b/, "Hearing evaluation"],
    [/\b(hyperbaric|hbot)\b/, "Hyperbaric oxygen therapy"],
    [/\b(iv|intravenous|drip|infusion)\b/, "IV Infusions"],
    [/\b(prp|platelet rich plasma|p shot|o shot)\b/, "PRP therapy"],
    [/\b(exosome)\b/, "Exosome therapy"],
    [/\b(stem cell|cellular therapy)\b/, "Stem cell therapy"],
    [/\b(prolotherapy)\b/, "Prolotherapy"],
    [/\b(orthobiologic|regenerative orthoped)\b/, "Orthobiologics"],
    [/\b(regenerative medicine)\b/, "Regenerative medicine"],
    [/\b(viagra|cialis|trimix|erectile|male enhancement)\b/, "Erectile dysfunction treatment"],
    [/\b(women s health|womens health|gynecology|gynaecology|ob gyn)\b/, "Women's health"],
    [/\b(men s health|mens health)\b/, "Men's health"],
    [/\b(ivf|in vitro fertilization)\b/, "In vitro fertilization"],
    [/\b(fertility|egg freezing|insemination|iui|ovulation induction)\b/, "Fertility treatment"],
    [/\b(pregnancy|prenatal|antenatal|labor induction|obstetric)\b/, "Pregnancy Care"],
    [/\b(vaccine|vaccination|immunization|flu shot)\b/, "Vaccination"],
    [/\b(diabetes|blood sugar|glucose management)\b/, "Diabetes management"],
    [/\b(hypertension|high blood pressure)\b/, "Hypertension management"],
    [/\b(cardiology|cardiovascular care)\b/, "Cardiovascular care"],
    [/\b(gastroenterology|digestive care)\b/, "Gastroenterology"],
    [/\b(urology|urinary care)\b/, "Urology"],
    [/\b(pulmonology|respiratory care)\b/, "Pulmonology"],
    [/\b(allergy treatment|allergy care)\b/, "Allergy treatment"],
    [/\b(urgent care|walk in care|same day sick)\b/, "Urgent care"],
    [/\b(homeopathy|homeopathic)\b/, "Homeopathy"],
    [/\b(herbal medicine|herbal therapy)\b/, "Herbal medicine"],
    [/\b(traditional chinese medicine|tcm)\b/, "Traditional Chinese medicine"],
    [/\b(chelation)\b/, "Chelation therapy"],
    [/\b(immunotherapy)\b/, "Immunotherapy"],
    [/\b(neurofeedback)\b/, "Neurofeedback"],
    [/\b(hypnotherapy|hypnosis)\b/, "Hypnotherapy"],
    [/\b(lipotropic|mic injection|skinny shot)\b/, "Lipotropic injections"],
    [/\b(weight loss|weight management|obesity)\b/, "Medical weight loss"],
    [/\b(hormone|hgh|thyroid optimization)\b/, "Hormone optimization"],
    [/\b(testosterone|trt)\b/, "Testosterone replacement therapy (TRT)"],
    [/\b(menopause|hrt)\b/, "Menopause hormone therapy (HRT)"],
    [/\b(glp 1|semaglutide|tirzepatide)\b/, "GLP-1 weight management"],
    [/\b(finasteride|minoxidil|hair loss|hair transplant)\b/, "Hair restoration"],
    [/\b(peptide)\b/, "Peptide therapy"],
    [/\b(b12)\b.*\b(injection|shot)\b/, "B12 Injections"],
    [/\b(vitamin|supplement|glutathione|magnesium|zinc|biotin)\b/, "Supplementation"],
    [/\b(nutrition|meal plan|dietitian|dietician)\b/, "Personalized nutrition"],
    [/\b(exercise program|personal train|strength training|fitness class|yoga|barre)\b/, "Exercise programming"],
    [/\b(functional medicine|integrative medicine|root cause)\b/, "Functional medicine"],
    [/\b(primary care|family medicine|internal medicine|pediatric)\b/, "Primary Care Services"],
    [/\b(naturopath)\b/, "Naturopathic Medicine"],
    [/\b(telehealth|telemedicine|virtual visit|online visit)\b/, "Telehealth Services"],
    [/\b(pain|headache|migraine|sciatica|fibromyalgia|arthritis|joint stiffness)\b/, "Pain management"],
    [/\b(physical therapy|physiotherapy|manual therapy|joint mobilization)\b/, "Physical therapy"],
    [/\b(occupational therapy)\b/, "Occupational therapy"],
    [/\b(speech therapy|speech language)\b/, "Speech therapy"],
    [/\b(aquatic therapy|hydrotherapy)\b/, "Aquatic therapy"],
    [/\b(spinal decompression|disc decompression)\b/, "Spinal decompression"],
    [/\b(cupping)\b/, "Cupping therapy"],
    [/\b(float therapy|flotation)\b/, "Float therapy"],
    [/\b(reiki)\b/, "Reiki therapy"],
    [/\b(reflexology)\b/, "Reflexology"],
    [/\b(myofascial release)\b/, "Myofascial release"],
    [/\b(craniosacral)\b/, "Craniosacral therapy"],
    [/\b(compression therapy|compression boots)\b/, "Compression therapy"],
    [/\b(contrast therapy)\b/, "Contrast therapy"],
    [/\b(trigger point|dry needling)\b/, "Trigger point therapy"],
    [/\b(blood flow restriction|bfr)\b/, "Blood flow restriction therapy"],
    [/\b(electrical muscle stimulation|ems therapy)\b/, "Electrical muscle stimulation"],
    [/\b(wound care|wound treatment)\b/, "Wound care"],
    [/\b(podiatry|foot care|ingrown toenail|plantar fasciitis)\b/, "Podiatry"],
    [/\b(sports medicine|sports injury)\b/, "Sports medicine"],
    [/\b(orthopedic|orthopaedic)\b.*\b(surgery|operation)\b/, "Orthopedic surgery"],
    [/\b(orthopedic|orthopaedic)\b/, "Orthopedic care"],
    [/\b(spine surgery|discectomy|laminectomy|kyphoplasty|vertebroplasty)\b/, "Spine surgery"],
    [/\b(spine care|spinal care)\b/, "Spine care"],
    [/\b(joint replacement|knee replacement|hip replacement)\b/, "Joint replacement"],
    [/\b(bariatric surgery|gastric bypass|sleeve gastrectomy)\b/, "Bariatric surgery"],
    [/\b(vascular surgery)\b/, "Vascular surgery"],
    [/\b(chemotherapy)\b/, "Chemotherapy"],
    [/\b(radiation therapy|radiotherapy)\b/, "Radiation therapy"],
    [/\b(dialysis)\b/, "Dialysis"],
    [/\b(plasmapheresis|plasma exchange)\b/, "Therapeutic plasma exchange"],
    [/\b(sclerotherapy)\b/, "Sclerotherapy"],
    [/\b(radiofrequency ablation)\b/, "Radiofrequency ablation"],
    [/\b(nerve block)\b/, "Nerve block"],
    [/\b(epidural steroid|epidural injection)\b/, "Epidural steroid injection"],
    [/\b(spinal cord stimulation)\b/, "Spinal cord stimulation"],
    [/\b(peripheral nerve stimulation)\b/, "Peripheral nerve stimulation"],
    [/\b(tms|transcranial magnetic)\b/, "Transcranial magnetic stimulation"],
    [/\b(substance use|addiction treatment|detox program|rehab program)\b/, "Substance use treatment"],
    [/\b(emdr)\b/, "EMDR therapy"],
    [/\b(couples therapy|couples counseling)\b/, "Couples therapy"],
    [/\b(trauma therapy|ptsd therapy)\b/, "Trauma therapy"],
    [/\b(grief counseling|bereavement)\b/, "Grief counseling"],
    [/\b(psychotherapy|counseling|mental health|anxiety|depression|bipolar)\b/, "Psychotherapy"],
    [/\b(neuropathy)\b/, "Neuropathy treatment"],
    [/\b(neurological rehab|neuro rehabilitation|stroke rehab)\b/, "Neurological rehabilitation"],
    [/\b(cardiac rehab)\b/, "Cardiac rehabilitation"],
    [/\b(pulmonary rehab)\b/, "Pulmonary rehabilitation"],
    [/\b(pelvic floor|pelvic health therapy)\b/, "Pelvic floor therapy"],
    [/\b(massage)\b/, "Massage therapy"],
    [/\b(chiropractic|chiropractor)\b/, "Chiropractic care"],
    [/\b(acupuncture)\b/, "Acupuncture"],
    [/\b(sound bath|sound healing|photon sound)\b/, "Sound Healing"],
    [/\b(sauna|infrared sauna)\b/, "Sauna and infrared"],
    [/\b(red light|photobiomodulation)\b/, "Red light therapy"],
    [/\b(cryo|cryotherapy)\b/, "Cryotherapy"],
    [/\b(cold plunge|ice bath)\b/, "Cold plunge"],
    [/\b(pemf|pulsed electromagnetic)\b/, "PEMF therapy"],
    [/\b(shockwave)\b/, "Shockwave therapy"],
    [/\b(botox|dysport|xeomin|jeuveau|neurotoxin)\b/, "Botox"],
    [/\b(dermal filler|juvederm|restylane|sculptra|radiesse)\b/, "Dermal fillers"],
    [/\b(microneedling)\b/, "Microneedling"],
    [/\b(hydrafacial)\b/, "Hydrafacial"],
    [/\b(chemical peel)\b/, "Chemical peel"],
    [/\b(laser hair removal)\b/, "Laser hair removal"],
    [/\b(tattoo removal)\b/, "Laser tattoo removal"],
    [/\b(skin tightening)\b/, "Skin tightening"],
    [/\b(body contour|coolsculpt|fat dissolv)\b/, "Body contouring"],
    [/\b(acne)\b/, "Acne treatment"],
    [/\b(eczema)\b/, "Eczema treatment"],
    [/\b(psoriasis)\b/, "Psoriasis treatment"],
    [/\b(rosacea)\b/, "Rosacea treatment"],
    [/\b(mole|angioma|skin tag)\b/, "Mole removal"],
    [/\b(skin cancer|melanoma|mohs)\b/, "Skin cancer treatment"],
    [/\b(scar)\b/, "Scar treatment"],
    [/\b(pigment|melasma|sun spot|brown spot)\b/, "Pigmentation treatment"],
    [/\b(spider vein|broken capillary|vascular skin)\b/, "Vascular skin treatment"],
    [/\b(rhinoplasty|nose job)\b/, "Rhinoplasty"],
    [/\b(blepharoplasty|eyelid surgery)\b/, "Blepharoplasty"],
    [/\b(facelift)\b/, "Facelift"],
    [/\b(liposuction)\b/, "Liposuction"],
    [/\b(tummy tuck|abdominoplasty)\b/, "Abdominoplasty"],
    [/\b(brow lift)\b/, "Brow lift"],
    [/\b(neck lift)\b/, "Neck lift"],
    [/\b(otoplasty|ear surgery)\b/, "Otoplasty"],
    [/\b(labiaplasty)\b/, "Labiaplasty"],
    [/\b(brazilian butt|bbl surgery)\b/, "Brazilian butt lift"],
    [/\b(thread lift|pdo thread)\b/, "Thread lift"],
    [/\b(dermaplaning)\b/, "Dermaplaning"],
    [/\b(mesotherapy)\b/, "Mesotherapy"],
    [/\b(teeth whitening)\b/, "Teeth whitening"],
    [/\b(plastic surgery|cosmetic surgery)\b/, "Plastic surgery"],
    [/\b(facial|skin treatment|dermatology|skin care)\b/, "Skin Care"],
    [/\b(brow|lash|nail|manicure|pedicure|waxing)\b/, "Beauty treatment"],
  ];
  for (const [pattern, name] of rules) {
    if (pattern.test(label)) return requireTarget(name);
  }
  return null;
}

function closestVocabulary(value) {
  const source = significantTokens(value);
  if (!source.size) return null;
  let best = null;
  for (const target of vocabulary) {
    const candidate = significantTokens(target.name);
    const intersection = [...source].filter((token) => candidate.has(token)).length;
    if (!intersection) continue;
    const union = new Set([...source, ...candidate]).size;
    const score = intersection / union + (intersection === candidate.size ? 0.2 : 0);
    if (!best || score > best.score) best = { target, score };
  }
  return best;
}

function broadFallback(value, category) {
  const label = ` ${normalize(value)} `;
  if (category === "Measure") {
    if (/\b(imaging|scan|radiology)\b/.test(label)) return requireTarget("Diagnostic imaging");
    if (/\b(exam|evaluation|assessment)\b/.test(label)) return requireTarget("Physical examination");
    return requireTarget("General laboratory testing");
  }
  if (category === "Regenerate") return requireTarget("Regenerative medicine");
  if (category === "Rejuvenate") {
    if (/\b(surgery|surgical|operation)\b/.test(label)) return requireTarget("Plastic surgery");
    if (/\b(skin|facial|derm)\b/.test(label)) return requireTarget("Skin Care");
    return requireTarget("Aesthetic medicine");
  }
  if (category === "Recover") {
    if (/\b(surgery|surgical|operation)\b/.test(label)) return requireTarget("General surgery");
    if (/\b(mental|behavior|counsel|psych)\b/.test(label)) return requireTarget("Psychotherapy");
    if (/\b(rehab|therapy|mobility|movement)\b/.test(label)) return requireTarget("Physical therapy");
    return requireTarget("Pain management");
  }
  if (/\b(medication|medicine|drug|prescription)\b/.test(label)) return requireTarget("Medication management");
  if (/\b(consult|primary|general care|checkup)\b/.test(label)) return requireTarget("Primary Care Services");
  return requireTarget("Functional medicine");
}

function mapped(term, target, method, confidence) {
  return {
    ...term,
    kind: target.kind,
    treatment_id: target.kind === "existing" ? target.id : null,
    treatment_name: target.kind === "existing" ? target.name : null,
    new_treatment_name: target.kind === "new" ? target.name : null,
    category: target.category,
    confidence,
    rationale: `Locally consolidated into the capped vocabulary via ${method}.`,
    model: null,
    prompt_version: "capped-treatment-taxonomy-local-v1",
    local_method: method,
  };
}

function nonService(term, method, confidence) {
  return {
    ...term,
    kind: "non_service",
    treatment_id: null,
    treatment_name: null,
    new_treatment_name: null,
    category: null,
    confidence,
    rationale: `Locally retained as non-service via ${method}.`,
    model: null,
    prompt_version: "capped-treatment-taxonomy-local-v1",
    local_method: method,
  };
}

function requireTarget(name) {
  const target = byName.get(normalize(name));
  if (!target) throw new Error(`Controlled vocabulary target not found: ${name}`);
  return target;
}

function significantTokens(value) {
  const stop = new Set(["and", "for", "the", "with", "treatment", "therapy", "services", "service", "care", "program", "management", "procedure", "session", "consultation", "medical", "health"]);
  return new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !stop.has(token)));
}

function bounded(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0.3, Math.min(0.95, number)) : fallback;
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/gu, " ").trim();
}

async function readJsonLines(filePath, key) {
  const text = await readFile(filePath, "utf8");
  return new Map(text.split(/\r?\n/u).filter(Boolean).map((line) => {
    const row = JSON.parse(line);
    return [row[key], row];
  }));
}
