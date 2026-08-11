#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  csvStringify,
  normalizeKeyword,
  parseCsv,
  parseSemrushCsv,
  readJson,
} from "./lib.mjs";
import {
  getDatabaseUrl,
  loadPipelineEnv,
  REPO_ROOT,
} from "../../scripts/lib/pipeline-env.mjs";

const ROOT = path.join(REPO_ROOT, "analysis", "search-demand");
const RAW = path.join(ROOT, "raw");
const OUTPUT = path.join(ROOT, "output");
const DISCOVERY = path.join(RAW, "semrush-discovery");

export const MARKETS = [
  { slug: "new-york", name: "New York City", suffix: "nyc", places: [["New York", "NY"], ["Brooklyn", "NY"], ["Queens", "NY"], ["Bronx", "NY"], ["Staten Island", "NY"], ["Long Island City", "NY"], ["Jersey City", "NJ"], ["Hoboken", "NJ"]] },
  { slug: "los-angeles", name: "Los Angeles", suffix: "los angeles", places: [["Los Angeles", "CA"], ["Beverly Hills", "CA"], ["Santa Monica", "CA"], ["West Hollywood", "CA"], ["Culver City", "CA"], ["Glendale", "CA"], ["Pasadena", "CA"], ["Burbank", "CA"]] },
  { slug: "miami", name: "Miami / South Florida", suffix: "miami", places: [["Miami", "FL"], ["Miami Beach", "FL"], ["Coral Gables", "FL"], ["Fort Lauderdale", "FL"], ["Boca Raton", "FL"], ["Aventura", "FL"], ["Hollywood", "FL"]] },
  { slug: "austin", name: "Austin", suffix: "austin", places: [["Austin", "TX"], ["Round Rock", "TX"], ["Cedar Park", "TX"], ["Georgetown", "TX"], ["Pflugerville", "TX"]] },
  { slug: "scottsdale-phoenix", name: "Scottsdale / Phoenix", suffix: "scottsdale", places: [["Scottsdale", "AZ"], ["Phoenix", "AZ"], ["Tempe", "AZ"], ["Mesa", "AZ"], ["Gilbert", "AZ"], ["Glendale", "AZ"]] },
  { slug: "san-diego", name: "San Diego", suffix: "san diego", places: [["San Diego", "CA"], ["La Jolla", "CA"], ["Del Mar", "CA"], ["Carlsbad", "CA"], ["Encinitas", "CA"], ["Chula Vista", "CA"]] },
  { slug: "houston", name: "Houston", suffix: "houston", places: [["Houston", "TX"], ["Sugar Land", "TX"], ["The Woodlands", "TX"], ["Katy", "TX"], ["Pearland", "TX"]] },
  { slug: "tampa-bay", name: "Tampa Bay", suffix: "tampa", places: [["Tampa", "FL"], ["St. Petersburg", "FL"], ["Clearwater", "FL"]] },
  { slug: "las-vegas", name: "Las Vegas", suffix: "las vegas", places: [["Las Vegas", "NV"], ["Henderson", "NV"], ["North Las Vegas", "NV"]] },
  { slug: "chicago", name: "Chicago", suffix: "chicago", places: [["Chicago", "IL"], ["Oak Brook", "IL"], ["Naperville", "IL"], ["Evanston", "IL"], ["Schaumburg", "IL"]] },
  { slug: "dallas-fort-worth", name: "Dallas / Fort Worth", suffix: "dallas", places: [["Dallas", "TX"], ["Fort Worth", "TX"], ["Plano", "TX"], ["Frisco", "TX"], ["Irving", "TX"], ["Arlington", "TX"]] },
  { slug: "denver-boulder", name: "Denver / Boulder", suffix: "denver", places: [["Denver", "CO"], ["Boulder", "CO"], ["Aurora", "CO"], ["Englewood", "CO"], ["Greenwood Village", "CO"], ["Lakewood", "CO"]] },
  { slug: "san-francisco-bay", name: "San Francisco Bay Area", suffix: "san francisco", places: [["San Francisco", "CA"], ["Oakland", "CA"], ["Berkeley", "CA"], ["Palo Alto", "CA"], ["San Jose", "CA"], ["Walnut Creek", "CA"], ["San Mateo", "CA"], ["Redwood City", "CA"], ["Burlingame", "CA"]] },
];

