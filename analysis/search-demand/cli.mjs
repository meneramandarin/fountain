#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  attachApiMetadata,
  attachKeywordMetadata,
  buildKeywordRows,
  csvStringify,
  parseKeywordPlannerCsv,
  parseSemrushCsv,
  readJson,
  renderHtmlReport,
  summarize,
} from "./lib.mjs";
import {
  getDatabaseUrl,
  loadPipelineEnv,
  REPO_ROOT,
} from "../../scripts/lib/pipeline-env.mjs";

const WORKSPACE = path.join(REPO_ROOT, "analysis", "search-demand");
const RAW_DIR = path.join(WORKSPACE, "raw");
const OUTPUT_DIR = path.join(WORKSPACE, "output");
const METRIC_COLUMNS = [
  "market",
  "geoTargetId",
  "category",
  "topic",
  "keyword",
  "closeVariants",
  "intent",
  "variantType",
  "avgMonthlySearches",
  "competition",
  "competitionIndex",
  "lowTopOfPageBid",
  "highTopOfPageBid",
  "averageCpc",
  "matched",
];

loadPipelineEnv();

const [command = "help", ...argv] = process.argv.slice(2);
const options = parseArgs(argv);

try {
  if (command === "prepare") {
    await prepare(options);
  } else if (command === "fetch") {
    await fetchFromGoogleAds(options);
  } else if (command === "analyze") {
    await analyzeExport(options);
  } else if (command === "analyze-semrush") {
    await analyzeSemrushExport(options);
  } else {
    printHelp();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

async function prepare(options) {
  const context = await loadContext(options.market);
  const mapPath = path.join(OUTPUT_DIR, `${context.market.slug}-keyword-map.csv`);
  const inputPath = path.join(OUTPUT_DIR, `${context.market.slug}-keyword-planner-input.csv`);

  await ensureDirectories();
  await writeFile(mapPath, csvStringify(context.keywordRows, [
    "category",
    "topic",
    "keyword",
    "intent",
    "variantType",
    "locationCount",
  ]));
  await writeFile(
    inputPath,
    csvStringify(context.keywordRows.map((row) => ({ Keyword: row.keyword })), ["Keyword"]),
  );

  console.log(`Prepared ${context.keywordRows.length} keywords for ${context.market.name}.`);
  console.log(`Keyword Planner upload: ${inputPath}`);
  console.log(`Fountain mapping: ${mapPath}`);
  console.log(`Set the Keyword Planner location to ${context.market.name} (geo target ${context.market.googleAdsGeoTargetId}) before downloading results.`);
}

async function analyzeExport(options) {
  if (!options.input) {
    throw new Error("analyze requires --input <path-to-keyword-planner.csv>");
  }
  const context = await loadContext(options.market);
  const inputPath = path.resolve(REPO_ROOT, options.input);
  const plannerRows = parseKeywordPlannerCsv(await readFile(inputPath, "utf8"));
  const rows = attachKeywordMetadata(plannerRows, context.keywordRows);

  await writeOutputs({
    market: context.market,
    rows,
    source: `Google Keyword Planner CSV (${path.basename(inputPath)})`,
  });
}

async function analyzeSemrushExport(options) {
  if (!options.input) {
    throw new Error("analyze-semrush requires --input <path-to-semrush.csv>");
  }
  const context = await loadContext(options.market);
  const inputPath = path.resolve(REPO_ROOT, options.input);
  const metricRows = parseSemrushCsv(await readFile(inputPath, "utf8"));
  const rows = attachKeywordMetadata(metricRows, context.keywordRows, {
    keywordSuffix: options["keyword-suffix"] || "",
  });

  await writeOutputs({
    market: context.market,
    rows,
    source: `Semrush Keyword Analytics (${path.basename(inputPath)})`,
  });
}

async function fetchFromGoogleAds(options) {
  const context = await loadContext(options.market);
  const credentials = googleAdsCredentials();
  const accessToken = await refreshAccessToken(credentials);
  const version = process.env.GOOGLE_ADS_API_VERSION || "v24";
  const customerId = credentials.customerId.replace(/\D/g, "");
  const endpoint = `https://googleads.googleapis.com/${version}/customers/${customerId}:generateKeywordHistoricalMetrics`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": credentials.developerToken,
  };
  if (credentials.loginCustomerId) {
    headers["login-customer-id"] = credentials.loginCustomerId.replace(/\D/g, "");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      keywords: context.keywordRows.map((row) => row.keyword),
      geoTargetConstants: [`geoTargetConstants/${context.market.googleAdsGeoTargetId}`],
      keywordPlanNetwork: "GOOGLE_SEARCH",
      language: `languageConstants/${context.market.languageConstantId}`,
      historicalMetricsOptions: {
        includeAverageCpc: true,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Ads API request failed (${response.status}): ${JSON.stringify(body)}`);
  }

  await ensureDirectories();
  const rawPath = path.join(RAW_DIR, `${context.market.slug}-${dateStamp()}-google-ads.json`);
  await writeFile(rawPath, `${JSON.stringify(body, null, 2)}\n`);

  const rows = attachApiMetadata(body.results || [], context.keywordRows);
  await writeOutputs({
    market: context.market,
    rows,
    source: `Google Ads API ${version}`,
  });
  console.log(`Raw API response: ${rawPath}`);
}

async function loadContext(marketSlug = "miami-fl") {
  const [markets, aliases, treatments] = await Promise.all([
    readJson(path.join(WORKSPACE, "markets.json")),
    readJson(path.join(WORKSPACE, "aliases.json")),
    loadTreatments(),
  ]);
  const market = markets.find((candidate) => candidate.slug === marketSlug);
  if (!market) {
    throw new Error(`Unknown market "${marketSlug}". Available: ${markets.map((item) => item.slug).join(", ")}`);
  }
  return {
    market,
    keywordRows: buildKeywordRows(treatments, aliases),
  };
}

async function loadTreatments() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required to read Fountain's current treatment taxonomy.");
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        t.category,
        t.canonical_name AS name,
        COUNT(DISTINCT o.location_id)::int AS location_count
      FROM fountain.treatments t
      LEFT JOIN fountain.offerings o ON o.treatment_id = t.id
      WHERE t.category IS NOT NULL
      GROUP BY t.category, t.canonical_name
      ORDER BY location_count DESC, t.category, t.canonical_name
    `);
    return result.rows.map((row) => ({
      category: row.category,
      name: row.name,
      locationCount: Number(row.location_count || 0),
    }));
  } finally {
    await client.end();
  }
}

async function writeOutputs({ market, rows, source }) {
  const categorySummary = summarize(rows, "category");
  const topicSummary = summarize(rows, "topic");
  const prefix = path.join(OUTPUT_DIR, `${market.slug}-${dateStamp()}`);
  const resultsPath = `${prefix}-keyword-results.csv`;
  const categoriesPath = `${prefix}-categories.csv`;
  const topicsPath = `${prefix}-topics.csv`;
  const reportPath = `${prefix}-report.html`;

  await ensureDirectories();
  await Promise.all([
    writeFile(resultsPath, csvStringify(rows.map((row) => ({
      ...row,
      market: market.name,
      geoTargetId: market.googleAdsGeoTargetId,
    })), METRIC_COLUMNS)),
    writeFile(categoriesPath, csvStringify(categorySummary, [
      "label",
      "estimatedMonthlySearches",
      "measuredKeywords",
      "keywordsWithVolume",
    ])),
    writeFile(topicsPath, csvStringify(topicSummary, [
      "label",
      "estimatedMonthlySearches",
      "measuredKeywords",
      "keywordsWithVolume",
    ])),
    writeFile(reportPath, renderHtmlReport({
      market,
      source,
      rows,
      categorySummary,
      topicSummary,
    })),
  ]);

  const ivRows = rows.filter((row) =>
    row.topic === "IV Infusions"
    || row.keyword.toLocaleLowerCase("en-US").includes("iv drip"));
  const ivSearches = ivRows.reduce((sum, row) => sum + Number(row.avgMonthlySearches || 0), 0);
  const unmapped = rows.filter((row) => !row.matched).length;

  console.log(`Analyzed ${rows.length} keyword clusters for ${market.name}.`);
  console.log(`IV Infusions query-family estimate: ${Math.round(ivSearches).toLocaleString("en-US")} monthly searches.`);
  if (unmapped) console.log(`Unmapped result rows: ${unmapped}. Review ${resultsPath}.`);
  console.log(`HTML report: ${reportPath}`);
  console.log(`Category summary: ${categoriesPath}`);
  console.log(`Treatment topics: ${topicsPath}`);
  console.log("These figures estimate searches, not unique people.");
}

async function ensureDirectories() {
  await Promise.all([
    mkdir(RAW_DIR, { recursive: true }),
    mkdir(OUTPUT_DIR, { recursive: true }),
  ]);
}

function googleAdsCredentials() {
  const credentials = {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || "",
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "",
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
  };
  const missing = Object.entries(credentials)
    .filter(([key, value]) => key !== "loginCustomerId" && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing Google Ads credentials in .env.local: ${missing.join(", ")}`);
  }
  return credentials;
}

async function refreshAccessToken(credentials) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Google OAuth refresh failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    parsed[key] = next && !next.startsWith("--") ? next : true;
    if (parsed[key] !== true) index += 1;
  }
  return parsed;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function printHelp() {
  console.log(`Fountain search-demand analysis

Commands:
  npm run search-demand:prepare -- --market miami-fl
  npm run search-demand:analyze -- --market miami-fl --input analysis/search-demand/raw/miami.csv
  npm run search-demand:analyze-semrush -- --market miami-fl --keyword-suffix miami --input analysis/search-demand/raw/miami-fl-semrush.csv
  npm run search-demand:fetch -- --market miami-fl

prepare writes a one-column Keyword Planner upload and its Fountain taxonomy map.
analyze imports a Keyword Planner CSV download.
analyze-semrush imports a Semrush bulk-keyword CSV and can map a location suffix.
fetch uses Google Ads API OAuth credentials from .env.local.`);
}
