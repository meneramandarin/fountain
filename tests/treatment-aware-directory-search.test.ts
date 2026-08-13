import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

type LocationResult = {
  id: number;
  name: string;
  min_price_amount?: number | null;
  min_price_currency?: string | null;
  treatments?: Array<{ name: string }>;
};

type TreatmentSearchPayload = {
  results: LocationResult[];
  total: number;
  resolved_treatment?: { id: number; name: string; category: string };
  treatment_price_summaries?: Array<{ currency: string | null; minimum: number }>;
};

describe("treatment-aware directory search pricing", () => {
  beforeAll(() => {
    loadEnvFile(path.join(process.cwd(), ".env.local"));
    loadEnvFile(path.join(process.cwd(), ".env.production.local"));
  });

  test("resolves a typed treatment alias and prices cards from that treatment", async () => {
    const { searchLocations } = await import("../src/lib/queries");
    const { rows } = await import("../src/lib/db");
    const payload = await searchLocations({ kind: "locations", q: "MRI" }, 0, {
      includeTreatmentPriceSummaries: true,
    }) as TreatmentSearchPayload;

    expect(payload.total).toBeGreaterThan(0);
    expect(payload.resolved_treatment?.name).toBe("MRI");
    expect(payload.treatment_price_summaries?.some(
      (summary) => summary.currency === "USD" && summary.minimum > 0,
    )).toBe(true);
    expect(payload.results.every((result) => result.treatments?.some(
      (treatment) => treatment.name === "MRI" || treatment.name === "Whole-body MRI",
    ))).toBe(true);

    const genericPrices = await rows<{ lid: number; amount: number }>(
      `
      SELECT DISTINCT ON (offering.location_id)
        offering.location_id AS lid,
        offering.price_amount AS amount
      FROM offerings offering
      WHERE offering.location_id IN (${payload.results.map(() => "?").join(",")})
        AND offering.price_amount > 0
        AND COALESCE(NULLIF(TRIM(offering.price_unit), ''), 'service') IN ('service', 'session', 'visit')
        AND COALESCE(NULLIF(TRIM(offering.price_audience), ''), 'retail') = 'retail'
        AND offering.status = 'active'
        AND offering.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM offering_display_suppressions suppression
          WHERE suppression.offering_id = offering.id
            AND suppression.active
        )
      ORDER BY offering.location_id, offering.price_amount ASC, offering.id ASC
    `,
      payload.results.map((result) => result.id),
    );
    const genericPriceMap = new Map(
      genericPrices.map((price) => [Number(price.lid), Number(price.amount)]),
    );
    const treatmentSpecificResult = payload.results.find((result) => (
      result.min_price_amount != null
      && genericPriceMap.has(result.id)
      && Number(result.min_price_amount) !== genericPriceMap.get(result.id)
    ));

    expect(treatmentSpecificResult).toBeTruthy();
    expect(Number(treatmentSpecificResult?.min_price_amount)).toBeGreaterThan(
      genericPriceMap.get(treatmentSpecificResult!.id)!,
    );

    const clinicPayload = await searchLocations({
      kind: "locations",
      q: treatmentSpecificResult!.name,
    }) as TreatmentSearchPayload;
    const sameClinic = clinicPayload.results.find(
      (result) => result.id === treatmentSpecificResult!.id,
    );

    expect(clinicPayload.resolved_treatment).toBeUndefined();
    expect(Number(sameClinic?.min_price_amount)).toBe(
      genericPriceMap.get(treatmentSpecificResult!.id),
    );
  });
});

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = unquoteEnvValue(match[2].trim());
  }
}

function unquoteEnvValue(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