const DISCOVERY_TOPICS = {
  "full-body-mri": "Full-body MRI",
  "dexa-scan": "DEXA scan",
  "body-composition-test": "Body composition analysis",
  "comprehensive-blood-test": "Advanced blood panel",
  "biological-age-test": "Epigenetic age clock",
  "cancer-screening": "Cancer screening",
  "executive-health-checkup": "Executive health checkup",
  "vo2-max-test": "VO2 max test",
  "iv-therapy": "IV Infusions",
  "nad-therapy": "NAD+ IV therapy",
  "medical-weight-loss": "Medical weight loss",
  "hormone-replacement-therapy": "Hormone optimization",
  "functional-medicine": "Functional medicine",
  "peptide-therapy": "Peptide therapy",
  "hyperbaric-oxygen-therapy": "Hyperbaric oxygen therapy (HBOT)",
  "red-light-therapy": "Red light therapy",
  "prp-therapy": "PRP therapy",
  "stem-cell-therapy": "Stem cell therapy",
  "botox": "Botox",
  "med-spa": "Med spa",
  "longevity-clinic": "Longevity clinic / platform discovery",
};

const TARGETED_ALIASES = {
  "Full-body MRI": ["full body mri scan", "whole body mri scan", "total body mri", "whole body scan", "full body scan", "preventive mri", "preventative mri", "elective mri", "mri cancer screening", "full body cancer screening", "prenuvo scan", "ezra scan"],
  "DEXA scan": ["dexa body composition", "body composition scan", "bone density test"],
  "Advanced blood panel": ["comprehensive blood test", "full blood panel", "advanced lab testing", "longevity labs"],
  "Executive health checkup": ["executive physical", "executive physical exam", "executive health screening", "concierge physical"],
  "Epigenetic age clock": ["biological age test", "biological age testing", "epigenetic test", "dna age test"],
  "Cancer screening": ["early cancer detection", "multi cancer early detection", "galleri test"],
  "Cardiac screening": ["heart health screening", "cardiac calcium scan", "coronary calcium scan"],
  "VO2 max test": ["vo2 max testing", "vo2 test", "metabolic fitness test"],
  "Medical weight loss": ["weight loss doctor", "weight loss program", "weight loss injections"],
  "GLP-1 weight management": ["semaglutide clinic", "tirzepatide clinic", "ozempic weight loss", "mounjaro weight loss", "zepbound clinic"],
  "Hormone optimization": ["hormone specialist", "hormone clinic", "bioidentical hormone therapy"],
  "Menopause hormone therapy (HRT)": ["menopause clinic", "hrt for women", "bioidentical hormones for women"],
  "Testosterone replacement therapy (TRT)": ["trt doctor", "testosterone clinic", "low t clinic"],
  "IV Infusions": ["iv hydration", "iv drip", "vitamin iv", "mobile iv", "iv lounge"],
  "NAD+ IV therapy": ["nad iv", "nad drip", "nad infusion"],
  "Peptide therapy": ["peptide doctor", "peptide clinic", "bpc 157 therapy"],
  "PRP therapy": ["prp injections", "platelet rich plasma", "prp treatment"],
  "Stem cell therapy": ["stem cell clinic", "regenerative stem cell treatment"],
  "Red light therapy": ["red light therapy clinic", "photobiomodulation"],
  "Hyperbaric oxygen therapy (HBOT)": ["hyperbaric chamber", "hbot therapy", "hbot clinic"],
  "Sauna and infrared": ["infrared sauna", "sauna therapy"],
  "Cryotherapy": ["whole body cryotherapy", "cryo therapy"],
  "Cold plunge": ["cold plunge studio", "cold water therapy"],
  "Botox": ["botox injections", "baby botox", "preventative botox"],
  "Dermal fillers": ["facial fillers", "lip filler", "cheek filler"],
  "Microneedling": ["rf microneedling", "morpheus8", "collagen induction therapy"],
  "Hair restoration": ["hair loss clinic", "hair transplant", "prp hair restoration"],
  "Med spa": ["medical spa", "aesthetic clinic"],
};

