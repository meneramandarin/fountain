import pg from "pg";
import { pathToFileURL } from "node:url";

const allowedStatuses = new Set([
  "approved_drug",
  "approved_drug_discontinued",
  "cleared_or_approved_device",
  "product_specific",
  "device_specific",
  "no_matching_approved_drug",
  "not_applicable",
  "not_determined",
]);

// Exact FDA ingredient terms only. A missing exact match is reported as a
// missing approved drug, never as a general medical conclusion about safety.
const drugQueries = new Map(Object.entries({
  "AOD-9604": ["AOD-9604"],
  "Alpha-lipoic acid IV": ["ALPHA LIPOIC ACID", "THIOCTIC ACID"],
  "B12 Injections": ["CYANOCOBALAMIN", "HYDROXOCOBALAMIN"],
  "BPC-157": ["BPC-157"],
  "Botox": ["ONABOTULINUMTOXINA"],
  "CJC-1295": ["CJC-1295"],
  "CJC-1295 + Ipamorelin": ["CJC-1295", "IPAMORELIN"],
  "DSIP": ["DELTA SLEEP INDUCING PEPTIDE", "DSIP"],
  "Daxxify": ["DAXIBOTULINUMTOXINA-LANM"],
  "Dihexa": ["DIHEXA"],
  "Dysport": ["ABOBOTULINUMTOXINA"],
  "Epitalon": ["EPITALON", "EPITHALON"],
  "Exosome therapy": ["EXOSOME"],
  "GHK-Cu": ["GHK-CU", "COPPER TRIPEPTIDE-1"],
  "Glutathione IV": ["GLUTATHIONE"],
  "Ipamorelin": ["IPAMORELIN"],
  "Jeuveau": ["PRABOTULINUMTOXINA-XVFS"],
  "KPV": ["KPV"],
  "Ketamine therapy": ["KETAMINE", "KETAMINE HYDROCHLORIDE"],
  "Kisspeptin-10": ["KISSPEPTIN-10", "KISSPEPTIN"],
  "MOTS-C": ["MOTS-C"],
  "Magnesium IV": ["MAGNESIUM SULFATE"],
  "Melanotan II": ["MELANOTAN II"],
  "Modafinil": ["MODAFINIL"],
  "NAD+ IV therapy": ["NICOTINAMIDE ADENINE DINUCLEOTIDE", "NAD+"],
  "Ozone therapy": ["OZONE"],
  "PT-141": ["BREMELANOTIDE"],
  "Rapamycin": ["SIROLIMUS"],
  "Selank": ["SELANK"],
  "Semax": ["SEMAX"],
  "Sermorelin": ["SERMORELIN", "SERMORELIN ACETATE"],
  "TB-500": ["TB-500", "THYMOSIN BETA-4"],
  "Tesamorelin": ["TESAMORELIN", "TESAMORELIN ACETATE"],
  "Thymosin alpha-1": ["THYMOSIN ALFA 1", "THYMALFASIN"],
  "Vitamin C IV": ["ASCORBIC ACID"],
  "Xeomin": ["INCOBOTULINUMTOXINA"],
}));

const deviceQueries = new Map(Object.entries({
  "Skinvive": ["SKINVIVE"],
}));

const requiredDrugRoutes = new Map(Object.entries({
  "Alpha-lipoic acid IV": ["INTRAVENOUS"],
  "B12 Injections": ["INJECTION", "INTRAMUSCULAR", "SUBCUTANEOUS"],
  "Glutathione IV": ["INTRAVENOUS"],
  "Magnesium IV": ["INTRAVENOUS"],
  "NAD+ IV therapy": ["INTRAVENOUS"],
  "PT-141": ["SUBCUTANEOUS"],
  "Sermorelin": ["INJECTION", "SUBCUTANEOUS"],
  "Tesamorelin": ["SUBCUTANEOUS"],
  "Vitamin C IV": ["INTRAVENOUS"],
}));

