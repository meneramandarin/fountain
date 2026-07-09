#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  addFountainReferralParams,
  extractGoogleSerpRedirectTarget,
  isGoogleSerpRedirectWrapper,
  sanitizeUrl,
  shouldSkipFountainReferralParams,
} from "../src/lib/url-sanitize.mjs";

assert.equal(
  sanitizeUrl("https://example.com/path?utm_source=x&keep=1&gclid=abc#section"),
  "https://example.com/path?keep=1#section",
);

assert.equal(
  sanitizeUrl("https://example.com/path?utm_medium=email&fbclid=abc"),
  "https://example.com/path",
);

assert.equal(
  sanitizeUrl("https://www.googleadservices.com/pagead?url=https%3A%2F%2Fexample.com&ref=https%3A%2F%2Fsource.example"),
  "https://www.googleadservices.com/pagead?url=https%3A%2F%2Fexample.com",
);

assert.equal(
  sanitizeUrl("https://example.com/path?ref=doctor-directory&keep=yes"),
  "https://example.com/path?ref=doctor-directory&keep=yes",
);

assert.equal(
  sanitizeUrl("/url?q=https://example.com/path%3Futm_source%3Dgoogle%26keep%3D1&opi=abc"),
  "/url?q=https%3A%2F%2Fexample.com%2Fpath%3Fkeep%3D1&opi=abc",
);

assert.equal(
  sanitizeUrl("https://example.com/specialties/wound-care?location=clinic-slug%3Futm_campaign%3Dcorp_listings_mgmt"),
  "https://example.com/specialties/wound-care?location=clinic-slug",
);

assert.equal(
  sanitizeUrl("example.com/path?mc_cid=abc&keep=yes"),
  "example.com/path?keep=yes",
);

assert.equal(
  addFountainReferralParams("https://example.com/path?keep=1"),
  "https://example.com/path?keep=1&utm_source=fountain.clinic&utm_medium=referral",
);

assert.equal(shouldSkipFountainReferralParams("https://shawellnessclinic.com/programs"), true);
assert.equal(shouldSkipFountainReferralParams("https://booking.shawellnessclinic.com/programs"), true);
assert.equal(addFountainReferralParams("https://shawellnessclinic.com/programs"), "https://shawellnessclinic.com/programs");

assert.equal(isGoogleSerpRedirectWrapper("/url?q=https%3A%2F%2Fwww.carilionclinic.org%2F&sa=U&ved=abc"), true);
assert.equal(
  extractGoogleSerpRedirectTarget("/url?q=https%3A%2F%2Fwww.carilionclinic.org%2F%3Futm_source%3Dgoogle&sa=U&ved=abc"),
  "https://www.carilionclinic.org/",
);

console.log("url sanitizer tests passed");
