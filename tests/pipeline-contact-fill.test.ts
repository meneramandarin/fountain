import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline intentionally uses native .mjs modules.
import * as contactFill from "../pipeline/tasks/contact_fill.mjs";

const {
  crawlContactPages,
  extractContactFields,
  guardedFillField,
  handleContactFill,
  normalizePhone,
} = contactFill;

describe("contact_fill queue handler", () => {
  test("discovers with the agent first, crawls cached contact pages, and guards all website-derived writes", async () => {
    const order: string[] = [];
    const state = locationRow({
      id: 101,
      name: "Alpha Longevity",
      locality: "Austin",
      region: "TX",
      country_code: "US",
    });
    const agentSearch = vi.fn(async () => {
      order.push("agent");
      return {
        results: [{
          url: "https://alphalongevity.example/",
          title: "Alpha Longevity - Austin",
          snippet: "Consumer longevity services in Austin, Texas.",
        }],
      };
    });
    const webClient = {
      fetchHomepage: vi.fn(async (url: string) => {
        order.push(`crawl:${new URL(url).pathname}`);
        if (new URL(url).pathname === "/contact") {
          return page(url, "Contact Alpha Longevity in Austin. Email care@alphalongevity.example Phone (512) 555-0123 Address 123 Main Street, Austin, TX 78701 Contact");
        }
        return page(url, "Alpha Longevity offers consumer preventive care in Austin.");
      }),
    };
    const placesClient = {
      searchText: vi.fn(),
      getDetails: vi.fn(),
    };
    const harness = writeHarness(state, order);

    const result = await handleContactFill({
      task: { id: "501", entity_type: "location", entity_id: 101 },
      run: { id: "80", budget_usd: 50 },
      agentSearch,
    }, {
      query: locationQuery(state),
      placesClient,
      webClient,
      recordWrite: harness.recordWrite,
      setActor: harness.setActor,
      getRunSpend: vi.fn(async () => 0),
    });

    expect(order[0]).toBe("agent");
    expect(order).toContain("crawl:/");
    expect(order.indexOf("write:website")).toBeLessThan(order.indexOf("crawl:/"));
    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(placesClient.getDetails).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: "contact_filled",
      location_id: 101,
      final: {
        website: "https://alphalongevity.example/",
        email: "care@alphalongevity.example",
        phone: "+15125550123",
      },
      serving_write: {
        attempted: true,
        written: true,
        written_fields: ["website", "email", "phone", "address"],
      },
      email_source_policy: "website_only",
    });
    expect(result.fields.email.source).toBe("website_crawl");
    expect(result.fields.phone.source).toBe("website_crawl");
    expect(harness.setActor).toHaveBeenCalledTimes(4);
    expect(harness.events).toEqual(["website", "email", "phone", "address"]);
  });

  test("uses final contact-only Places details only after crawl for still-missing phone and address", async () => {
    const order: string[] = [];
    const state = locationRow({
      id: 102,
      name: "Beacon Longevity",
      locality: "Boston",
      region: "MA",
      country_code: "US",
    });
    const agentSearch = vi.fn(async () => {
      order.push("agent");
      return [{
        url: "https://beaconlongevity.example/",
        title: "Beacon Longevity Boston",
        snippet: "Longevity programs in Boston, Massachusetts.",
      }];
    });
    const webClient = {
      fetchHomepage: vi.fn(async (url: string) => {
        order.push(`crawl:${new URL(url).pathname}`);
        return page(url, "Email hello@beaconlongevity.example");
      }),
    };
    const placesClient = {
      searchText: vi.fn(async (request: Record<string, unknown>) => {
        order.push("places_search");
        expect(request).toMatchObject({ taskType: "contact_fill", maxResultCount: 1 });
        return { data: { places: [{ id: "beacon-place" }] }, externalCallId: 601, fieldMask: "places.id" };
      }),
      getDetails: vi.fn(async (request: Record<string, unknown>) => {
        order.push("places_details");
        expect(request).toMatchObject({ taskType: "contact_fill", placeId: "beacon-place" });
        return {
          data: {
            displayName: { text: "Beacon Longevity" },
            formattedAddress: "80 Summer Street, Boston, MA 02110",
            websiteUri: "https://beaconlongevity.example/",
            internationalPhoneNumber: "+1 617-555-0199",
            email: "must-not-be-used@example.test",
          },
          externalCallId: 602,
        };
      }),
    };
    const harness = writeHarness(state, order);

    const result = await handleContactFill({
      task: { id: "502", entity_type: "location", entity_id: 102 },
      run: { id: "81", budget_usd: 50 },
      agentSearch,
    }, {
      query: locationQuery(state),
      placesClient,
      webClient,
      recordWrite: harness.recordWrite,
      setActor: harness.setActor,
      getRunSpend: vi.fn(async () => 0),
    });

    expect(order.indexOf("crawl:/")).toBeLessThan(order.indexOf("places_search"));
    expect(order.indexOf("places_search")).toBeLessThan(order.indexOf("places_details"));
    expect(result.fields.email).toMatchObject({ written: true, source: "website_crawl" });
    expect(result.fields.phone).toMatchObject({
      written: true,
      source: "google_places_contact_details",
      value: "+16175550199",
    });
    expect(result.fields.address).toMatchObject({
      written: true,
      source: "google_places_contact_details",
      value: "80 Summer Street, Boston, MA 02110",
    });
    expect(result.fields.email.value).not.toBe("must-not-be-used@example.test");
  });

  test("falls back from agent discovery to Places ID search/details before crawling", async () => {
    const order: string[] = [];
    const state = locationRow({
      id: 103,
      name: "Cedar Recovery",
      locality: "Denver",
      region: "CO",
      country_code: "US",
    });
    const agentSearch = vi.fn(async () => {
      order.push("agent");
      return { results: [] };
    });
    const placesClient = {
      searchText: vi.fn(async () => {
        order.push("places_search");
        return { data: { places: [{ id: "cedar-place" }] }, externalCallId: 603 };
      }),
      getDetails: vi.fn(async () => {
        order.push("places_details");
        return {
          data: {
            displayName: { text: "Cedar Recovery" },
            formattedAddress: "Denver, CO",
            websiteUri: "https://cedarrecovery.example/",
          },
          externalCallId: 604,
        };
      }),
    };
    const webClient = {
      fetchHomepage: vi.fn(async (url: string) => {
        order.push("crawl");
        return page(url, "Cedar Recovery Denver");
      }),
    };
    const harness = writeHarness(state, order);

    const result = await handleContactFill({
      task: { id: "503", entity_type: "location", entity_id: 103 },
      run: { id: "82", budget_usd: 50 },
      agentSearch,
    }, {
      query: locationQuery(state),
      placesClient,
      webClient,
      recordWrite: harness.recordWrite,
      setActor: harness.setActor,
      getRunSpend: vi.fn(async () => 0),
    });

    expect(order.slice(0, 3)).toEqual(["agent", "places_search", "places_details"]);
    expect(order.indexOf("places_details")).toBeLessThan(order.indexOf("crawl"));
    expect(result.fields.website).toMatchObject({
      written: true,
      value: "https://cedarrecovery.example/",
      source: "google_places_contact_details",
    });
    expect(result.evidence.discovery_order).toEqual(expect.arrayContaining([
      "agent_web_search",
      "places_search_details_fallback",
      "cached_contact_crawl",
    ]));
  });

  test("prefers a stored Google provider ID for direct details before agent search", async () => {
    const order: string[] = [];
    const state = locationRow({
      id: 104,
      name: "Delta Wellness",
      locality: "Miami",
      region: "FL",
      country_code: "US",
      external_place_matches: [{ provider: "google", provider_place_id: "stored-delta" }],
    });
    const agentSearch = vi.fn(async () => {
      order.push("agent");
      return [];
    });
    const placesClient = {
      searchText: vi.fn(),
      getDetails: vi.fn(async (request: Record<string, unknown>) => {
        order.push("stored_details");
        expect(request).toMatchObject({ placeId: "stored-delta", taskType: "contact_fill" });
        return {
          data: {
            displayName: { text: "Delta Wellness" },
            formattedAddress: "Miami, FL",
            websiteUri: "https://deltawellness.example/",
          },
        };
      }),
    };
    const harness = writeHarness(state, order);

    const result = await handleContactFill({
      task: { id: "504", entity_type: "location", entity_id: 104 },
      run: { id: "83", budget_usd: 50 },
      agentSearch,
    }, {
      query: locationQuery(state),
      placesClient,
      webClient: { fetchHomepage: vi.fn(async (url: string) => page(url, "Delta Wellness Miami")) },
      recordWrite: harness.recordWrite,
      setActor: harness.setActor,
      getRunSpend: vi.fn(async () => 0),
    });

    expect(order[0]).toBe("stored_details");
    expect(agentSearch).not.toHaveBeenCalled();
    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(result.fields.website.written).toBe(true);
  });

  test("retains contact fields from identity-validated stored details when website fallback finds no site", async () => {
    const state = locationRow({
      id: 109,
      name: "Golf Health",
      locality: "Portland",
      region: "OR",
      country_code: "US",
      external_place_matches: [{ provider: "google", provider_place_id: "golf-stored" }],
    });
    const placesClient = {
      searchText: vi.fn(async () => ({ data: { places: [] } })),
      getDetails: vi.fn(async () => ({ data: {
        displayName: { text: "Golf Health" },
        formattedAddress: "19 Pine Road, Portland, OR 97205",
        internationalPhoneNumber: "+1 503-555-0177",
      } })),
    };
    const harness = writeHarness(state, []);
    const result = await handleContactFill({
      task: { id: "509", entity_type: "location", entity_id: 109 },
      run: { id: "87", budget_usd: 50 },
      agentSearch: vi.fn(async () => []),
    }, {
      query: locationQuery(state),
      placesClient,
      webClient: { fetchHomepage: vi.fn() },
      recordWrite: harness.recordWrite,
      setActor: harness.setActor,
      getRunSpend: vi.fn(async () => 0),
    });

    expect(placesClient.getDetails).toHaveBeenCalledOnce();
    expect(result.fields.website.attempted).toBe(false);
    expect(result.fields.phone).toMatchObject({ written: true, value: "+15035550177" });
    expect(result.fields.address).toMatchObject({
      written: true,
      value: "19 Pine Road, Portland, OR 97205",
    });
  });

  test("degrades at the $50 contact budget to agent and cached-web evidence only", async () => {
    const order: string[] = [];
    const state = locationRow({
      id: 105,
      name: "Echo Longevity",
      locality: "Seattle",
      region: "WA",
      country_code: "US",
    });
    const placesClient = { searchText: vi.fn(), getDetails: vi.fn() };
    const harness = writeHarness(state, order);
    const result = await handleContactFill({
      task: { id: "505", entity_type: "location", entity_id: 105 },
      run: { id: "84", budget_usd: 50 },
      agentSearch: vi.fn(async () => [{
        url: "https://echolongevity.example/",
        title: "Echo Longevity Seattle",
        snippet: "Consumer longevity care in Seattle, Washington.",
      }]),
    }, {
      query: locationQuery(state),
      placesClient,
      webClient: { fetchHomepage: vi.fn(async (url: string) => page(url, "Email team@echolongevity.example")) },
      recordWrite: harness.recordWrite,
      setActor: harness.setActor,
      getRunSpend: vi.fn(async () => 50),
    });

    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(placesClient.getDetails).not.toHaveBeenCalled();
    expect(result.budget).toMatchObject({
      limit_usd: 50,
      spend_usd: 50,
      degraded_to_agent_only: true,
      places_calls_allowed: false,
    });
    expect(result.fields.website.written).toBe(true);
    expect(result.fields.email.written).toBe(true);
    expect(result.fields.phone.attempted).toBe(false);
  });

  test("rejects stale stored-place identity and uses text-search fallback without leaking stale contacts", async () => {
    const order: string[] = [];
    const state = locationRow({
      id: 108,
      name: "Foxtrot Longevity",
      locality: "Austin",
      region: "TX",
      country_code: "US",
      external_place_matches: [{ provider: "google_places", provider_place_id: "stale-place" }],
    });
    const placesClient = {
      searchText: vi.fn(async () => {
        order.push("corrected_search");
        return { data: { places: [{ id: "correct-place" }] } };
      }),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => {
        order.push(`details:${placeId}`);
        if (placeId === "stale-place") {
          return { data: {
            displayName: { text: "Unrelated Supply" },
            formattedAddress: "Chicago, IL",
            websiteUri: "https://unrelated.example/",
            internationalPhoneNumber: "+1 312-555-0100",
          } };
        }
        return { data: {
          displayName: { text: "Foxtrot Longevity" },
          formattedAddress: "250 Lake Road, Austin, TX 78701",
          websiteUri: "https://foxtrotlongevity.example/",
          internationalPhoneNumber: "+1 512-555-0188",
        } };
      }),
    };
    const harness = writeHarness(state, order);
    const result = await handleContactFill({
      task: { id: "508", entity_type: "location", entity_id: 108 },
      run: { id: "86", budget_usd: 50 },
      agentSearch: vi.fn(async () => [{
        url: "https://foxtrotlongevity.example/",
        title: "Foxtrot Longevity Austin",
        snippet: "Consumer longevity clinic in Austin, Texas.",
      }]),
    }, {
      query: locationQuery(state),
      placesClient,
      webClient: { fetchHomepage: vi.fn(async (url: string) => page(url, "Foxtrot Longevity")) },
      recordWrite: harness.recordWrite,
      setActor: harness.setActor,
      getRunSpend: vi.fn(async () => 0),
    });

    expect(order.indexOf("details:stale-place")).toBeLessThan(order.indexOf("corrected_search"));
    expect(placesClient.getDetails).toHaveBeenCalledTimes(2);
    expect(result.fields.phone.value).toBe("+15125550188");
    expect(result.fields.phone.value).not.toBe("+13125550100");
    expect(result.evidence.places[0]).toMatchObject({
      provider_place_id: "stale-place",
      outcome: "identity_mismatch",
      identity_validated: false,
    });
  });

  test("skips inactive or source-suppressed locations before external calls or writes", async () => {
    for (const [row, reason] of [
      [locationRow({ id: 106, status: "hidden" }), "location_not_active"],
      [locationRow({ id: 107, suppression_count: 1 }), "location_suppressed"],
    ] as const) {
      const agentSearch = vi.fn();
      const placesClient = { searchText: vi.fn(), getDetails: vi.fn() };
      const recordWrite = vi.fn();
      const result = await handleContactFill({
        task: { id: String(500 + Number(row.id)), entity_type: "location", entity_id: row.id },
        run: { id: "85", budget_usd: 50 },
        agentSearch,
      }, {
        query: vi.fn(async () => ({ rows: [row] })),
        placesClient,
        webClient: { fetchHomepage: vi.fn() },
        recordWrite,
        getRunSpend: vi.fn(),
      });
      expect(result).toMatchObject({ outcome: "skipped", skip_reason: reason });
      expect(agentSearch).not.toHaveBeenCalled();
      expect(placesClient.searchText).not.toHaveBeenCalled();
      expect(placesClient.getDetails).not.toHaveBeenCalled();
      expect(recordWrite).not.toHaveBeenCalled();
    }
  });
});

