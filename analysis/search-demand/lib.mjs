import { readFile } from "node:fs/promises";

const HEADER_CANDIDATES = {
  keyword: ["keyword"],
  avgMonthlySearches: ["avg monthly searches", "average monthly searches"],
  competition: ["competition"],
  competitionIndex: ["competition indexed value", "competition index"],
  lowTopOfPageBid: ["top of page bid low range", "low top of page bid"],
  highTopOfPageBid: ["top of page bid high range", "high top of page bid"],
  averageCpc: ["average cpc", "avg cpc"],
};

export function normalizeKeyword(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[®™]/g, "")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalKeyword(treatmentName) {
  return normalizeKeyword(treatmentName)
    .replace(/\bhrt\b/g, "")
    .replace(/\btrt\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildKeywordRows(treatments, aliases = {}) {
  const candidates = [];

  for (const treatment of treatments) {
    const canonical = canonicalKeyword(treatment.name);
    const phrases = [
      { phrase: canonical, variantType: "canonical" },
      ...(aliases[treatment.name] || []).map((phrase) => ({
        phrase: normalizeKeyword(phrase),
        variantType: "alias",
      })),
    ];

    for (const { phrase, variantType } of phrases) {
      if (!phrase) continue;
      candidates.push({
        category: treatment.category,
        topic: treatment.name,
        keyword: phrase,
        variantType,
        intent: "core",
        locationCount: Number(treatment.locationCount || 0),
      });
      candidates.push({
        category: treatment.category,
        topic: treatment.name,
        keyword: `${phrase} near me`,
        variantType,
        intent: "near_me",
        locationCount: Number(treatment.locationCount || 0),
      });
    }
  }

  const seen = new Set();
  return candidates
    .sort((left, right) =>
      right.locationCount - left.locationCount
      || left.category.localeCompare(right.category)
      || left.topic.localeCompare(right.topic)
      || left.keyword.localeCompare(right.keyword))
    .filter((row) => {
      const key = normalizeKeyword(row.keyword);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function csvStringify(rows, columns) {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

export function parseSemrushCsv(text) {
  const rows = parseCsv(text, ";");
  const headers = (rows[0] || []).map(normalizeHeader);
  const indexes = {
    keyword: headers.indexOf("keyword"),
    volume: headers.indexOf("search volume"),
    cpc: headers.indexOf("cpc"),
    competition: headers.indexOf("competition"),
  };
  if (indexes.keyword === -1 || indexes.volume === -1) {
    throw new Error("Could not find Semrush Keyword and Search Volume columns.");
  }

  return rows.slice(1)
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row) => ({
      keyword: cellAt(row, indexes.keyword),
      avgMonthlySearches: parseMetric(cellAt(row, indexes.volume)),
      competition: cellAt(row, indexes.competition) || null,
      competitionIndex: null,
      lowTopOfPageBid: null,
      highTopOfPageBid: null,
      averageCpc: parseMetric(cellAt(row, indexes.cpc)),
    }))
    .filter((row) => row.keyword);
}

export function parseKeywordPlannerCsv(text) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes("keyword")
      && normalized.some((header) => HEADER_CANDIDATES.avgMonthlySearches.includes(header));
  });

  if (headerIndex === -1) {
    throw new Error("Could not find a Keyword Planner header row with Keyword and Avg. monthly searches columns.");
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const indexes = Object.fromEntries(
    Object.entries(HEADER_CANDIDATES).map(([field, candidates]) => [
      field,
      headers.findIndex((header) => candidates.includes(header)),
    ]),
  );

  return rows.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row) => ({
      keyword: cellAt(row, indexes.keyword),
      avgMonthlySearches: parseMetric(cellAt(row, indexes.avgMonthlySearches)),
      competition: cellAt(row, indexes.competition) || null,
      competitionIndex: parseMetric(cellAt(row, indexes.competitionIndex)),
      lowTopOfPageBid: parseMetric(cellAt(row, indexes.lowTopOfPageBid)),
      highTopOfPageBid: parseMetric(cellAt(row, indexes.highTopOfPageBid)),
      averageCpc: parseMetric(cellAt(row, indexes.averageCpc)),
    }))
    .filter((row) => row.keyword);
}

