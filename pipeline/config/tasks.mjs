import { handleLlmSmoke } from "../tasks/llm_smoke.mjs";
import { createContactFillHandler } from "../tasks/contact_fill.mjs";
import { createGeocodeHandler } from "../tasks/geocode.mjs";
import { handleImageClassify } from "../tasks/image_classify.mjs";
import { handleImageHarvest } from "../tasks/image_harvest.mjs";
import {
  handleLegitimacyBatch,
  LEGITIMACY_STAGE_1_BATCH_SIZE,
  LEGITIMACY_STAGE_2_BATCH_SIZE,
} from "../tasks/legitimacy.mjs";
import { handleNoop } from "../tasks/noop.mjs";
import { handleMenuExtract } from "../tasks/menu_extract.mjs";
import { createReviewsFetchHandler } from "../tasks/reviews_fetch.mjs";
import { handleClinicianLicenseVerify } from "../tasks/clinician_license_verify.mjs";
import { createOpenRouterAgentWebSearch } from "../lib/openrouter-web-search.mjs";

const contactFillHandler = createContactFillHandler({
  agentSearch: createOpenRouterAgentWebSearch(),
  getRunSpend: getCanonicalContactPlacesSpend,
});
const geocodeHandler = createGeocodeHandler({ detailsCostUsd: 0.005 });
const reviewsFetchHandler = createReviewsFetchHandler();

export const TASK_TYPES = [
  "legitimacy_check",
  "contact_fill",
  "geocode",
  "image_harvest",
  "image_classify",
  "menu_extract",
  "reviews_fetch",
  "clinician_license_verify",
  "dedup_scan",
  "freshness_check",
  "noop",
  "llm_smoke",
];

export const TASKS = Object.freeze({
  legitimacy_check: {
    batchHandler: handleLegitimacyBatch,
    batchSizeByStage: {
      stage_1: LEGITIMACY_STAGE_1_BATCH_SIZE,
      stage_2: LEGITIMACY_STAGE_2_BATCH_SIZE,
    },
    maxAttempts: 3,
    production: true,
    implemented: true,
  },
  contact_fill: implementedTask(contactFillHandler),
  geocode: implementedTask(geocodeHandler),
  image_harvest: implementedTask(handleImageHarvest),
  image_classify: implementedTask(handleImageClassify),
  menu_extract: implementedTask(handleMenuExtract),
  reviews_fetch: implementedTask(reviewsFetchHandler),
  clinician_license_verify: implementedTask(handleClinicianLicenseVerify),
  dedup_scan: pendingTask(),
  freshness_check: pendingTask(),
  noop: { handler: handleNoop, maxAttempts: 3, production: false },
  llm_smoke: {
    handler: handleLlmSmoke,
    maxAttempts: 1,
    production: false,
    retryable: false,
  },
});

export function getTaskDefinition(taskType, { requireHandler = false } = {}) {
  const task = TASKS[taskType];
  if (!task) throw new Error(`Unknown task type: ${taskType}`);
  if (
    requireHandler
    && typeof task.handler !== "function"
    && typeof task.batchHandler !== "function"
  ) {
    throw new Error(`Task type ${taskType} is not implemented in Phase B.`);
  }
  return task;
}

function pendingTask() {
  return { handler: null, maxAttempts: 3, production: true, implemented: false };
}

function implementedTask(handler) {
  return { handler, maxAttempts: 3, production: true, implemented: true };
}

async function getCanonicalContactPlacesSpend() {
  const { query } = await import("../lib/db.mjs");
  const result = await query(`
    SELECT COALESCE(sum(call.cost_estimate_usd), 0)::numeric AS spend
    FROM fountain_ops.external_calls call
    JOIN fountain_ops.runs run ON run.id = call.run_id
    WHERE call.provider = 'google_places'
      AND (
        run.command IN ('stage3', 'redemption')
        OR (run.command = 'drain' AND run.args->>'task' = 'contact_fill')
      )
  `);
  return Number(result.rows[0]?.spend || 0);
}
