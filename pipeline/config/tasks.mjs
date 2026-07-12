import { handleLlmSmoke } from "../tasks/llm_smoke.mjs";
import {
  handleLegitimacyBatch,
  LEGITIMACY_STAGE_1_BATCH_SIZE,
  LEGITIMACY_STAGE_2_BATCH_SIZE,
} from "../tasks/legitimacy.mjs";
import { handleNoop } from "../tasks/noop.mjs";

export const TASK_TYPES = [
  "legitimacy_check",
  "contact_fill",
  "geocode",
  "image_harvest",
  "image_classify",
  "menu_extract",
  "reviews_fetch",
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
  contact_fill: pendingTask(),
  geocode: pendingTask(),
  image_harvest: pendingTask(),
  image_classify: pendingTask(),
  menu_extract: pendingTask(),
  reviews_fetch: pendingTask(),
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