export function attachKeywordMetadata(metricRows, keywordRows, options = {}) {
  const metadata = new Map(
    keywordRows.map((row) => [normalizeKeyword(row.keyword), row]),
  );
  const suffix = normalizeKeyword(options.keywordSuffix || "");

  return metricRows.map((metric) => {
    const normalized = normalizeKeyword(metric.keyword);
    const lookup = suffix && normalized.endsWith(` ${suffix}`)
      ? normalized.slice(0, -(suffix.length + 1))
      : normalized;
    const match = metadata.get(lookup);
    return {
      ...metric,
      category: match?.category || "Unmapped",
      topic: match?.topic || metric.keyword,
      variantType: match?.variantType || null,
      intent: match?.intent || null,
      matched: Boolean(match),
    };
  });
}

export function attachApiMetadata(apiResults, keywordRows) {
  const metadata = new Map(
    keywordRows.map((row) => [normalizeKeyword(row.keyword), row]),
  );

  return apiResults.map((result) => {
    const variants = [result.text, ...(result.closeVariants || [])]
      .map(normalizeKeyword)
      .filter(Boolean);
    const matches = variants.map((variant) => metadata.get(variant)).filter(Boolean);
    const primary = matches[0];
    const categories = [...new Set(matches.map((match) => match.category))];
    const topics = [...new Set(matches.map((match) => match.topic))];
    const metrics = result.keywordMetrics || {};

    return {
      keyword: result.text,
      closeVariants: result.closeVariants || [],
      avgMonthlySearches: parseMetric(metrics.avgMonthlySearches),
      competition: metrics.competition || null,
      competitionIndex: parseMetric(metrics.competitionIndex),
      lowTopOfPageBid: microsToCurrency(metrics.lowTopOfPageBidMicros),
      highTopOfPageBid: microsToCurrency(metrics.highTopOfPageBidMicros),
      averageCpc: microsToCurrency(metrics.averageCpcMicros),
      monthlySearchVolumes: metrics.monthlySearchVolumes || [],
      category: categories.length === 1 ? categories[0] : categories.length ? "Multiple" : "Unmapped",
      topic: topics.length === 1 ? topics[0] : topics.length ? topics.join(" / ") : result.text,
      variantType: primary?.variantType || null,
      intent: primary?.intent || null,
      matched: Boolean(primary),
    };
  });
}

export function summarize(rows, field) {
  const groups = new Map();

  for (const row of rows) {
    const label = row[field] || "Unmapped";
    const current = groups.get(label) || {
      label,
      estimatedMonthlySearches: 0,
      measuredKeywords: 0,
      keywordsWithVolume: 0,
    };
    current.estimatedMonthlySearches += Number(row.avgMonthlySearches || 0);
    current.measuredKeywords += 1;
    if (Number(row.avgMonthlySearches || 0) > 0) current.keywordsWithVolume += 1;
    groups.set(label, current);
  }

  return [...groups.values()].sort((left, right) =>
    right.estimatedMonthlySearches - left.estimatedMonthlySearches
    || left.label.localeCompare(right.label));
}

