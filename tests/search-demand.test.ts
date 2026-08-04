import { describe, expect, it } from "vitest";
import {
  attachKeywordMetadata,
  buildKeywordRows,
  parseKeywordPlannerCsv,
  parseSemrushCsv,
  summarize,
} from "../analysis/search-demand/lib.mjs";

describe("search demand analysis", () => {
  const treatments = [
    { category: "Optimize", name: "IV Infusions", locationCount: 100 },
    { category: "Measure", name: "Full-body MRI", locationCount: 50 },
  ];
  const aliases = {
    "IV Infusions": ["iv drip", "iv hydration"],
  };

  it("builds canonical, alias, and near-me keywords without duplicates", () => {
    const rows = buildKeywordRows(treatments, aliases);

    expect(rows.some((row) =>
      row.keyword === "iv drip"
      && row.category === "Optimize"
      && row.topic === "IV Infusions")).toBe(true);
    expect(rows.some((row) =>
      row.keyword === "iv drip near me"
      && row.intent === "near_me")).toBe(true);
    expect(new Set(rows.map((row) => row.keyword)).size).toBe(rows.length);
  });

  it("imports a Google Keyword Planner CSV with a preamble", () => {
    const csv = [
      "Keyword Stats 2025-08-01 at 12_00_00",
      "Currency,USD",
      "Keyword,Avg. monthly searches,Competition,Competition (indexed value),Top of page bid (low range),Top of page bid (high range)",
      "iv drip,\"1,000\",High,88,$4.25,$16.50",
      "full body mri,500,Medium,42,$2.00,$8.00",
    ].join("\n");

    expect(parseKeywordPlannerCsv(csv)).toEqual([
      {
        keyword: "iv drip",
        avgMonthlySearches: 1000,
        competition: "High",
        competitionIndex: 88,
        lowTopOfPageBid: 4.25,
        highTopOfPageBid: 16.5,
        averageCpc: null,
      },
      {
        keyword: "full body mri",
        avgMonthlySearches: 500,
        competition: "Medium",
        competitionIndex: 42,
        lowTopOfPageBid: 2,
        highTopOfPageBid: 8,
        averageCpc: null,
      },
    ]);
  });

  it("maps imported metrics and rolls them up by Fountain category", () => {
    const keywordRows = buildKeywordRows(treatments, aliases);
    const rows = attachKeywordMetadata([
      { keyword: "iv drip", avgMonthlySearches: 1000 },
      { keyword: "full body mri", avgMonthlySearches: 500 },
    ], keywordRows);

    expect(summarize(rows, "category")).toEqual([
      {
        label: "Optimize",
        estimatedMonthlySearches: 1000,
        measuredKeywords: 1,
        keywordsWithVolume: 1,
      },
      {
        label: "Measure",
        estimatedMonthlySearches: 500,
        measuredKeywords: 1,
        keywordsWithVolume: 1,
      },
    ]);
  });

  it("imports Semrush bulk metrics and maps a location suffix", () => {
    const rows = parseSemrushCsv([
      "Keyword;Search Volume;CPC;Competition",
      "iv drip miami;390;5.32;0.67",
    ].join("\n"));
    const mapped = attachKeywordMetadata(rows, buildKeywordRows(treatments, aliases), {
      keywordSuffix: "miami",
    });

    expect(mapped[0]).toMatchObject({
      keyword: "iv drip miami",
      avgMonthlySearches: 390,
      averageCpc: 5.32,
      category: "Optimize",
      topic: "IV Infusions",
      matched: true,
    });
  });
});
