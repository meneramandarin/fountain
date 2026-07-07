import { LandingFooter } from "@/components/landing-footer";
import type { RelatedTreatmentSearches } from "@/lib/queries";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  Star,
  Stethoscope,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { locationHref, practitionerHref } from "@/lib/directory-urls";

type Tag = { facet: string; value: string };
type ImageRef = { image_url?: string | null; blob_url?: string | null; local_path?: string | null; alt?: string | null };
type ReviewRef = { reviewer?: string | null; rating?: string | number | null; review_date?: string | null; body?: string | null };
type ExternalReviewGroup = {
  provider: string;
  provider_name: string;
  provider_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  reviews?: Array<ReviewRef & { source_url?: string | null }>;
};
type OfferingRef = {
  raw_name?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  treatment?: string | null;
  domain?: string | null;
};
type AffiliationRef = {
  id?: number;
  slug?: string | null;
  clinic?: string | null;
  locality?: string | null;
  region?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  role?: string | null;
};

export type LocationDetailRecord = {
  id: number;
  slug?: string | null;
  name?: string | null;
  org_name?: string | null;
  locality?: string | null;
  region?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  rating?: number | null;
  review_count?: number | null;
  offerings?: OfferingRef[];
  images?: ImageRef[];
  reviews?: ReviewRef[];
  external_reviews?: ExternalReviewGroup[];
  practitioners?: { id: number; slug?: string | null; full_name: string; primary_specialty?: string | null; role?: string | null }[];
  tags?: Tag[];
};

export type PractitionerDetailRecord = {
  id: number;
  slug?: string | null;
  full_name?: string | null;
  primary_specialty?: string | null;
  credentials?: string | null;
  languages?: string | null;
  years_experience?: number | null;
  affiliations?: AffiliationRef[];
  images?: ImageRef[];
  tags?: Tag[];
};

type DetailProps =
  | { kind: "locations"; data: LocationDetailRecord; relatedSearches?: RelatedTreatmentSearches | null; showBackLink?: boolean }
  | { kind: "practitioners"; data: PractitionerDetailRecord; relatedSearches?: RelatedTreatmentSearches | null; showBackLink?: boolean };

export function DirectoryDetailPage(props: DetailProps) {
  const title =
    props.kind === "locations"
      ? props.data.name || props.data.org_name || "Directory record"
      : props.data.full_name || "Directory record";
  const subtitle =
    props.kind === "locations"
      ? [props.data.locality, props.data.region, props.data.country_name].filter(Boolean).join(", ")
      : [props.data.primary_specialty, props.data.years_experience ? `${props.data.years_experience} years experience` : ""]
          .filter(Boolean)
          .join(" · ");
  const images = getImageSources(props.data.images || []);
  const tags = props.data.tags || [];

  return (
    <main className="listing-detail-shell">
      <section className="listing-detail-hero">
        <header className="directory-topbar listing-detail-topbar">
          <Link className="landing-brand directory-brand" href="/">
            fountain
          </Link>
          <button className="coming-soon-pill" type="button">
            Coming Soon <span aria-hidden="true">|</span> Log in
          </button>
        </header>

        <div className="listing-detail-hero-grid">
          <div className="listing-hero-copy">
            {props.showBackLink ? (
              <Link className="listing-back-link" href={`/directory?kind=${props.kind}`}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back to results
              </Link>
            ) : null}
            <span className="listing-eyebrow">
              {props.kind === "locations" ? "Clinic & med spa" : "Doctor & practitioner"}
            </span>
            <h1>{title}</h1>
            <p>
              {props.kind === "locations" ? <MapPin size={17} aria-hidden="true" /> : <Stethoscope size={17} aria-hidden="true" />}
              {subtitle || "Details unavailable"}
            </p>
            <ListingStats kind={props.kind} data={props.data} />
            <TagPills tags={tags} />
          </div>

          <ImageGallery images={images} title={title} kind={props.kind} />
        </div>
      </section>

      <div className="listing-detail-layout">
        <article className="listing-detail-main">
          {props.kind === "locations" ? <LocationMain data={props.data} /> : <PractitionerMain data={props.data} />}
        </article>
        <aside className="listing-detail-sidebar">
          {props.kind === "locations" ? <LocationContact data={props.data} /> : <PractitionerContact data={props.data} />}
        </aside>
      </div>

      <RelatedOptions searches={props.relatedSearches || null} />

      <LandingFooter />
    </main>
  );
}

