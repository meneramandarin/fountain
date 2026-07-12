import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as menuModule from "../pipeline/tasks/menu_extract.mjs";

const {
  buildTreatmentMap,
  crawlMenuPages,
  extractMenuPageUrls,
  extractOfferingsWithLlm,
  guardedApplyMenuExtraction,
  handleMenuExtract,
  MENU_EXTRACT_RESPONSE_FORMAT,
  normalizeExtractedOfferings,
  normalizeMenuTerm,
} = menuModule;

describe("menu extraction task", () => {
  test("selects same-origin pricing and service pages from cached homepage links", async () => {
    const homepage = `
      <a href="/about">About</a>
      <a href="/services">Treatments & Services</a>
      <a href="/pricing">View Pricing</a>
      <a href="https://booking.example/menu">External menu</a>
    `;
    expect(extractMenuPageUrls(homepage, "https://clinic.example/", { limit: 3 })).toEqual([
      "https://clinic.example/pricing",
      "https://clinic.example/services",
    ]);

    const fetchHomepage = vi.fn(async (url: string) => ({
      ok: true,
      outcome: "ok",
      requestedUrl: url,
      finalUrl: url,
      status: 200,
      title: url.endsWith("pricing") ? "Pricing" : "Clinic",
      cached: true,
      html: url === "https://clinic.example/"
        ? homepage
        : url.endsWith("pricing")
          ? "<main>IV Therapy — $150 per session</main>"
          : "<main>Red Light Therapy</main>",
    }));
    const result = await crawlMenuPages("https://clinic.example/", { fetchHomepage }, { pageLimit: 3 });

    expect(result.pages).toHaveLength(3);
    expect(result.pages.map((page: { final_url: string }) => page.final_url)).toEqual([
      "https://clinic.example/",
      "https://clinic.example/pricing",
      "https://clinic.example/services",
    ]);
    expect(result.pages[1].content).toContain("IV Therapy — $150 per session");
    expect(fetchHomepage).toHaveBeenCalledTimes(3);
  });

  test("normalizes treatment terms with the active matcher and detects ambiguous aliases", () => {
    expect(normalizeMenuTerm("Introductory NAD+ IV Therapy — 60 minutes"))
      .toBe("nad iv therapy");
    expect(normalizeMenuTerm("Platelet-Rich Plasma $750"))
      .toBe("platelet rich plasma");

    const map = buildTreatmentMap([
      { treatment_id: 10, term: "IV Therapy", normalized_term: "iv therapy" },
      { treatment_id: 11, term: "Cryotherapy", normalized_term: "cryotherapy" },
      { treatment_id: 12, term: "Cryo Therapy", normalized_term: "cryotherapy" },
    ]);
    expect(map.get("iv therapy")).toEqual({ status: "mapped", treatment_id: 10 });
    expect(map.get("cryotherapy")).toEqual({ status: "ambiguous", treatment_ids: [11, 12] });
  });

  test("requires crawled verbatim evidence, specificity, confidence, and explicit prices", () => {
    const pages = [{
      ok: true,
      requested_url: "https://clinic.example/pricing",
      final_url: "https://clinic.example/pricing",
      content: "IV Therapy — $150 per session. Quantum Renewal Protocol available. Red Light Therapy — $99.",
    }];
    const treatmentMap = buildTreatmentMap([
      { treatment_id: 10, term: "IV Therapy", normalized_term: "iv therapy" },
      { treatment_id: 20, term: "Red Light Therapy", normalized_term: "red light therapy" },
    ]);
    const normalized = normalizeExtractedOfferings({ offerings: [
      proposed("IV Therapy", "IV Therapy — $150 per session.", { price_amount: 150, price_currency: "USD" }),
      proposed("Services", "Services"),
      proposed("Mystery", "Mystery"),
      proposed("Hallucinated Therapy", "Hallucinated Therapy — $99"),
      proposed("Red Light Therapy", "Red Light Therapy — $99.", {
        price_amount: 199,
        price_currency: "USD",
      }),
      proposed("Quantum Renewal Protocol", "Quantum Renewal Protocol available."),
      proposed("Low Confidence Therapy", "Low Confidence Therapy", { confidence: 0.4 }),
    ] }, pages, { treatmentMap, countryCode: "US" });

    expect(normalized.offerings).toEqual([
      expect.objectContaining({
        raw_name: "IV Therapy",
        treatment_id: 10,
        mapping_status: "mapped",
        price_amount: 150,
        price_currency: "USD",
      }),
      expect.objectContaining({
        raw_name: "Red Light Therapy",
        treatment_id: 20,
        price_amount: null,
        price_currency: null,
        price_rejection: "price_amount_not_in_evidence",
      }),
      expect.objectContaining({
        raw_name: "Quantum Renewal Protocol",
        treatment_id: null,
        mapping_status: "unmapped",
      }),
    ]);
    expect(normalized.rejected.map((item: { reason: string }) => item.reason)).toEqual([
      "generic_or_navigation_label",
      "evidence_not_found_on_page",
      "evidence_not_found_on_page",
      "below_confidence_threshold",
    ]);
  });

  test("uses default-tier structured extraction and includes only bounded cached page evidence", async () => {
    const complete = vi.fn(async (request: unknown) => {
      void request;
      return {
        content: JSON.stringify({ offerings: [], notes: "No menu found." }),
        model: "openai/gpt-4o-mini",
        externalCallId: "700",
        costEstimateUsd: 0.001,
      };
    });
    const result = await extractOfferingsWithLlm({
      location: eligibleLocation(),
      pages: [{
        ok: true,
        requested_url: "https://clinic.example/pricing",
        final_url: "https://clinic.example/pricing",
        title: "Pricing",
        content: "IV Therapy — $150 per session.",
      }],
      runId: "17",
      llmClient: { complete },
    });

    expect(result).toMatchObject({
      parsed: { offerings: [], notes: "No menu found." },
      model: "openai/gpt-4o-mini",
      external_call_id: "700",
      cost_estimate_usd: 0.001,
    });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      runId: "17",
      entityId: 42,
      tier: "default",
      callType: "menu_extract",
      responseFormat: MENU_EXTRACT_RESPONSE_FORMAT,
      temperature: 0,
      maxTokens: 2_400,
    }));
  });

  test("composes crawl, metered extraction, alias mapping, and guarded apply as a queue handler", async () => {
    const page = {
      ok: true,
      outcome: "ok",
      requested_url: "https://clinic.example/pricing",
      final_url: "https://clinic.example/pricing",
      status: 200,
      title: "Pricing",
      cached: true,
      deduplicated: false,
      cache_path: "/tmp/pricing.json",
      content: "IV Therapy — $150 per session.",
    };
    const crawl = vi.fn(async () => ({
      website: "https://clinic.example/",
      attempted_urls: ["https://clinic.example/pricing"],
      pages: [page],
    }));
    const extract = vi.fn(async () => ({
      parsed: {
        offerings: [proposed("IV Therapy", "IV Therapy — $150 per session.", {
          price_amount: 150,
          price_currency: "USD",
        })],
        notes: "",
      },
      model: "openai/gpt-4o-mini",
      external_call_id: "701",
      cost_estimate_usd: 0.001,
    }));
    const apply = vi.fn(async () => ({
      attempted: true,
      written: true,
      counts: { inserted: 1 },
      outcomes: [],
      serving_write: {
        attempted: true,
        written: true,
        offerings_inserted: 1,
        prices_backfilled: 0,
        treatments_backfilled: 0,
        existing_prices_overwritten: 0,
      },
    }));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM fountain.locations location")) return { rows: [eligibleLocation()] };
      if (sql.includes("FROM fountain.treatments treatment")) {
        return { rows: [{ treatment_id: 10, term: "IV Therapy", normalized_term: "iv therapy" }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await handleMenuExtract({
      task: { id: 9, entity_type: "location", entity_id: 42 },
      run: { id: 17 },
    }, {
      query,
      webClient: {},
      llmClient: {},
      crawl,
      extract,
      apply,
    });

    expect(result).toMatchObject({
      outcome: "menu_applied",
      accepted: [{
        raw_name: "IV Therapy",
        treatment_id: 10,
        mapping_status: "mapped",
        price_amount: 150,
        price_currency: "USD",
      }],
      extraction: { model: "openai/gpt-4o-mini", external_call_id: "701" },
      serving_write: { written: true, offerings_inserted: 1 },
    });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      locationId: 42,
      sourceId: 256,
      offerings: [expect.objectContaining({ treatment_id: 10 })],
      taskId: "9",
      runId: "17",
    }), expect.any(Object));
  });

  test("inserts mapped and unmapped offerings atomically and records taxonomy evidence", async () => {
    const tx = menuTransaction({ existing: [] });
    const recordWrite = permissiveLedger(tx);
    const setActor = vi.fn(async () => undefined);
    const result = await guardedApplyMenuExtraction({
      locationId: 42,
      website: "https://clinic.example/",
      sourceId: 256,
      offerings: [
        normalizedOffering("IV Therapy", { treatment_id: 10, price_amount: 150, price_currency: "USD" }),
        normalizedOffering("Quantum Renewal Protocol"),
      ],
      taskId: "9",
      runId: "17",
    }, { recordWrite, setActor });

    expect(result).toMatchObject({
      written: true,
      counts: {
        inserted: 2,
        prices_backfilled: 0,
        treatments_backfilled: 0,
        price_conflicts: 0,
      },
      serving_write: {
        written: true,
        offerings_inserted: 2,
        existing_prices_overwritten: 0,
      },
    });
    expect(result.outcomes.map((item: { offering_id: number }) => item.offering_id)).toEqual([101, 102]);
    expect(recordWrite).toHaveBeenCalledWith(expect.objectContaining({
      entity: { entity_type: "location", entity_id: 42 },
      field: "offerings",
      verification: "agent_verified",
    }));
    expect(tx.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO fountain.offerings"))).toHaveLength(2);
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("fountain_raw.unmapped_terms"))).toBe(true);
    expect(tx.query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE fountain.entity_change_events"))).toHaveLength(2);
    expect(setActor).toHaveBeenCalledOnce();
  });

  test("backfills only null prices/treatments and sends differing prices to the conflict table", async () => {
    const existing = [
      existingOffering(5, "IV Therapy"),
      existingOffering(6, "Red Light Therapy", {
        treatment_id: 20,
        price_amount: 100,
        price_currency: "USD",
      }),
    ];
    const tx = menuTransaction({ existing, offeringStates: new Map(existing.map((item) => [item.id, item])) });
    const recordWrite = permissiveLedger(tx);
    const result = await guardedApplyMenuExtraction({
      locationId: 42,
      website: "https://clinic.example/",
      sourceId: 256,
      offerings: [
        normalizedOffering("IV Therapy", { treatment_id: 10, price_amount: 150, price_currency: "USD" }),
        normalizedOffering("Red Light Therapy", { treatment_id: 20, price_amount: 120, price_currency: "USD" }),
      ],
      taskId: 10,
      runId: 18,
    }, { recordWrite, setActor: vi.fn() });

    expect(result).toMatchObject({
      counts: {
        inserted: 0,
        prices_backfilled: 1,
        treatments_backfilled: 1,
        price_conflicts: 1,
      },
      serving_write: {
        offerings_inserted: 0,
        prices_backfilled: 1,
        treatments_backfilled: 1,
        existing_prices_overwritten: 0,
      },
    });
    expect(recordWrite.mock.calls.map(([call]) => call.field)).toEqual([
      "offerings",
      "treatment_id",
      "price_amount",
      "price_currency",
    ]);
    const servingUpdates = tx.query.mock.calls.map(([sql]) => String(sql))
      .filter((sql) => sql.includes("UPDATE fountain.offerings"));
    expect(servingUpdates).toHaveLength(2);
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("price_conflicts_20260711"))).toBe(true);
  });

  test("refuses all transaction writes if suppression appears after extraction", async () => {
    const tx = menuTransaction({ non_suppressed: false, existing: [] });
    const result = await guardedApplyMenuExtraction({
      locationId: 42,
      website: "https://clinic.example/",
      sourceId: 256,
      offerings: [normalizedOffering("IV Therapy", { treatment_id: 10 })],
      taskId: 1,
      runId: 2,
    }, { recordWrite: permissiveLedger(tx), setActor: vi.fn() });

    expect(result).toMatchObject({
      written: false,
      reason: "location_suppressed",
      serving_write: { attempted: true, written: false },
    });
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO fountain.offerings"))).toBe(false);
  });

  test("skips an initially suppressed location before crawl, LLM, or treatment-map reads", async () => {
    const crawl = vi.fn();
    const extract = vi.fn();
    const apply = vi.fn();
    const query = vi.fn(async () => ({
      rows: [{ ...eligibleLocation(), non_suppressed: false }],
    }));
    const result = await handleMenuExtract({
      task: { id: 1, entity_type: "location", entity_id: 42 },
      run: { id: 2 },
    }, {
      query,
      webClient: {},
      llmClient: {},
      crawl,
      extract,
      apply,
    });

    expect(result).toMatchObject({ outcome: "skipped", reason: "location_suppressed" });
    expect(query).toHaveBeenCalledOnce();
    expect(crawl).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});

