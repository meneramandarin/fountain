#!/usr/bin/env node

const baseUrl = (process.env.TEST_BASE_URL || "http://127.0.0.1:3107").replace(/\/$/, "");

const sameOriginHeaders = {
  "User-Agent": "Mozilla/5.0",
  "Sec-Fetch-Site": "same-origin",
};

const checks = [];

await testAutocompleteCountry();
await testIrelandCountrySearch();
await testDublinRadiusSearch();

for (const check of checks) {
  console.log(`PASS ${check}`);
}

async function testAutocompleteCountry() {
  const payload = await getJson("/api/cities/suggest?q=irel");
  const suggestions = payload.suggestions || [];
  const ireland = suggestions.find(
    (suggestion) => suggestion.place_type === "country" && suggestion.country_code === "IE",
  );

  assert(ireland, "autocomplete for irel should include Ireland as a country option");
  assert(ireland.label === "Ireland", "Ireland country option should display as Ireland");
  assert(
    suggestions.findIndex((suggestion) => suggestion.id === ireland.id) >=
      suggestions.findIndex((suggestion) => suggestion.place_type === "locality"),
    "country suggestions should rank below city/locality suggestions",
  );
  checks.push("autocomplete returns Ireland as a country option");
}

async function testIrelandCountrySearch() {
  const payload = await getJson(
    "/api/search?kind=locations&country=IE&city_label=Ireland&city_country=IE&place_type=country",
  );
  const results = payload.results || [];

  assert(payload.mode === "country_search", "country selection should use country_search mode");
  assert(payload.searched_country === "Ireland", "country search should surface the display country name");
  assert(results.length > 0, "country search should return Ireland listings");
  assert(results.every((result) => result.country_code === "IE"), "country search should only return IE listings");
  assert(results.some((result) => result.id === 3250), "country search should include Oxymed Ireland");
  assert(results.some((result) => !result.locality), "country search should include IE listings with null locality");
  checks.push("Ireland country search returns IE inventory including Oxymed and null-locality rows");
}

async function testDublinRadiusSearch() {
  const payload = await getJson(
    "/api/search?kind=locations&city_label=Dublin&city_country=IE&city_lat=53.3498053&city_lng=-6.2603097",
  );
  const results = payload.results || [];

  assert(payload.mode === "exact_radius", "Dublin search should use radius mode");
  assert(payload.searched_city === "Dublin", "Dublin search should preserve the selected city label");
  assert(results.some((result) => result.id === 3250), "Dublin radius search should include Oxymed Ireland");
  checks.push("Dublin radius search includes Oxymed Ireland");
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: sameOriginHeaders });
  const body = await response.text();
  assert(response.ok, `${path} returned ${response.status}: ${body.slice(0, 500)}`);

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${path} returned invalid JSON: ${error.message}\n${body.slice(0, 500)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
