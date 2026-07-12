import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import * as cli from "../pipeline/cli.mjs";

const {
  drainTasks,
  parseCliArgs,
  runCensus,
  runDrain,
  runEnqueue,
  runFinalReport,
  runReport,
  runSuppress,
  validateCommandArgs,
} = cli;

describe("pipeline CLI parsing", () => {
  test("defaults to dry-run by leaving apply false", () => {
    const parsed = parseCliArgs(["enqueue", "--task", "noop", "--where", "id > 0"]);

    expect(parsed).toMatchObject({
      command: "enqueue",
      task: "noop",
      where: "id > 0",
    });
    expect(parsed.apply).toBeUndefined();
  });

  test("supports equals syntax and camel-cases flags", () => {
    expect(parseCliArgs(["drain", "--task=noop", "--dry-run", "--entity-type=location"])).toMatchObject({
      command: "drain",
      task: "noop",
      dryRun: true,
      entityType: "location",
    });
  });

  test("rejects contradictory execution flags", () => {
    expect(() => parseCliArgs(["drain", "--apply", "--dry-run"])).toThrow(
      "--apply and --dry-run are mutually exclusive",
    );
  });

  test("supports incremental taxonomy presentation and requires a live-run budget", () => {
    expect(validateCommandArgs(parseCliArgs([
      "taxonomy-present",
      "--model", "openai/gpt-4o-mini",
      "--batch-size", "40",
      "--limit", "100",
    ]))).toMatchObject({ command: "taxonomy-present", batchSize: "40", limit: "100" });
    expect(() => validateCommandArgs(parseCliArgs([
      "taxonomy-present", "--apply",
    ]))).toThrow("requires an explicit --budget");
    expect(validateCommandArgs(parseCliArgs([
      "taxonomy-present", "--budget", "1", "--apply",
    ]))).toMatchObject({ command: "taxonomy-present", apply: true, budget: "1" });
  });

  test("supports offering display previews and scoped recomputation", () => {
    expect(validateCommandArgs(parseCliArgs([
      "offering-display", "--location-id", "63",
    ]))).toMatchObject({ command: "offering-display", locationId: "63" });
    expect(validateCommandArgs(parseCliArgs([
      "offering-display", "--apply",
    ]))).toMatchObject({ command: "offering-display", apply: true });
  });

  test("supports offering translation and requires a live-run budget", () => {
    expect(validateCommandArgs(parseCliArgs([
      "offering-translate", "--location-id", "13431", "--batch-size", "50",
    ]))).toMatchObject({ command: "offering-translate", locationId: "13431", batchSize: "50" });
    expect(() => validateCommandArgs(parseCliArgs([
      "offering-translate", "--apply",
    ]))).toThrow("requires an explicit --budget");
    expect(validateCommandArgs(parseCliArgs([
      "offering-translate", "--budget", "5", "--apply",
    ]))).toMatchObject({ command: "offering-translate", apply: true, budget: "5" });
  });

  test("requires an exact Gate B campaign, evidence runs, and expected count for suppression", () => {
    expect(validateCommandArgs(parseCliArgs([
      "suppress",
      "--campaign", "pass1_gate_b_dry_run",
      "--run", "39,40",
      "--expected", "5212",
    ]))).toMatchObject({ command: "suppress", expected: "5212" });
    expect(() => validateCommandArgs(parseCliArgs([
      "suppress", "--campaign", "pass1_gate_a", "--run", "39", "--expected", "5212",
    ]))).toThrow("--campaign must be pass1_gate_b_dry_run");
  });

  test("rejects unknown, duplicate, and unexpected arguments before execution", () => {
    expect(() => validateCommandArgs(parseCliArgs(["drain", "--task", "noop", "--budegt", "1", "--apply"])))
      .toThrow("Unknown option for drain: --budegt");
    expect(() => parseCliArgs(["drain", "--task", "noop", "--task", "llm_smoke"]))
      .toThrow("--task may only be provided once");
    expect(() => validateCommandArgs(parseCliArgs(["report", "surprise", "--run", "7"])))
      .toThrow("report does not accept positional arguments");
  });

  test("validates maintenance subcommands and their scoped options", () => {
    expect(validateCommandArgs(parseCliArgs([
      "maintain",
      "regen-structure-doc",
      "--schema=fountain,fountain_raw",
      "--output",
      "docs/schema.md",
    ]))).toMatchObject({ positional: ["regen-structure-doc"] });
    expect(validateCommandArgs(parseCliArgs([
      "maintain",
      "refresh-city-index",
      "--schema",
      "fountain",
    ]))).toMatchObject({ positional: ["refresh-city-index"] });

    expect(() => validateCommandArgs(parseCliArgs(["maintain"])))
      .toThrow("maintain requires exactly one subcommand");
    expect(() => validateCommandArgs(parseCliArgs(["maintain", "unknown"])))
      .toThrow("Unknown maintain subcommand: unknown");
    expect(() => validateCommandArgs(parseCliArgs([
      "maintain",
      "refresh-city-index",
      "--output",
      "unused.md",
    ]))).toThrow("Unknown option for maintain refresh-city-index: --output");
  });

  test("validates the standalone final-report selection surface", () => {
    expect(validateCommandArgs(parseCliArgs([
      "final-report",
      "--runs-file",
      "docs/runs/enrichment-final-runs.json",
      "--apply",
    ]))).toMatchObject({
      command: "final-report",
      runsFile: "docs/runs/enrichment-final-runs.json",
      apply: true,
    });
    expect(validateCommandArgs(parseCliArgs([
      "final-report",
      "--run-selection",
      '{"enrichment":{"contact_fill":[63]}}',
      "--menu-prices-before",
      "docs/runs/custom-menu-baseline.json",
    ]))).toMatchObject({ command: "final-report" });
    expect(() => validateCommandArgs(parseCliArgs(["final-report"])))
      .toThrow("requires --runs-file or --run-selection");
    expect(() => validateCommandArgs(parseCliArgs([
      "final-report",
      "--runs-file",
      "runs.json",
      "--run-selection",
      "{}",
    ]))).toThrow("mutually exclusive");
  });

  test("loads the supplemental pre-menu census when menu_extract runs are selected", async () => {
    const before = { schemaVersion: 1, label: "before" };
    const after = { schemaVersion: 1, label: "after", menuPrices: {} };
    const menuPricesBefore = {
      schemaVersion: 1,
      label: "menu_prices_enrichment",
      menuPrices: {},
    };
    const data = finalReportData();
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath.endsWith("enrichment-before-census.json")) return JSON.stringify(before);
      if (filePath.endsWith("enrichment-after-census.json")) return JSON.stringify(after);
      if (filePath.endsWith("enrichment-menu-prices-census.json")) {
        return JSON.stringify({ snapshot: menuPricesBefore });
      }
      throw new Error(`Unexpected final-report file: ${filePath}`);
    });
    const loadEnrichmentFinalReportData = vi.fn(async () => data);

    const result = await runFinalReport({
      runSelection: '{"enrichment":{"menu_extract":[85]}}',
    }, { dry_run: true }, {
      readFile,
      withTransaction: vi.fn(async (operation) => operation({ query: vi.fn() })),
      loadPersistedLegitimacyCloseout: vi.fn(async () => ({ stage3: {}, redemption: {} })),
      loadEnrichmentFinalReportData,
      renderEnrichmentFinalReport: vi.fn(() => "# menu closeout\n"),
      writeStdout: vi.fn(),
      now: () => new Date("2026-07-12T12:00:00.000Z"),
    });

    expect(loadEnrichmentFinalReportData).toHaveBeenCalledWith(expect.objectContaining({
      before,
      after,
      menuPricesBefore,
      runIds: expect.objectContaining({ ids: ["57", "61", "85"] }),
    }), expect.any(Object));
    expect(result.result).toMatchObject({
      dryRun: true,
      menuPricesBeforePath: expect.stringMatching(/enrichment-menu-prices-census\.json$/u),
    });
  });

  test("orchestrates final-report in one read-only snapshot and writes only after reconciliation", async () => {
    const before = { schemaVersion: 1, label: "before" };
    const after = { schemaVersion: 1, label: "after" };
    const persisted = { stage3: { exact: 57 }, redemption: { exact: 61 } };
    const data = finalReportData();
    const tx = { query: vi.fn(async () => ({ rows: [] })) };
    const withTransaction = vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => (
      operation(tx)
    ));
    const readFile = vi.fn(async (filePath: string) => {
      if (filePath.endsWith("before.json")) return JSON.stringify(before);
      if (filePath.endsWith("after.json")) return JSON.stringify({ snapshot: after });
      if (filePath.endsWith("runs.json")) {
        return JSON.stringify({
          stage3: 57,
          redemption: 61,
          enrichment: { contact_fill: [63], reviews_fetch: 64 },
        });
      }
      throw new Error(`Unexpected final-report file: ${filePath}`);
    });
    const loadPersistedLegitimacyCloseout = vi.fn(async () => persisted);
    const loadEnrichmentFinalReportData = vi.fn(async () => data);
    const renderEnrichmentFinalReport = vi.fn(() => "# final closeout\n");
    const assertEnrichmentFinalReconciliation = vi.fn(() => true);
    const writeEnrichmentFinalReport = vi.fn(async (_data: unknown, options: { outputPath: string }) => (
      options.outputPath
    ));
    const writeStdout = vi.fn();
    const operations = {
      readFile,
      withTransaction,
      loadPersistedLegitimacyCloseout,
      loadEnrichmentFinalReportData,
      renderEnrichmentFinalReport,
      assertEnrichmentFinalReconciliation,
      writeEnrichmentFinalReport,
      writeStdout,
      now: () => new Date("2026-07-12T12:00:00.000Z"),
    };

    const preview = await runFinalReport({
      before: "before.json",
      after: "after.json",
      runsFile: "runs.json",
      output: "final.md",
    }, { dry_run: true }, operations);

    expect(withTransaction).toHaveBeenCalledOnce();
    expect(tx.query).toHaveBeenCalledWith(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    expect(loadPersistedLegitimacyCloseout).toHaveBeenCalledWith({
      stage3RunId: "57",
      redemptionRunId: "61",
    }, { query: tx });
    expect(loadEnrichmentFinalReportData).toHaveBeenCalledWith(expect.objectContaining({
      before,
      after,
      stage3: persisted.stage3,
      redemption: persisted.redemption,
      generatedAt: "2026-07-12T12:00:00.000Z",
      runIds: {
        ids: ["57", "61", "63", "64"],
        entries: expect.any(Array),
      },
    }), { query: tx });
    expect(assertEnrichmentFinalReconciliation).not.toHaveBeenCalled();
    expect(writeEnrichmentFinalReport).not.toHaveBeenCalled();
    expect(preview).toMatchObject({
      counts: { files_written: 0, selected_runs: 4, reconciliation_failures: 0 },
      result: { dryRun: true, outputPath: null },
    });

    const applied = await runFinalReport({
      before: "before.json",
      after: "after.json",
      runsFile: "runs.json",
      output: "final.md",
    }, { dry_run: false }, operations);
    expect(assertEnrichmentFinalReconciliation).toHaveBeenCalledWith(data);
    expect(writeEnrichmentFinalReport).toHaveBeenCalledWith(
      data,
      { outputPath: expect.stringMatching(/final\.md$/u) },
    );
    expect(writeStdout).toHaveBeenCalledWith("# final closeout\n");
    expect(applied).toMatchObject({
      counts: { files_written: 1 },
      result: { dryRun: false, outputPath: expect.stringMatching(/final\.md$/u) },
    });
  });

  test("final-report refuses apply on reconciliation mismatch before the writer", async () => {
    const data = finalReportData({ failures: [{ id: "active_search_rows" }] });
    const writeEnrichmentFinalReport = vi.fn();
    const assertEnrichmentFinalReconciliation = vi.fn(() => {
      throw new Error("Final enrichment reconciliation failed: active_search_rows=1/2.");
    });

    await expect(runFinalReport({
      runSelection: '{"enrichment":{"contact_fill":[63]}}',
    }, { dry_run: false }, {
      readFile: vi.fn(async (filePath: string) => JSON.stringify({
        schemaVersion: 1,
        label: filePath.includes("before") ? "before" : "after",
      })),
      withTransaction: vi.fn(async (operation) => operation({ query: vi.fn() })),
      loadPersistedLegitimacyCloseout: vi.fn(async () => ({ stage3: {}, redemption: {} })),
      loadEnrichmentFinalReportData: vi.fn(async () => data),
      renderEnrichmentFinalReport: vi.fn(() => "# mismatch\n"),
      assertEnrichmentFinalReconciliation,
      writeEnrichmentFinalReport,
      writeStdout: vi.fn(),
      now: () => new Date("2026-07-12T12:00:00.000Z"),
    })).rejects.toThrow("active_search_rows=1/2");
    expect(writeEnrichmentFinalReport).not.toHaveBeenCalled();
  });

  test("orchestrates the guarded before census with all five initial task handlers", async () => {
    const snapshot = { population: { eligible: 12 } };
    const plan = { expectedInsertions: 25 };
    const loadEnrichmentCensus = vi.fn(async () => snapshot);
    const buildEnrichmentEnqueuePlan = vi.fn(() => plan);
    const enqueueEnrichmentPlan = vi.fn(async () => ({ insertedCount: 25 }));
    const renderEnrichmentCensusReport = vi.fn(() => "# before\n");
    const writeFile = vi.fn(async (...args: [string, string, string]) => {
      void args;
    });

    const outcome = await runCensus(
      { scope: "before" },
      { id: "101", dry_run: false },
      {
        loadEnrichmentCensus,
        buildEnrichmentEnqueuePlan,
        enqueueEnrichmentPlan,
        renderEnrichmentCensusReport,
        writeFile,
      },
    );

    expect(loadEnrichmentCensus).toHaveBeenCalledWith(expect.objectContaining({
      label: "before_enrichment",
    }));
    expect(enqueueEnrichmentPlan).toHaveBeenCalledWith(expect.objectContaining({
      plan,
      liveSnapshot: snapshot,
      runId: "101",
      implementedTaskTypes: [
        "contact_fill",
        "geocode",
        "image_harvest",
        "menu_extract",
        "reviews_fetch",
      ],
      apply: true,
    }));
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      counts: { eligible: 12, expected_tasks: 25, inserted: 25, reports_written: 2 },
    });
  });

  test("orchestrates post-harvest image classification with a dry-run and guarded apply", async () => {
    const snapshot = { population: { eligible: 12 } };
    const plan = { expectedInsertions: 3, unclassifiedImageCount: 7 };
    const loadEnrichmentCensus = vi.fn(async () => snapshot);
    const buildImageClassifyEnqueuePlan = vi.fn(() => plan);
    const enqueueImageClassifyPlan = vi.fn(async () => ({ insertedCount: 3 }));
    const renderImageClassifyEnqueueReport = vi.fn(() => "# image classify\n");
    const writeFile = vi.fn(async (...args: [string, string, string]) => {
      void args;
    });
    const operations = {
      loadEnrichmentCensus,
      buildImageClassifyEnqueuePlan,
      enqueueImageClassifyPlan,
      renderImageClassifyEnqueueReport,
      writeFile,
    };

    const preview = await runCensus(
      { scope: "image-classify" },
      { id: "102", dry_run: true },
      operations,
    );
    expect(preview).toMatchObject({
      counts: { unclassified_images: 7, expected_tasks: 3, inserted: 0 },
      result: { dryRun: true, scope: "image-classify" },
    });
    expect(enqueueImageClassifyPlan).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();

    const applied = await runCensus(
      { scope: "image-classify" },
      { id: "103", dry_run: false },
      operations,
    );
    expect(enqueueImageClassifyPlan).toHaveBeenCalledWith(expect.objectContaining({
      plan,
      liveSnapshot: snapshot,
      runId: "103",
      implementedTaskTypes: ["image_classify"],
      apply: true,
    }));
    expect(renderImageClassifyEnqueueReport).toHaveBeenCalledWith(expect.objectContaining({
      snapshot,
      plan,
    }));
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining([
      expect.stringContaining("enrichment-image-classify-census.md"),
      expect.stringContaining("enrichment-image-classify-census.json"),
    ]));
    expect(applied).toMatchObject({
      counts: { unclassified_images: 7, expected_tasks: 3, inserted: 3, reports_written: 2 },
    });
  });

  test("orchestrates a post-contact refresh for newly unlocked downstream work", async () => {
    const snapshot = { population: { eligible: 12 } };
    const plan = { expectedInsertions: 4 };
    const loadEnrichmentCensus = vi.fn(async () => snapshot);
    const loadPostContactEnqueuePlan = vi.fn(async () => plan);
    const enqueuePostContactPlan = vi.fn(async () => ({ insertedCount: 4 }));
    const renderPostContactEnqueueReport = vi.fn(() => "# post contact\n");
    const writeFile = vi.fn(async (...args: [string, string, string]) => {
      void args;
    });

    const outcome = await runCensus(
      { scope: "post-contact" },
      { id: "104", dry_run: false },
      {
        loadEnrichmentCensus,
        loadPostContactEnqueuePlan,
        enqueuePostContactPlan,
        renderPostContactEnqueueReport,
        writeFile,
      },
    );

    expect(loadPostContactEnqueuePlan).toHaveBeenCalledWith(snapshot);
    expect(enqueuePostContactPlan).toHaveBeenCalledWith(expect.objectContaining({
      plan,
      liveSnapshot: snapshot,
      runId: "104",
      implementedTaskTypes: ["geocode", "image_harvest", "menu_extract"],
      apply: true,
    }));
    expect(writeFile.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining([
      expect.stringContaining("enrichment-post-contact-census.md"),
      expect.stringContaining("enrichment-post-contact-census.json"),
    ]));
    expect(outcome).toMatchObject({
      counts: { expected_tasks: 4, inserted: 4, reports_written: 2 },
    });
  });

  test("orchestrates the isolated menu-prices adoption and incremental enqueue", async () => {
    const snapshot = { population: { eligible: 7_178 } };
    const plan = {
      menuMissing: { rawCount: 2_200 },
      pricesMissing: { rawCount: 3_400 },
      expectedAdoptions: 2_172,
      expectedInsertions: 3_353,
      expectedTasks: 5_525,
    };
    const loadEnrichmentCensus = vi.fn(async () => snapshot);
    const loadMenuPricesEnqueuePlan = vi.fn(async () => plan);
    const enqueueMenuPricesPlan = vi.fn(async () => ({
      adoptedCount: 2_172,
      insertedCount: 3_353,
    }));
    const renderMenuPricesEnqueueReport = vi.fn(() => "# menu prices\n");
    const writeFile = vi.fn(async (...args: [string, string, string]) => {
      void args;
    });
    const operations = {
      loadEnrichmentCensus,
      loadMenuPricesEnqueuePlan,
      enqueueMenuPricesPlan,
      renderMenuPricesEnqueueReport,
      writeFile,
    };

    const preview = await runCensus(
      { scope: "menu-prices" },
      { id: "105", dry_run: true },
      operations,
    );
    expect(preview).toMatchObject({
      counts: {
        expected_tasks: 5_525,
        menu_missing_adoptions: 2_172,
        prices_missing_insertions: 3_353,
        adopted: 0,
        inserted: 0,
      },
      result: { dryRun: true, scope: "menu-prices" },
    });
    expect(enqueueMenuPricesPlan).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();

    const applied = await runCensus(
      { scope: "menu-prices" },
      { id: "106", dry_run: false },
      operations,
    );
    expect(loadEnrichmentCensus).toHaveBeenLastCalledWith(expect.objectContaining({
      label: "menu_prices_enrichment",
    }));
    expect(enqueueMenuPricesPlan).toHaveBeenCalledWith(expect.objectContaining({
      plan,
      liveSnapshot: snapshot,
      runId: "106",
      implementedTaskTypes: ["menu_extract"],
      apply: true,
    }));
    expect(writeFile.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining([
      expect.stringContaining("enrichment-menu-prices-census.md"),
      expect.stringContaining("enrichment-menu-prices-census.json"),
    ]));
    expect(applied).toMatchObject({
      counts: {
        expected_tasks: 5_525,
        adopted: 2_172,
        inserted: 3_353,
        reports_written: 2,
      },
    });
  });

  test("validates the legitimacy stage and fixed Gate A sample surfaces", () => {
    expect(validateCommandArgs(parseCliArgs([
      "drain",
      "--task",
      "legitimacy_check",
      "--stage",
      "all",
      "--campaign",
      "pass1_gate_b_dry_run",
      "--prompt-version",
      "pass1-legitimacy-v2",
      "--budget",
      "3",
      "--apply",
    ]))).toMatchObject({
      stage: "all",
      campaign: "pass1_gate_b_dry_run",
      promptVersion: "pass1-legitimacy-v2",
    });
    expect(validateCommandArgs(parseCliArgs([
      "enqueue",
      "--task",
      "legitimacy_check",
      "--sample",
      "gate-a",
      "--apply",
    ]))).toMatchObject({ sample: "gate-a" });
    expect(validateCommandArgs(parseCliArgs([
      "enqueue",
      "--task",
      "legitimacy_check",
      "--scope",
      "full",
      "--apply",
    ]))).toMatchObject({ scope: "full" });

    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "legitimacy_check", "--stage", "stage-3",
    ]))).toThrow("stage_1, stage_2, or all");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "noop", "--stage", "stage_1",
    ]))).toThrow("only for --task legitimacy_check");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "legitimacy_check",
    ]))).toThrow("requires --stage");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "legitimacy_check", "--stage", "stage_1",
    ]))).toThrow("requires an explicit --budget");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain",
      "--task",
      "legitimacy_check",
      "--stage",
      "stage_1",
      "--budget",
      "3",
      "--campaign",
      "pass1_gate_b_dry_run",
    ]))).toThrow("requires --campaign and --prompt-version together");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain",
      "--task",
      "legitimacy_check",
      "--stage",
      "stage_1",
      "--budget",
      "3",
      "--prompt-version",
      "pass1-legitimacy-v2",
    ]))).toThrow("requires --campaign and --prompt-version together");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "noop", "--sample", "gate-a",
    ]))).toThrow("only for --task legitimacy_check");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "legitimacy_check", "--sample", "gate-a", "--where", "id > 0",
    ]))).toThrow("mutually exclusive");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "noop",
    ]))).toThrow("--where is required");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "noop", "--scope", "full",
    ]))).toThrow("only for --task legitimacy_check");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "legitimacy_check", "--scope", "full", "--where", "id > 0",
    ]))).toThrow("mutually exclusive");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "legitimacy_check", "--scope", "full", "--sample", "gate-a",
    ]))).toThrow("--sample and --scope are mutually exclusive");
    expect(validateCommandArgs(parseCliArgs([
      "report", "--campaign", "pass1_gate_a", "--run", "21", "--apply",
    ]))).toMatchObject({ campaign: "pass1_gate_a", run: "21" });
    expect(validateCommandArgs(parseCliArgs([
      "report", "--campaign", "pass1_gate_b_dry_run", "--run", "31,32",
    ]))).toMatchObject({ campaign: "pass1_gate_b_dry_run", run: "31,32" });
    expect(() => validateCommandArgs(parseCliArgs([
      "report",
      "--campaign",
      "pass1_gate_b_dry_run",
      "--run",
      "31,32",
      "--output",
      "somewhere.md",
    ]))).toThrow("paths are fixed");
  });

  test("threads drain campaign and prompt filters into previews and claims", async () => {
    const campaign = "pass1_gate_b_dry_run";
    const promptVersion = "pass1-legitimacy-v2";
    const previewDrain = vi.fn(async () => [{ id: "701" }]);

    const preview = await runDrain({
      task: "legitimacy_check",
      stage: "stage_2",
      campaign,
      promptVersion,
      budget: "15",
      limit: "20",
    }, { id: "31", dry_run: true }, { previewDrain });

    expect(previewDrain).toHaveBeenCalledWith({
      taskType: "legitimacy_check",
      stage: "stage_2",
      campaign,
      promptVersion,
      limit: 20,
    });
    expect(preview).toMatchObject({
      result: {
        dryRun: true,
        campaign,
        promptVersion,
        concurrency: 24,
        tasks: [{ id: "701" }],
      },
    });

    const claimTasks = vi.fn(async () => []);
    const applied = await runDrain({
      task: "legitimacy_check",
      stage: "stage_2",
      campaign,
      promptVersion,
      concurrency: "1",
      budget: "15",
    }, { id: "32", dry_run: false }, {
      claimTasks,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0 })),
      getRunSpend: vi.fn(async () => 0),
      taskCountsForRun: vi.fn(async () => ({})),
      taskBacklogSummary: vi.fn(async () => ({})),
    });

    expect(claimTasks).toHaveBeenCalledOnce();
    expect(claimTasks).toHaveBeenCalledWith(expect.objectContaining({
      taskType: "legitimacy_check",
      stage: "stage_2",
      campaign,
      promptVersion,
      limit: 8,
    }));
    expect(applied).toMatchObject({
      status: "completed",
      result: { dryRun: false, campaign, promptVersion, queueDrained: true },
    });
  });

  test("renders the Gate A campaign report and writes it only in apply mode", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const sampleData = {
      sampleRows: Array.from({ length: 300 }, () => ({})),
      classCounts: { in_scope: 200, review: 100 },
      actual: { spendUsd: 0.02 },
      projection: { spendUsd: 0.7 },
    };
    const loadLegitimacyGateAReportData = vi.fn(async () => sampleData);
    const renderLegitimacyGateAReport = vi.fn(() => "# sample\n");
    const writeFile = vi.fn(async () => undefined);

    const outcome = await runReport(
      { campaign: "pass1_gate_a", run: "21,22", output: "docs/runs/pass1-sample-review.md" },
      { dry_run: false },
      { loadLegitimacyGateAReportData, renderLegitimacyGateAReport, writeFile },
    );

    expect(loadLegitimacyGateAReportData).toHaveBeenCalledWith({
      campaign: "pass1_gate_a",
      promptVersion: "pass1-legitimacy-v1",
      runIds: ["21", "22"],
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/docs\/runs\/pass1-sample-review\.md$/u),
      "# sample\n",
      "utf8",
    );
    expect(outcome).toMatchObject({ counts: { sample_rows: 300, files_written: 1 } });
    stdout.mockRestore();
  });

  test("routes the fixed Gate A sample through its specialized helper", async () => {
    const enqueueLegitimacyGateASample = vi.fn(async () => ({
      selectedCount: 300,
      insertedCount: 0,
      insertedEntityIds: [],
      sampleCounts: { hyperbaric: 50, hospital: 50, random: 200 },
    }));

    const outcome = await runEnqueue(
      { task: "legitimacy_check", sample: "gate-a", positional: [] },
      { id: "12", dry_run: true },
      { enqueueLegitimacyGateASample },
    );

    expect(enqueueLegitimacyGateASample).toHaveBeenCalledWith({
      campaign: "pass1_gate_a",
      promptVersion: "pass1-legitimacy-v1",
      runId: "12",
      maxAttempts: 3,
      priority: 100,
      apply: false,
    });
    expect(outcome).toMatchObject({
      counts: { selected: 300, inserted: 0 },
      result: { dryRun: true, sample: "gate-a" },
    });
  });

  test("routes Gate B full scope through its specialized dry/apply helper", async () => {
    const enqueueLegitimacyGateBFull = vi.fn(async ({ apply }: { apply: boolean }) => ({
      selectedCount: 12_345,
      insertedCount: apply ? 12_345 : 0,
      insertedEntityIds: apply ? [1, 2, 3] : [],
      excludedCount: 120,
      sampleAlreadyFinalCount: 300,
    }));

    const preview = await runEnqueue(
      { task: "legitimacy_check", scope: "full", positional: [] },
      { id: "32", dry_run: true },
      { enqueueLegitimacyGateBFull },
    );
    expect(enqueueLegitimacyGateBFull).toHaveBeenNthCalledWith(1, expect.objectContaining({
      runId: "32",
      apply: false,
    }));
    expect(preview).toMatchObject({
      counts: { selected: 12_345, inserted: 0 },
      result: { dryRun: true, scope: "full" },
    });

    const applied = await runEnqueue(
      { task: "legitimacy_check", scope: "full", positional: [] },
      { id: "33", dry_run: false },
      { enqueueLegitimacyGateBFull },
    );

    expect(enqueueLegitimacyGateBFull).toHaveBeenNthCalledWith(2, {
      campaign: "pass1_gate_b_dry_run",
      promptVersion: "pass1-legitimacy-v2",
      runId: "33",
      maxAttempts: 3,
      priority: 100,
      apply: true,
    });
    expect(applied).toMatchObject({
      counts: { selected: 12_345, inserted: 12_345 },
      result: { dryRun: false, scope: "full", excludedCount: 120 },
    });
  });

  test("renders Gate B summary/review reports and writes only with apply", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const reportData = {
      classCounts: { in_scope: 8_000, junk: 2_000, plain_hospital: 500, review: 100 },
      suppressionCount: 2_500,
      reviewRows: [{ id: 1 }, { id: 2 }],
    };
    const loadLegitimacyGateBReportData = vi.fn(async () => reportData);
    const renderLegitimacyGateBReport = vi.fn(() => "# Gate B dry run\n");
    const renderLegitimacyReviewQueue = vi.fn(() => "# Review queue\n");
    const writeFile = vi.fn(async () => undefined);
    const operations = {
      loadLegitimacyGateBReportData,
      renderLegitimacyGateBReport,
      renderLegitimacyReviewQueue,
      writeFile,
    };

    const preview = await runReport(
      { campaign: "pass1_gate_b_dry_run", run: "31,32" },
      { dry_run: true },
      operations,
    );
    expect(loadLegitimacyGateBReportData).toHaveBeenLastCalledWith({
      campaign: "pass1_gate_b_dry_run",
      promptVersion: "pass1-legitimacy-v2",
      runIds: ["31", "32"],
    });
    expect(writeFile).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenLastCalledWith("# Gate B dry run\n\n# Review queue\n");
    expect(preview).toMatchObject({
      counts: { reports_rendered: 2, files_written: 0, review_rows: 2 },
      result: { outputPath: null, reviewOutputPath: null, suppressionCount: 2_500 },
    });

    const applied = await runReport(
      { campaign: "pass1_gate_b_dry_run", run: "31,32" },
      { dry_run: false },
      operations,
    );
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/docs\/runs\/pass1-gate-b-dry-run\.md$/u),
      "# Gate B dry run\n",
      "utf8",
    );
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/docs\/runs\/pass1-review-queue\.md$/u),
      "# Review queue\n",
      "utf8",
    );
    expect(applied).toMatchObject({ counts: { files_written: 2 } });
    stdout.mockRestore();
  });

  test("previews and applies Gate B suppression only through the dedicated command", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const previewLegitimacyGateBSuppression = vi.fn(async () => ({
      apply: false,
      candidateCount: 5_212,
      sourceRecordFanout: 8_175,
    }));
    const applyLegitimacyGateBSuppression = vi.fn(async () => ({
      apply: true,
      preflight: { candidateCount: 5_212, hardExcludedCandidateCount: 0 },
      verification: {
        hiddenCount: 5_212,
        runSuppressionLedgerRows: 8_175,
        stampedEventCount: 5_212,
      },
    }));
    const renderLegitimacyGateBCompletion = vi.fn(() => "# Gate B complete\n");
    const writeFile = vi.fn(async () => undefined);
    const operations = {
      previewLegitimacyGateBSuppression,
      applyLegitimacyGateBSuppression,
      renderLegitimacyGateBCompletion,
      writeFile,
    };

    const preview = await runSuppress({
      campaign: "pass1_gate_b_dry_run",
      run: "39,40",
      expected: "5212",
    }, { id: "47", dry_run: true }, operations);
    expect(preview).toMatchObject({
      counts: { selected: 5_212, hidden: 0, suppression_ledger_rows_inserted: 0 },
    });
    expect(applyLegitimacyGateBSuppression).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();

    const applied = await runSuppress({
      campaign: "pass1_gate_b_dry_run",
      run: "39,40",
      expected: "5212",
    }, { id: "48", dry_run: false }, operations);
    expect(applyLegitimacyGateBSuppression).toHaveBeenCalledWith(expect.objectContaining({
      runId: "48",
      classificationRunIds: ["39", "40"],
      expectedSuppressionCount: 5_212,
    }));
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/docs\/runs\/pass1-gate-b-completion\.md$/u),
      "# Gate B complete\n",
      "utf8",
    );
    expect(applied).toMatchObject({ counts: { hidden: 5_212, entity_change_events: 5_212 } });
    expect(stdout).toHaveBeenCalledWith("# Gate B complete\n");
    stdout.mockRestore();
  });

  test("budget exhaustion prevents a second claim without a dispatch cap", async () => {
    const claimTask = vi.fn()
      .mockResolvedValueOnce({ id: "1", entity_id: 997 })
      .mockResolvedValueOnce({ id: "2", entity_id: 1994 });
    const completeTask = vi.fn(async () => ({ status: "done" }));
    const isBudgetExhausted = vi.fn()
      .mockResolvedValueOnce({ exhausted: false, spendUsd: 0 })
      .mockResolvedValueOnce({ exhausted: true, spendUsd: 0.00000225 });
    const getRunSpend = vi.fn(async () => 0.00000225);
    const handler = vi.fn(async () => ({ ok: true }));

    const result = await drainTasks({
      run: { id: "7" },
      taskType: "llm_smoke",
      definition: { handler, maxAttempts: 1, retryable: false },
      concurrency: 1,
      budgetUsd: 0.0000000001,
      limit: 2,
    }, { claimTask, completeTask, isBudgetExhausted, getRunSpend });

    expect(result).toMatchObject({
      dispatched: 1,
      done: 1,
      budgetExhausted: true,
      spendUsd: 0.00000225,
    });
    expect(claimTask).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  test("halts a stage when failures exceed 25 percent over a rolling 500 tasks", async () => {
    let claimed = 0;
    const claimTask = vi.fn(async () => {
      claimed += 1;
      return { id: String(claimed), entity_id: claimed };
    });
    const handler = vi.fn(async ({ task }: { task: { id: string } }) => {
      if (Number(task.id) <= 126) throw new Error("provider failure");
      return { ok: true };
    });
    const completeTask = vi.fn(async () => ({ status: "done" }));
    const failTask = vi.fn(async () => ({ status: "pending" }));
    const isBudgetExhausted = vi.fn(async () => ({ exhausted: false, spendUsd: 0 }));
    const getRunSpend = vi.fn(async () => 0);

    const result = await drainTasks({
      run: { id: "75" },
      taskType: "noop",
      definition: { handler, maxAttempts: 3, retryable: true },
      concurrency: 1,
      budgetUsd: null,
      limit: 1_000,
    }, {
      claimTask,
      completeTask,
      failTask,
      isBudgetExhausted,
      getRunSpend,
    });

    expect(result).toMatchObject({
      dispatched: 500,
      done: 374,
      retried: 126,
      failed: 0,
      queueDrained: false,
      failureRateHalted: true,
      failureRateWindowTasks: 500,
      failureRateWindowFailures: 126,
      failureRate: 0.252,
    });
    expect(claimTask).toHaveBeenCalledTimes(500);
  });

  test("concurrent batch overshoot is bounded to batches already started by workers", async () => {
    const firstBatch = [{ id: "61" }, { id: "62" }];
    const secondBatch = [{ id: "63" }, { id: "64" }];
    const claimTasks = vi.fn()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch);
    let handlersStarted = 0;
    let releaseHandlers = () => {};
    const bothHandlersStarted = new Promise<void>((resolve) => {
      releaseHandlers = resolve;
    });
    const batchHandler = vi.fn(async ({ tasks }: { tasks: Array<{ id: string }> }) => {
      handlersStarted += 1;
      if (handlersStarted === 2) releaseHandlers();
      await bothHandlersStarted;
      return tasks.map((task) => ({ taskId: task.id, disposition: "complete", result: {} }));
    });
    let budgetChecks = 0;
    const isBudgetExhausted = vi.fn(async () => {
      budgetChecks += 1;
      return budgetChecks <= 2
        ? { exhausted: false, spendUsd: 0 }
        : { exhausted: true, spendUsd: 3.01 };
    });

    const result = await drainTasks({
      run: { id: "17" },
      taskType: "legitimacy_check",
      definition: { batchHandler, batchSize: 2 },
      stage: "stage_1",
      concurrency: 2,
      budgetUsd: 3,
      limit: null,
    }, {
      claimTasks,
      completeTask: vi.fn(async () => ({ status: "done" })),
      isBudgetExhausted,
      getRunSpend: vi.fn(async () => 3.01),
    });

    expect(claimTasks).toHaveBeenCalledTimes(2);
    expect(batchHandler).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      dispatched: 4,
      done: 4,
      budgetExhausted: true,
      spendUsd: 3.01,
    });
  });

  test("non-retryable handler failure is terminal and does not claim task two", async () => {
    const claimTask = vi.fn().mockResolvedValueOnce({ id: "1", entity_id: 997 });
    const failTask = vi.fn(async (args) => ({ status: args.retryable ? "pending" : "failed" }));
    const handler = vi.fn(async () => { throw new Error("smoke failed"); });

    const result = await drainTasks({
      run: { id: "8" },
      taskType: "llm_smoke",
      definition: { handler, maxAttempts: 1, retryable: false },
      concurrency: 1,
      budgetUsd: null,
      limit: 1,
    }, {
      claimTask,
      failTask,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0 })),
      getRunSpend: vi.fn(async () => 0),
    });

    expect(result).toMatchObject({ dispatched: 1, failed: 1, retried: 0 });
    expect(failTask).toHaveBeenCalledWith(expect.objectContaining({ retryable: false }));
  });

  test("null concurrent claims do not consume retry dispatch limit", async () => {
    let claimCall = 0;
    const task = { id: "1", entity_id: 997 };
    const claimTask = vi.fn(async () => {
      claimCall += 1;
      if (claimCall === 1 || claimCall === 3) return task;
      return null;
    });
    let handlerCall = 0;
    const handler = vi.fn(async () => {
      handlerCall += 1;
      if (handlerCall === 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        throw new Error("retry once");
      }
      return { ok: true };
    });
    const failTask = vi.fn(async () => ({ status: "pending" }));
    const completeTask = vi.fn(async () => ({ status: "done" }));

    const result = await drainTasks({
      run: { id: "9" },
      taskType: "noop",
      definition: { handler, retryable: true },
      concurrency: 2,
      budgetUsd: null,
      limit: 2,
    }, {
      claimTask,
      failTask,
      completeTask,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0 })),
      getRunSpend: vi.fn(async () => 0),
    });

    expect(result).toMatchObject({ dispatched: 2, done: 1, failed: 0, retried: 1 });
    expect(claimTask).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(completeTask).toHaveBeenCalledOnce();
  });

  test("settles complete and deferred outcomes from a claimed batch", async () => {
    const tasks = [{ id: "21", entity_id: 101 }, { id: "22", entity_id: 102 }];
    const claimTasks = vi.fn()
      .mockResolvedValueOnce(tasks)
      .mockResolvedValueOnce([]);
    const completeTask = vi.fn(async () => ({ status: "done" }));
    const transitionTaskStage = vi.fn(async () => ({ status: "pending" }));
    const batchHandler = vi.fn(async () => [
      { taskId: "21", disposition: "complete", result: { final: { class: "in_scope" } } },
      { taskId: "22", disposition: "defer", payload: { stage: "stage_2" } },
    ]);

    const result = await drainTasks({
      run: { id: "13" },
      taskType: "legitimacy_check",
      definition: { batchHandler, batchSizeByStage: { stage_1: 20 } },
      stage: "stage_1",
      concurrency: 1,
      budgetUsd: null,
      limit: null,
    }, {
      claimTasks,
      completeTask,
      transitionTaskStage,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0.01 })),
      getRunSpend: vi.fn(async () => 0.01),
    });

    expect(result).toMatchObject({
      dispatched: 2,
      done: 1,
      deferred: 1,
      failed: 0,
      queueDrained: true,
    });
    expect(claimTasks).toHaveBeenNthCalledWith(1, expect.objectContaining({ stage: "stage_1", limit: 20 }));
    expect(completeTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "21" }));
    expect(transitionTaskStage).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "22",
      payload: { stage: "stage_2" },
    }));
  });

  test("fails every claimed task when the batch handler throws", async () => {
    const tasks = [{ id: "31", entity_id: 201 }, { id: "32", entity_id: 202 }];
    const claimTasks = vi.fn()
      .mockResolvedValueOnce(tasks)
      .mockResolvedValueOnce([]);
    const failTask = vi.fn(async (args: { taskId: string }) => {
      void args;
      return { status: "failed" };
    });
    const error = new Error("structured response invalid");

    const result = await drainTasks({
      run: { id: "14" },
      taskType: "legitimacy_check",
      definition: {
        batchHandler: vi.fn(async () => { throw error; }),
        batchSize: 10,
        retryable: false,
      },
      stage: "stage_1",
      concurrency: 1,
      budgetUsd: null,
      limit: null,
    }, {
      claimTasks,
      failTask,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0 })),
      getRunSpend: vi.fn(async () => 0),
    });

    expect(result).toMatchObject({ dispatched: 2, done: 0, failed: 2, retried: 0 });
    expect(failTask).toHaveBeenCalledTimes(2);
    expect(failTask.mock.calls.map(([args]) => args.taskId)).toEqual(["31", "32"]);
    expect(failTask).toHaveBeenCalledWith(expect.objectContaining({ error, retryable: false }));
  });

  test("drains Stage 1 fully before Stage 2 with one shared run budget", async () => {
    const stage1Task = { id: "41", entity_id: 301 };
    const stage2Task = { id: "41", entity_id: 301, payload: { stage: "stage_2" } };
    const claimedStages: string[] = [];
    const claimsByStage = {
      stage_1: [[stage1Task], []],
      stage_2: [[stage2Task], []],
    };
    const claimTasks = vi.fn(async (args) => {
      claimedStages.push(args.stage);
      return claimsByStage[args.stage as keyof typeof claimsByStage].shift() || [];
    });
    const batchHandler = vi.fn(async ({ tasks, stage }) => stage === "stage_1"
      ? [{ taskId: tasks[0].id, disposition: "defer", payload: { stage: "stage_2" } }]
      : [{ taskId: tasks[0].id, disposition: "complete", result: { final: { class: "junk" } } }]);
    const checkBudget = vi.fn(async (runId: string, budget: number) => {
      void runId;
      void budget;
      return { exhausted: false, spendUsd: 0.2 };
    });

    const result = await drainTasks({
      run: { id: "15" },
      taskType: "legitimacy_check",
      definition: {
        batchHandler,
        batchSizeByStage: { stage_1: 20, stage_2: 8 },
      },
      stage: "all",
      concurrency: 1,
      budgetUsd: 3,
      limit: null,
    }, {
      claimTasks,
      completeTask: vi.fn(async () => ({ status: "done" })),
      transitionTaskStage: vi.fn(async () => ({ status: "pending" })),
      isBudgetExhausted: checkBudget,
      getRunSpend: vi.fn(async () => 0.2),
    });

    expect(claimedStages).toEqual(["stage_1", "stage_1", "stage_2", "stage_2"]);
    expect(claimTasks.mock.calls.map(([args]) => args.limit)).toEqual([20, 20, 8, 8]);
    expect(checkBudget.mock.calls.every(([runId, budget]) => runId === "15" && budget === 3)).toBe(true);
    expect(result).toMatchObject({
      dispatched: 2,
      done: 1,
      deferred: 1,
      budgetExhausted: false,
      spendUsd: 0.2,
      queueDrained: true,
      stages: {
        stage_1: { dispatched: 1, deferred: 1, queueDrained: true },
        stage_2: { dispatched: 1, done: 1, queueDrained: true },
      },
    });
  });

  test("does not start Stage 2 after the shared budget is exhausted", async () => {
    const claimTasks = vi.fn().mockResolvedValueOnce([{ id: "51", entity_id: 401 }]);
    const checkBudget = vi.fn()
      .mockResolvedValueOnce({ exhausted: false, spendUsd: 0 })
      .mockResolvedValueOnce({ exhausted: true, spendUsd: 3.01 });

    const result = await drainTasks({
      run: { id: "16" },
      taskType: "legitimacy_check",
      definition: {
        batchHandler: vi.fn(async ({ tasks }) => [
          { taskId: tasks[0].id, disposition: "complete", result: {} },
        ]),
        batchSizeByStage: { stage_1: 20, stage_2: 8 },
      },
      stage: "all",
      concurrency: 1,
      budgetUsd: 3,
      limit: null,
    }, {
      claimTasks,
      completeTask: vi.fn(async () => ({ status: "done" })),
      isBudgetExhausted: checkBudget,
      getRunSpend: vi.fn(async () => 3.01),
    });

    expect(claimTasks).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      budgetExhausted: true,
      spendUsd: 3.01,
      stage2SkippedReason: "budget_exhausted",
      stages: { stage_1: { done: 1 } },
    });
    expect(result.stages.stage_2).toBeUndefined();
  });
});

function finalReportData({ failures = [] }: { failures?: Array<{ id: string }> } = {}) {
  return {
    runSelection: {
      ids: ["57", "61", "63", "64"],
      entries: [
        { runId: "57", roles: ["stage3"] },
        { runId: "61", roles: ["redemption"] },
        { runId: "63", roles: ["enrichment.contact_fill.0"] },
        { runId: "64", roles: ["enrichment.reviews_fetch"] },
      ],
    },
    external: { calls: 10 },
    tasks: { total: 20 },
    stage3: { humanReviewRows: 282 },
    redemption: { redeemRows: 1 },
    reconciliation: {
      ok: failures.length === 0,
      checks: [],
      failures,
    },
  };
}