function proposed(rawName: string, evidence: string, overrides: Record<string, unknown> = {}) {
  return {
    raw_name: rawName,
    price_amount: null,
    price_currency: null,
    price_context: null,
    source_url: "https://clinic.example/pricing",
    evidence_text: evidence,
    confidence: 0.95,
    ...overrides,
  };
}

function eligibleLocation() {
  return {
    id: 42,
    name: "Example Longevity",
    website: "https://clinic.example/",
    country_code: "US",
    status: "active",
    deleted_at: null,
    clinic_source_id: 256,
    active_offering_count: 0,
    non_suppressed: true,
  };
}

function normalizedOffering(rawName: string, overrides: Record<string, unknown> = {}) {
  return {
    raw_name: rawName,
    normalized: normalizeMenuTerm(rawName),
    treatment_id: null,
    mapping_status: "unmapped",
    mapping_candidates: [],
    price_amount: null,
    price_currency: null,
    price_context: null,
    price_rejection: null,
    source_url: "https://clinic.example/pricing",
    evidence_text: `${rawName} menu evidence`,
    confidence: 0.95,
    price_ambiguous: false,
    ...overrides,
  };
}

function existingOffering(id: number, rawName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    treatment_id: null,
    raw_name: rawName,
    price_amount: null,
    price_currency: null,
    source_offer_url: null,
    source_id: null,
    status: "active",
    deleted_at: null,
    owner_account_id: null,
    verification_status: "unverified",
    ...overrides,
  };
}

