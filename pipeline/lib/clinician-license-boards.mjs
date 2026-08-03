const TEXAS_DATASET = "https://data.texas.gov/resource/tm3v-pfq9.json";
const WASHINGTON_DATASET = "https://data.wa.gov/resource/qxh8-f4bd.json";
const TEXAS_PHYSICIAN_TYPES = new Set(["Physician License"]);
const WASHINGTON_PHYSICIAN_TYPES = new Set([
  "Physician And Surgeon License",
  "Physician and Surgeon License Interstate Medical Licensure Compact",
  "Osteopathic Physician & Surgeon License",
  "Osteopathic Physician and Surgeon License Interstate Medical Licensure Compact",
]);

export const PUBLIC_BOARD_DATASETS = Object.freeze({
  TX: TEXAS_DATASET,
  WA: WASHINGTON_DATASET,
});

export const PUBLIC_BOARD_CANDIDATES_SQL = `
  SELECT
    attempt.location_id,
    attempt.jurisdiction_code,
    attempt.candidates,
    location.name AS location_name,
    location.locality,
    location.region,
    location.org_id
  FROM fountain_raw.location_clinician_verification_attempts attempt
  JOIN fountain.locations location ON location.id = attempt.location_id
  WHERE attempt.campaign = $1
    AND attempt.jurisdiction_code = ANY($2::text[])
    AND jsonb_array_length(attempt.candidates) > 0
    AND attempt.outcome IN ('candidates_found', 'board_record_not_found', 'needs_review')
    AND location.status = 'active'
    AND location.deleted_at IS NULL
  ORDER BY attempt.location_id
  LIMIT $3
`;

export async function verifyPublicBoardCandidates({
  query,
  campaign = "us_clinician_license_v1",
  limit = 10_000,
  apply = false,
  concurrency = 4,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof query !== "function") throw new TypeError("query must be a function.");
  const loaded = await query(PUBLIC_BOARD_CANDIDATES_SQL, [campaign, Object.keys(PUBLIC_BOARD_DATASETS), positiveInteger(limit)]);
  const rows = loaded?.rows || [];
  const results = new Array(rows.length);
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await verifyLocationCandidates(rows[index], { query, apply, fetchImpl });
    }
  }
  await Promise.all(Array.from({ length: Math.min(positiveInteger(concurrency), Math.max(rows.length, 1)) }, worker));
  return {
    selected: rows.length,
    verified: results.filter((item) => item.outcome === "verified").length,
    ambiguous: results.filter((item) => item.outcome === "needs_review").length,
    not_found: results.filter((item) => item.outcome === "board_record_not_found").length,
    results,
  };
}

async function verifyLocationCandidates(location, { query, apply, fetchImpl }) {
  const enriched = [];
  for (const candidate of Array.isArray(location.candidates) ? location.candidates : []) {
    const lookup = await lookupPublicBoardLicense({
      jurisdictionCode: location.jurisdiction_code,
      candidate,
      location,
      fetchImpl,
    });
    enriched.push({ ...candidate, board_lookup: lookup });
  }
  const verified = enriched.filter((candidate) => candidate.board_lookup.outcome === "verified");
  const outcome = verified.length
    ? "verified"
    : enriched.some((candidate) => candidate.board_lookup.outcome === "ambiguous_board_match")
      ? "needs_review"
      : "board_record_not_found";
  if (apply) {
    for (const candidate of verified) {
      await persistVerifiedBoardMatch(query, location, candidate, candidate.board_lookup.record);
    }
    await query(`
      UPDATE fountain_raw.location_clinician_verification_attempts
      SET outcome = $2,
          candidates = $3::jsonb,
          attempted_at = now()
      WHERE location_id = $1 AND prompt_version = 'clinician-license-v1'
    `, [location.location_id, outcome, JSON.stringify(enriched)]);
  }
  return { location_id: location.location_id, jurisdiction_code: location.jurisdiction_code, outcome, candidates: enriched };
}

