export type Treatment = {
  category: string;
  name: string;
  locationCount?: number;
};

export type KeywordRow = {
  category: string;
  topic: string;
  keyword: string;
  variantType: "canonical" | "alias";
  intent: "core" | "near_me";
  locationCount: number;
};

export type MetricRow = {
  keyword: string;
  avgMonthlySearches: number | null;
  competition?: string | null;
  competitionIndex?: number | null;
  lowTopOfPageBid?: number | null;
  highTopOfPageBid?: number | null;
  averageCpc?: number | null;
};

export type AnalyzedMetricRow = MetricRow & {
  category: string;
  topic: string;
  variantType: KeywordRow["variantType"] | null;
  intent: KeywordRow["intent"] | null;
  matched: boolean;
};

export type SummaryRow = {
  label: string;
  estimatedMonthlySearches: number;
  measuredKeywords: number;
  keywordsWithVolume: number;
};

export function normalizeKeyword(value: unknown): string;
export function canonicalKeyword(treatmentName: string): string;
export function buildKeywordRows(
  treatments: Treatment[],
  aliases?: Record<string, string[]>,
): KeywordRow[];
export function csvStringify(
  rows: Array<Record<string, unknown>>,
  columns: string[],
): string;
export function parseCsv(text: string): string[][];
export function parseKeywordPlannerCsv(text: string): MetricRow[];
export function attachKeywordMetadata(
  metricRows: MetricRow[],
  keywordRows: KeywordRow[],
): AnalyzedMetricRow[];
export function attachApiMetadata(
  apiResults: Array<Record<string, unknown>>,
  keywordRows: KeywordRow[],
): AnalyzedMetricRow[];
export function summarize(
  rows: AnalyzedMetricRow[],
  field: "category" | "topic",
): SummaryRow[];
export function renderHtmlReport(input: {
  market: { name: string };
  source: string;
  rows: AnalyzedMetricRow[];
  categorySummary: SummaryRow[];
  topicSummary: SummaryRow[];
}): string;
export function readJson(filePath: string): Promise<unknown>;
