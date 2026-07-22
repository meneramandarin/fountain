import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { rows } from "@/lib/db";
import { ImpossibleHealthReview, type ReviewCandidate } from "./review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Impossible Health review deck",
  robots: { index: false, follow: false },
};

const QUALITY_TABLE = "fountain_raw.impossible_health_review_quality_20260713";
const DECISIONS_TABLE = "fountain_raw.impossible_health_review_decisions_20260713";
const NOTES_TABLE = "fountain_raw.impossible_health_review_notes_20260713";

/** Local-only review. Nothing here connects to the production database. */
export default async function ImpossibleHealthReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  await ensureReviewDecisions();
  const candidates = await loadCandidates();

  return (
    <ImpossibleHealthReview
      initialCandidates={candidates}
      autoApprovedCount={candidates.filter((candidate) => candidate.decisionSource === "auto_price_only").length}
    />
  );
}

async function ensureReviewDecisions() {
  await rows(`
    CREATE TABLE IF NOT EXISTS ${DECISIONS_TABLE} (
      candidate_id integer PRIMARY KEY REFERENCES fountain.locations(id),
      decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
      decision_source text NOT NULL CHECK (decision_source IN ('auto_price_only', 'manual')),
      reviewed_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await rows(`
    CREATE TABLE IF NOT EXISTS ${NOTES_TABLE} (
      candidate_id integer PRIMARY KEY REFERENCES fountain.locations(id),
      reviewer_comment text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await rows(`
    INSERT INTO ${DECISIONS_TABLE} (candidate_id, decision, decision_source)
    SELECT candidate_id, 'approved', 'auto_price_only'
    FROM ${QUALITY_TABLE}
    WHERE decision = 'held_back'
      AND reasons = ARRAY['missing_prices']::text[]
    ON CONFLICT (candidate_id) DO NOTHING
  `);

  await rows(`
    UPDATE fountain.locations AS location
    SET status = 'active', updated_at = now()
    FROM ${DECISIONS_TABLE} AS review
    WHERE review.candidate_id = location.id
      AND review.decision = 'approved'
      AND location.status <> 'active'
  `);
}

async function loadCandidates(): Promise<ReviewCandidate[]> {
  const result = await rows<DatabaseCandidate>(`
    SELECT
      quality.candidate_id,
      quality.name,
      quality.address,
      quality.phone,
      quality.email,
      quality.website,
      quality.dedup_disposition,
      quality.offering_count,
      quality.priced_offering_count,
      quality.image_count,
      quality.reasons,
      location.slug,
      location.locality,
      location.region,
      location.country_code,
      source.source_url,
      decision.decision AS review_decision,
      decision.decision_source,
      decision.reviewed_at,
      note.reviewer_comment,
      COALESCE(offerings.items, '[]'::json) AS offerings,
      COALESCE(images.items, '[]'::json) AS images
    FROM ${QUALITY_TABLE} AS quality
    JOIN fountain.locations AS location ON location.id = quality.candidate_id
    LEFT JOIN ${DECISIONS_TABLE} AS decision ON decision.candidate_id = quality.candidate_id
    LEFT JOIN ${NOTES_TABLE} AS note ON note.candidate_id = quality.candidate_id
    LEFT JOIN LATERAL (
      SELECT record.source_url
      FROM fountain.source_records AS record
      JOIN fountain.sources AS provider_source ON provider_source.id = record.source_id
      WHERE record.entity_type = 'location'
        AND record.entity_id = quality.candidate_id
        AND provider_source.slug = 'impossible-health'
      ORDER BY record.id
      LIMIT 1
    ) AS source ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'name', offering.raw_name,
        'priceAmount', offering.price_amount,
        'priceCurrency', offering.price_currency,
        'sourceUrl', offering.source_offer_url
      ) ORDER BY offering.id) AS items
      FROM fountain.offerings AS offering
      WHERE offering.location_id = quality.candidate_id
        AND offering.deleted_at IS NULL
        AND offering.status = 'active'
    ) AS offerings ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'url', COALESCE(image.blob_url, image.image_url),
        'sourceUrl', image.image_url,
        'alt', image.alt,
        'kind', image.image_kind
      ) ORDER BY image.id) AS items
      FROM fountain.images AS image
      WHERE image.entity_type = 'location'
        AND image.entity_id = quality.candidate_id
        AND image.deleted_at IS NULL
        AND image.status = 'active'
    ) AS images ON true
    WHERE quality.decision = 'held_back'
    ORDER BY quality.name, quality.candidate_id
  `);

  return result.map((candidate) => ({
    id: candidate.candidate_id,
    name: candidate.name,
    address: candidate.address || null,
    phone: candidate.phone || null,
    email: candidate.email || null,
    website: candidate.website || null,
    sourceUrl: candidate.source_url || null,
    slug: candidate.slug,
    locality: candidate.locality || null,
    region: candidate.region || null,
    countryCode: candidate.country_code || null,
    dedupDisposition: candidate.dedup_disposition,
    reasons: candidate.reasons,
    offerings: candidate.offerings,
    images: candidate.images,
    reviewDecision: candidate.review_decision,
    decisionSource: candidate.decision_source,
    reviewedAt: candidate.reviewed_at?.toISOString() || null,
    reviewerComment: candidate.reviewer_comment || "",
  }));
}

type DatabaseCandidate = {
  candidate_id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  dedup_disposition: string;
  offering_count: number;
  priced_offering_count: number;
  image_count: number;
  reasons: string[];
  slug: string;
  locality: string | null;
  region: string | null;
  country_code: string | null;
  source_url: string | null;
  review_decision: "approved" | "rejected" | null;
  decision_source: "auto_price_only" | "manual" | null;
  reviewed_at: Date | null;
  reviewer_comment: string | null;
  offerings: ReviewCandidate["offerings"];
  images: ReviewCandidate["images"];
};