loadPipelineEnv();
const [command = "prepare"] = process.argv.slice(2);

if (command === "prepare") await prepare();
else if (command === "analyze") await analyze();
else throw new Error(`Unknown command ${command}`);

async function prepare() {
  await mkdir(OUTPUT, { recursive: true });
  const client = new pg.Client({ connectionString: getDatabaseUrl() });
  await client.connect();
  const [treatmentResult, supplyResult] = await Promise.all([
    client.query(`
      SELECT t.category, t.canonical_name AS topic,
             count(DISTINCT CASE WHEN l.country_code='US' AND l.status='active' AND l.deleted_at IS NULL THEN l.id END)::int AS us_locations
      FROM fountain.treatments t
      LEFT JOIN fountain.offerings o ON o.treatment_id=t.id AND o.status='active' AND o.deleted_at IS NULL
      LEFT JOIN fountain.locations l ON l.id=o.location_id
      WHERE t.category IS NOT NULL
      GROUP BY 1,2 ORDER BY 1,2`),
    client.query(`
      SELECT l.id AS location_id, l.org_id, l.locality, l.region,
             t.category, t.canonical_name AS topic, o.id AS offering_id
      FROM fountain.locations l
      LEFT JOIN fountain.offerings o ON o.location_id=l.id AND o.status='active' AND o.deleted_at IS NULL
      LEFT JOIN fountain.treatments t ON t.id=o.treatment_id
      WHERE l.country_code='US' AND l.status='active' AND l.deleted_at IS NULL
        AND coalesce(l.is_virtual,false)=false`),
  ]);
  await client.end();

  const aliases = await readJson(path.join(ROOT, "aliases.json"));
  const discovery = await readDiscovery();
  const topicMeta = new Map(treatmentResult.rows.map((row) => [row.topic, row]));
  topicMeta.set("Longevity clinic / platform discovery", { category: "Cross-category", topic: "Longevity clinic / platform discovery", us_locations: 0 });

  const baseRows = [];
  for (const row of treatmentResult.rows) {
    const phrases = new Map();
    phrases.set(normalizeKeyword(row.topic), "canonical");
    for (const phrase of aliases[row.topic] || []) phrases.set(normalizeKeyword(phrase), "curated_alias");
    for (const phrase of TARGETED_ALIASES[row.topic] || []) phrases.set(normalizeKeyword(phrase), "expanded_alias");
    for (const [phrase, source] of phrases) {
      if (phrase) baseRows.push({ category: row.category, topic: row.topic, baseKeyword: phrase, source });
    }
  }
  for (const row of discovery) {
    const meta = topicMeta.get(row.topic);
    if (!meta) continue;
    baseRows.push({ category: meta.category, topic: row.topic, baseKeyword: row.keyword, source: "semrush_discovery" });
  }

  const keywordRows = [];
  const seen = new Set();
  for (const market of MARKETS) {
    for (const base of baseRows) {
      const query = localize(base.baseKeyword, market.suffix);
      if (!query || query.split(/\s+/).length > 12 || query.length > 180) continue;
      const key = `${market.slug}\0${query}`;
      if (seen.has(key)) continue;
      seen.add(key);
      keywordRows.push({ market: market.slug, marketName: market.name, suffix: market.suffix, ...base, query });
    }
  }

  const supplyRows = buildSupplyRows(supplyResult.rows);
  await Promise.all([
    writeFile(path.join(OUTPUT, "market-study-keyword-map.csv"), csvStringify(keywordRows, ["market", "marketName", "suffix", "category", "topic", "baseKeyword", "source", "query"])),
    writeFile(path.join(OUTPUT, "market-study-supply.csv"), csvStringify(supplyRows, ["market", "marketName", "locations", "organizations", "offerings", "category", "topic", "treatmentLocations"])),
    writeFile(path.join(OUTPUT, "market-study-treatment-inventory.csv"), csvStringify(treatmentResult.rows, ["category", "topic", "us_locations"])),
  ]);

  const batches = MARKETS.map((market) => ({
    market: market.slug,
    queries: keywordRows.filter((row) => row.market === market.slug).map((row) => row.query),
  }));
  console.log(JSON.stringify({ batches, keywordCount: keywordRows.length, supplyRows: supplyRows.length }));
}