export async function persistVerifiedBoardMatch(query, location, candidate, boardRecord) {
  const nameNormalized = normalizedName(candidate.full_name);
  const slug = `${slugify(candidate.full_name)}-${String(boardRecord.jurisdiction_code).toLowerCase()}-${slugify(boardRecord.license_number)}`.slice(0, 180);
  const dedupKey = `${nameNormalized}|${normalizedName(location.locality) || "unknown"}|license-${String(boardRecord.jurisdiction_code).toLowerCase()}-${normalizedName(boardRecord.license_number)}`;
  const evidence = {
    ...boardRecord.evidence,
    affiliation_claim: candidate.evidence_text,
    affiliation_role: candidate.role,
    affiliation_location_connection: candidate.location_connection,
  };
  await query(`
    WITH existing_practitioner AS (
      SELECT verification.practitioner_id AS id
      FROM fountain.location_clinician_license_verifications verification
      WHERE verification.jurisdiction_code = $8
        AND verification.license_number = $9
      ORDER BY verification.id
      LIMIT 1
    ), existing_affiliation_practitioner AS (
      SELECT practitioner.id
      FROM fountain.affiliations affiliation
      JOIN fountain.practitioners practitioner ON practitioner.id = affiliation.practitioner_id
      WHERE affiliation.location_id = $1
        AND practitioner.name_normalized = $3
        AND affiliation.deleted_at IS NULL
        AND practitioner.deleted_at IS NULL
      ORDER BY practitioner.id
      LIMIT 1
    ), inserted_practitioner AS (
      INSERT INTO fountain.practitioners (
        full_name, name_normalized, credentials, dedup_key, slug,
        status, data_origin, verification_status
      )
      SELECT $2, $3, $4, $5, $6, 'active', 'imported', 'verified'
      WHERE NOT EXISTS (SELECT 1 FROM existing_practitioner)
        AND NOT EXISTS (SELECT 1 FROM existing_affiliation_practitioner)
      RETURNING id
    ), selected_practitioner AS (
      SELECT id FROM existing_practitioner
      UNION ALL SELECT id FROM existing_affiliation_practitioner
      UNION ALL SELECT id FROM inserted_practitioner
      LIMIT 1
    ), inserted_affiliation AS (
      INSERT INTO fountain.affiliations (
        practitioner_id, location_id, org_id, role,
        status, data_origin, verification_status, deleted_at
      )
      SELECT id, $1, $7, $10, 'active', 'imported', 'verified', NULL
      FROM selected_practitioner
      WHERE NOT EXISTS (
        SELECT 1
        FROM fountain.affiliations affiliation
        WHERE affiliation.practitioner_id = selected_practitioner.id
          AND affiliation.location_id = $1
          AND affiliation.org_id IS NOT DISTINCT FROM $7::integer
      )
      ON CONFLICT (practitioner_id, location_id, org_id)
      DO UPDATE SET role = EXCLUDED.role,
                    status = 'active',
                    verification_status = 'verified',
                    deleted_at = NULL,
                    updated_at = now()
      RETURNING practitioner_id
    ), updated_affiliation AS (
      UPDATE fountain.affiliations affiliation
      SET role = $10,
          status = 'active',
          verification_status = 'verified',
          deleted_at = NULL,
          updated_at = now()
      FROM selected_practitioner
      WHERE affiliation.practitioner_id = selected_practitioner.id
        AND affiliation.location_id = $1
        AND affiliation.org_id IS NOT DISTINCT FROM $7::integer
      RETURNING affiliation.practitioner_id
    ), ensured_affiliation AS (
      SELECT practitioner_id FROM inserted_affiliation
      UNION
      SELECT practitioner_id FROM updated_affiliation
    )
    INSERT INTO fountain.location_clinician_license_verifications (
      location_id, practitioner_id, jurisdiction_code, license_number,
      license_type, licensing_authority, license_status, license_expires_at,
      board_source_url, affiliation_source_url, verified_at, next_review_at,
      verification_status, evidence
    )
    SELECT
      $1, practitioner_id, $8, $9, $11, $12, $13, $14::date,
      $15, $16, now(),
      CASE WHEN $14::date IS NULL THEN now() + interval '90 days'
           ELSE GREATEST(
             now() + interval '1 day',
             LEAST(now() + interval '90 days', ($14::date::timestamp AT TIME ZONE 'UTC') - interval '7 days')
           )
      END,
      'verified', $17::jsonb
    FROM ensured_affiliation
    ON CONFLICT (location_id, practitioner_id, jurisdiction_code, license_number)
    DO UPDATE SET license_type = EXCLUDED.license_type,
                  licensing_authority = EXCLUDED.licensing_authority,
                  license_status = EXCLUDED.license_status,
                  license_expires_at = EXCLUDED.license_expires_at,
                  board_source_url = EXCLUDED.board_source_url,
                  affiliation_source_url = EXCLUDED.affiliation_source_url,
                  verified_at = now(),
                  next_review_at = EXCLUDED.next_review_at,
                  verification_status = 'verified',
                  evidence = EXCLUDED.evidence,
                  updated_at = now()
  `, [
    location.location_id,
    candidate.full_name,
    nameNormalized,
    candidate.credentials,
    dedupKey,
    slug,
    location.org_id,
    boardRecord.jurisdiction_code,
    boardRecord.license_number,
    candidate.role,
    boardRecord.license_type,
    boardRecord.licensing_authority,
    boardRecord.license_status,
    boardRecord.license_expires_at,
    boardRecord.board_source_url,
    candidate.source_url,
    JSON.stringify(evidence),
  ]);
}