describe("contact extraction and guarded persistence", () => {
  test("normalizes E.164 phones and extracts website-only contact evidence", () => {
    expect(normalizePhone("(212) 555-0100", "US")).toBe("+12125550100");
    expect(normalizePhone("020 7946 0958", "GB")).toBe("+442079460958");
    expect(normalizePhone("+49 30 123456", "DE")).toBe("+4930123456");
    expect(normalizePhone("555", "US")).toBeNull();

    expect(extractContactFields([{
      ok: true,
      title: "Contact",
      description: "",
      text_excerpt: "Email hello@exampleclinic.com Phone 212-555-0100 Visit 45 Oak Avenue, New York, NY 10001 Contact",
    }], { countryCode: "US" })).toMatchObject({
      email: "hello@exampleclinic.com",
      phone: "+12125550100",
      address: expect.stringContaining("45 Oak Avenue"),
    });
  });

  test("crawls homepage then same-origin contact/about/impressum links through the cached interface", async () => {
    const fetched: string[] = [];
    const webClient = {
      fetchHomepage: vi.fn(async (url: string) => {
        fetched.push(url);
        return {
          ...page(url, "Page content"),
          links: url.endsWith("/")
            ? [
                { href: "/contact-us", text: "Contact" },
                { href: "https://other.example/about", text: "About elsewhere" },
              ]
            : [],
        };
      }),
    };

    const crawl = await crawlContactPages("https://clinic.example/", webClient);

    expect(fetched).toEqual([
      "https://clinic.example/",
      "https://clinic.example/contact-us",
      "https://clinic.example/about",
      "https://clinic.example/impressum",
    ]);
    expect(crawl).toMatchObject({ successful_pages: 4 });
    expect(crawl.attempted_urls).not.toContain("https://other.example/about");
  });

  test("still probes conventional contact pages when the homepage fetch fails", async () => {
    const fetched: string[] = [];
    const crawl = await crawlContactPages("https://clinic.example/", {
      fetchHomepage: vi.fn(async (url: string) => {
        fetched.push(url);
        if (url.endsWith("/")) return { ...page(url, ""), ok: false, outcome: "http_error" };
        return page(url, "Contact hello@clinic.example");
      }),
    });

    expect(fetched).toEqual([
      "https://clinic.example/",
      "https://clinic.example/contact",
      "https://clinic.example/about",
      "https://clinic.example/impressum",
    ]);
    expect(crawl.successful_pages).toBe(3);
  });

  test("refuses email candidates from any non-website source before the field ledger", async () => {
    const recordWrite = vi.fn();
    const result = await guardedFillField({
      field: "email",
      value: "places@example.test",
      source: "google_places_contact_details",
      taskId: "601",
      runId: "91",
      locationId: 201,
      actorLabel: "contact_fill_run_91",
    }, { recordWrite });

    expect(result).toMatchObject({
      attempted: false,
      written: false,
      reason: "email_source_not_allowed",
    });
    expect(recordWrite).not.toHaveBeenCalled();
  });

  test("rechecks active/non-suppressed state inside recordWrite and refuses without mutation", async () => {
    const update = vi.fn();
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FOR UPDATE")) {
          return { rows: [{
            status: "active",
            deleted_at: null,
            website: null,
            email: null,
            phone: null,
            address: null,
            non_suppressed: false,
          }] };
        }
        update();
        return { rows: [], rowCount: 0 };
      }),
    };
    const recordWrite = vi.fn(async (options: {
      mutate: (client: typeof tx) => Promise<unknown>;
    }) => options.mutate(tx));
    const setActor = vi.fn();

    const result = await guardedFillField({
      field: "website",
      value: "https://clinic.example/",
      source: "agent_web_search",
      taskId: "600",
      runId: "90",
      locationId: 200,
      actorLabel: "contact_fill_run_90",
    }, { recordWrite, setActor });

    expect(result).toMatchObject({
      attempted: true,
      written: false,
      reason: "location_suppressed",
    });
    expect(setActor).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Test Clinic",
    address: null,
    locality: "Testville",
    region: "CA",
    postal_code: null,
    country_code: "US",
    latitude: null,
    longitude: null,
    website: null,
    email: null,
    phone: null,
    status: "active",
    deleted_at: null,
    organization_name: null,
    external_place_matches: [],
    suppression_count: 0,
    ...overrides,
  };
}