async function readDiscovery() {
  const files = await readdir(DISCOVERY).catch(() => []);
  const blockedLocations = /\b(miami|new york|nyc|los angeles|austin|scottsdale|phoenix|san diego|houston|tampa|las vegas|chicago|dallas|denver|san francisco|boston|atlanta|seattle)\b/i;
  const collected = [];
  for (const file of files.filter((name) => name.endsWith(".csv"))) {
    const slug = file.replace(/\.csv$/, "");
    const topic = DISCOVERY_TOPICS[slug];
    if (!topic) continue;
    const rows = parseCsv(await readFile(path.join(DISCOVERY, file), "utf8"), ";");
    const headers = rows.shift().map((value) => value.toLowerCase());
    const keywordIndex = headers.indexOf("keyword");
    const volumeIndex = headers.indexOf("search volume");
    const candidates = rows
      .map((row) => ({ keyword: normalizeKeyword(row[keywordIndex]), volume: Number(row[volumeIndex] || 0) }))
      .filter((row) => row.keyword && row.volume > 0 && !blockedLocations.test(row.keyword))
      .sort((left, right) => right.volume - left.volume)
      .slice(0, 20);
    for (const candidate of candidates) collected.push({ topic, ...candidate });
  }
  return collected;
}

function localize(keyword, suffix) {
  let value = normalizeKeyword(keyword);
  if (!value) return "";
  value = value.replace(/\bnear me\b/g, suffix).replace(/\bnearby\b/g, suffix);
  if (!value.includes(suffix)) value = `${value} ${suffix}`;
  return normalizeKeyword(value);
}

function buildSupplyRows(rows) {
  const output = [];
  for (const market of MARKETS) {
    const allowed = new Set(market.places.map(([locality, region]) => `${locality}\0${region}`));
    const marketRows = rows.filter((row) => allowed.has(`${row.locality}\0${row.region}`));
    const locations = new Set(marketRows.map((row) => row.location_id));
    const organizations = new Set(marketRows.map((row) => row.org_id).filter(Boolean));
    const offerings = new Set(marketRows.map((row) => row.offering_id).filter(Boolean));
    const topics = new Map();
    for (const row of marketRows) {
      if (!row.topic) continue;
      const group = topics.get(row.topic) || { category: row.category, locations: new Set() };
      group.locations.add(row.location_id);
      topics.set(row.topic, group);
    }
    for (const [topic, group] of topics) {
      output.push({ market: market.slug, marketName: market.name, locations: locations.size, organizations: organizations.size, offerings: offerings.size, category: group.category, topic, treatmentLocations: group.locations.size });
    }
  }
  return output;
}

