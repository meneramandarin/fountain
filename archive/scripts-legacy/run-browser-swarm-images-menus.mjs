#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.phaseDate || "20260708";
const tier = Number.parseInt(options.tier || "1", 10);
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const concurrency = Number.parseInt(options.concurrency || "4", 10);
const maxSites = options.maxSites ? Number.parseInt(options.maxSites, 10) : Infinity;
const model = options.model || "z-ai/glm-4.5v";
const outDir = path.resolve(ROOT, options.outDir || "swarm-browser-output");
const outputPath = path.resolve(outDir, options.output || `swarm-images-menus-tier${tier}-${phaseDate}.json`);
const checkpointPath = path.resolve(outDir, options.checkpoint || `swarm-images-menus-tier${tier}-${phaseDate}.checkpoint.json`);
const jobsTable = options.jobsTable || `browser_swarm_jobs_${phaseDate}`;
const excludeJobsTables = parseListOption(options.excludeJobsTable || options.excludeJobsTables);
const imageLogTable = options.imageLogTable || `browser_swarm_image_ingest_${phaseDate}`;
const resultsDir = path.resolve(ROOT, options.resultsDir || `swarm-browser-output/results/tier${tier}-${phaseDate}`);
const stopFile = path.resolve(ROOT, options.stopFile || `swarm-browser-output/STOP-tier${tier}-${phaseDate}`);
const maxTierCostUsd = Number.parseFloat(options.maxTierCostUsd || "60");
const claimTimeoutMinutes = Number.parseInt(options.claimTimeoutMinutes || "45", 10);
const inputCostPerMillion = Number.parseFloat(options.inputCostPerMillion || "0.60");
const outputCostPerMillion = Number.parseFloat(options.outputCostPerMillion || "1.80");
const estimatedInputTokensPerSite = Number.parseInt(options.estimatedInputTokensPerSite || "32000", 10);
const estimatedOutputTokensPerSite = Number.parseInt(options.estimatedOutputTokensPerSite || "2000", 10);
const userAgent = options.userAgent || "FountainBot/1.0 (+https://fountain.clinic)";
const countryCodes = parseListOption(options.countryCodes || options.countryCode).map((value) => value.toUpperCase());

const nonClinicDomains = new Set([
  "acuityscheduling.com",
  "apple.com",
  "as.me",
  "bit.ly",
  "bookimed.com",
  "booksy.com",
  "calendly.com",
  "clientsecure.me",
  "facebook.com",
  "fresha.com",
  "g.page",
  "glossgenius.com",
  "gofundme.com",
  "goo.gl",
  "google.com",
  "health-tourism.com",
  "instagram.com",
  "linkedin.com",
  "linktr.ee",
  "maps.app.goo.gl",
  "mapquest.com",
  "mindbody.io",
  "mindbodyonline.com",
  "mymeditravel.com",
  "opencare.com",
  "patientnow.com",
  "placidway.com",
  "realself.com",
  "rymaps.xyz",
  "square.site",
  "squarespace.com",
  "tiktok.com",
  "vagaro.com",
  "webflow.io",
  "weence.com",
  "wixsite.com",
  "yelp.com",
  "youtube.com",
  "zenoti.com",
  "zoca.com",
  "zocdoc.com",
  "europepmc.org",
]);

const genericMenuLabels = new Set([
  "about",
  "all",
  "all services",
  "appointments",
  "blog",
  "book",
  "book now",
  "booking",
  "care",
  "classes",
  "class",
  "company",
  "conditions",
  "consultation",
  "consultations",
  "contact",
  "contact us",
  "events",
  "event",
  "faq",
  "faqs",
  "featured products",
  "financing options",
  "get started",
  "gift card",
  "gift cards",
  "home",
  "learn more",
  "locations",
  "location",
  "login",
  "membership",
  "memberships",
  "men",
  "menu",
  "new patient form",
  "online booking",
  "our treatments",
  "package",
  "packages",
  "patient forms",
  "patient resources",
  "plans",
  "plan",
  "prices",
  "price",
  "pricing",
  "products",
  "product",
  "projects",
  "read more",
  "research",
  "resources",
  "schedule",
  "services",
  "service",
  "shop",
  "specials",
  "store",
  "testing",
  "test",
  "tests",
  "testimonials",
  "therapies",
  "therapy",
  "treatments",
  "treatment",
  "virtual sessions",
  "wellness",
  "women",
]);

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

const openRouterKey = options.openRouterKey || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY;
if (!openRouterKey && !options.dryRun && !options.preflightOnly) {
  throw new Error("Missing OPENROUTER_API_KEY.");
}

mkdirSync(outDir, { recursive: true });

const report = loadJson(outputPath, {
  phaseDate,
  tier,
  model,
  outputPath: path.relative(ROOT, outputPath),
  startedAt: new Date().toISOString(),
  completedAt: null,
  cost: {
    inputCostPerMillion,
    outputCostPerMillion,
    estimatedInputTokensPerSite,
    estimatedOutputTokensPerSite,
    estimatedUsd: 0,
    actualUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  },
  candidates: null,
  results: [],
});

const checkpoint = loadJson(checkpointPath, { doneSiteOrigins: [] });
const done = new Set(checkpoint.doneSiteOrigins);
const humanRejectedImageKeys = new Set();
const client = createPgClient();
client.on("error", (error) => {
  console.warn(`Postgres connection error after candidate load: ${error.message || error}`);
});

if (options.pool) {
  await runPoolOrchestrator();
} else if (options.workerId) {
  await runPoolWorker();
} else {
  await runSequential();
}