/** Match a discovered MD/DO to a current record in an official public dataset. */
export async function lookupPublicBoardLicense({
  jurisdictionCode,
  candidate,
  location,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
  const name = parsePersonName(candidate?.full_name);
  const degree = physicianDegree(candidate?.credentials);
  if (!name) return { outcome: "invalid_candidate_name", records: [] };
  if (jurisdictionCode === "TX") {
    return lookupTexas({ name, degree, location, fetchImpl, timeoutMs });
  }
  if (jurisdictionCode === "WA") {
    return lookupWashington({ name, degree, location, fetchImpl, timeoutMs });
  }
  return { outcome: "board_source_unsupported", records: [] };
}

async function lookupTexas({ name, degree, location, fetchImpl, timeoutMs }) {
  const where = [
    `lower(last_name)='${socrataLiteral(name.last)}'`,
    `starts_with(lower(first_name),'${socrataLiteral(name.first)}')`,
    "currently_licensed='Y'",
    "license_type='Physician License'",
  ].join(" and ");
  const records = await fetchSocrata(TEXAS_DATASET, where, fetchImpl, timeoutMs);
  const matches = records.filter((record) => (
    TEXAS_PHYSICIAN_TYPES.has(record.license_type)
    && normalizedToken(record.last_name) === name.last
    && normalizedToken(String(record.first_name || "").split(/\s+/u)[0]) === name.first
    && String(record.currently_licensed || "").toUpperCase() === "Y"
    && String(record.disciplinary_status || "").toUpperCase() === "NONE"
    && (!degree || normalizedToken(record.degree) === normalizedToken(degree))
  ));
  return selectBoardMatch(matches, location, {
    cityField: "practice_city",
    build: (record) => ({
      jurisdiction_code: "TX",
      license_number: record.license_number,
      license_type: record.license_type,
      licensing_authority: "Texas Medical Board",
      license_status: record.registration_status || "Active",
      license_expires_at: isoDate(record.license_expiration_date),
      board_source_url: recordSourceUrl(TEXAS_DATASET, "license_number", record.license_number),
      evidence: {
        board_record_name: [record.first_name, record.last_name].filter(Boolean).join(" "),
        practice_city: record.practice_city || null,
        practice_state: record.practice_state || null,
        disciplinary_status: record.disciplinary_status || null,
        dataset: TEXAS_DATASET,
      },
    }),
  });
}

async function lookupWashington({ name, degree, location, fetchImpl, timeoutMs }) {
  const typeList = [...WASHINGTON_PHYSICIAN_TYPES]
    .map((type) => `'${socrataLiteral(type)}'`)
    .join(",");
  const where = [
    `lower(lastname)='${socrataLiteral(name.last)}'`,
    `lower(firstname)='${socrataLiteral(name.first)}'`,
    "status='Active'",
    `credentialtype in(${typeList})`,
  ].join(" and ");
  const records = await fetchSocrata(WASHINGTON_DATASET, where, fetchImpl, timeoutMs);
  const matches = records.filter((record) => (
    WASHINGTON_PHYSICIAN_TYPES.has(record.credentialtype)
    && normalizedToken(record.lastname) === name.last
    && normalizedToken(record.firstname) === name.first
    && String(record.status || "").toLowerCase() === "active"
    && String(record.actiontaken || "").toLowerCase() === "no"
    && (!degree || washingtonTypeMatchesDegree(record.credentialtype, degree))
  ));
  return selectBoardMatch(matches, location, {
    cityField: "city",
    build: (record) => ({
      jurisdiction_code: "WA",
      license_number: record.credentialnumber,
      license_type: record.credentialtype,
      licensing_authority: "Washington State Department of Health",
      license_status: record.status,
      license_expires_at: usDateToIso(record.expirationdate),
      board_source_url: recordSourceUrl(WASHINGTON_DATASET, "credentialnumber", record.credentialnumber),
      evidence: {
        board_record_name: [record.firstname, record.middlename, record.lastname].filter(Boolean).join(" "),
        action_taken: record.actiontaken || null,
        dataset: WASHINGTON_DATASET,
      },
    }),
  });
}

function selectBoardMatch(records, location, { cityField, build }) {
  if (!records.length) return { outcome: "board_record_not_found", records: [] };
  let eligible = records.filter((record) => !isExpired(build(record).license_expires_at));
  if (!eligible.length) return { outcome: "board_record_not_found", records };
  if (eligible.length > 1) {
    const locality = normalizedToken(location?.locality);
    const local = locality
      ? eligible.filter((record) => normalizedToken(record[cityField]) === locality)
      : [];
    if (local.length === 1) eligible = local;
  }
  if (eligible.length !== 1) return { outcome: "ambiguous_board_match", records: eligible };
  return { outcome: "verified", record: build(eligible[0]), records: eligible };
}

async function fetchSocrata(base, where, fetchImpl, timeoutMs) {
  const url = new URL(base);
  url.search = new URLSearchParams({ "$where": where, "$limit": "100" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Board dataset lookup timed out.")), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { "Accept": "application/json", "User-Agent": "FountainPipeline/1.0 (+https://fountain.clinic)" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Board dataset returned HTTP ${response.status}.`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error("Board dataset response was not an array.");
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePersonName(value) {
  const tokens = String(value || "").normalize("NFKD")
    .replace(/\b(?:dr|doctor)\.?\b/giu, " ")
    .replace(/\b(?:m\.?d\.?|d\.?o\.?|f\.?a\.?c\.?s\.?|f\.?a\.?a\.?d\.?)\b/giu, " ")
    .replace(/[^a-zA-Z' -]+/gu, " ")
    .trim().split(/\s+/u)
    .filter((token) => token && !/^(?:jr|sr|ii|iii|iv)$/iu.test(token));
  if (tokens.length < 2) return null;
  return { first: normalizedToken(tokens[0]), last: normalizedToken(tokens.at(-1)) };
}

function recordSourceUrl(base, field, value) {
  const url = new URL(base);
  url.search = new URLSearchParams({ "$where": `${field}='${socrataLiteral(value)}'` });
  return url.href;
}

function socrataLiteral(value) {
  return String(value || "").replaceAll("'", "''");
}

function normalizedToken(value) {
  return String(value || "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/gu, "").toLowerCase();
}

function isoDate(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] || null;
}

function usDateToIso(value) {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : isoDate(value);
}

function isExpired(value) {
  return value ? value < new Date().toISOString().slice(0, 10) : false;
}

function physicianDegree(value) {
  const normalized = String(value || "").replace(/[^a-z]/giu, "").toUpperCase();
  if (normalized.startsWith("DO")) return "DO";
  if (normalized.startsWith("MD")) return "MD";
  return null;
}

function washingtonTypeMatchesDegree(type, degree) {
  const osteopathic = String(type || "").toLowerCase().includes("osteopathic");
  return degree === "DO" ? osteopathic : !osteopathic;
}

function normalizedName(value) {
  return String(value || "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/gu, " ").toLowerCase().replace(/\s+/gu, " ").trim();
}

function slugify(value) {
  return normalizedName(value).replace(/\s+/gu, "-") || "clinician";
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError("Expected a positive integer.");
  return number;
}
