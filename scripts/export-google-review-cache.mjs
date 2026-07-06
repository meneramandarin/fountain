#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const sourcePath = process.argv[2] || process.env.CANONICAL_DB_PATH || "canonical.db";
const targetPath = process.argv[3] || "data/databases/google_reviews.sqlite";

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = DELETE;

    DROP TABLE IF EXISTS external_reviews;
    DROP TABLE IF EXISTS external_place_matches;
    DROP TABLE IF EXISTS external_review_location_keys;

    CREATE TABLE external_review_location_keys (
      location_id   INTEGER NOT NULL,
      name          TEXT,
      org_name      TEXT,
      address       TEXT,
      locality      TEXT,
      region        TEXT,
      country_code  TEXT,
      website       TEXT,
      PRIMARY KEY(location_id)
    );

    CREATE TABLE external_place_matches (
      location_id        INTEGER NOT NULL,
      provider           TEXT NOT NULL,
      provider_place_id  TEXT NOT NULL,
      provider_url       TEXT,
      display_name       TEXT,
      rating             REAL,
      review_count       INTEGER,
      match_confidence   REAL,
      match_status       TEXT,
      fetched_at         TEXT NOT NULL,
      expires_at         TEXT,
      raw_json           TEXT,
      PRIMARY KEY(location_id, provider)
    );

    CREATE TABLE external_reviews (
      id                 INTEGER PRIMARY KEY,
      location_id        INTEGER NOT NULL,
      provider           TEXT NOT NULL,
      provider_review_id TEXT NOT NULL,
      reviewer           TEXT,
      rating             REAL,
      review_date        TEXT,
      body               TEXT,
      source_url         TEXT,
      fetched_at         TEXT NOT NULL,
      expires_at         TEXT,
      raw_json           TEXT,
      UNIQUE(provider, provider_review_id)
    );

    CREATE INDEX idx_external_place_matches_location
      ON external_place_matches(location_id);
    CREATE INDEX idx_external_reviews_location_provider
      ON external_reviews(location_id, provider);
  `);
}

function main() {
  ensureDir(targetPath);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const target = new Database(targetPath);
  createSchema(target);

  const locationRows = source.prepare(`
    SELECT DISTINCT
      l.id AS location_id,
      l.name,
      org.canonical_name AS org_name,
      l.address,
      l.locality,
      l.region,
      l.country_code,
      l.website
    FROM external_place_matches epm
    JOIN locations l ON l.id = epm.location_id
    LEFT JOIN organizations org ON org.id = l.org_id
    ORDER BY l.id
  `).all();
  const placeRows = source.prepare("SELECT * FROM external_place_matches ORDER BY location_id, provider").all();
  const reviewRows = source.prepare("SELECT * FROM external_reviews ORDER BY location_id, provider, id").all();

  const insertLocation = target.prepare(`
    INSERT INTO external_review_location_keys (
      location_id, name, org_name, address, locality, region, country_code, website
    )
    VALUES (
      @location_id, @name, @org_name, @address, @locality, @region, @country_code, @website
    )
  `);
  const insertPlace = target.prepare(`
    INSERT INTO external_place_matches (
      location_id, provider, provider_place_id, provider_url, display_name, rating,
      review_count, match_confidence, match_status, fetched_at, expires_at, raw_json
    )
    VALUES (
      @location_id, @provider, @provider_place_id, @provider_url, @display_name, @rating,
      @review_count, @match_confidence, @match_status, @fetched_at, @expires_at, @raw_json
    )
  `);
  const insertReview = target.prepare(`
    INSERT INTO external_reviews (
      location_id, provider, provider_review_id, reviewer, rating, review_date,
      body, source_url, fetched_at, expires_at, raw_json
    )
    VALUES (
      @location_id, @provider, @provider_review_id, @reviewer, @rating, @review_date,
      @body, @source_url, @fetched_at, @expires_at, @raw_json
    )
  `);

  target.transaction(() => {
    for (const row of locationRows) {
      insertLocation.run(row);
    }
    for (const row of placeRows) {
      insertPlace.run(row);
    }
    for (const row of reviewRows) {
      insertReview.run(row);
    }
  })();

  target.exec("VACUUM");
  source.close();
  target.close();

  console.log(
    `Exported ${locationRows.length} location keys, ${placeRows.length} Google place matches, and ${reviewRows.length} review rows to ${targetPath}`,
  );
}

main();