async function runSequential() {
try {
  await client.connect();
  await loadHumanRejectedImageKeys();
  const candidates = await loadCandidates();
  await client.end();
  report.candidates = summarizeCandidates(candidates);
  report.cost.estimatedUsd = estimateCost(candidates.length);
  writeJson(outputPath, report);

  console.log(JSON.stringify({ tier, candidateSites: candidates.length, estimateUsd: report.cost.estimatedUsd }, null, 2));
  if (report.cost.estimatedUsd > maxTierCostUsd && !options.confirmOverGate) {
    throw new Error(`Tier ${tier} estimate ${report.cost.estimatedUsd} exceeds max tier gate ${maxTierCostUsd}. Pass --confirm-over-gate to run.`);
  }
  if (options.preflightOnly || options.dryRun) {
    process.exit(0);
  }

  const queue = candidates.filter((site) => !done.has(site.site_origin)).slice(0, Number.isFinite(maxSites) ? maxSites : undefined);
  const browser = await chromium.launch({ headless: true });
  try {
    await runWorkers(queue, concurrency, async (site) => {
      const result = await processSite(browser, site);
      report.results.push(result);
      addUsage(result.usage);
      done.add(site.site_origin);
      checkpoint.doneSiteOrigins = [...done];
      writeJson(checkpointPath, checkpoint);
      writeJson(outputPath, report);
      if (report.cost.actualUsd > maxTierCostUsd && !options.confirmOverGate) {
        throw new Error(`Actual OpenRouter cost ${report.cost.actualUsd.toFixed(4)} exceeded max tier gate ${maxTierCostUsd}.`);
      }
    });
  } finally {
    await browser.close();
  }
  report.completedAt = new Date().toISOString();
  writeJson(outputPath, report);
  console.log(JSON.stringify(summarizeReport(report), null, 2));
  console.log(`wrote ${path.relative(ROOT, outputPath)}`);
} finally {
  if (!client._ending && !client._ended) {
    await client.end().catch(() => {});
  }
}
}

async function runPoolOrchestrator() {
  const workerCount = Math.max(1, Math.min(Number.parseInt(options.workers || "12", 10), 20));
  warnIfMemoryTight(workerCount);
  mkdirSync(resultsDir, { recursive: true });
  const orchestrationClient = createPgClient();
  await orchestrationClient.connect();
  try {
    const allCandidates = await withClient(orchestrationClient, loadCandidates);
    const candidates = allCandidates.slice(0, Number.isFinite(maxSites) ? maxSites : undefined);
    const estimateUsd = estimateCost(candidates.length);
    console.log(JSON.stringify({ tier, candidateSites: candidates.length, totalCandidateSites: allCandidates.length, estimateUsd, workers: workerCount, jobsTable: `${rawSchema}.${jobsTable}` }, null, 2));
    if (estimateUsd > maxTierCostUsd && !options.confirmOverGate) {
      throw new Error(`Tier ${tier} estimate ${estimateUsd} exceeds max tier gate ${maxTierCostUsd}. Pass --confirm-over-gate to run.`);
    }
    await ensureJobsTable(orchestrationClient);
    await seedJobs(orchestrationClient, candidates);
    await markExistingResultsDone(orchestrationClient);
    await reaper(orchestrationClient);
    if (options.preflightOnly || options.dryRun) {
      const status = await loadPoolStatus(orchestrationClient, Date.now());
      console.log(JSON.stringify({ ...status, preflightOnly: true }, null, 2));
      return;
    }
  } finally {
    await orchestrationClient.end();
  }

  const startedAt = Date.now();
  const workers = [];
  for (let index = 1; index <= workerCount; index += 1) {
    workers.push(spawnWorker(index));
  }

  const statusIntervalMs = Number.parseInt(options.statusIntervalMs || "300000", 10);
  let stoppedForBudget = false;
  let lastStatusAt = 0;
  while (workers.some((worker) => worker.exitCode === null)) {
    await sleep(5000);
    const monitorClient = createPgClient();
    await monitorClient.connect();
    try {
      await reaper(monitorClient);
      const now = Date.now();
      if (now - lastStatusAt >= statusIntervalMs) {
        lastStatusAt = now;
        const status = await loadPoolStatus(monitorClient, startedAt);
        console.log(JSON.stringify(status, null, 2));
      }
      const status = await loadPoolStatus(monitorClient, startedAt);
      if (status.projectedUsd > maxTierCostUsd && !options.confirmOverGate) {
        stoppedForBudget = true;
        writeJson(stopFile, { reason: "projected_cost_exceeded_gate", status, stoppedAt: new Date().toISOString() });
        console.error(`Projected cost ${status.projectedUsd} exceeds gate ${maxTierCostUsd}; wrote ${path.relative(ROOT, stopFile)}.`);
        break;
      }
      if (existsSync(stopFile)) {
        console.log(`STOP file present: ${path.relative(ROOT, stopFile)}`);
        break;
      }
      if (status.pending === 0 && status.claimed === 0) {
        break;
      }
    } finally {
      await monitorClient.end().catch(() => {});
    }
  }

  if (stoppedForBudget || existsSync(stopFile)) {
    for (const worker of workers) {
      if (worker.exitCode === null) {
        worker.kill("SIGTERM");
      }
    }
  }
  await Promise.all(workers.map(waitForExit));

  const finalClient = createPgClient();
  await finalClient.connect();
  try {
    const finalStatus = await loadPoolStatus(finalClient, startedAt);
    console.log(JSON.stringify(finalStatus, null, 2));
  } finally {
    await finalClient.end();
  }
}