async function analyze() {
  const mapRows = objectsFromCsv(await readFile(path.join(OUTPUT, "market-study-keyword-map.csv"), "utf8"));
  const supplyRows = objectsFromCsv(await readFile(path.join(OUTPUT, "market-study-supply.csv"), "utf8"));
  const metadata = new Map(mapRows.map((row) => [`${row.market}\0${normalizeKeyword(row.query)}`, row]));
  const detail = [];
  const availableFiles = new Set(await readdir(path.join(RAW, "semrush-markets")));
  const collectionStatus = {
    "new-york": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "los-angeles": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "miami": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "austin": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "scottsdale-phoenix": { attemptedQueries: 532, unqueriedDueToLimit: 50 },
    "san-diego": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "houston": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "tampa-bay": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "las-vegas": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "chicago": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "dallas-fort-worth": { attemptedQueries: 582, unqueriedDueToLimit: 0 },
    "denver-boulder": { attemptedQueries: 542, unqueriedDueToLimit: 40 },
    "san-francisco-bay": { attemptedQueries: 0, unqueriedDueToLimit: 582 },
  };

  for (const market of MARKETS.filter((item) => availableFiles.has(`${item.slug}.csv`))) {
    const rawPath = path.join(RAW, "semrush-markets", `${market.slug}.csv`);
    const text = await readFile(rawPath, "utf8");
    for (const metric of parseSemrushCsv(text)) {
      const meta = metadata.get(`${market.slug}\0${normalizeKeyword(metric.keyword)}`);
      if (!meta) continue;
      detail.push({ market: market.slug, marketName: market.name, ...meta, ...metric });
    }
  }

  const supply = new Map(supplyRows.map((row) => [`${row.market}\0${row.topic}`, Number(row.treatmentLocations || 0)]));
  const topicGroups = group(detail, (row) => `${row.market}\0${row.topic}`);
  const topicSummary = [];
  for (const rows of topicGroups.values()) {
    const first = rows[0];
    const volume = sum(rows, "avgMonthlySearches");
    const treatmentLocations = supply.get(`${first.market}\0${first.topic}`) || 0;
    const weightedCpc = weightedAverage(rows, "averageCpc", "avgMonthlySearches");
    const paidCompetition = weightedAverage(rows.map((row) => ({ ...row, competitionNumber: Number(row.competition || 0) })), "competitionNumber", "avgMonthlySearches");
    const top = [...rows].sort((a, b) => Number(b.avgMonthlySearches || 0) - Number(a.avgMonthlySearches || 0))[0];
    topicSummary.push({ market: first.market, marketName: first.marketName, category: first.category, topic: first.topic, queryBasketVolume: volume, measuredQueries: rows.length, topQuery: top.keyword, topQueryVolume: top.avgMonthlySearches, weightedCpc: round(weightedCpc), paidCompetition: round(paidCompetition), treatmentLocations, demandPerLocation: round(volume / Math.max(1, treatmentLocations)) });
  }

  scoreOpportunities(topicSummary);
  const categoryGroups = group(topicSummary, (row) => `${row.market}\0${row.category}`);
  const categorySummary = [...categoryGroups.values()].map((rows) => ({
    market: rows[0].market,
    marketName: rows[0].marketName,
    category: rows[0].category,
    queryBasketVolume: sum(rows, "queryBasketVolume"),
    measuredTreatments: rows.length,
    treatmentLocations: sum(rows, "treatmentLocations"),
    medianOpportunityScore: median(rows.map((row) => row.opportunityScore)),
  })).sort((a, b) => b.queryBasketVolume - a.queryBasketVolume);

  const marketSummary = MARKETS.filter((item) => availableFiles.has(`${item.slug}.csv`)).map((market) => {
    const rows = topicSummary.filter((row) => row.market === market.slug);
    const supplyRow = supplyRows.find((row) => row.market === market.slug);
    const returnedQueries = detail.filter((row) => row.market === market.slug).length;
    const status = collectionStatus[market.slug];
    return {
      market: market.slug,
      marketName: market.name,
      queryBasketVolume: sum(rows, "queryBasketVolume"),
      measuredTreatments: rows.length,
      locations: Number(supplyRow?.locations || 0),
      organizations: Number(supplyRow?.organizations || 0),
      offerings: Number(supplyRow?.offerings || 0),
      attemptedQueries: status.attemptedQueries,
      returnedQueries,
      returnedRate: round(100 * returnedQueries / Math.max(1, status.attemptedQueries)),
      unqueriedDueToLimit: status.unqueriedDueToLimit,
      medianOpportunityScore: median(rows.map((row) => row.opportunityScore)),
    };
  }).sort((a, b) => b.queryBasketVolume - a.queryBasketVolume);

  await Promise.all([
    writeFile(path.join(OUTPUT, "market-study-keyword-results.csv"), csvStringify(detail, ["market", "marketName", "category", "topic", "source", "baseKeyword", "keyword", "avgMonthlySearches", "averageCpc", "competition"])),
    writeFile(path.join(OUTPUT, "market-study-topic-opportunities.csv"), csvStringify(topicSummary.sort((a, b) => b.opportunityScore - a.opportunityScore), ["market", "marketName", "category", "topic", "queryBasketVolume", "measuredQueries", "topQuery", "topQueryVolume", "weightedCpc", "paidCompetition", "treatmentLocations", "demandPerLocation", "opportunityScore"])),
    writeFile(path.join(OUTPUT, "market-study-category-summary.csv"), csvStringify(categorySummary, ["market", "marketName", "category", "queryBasketVolume", "measuredTreatments", "treatmentLocations", "medianOpportunityScore"])),
    writeFile(path.join(OUTPUT, "market-study-market-summary.csv"), csvStringify(marketSummary, ["market", "marketName", "queryBasketVolume", "measuredTreatments", "locations", "organizations", "offerings", "attemptedQueries", "returnedQueries", "returnedRate", "unqueriedDueToLimit", "medianOpportunityScore"])),
    writeFile(path.join(OUTPUT, "market-study-summary.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), collectionStatus, markets: marketSummary, categories: categorySummary, opportunities: topicSummary }, null, 2)}\n`),
  ]);
  console.log(JSON.stringify({ detailRows: detail.length, topicRows: topicSummary.length, marketSummary }, null, 2));
}

function objectsFromCsv(text) {
  const rows = parseCsv(text);
  const headers = rows.shift();
  return rows.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function group(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const values = groups.get(key) || [];
    values.push(row);
    groups.set(key, values);
  }
  return groups;
}

function sum(rows, field) { return rows.reduce((total, row) => total + Number(row[field] || 0), 0); }
function weightedAverage(rows, field, weightField) {
  const weight = sum(rows, weightField);
  return weight ? rows.reduce((total, row) => total + Number(row[field] || 0) * Number(row[weightField] || 0), 0) / weight : 0;
}
function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2);
}
function round(value) { return Math.round(Number(value || 0) * 100) / 100; }

function scoreOpportunities(rows) {
  const byMarket = group(rows, (row) => row.market);
  for (const marketRows of byMarket.values()) {
    const logDemand = marketRows.map((row) => Math.log1p(row.queryBasketVolume));
    const logGap = marketRows.map((row) => Math.log1p(row.demandPerLocation));
    const cpc = marketRows.map((row) => row.weightedCpc);
    const competition = marketRows.map((row) => row.paidCompetition);
    for (let index = 0; index < marketRows.length; index += 1) {
      const score = 100 * (0.4 * percentile(logDemand[index], logDemand) + 0.35 * percentile(logGap[index], logGap) + 0.15 * percentile(cpc[index], cpc) + 0.1 * percentile(competition[index], competition));
      marketRows[index].opportunityScore = round(score);
    }
  }
}

function percentile(value, values) {
  if (values.length <= 1) return 1;
  return values.filter((candidate) => candidate <= value).length / values.length;
}
