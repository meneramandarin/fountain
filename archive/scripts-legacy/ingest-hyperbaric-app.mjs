#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { sanitizeUrl } from "../src/lib/url-sanitize.mjs";

const { Client } = pg;
const ROOT = process.cwd();
const SOURCE_SLUG = "hyperbaric_app";
const BASE_URL = "https://hyperbaric.app";
const HBOT_CANONICAL_NAME = "Hyperbaric oxygen therapy";
const NON_MATCHABLE_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "linktr.ee",
  "lin.ee",
  "doctoralia.com",
  "doctoralia.com.br",
  "doctoralia.com.mx",
  "bookimed.com",
  "us-uk.bookimed.com",
  "google.com",
  "maps.google.com",
  "hyperbaric.app",
]);
const options = parseArgs(process.argv.slice(2));
const phase = options.phase || "raw";
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const phaseDate = options.phaseDate || utcDateString();
const cacheDir = path.resolve(ROOT, options.cacheDir || ".cache/hyperbaric_app");
const delayMs = Number.parseInt(options.delayMs || "650", 10);
const maxClinics = options.maxClinics ? Number.parseInt(options.maxClinics, 10) : Infinity;
const auditTable = `hyperbaric_app_promotion_audit_${phaseDate}`;
const userAgent =
  options.userAgent ||
  "fountain-etl/1.0 (+https://fountain.clinic; source=hyperbaric_app; contact=operator)";

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const connectionString = normalizePostgresConnectionString(
  options.databaseUrl ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

mkdirSync(cacheDir, { recursive: true });
mkdirSync(path.join(cacheDir, "html"), { recursive: true });

const client = new Client({ connectionString });

try {
  await client.connect();
  if (phase === "raw") {
    await runRawLanding();
    await classifyPromotion({ dryRun: true });
  } else if (phase === "promotion-dry-run") {
    await ensureSourceRows();
    await classifyPromotion({ dryRun: true });
  } else if (phase === "promote") {
    if (!options.yes) {
      throw new Error("Promotion writes require --yes. Run --phase=promotion-dry-run first.");
    }
    await ensureSourceRows();
    await promoteServing();
  } else {
    throw new Error(`Unknown --phase=${phase}. Use raw, promotion-dry-run, or promote.`);
  }
} finally {
  await client.end();
}

async function runRawLanding() {
  await ensureSourceRows();
  const importRunId = await startImportRun();
  const startedAt = new Date().toISOString();
  const failures = [];
  let scraped = [];

  try {
    const discovery = await discoverClinicUrls();
    const clinicUrls = discovery.clinicUrls.slice(0, maxClinics);
    console.log(
      JSON.stringify(
        {
          phase: "discovery",
          sitemapClinicCount: discovery.sitemapClinicCount,
          cityClinicCount: discovery.cityClinicCount,
          cityPageCount: discovery.cityPageCount,
          dedupedClinicCount: discovery.clinicUrls.length,
          selectedClinicCount: clinicUrls.length,
          usingSitemapPreferred: discovery.sitemapClinicCount > 0,
        },
        null,
        2,
      ),
    );

    let index = 0;
    for (const url of clinicUrls) {
      index += 1;
      const slug = clinicSlugFromUrl(url);
      try {
        const html = await fetchCached(url, { cacheKey: `clinic-${slug}` });
        scraped.push(extractClinic(url, slug, html));
      } catch (error) {
        failures.push({ url, slug, error: error.message });
      }
      if (index % 50 === 0 || index === clinicUrls.length) {
        console.log(`scraped ${index}/${clinicUrls.length}; failures=${failures.length}`);
      }
    }

    await landRaw(scraped, {
      startedAt,
      discovery,
      failures,
      selectedClinicCount: clinicUrls.length,
    });

    const counts = await rawCounts();
    await client.query(
      `
      UPDATE ${quoteIdent(rawSchema)}.import_runs
      SET finished_at = now(),
          status = $2,
          listing_count = $3,
          image_count = $4,
          review_count = $5,
          field_count = $6,
          error = $7
      WHERE id = $1
      `,
      [
        importRunId,
        failures.length ? "synced_with_failures" : "synced",
        counts.listing_count,
        counts.image_count,
        counts.review_count,
        counts.field_count,
        failures.length ? JSON.stringify({ failures: failures.slice(0, 200), failure_count: failures.length }) : null,
      ],
    );

    console.log(JSON.stringify({ phase: "raw_landing", ...counts, failures: failures.length }, null, 2));
  } catch (error) {
    await client.query(
      `
      UPDATE ${quoteIdent(rawSchema)}.import_runs
      SET finished_at = now(), status = 'failed', error = $2
      WHERE id = $1
      `,
      [importRunId, JSON.stringify({ message: error.message, failures })],
    );
    await client.query(
      `
      UPDATE ${quoteIdent(rawSchema)}.source_databases
      SET sync_status = 'failed', metadata = metadata || $2::jsonb, updated_at = now()
      WHERE source_slug = $1
      `,
      [SOURCE_SLUG, JSON.stringify({ last_error: error.message, failure_count: failures.length })],
    );
    throw error;
  }
}

async function discoverClinicUrls() {
  const sitemapUrls = [];
  const cityClinicUrls = [];
  const cityUrls = new Set();

  try {
    const sitemap = await fetchCached(`${BASE_URL}/sitemap.xml`, { cacheKey: "sitemap", extension: "xml" });
    for (const match of sitemap.matchAll(/<loc>\s*(https:\/\/hyperbaric\.app\/clinic\/[^<\s]+)\s*<\/loc>/gi)) {
      sitemapUrls.push(stripTrailingSlash(match[1]));
    }
  } catch (error) {
    console.warn(`sitemap discovery failed: ${error.message}`);
  }

  const cityIndex = await fetchCached(`${BASE_URL}/city`, { cacheKey: "city-index" });
  for (const match of cityIndex.matchAll(/href=(?:"|&quot;)\/city\/([^"?#<\\]+)(?:"|&quot;)/g)) {
    cityUrls.add(`${BASE_URL}/city/${match[1]}`);
  }
  for (const match of cityIndex.matchAll(/\\"href\\":\\"\/city\/([^"?#<\\]+)\\"/g)) {
    cityUrls.add(`${BASE_URL}/city/${match[1]}`);
  }

  let cityIndexCount = 0;
  for (const cityUrl of [...cityUrls].sort()) {
    cityIndexCount += 1;
    try {
      const html = await fetchCached(cityUrl, { cacheKey: `city-${cityUrl.split("/").pop()}` });
      for (const url of extractClinicLinks(html)) {
        cityClinicUrls.push(url);
      }
    } catch (error) {
      console.warn(`city discovery failed ${cityUrl}: ${error.message}`);
    }
    if (cityIndexCount % 50 === 0 || cityIndexCount === cityUrls.size) {
      console.log(`discovered city pages ${cityIndexCount}/${cityUrls.size}`);
    }
  }

  const preferred = sitemapUrls.length ? sitemapUrls : cityClinicUrls;
  const all = new Set([...preferred, ...cityClinicUrls].map(stripTrailingSlash));
  return {
    clinicUrls: [...all].filter((url) => /\/clinic\/[^/]+$/.test(url)).sort(),
    sitemapClinicCount: new Set(sitemapUrls).size,
    cityClinicCount: new Set(cityClinicUrls).size,
    cityPageCount: cityUrls.size,
  };
}

function extractClinicLinks(html) {
  const urls = new Set();
  for (const match of html.matchAll(/href=(?:"|&quot;)\/clinic\/([^"?#<\\]+)(?:"|&quot;)/g)) {
    urls.add(`${BASE_URL}/clinic/${cleanSlug(match[1])}`);
  }
  for (const match of html.matchAll(/\\"href\\":\\"\/clinic\/([^"?#<\\]+)\\"/g)) {
    urls.add(`${BASE_URL}/clinic/${cleanSlug(match[1])}`);
  }
  return [...urls].map(stripTrailingSlash);
}

function extractClinic(sourceUrl, slug, html) {
  const jsonLd = extractMedicalBusinessJsonLd(html) || {};
  const address = jsonLd.address || {};
  const props = extractContactProps(html);
  const meta = extractMeta(html);
  const mapCoordinates = extractMapCoordinates(html);
  const geo = jsonLd.geo || {};
  const latitude = mapCoordinates?.latitude ?? numberOrNull(geo.latitude);
  const longitude = mapCoordinates?.longitude ?? numberOrNull(geo.longitude);
  const countryCode = cleanText(address.addressCountry || props.countryCode || null);
  const countryName =
    cleanText(props.country) ||
    cleanText(address.countryName) ||
    countryNameFromCode(countryCode) ||
    cleanText(address.addressCountry) ||
    null;
  const website = cleanWebsite(extractWebsite(html) || jsonLd.url || props.website || null);
  const phone = cleanText(extractTel(html) || jsonLd.telephone || props.phone || null);
  const name = cleanText(jsonLd.name || props.name || meta.ogTitle?.split(" — ")[0] || null);
  const rawAddress = cleanText(address.streetAddress || props.address || null);
  const fullAddress = buildFullAddress({
    street: rawAddress,
    locality: address.addressLocality || props.city,
    region: address.addressRegion,
    postalCode: address.postalCode,
    countryName,
  });
  const openingHours = normalizeOpeningHours(jsonLd.openingHoursSpecification);
  const images = extractImages(html, jsonLd, meta);
  const reviews = extractReviews(html);
  const rating = numberOrNull(jsonLd.aggregateRating?.ratingValue) ?? extractRatingFromMeta(meta.description);
  const reviewCount = integerOrNull(jsonLd.aggregateRating?.reviewCount) ?? extractReviewCountFromMeta(meta.description);
  const chamberType = extractChamberType(html, meta.description, jsonLd.description);
  const treatmentTags = extractTreatmentTags(html, jsonLd.description);
  const complementaryTherapies = extractComplementaryTherapies(html, jsonLd.description);
  const verified = />Verified<\/span>|Verified owner|Ownership confirmed/i.test(html);
  const claimed = /Verified owner|Ownership confirmed/i.test(html);

  return {
    source_slug: SOURCE_SLUG,
    source_listing_id: stableIntHash(slug),
    source_url: sourceUrl,
    slug,
    name,
    full_address: fullAddress,
    address: rawAddress,
    locality: cleanText(address.addressLocality || props.city || null),
    region: cleanText(address.addressRegion || null),
    postal_code: cleanText(address.postalCode || null),
    country_name: countryName,
    country_code: countryCode,
    latitude,
    longitude,
    phone,
    website,
    website_domain: websiteDomain(website),
    verified,
    claimed,
    chamber_type: chamberType,
    treatment_tags: treatmentTags,
    complementary_therapies: complementaryTherapies,
    opening_hours: openingHours,
    rating,
    review_count: reviewCount,
    reviews,
    images,
    og_image: meta.ogImage,
    payload: {
      source: SOURCE_SLUG,
      slug,
      source_url: sourceUrl,
      scraped_at: new Date().toISOString(),
      name,
      description: cleanText(jsonLd.description || meta.description || null),
      raw_address: rawAddress,
      full_address: fullAddress,
      address: {
        street: rawAddress,
        locality: cleanText(address.addressLocality || props.city || null),
        region: cleanText(address.addressRegion || null),
        postal_code: cleanText(address.postalCode || null),
        country_name: countryName,
        country_code: countryCode,
      },
      latitude,
      longitude,
      phone,
      website,
      website_domain: websiteDomain(website),
      verified,
      claimed,
      chamber_type: chamberType,
      treatment_tags: treatmentTags,
      complementary_therapies: complementaryTherapies,
      opening_hours: openingHours,
      rating,
      review_count: reviewCount,
      reviews,
      images,
      og_image: meta.ogImage,
      jsonld: jsonLd,
    },
  };
}

function extractMedicalBusinessJsonLd(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = decodeHtmlEntities(match[1]);
    try {
      const parsed = JSON.parse(raw);
      if (isMedicalBusiness(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed?.["@graph"])) {
        const node = parsed["@graph"].find(isMedicalBusiness);
        if (node) return node;
      }
    } catch {
      // Ignore non-clinic JSON-LD blocks.
    }
  }
  return null;
}

function isMedicalBusiness(value) {
  const type = value?.["@type"];
  return type === "MedicalBusiness" || (Array.isArray(type) && type.includes("MedicalBusiness"));
}

function extractMeta(html) {
  return {
    description: cleanText(metaContent(html, "description")),
    ogTitle: cleanText(metaProperty(html, "og:title")),
    ogImage: absoluteImageUrl(metaProperty(html, "og:image")),
  };
}

function metaContent(html, name) {
  return attrContent(html, new RegExp(`<meta[^>]+name=["']${escapeRegExp(name)}["'][^>]*>`, "i"));
}

function metaProperty(html, property) {
  return attrContent(html, new RegExp(`<meta[^>]+property=["']${escapeRegExp(property)}["'][^>]*>`, "i"));
}

function attrContent(html, tagPattern) {
  const tag = html.match(tagPattern)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] || null;
}

function extractContactProps(html) {
  const props = {};
  for (const key of ["phone", "website", "address", "city", "country", "name"]) {
    const match = html.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"));
    if (match) props[key] = decodeJsString(match[1]);
  }
  return props;
}

function extractMapCoordinates(html) {
  const decoded = decodeHtmlEntities(html);
  const match = decoded.match(/google\.com\/maps\/(?:dir|search)\/\?[^"'\s<>]*(?:destination|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return { latitude: Number.parseFloat(match[1]), longitude: Number.parseFloat(match[2]) };
}

function extractTel(html) {
  const match = html.match(/href=["']tel:([^"']+)["']/i);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function extractWebsite(html) {
  const hrefs = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((match) => decodeHtmlEntities(match[1]));
  return hrefs.find((href) => {
    try {
      const url = new URL(href);
      return (
        !/(^|\.)hyperbaric\.app$/i.test(url.hostname) &&
        !/(^|\.)google\./i.test(url.hostname) &&
        !/(^|\.)wa\.me$/i.test(url.hostname) &&
        !/(^|\.)yandex\./i.test(url.hostname)
      );
    } catch {
      return false;
    }
  });
}

function cleanWebsite(value) {
  const sanitized = sanitizeUrl(value);
  if (!sanitized) return null;
  try {
    const url = new URL(sanitized);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
      url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return sanitized.replace(/\/$/, "");
  }
}

function extractImages(html, jsonLd, meta) {
  const urls = new Set();
  const add = (value) => {
    const url = absoluteImageUrl(value);
    if (url && !/\/(icon|apple-icon|twitter-image|opengraph-image)(?:[/?#]|$)/i.test(url)) {
      urls.add(url);
    }
  };
  if (Array.isArray(jsonLd.image)) {
    for (const image of jsonLd.image) add(image);
  } else {
    add(jsonLd.image);
  }
  add(meta.ogImage);
  for (const match of html.matchAll(/url=(https%3A%2F%2F[^"&]+)/gi)) {
    add(decodeURIComponent(match[1]));
  }
  for (const match of html.matchAll(/https:\/\/photos\.hyperbaric\.app\/[^"'<\\\s]+/gi)) {
    add(decodeHtmlEntities(match[0]));
  }
  return [...urls];
}

function absoluteImageUrl(value) {
  if (!value || typeof value !== "string") return null;
  const decoded = decodeHtmlEntities(value);
  try {
    return new URL(decoded, BASE_URL).toString();
  } catch {
    return null;
  }
}

function extractChamberType(...texts) {
  const text = cleanText(texts.filter(Boolean).join(" ")) || "";
  const lower = text.toLowerCase();
  if (/hard[\s-]*shell/.test(lower)) return "hard shell";
  if (/soft[\s-]*shell/.test(lower)) return "soft shell";
  if (/\bmultiplace\b/.test(lower)) return "multiplace";
  if (/\bmonoplace\b/.test(lower)) return "monoplace";
  return null;
}

function extractTreatmentTags(html, description) {
  const labels = [
    "Medical",
    "Wellness",
    "Sports Recovery",
    "Wound Care",
    "Long Covid",
    "Brain Health",
    "Chronic Fatigue",
    "Anti-aging",
    "Autism",
    "Immune Support",
    "Post-COVID Recovery",
    "Diabetic Ulcers",
  ];
  const text = decodeHtmlEntities(`${html} ${description || ""}`);
  const found = labels.filter((label) => new RegExp(escapeRegExp(label), "i").test(text));
  if (/hyperbaric oxygen therapy|HBOT/i.test(text)) {
    found.unshift("Medical hyperbaric oxygen therapy");
  }
  return unique(found.map((tag) => tag.toLowerCase()));
}

function extractComplementaryTherapies(html, description) {
  const labels = [
    "Red Light Therapy",
    "PEMF",
    "PEMF Therapy",
    "Lymphatic Drainage / Compression",
    "Compression",
    "Normatec Compression Boots",
    "Infrared Sauna",
    "Cryotherapy",
    "IV Therapy",
    "Photobiomodulation",
  ];
  const text = decodeHtmlEntities(`${html} ${description || ""}`);
  return unique(labels.filter((label) => new RegExp(escapeRegExp(label), "i").test(text)));
}

function extractRatingFromMeta(text) {
  const match = text?.match(/★\s*(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

function extractReviewCountFromMeta(text) {
  const match = text?.match(/from\s+(\d+)\s+reviews/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractReviews(html) {
  const reviews = extractHtmlReviews(html);
  const authorProviderPattern =
    /"children":"((?:\\.|[^"\\])*)"\}\],\["\$","span",null,\{"className":"font-mono[^"]*","children":"Google"\}/g;
  let match;
  while ((match = authorProviderPattern.exec(html))) {
    const author = cleanText(decodeJsString(match[1]));
    const start = match.index;
    const next = html.slice(authorProviderPattern.lastIndex).search(/"children":"(?:\\.|[^"\\])*"\}\],\["\$","span",null,\{"className":"font-mono[^"]*","children":"Google"\}/);
    const end = next >= 0 ? authorProviderPattern.lastIndex + next : Math.min(html.length, start + 9000);
    const block = html.slice(start, end);
    const date = cleanText(decodeJsString(block.match(/"children":"([A-Z][a-z]{2,8} \d{1,2}, \d{4})"/)?.[1] || ""));
    const bodyMatch = block.match(/"className":"font-body text-\[13\.5px\][^"]*","children":"((?:\\.|[^"\\])*)"\}/);
    const body = cleanText(decodeJsString(bodyMatch?.[1] || ""));
    const rating = Math.min(5, (block.match(/lucide-star w-3 h-3/g) || []).length) || null;
    if (author && (date || body)) {
      reviews.push({
        reviewer: author,
        rating,
        review_date: normalizeReviewDate(date),
        body,
        provider: "google",
        raw_json: {
          reviewer: author,
          rating,
          review_date_text: date,
          review_date: normalizeReviewDate(date),
          body,
          provider: "google",
        },
      });
    }
  }
  return uniqueBy(reviews, (review) => `${review.reviewer}|${review.review_date}|${review.body?.slice(0, 80)}`);
}

function extractHtmlReviews(html) {
  const reviews = [];
  const chunks = html.split('<div class="py-[18px] border-b border-gray-100 last:border-b-0">').slice(1);
  for (const chunk of chunks) {
    const block = chunk.slice(0, chunk.indexOf('<div class="py-[18px] border-b border-gray-100 last:border-b-0">') || 9000);
    if (!/>Google<\/span>/.test(block)) continue;
    const author = cleanText(block.match(/<span class="truncate">([\s\S]*?)<\/span>\s*<span class="font-mono[^"]*">Google<\/span>/)?.[1]);
    const date = cleanText(block.match(/<span>([A-Z][a-z]{2,8} \d{1,2}, \d{4})<\/span>/)?.[1]);
    const body = cleanText(block.match(/<p dir="[^"]*" class="font-body text-\[13\.5px\][^"]*">([\s\S]*?)<\/p>/)?.[1]);
    const rating = Math.min(5, (block.match(/lucide-star w-3 h-3/g) || []).length) || null;
    if (author && (date || body)) {
      reviews.push({
        reviewer: author,
        rating,
        review_date: normalizeReviewDate(date),
        body,
        provider: "google",
        raw_json: {
          reviewer: author,
          rating,
          review_date_text: date,
          review_date: normalizeReviewDate(date),
          body,
          provider: "google",
        },
      });
    }
  }
  return reviews;
}

function normalizeReviewDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value} UTC`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function normalizeOpeningHours(spec) {
  const days = {
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
  for (const row of Array.isArray(spec) ? spec : []) {
    const day = String(row.dayOfWeek || "").toLowerCase();
    if (Object.hasOwn(days, day)) {
      days[day] = { opens: row.opens || null, closes: row.closes || null };
    }
  }
  return days;
}

async function landRaw(listings, metadata) {
  await client.query("BEGIN");
  try {
    await client.query(`DELETE FROM ${quoteIdent(rawSchema)}.source_listings WHERE source_slug = $1`, [SOURCE_SLUG]);
    await client.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.source_listings
        (source_slug, source_listing_id, source_url, name, extracted_at, payload)
      SELECT source_slug, source_listing_id, source_url, name, extracted_at, payload::jsonb
      FROM jsonb_to_recordset($1::jsonb) AS x(
        source_slug text,
        source_listing_id bigint,
        source_url text,
        name text,
        extracted_at text,
        payload text
      )
      ON CONFLICT (source_slug, source_listing_id) DO UPDATE
      SET source_url = EXCLUDED.source_url,
          name = EXCLUDED.name,
          extracted_at = EXCLUDED.extracted_at,
          payload = EXCLUDED.payload,
          synced_at = now()
      `,
      [
        JSON.stringify(
          listings.map((listing) => ({
            source_slug: SOURCE_SLUG,
            source_listing_id: listing.source_listing_id,
            source_url: listing.source_url,
            name: listing.name,
            extracted_at: new Date().toISOString(),
            payload: JSON.stringify(listing.payload),
          })),
        ),
      ],
    );

    const fields = listings.flatMap(flattenFields);
    if (fields.length) {
      await client.query(
        `
        INSERT INTO ${quoteIdent(rawSchema)}.source_listing_fields
          (source_slug, source_listing_id, field_name, field_value)
        SELECT source_slug, source_listing_id, field_name, field_value
        FROM jsonb_to_recordset($1::jsonb) AS x(
          source_slug text,
          source_listing_id bigint,
          field_name text,
          field_value text
        )
        ON CONFLICT (source_slug, source_listing_id, field_name) DO UPDATE
        SET field_value = EXCLUDED.field_value, synced_at = now()
        `,
        [JSON.stringify(fields)],
      );
    }

    const images = listings.flatMap((listing) =>
      listing.images.map((imageUrl) => ({
        source_slug: SOURCE_SLUG,
        source_listing_id: listing.source_listing_id,
        image_url: imageUrl,
        alt: listing.name,
        source_page_url: listing.source_url,
      })),
    );
    if (images.length) {
      await client.query(
        `
        INSERT INTO ${quoteIdent(rawSchema)}.source_images
          (source_slug, source_listing_id, image_url, alt, source_page_url)
        SELECT source_slug, source_listing_id, image_url, alt, source_page_url
        FROM jsonb_to_recordset($1::jsonb) AS x(
          source_slug text,
          source_listing_id bigint,
          image_url text,
          alt text,
          source_page_url text
        )
        ON CONFLICT (source_slug, source_listing_id, image_url) DO UPDATE
        SET alt = EXCLUDED.alt,
            source_page_url = EXCLUDED.source_page_url,
            synced_at = now()
        `,
        [JSON.stringify(images)],
      );
    }

    const reviews = listings.flatMap((listing) =>
      listing.reviews.map((review, index) => ({
        source_slug: SOURCE_SLUG,
        source_listing_id: listing.source_listing_id,
        review_ordinal: index + 1,
        reviewer: review.reviewer,
        rating: review.rating == null ? null : String(review.rating),
        review_date: review.review_date,
        body: review.body,
        raw_json: JSON.stringify(review.raw_json || review),
      })),
    );
    if (reviews.length) {
      await client.query(
        `
        INSERT INTO ${quoteIdent(rawSchema)}.source_reviews
          (source_slug, source_listing_id, review_ordinal, reviewer, rating, review_date, body, raw_json)
        SELECT source_slug, source_listing_id, review_ordinal, reviewer, rating, review_date, body, raw_json
        FROM jsonb_to_recordset($1::jsonb) AS x(
          source_slug text,
          source_listing_id bigint,
          review_ordinal integer,
          reviewer text,
          rating text,
          review_date text,
          body text,
          raw_json text
        )
        ON CONFLICT (source_slug, source_listing_id, review_ordinal) DO UPDATE
        SET reviewer = EXCLUDED.reviewer,
            rating = EXCLUDED.rating,
            review_date = EXCLUDED.review_date,
            body = EXCLUDED.body,
            raw_json = EXCLUDED.raw_json,
            synced_at = now()
        `,
        [JSON.stringify(reviews)],
      );
    }

    const counts = {
      listing_count: listings.length,
      image_count: images.length,
      review_count: reviews.length,
      field_count: fields.length,
    };
    const discoveryMetadata = {
      sitemapClinicCount: metadata.discovery.sitemapClinicCount,
      cityClinicCount: metadata.discovery.cityClinicCount,
      cityPageCount: metadata.discovery.cityPageCount,
      dedupedClinicCount: metadata.discovery.clinicUrls.length,
    };
    await client.query(
      `
      UPDATE ${quoteIdent(rawSchema)}.source_databases
      SET listing_count = $2,
          image_count = $3,
          review_count = $4,
          field_count = $5,
          page_count = $6,
          metadata = $7::jsonb,
          last_synced_at = now(),
          sync_status = 'synced',
          updated_at = now()
      WHERE source_slug = $1
      `,
      [
        SOURCE_SLUG,
        counts.listing_count,
        counts.image_count,
        counts.review_count,
        counts.field_count,
        metadata.discovery.cityPageCount + metadata.selectedClinicCount + 2,
        JSON.stringify({
          name: "Hyperbaric.app",
          slug: SOURCE_SLUG,
          seeds: [`${BASE_URL}/sitemap.xml`, `${BASE_URL}/city`],
          scraped_at: new Date().toISOString(),
          discovery: discoveryMetadata,
          selected_clinic_count: metadata.selectedClinicCount,
          failures: metadata.failures.slice(0, 200),
          failure_count: metadata.failures.length,
          cache_dir: path.relative(ROOT, cacheDir),
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function flattenFields(listing) {
  const entries = {
    name: listing.name,
    phone: listing.phone,
    website: listing.website,
    website_domain: listing.website_domain,
    lat: listing.latitude,
    lng: listing.longitude,
    chamber_type: listing.chamber_type,
    rating: listing.rating,
    review_count: listing.review_count,
    verified: listing.verified,
    claimed: listing.claimed,
    address: listing.address,
    full_address: listing.full_address,
    locality: listing.locality,
    region: listing.region,
    postal_code: listing.postal_code,
    country_name: listing.country_name,
    country_code: listing.country_code,
  };
  return Object.entries(entries)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([field_name, value]) => ({
      source_slug: SOURCE_SLUG,
      source_listing_id: listing.source_listing_id,
      field_name,
      field_value: String(value),
    }));
}

async function classifyPromotion({ dryRun }) {
  const context = await loadPromotionContext();
  const rows = await buildPromotionAuditRows(context, { dryRun });
  await writeAuditRows(rows, { dryRun });
  const summary = summarizeAudit(rows);
  console.log(JSON.stringify({ phase: "promotion_dry_run", auditTable: `${rawSchema}.${auditTable}`, ...summary }, null, 2));
  return { rows, summary };
}

async function loadPromotionContext() {
  const source = await row(`SELECT id FROM ${quoteIdent(schema)}.sources WHERE slug = $1`, [SOURCE_SLUG]);
  if (!source) throw new Error(`Missing ${schema}.sources row for ${SOURCE_SLUG}.`);

  const treatment = await row(`SELECT id FROM ${quoteIdent(schema)}.treatments WHERE canonical_name = $1`, [HBOT_CANONICAL_NAME]);
  if (!treatment) {
    throw new Error(`STOP: missing treatment canonical_name '${HBOT_CANONICAL_NAME}'. Ask before inventing one.`);
  }

  const listings = await rows(
    `
    SELECT source_slug, source_listing_id, source_url, name, payload
    FROM ${quoteIdent(rawSchema)}.source_listings sl
    WHERE sl.source_slug = $1
      -- Future promotion scripts must also honor fountain_raw.suppressed_source_listings.
      -- It is the permanent do-not-promote ledger for source listings removed during cleanup.
      AND NOT EXISTS (
        SELECT 1
        FROM ${quoteIdent(rawSchema)}.suppressed_source_listings suppressed
        WHERE suppressed.source_slug = sl.source_slug
          AND suppressed.source_listing_id = sl.source_listing_id
      )
    ORDER BY source_listing_id
    `,
    [SOURCE_SLUG],
  );

  const orgs = await rows(
    `
    SELECT id, canonical_name, name_normalized, website_domain, dedup_key, status, deleted_at
    FROM ${quoteIdent(schema)}.organizations
    WHERE deleted_at IS NULL
    `,
  );

  const locations = await rows(
    `
    SELECT
      l.id,
      l.org_id,
      l.name,
      l.address,
      l.locality,
      l.region,
      l.postal_code,
      l.country_code,
      l.country_name,
      l.latitude,
      l.longitude,
      l.phone,
      l.website,
      l.status,
      l.deleted_at,
      org.website_domain AS org_website_domain
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN ${quoteIdent(schema)}.organizations org ON org.id = l.org_id
    WHERE l.deleted_at IS NULL
    `,
  );

  const offerings = await rows(
    `
    SELECT location_id, source_id, raw_name, treatment_id
    FROM ${quoteIdent(schema)}.offerings
    WHERE deleted_at IS NULL
    `,
  );

  const reviews = await rows(
    `
    SELECT location_id, author, review_date, left(coalesce(text, ''), 120) AS text_prefix
    FROM ${quoteIdent(schema)}.reviews
    WHERE deleted_at IS NULL
    `,
  );

  const exactTreatmentNames = await rows(
    `
    SELECT id, canonical_name
    FROM ${quoteIdent(schema)}.treatments
    `,
  );

  const imageCounts = await rows(
    `
    SELECT source_listing_id, count(*)::integer AS image_count
    FROM ${quoteIdent(rawSchema)}.source_images
    WHERE source_slug = $1
    GROUP BY source_listing_id
    `,
    [SOURCE_SLUG],
  );

  return {
    sourceId: source.id,
    hbotTreatmentId: treatment.id,
    listings: listings.map((listing) => ({ ...listing, payload: listing.payload || {} })),
    orgs,
    locations: locations.map((location) => ({
      ...location,
      name_normalized: normalizeNameForDb(location.name),
      website_domain: websiteDomain(location.website) || location.org_website_domain || null,
    })),
    offerings,
    reviews,
    treatmentByNormalizedName: new Map(
      exactTreatmentNames.map((treatmentRow) => [normalizeNameForDb(treatmentRow.canonical_name), treatmentRow]),
    ),
    imageCountByListing: new Map(imageCounts.map((row) => [String(row.source_listing_id), Number(row.image_count)])),
  };
}

async function buildPromotionAuditRows(context, { dryRun }) {
  const rowsOut = [];
  const existingOfferings = new Set(
    context.offerings.map((offering) => `${offering.location_id}|${offering.source_id}|${offering.raw_name}`),
  );
  const existingReviewsByLocation = new Map();
  for (const review of context.reviews) {
    const key = String(review.location_id);
    if (!existingReviewsByLocation.has(key)) existingReviewsByLocation.set(key, new Set());
    existingReviewsByLocation
      .get(key)
      .add(reviewDedupKey(review.author, review.review_date, review.text_prefix || ""));
  }

  for (const listing of context.listings) {
    const payload = listing.payload || {};
    const domain = payload.website_domain || websiteDomain(payload.website);
    const normalizedName = normalizeNameForDb(payload.name || listing.name);
    const orgMatch = resolveOrg(context.orgs, { domain, normalizedName });
    const locationMatch = resolveLocation(context.locations, { payload, domain, normalizedName });
    const locationId = locationMatch?.location?.id || null;
    const rawName = hbotRawName(payload.chamber_type);
    const offeringsAdded = locationId
      ? existingOfferings.has(`${locationId}|${context.sourceId}|${rawName}`)
        ? 0
        : 1
      : 1;
    const reviewDedupSet = locationId ? existingReviewsByLocation.get(String(locationId)) || new Set() : new Set();
    let reviewsAdded = 0;
    let reviewsDeduped = 0;
    for (const review of payload.reviews || []) {
      const key = reviewDedupKey(review.reviewer, review.review_date, review.body || "");
      if (reviewDedupSet.has(key)) reviewsDeduped += 1;
      else reviewsAdded += 1;
    }
    rowsOut.push({
      source_slug: SOURCE_SLUG,
      source_listing_id: listing.source_listing_id,
      source_url: listing.source_url,
      name: payload.name || listing.name,
      matched_existing_location: Boolean(locationMatch),
      match_method: locationMatch?.method || "create",
      created_org: !orgMatch,
      org_reused: Boolean(orgMatch),
      org_id: orgMatch?.id || null,
      location_id: locationId,
      offerings_added: offeringsAdded,
      reviews_added: reviewsAdded,
      reviews_deduped: reviewsDeduped,
      images_landed: context.imageCountByListing.get(String(listing.source_listing_id)) || 0,
      failure: null,
      dry_run: dryRun,
    });
  }
  return rowsOut;
}

async function writeAuditRows(auditRows, { dryRun }) {
  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)}`);
  await client.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} (
      id bigserial PRIMARY KEY,
      source_slug text NOT NULL,
      source_listing_id bigint NOT NULL,
      source_url text,
      name text,
      matched_existing_location boolean NOT NULL DEFAULT false,
      match_method text,
      created_org boolean NOT NULL DEFAULT false,
      org_reused boolean NOT NULL DEFAULT false,
      org_id integer,
      location_id integer,
      offerings_added integer NOT NULL DEFAULT 0,
      reviews_added integer NOT NULL DEFAULT 0,
      reviews_deduped integer NOT NULL DEFAULT 0,
      images_landed integer NOT NULL DEFAULT 0,
      failure text,
      dry_run boolean NOT NULL DEFAULT true,
      audited_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  if (!auditRows.length) return;
  await client.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} (
      source_slug, source_listing_id, source_url, name, matched_existing_location,
      match_method, created_org, org_reused, org_id, location_id, offerings_added,
      reviews_added, reviews_deduped, images_landed, failure, dry_run
    )
    SELECT
      source_slug, source_listing_id, source_url, name, matched_existing_location,
      match_method, created_org, org_reused, org_id, location_id, offerings_added,
      reviews_added, reviews_deduped, images_landed, failure, dry_run
    FROM jsonb_to_recordset($1::jsonb) AS x(
      source_slug text,
      source_listing_id bigint,
      source_url text,
      name text,
      matched_existing_location boolean,
      match_method text,
      created_org boolean,
      org_reused boolean,
      org_id integer,
      location_id integer,
      offerings_added integer,
      reviews_added integer,
      reviews_deduped integer,
      images_landed integer,
      failure text,
      dry_run boolean
    )
    `,
    [
      JSON.stringify(
        auditRows.map((row) => ({
          ...row,
          org_id: row.org_id ?? row.organization_id ?? null,
          org_reused: row.org_reused ?? (!row.created_org && Boolean(row.org_id ?? row.organization_id)),
          dry_run: dryRun,
        })),
      ),
    ],
  );
}

async function promoteServing() {
  const context = await loadPromotionContext();
  const auditRows = [];
  const treatmentByNormalizedName = context.treatmentByNormalizedName;
  let processed = 0;
  let failures = 0;

  for (const listing of context.listings) {
    const db = client;
    const payload = listing.payload || {};
    await db.query("BEGIN");
    try {
      const domain = payload.website_domain || websiteDomain(payload.website);
      const normalizedName = normalizeNameForDb(payload.name || listing.name);
      let org = await resolveOrgLive({ domain, normalizedName, name: payload.name || listing.name });
      const createdOrg = Boolean(org.created);
      const locationMatch = resolveLocation(context.locations, { payload, domain, normalizedName });
      let locationId = locationMatch?.location?.id || null;
      let matchedExistingLocation = Boolean(locationMatch);
      let matchMethod = locationMatch?.method || "create";

      if (locationId) {
        await db.query(
          `
          UPDATE ${quoteIdent(schema)}.locations
          SET phone = COALESCE(phone, $2),
              website = COALESCE(website, $3),
              latitude = COALESCE(latitude, $4),
              longitude = COALESCE(longitude, $5),
              postal_code = COALESCE(postal_code, $6),
              org_id = COALESCE(org_id, $7),
              updated_at = now()
          WHERE id = $1
          `,
          [
            locationId,
            payload.phone || null,
            payload.website || null,
            payload.latitude ?? null,
            payload.longitude ?? null,
            payload.address?.postal_code || null,
            org.id,
          ],
        );
      } else {
        const inserted = await row(
          `
          INSERT INTO ${quoteIdent(schema)}.locations (
            org_id, name, address, locality, region, postal_code, country_code, country_name,
            latitude, longitude, phone, website, dedup_key, data_origin, status, is_virtual, verification_status
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'scraped','active',false,'unverified')
          RETURNING id
          `,
          [
            org.id,
            payload.name || listing.name,
            payload.address?.street || payload.raw_address || null,
            payload.address?.locality || null,
            payload.address?.region || null,
            payload.address?.postal_code || null,
            payload.address?.country_code || null,
            payload.address?.country_name || null,
            payload.latitude ?? null,
            payload.longitude ?? null,
            payload.phone || null,
            payload.website || null,
            locationDedupKey(payload, domain, normalizedName),
          ],
        );
        locationId = inserted.id;
        context.locations.push({
          id: locationId,
          org_id: org.id,
          name: payload.name || listing.name,
          address: payload.address?.street || payload.raw_address || null,
          locality: payload.address?.locality || null,
          region: payload.address?.region || null,
          postal_code: payload.address?.postal_code || null,
          country_code: payload.address?.country_code || null,
          country_name: payload.address?.country_name || null,
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null,
          phone: payload.phone || null,
          website: payload.website || null,
          name_normalized: normalizedName,
          website_domain: isMatchableDomain(domain) ? domain : null,
        });
      }

      await linkSourceRecord({ entityType: "organization", entityId: org.id, listing });
      await linkSourceRecord({ entityType: "location", entityId: locationId, listing });
      const offeringsAdded = await insertOfferings({ locationId, payload, context, treatmentByNormalizedName });
      const { reviewsAdded, reviewsDeduped } = await insertReviews({ locationId, listing, payload, sourceId: context.sourceId });
      const imagesLanded = await imageCountForListing(listing.source_listing_id);

      auditRows.push({
        source_slug: SOURCE_SLUG,
        source_listing_id: listing.source_listing_id,
        source_url: listing.source_url,
        name: payload.name || listing.name,
        matched_existing_location: matchedExistingLocation,
        match_method: matchMethod,
        created_org: createdOrg,
        org_reused: !createdOrg,
        org_id: org.id,
        location_id: locationId,
        offerings_added: offeringsAdded,
        reviews_added: reviewsAdded,
        reviews_deduped: reviewsDeduped,
        images_landed: imagesLanded,
        failure: null,
        dry_run: false,
      });
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      failures += 1;
      console.error(
        JSON.stringify({
          phase: "promotion_listing_failed",
          source_listing_id: listing.source_listing_id,
          source_url: listing.source_url,
          name: payload.name || listing.name,
          error: error.message,
        }),
      );
      auditRows.push({
        source_slug: SOURCE_SLUG,
        source_listing_id: listing.source_listing_id,
        source_url: listing.source_url,
        name: payload.name || listing.name,
        matched_existing_location: false,
        match_method: "error",
        created_org: false,
        org_reused: false,
        org_id: null,
        location_id: null,
        offerings_added: 0,
        reviews_added: 0,
        reviews_deduped: 0,
        images_landed: 0,
        failure: error.message,
        dry_run: false,
      });
    }
    processed += 1;
    if (processed % 50 === 0 || processed === context.listings.length) {
      console.log(`promoted ${processed}/${context.listings.length}; failures=${failures}`);
    }
  }

  await writeAuditRows(auditRows, { dryRun: false });
  console.log(JSON.stringify({ phase: "promotion", auditTable: `${rawSchema}.${auditTable}`, ...summarizeAudit(auditRows), failures }, null, 2));
}

async function resolveOrgLive({ domain, normalizedName, name }) {
  const matchableDomain = isMatchableDomain(domain) ? domain : null;
  if (matchableDomain) {
    const existing = await row(
      `
      SELECT id, canonical_name, website_domain, dedup_key
      FROM ${quoteIdent(schema)}.organizations
      WHERE deleted_at IS NULL AND website_domain = $1
      LIMIT 1
      `,
      [matchableDomain],
    );
    if (existing) return { ...existing, created: false };
  }
  if (normalizedName) {
    const existing = await row(
      `
      SELECT id, canonical_name, website_domain, dedup_key
      FROM ${quoteIdent(schema)}.organizations
      WHERE deleted_at IS NULL AND name_normalized = $1
      LIMIT 1
      `,
      [normalizedName],
    );
    if (existing) return { ...existing, created: false };
  }
  const dedupKey = matchableDomain || `name:${normalizedName}`;
  const inserted = await row(
    `
    INSERT INTO ${quoteIdent(schema)}.organizations (
      canonical_name, name_normalized, website_domain, dedup_key, data_origin, verification_status
    )
    VALUES ($1, $2, $3, $4, 'scraped', 'unverified')
    ON CONFLICT (dedup_key) DO UPDATE
    SET canonical_name = ${quoteIdent(schema)}.organizations.canonical_name
    RETURNING id, canonical_name, website_domain, dedup_key
    `,
    [name, normalizedName, matchableDomain, dedupKey],
  );
  return { ...inserted, created: true };
}

async function resolveLocationLive({ payload, domain, normalizedName }) {
  const context = await loadPromotionContext();
  return resolveLocation(context.locations, { payload, domain, normalizedName });
}

async function linkSourceRecord({ entityType, entityId, listing }) {
  await client.query(
    `
    INSERT INTO ${quoteIdent(schema)}.source_records (source_id, entity_type, entity_id, source_listing_id, source_url, raw_ref)
    SELECT s.id, $2, $3, $4, $5, $6
    FROM ${quoteIdent(schema)}.sources s
    WHERE s.slug = $1
      AND NOT EXISTS (
        SELECT 1
        FROM ${quoteIdent(schema)}.source_records sr
        WHERE sr.source_id = s.id
          AND sr.entity_type = $2
          AND sr.entity_id = $3
          AND sr.source_listing_id = $4
      )
    `,
    [SOURCE_SLUG, entityType, entityId, Number(listing.source_listing_id), listing.source_url, listing.payload?.slug || null],
  );
}

async function insertOfferings({ locationId, payload, context, treatmentByNormalizedName }) {
  const sourceId = context.sourceId;
  const candidates = [{ treatment_id: context.hbotTreatmentId, raw_name: hbotRawName(payload.chamber_type), term: HBOT_CANONICAL_NAME }];
  for (const tag of payload.treatment_tags || []) {
    if (/medical hyperbaric oxygen therapy/i.test(tag)) continue;
    const exact = treatmentByNormalizedName.get(normalizeNameForDb(tag));
    if (exact) {
      candidates.push({ treatment_id: exact.id, raw_name: exact.canonical_name, term: tag });
    } else {
      await logUnmappedTerm(tag);
    }
  }

  let added = 0;
  for (const candidate of uniqueBy(candidates, (row) => `${row.treatment_id}|${row.raw_name}`)) {
    const result = await client.query(
      `
      INSERT INTO ${quoteIdent(schema)}.offerings (
        location_id, treatment_id, raw_name, source_id, status, data_origin, verification_status
      )
      VALUES ($1, $2, $3, $4, 'active', 'scraped', 'unverified')
      ON CONFLICT (location_id, source_id, raw_name) DO NOTHING
      `,
      [locationId, candidate.treatment_id, candidate.raw_name, sourceId],
    );
    added += result.rowCount;
  }
  return added;
}

async function insertReviews({ locationId, listing, payload, sourceId }) {
  let reviewsAdded = 0;
  let reviewsDeduped = 0;
  const existingRows = await rows(
    `
    SELECT author, review_date, text
    FROM ${quoteIdent(schema)}.reviews
    WHERE location_id = $1
      AND deleted_at IS NULL
    `,
    [locationId],
  );
  const existingKeys = new Set(existingRows.map((review) => reviewDedupKey(review.author, review.review_date, review.text || "")));
  for (const review of payload.reviews || []) {
    const key = reviewDedupKey(review.reviewer, review.review_date, review.body || "");
    if (existingKeys.has(key)) {
      reviewsDeduped += 1;
      continue;
    }
    await client.query(
      `
      INSERT INTO ${quoteIdent(schema)}.reviews (
        location_id, author, rating, review_date, text, source_id, provider, data_origin,
        verification_status, raw_payload, fetched_at, status
      )
      VALUES ($1,$2,$3,$4,$5,$6,'google','scraped','unverified',$7::jsonb,now(),'active')
      `,
      [
        locationId,
        review.reviewer || null,
        review.rating ?? null,
        review.review_date || null,
        review.body || null,
        sourceId,
        JSON.stringify({ ...(review.raw_json || review), source_listing_id: listing.source_listing_id, source_url: listing.source_url }),
      ],
    );
    existingKeys.add(key);
    reviewsAdded += 1;
  }
  return { reviewsAdded, reviewsDeduped };
}

async function logUnmappedTerm(term) {
  if (!term) return;
  await client.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.unmapped_terms (term, source_slug, occurrences)
    VALUES ($1, $2, 1)
    ON CONFLICT (term, source_slug) DO UPDATE
    SET occurrences = ${quoteIdent(rawSchema)}.unmapped_terms.occurrences + 1
    `,
    [term, SOURCE_SLUG],
  );
}

async function imageCountForListing(sourceListingId) {
  const result = await row(
    `
    SELECT count(*)::integer AS count
    FROM ${quoteIdent(rawSchema)}.source_images
    WHERE source_slug = $1 AND source_listing_id = $2
    `,
    [SOURCE_SLUG, sourceListingId],
  );
  return Number(result?.count || 0);
}

function resolveOrg(orgs, { domain, normalizedName }) {
  if (isMatchableDomain(domain)) {
    const byDomain = orgs.find((org) => org.website_domain === domain);
    if (byDomain) return byDomain;
  }
  if (normalizedName) {
    const byName = orgs.find((org) => org.name_normalized === normalizedName);
    if (byName) return byName;
  }
  return null;
}

function resolveLocation(locations, { payload, domain, normalizedName }) {
  const locality = normalizeLocality(payload.address?.locality);
  const countryCode = normalizeCode(payload.address?.country_code);
  const matchableDomain = isMatchableDomain(domain) ? domain : null;
  if (matchableDomain && locality) {
    const match = locations.find((location) => location.website_domain === matchableDomain && normalizeLocality(location.locality) === locality);
    if (match) return { method: "website_domain_locality", location: match };
  }
  if (normalizedName && locality && countryCode) {
    const match = locations.find(
      (location) =>
        location.name_normalized === normalizedName &&
        normalizeLocality(location.locality) === locality &&
        normalizeCode(location.country_code) === countryCode,
    );
    if (match) return { method: "name_locality_country", location: match };
  }
  const lat = numberOrNull(payload.latitude);
  const lng = numberOrNull(payload.longitude);
  if (lat != null && lng != null) {
    let best = null;
    for (const location of locations) {
      const distanceMeters = haversineMeters(lat, lng, numberOrNull(location.latitude), numberOrNull(location.longitude));
      const existingDomain = isMatchableDomain(location.website_domain) ? location.website_domain : null;
      const domainsAgree = Boolean(matchableDomain && existingDomain && matchableDomain === existingDomain);
      const namesShareToken = shareNameToken(payload.name, location.name);
      if (distanceMeters != null && distanceMeters <= 100 && (namesShareToken || domainsAgree) && (!best || distanceMeters < best.distanceMeters)) {
        best = { location, distanceMeters };
      }
    }
    if (best) return { method: "lat_lng_100m", location: best.location, distance_meters: best.distanceMeters };
  }
  return null;
}

function summarizeAudit(rowsIn) {
  const matchedByMethod = {};
  for (const row of rowsIn) {
    if (row.matched_existing_location) {
      matchedByMethod[row.match_method] = (matchedByMethod[row.match_method] || 0) + 1;
    }
  }
  return {
    total_scraped: rowsIn.length,
    new_locations_created: rowsIn.filter((row) => !row.matched_existing_location && !row.failure).length,
    existing_locations_matched: rowsIn.filter((row) => row.matched_existing_location).length,
    matched_by_method: matchedByMethod,
    orgs_created: rowsIn.filter((row) => row.created_org).length,
    orgs_reused: rowsIn.filter((row) => row.org_reused).length,
    offerings_added: sum(rowsIn, "offerings_added"),
    reviews_added: sum(rowsIn, "reviews_added"),
    reviews_deduped: sum(rowsIn, "reviews_deduped"),
    images_landed: sum(rowsIn, "images_landed"),
    failures: rowsIn.filter((row) => row.failure).length,
  };
}

async function ensureSourceRows() {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}`);
  await client.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.source_databases (
      source_slug, source_db_path, file_size_bytes, file_mtime_ms, metadata, sync_status
    )
    VALUES ($1, $2, 0, 0, $3::jsonb, 'pending')
    ON CONFLICT (source_slug) DO UPDATE
    SET source_db_path = EXCLUDED.source_db_path,
        metadata = ${quoteIdent(rawSchema)}.source_databases.metadata || EXCLUDED.metadata,
        updated_at = now()
    `,
    [
      SOURCE_SLUG,
      BASE_URL,
      JSON.stringify({
        name: "Hyperbaric.app",
        slug: SOURCE_SLUG,
        target: BASE_URL,
      }),
    ],
  );
  await client.query(
    `
    INSERT INTO ${quoteIdent(schema)}.sources (slug, trust_weight)
    VALUES ($1, 1)
    ON CONFLICT (slug) DO UPDATE
    SET trust_weight = EXCLUDED.trust_weight
    `,
    [SOURCE_SLUG],
  );
}

async function startImportRun() {
  const result = await row(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.import_runs (source_slug, status)
    VALUES ($1, 'running')
    RETURNING id
    `,
    [SOURCE_SLUG],
  );
  return result.id;
}

async function rawCounts() {
  const result = await row(
    `
    SELECT
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.source_listings WHERE source_slug = $1) AS listing_count,
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.source_images WHERE source_slug = $1) AS image_count,
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.source_reviews WHERE source_slug = $1) AS review_count,
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.source_listing_fields WHERE source_slug = $1) AS field_count
    `,
    [SOURCE_SLUG],
  );
  return {
    listing_count: Number(result.listing_count),
    image_count: Number(result.image_count),
    review_count: Number(result.review_count),
    field_count: Number(result.field_count),
  };
}

async function fetchCached(url, { cacheKey, extension = "html" } = {}) {
  const key = cacheKey || sha256(url);
  const cachePath = path.join(cacheDir, "html", `${safeCacheName(key)}.${extension}`);
  if (existsSync(cachePath) && !options.refresh) {
    return readFileSync(cachePath, "utf8");
  }
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await sleep(delayMs * (attempt === 1 ? 1 : attempt));
      const response = await fetch(url, {
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      writeFileSync(cachePath, text);
      return text;
    } catch (error) {
      lastError = error;
      await sleep(delayMs * attempt * 2);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message}`);
}

async function rows(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function row(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

function parseArgs(argv) {
  const parsed = { envFile: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const key = arg.slice(2, eq === -1 ? undefined : eq);
    const value = eq === -1 ? argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true : arg.slice(eq + 1);
    if (key === "envFile") parsed.envFile.push(value);
    else parsed[key] = value;
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function normalizePostgresConnectionString(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function quoteIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${value}"`;
}

function cleanText(value) {
  if (value == null) return null;
  const text = decodeHtmlEntities(String(value))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function decodeHtmlEntities(value) {
  if (!value) return value;
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function decodeJsString(value) {
  if (!value) return "";
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    try {
      return JSON.parse(`"${value}"`);
    } catch {
      return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\u0026/g, "&");
    }
  }
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function countryNameFromCode(code) {
  if (!code || String(code).length !== 2) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(String(code).toUpperCase()) || null;
  } catch {
    return null;
  }
}

function buildFullAddress({ street, locality, region, postalCode, countryName }) {
  return unique([street, locality, region, postalCode, countryName].map(cleanText).filter(Boolean)).join(", ") || null;
}

function websiteDomain(value) {
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\d?\./, "");
  } catch {
    return null;
  }
}

function normalizeNameForDb(value) {
  return cleanText(value)
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|inc|ltd|pllc|clinic|clinics|medical center|centre|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocality(value) {
  return normalizeNameForDb(value);
}

function normalizeCode(value) {
  return value ? String(value).trim().toUpperCase() : null;
}

function locationDedupKey(payload, domain, normalizedName) {
  const locality = normalizeLocality(payload.address?.locality);
  const country = normalizeCode(payload.address?.country_code);
  if (isMatchableDomain(domain) && locality) return `${domain}|${locality}`;
  return `${normalizedName || "unknown"}|${locality || "unknown"}|${country || "unknown"}`;
}

function isMatchableDomain(value) {
  if (!value) return false;
  const normalized = String(value).toLowerCase().replace(/^www\d?\./, "");
  return !NON_MATCHABLE_DOMAINS.has(normalized);
}

function shareNameToken(left, right) {
  const rightTokens = new Set(nameTokens(right));
  return nameTokens(left).some((token) => rightTokens.has(token));
}

function nameTokens(value) {
  return (
    normalizeNameForDb(value)
      ?.split(/\s+/)
      .filter((token) => token.length >= 3) || []
  );
}

function hbotRawName(chamberType) {
  return chamberType ? `${HBOT_CANONICAL_NAME} - ${chamberType}` : HBOT_CANONICAL_NAME;
}

function reviewDedupKey(author, date, text) {
  return `${normalizeReviewAuthor(author)}|${normalizeReviewDateValue(date)}|${(text || "").slice(0, 120)}`;
}

function normalizeReviewAuthor(value) {
  if (value == null) return "";
  let author = String(value).trim();
  if (/^\s*\{/.test(author)) {
    try {
      const parsed = JSON.parse(author);
      author = parsed?.name || parsed?.author?.name || parsed?.author || author;
    } catch {
      // Keep original value when it is not valid JSON.
    }
  }
  return (
    cleanText(author)
      ?.toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim() || ""
  );
}

function normalizeReviewDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(`${text} UTC`);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((value) => value == null || !Number.isFinite(value))) return null;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stableIntHash(value) {
  const buffer = createHash("sha256").update(value).digest();
  return buffer.readUInt32BE(0) & 0x7fffffff;
}

function clinicSlugFromUrl(url) {
  return cleanSlug(new URL(url).pathname.split("/").pop());
}

function cleanSlug(value) {
  return String(value || "").replace(/[\\/"'<>\s]+$/g, "");
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/$/, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeCacheName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 180);
}

function utcDateString() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ""))];
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function sum(rowsIn, key) {
  return rowsIn.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