async function runPoolWorker() {
  const workerId = String(options.workerId);
  mkdirSync(resultsDir, { recursive: true });
  const resultPath = path.join(resultsDir, `worker-${workerId}.jsonl`);
  await withFreshClient(loadHumanRejectedImageKeys);
  let browser = await chromium.launch({ headless: true });
  let processedWithBrowser = 0;
  try {
    while (!existsSync(stopFile)) {
      const claim = await withConnectedClient((pgClient) => claimJob(pgClient, workerId));
      if (!claim) {
        break;
      }
      let result;
      try {
        result = await processSite(browser, {
          site_origin: claim.site_origin,
          homepage_url: claim.homepage_url,
          locations: claim.locations,
        });
        appendJsonl(resultPath, result);
      } catch (error) {
        await withConnectedClient((pgClient) => markJobFailed(pgClient, claim.id, error.message || String(error))).catch((markError) => {
          console.warn(`worker ${workerId} could not mark job ${claim.id} failed: ${markError.message || markError}`);
        });
        throw error;
      }
      await withConnectedClient((pgClient) => markJobDone(pgClient, claim.id));
      processedWithBrowser += 1;
      if (processedWithBrowser >= 25) {
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: true });
        processedWithBrowser = 0;
      }
      await sleep(Number.parseInt(options.workerDelayMs || "750", 10));
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

function createPgClient() {
  const pgClient = new Client({
    connectionString: normalizePostgresConnectionString(connectionString),
    connectionTimeoutMillis: Number.parseInt(options.pgConnectTimeoutMs || "15000", 10),
    query_timeout: Number.parseInt(options.pgQueryTimeoutMs || "120000", 10),
  });
  pgClient.on("error", (error) => {
    console.warn(`Postgres connection error: ${error.message || error}`);
  });
  return pgClient;
}

async function withConnectedClient(fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const pgClient = createPgClient();
    try {
      await pgClient.connect();
      return await fn(pgClient);
    } catch (error) {
      lastError = error;
      await sleep(1000 * attempt);
    } finally {
      await pgClient.end().catch(() => {});
    }
  }
  throw lastError;
}

async function withFreshClient(fn) {
  return withConnectedClient((pgClient) => withClient(pgClient, fn));
}

async function withClient(pgClient, fn) {
  const previousQuery = client.query.bind(client);
  client.query = pgClient.query.bind(pgClient);
  try {
    return await fn();
  } finally {
    client.query = previousQuery;
  }
}

function spawnWorker(index) {
  const args = [
    "scripts/run-browser-swarm-images-menus.mjs",
    "--worker-id", String(index),
    "--tier", String(tier),
    "--phase-date", phaseDate,
    "--jobs-table", jobsTable,
    "--results-dir", path.relative(ROOT, resultsDir),
    "--stop-file", path.relative(ROOT, stopFile),
    "--max-tier-cost-usd", String(maxTierCostUsd),
    "--model", model,
  ];
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[worker ${index}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[worker ${index}] ${chunk}`));
  return child;
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once("exit", resolve));
}

async function ensureJobsTable(pgClient) {
  await pgClient.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}`);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)} (
      id bigserial PRIMARY KEY,
      tier integer NOT NULL,
      site_origin text NOT NULL,
      homepage_url text NOT NULL,
      locations jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      claimed_by text,
      claimed_at timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tier, site_origin),
      CHECK (status IN ('pending', 'claimed', 'done', 'failed'))
    )
  `);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS ${quoteIdent(`${jobsTable}_claim_idx`)} ON ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)} (tier, status, id)`);
}

async function seedJobs(pgClient, candidates) {
  for (let index = 0; index < candidates.length; index += 500) {
    const batch = candidates.slice(index, index + 500);
    const params = [];
    const values = batch.map((candidate) => {
      const offset = params.length;
      params.push(tier, candidate.site_origin, candidate.homepage_url, JSON.stringify(candidate.locations));
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb)`;
    });
    await pgClient.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)} (tier, site_origin, homepage_url, locations)
      VALUES ${values.join(", ")}
      ON CONFLICT (tier, site_origin) DO UPDATE SET
        homepage_url = EXCLUDED.homepage_url,
        locations = EXCLUDED.locations,
        updated_at = now()
    `, params);
  }
}

async function markExistingResultsDone(pgClient) {
  const completedOrigins = new Set();
  if (existsSync(outputPath)) {
    const existing = JSON.parse(readFileSync(outputPath, "utf8"));
    for (const result of existing.results || []) {
      if (result.site_origin) completedOrigins.add(result.site_origin);
    }
  }
  for (const file of jsonlFiles()) {
    for (const result of readJsonl(file)) {
      if (result.site_origin) completedOrigins.add(result.site_origin);
    }
  }
  if (!completedOrigins.size) {
    return;
  }
  await pgClient.query(`
    UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)}
    SET status = 'done',
        claimed_by = NULL,
        claimed_at = NULL,
        updated_at = now()
    WHERE tier = $1
      AND site_origin = ANY($2::text[])
  `, [tier, [...completedOrigins]]);
}

async function claimJob(pgClient, workerId) {
  const result = await pgClient.query(`
    WITH next AS (
      SELECT id
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)}
      WHERE tier = $1
        AND status = 'pending'
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)} j
    SET status = 'claimed',
        claimed_by = $2,
        claimed_at = now(),
        updated_at = now()
    FROM next
    WHERE j.id = next.id
    RETURNING j.*
  `, [tier, workerId]);
  if (!result.rows[0]) {
    return null;
  }
  const row = result.rows[0];
  return { ...row, locations: Array.isArray(row.locations) ? row.locations : JSON.parse(row.locations) };
}

async function markJobDone(pgClient, id) {
  await pgClient.query(`
    UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)}
    SET status = 'done',
        claimed_by = NULL,
        claimed_at = NULL,
        updated_at = now()
    WHERE id = $1
  `, [id]);
}

async function markJobFailed(pgClient, id, error) {
  await pgClient.query(`
    UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)}
    SET status = 'failed',
        attempts = attempts + 1,
        last_error = $2,
        claimed_by = NULL,
        claimed_at = NULL,
        updated_at = now()
    WHERE id = $1
  `, [id, cleanText(error, 1000)]);
}

async function reaper(pgClient) {
  await pgClient.query(`
    UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)}
    SET attempts = attempts + 1,
        status = CASE WHEN attempts + 1 >= 2 THEN 'failed' ELSE 'pending' END,
        last_error = 'stale_claim_reaped',
        claimed_by = NULL,
        claimed_at = NULL,
        updated_at = now()
    WHERE tier = $1
      AND status = 'claimed'
      AND claimed_at < now() - make_interval(mins => $2)
  `, [tier, claimTimeoutMinutes]);
}

