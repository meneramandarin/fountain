const ID_ONLY_SEARCH = Object.freeze({
  fieldMask: "places.id",
  estimatedCostUsd: 0,
});

/**
 * Google Places fields are selected by task and operation. Callers cannot
 * append ad-hoc fields, which keeps a cheap task from drifting into a more
 * expensive SKU unnoticed.
 *
 * A null estimate means pricing must be supplied (and approved) at call time.
 * This is intentional for reviews and other deferred campaign work whose
 * pricing must be checked immediately before execution.
 */
export const PLACES_TASK_CONFIG = deepFreeze({
  legitimacy_check: {
    searchText: ID_ONLY_SEARCH,
    details: {
      fieldMask: "id,displayName,formattedAddress,location,businessStatus,types",
      estimatedCostUsd: null,
    },
  },
  contact_fill: {
    searchText: ID_ONLY_SEARCH,
    details: {
      fieldMask: "id,displayName,formattedAddress,location,businessStatus,internationalPhoneNumber,nationalPhoneNumber,websiteUri",
      // Matches the $20 / 1,000-call estimate used by the existing backfill.
      estimatedCostUsd: 0.02,
    },
  },
  geocode: {
    searchText: ID_ONLY_SEARCH,
    details: {
      fieldMask: "id,formattedAddress,location",
      // Current Place Details Essentials gross price: $5 / 1,000 calls.
      estimatedCostUsd: 0.005,
    },
  },
  image_harvest: {
    searchText: ID_ONLY_SEARCH,
    details: {
      fieldMask: "id,displayName,photos",
      estimatedCostUsd: null,
    },
  },
  reviews_fetch: {
    searchText: ID_ONLY_SEARCH,
    details: {
      // formattedAddress is required for branch-level identity validation.
      // The reviews field already selects the higher Enterprise + Atmosphere
      // SKU, so this does not raise the approved per-call price.
      fieldMask: "id,displayName,formattedAddress,rating,userRatingCount,reviews",
      estimatedCostUsd: null,
    },
  },
  freshness_check: {
    searchText: ID_ONLY_SEARCH,
    details: {
      fieldMask: "id,displayName,formattedAddress,location,businessStatus,internationalPhoneNumber,nationalPhoneNumber,websiteUri",
      estimatedCostUsd: 0.02,
    },
  },
});

export function getPlacesRequestConfig(taskType, operation) {
  if (typeof taskType !== "string" || !taskType.trim()) {
    throw new TypeError("Places task type must be a non-empty string.");
  }
  if (operation !== "searchText" && operation !== "details") {
    throw new Error(`Unsupported Places operation \"${operation}\".`);
  }

  const task = PLACES_TASK_CONFIG[taskType.trim()];
  if (!task) {
    throw new Error(`Task \"${taskType}\" has no Google Places field-mask configuration.`);
  }
  return task[operation];
}

export function getPlacesFieldMask(taskType, operation) {
  return getPlacesRequestConfig(taskType, operation).fieldMask;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
