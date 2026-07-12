import {
  setMutationActor as defaultSetMutationActor,
  withTransaction as defaultWithTransaction,
} from "./db.mjs";
import { recordWrite as defaultRecordWrite } from "./ledger.mjs";
import { HARD_EXCLUSION_PREDICATE_SQL } from "./legitimacy-sample.mjs";
import { createPlacesClient } from "./places.mjs";
import { createWebClient } from "./web.mjs";
import { discoverWebsiteForLocation } from "./website-discovery.mjs";

export const REDEMPTION_WEBSITE_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120005";
export const REDEMPTION_PLACES_CONTACT_CEILING_USD = 50;
export const REDEMPTION_PLACES_DETAILS_USD = 0.02;

/** Build the lookup callback consumed by runLegitimacyRedemptionPass. */
export function createRedemptionAgentLookup({
  runId,
  webSearch,
  placesContactCeilingUsd = REDEMPTION_PLACES_CONTACT_CEILING_USD,
} = {}, {
  placesClient = createPlacesClient(),
  webClient = createWebClient(),
  withTransaction = defaultWithTransaction,
  setMutationActor = defaultSetMutationActor,
  recordWrite = defaultRecordWrite,
} = {}) {
  const normalizedRunId = positiveIntegerString(runId, "runId");
  if (typeof webSearch !== "function") throw new TypeError("webSearch must be a function.");
  const ceiling = nonnegativeNumber(placesContactCeilingUsd, "placesContactCeilingUsd");
  let placesReservedUsd = 0;
  let placesDisabledCalls = 0;
  let websitesAttempted = 0;
  let websitesWritten = 0;
  const actorLabel = `pass1_redemption_website_run_${normalizedRunId}`;

  const budgetedPlaces = {
    searchText: async (args) => {
      if (placesReservedUsd + REDEMPTION_PLACES_DETAILS_USD > ceiling) {
        placesDisabledCalls += 1;
        throw new Error("Places contact ceiling reached; agent-only degradation is active.");
      }
      return placesClient.searchText(args);
    },
    getDetails: async (args) => {
      if (placesReservedUsd + REDEMPTION_PLACES_DETAILS_USD > ceiling) {
        placesDisabledCalls += 1;
        throw new Error("Places contact ceiling reached; agent-only degradation is active.");
      }
      placesReservedUsd += REDEMPTION_PLACES_DETAILS_USD;
      return placesClient.getDetails(args);
    },
  };

  const lookup = async ({ location, externalPlaceMatches = [] } = {}) => {
    const discovery = await discoverWebsiteForLocation({
      location: {
        id: location.id,
        name: location.name,
        address: location.address,
        locality: location.locality,
        region: location.region,
        postal_code: location.postalCode,
        country_code: location.countryCode,
        // Force a fresh evidence lookup even when a URL was stored but not
        // successfully fetched during classification.
        website: null,
      },
      externalPlaceMatches,
      runId: normalizedRunId,
    }, { placesClient: budgetedPlaces, webSearch });

    const officialWebsite = discovery.outcome === "official_website_found"
      ? discovery.would_write_website
      : null;
    let page = null;
    if (officialWebsite) {
      page = await fetchWebsiteEvidence(officialWebsite, webClient);
    }

    let websiteWrite = { attempted: false, written: false, reason: "not_discovered" };
    if (officialWebsite && !text(location.website)) {
      websitesAttempted += 1;
      websiteWrite = await guardedWebsiteWrite({
        locationId: location.id,
        website: officialWebsite,
        actorLabel,
      }, { withTransaction, setMutationActor, recordWrite });
      if (websiteWrite.written) websitesWritten += 1;
    } else if (officialWebsite) {
      websiteWrite = { attempted: false, written: false, reason: "stored_website_present" };
    }

    return {
      officialWebsite,
      validation: discovery.validation,
      title: page?.title || "",
      description: page?.description || "",
      textExcerpt: page?.textExcerpt || "",
      evidence: page?.textExcerpt || page?.description || "",
      address: location.address || "",
      sources: officialWebsite ? [{
        url: officialWebsite,
        title: page?.title || location.name,
        snippet: page?.description || page?.textExcerpt || "",
      }] : [],
      discovery,
      websiteWrite,
    };
  };

  lookup.stats = () => ({
    placesContactCeilingUsd: ceiling,
    placesReservedUsd,
    placesDisabledCalls,
    websitesAttempted,
    websitesWritten,
  });
  return lookup;
}

async function guardedWebsiteWrite(
  { locationId, website, actorLabel },
  { withTransaction, setMutationActor, recordWrite },
) {
  try {
    return await withTransaction(async (tx) => {
      await setMutationActor(tx, {
        actorId: REDEMPTION_WEBSITE_ACTOR_ID,
        actorLabel,
      });
      const write = await recordWrite({
        entity: { entity_type: "location", entity_id: locationId },
        field: "website",
        verification: "agent_verified",
        actor: actorLabel,
        tx,
        mutate: async (innerTx) => {
          const guard = await innerTx.query(`
            SELECT
              location.id,
              nullif(btrim(location.website), '') AS website,
              location.deleted_at,
              ${HARD_EXCLUSION_PREDICATE_SQL
    .replaceAll("l.", "location.")
    .replaceAll("o.", "organization.")} AS hard_excluded
            FROM fountain.locations location
            LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
            WHERE location.id = $1
            FOR UPDATE OF location
          `, [locationId]);
          const row = guard.rows[0];
          if (!row || row.website || row.deleted_at || row.hard_excluded) {
            throw new Error(`Redemption website guard refused location ${locationId}.`);
          }
          const updated = await innerTx.query(`
            UPDATE fountain.locations
            SET website = $2, updated_at = now()
            WHERE id = $1
              AND nullif(btrim(website), '') IS NULL
              AND deleted_at IS NULL
            RETURNING id
          `, [locationId, website]);
          if (Number(updated.rowCount) !== 1) {
            throw new Error(`Redemption website update drifted for ${locationId}.`);
          }
          return updated.rows[0];
        },
      });
      return {
        attempted: true,
        written: Boolean(write?.written),
        reason: write?.written ? null : write?.reason || "ledger_guard",
      };
    });
  } catch (error) {
    return {
      attempted: true,
      written: false,
      reason: String(error instanceof Error ? error.message : error).slice(0, 500),
    };
  }
}

async function fetchWebsiteEvidence(url, webClient) {
  try {
    const result = await webClient.fetchHomepage(url);
    return {
      title: truncate(result.title, 500),
      description: truncate(result.description, 1_000),
      textExcerpt: truncate(result.textExcerpt, 5_000),
    };
  } catch {
    return { title: "", description: "", textExcerpt: "" };
  }
}

function positiveIntegerString(value, label) {
  const string = String(value ?? "");
  if (!/^[1-9]\d*$/u.test(string)) throw new TypeError(`${label} must be a positive integer.`);
  return string;
}

function nonnegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} must be non-negative.`);
  return number;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value, length) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .trim()
    .slice(0, length);
}