const deviceSpecific = new Set([
  "Body composition analysis",
  "Body contouring",
  "Cellulite Reduction",
  "CT",
  "Cold Laser Therapy",
  "Colonoscopy",
  "Compression therapy",
  "Coolpeel",
  "Cryotherapy",
  "DEXA scan",
  "Diagnostic imaging",
  "Dialysis",
  "Echocardiography",
  "Electrical muscle stimulation",
  "Electrocardiography",
  "Emsella",
  "Emtone®",
  "Endoscopy",
  "Fluoroscopy",
  "Hearing aids",
  "Hydrafacial",
  "Hyperbaric oxygen therapy",
  "Imaging",
  "Ipl Photofacial",
  "Laser Skin Rejuvenation",
  "Laser hair removal",
  "Laser skin resurfacing",
  "Laser tattoo removal",
  "MRI",
  "Mammography",
  "Microcurrent therapy",
  "Microneedling",
  "Neurodiagnostic testing",
  "Neurofeedback",
  "Nuclear medicine imaging",
  "Orthotics",
  "PEMF therapy",
  "PET scan",
  "Peripheral nerve stimulation",
  "Pulmonary function testing",
  "Radiofrequency ablation",
  "Red light therapy",
  "Rife frequency therapy",
  "Shockwave therapy",
  "Sleep study",
  "Skin tightening",
  "Spinal cord stimulation",
  "Spinal decompression",
  "Transcranial magnetic stimulation",
  "Ultrasound imaging",
  "VO2 max test",
  "Vascular imaging",
  "Whole-body MRI",
  "X-ray",
]);

const productSpecific = new Set([
  "Acne treatment",
  "Addiction medicine",
  "Advanced biomarker panel",
  "Advanced blood panel",
  "Allergy testing",
  "Allergy treatment",
  "B-complex IV",
  "Cancer screening",
  "Cancer treatment",
  "Cardiac screening",
  "Cardiometabolic testing",
  "Cardiovascular care",
  "Chelation therapy",
  "Chemical peel",
  "Chemotherapy",
  "Chronic disease management",
  "Cognitive assessment",
  "COVID-19 testing",
  "Dermal fillers",
  "Diabetes management",
  "Eczema treatment",
  "Endocrine therapy",
  "Epidural steroid injection",
  "Epigenetic age clock",
  "Erectile dysfunction treatment",
  "Fertility testing",
  "Fertility treatment",
  "GLP-1 weight management",
  "General laboratory testing",
  "Genetic testing",
  "Glutathione IV",
  "Hormone optimization",
  "Hormone testing",
  "Hyaluronic Acid Injections",
  "Hypertension management",
  "IV Infusions",
  "IV hydration",
  "Immunotherapy",
  "In vitro fertilization",
  "Infectious disease testing",
  "Iron infusion",
  "Kidney care",
  "Lipotropic injections",
  "Medical weight loss",
  "Medication management",
  "Metabolic testing",
  "Men's health",
  "Menopause hormone therapy (HRT)",
  "Myers' Cocktail IV",
  "Nerve block",
  "Pathology and biopsy",
  "Peptide therapy",
  "Personalized nutrition",
  "Prenatal screening",
  "PRP therapy",
  "Psoriasis treatment",
  "Sclerotherapy",
  "Sexual health",
  "Skin cancer treatment",
  "Stem cell therapy",
  "Supplementation",
  "Testosterone replacement therapy (TRT)",
  "Telomere testing",
  "Thread lift",
  "Vaccination",
  "Wound care",
  "Women's health",
]);