export function renderHtmlReport({ market, source, rows, categorySummary, topicSummary }) {
  const topKeywords = [...rows]
    .sort((left, right) => Number(right.avgMonthlySearches || 0) - Number(left.avgMonthlySearches || 0))
    .slice(0, 30);
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Search demand — ${escapeHtml(market.name)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #17231d; background: #f4f1e9; }
    body { margin: 0; }
    main { width: min(1120px, calc(100% - 40px)); margin: 48px auto 80px; }
    h1 { font-family: Georgia, serif; font-size: clamp(34px, 5vw, 58px); font-weight: 500; margin: 0 0 10px; }
    h2 { font-family: Georgia, serif; font-weight: 500; margin-top: 48px; }
    .meta { color: #657269; margin-bottom: 30px; }
    .note { background: #e5eee6; border: 1px solid #c6d7c8; border-radius: 14px; padding: 16px 18px; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 24px 0; }
    .card { background: #fff; border: 1px solid #dedbd2; border-radius: 16px; padding: 18px; }
    .card strong { display: block; font: 500 30px Georgia, serif; margin-top: 7px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 16px; overflow: hidden; }
    th, td { padding: 12px 14px; border-bottom: 1px solid #ece9e1; text-align: left; }
    th { color: #647168; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    td.number, th.number { text-align: right; font-variant-numeric: tabular-nums; }
    tr:last-child td { border-bottom: 0; }
    @media (max-width: 720px) { main { width: min(100% - 24px, 1120px); } table { font-size: 13px; } th, td { padding: 10px 8px; } }
  </style>
</head>
<body>
<main>
  <h1>Search demand in ${escapeHtml(market.name)}</h1>
  <p class="meta">Source: ${escapeHtml(source)} · Generated ${escapeHtml(generatedAt)}</p>
  <div class="note"><strong>Read this as searches, not people.</strong> Search-volume metrics describe query demand, and related keywords can express overlapping intent. Category totals are therefore directional rather than an audience census.</div>
  <div class="grid">
    <div class="card">Measured query clusters<strong>${formatNumber(rows.length)}</strong></div>
    <div class="card">Estimated monthly searches<strong>${formatNumber(rows.reduce((sum, row) => sum + Number(row.avgMonthlySearches || 0), 0))}</strong></div>
    <div class="card">Mapped to Fountain<strong>${formatNumber(rows.filter((row) => row.matched).length)}</strong></div>
  </div>
  <h2>Fountain categories</h2>
  ${renderSummaryTable(categorySummary, "Category")}
  <h2>Top treatment topics</h2>
  ${renderSummaryTable(topicSummary.slice(0, 30), "Treatment topic")}
  <h2>Top search queries</h2>
  <table>
    <thead><tr><th>Query</th><th>Topic</th><th>Category</th><th class="number">Avg. monthly searches</th><th>Competition</th></tr></thead>
    <tbody>${topKeywords.map((row) => `<tr><td>${escapeHtml(row.keyword)}</td><td>${escapeHtml(row.topic)}</td><td>${escapeHtml(row.category)}</td><td class="number">${formatNumber(row.avgMonthlySearches)}</td><td>${escapeHtml(row.competition || "—")}</td></tr>`).join("")}</tbody>
  </table>
</main>
</body>
</html>
`;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizeHeader(value) {
  return String(value || "")
    .toLocaleLowerCase("en-US")
    .replace(/[().]/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetric(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value)
    .trim()
    .replace(/[$€£,\s]/g, "")
    .toLocaleLowerCase("en-US");
  if (!normalized || normalized === "—" || normalized === "-") return null;
  const multiplier = normalized.endsWith("k") ? 1_000 : normalized.endsWith("m") ? 1_000_000 : 1;
  const number = Number.parseFloat(normalized.replace(/[km]$/, ""));
  return Number.isFinite(number) ? number * multiplier : null;
}

function microsToCurrency(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / 1_000_000 : null;
}

function cellAt(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const string = Array.isArray(value) || typeof value === "object"
    ? JSON.stringify(value)
    : String(value);
  return /[",\n\r]/.test(string) ? `"${string.replace(/"/g, "\"\"")}"` : string;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function renderSummaryTable(summary, label) {
  return `<table>
    <thead><tr><th>${escapeHtml(label)}</th><th class="number">Estimated monthly searches</th><th class="number">Measured clusters</th></tr></thead>
    <tbody>${summary.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td class="number">${formatNumber(row.estimatedMonthlySearches)}</td><td class="number">${formatNumber(row.measuredKeywords)}</td></tr>`).join("")}</tbody>
  </table>`;
}