function ListingStats({ kind, data }: DetailProps) {
  const stats =
    kind === "locations"
      ? [
          data.rating ? { label: "Rating", value: Number(data.rating).toFixed(1), icon: "star" } : null,
          data.review_count ? { label: "Reviews", value: Number(data.review_count).toLocaleString() } : null,
          data.offerings?.length ? { label: "Offerings", value: data.offerings.length.toLocaleString() } : null,
          data.practitioners?.length ? { label: "Practitioners", value: data.practitioners.length.toLocaleString() } : null,
        ]
      : [
          data.primary_specialty ? { label: "Specialty", value: data.primary_specialty } : null,
          data.years_experience ? { label: "Experience", value: `${data.years_experience} yrs` } : null,
          data.affiliations?.length ? { label: "Clinics", value: data.affiliations.length.toLocaleString() } : null,
        ];
  const visible = stats.filter(Boolean) as { label: string; value: string; icon?: string }[];
  if (!visible.length) {
    return null;
  }
  return (
    <dl className="listing-stat-row">
      {visible.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>
            {stat.icon === "star" ? <Star size={13} aria-hidden="true" /> : null}
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ImageGallery({ images, title, kind }: { images: string[]; title: string; kind: "locations" | "practitioners" }) {
  const visible = images.slice(0, 5);
  if (!visible.length) {
    return (
      <div className="listing-gallery listing-gallery-empty" aria-hidden="true">
        {kind === "locations" ? <Building2 size={42} aria-hidden="true" /> : <Stethoscope size={42} aria-hidden="true" />}
      </div>
    );
  }

  return (
    <div className="listing-gallery">
      {visible.map((src, index) => (
        <div className={index === 0 ? "listing-gallery-primary" : "listing-gallery-secondary"} key={`${src}-${index}`}>
          <Image
            src={imageSource(src)}
            alt={index === 0 ? title : ""}
            fill
            unoptimized
            sizes={index === 0 ? "(max-width: 980px) 100vw, 540px" : "(max-width: 980px) 48vw, 170px"}
          />
        </div>
      ))}
    </div>
  );
}

function LocationMain({ data }: { data: LocationDetailRecord }) {
  return (
    <>
      <Offerings offerings={data.offerings || []} />
      <LocationPractitioners practitioners={data.practitioners || []} />
      <ReviewList reviews={data.reviews || []} />
      <ExternalReviewList groups={data.external_reviews || []} />
    </>
  );
}

function PractitionerMain({ data }: { data: PractitionerDetailRecord }) {
  return (
    <>
      <section className="listing-section">
        <h2>Profile</h2>
        <div className="detail-rows">
          <div className="detail-row">
            <Stethoscope size={15} aria-hidden="true" />
            <span>{data.credentials || data.primary_specialty || "Profile details unavailable"}</span>
          </div>
          {data.languages ? (
            <div className="detail-row">
              <Globe size={15} aria-hidden="true" />
              <span>{data.languages}</span>
            </div>
          ) : null}
        </div>
      </section>
      <section className="listing-section">
        <h2>Affiliations</h2>
        {(data.affiliations || []).length ? (
          <div className="listing-row-list">
            {(data.affiliations || []).map((affiliation, index) => (
              <div className="listing-row-item" key={`${affiliation.id || index}-${affiliation.clinic}`}>
                <b>{affiliation.clinic || "Linked clinic"}</b>
                <span>{[affiliation.locality, affiliation.country_name || affiliation.country_code, affiliation.role].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p>No linked clinic in canonical data.</p>
        )}
      </section>
    </>
  );
}

function LocationContact({ data }: { data: LocationDetailRecord }) {
  const website = data.website ? externalHref(data.website) : null;
  const address = data.address || [data.locality, data.region, data.country_name].filter(Boolean).join(", ");
  const hasFacts = Boolean(address || data.phone || data.email);
  return (
    <div className="listing-side-panel">
      <h2>At a glance</h2>
      {hasFacts ? (
        <div className="listing-side-facts">
          {address ? (
            <span>
              <MapPin size={14} aria-hidden="true" />
              {address}
            </span>
          ) : null}
          {data.phone ? (
            <span>
              <Phone size={14} aria-hidden="true" />
              <a href={`tel:${data.phone}`}>{data.phone}</a>
            </span>
          ) : null}
          {data.email ? (
            <span>
              <Mail size={14} aria-hidden="true" />
              <a href={`mailto:${data.email}`}>{data.email}</a>
            </span>
          ) : null}
        </div>
      ) : null}
      {website ? (
        <a className="listing-primary-action" href={website} target="_blank" rel="noreferrer">
          Book online <ExternalLink size={15} aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function PractitionerContact({ data }: { data: PractitionerDetailRecord }) {
  const affiliation = data.affiliations?.[0];
  return (
    <div className="listing-side-panel">
      <h2>At a glance</h2>
      <div className="listing-side-facts">
        <span>{data.primary_specialty || "Specialty unavailable"}</span>
        {data.years_experience ? <span>{data.years_experience} years experience</span> : null}
        {affiliation ? <span>{[affiliation.clinic, affiliation.locality, affiliation.country_name].filter(Boolean).join(", ")}</span> : null}
      </div>
      {affiliation?.id ? (
        <Link className="listing-primary-action" href={locationHref({ id: affiliation.id, slug: affiliation.slug })}>
          View clinic
        </Link>
      ) : null}
    </div>
  );
}

function RelatedOptions({ searches }: { searches: RelatedTreatmentSearches | null }) {
  if (!searches?.treatments.length) {
    return null;
  }

  const placeName = searches.scope === "city" && searches.locality ? searches.locality : searches.country_name;
  const displayName =
    searches.scope === "city" && searches.locality
      ? [searches.locality, searches.region_code].filter(Boolean).join(", ")
      : searches.country_name;

  return (
    <section className="listing-related-options" aria-labelledby="listing-related-title">
      <div className="listing-related-inner">
        <h2 id="listing-related-title">Explore other options in {placeName}</h2>
        <div className="listing-related-column">
          <h3>{displayName}</h3>
          <div className="listing-related-links">
            {searches.treatments.map((treatment) => (
              <Link href={relatedTreatmentHref(searches, treatment)} key={`${searches.scope}-${treatment.id}`}>
                {treatment.name} in {placeName}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function relatedTreatmentHref(searches: RelatedTreatmentSearches, treatment: { id: number; name: string }) {
  const params = new URLSearchParams({ kind: "locations" });
  params.set("country", searches.country_code);
  if (searches.scope === "city" && searches.locality) {
    params.set("locality", searches.locality);
  }
  params.set("q", treatment.name);
  params.set("treatment_id", String(treatment.id));

  return `/directory?${params.toString()}`;
}

function Offerings({ offerings }: { offerings: OfferingRef[] }) {
  if (!offerings.length) {
    return null;
  }
  return (
    <section className="listing-section">
      <h2>
        Offerings <small>{offerings.length}</small>
      </h2>
      <div className="offer-list listing-offer-list">
        {offerings.slice(0, 60).map((offering, index) => {
          const { primary, secondary } = getOfferingLabels(offering);
          return (
            <div className="offer-item" key={`${offering.raw_name || offering.treatment}-${index}`}>
              <div className="offer-copy">
                <span className="offer-name">{primary}</span>
                {secondary ? <small>{secondary}</small> : null}
              </div>
              {offering.price_amount != null ? <b>{formatPrice(offering.price_amount, offering.price_currency)}</b> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LocationPractitioners({
  practitioners,
}: {
  practitioners: { id: number; slug?: string | null; full_name: string; primary_specialty?: string | null; role?: string | null }[];
}) {
  if (!practitioners.length) {
    return null;
  }
  return (
    <section className="listing-section">
      <h2>
        Practitioners <small>{practitioners.length}</small>
      </h2>
      <div className="listing-row-list">
        {practitioners.slice(0, 16).map((practitioner) => {
          const detail = [practitioner.primary_specialty, practitioner.role].filter(Boolean).join(" · ");
          return (
            <Link className="listing-row-item" href={practitionerHref(practitioner)} key={practitioner.id}>
              <b>{practitioner.full_name}</b>
              {detail ? <span>{detail}</span> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ReviewList({ reviews }: { reviews: ReviewRef[] }) {
  if (!reviews.length) {
    return null;
  }
  return (
    <section className="listing-section">
      <h2>
        Reviews <small>{reviews.length}</small>
      </h2>
      {reviews.slice(0, 6).map((review, index) => {
        const reviewer = reviewField(review.reviewer, "name") || "Anonymous";
        const rating = reviewField(review.rating, "ratingValue");
        return (
          <blockquote key={`${review.review_date}-${index}`}>
            <div className="review-meta">
              <b>{reviewer}</b>
              {rating ? (
                <span>
                  <Star size={11} aria-hidden="true" />
                  {rating}
                </span>
              ) : null}
            </div>
            <p>{review.body || "No review body provided."}</p>
          </blockquote>
        );
      })}
    </section>
  );
}

function ExternalReviewList({ groups }: { groups: ExternalReviewGroup[] }) {
  const visible = groups.filter((group) => group.rating || group.review_count || group.reviews?.length);
  if (!visible.length) {
    return null;
  }
  return (
    <section className="listing-section">
      <h2>External reviews</h2>
      <div className="external-review-groups">
        {visible.map((group) => (
          <div className="external-review-group" key={group.provider}>
            <div className="external-review-source">
              <b>{group.provider_name}</b>
              <span>
                {group.rating ? (
                  <>
                    <Star size={12} aria-hidden="true" />
                    {Number(group.rating).toFixed(1)}
                  </>
                ) : null}
                {group.review_count ? `${group.rating ? " · " : ""}${Number(group.review_count).toLocaleString()} reviews` : null}
              </span>
              {group.provider_url ? (
                <a href={externalHref(group.provider_url)} target="_blank" rel="noreferrer">
                  View source <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            {(group.reviews || []).slice(0, 5).map((review, index) => {
              const reviewer = reviewField(review.reviewer, "name") || "Anonymous";
              const rating = reviewField(review.rating, "ratingValue");
              return (
                <blockquote key={`${group.provider}-${review.review_date || ""}-${index}`}>
                  <div className="review-meta">
                    <b>{reviewer}</b>
                    {rating ? (
                      <span>
                        <Star size={11} aria-hidden="true" />
                        {rating}
                      </span>
                    ) : null}
                  </div>
                  <p>{review.body || "No review body provided."}</p>
                </blockquote>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function TagPills({ tags }: { tags: Tag[] }) {
  const visible = tags.filter((tag) => ["entity_type", "care_model", "trust", "price_tier"].includes(tag.facet));
  if (!visible.length) {
    return null;
  }
  return (
    <div className="listing-tag-row">
      {visible.slice(0, 8).map((tag) => (
        <span key={`${tag.facet}-${tag.value}`}>{tag.value}</span>
      ))}
    </div>
  );
}

function getImageSources(images: ImageRef[]) {
  return images
    .map((image) => image.blob_url || image.local_path || image.image_url)
    .filter((src): src is string => Boolean(src))
    .slice(0, 5);
}

function imageSource(src: string) {
  if (src.startsWith("data/media/")) {
    return `/media/${src.replace(/^data\/media\//, "")}`;
  }
  return src;
}

function getOfferingLabels(offering: OfferingRef) {
  const rawName = offering.raw_name?.trim();
  const treatment = offering.treatment?.trim();
  const primary = rawName || treatment || "Offering";
  const secondary = rawName && treatment && rawName.toLocaleLowerCase() !== treatment.toLocaleLowerCase() ? treatment : null;

  return { primary, secondary };
}

function formatPrice(amount?: number | null, currency?: string | null) {
  if (amount == null || !Number.isFinite(Number(amount))) {
    return null;
  }

  const value = Number(amount);
  const trimmedCurrency = currency?.trim();
  const maximumFractionDigits = Number.isInteger(value) ? 0 : 2;

  if (trimmedCurrency && /^[A-Z]{3}$/.test(trimmedCurrency)) {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: trimmedCurrency,
      maximumFractionDigits,
    }).format(value);
  }

  const formatted = value.toLocaleString("en", { maximumFractionDigits });
  if (!trimmedCurrency) {
    return formatted;
  }
  if (/^[^\dA-Za-z\s]+$/.test(trimmedCurrency)) {
    return `${trimmedCurrency}${formatted}`;
  }
  return `${formatted} ${trimmedCurrency}`;
}

function reviewField(value: string | number | null | undefined, key: string): string | null {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const extracted = parsed?.[key];
      return extracted == null ? null : String(extracted);
    } catch {
      return null;
    }
  }
  return text;
}

function externalHref(raw: string) {
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `https://${raw}`;
}