function locationQuery(state: Record<string, unknown>) {
  return vi.fn(async () => ({ rows: [{ ...state }] }));
}

function writeHarness(state: Record<string, unknown>, order: string[]) {
  const events: string[] = [];
  const setActor = vi.fn(async () => undefined);
  const recordWrite = vi.fn(async (options: {
    field: string;
    mutate: (tx: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    }) => Promise<unknown>;
  }) => {
    const field = options.field;
    order.push(`write:${field}`);
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FOR UPDATE")) {
        return { rows: [{
          status: state.status,
          deleted_at: state.deleted_at,
          website: state.website,
          email: state.email,
          phone: state.phone,
          address: state.address,
          non_suppressed: Number(state.suppression_count || 0) === 0,
        }] };
      }
      if (sql.includes("transaction_timestamp")) {
        return { rows: [{ write_started_at: "2026-07-12T09:00:00.000Z" }] };
      }
      if (sql.includes("UPDATE fountain.locations")) {
        state[field] = params[1];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE fountain.entity_change_events")) {
        events.push(field);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected write query: ${sql}`);
    });
    const result = await options.mutate({ query });
    return { written: true, result };
  });
  return { recordWrite, setActor, events };
}

function page(url: string, text: string) {
  return {
    ok: true,
    outcome: "ok",
    requestedUrl: url,
    finalUrl: url,
    title: "Contact",
    description: "",
    textExcerpt: text,
    cached: true,
    deduplicated: false,
    links: [],
    error: null,
  };
}