async function loadPoolStatus(pgClient, startedAt) {
  const counts = await pgClient.query(`
    SELECT status, count(*)::integer AS count
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(jobsTable)}
    WHERE tier = $1
    GROUP BY status
  `, [tier]);
  const map = Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count)]));
  const jsonlResults = jsonlFiles().flatMap(readJsonl);
  const existingResults = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")).results || [] : [];
  const allResults = [...existingResults, ...jsonlResults];
  const resultOrigins = allResults.map((result) => result.site_origin).filter(Boolean);
  const distinctResultOriginCount = new Set(resultOrigins).size;
  const doneCount = Number(map.done || 0);
  const elapsedHours = Math.max((Date.now() - startedAt) / 3_600_000, 0.001);
  const sitesPerHour = doneCount / elapsedHours;
  const actualUsd = allResults.reduce((sum, result) => sum + Number(result.usage?.usd || 0), 0);
  const totalJobs = Object.values(map).reduce((sum, count) => sum + count, 0);
  const projectedUsd = doneCount ? (actualUsd / doneCount) * totalJobs : estimateCost(totalJobs);
  return {
    tier,
    pending: Number(map.pending || 0),
    claimed: Number(map.claimed || 0),
    done: doneCount,
    failed: Number(map.failed || 0),
    totalJobs,
    distinctResultOrigins: distinctResultOriginCount,
    duplicateResultOrigins: resultOrigins.length - distinctResultOriginCount,
    noOriginProcessedTwice: resultOrigins.length === distinctResultOriginCount,
    doneHasMatchingResultCount: distinctResultOriginCount === doneCount,
    sitesPerHour: Number(sitesPerHour.toFixed(2)),
    etaHours: sitesPerHour ? Number(((Number(map.pending || 0) + Number(map.claimed || 0)) / sitesPerHour).toFixed(2)) : null,
    imagesProposed: allResults.reduce((sum, result) => sum + (result.images || []).length, 0),
    menuItemsExtracted: allResults.reduce((sum, result) => sum + (result.menu_items || []).length, 0),
    actualUsd: Number(actualUsd.toFixed(4)),
    projectedUsd: Number(projectedUsd.toFixed(2)),
  };
}

async function loadCandidates() {
  if (tier === 1) {
    return groupedRows(`
      SELECT
        r.site_origin,
        min(c.normalized_url) AS homepage_url,
        jsonb_agg(jsonb_build_object('location_id', c.location_id, 'name', c.name, 'slug', c.slug, 'locality', c.locality, 'region', c.region, 'country_code', c.country_code) ORDER BY c.location_id) AS locations
      FROM ${quoteIdent(rawSchema)}.website_image_harvest_results_${phaseDate} r
      JOIN ${quoteIdent(rawSchema)}.website_image_harvest_candidates_${phaseDate} c USING (site_origin)
      WHERE r.outcome = 'bot_blocked'
        AND c.candidate_status = 'candidate'
      GROUP BY r.site_origin
      ORDER BY r.site_origin
    `);
  }
  if (tier === 2) {
    return groupedRows(`
      SELECT
        r.site_origin,
        min(c.normalized_url) AS homepage_url,
        jsonb_agg(jsonb_build_object('location_id', c.location_id, 'name', c.name, 'slug', c.slug, 'locality', c.locality, 'region', c.region, 'country_code', c.country_code) ORDER BY c.location_id) AS locations
      FROM ${quoteIdent(rawSchema)}.website_image_harvest_results_${phaseDate} r
      JOIN ${quoteIdent(rawSchema)}.website_image_harvest_candidates_${phaseDate} c USING (site_origin)
      WHERE c.candidate_status = 'candidate'
        AND (
          r.outcome = 'no_candidate_found'
          OR (r.outcome = 'fetch_failed' AND (r.reason = 'timeout' OR r.reason = 'http_429' OR r.reason ~ '^http_5'))
        )
      GROUP BY r.site_origin
      ORDER BY r.site_origin
    `);
  }
  if (tier === 3) {
    const params = [];
    const countryFilter = countryCodes.length ? `AND l.country_code = ANY($${params.push(countryCodes)}::text[])` : "";
    const rows = await client.query(`
      SELECT
        l.id AS location_id,
        l.name,
        l.slug,
        l.website,
        l.locality,
        l.region,
        l.country_code
      FROM ${quoteIdent(schema)}.locations l
      WHERE l.status = 'active'
        AND l.deleted_at IS NULL
        AND coalesce(l.is_virtual, false) = false
        AND coalesce(nullif(trim(l.website), ''), '') <> ''
        AND EXISTS (
          SELECT 1
          FROM ${quoteIdent(schema)}.images img
          WHERE img.entity_type = 'location'
            AND img.entity_id = l.id
            AND img.status = 'active'
            AND img.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM ${quoteIdent(schema)}.offerings o
          WHERE o.location_id = l.id
            AND o.deleted_at IS NULL
            AND o.price_amount IS NOT NULL
        )
        ${countryFilter}
      ORDER BY l.id
    `, params);
    const byOrigin = new Map();
    for (const location of rows.rows) {
      const normalized = normalizeWebsite(location.website);
      if (!normalized || isNonClinicDomain(normalized.host, normalized.domain)) {
        continue;
      }
      const existing = byOrigin.get(normalized.origin) || {
        site_origin: normalized.origin,
        homepage_url: normalized.homepageUrl,
        locations: [],
      };
      existing.locations.push({
        location_id: location.location_id,
        name: location.name,
        slug: location.slug,
        locality: location.locality,
        region: location.region,
        country_code: location.country_code,
      });
      byOrigin.set(normalized.origin, existing);
    }
    const excluded = await loadExcludedJobOrigins();
    return [...byOrigin.values()]
      .filter((candidate) => !excluded.has(candidate.site_origin))
      .sort((a, b) => a.site_origin.localeCompare(b.site_origin));
  }
  throw new Error(`Unsupported tier ${tier}`);
}

