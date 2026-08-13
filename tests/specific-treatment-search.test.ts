import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

type TreatmentSearchPayload = {
  total: number;
  results: Array<{ treatments?: Array<{ name: string }> }>;
  resolved_treatment?: { id: number; name: string; category: string };
};

describe("specific canonical treatment search", () => {
  beforeAll(() => {
    loadEnvFile(path.join(process.cwd(), ".env.local"));
    loadEnvFile(path.join(process.cwd(), ".env.production.local"));
  });

  test.each([
    ["BPC-157", "BPC-157"],
    ["BPC157", "BPC-157"],
    ["MOTS-C", "MOTS-C"],
    ["Myers Cocktail", "Myers' Cocktail IV"],
    ["Full-body MRI", "Whole-body MRI"],
    ["Dysport", "Dysport"],
    ["Rapamycin", "Rapamycin"],
  ])("resolves %s to the specific leaf %s", async (query, canonicalName) => {
    const { searchLocations } = await import("../src/lib/queries");
    const payload = await searchLocations({ kind: "locations", q: query }) as TreatmentSearchPayload;

    expect(payload.resolved_treatment?.name).toBe(canonicalName);
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.results.every((result) => result.treatments?.some(
      (treatment) => treatment.name === canonicalName,
    ))).toBe(true);
  });

  test("keeps peptide-family search broader than an exact BPC-157 search", async () => {
    const { searchLocations } = await import("../src/lib/queries");
    const [family, bpc] = await Promise.all([
      searchLocations({ kind: "locations", q: "Peptide therapy" }) as Promise<TreatmentSearchPayload>,
      searchLocations({ kind: "locations", q: "BPC-157" }) as Promise<TreatmentSearchPayload>,
    ]);

    expect(family.resolved_treatment?.name).toBe("Peptide therapy");
    expect(bpc.resolved_treatment?.name).toBe("BPC-157");
    expect(family.total).toBeGreaterThan(bpc.total);
  });
});

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/u);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/gu, "");
  }
}