// These are services, practices, or procedures rather than specific FDA-
// reviewed products. This set is intentionally explicit so new treatments
// land in not_determined until reviewed.
const notApplicable = new Set([
  "Abdominoplasty",
  "Active Release Technique",
  "Acupuncture",
  "Aesthetic medicine",
  "Anti Aging",
  "Aquatic therapy",
  "Balance Therapy",
  "Bariatric surgery",
  "Beauty treatment",
  "Blepharoplasty",
  "Blood flow restriction therapy",
  "Body lift",
  "Brazilian butt lift",
  "Breast surgery",
  "Brow lift",
  "Cardiac rehabilitation",
  "Chin augmentation",
  "Chiropractic care",
  "Cold plunge",
  "Colon hydrotherapy",
  "Concussion Therapy",
  "Contrast therapy",
  "Couples therapy",
  "Craniosacral therapy",
  "Cupping therapy",
  "Dot Physicals",
  "Dermaplaning",
  "Dermatologic surgery",
  "Ear, nose and throat care",
  "Emergency care",
  "EMDR therapy",
  "Exercise programming",
  "Executive health checkup",
  "Eye examination",
  "Facelift",
  "Float therapy",
  "Foot and ankle surgery",
  "Functional capacity evaluation",
  "Functional medicine",
  "Gait Analysis",
  "Gastroenterology",
  "General surgery",
  "Grief counseling",
  "Group Therapy",
  "Gynecomastia surgery",
  "Hair restoration",
  "Halotherapy",
  "Health Consultant",
  "Health coaching",
  "Hearing evaluation",
  "Herbal medicine",
  "Homeopathy",
  "Hypnotherapy",
  "Individual Therapy",
  "Joint replacement",
  "Labiaplasty",
  "Liposuction",
  "Lymphatic drainage",
  "Massage therapy",
  "Med spa",
  "Mesotherapy",
  "Mohs surgery",
  "Mole removal",
  "Myofascial release",
  "Naturopathic Medicine",
  "Neck lift",
  "Neurological care",
  "Neurological rehabilitation",
  "Neuromodulator injections",
  "Neuropathy treatment",
  "Occupational therapy",
  "Ophthalmology",
  "Orthobiologics",
  "Orthopedic care",
  "Orthopedic surgery",
  "Osteopathic manipulation",
  "Otoplasty",
  "Pain management",
  "Palliative care",
  "Pelvic floor therapy",
  "Permanent Makeup",
  "Personal Trainer",
  "Physical examination",
  "Physical therapy",
  "Pigmentation treatment",
  "Pilates",
  "Plastic surgery",
  "Podiatry",
  "Pregnancy Care",
  "Preventive Care",
  "Primary Care Services",
  "Prolotherapy",
  "Psychotherapy",
  "Pulmonary rehabilitation",
  "Pulmonology",
  "Radiation therapy",
  "Reflexology",
  "Regenerative medicine",
  "Reiki therapy",
  "Rhinoplasty",
  "Rosacea treatment",
  "Running Analysis",
  "Sauna and infrared",
  "Scar treatment",
  "Skin Care",
  "Sleep optimization",
  "Soft Tissue Mobilization",
  "Sound Healing",
  "Speech therapy",
  "Spine care",
  "Spine surgery",
  "Sports Recovery",
  "Sports Rehabilitation",
  "Sports medicine",
  "Strength And Conditioning",
  "Stroke rehabilitation",
  "Substance use treatment",
  "Telehealth Services",
  "Teeth whitening",
  "Therapeutic plasma exchange",
  "Traditional Chinese medicine",
  "Trauma therapy",
  "Trigger point therapy",
  "Urgent care",
  "Urology",
  "Vampire Facial",
  "Vascular skin treatment",
  "Vascular surgery",
  "Vestibular Rehabilitation Therapy",
  "Vestibular Therapy",
  "Wellness And Performance",
]);