async function loadExcludedJobOrigins() {
  const origins = new Set();
  for (const table of excludeJobsTables) {
    if (!isSafeIdentifier(table)) {
      throw new Error(`Unsafe exclude jobs table: ${table}`);
    }
    const exists = await client.query("SELECT to_regclass($1) AS table_name", [`${rawSchema}.${table}`]);
    if (!exists.rows[0]?.table_name) {
      continue;
    }
    const result = await client.query(`
      SELECT site_origin
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(table)}
      WHERE tier = $1
        AND status IN ('done', 'pending', 'claimed')
    `, [tier]);
    for (const row of result.rows) {
      origins.add(row.site_origin);
    }
  }
  return origins;
}

async function groupedRows(sql) {
  const result = await client.query(sql);
  return result.rows.map((row) => ({
    ...row,
    locations: Array.isArray(row.locations) ? row.locations : JSON.parse(row.locations),
  }));
}

async function loadHumanRejectedImageKeys() {
  const table = `${rawSchema}.${imageLogTable}`;
  const exists = await client.query("SELECT to_regclass($1) AS table_name", [table]);
  if (!exists.rows[0]?.table_name) {
    return;
  }
  const result = await client.query(`
    SELECT location_id, image_url
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(imageLogTable)}
    WHERE outcome = 'human_rejected'
      AND coalesce(image_url, '') <> ''
  `);
  for (const row of result.rows) {
    humanRejectedImageKeys.add(imageKey(row.location_id, row.image_url));
  }
}

async function processSite(browser, site) {
  const startedAt = new Date().toISOString();
  const usage = emptyUsage();
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
  });
  await context.route("**/*", async (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType === "font" || resourceType === "media") {
      await route.abort();
      return;
    }
    await route.continue();
  });
  const visitedPages = [];
  try {
    const first = await visitPage(context, site.homepage_url);
    visitedPages.push(first);
    if (first.blocked) {
      await context.close();
      return siteResult(site, "permanently_blocked", { startedAt, visitedPages, usage, reason: first.blockReason });
    }
    const linkChoice = await chooseLinks(site, first, usage);
    const links = tier === 3 ? tier3Links(first, linkChoice.urls) : linkChoice.urls.slice(0, 3);
    for (const url of links) {
      if (visitedPages.some((page) => sameUrl(page.url, url))) {
        continue;
      }
      const next = await visitPage(context, url);
      visitedPages.push(next);
    }
    const extraction = await extractSiteData(site, visitedPages, usage);
    await context.close();
    return siteResult(site, "visited", {
      startedAt,
      visitedPages,
      usage,
      images: tier === 3 ? [] : sanitizeImages(extraction.images, site, visitedPages),
      menuItems: sanitizeMenuItems(extraction.menu_items, site),
      modelNotes: extraction.notes || null,
    });
  } catch (error) {
    await context.close().catch(() => {});
    return siteResult(site, "worker_error", {
      startedAt,
      visitedPages,
      usage,
      reason: error.message || String(error),
    });
  }
}

async function visitPage(context, url) {
  const page = await context.newPage();
  const loadedImages = new Set();
  page.on("response", (response) => {
    const type = response.headers()["content-type"] || "";
    if (type.toLowerCase().startsWith("image/")) {
      loadedImages.add(response.url());
    }
  });
  let responseStatus = null;
  let finalUrl = url;
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    responseStatus = response?.status() || null;
    finalUrl = page.url();
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
  } catch {
    // Give challenge pages one passive wait, then inspect whatever rendered.
    await page.waitForTimeout(20_000).catch(() => {});
    finalUrl = page.url();
  }

  const blocked = await isBrowserBlocked(page, responseStatus);
  const summary = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const title = document.title || "";
    const links = [...document.querySelectorAll("a[href]")]
      .map((a) => ({
        href: a.href,
        text: (a.innerText || a.getAttribute("aria-label") || a.title || "").replace(/\s+/g, " ").trim().slice(0, 120),
      }))
      .filter((link) => link.href && link.text);
    const images = [...document.images]
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: (img.alt || img.title || "").replace(/\s+/g, " ").trim().slice(0, 160),
        naturalWidth: img.naturalWidth || 0,
        naturalHeight: img.naturalHeight || 0,
        width: img.width || 0,
        height: img.height || 0,
      }))
      .filter((img) => img.src);
    return { title, text, links, images };
  }).catch(() => ({ title: "", text: "", links: [], images: [] }));
  const screenshot = await page.screenshot({ type: "jpeg", quality: 62, fullPage: false }).catch(() => null);
  await page.close().catch(() => {});

  const internalLinks = prioritizeLinks(summary.links, finalUrl).slice(0, 40);
  const images = mergeImages(summary.images, loadedImages, finalUrl).slice(0, 80);
  return {
    requestedUrl: url,
    url: finalUrl,
    status: responseStatus,
    title: cleanText(summary.title, 180),
    text: cleanText(summary.text, 9000),
    links: internalLinks,
    images,
    screenshot: screenshot ? `data:image/jpeg;base64,${screenshot.toString("base64")}` : null,
    blocked,
    blockReason: blocked ? "challenge_or_bot_block_page" : null,
  };
}

async function isBrowserBlocked(page, status) {
  if (status === 403 || status === 429) {
    return true;
  }
  const text = await page.evaluate(() => `${document.title}\n${document.body?.innerText || ""}`.slice(0, 5000)).catch(() => "");
  return /cloudflare|cf-chl|attention required|captcha|recaptcha|hcaptcha|access denied|bot detection|verify you are human|checking your browser/i.test(text);
}