function permissiveLedger(tx: ReturnType<typeof menuTransaction>) {
  return vi.fn(async (call: {
    tx?: typeof tx;
    field: string;
    entity: { entity_type: string; entity_id: number };
    mutate: (value: typeof tx) => Promise<unknown>;
  }) => ({
    written: true,
    result: await call.mutate(call.tx || tx),
  }));
}

function menuTransaction({
  non_suppressed = true,
  existing = [],
  offeringStates = new Map<number, Record<string, unknown>>(),
}: {
  non_suppressed?: boolean;
  existing?: Array<Record<string, unknown>>;
  offeringStates?: Map<number, Record<string, unknown>>;
}) {
  let insertedId = 100;
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FOR UPDATE OF location")) {
        return {
          rows: [{
            status: "active",
            deleted_at: null,
            website: "https://clinic.example/",
            clinic_source_id: 256,
            non_suppressed,
          }],
        };
      }
      if (sql.includes("transaction_timestamp")) {
        return { rows: [{ write_started_at: "2026-07-11T22:00:00.000Z" }] };
      }
      if (sql.includes("FROM fountain.offerings offering") && sql.includes("location_id = $1")) {
        return { rows: existing };
      }
      if (sql.includes("FROM fountain.offerings offering") && sql.includes("offering.id = $1")) {
        return { rows: [offeringStates.get(Number(params[0]))] };
      }
      if (sql.includes("nextval(pg_get_serial_sequence('fountain.offerings'")) {
        insertedId += 1;
        return { rows: [{ offering_id: insertedId }] };
      }
      if (sql.includes("INSERT INTO fountain.offerings")) {
        insertedId = Number(params[0]);
        return { rowCount: 1, rows: [{ id: insertedId }] };
      }
      if (sql.includes("UPDATE fountain.offerings") && sql.includes("treatment_id = $2")) {
        return { rowCount: 1, rows: [{ id: params[0], treatment_id: params[1] }] };
      }
      if (sql.includes("UPDATE fountain.offerings") && sql.includes("price_amount = $2")) {
        return {
          rowCount: 1,
          rows: [{ id: params[0], price_amount: params[1], price_currency: params[2] }],
        };
      }
      if (sql.includes("UPDATE fountain.entity_change_events")) return { rowCount: 1, rows: [] };
      if (sql.includes("fountain_raw.unmapped_terms")) return { rowCount: 1, rows: [] };
      if (sql.includes("price_conflicts_20260711")) return { rowCount: 1, rows: [] };
      if (sql.includes("price_review_20260711")) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
}