export async function refreshTreatmentFdaStatuses({
  apply = false,
  quiet = false,
} = {}) {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required.");
  const log = (...values) => { if (!quiet) console.log(...values); };
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(`
      SELECT canonical_name
      FROM fountain.treatments
      ORDER BY canonical_name
    `);
    const treatments = result.rows.map((row) => row.canonical_name);
    const statuses = new Map();

    await runWithConcurrency([...drugQueries], 4, async ([name, terms]) => {
      statuses.set(name, await classifyDrug(name, terms));
    });
    await runWithConcurrency([...deviceQueries], 3, async ([name, terms]) => {
      statuses.set(name, await classifyDevice(terms));
    });

    for (const name of treatments) {
      if (statuses.has(name)) continue;
      if (deviceSpecific.has(name)) statuses.set(name, "device_specific");
      else if (productSpecific.has(name)) statuses.set(name, "product_specific");
      else if (notApplicable.has(name)) statuses.set(name, "not_applicable");
      else statuses.set(name, "not_determined");
    }

    const unknown = treatments.filter((name) => statuses.get(name) === "not_determined");
    const counts = Object.fromEntries(
      [...allowedStatuses].map((status) => [status, treatments.filter((name) => statuses.get(name) === status).length]),
    );
    const report = { total: treatments.length, counts, notDetermined: unknown, updated: 0 };
    log(JSON.stringify(report, null, 2));

    if (!apply) {
      for (const name of treatments) log(`${statuses.get(name)}\t${name}`);
      log("Dry run only. Re-run with --apply after reviewing every not_determined treatment.");
      return report;
    }

    if (unknown.length) {
      throw new Error(`Refusing to apply with ${unknown.length} not_determined treatments.`);
    }
    await client.query("BEGIN");
    try {
      const values = [];
      const parameters = [];
      for (const [name, status] of statuses) {
        if (!allowedStatuses.has(status)) throw new Error(`Invalid status ${status} for ${name}.`);
        const offset = parameters.length;
        values.push(`($${offset + 1}::text, $${offset + 2}::text)`);
        parameters.push(name, status);
      }
      const update = await client.query(
        `UPDATE fountain.treatments AS treatment
         SET fda_regulatory_status = classified.status,
             fda_regulatory_status_updated_at = now()
         FROM (VALUES ${values.join(", ")}) AS classified(canonical_name, status)
         WHERE treatment.canonical_name = classified.canonical_name
           AND treatment.fda_regulatory_status IS DISTINCT FROM classified.status`,
        parameters,
      );
      await client.query("COMMIT");
      report.updated = update.rowCount || 0;
      log(`Updated ${report.updated} changed FDA status codes across ${statuses.size} treatments.`);
      return report;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  await refreshTreatmentFdaStatuses({ apply: process.argv.includes("--apply") });
}

async function classifyDrug(name, terms) {
  const url = new URL("https://api.fda.gov/drug/drugsfda.json");
  url.searchParams.set(
    "search",
    [
      ...terms.map((term) => `products.active_ingredients.name:\"${term.replaceAll('"', '\\\"')}\"`),
      `products.brand_name:\"${name.replaceAll('"', '\\\"')}\"`,
    ].join(" OR "),
  );
  url.searchParams.set("limit", "1000");
  addApiKey(url);
  const payload = await fetchOpenFda(url);
  const applications = payload?.results || [];
  if (!applications.length) return "no_matching_approved_drug";
  const routes = requiredDrugRoutes.get(name);
  const products = applications.flatMap((application) => application.products || []).filter((product) =>
    !routes || routes.includes(String(product.route || "").toLocaleUpperCase("en-US")),
  );
  if (!products.length) return "no_matching_approved_drug";
  const statuses = products.map((product) => product.marketing_status).filter(Boolean);
  if (statuses.some((status) => status === "Prescription" || status === "Over-the-counter")) {
    return "approved_drug";
  }
  if (statuses.length && statuses.every((status) => status === "Discontinued")) {
    return "approved_drug_discontinued";
  }
  return "not_determined";
}

async function classifyDevice(terms) {
  for (const term of terms) {
    const pmaUrl = new URL("https://api.fda.gov/device/pma.json");
    pmaUrl.searchParams.set("search", `trade_name:\"${term.replaceAll('"', '\\\"')}\"`);
    pmaUrl.searchParams.set("limit", "100");
    addApiKey(pmaUrl);
    const pma = await fetchOpenFda(pmaUrl);
    if (pma?.results?.length) return "cleared_or_approved_device";

    const clearanceUrl = new URL("https://api.fda.gov/device/510k.json");
    clearanceUrl.searchParams.set("search", `device_name:\"${term.replaceAll('"', '\\\"')}\"`);
    clearanceUrl.searchParams.set("limit", "100");
    addApiKey(clearanceUrl);
    const clearance = await fetchOpenFda(clearanceUrl);
    if (clearance?.results?.length) return "cleared_or_approved_device";
  }
  return "device_specific";
}

async function fetchOpenFda(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`openFDA request failed (${response.status}): ${url.pathname}`);
  return response.json();
}

function addApiKey(url) {
  if (process.env.OPENFDA_API_KEY) url.searchParams.set("api_key", process.env.OPENFDA_API_KEY);
}

async function runWithConcurrency(items, concurrency, task) {
  const queue = [...items];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await task(item);
    }
  }));
}