async function chooseLinks(site, firstPage, usage) {
  const system = "You are a careful web extraction assistant. Return strict JSON only.";
  const prompt = {
    task: "Choose up to 3 internal pages likely to contain clinic pricing, services, menus, treatments, packages, gallery, facility photos, or about content. Prefer dedicated pricing, menu, packages, services, or treatments pages over homepage section links. Do not choose external URLs. Return {\"urls\":[...],\"notes\":\"...\"}.",
    site_origin: site.site_origin,
    locations: site.locations,
    homepage: pageForModel(firstPage, { includeImages: true, includeLinks: true, includeText: true }),
  };
  const response = await callOpenRouter(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: JSON.stringify(prompt) },
          ...(firstPage.screenshot ? [{ type: "image_url", image_url: { url: firstPage.screenshot } }] : []),
        ],
      },
    ],
    usage,
    900,
  );
  const parsed = parseJson(response.content, { urls: [], notes: "parse_failed" });
  return {
    urls: Array.isArray(parsed.urls) ? parsed.urls.filter((url) => isInternalUrl(url, site.site_origin)).slice(0, 3) : [],
    notes: parsed.notes || null,
  };
}

async function extractSiteData(site, pages, usage) {
  const system = [
    "You extract clinic website data from rendered pages.",
    "Return strict JSON only.",
    "Images: select only real facility/exterior/interior/treatment-room/equipment photos loaded by the clinic pages.",
    "Reject logos, icons, text-heavy banners, stock photos, staff headshots unless nothing else exists, before/after images, and team grids.",
    "Menus: extract only service menu items literally present on visited pages. Do not infer services or prices.",
    "A menu item may only be emitted if it has a price on the page OR it is a specific named treatment/service: a branded name, device name, or descriptive multi-word service.",
    "Do not emit section headings, nav link text, category labels, audience labels, or generic words such as services, treatments, memberships, testing, injections, pricing, packages, contact, about, book now, shop, blog, FAQ, home, specials, events, men, women, wellness, or virtual sessions.",
    "If the text is a heading that groups other items, it is not an item.",
    "Prefer items from dedicated pricing, services, menu, packages, or treatment pages over homepage sections.",
    "For ranges, use the low bound as price_amount and put 'from' plus any qualifier in price_context.",
    "Never use 0 as price_amount. For free consultations, booking CTAs, delivery, membership eligibility, audience labels, or scheduling-only rows, omit the item. For a genuinely free named service, set price_amount null and include 'free' in price_context.",
    "Keep thousands separators correctly: $1,270 means 1270, never 1.27.",
  ].join(" ");
  const prompt = {
    task: "Extract image candidates and menu items for the listed locations from the rendered pages. Return JSON with keys: images, menu_items, notes. Images item shape: {location_id, image_url, source_page_url, llm_confidence, rejection_notes}; llm_confidence must be a number from 0 to 1. Menu item shape: {location_id, raw_name, price_amount, price_currency, price_context, source_page_url}. Cap images at 3 per location and menu_items at 40 per location.",
    tier,
    site_origin: site.site_origin,
    locations: site.locations,
    pages: pages.map((page) => pageForModel(page, { includeImages: true, includeLinks: false, includeText: true })),
  };
  const screenshots = pages
    .filter((page) => page.screenshot)
    .slice(0, 4)
    .map((page) => ({ type: "image_url", image_url: { url: page.screenshot } }));
  const response = await callOpenRouter(
    [
      { role: "system", content: system },
      { role: "user", content: [{ type: "text", text: JSON.stringify(prompt) }, ...screenshots] },
    ],
    usage,
    4200,
  );
  return parseJson(response.content, { images: [], menu_items: [], notes: "parse_failed" });
}

