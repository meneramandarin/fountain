import { handleLlmSmoke } from "../tasks/llm_smoke.mjs";
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
  legitimacy_check: pendingTask(),
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
  if (requireHandler && typeof task.handler !== "function") {
    throw new Error(`Task type ${taskType} is not implemented in Phase B.`);
  }
  return task;
}

function pendingTask() {
  return { handler: null, maxAttempts: 3, production: true, implemented: false };
}