async function callOpenRouter(messages, usage, maxTokens) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${openRouterKey}`,
        "content-type": "application/json",
        "http-referer": "https://fountain.clinic",
        "x-title": "Fountain browser swarm",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        const retryAfter = Number.parseFloat(response.headers.get("retry-after") || "");
        const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1500 * attempt * attempt;
        await sleep(delayMs);
        continue;
      }
      throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
    }
    const json = await response.json();
    const item = json.choices?.[0]?.message;
    const tokenUsage = json.usage || {};
    const promptTokens = Number(tokenUsage.prompt_tokens || 0);
    const completionTokens = Number(tokenUsage.completion_tokens || 0);
    usage.promptTokens += promptTokens;
    usage.completionTokens += completionTokens;
    usage.totalTokens += Number(tokenUsage.total_tokens || promptTokens + completionTokens);
    usage.usd += costFromTokens(promptTokens, completionTokens);
    return { content: item?.content || "{}", raw: json };
  }
  throw new Error("OpenRouter retry loop exhausted");
}

function pageForModel(page, { includeImages, includeLinks, includeText }) {
  return {
    url: page.url,
    status: page.status,
    title: page.title,
    text: includeText ? cleanText(page.text, 5500) : "",
    links: includeLinks ? page.links : [],
    images: includeImages ? page.images : [],
  };
}

function sanitizeImages(images, site, visitedPages) {
  if (!Array.isArray(images)) {
    return [];
  }
  const allowedLocationIds = new Set(site.locations.map((location) => Number(location.location_id)));
  const loaded = new Map();
  for (const page of visitedPages || []) {
    for (const image of page.images || []) {
      loaded.set(image.src, true);
    }
  }
  return images
    .map((image) => ({
      location_id: Number(image.location_id),
      image_url: String(image.image_url || "").trim(),
      source_page_url: String(image.source_page_url || "").trim(),
      llm_confidence: parseConfidence(image.llm_confidence),
      rejection_notes: image.rejection_notes ? String(image.rejection_notes).slice(0, 500) : null,
    }))
    .filter((image) => allowedLocationIds.has(image.location_id) && image.image_url && loaded.has(image.image_url))
    .filter((image) => !humanRejectedImageKeys.has(imageKey(image.location_id, image.image_url)));
}

function sanitizeMenuItems(items, site) {
  if (!Array.isArray(items)) {
    return [];
  }
  const allowedLocationIds = new Set(site.locations.map((location) => Number(location.location_id)));
  const perLocation = new Map();
  const result = [];
  for (const item of items) {
    const locationId = Number(item.location_id);
    if (!allowedLocationIds.has(locationId)) {
      continue;
    }
    const count = perLocation.get(locationId) || 0;
    if (count >= 40) {
      continue;
    }
    const rawName = cleanText(item.raw_name || "", 220);
    if (!rawName) {
      continue;
    }
    const priceAmount = item.price_amount === null || item.price_amount === undefined || item.price_amount === "" ? null : Number(item.price_amount);
    if ((priceAmount === null || !Number.isFinite(priceAmount)) && isGenericMenuLabel(rawName)) {
      continue;
    }
    result.push({
      location_id: locationId,
      raw_name: rawName,
      price_amount: Number.isFinite(priceAmount) ? priceAmount : null,
      price_currency: item.price_currency ? cleanText(item.price_currency, 12).toUpperCase() : null,
      price_context: item.price_context ? cleanText(item.price_context, 260) : null,
      source_page_url: item.source_page_url ? cleanText(item.source_page_url, 1000) : null,
    });
    perLocation.set(locationId, count + 1);
  }
  return result;
}

function isGenericMenuLabel(value) {
  return genericMenuLabels.has(simpleMenuName(value));
}

function simpleMenuName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseConfidence(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return 0;
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, numeric));
  }
  if (text.includes("very high")) {
    return 0.95;
  }
  if (text.includes("high")) {
    return 0.85;
  }
  if (text.includes("medium") || text.includes("moderate")) {
    return 0.65;
  }
  if (text.includes("low")) {
    return 0.35;
  }
  return 0;
}

function siteResult(site, outcome, extras) {
  const result = {
    tier,
    site_origin: site.site_origin,
    homepage_url: site.homepage_url,
    locations: site.locations,
    outcome,
    reason: extras.reason || null,
    started_at: extras.startedAt,
    processed_at: new Date().toISOString(),
    visited_pages: (extras.visitedPages || []).map((page) => ({
      url: page.url,
      status: page.status,
      title: page.title,
      blocked: page.blocked,
      image_count: page.images?.length || 0,
    })),
    images: extras.images || [],
    menu_items: extras.menuItems || [],
    model_notes: extras.modelNotes || null,
    usage: extras.usage || emptyUsage(),
  };
  if (extras.visitedPages) {
    result.loaded_image_urls = [...new Set(extras.visitedPages.flatMap((page) => (page.images || []).map((image) => image.src)))].slice(0, 200);
  }
  return result;
}

function prioritizeLinks(links, finalUrl) {
  const seen = new Set();
  const base = new URL(finalUrl);
  return links
    .filter((link) => {
      try {
        const url = new URL(link.href, finalUrl);
        if (url.origin !== base.origin) {
          return false;
        }
        url.hash = "";
        const key = url.toString();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      } catch {
        return false;
      }
    })
    .map((link) => {
      const text = `${link.text} ${link.href}`.toLowerCase();
      const score =
        /(price|pricing|menu|service|services|treatment|treatments|package|packages|membership|plans)/.test(text) ? 100 :
        /(gallery|photos|tour|facility|about|clinic|location)/.test(text) ? 60 :
        10;
      return { ...link, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...link }) => link);
}

function tier3Links(firstPage, chosenUrls) {
  const chosen = chosenUrls.slice(0, 3);
  if (chosen.some(isPricingLikeUrl)) {
    return chosen;
  }
  const pricingLink = (firstPage.links || []).find((link) => isPricingLikeLink(link));
  if (pricingLink?.href) {
    return [pricingLink.href, ...chosen.filter((url) => !sameUrl(url, pricingLink.href))].slice(0, 3);
  }
  const serviceLink = (firstPage.links || []).find((link) => isServiceLikeLink(link));
  if (serviceLink?.href) {
    return [serviceLink.href];
  }
  return chosen.slice(0, 1);
}

function isPricingLikeLink(link) {
  return isPricingLikeText(`${link?.text || ""} ${link?.href || ""}`);
}

function isPricingLikeUrl(url) {
  return isPricingLikeText(url);
}

function isPricingLikeText(value) {
  return /(price|pricing|menu|menus|package|packages|membership|memberships|plans|rates|fees|cost)/i.test(String(value || ""));
}

function isServiceLikeLink(link) {
  return /(service|services|treatment|treatments|therapy|therapies|program|programs)/i.test(`${link?.text || ""} ${link?.href || ""}`);
}

function mergeImages(domImages, loadedImages, finalUrl) {
  const byUrl = new Map();
  for (const image of domImages || []) {
    const src = normalizeUrl(image.src, finalUrl);
    if (!src) {
      continue;
    }
    byUrl.set(src, { ...image, src });
  }
  for (const url of loadedImages) {
    if (!byUrl.has(url)) {
      byUrl.set(url, { src: url, alt: "", naturalWidth: 0, naturalHeight: 0, width: 0, height: 0 });
    }
  }
  return [...byUrl.values()]
    .filter((image) => image.src && !isJunkImageUrl(image.src, image.alt))
    .sort((a, b) => (Number(b.naturalWidth || b.width || 0) * Number(b.naturalHeight || b.height || 0)) - (Number(a.naturalWidth || a.width || 0) * Number(a.naturalHeight || a.height || 0)))
    .slice(0, 80);
}

function isJunkImageUrl(url, alt = "") {
  const text = `${url} ${alt}`.toLowerCase();
  return /\.(svg|ico|gif)(\?|$)/.test(text) || /logo|icon|favicon|badge|sprite|avatar/.test(text);
}

function isInternalUrl(url, siteOrigin) {
  try {
    return new URL(url).origin === siteOrigin;
  } catch {
    return false;
  }
}

function sameUrl(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = "";
    right.hash = "";
    return left.toString() === right.toString();
  } catch {
    return a === b;
  }
}

function normalizeUrl(value, base) {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function imageKey(locationId, imageUrl) {
  return `${Number(locationId) || ""}|${String(imageUrl || "").trim()}`;
}

function summarizeCandidates(candidates) {
  return {
    siteOrigins: candidates.length,
    locations: candidates.reduce((sum, site) => sum + site.locations.length, 0),
  };
}

function summarizeReport(value) {
  const outcomes = {};
  for (const result of value.results) {
    outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
  }
  return {
    tier: value.tier,
    results: value.results.length,
    outcomes,
    imagesProposed: value.results.reduce((sum, result) => sum + result.images.length, 0),
    menuItemsExtracted: value.results.reduce((sum, result) => sum + result.menu_items.length, 0),
    actualUsd: Number(value.cost.actualUsd.toFixed(4)),
    promptTokens: value.cost.promptTokens,
    completionTokens: value.cost.completionTokens,
  };
}

function addUsage(usage) {
  report.cost.promptTokens += usage.promptTokens;
  report.cost.completionTokens += usage.completionTokens;
  report.cost.totalTokens += usage.totalTokens;
  report.cost.actualUsd = Number((report.cost.actualUsd + usage.usd).toFixed(8));
}

function emptyUsage() {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, usd: 0 };
}

function costFromTokens(promptTokens, completionTokens) {
  return (promptTokens / 1_000_000) * inputCostPerMillion + (completionTokens / 1_000_000) * outputCostPerMillion;
}

function estimateCost(siteCount) {
  return Number((costFromTokens(siteCount * estimatedInputTokensPerSite, siteCount * estimatedOutputTokensPerSite) * 1.25).toFixed(4));
}

function parseListOption(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(parseListOption);
  }
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function jsonlFiles() {
  if (!existsSync(resultsDir)) {
    return [];
  }
  return readdirSync(resultsDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .map((name) => path.join(resultsDir, name));
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function appendJsonl(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function warnIfMemoryTight(workerCount) {
  const estimatedBytes = workerCount * 300 * 1024 * 1024;
  const availableBytes = os.freemem();
  if (estimatedBytes > availableBytes * 0.75) {
    console.warn(`Worker pool memory warning: ${workerCount} browsers may need ~${Math.round(estimatedBytes / 1024 / 1024)}MB; OS reports ~${Math.round(availableBytes / 1024 / 1024)}MB free.`);
  }
}

async function runWorkers(items, workerCount, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, workerCount) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function parseJson(text, fallback) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeWebsite(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\d?\./, "");
    const origin = `${url.protocol}//${url.host}`;
    return {
      homepageUrl: new URL("/", origin).toString(),
      origin,
      host,
      domain: registrableDomain(host),
    };
  } catch {
    return null;
  }
}

function registrableDomain(host) {
  const parts = String(host || "").split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (/^(co|com|org|net|ac|gov)\.[a-z]{2}$/i.test(lastTwo) && parts.length >= 3) {
    return lastThree;
  }
  return lastTwo;
}

function isNonClinicDomain(host, domain) {
  if (!host || !domain) {
    return true;
  }
  if (nonClinicDomains.has(host) || nonClinicDomains.has(domain)) {
    return true;
  }
  return [...nonClinicDomains].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""));
}

function normalizePostgresConnectionString(value) {
  const url = new URL(value);
  if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

function loadJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
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
    if (arg === "--tier") parsed.tier = args[++index];
    else if (arg === "--phase-date") parsed.phaseDate = args[++index];
    else if (arg === "--schema") parsed.schema = args[++index];
    else if (arg === "--raw-schema") parsed.rawSchema = args[++index];
    else if (arg === "--database-url") parsed.databaseUrl = args[++index];
    else if (arg === "--openrouter-key") parsed.openRouterKey = args[++index];
    else if (arg === "--model") parsed.model = args[++index];
    else if (arg === "--concurrency") parsed.concurrency = args[++index];
    else if (arg === "--max-sites") parsed.maxSites = args[++index];
    else if (arg === "--out-dir") parsed.outDir = args[++index];
    else if (arg === "--output") parsed.output = args[++index];
    else if (arg === "--checkpoint") parsed.checkpoint = args[++index];
    else if (arg === "--max-tier-cost-usd") parsed.maxTierCostUsd = args[++index];
    else if (arg === "--claim-timeout-minutes") parsed.claimTimeoutMinutes = args[++index];
    else if (arg === "--pg-connect-timeout-ms") parsed.pgConnectTimeoutMs = args[++index];
    else if (arg === "--pg-query-timeout-ms") parsed.pgQueryTimeoutMs = args[++index];
    else if (arg === "--estimated-input-tokens-per-site") parsed.estimatedInputTokensPerSite = args[++index];
    else if (arg === "--estimated-output-tokens-per-site") parsed.estimatedOutputTokensPerSite = args[++index];
    else if (arg === "--input-cost-per-million") parsed.inputCostPerMillion = args[++index];
    else if (arg === "--output-cost-per-million") parsed.outputCostPerMillion = args[++index];
    else if (arg === "--user-agent") parsed.userAgent = args[++index];
    else if (arg === "--country-code") parsed.countryCode = [...(parsed.countryCode || []), args[++index]];
    else if (arg === "--country-codes") parsed.countryCodes = args[++index];
    else if (arg === "--pool") parsed.pool = true;
    else if (arg === "--worker-id") parsed.workerId = args[++index];
    else if (arg === "--workers") parsed.workers = args[++index];
    else if (arg === "--jobs-table") parsed.jobsTable = args[++index];
    else if (arg === "--exclude-jobs-table") parsed.excludeJobsTable = [...(parsed.excludeJobsTable || []), args[++index]];
    else if (arg === "--exclude-jobs-tables") parsed.excludeJobsTables = args[++index];
    else if (arg === "--image-log-table") parsed.imageLogTable = args[++index];
    else if (arg === "--results-dir") parsed.resultsDir = args[++index];
    else if (arg === "--stop-file") parsed.stopFile = args[++index];
    else if (arg === "--status-interval-ms") parsed.statusIntervalMs = args[++index];
    else if (arg === "--worker-delay-ms") parsed.workerDelayMs = args[++index];
    else if (arg === "--confirm-over-gate") parsed.confirmOverGate = true;
    else if (arg === "--preflight-only") parsed.preflightOnly = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return parsed;
}
