import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import type { RelatedTreatmentSearches } from "@/lib/queries";
import {
  Building2,
  ExternalLink,
  Globe,
  MapPin,
  Star,
  Stethoscope,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BackPillLink } from "@/components/back-pill-link";
import { locationHref } from "@/lib/directory-urls";
import { formatLocationPlace } from "@/lib/location-display";
import { SplitDirectorySearch } from "@/components/split-directory-search";
import { getOfferingLabels } from "@/lib/offering-labels";
import { formatLocationAddress } from "@/lib/location-address";
import { BookingRequestForm } from "@/components/booking-request-form";
import { ListingShareButton } from "@/components/listing-share-button";
import { ListingLocationMap } from "@/components/listing-location-map";
import {
  ClinicianLicenseVerification,
  type ClinicianLicenseVerificationData,
} from "@/components/clinician-license-verification";

type Tag = { facet: string; value: string };
type ImageRef = { blob_url?: string | null; alt?: string | null; image_kind?: string | null };
type ReviewRef = { author?: string | null; rating?: string | number | null; review_date?: string | null; text?: string | null };
type ExternalReviewGroup = {
  provider: string;
  provider_name: string;
  provider_url?: string | null;
  rating?: number | null;
  review_count?: number | null;
  reviews?: ReviewRef[];
};
type OfferingRef = {
  raw_name?: string | null;
  price_amount?: number | null;
  price_max_amount?: number | null;
  price_currency?: string | null;
  price_context?: string | null;
  treatment?: string | null;
  domain?: string | null;
};
type ChainLocationRef = {
  id: number;
  slug?: string | null;
  name?: string | null;
  org_name?: string | null;
  locality?: string | null;
  region?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  rating?: number | null;
  review_count?: number | null;
  min_price_amount?: number | null;
  min_price_currency?: string | null;
  treatments?: { name: string; domain: string }[];
  image?: string | null;
  image_kind?: string | null;
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
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  external_website_href?: string | null;
  rating?: number | null;
  review_count?: number | null;
  offerings?: OfferingRef[];
  offerings_note?: string | null;
  images?: ImageRef[];
  reviews?: ReviewRef[];
  external_reviews?: ExternalReviewGroup[];
  other_locations?: ChainLocationRef[];
  tags?: Tag[];
  clinician_license_verification?: ClinicianLicenseVerificationData | null;
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
  | { kind: "locations"; data: LocationDetailRecord; relatedSearches?: RelatedTreatmentSearches | null; showBackLink?: boolean; backHref?: string }
  | { kind: "practitioners"; data: PractitionerDetailRecord; relatedSearches?: RelatedTreatmentSearches | null; showBackLink?: boolean; backHref?: string };

export function DirectoryDetailPage(props: DetailProps) {
  const title =
    props.kind === "locations"
      ? props.data.name || props.data.org_name || "Directory record"
      : props.data.full_name || "Directory record";
  const subtitle =
    props.kind === "locations"
      ? formatLocationPlace({
          locality: props.data.locality,
          region: props.data.region,
          countryCode: props.data.country_code,
          countryName: props.data.country_name,
        })
      : [props.data.primary_specialty, props.data.years_experience ? `${props.data.years_experience} years experience` : ""]
          .filter(Boolean)
          .join(" · ");
  const images = getImageSources(props.data.images || []);
  const tags = props.data.tags || [];

  return (
    <main className={`listing-detail-shell${props.kind === "locations" ? " listing-detail-shell-location" : ""}`}>
      {props.kind === "locations" ? <LandingScrollHeader alwaysVisible kind="locations" /> : null}

      <section className={`listing-detail-hero${props.kind === "locations" ? " listing-detail-location-hero" : ""}`}>
        {props.kind === "practitioners" ? (
          <header className="directory-topbar listing-detail-topbar">
            <Link className="landing-brand directory-brand" href="/">
              fountain
            </Link>
            <SplitDirectorySearch className="listing-detail-search" compact />
            <button className="coming-soon-pill" type="button">
              Coming Soon <span aria-hidden="true">|</span> Log in
            </button>
          </header>
        ) : null}

        {props.kind === "locations" ? (
          <LocationHero
            data={props.data}
            title={title}
            subtitle={subtitle}
            showBackLink={props.showBackLink}
            backHref={props.backHref}
          />
        ) : (
          <div className="listing-detail-hero-grid">
            <div className="listing-hero-copy">
              {props.showBackLink ? (
                <BackPillLink href={props.backHref || `/directory?kind=${props.kind}`} tone="dark">
                  Back to results
                </BackPillLink>
              ) : null}
              <span className="listing-eyebrow">Doctor & practitioner</span>
              <h1>{title}</h1>
              <p>
                <Stethoscope size={17} aria-hidden="true" />
                {subtitle || "Details unavailable"}
              </p>
              <ListingStats kind={props.kind} data={props.data} />
              <TagPills tags={tags} />
            </div>

            <ImageGallery images={images} title={title} kind={props.kind} />
          </div>
        )}
      </section>

      {props.kind === "locations" ? (
        <BookingRequestForm
          locationId={props.data.id}
          locationSlug={props.data.slug}
          locationName={props.data.name || props.data.org_name || "this clinic"}
          locationAddress={locationDisplayAddress(props.data)}
          clinicTimezone={props.data.timezone}
          services={(props.data.offerings || []).map((offering, index) => ({
            serviceId: `${props.data.id}-treatment-${index}`,
            name: getOfferingLabels(offering).primary,
            category: offering.domain || null,
            priceAmount: offering.price_amount ?? null,
            priceMaxAmount: offering.price_max_amount ?? null,
            priceCurrency: offering.price_currency || null,
            priceContext: offering.price_context || null,
          }))}
        />
      ) : null}

      <div className={`listing-detail-layout${props.kind === "locations" ? " listing-detail-layout-location" : ""}`} id="listing-details">
        <article className="listing-detail-main">
          {props.kind === "locations" ? <LocationMain data={props.data} /> : <PractitionerMain data={props.data} />}
        </article>
        {props.kind === "practitioners" ? (
          <aside className="listing-detail-sidebar">
            <PractitionerContact data={props.data} />
          </aside>
        ) : null}
      </div>

      {props.kind === "locations" ? (
        <LocationMapSection data={props.data} title={title} subtitle={subtitle} />
      ) : null}

      <RelatedOptions searches={props.relatedSearches || null} />

      <LandingFooter />
    </main>
  );
}

function LocationHero({
  data,
  title,
  subtitle,
  showBackLink,
  backHref,
}: {
  data: LocationDetailRecord;
  title: string;
  subtitle: string;
  showBackLink?: boolean;
  backHref?: string;
}) {
  const rating = data.rating ? Number(data.rating) : null;
  const reviewCount = Number(data.review_count || 0);
  const directionsHref = locationDirectionsHref(data, title, subtitle);
  const images = getImageSources(data.images || []);

  return (
    <div className="listing-location-heading">
      <div className="listing-location-heading-copy">
        {showBackLink ? (
          <BackPillLink href={backHref || "/directory?kind=locations"} tone="light">
            Back to results
          </BackPillLink>
        ) : null}
        <div className="listing-location-title-row">
          <h1>{title}</h1>
          <ClinicianLicenseVerification verification={data.clinician_license_verification} />
        </div>
        <div className="listing-location-meta">
          {rating ? (
            <span className="listing-location-rating">
              <b>{rating.toFixed(1)}</b>
              <span className="listing-location-stars" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    className={index < Math.round(rating) ? "is-filled" : ""}
                    size={15}
                    key={index}
                    aria-hidden="true"
                  />
                ))}
              </span>
            </span>
          ) : null}
          {reviewCount ? (
            <a className="listing-location-reviews" href="#listing-reviews">
              ({reviewCount.toLocaleString()})
            </a>
          ) : null}
          {(rating || reviewCount) && subtitle ? <i aria-hidden="true">·</i> : null}
          {subtitle ? <span className="listing-location-place">{subtitle}</span> : null}
          {directionsHref ? (
            <a className="listing-location-directions" href={directionsHref} target="_blank" rel="noreferrer">
              Get directions
            </a>
          ) : null}
        </div>
      </div>
      <ListingShareButton title={title} />
      <LocationGallery images={images} title={title} />
    </div>
  );
}

function LocationGallery({ images, title }: { images: ImageRef[]; title: string }) {
  if (!images.length) {
    return null;
  }
  const [primary, ...rest] = images;
  const secondaries = rest.slice(0, 4);
  return (
    <div className={`listing-location-gallery${secondaries.length ? "" : " is-single"}`}>
      <GalleryTile className="listing-location-gallery-primary" image={primary} alt={title} sizes="(max-width: 900px) 100vw, 62vw" />
      {secondaries.length ? (
        <div className="listing-location-gallery-secondary-grid" data-count={secondaries.length}>
          {secondaries.map((image, index) => (
            <GalleryTile
              key={`${image.blob_url}-${index}`}
              className="listing-location-gallery-secondary"
              image={image}
              alt=""
              sizes="(max-width: 900px) 30vw, 220px"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GalleryTile({
  className,
  image,
  alt,
  sizes,
}: {
  className: string;
  image: ImageRef;
  alt: string;
  sizes: string;
}) {
  const src = imageSource(image.blob_url || "");
  const isContainedGraphic = image.image_kind === "text_graphic" || image.image_kind === "logo";
  return (
    <div className={`${className}${isContainedGraphic ? " image-frame-text-graphic" : ""}`}>
      {isContainedGraphic ? (
        <Image className="image-frame-backdrop" src={src} alt="" fill unoptimized aria-hidden="true" sizes="100vw" />
      ) : null}
      <Image
        className={isContainedGraphic ? "image-frame-content" : undefined}
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes={sizes}
      />
    </div>
  );
}

function LocationMapSection({
  data,
  title,
  subtitle,
}: {
  data: LocationDetailRecord;
  title: string;
  subtitle: string;
}) {
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const address = locationDisplayAddress(data) || subtitle || title;
  const directionsHref = locationDirectionsHref(data, title, subtitle);

  return (
    <section className="listing-location-map-section" aria-labelledby="listing-location-map-title">
      <div className="listing-location-map-header">
        <div>
          <h2 id="listing-location-map-title">Location</h2>
          <div className="listing-location-map-address-row">
            <p>
              <MapPin size={17} aria-hidden="true" />
              {address}
            </p>
            {directionsHref ? (
              <a href={directionsHref} target="_blank" rel="noreferrer">
                Get directions
              </a>
            ) : null}
          </div>
        </div>
      </div>
      <div className="listing-location-map-frame">
        <ListingLocationMap
          latitude={latitude}
          longitude={longitude}
          title={title}
          address={address}
        />
      </div>
    </section>
  );
}

function locationDirectionsHref(
  data: LocationDetailRecord,
  title: string,
  subtitle: string,
) {
  const query = locationDisplayAddress(data) || [title, subtitle].filter(Boolean).join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

function ListingStats({ kind, data }: DetailProps) {
  const stats =
    kind === "locations"
      ? [
          data.rating ? { label: "Rating", value: Number(data.rating).toFixed(1), icon: "star" } : null,
          data.review_count ? { label: "Reviews", value: Number(data.review_count).toLocaleString() } : null,
          data.offerings?.length ? { label: "Offerings", value: data.offerings.length.toLocaleString() } : null,
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

function ImageGallery({ images, title, kind }: { images: ImageRef[]; title: string; kind: "locations" | "practitioners" }) {
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
      {visible.map((image, index) => {
        const src = imageSource(image.blob_url || "");
        const isTextGraphic = image.image_kind === "text_graphic" || image.image_kind === "logo";
        return (
        <div className={`${index === 0 ? "listing-gallery-primary" : "listing-gallery-secondary"}${isTextGraphic ? " image-frame-text-graphic" : ""}`} key={`${src}-${index}`}>
          {isTextGraphic ? <Image className="image-frame-backdrop" src={src} alt="" fill unoptimized aria-hidden="true" sizes="100vw" /> : null}
          <Image
            className={isTextGraphic ? "image-frame-content" : undefined}
            src={imageSource(src)}
            alt={index === 0 ? title : ""}
            fill
            unoptimized
            sizes={index === 0 ? "(max-width: 980px) 100vw, 540px" : "(max-width: 980px) 48vw, 170px"}
          />
        </div>
      )})}
    </div>
  );
}

function LocationMain({ data }: { data: LocationDetailRecord }) {
  return (
    <>
      <ChainLocations title={data.org_name || data.name || "This clinic"} locations={data.other_locations || []} />
      <ReviewList reviews={data.reviews || []} />
      <ExternalReviewList groups={data.external_reviews || []} anchorId={!data.reviews?.length} />
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
                <span>{[formatLocationPlace({
                  locality: affiliation.locality,
                  countryCode: affiliation.country_code,
                  countryName: affiliation.country_name,
                }), affiliation.role].filter(Boolean).join(" · ")}</span>
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

function locationDisplayAddress(data: LocationDetailRecord) {
  const place = formatLocationPlace({
    locality: data.locality,
    region: data.region,
    countryCode: data.country_code,
    countryName: data.country_name,
  });
  const isMobileService = data.tags?.some(
    (tag) => tag.facet === "care_model" && tag.value.toLowerCase() === "mobile service",
  );
  return isMobileService
    ? `Mobile service in ${place || "this area"}`
    : formatLocationAddress({
        address: data.address,
        locality: data.locality,
        region: data.region,
        postalCode: data.postal_code,
        countryCode: data.country_code,
        countryName: data.country_name,
      }) || place;
}

function PractitionerContact({ data }: { data: PractitionerDetailRecord }) {
  const affiliation = data.affiliations?.[0];
  return (
    <div className="listing-side-panel">
      <h2>At a glance</h2>
      <div className="listing-side-facts">
        <span>{data.primary_specialty || "Specialty unavailable"}</span>
        {data.years_experience ? <span>{data.years_experience} years experience</span> : null}
        {affiliation ? <span>{[affiliation.clinic, formatLocationPlace({
          locality: affiliation.locality,
          countryCode: affiliation.country_code,
          countryName: affiliation.country_name,
        })].filter(Boolean).join(", ")}</span> : null}
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
  params.set("treatment_id", String(treatment.id));

  return `/directory?${params.toString()}`;
}

function ChainLocations({ title, locations }: { title: string; locations: ChainLocationRef[] }) {
  if (!locations.length) {
    return null;
  }

  return (
    <section className="listing-section listing-chain-locations" aria-labelledby="listing-chain-locations-title">
      <div className="listing-chain-header">
        <h2 id="listing-chain-locations-title">{possessive(title)} other locations</h2>
        <small>{locations.length}</small>
      </div>
      <div className="listing-chain-rail" aria-label={`${title} other locations`}>
        {locations.map((location) => (
          <ChainLocationCard location={location} key={location.id} />
        ))}
      </div>
    </section>
  );
}

function ChainLocationCard({ location }: { location: ChainLocationRef }) {
  const place = formatLocationPlace({
    locality: location.locality,
    region: location.region,
    countryCode: location.country_code,
    countryName: location.country_name,
  });
  const isContainedGraphic = location.image_kind === "text_graphic" || location.image_kind === "logo";
  const price = formatPrice(location.min_price_amount, location.min_price_currency);
  const treatments = (location.treatments || []).slice(0, 3);

  return (
    <Link className="listing-chain-card" href={locationHref(location)}>
      <span className={`listing-chain-photo${isContainedGraphic ? " image-frame-text-graphic" : ""}`}>
        {location.image ? (
          <>
            {isContainedGraphic ? <Image className="image-frame-backdrop" src={imageSource(location.image)} alt="" fill unoptimized aria-hidden="true" sizes="100vw" /> : null}
            <Image
              className={isContainedGraphic ? "image-frame-content" : undefined}
              src={imageSource(location.image)}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 640px) 72vw, 210px"
            />
          </>
        ) : (
          <span className="listing-chain-photo-fallback" aria-hidden="true">
            <Building2 size={22} aria-hidden="true" />
          </span>
        )}
        {location.rating ? (
          <span className="listing-chain-rating">
            <Star size={11} aria-hidden="true" />
            {Number(location.rating).toFixed(1)}
          </span>
        ) : null}
      </span>
      <span className="listing-chain-body">
        <b>{location.name || location.org_name || "Unnamed location"}</b>
        <small>
          <MapPin size={13} aria-hidden="true" />
          {place || "Location unavailable"}
        </small>
        <span className="listing-chain-meta">
          {price ? <small>From {price}</small> : null}
          {location.review_count ? <small>{Number(location.review_count).toLocaleString()} reviews</small> : null}
        </span>
        {treatments.length ? (
          <span className="listing-chain-treatments">
            {treatments.map((treatment) => (
              <span key={`${location.id}-${treatment.name}`}>{treatment.name}</span>
            ))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function possessive(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "This clinic's";
  }
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

function ReviewList({ reviews }: { reviews: ReviewRef[] }) {
  if (!reviews.length) {
    return null;
  }
  return (
    <section className="listing-section" id="listing-reviews">
      <h2>
        Reviews <small>{reviews.length}</small>
      </h2>
      <div className="review-grid">
        {reviews.slice(0, 6).map((review, index) => (
          <ReviewCard key={`${review.review_date}-${index}`} review={review} />
        ))}
      </div>
    </section>
  );
}

function ExternalReviewList({ groups, anchorId }: { groups: ExternalReviewGroup[]; anchorId?: boolean }) {
  const visible = groups.filter((group) => group.rating || group.review_count || group.reviews?.length);
  if (!visible.length) {
    return null;
  }
  return (
    <section className="listing-section" id={anchorId ? "listing-reviews" : undefined}>
      {anchorId ? <h2>Reviews</h2> : null}
      <div className="external-review-groups">
        {visible.map((group) => (
          <div className="external-review-group" key={group.provider}>
            <div className="external-review-source">
              {group.provider.toLowerCase() !== "google" ? (
                <span className="external-review-source-name">{group.provider_name}</span>
              ) : null}
              {group.rating ? (
                <span className="external-review-source-rating">
                  <b>{Number(group.rating).toFixed(1)}</b>
                  <StarRow value={Number(group.rating)} size={13} />
                </span>
              ) : null}
              {group.review_count ? (
                <span className="external-review-source-count">
                  {Number(group.review_count).toLocaleString()} reviews
                </span>
              ) : null}
              {group.provider_url ? (
                <a
                  className="external-review-source-link"
                  href={externalHref(group.provider_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <div className="review-grid">
              {(group.reviews || []).slice(0, 5).map((review, index) => (
                <ReviewCard key={`${group.provider}-${review.review_date || ""}-${index}`} review={review} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: ReviewRef }) {
  const author = reviewField(review.author, "name") || "Anonymous";
  const rating = reviewField(review.rating, "ratingValue");
  const ratingValue = rating ? Number(rating) : null;
  const date = formatReviewDate(review.review_date);
  return (
    <article className="review-card">
      <div className="review-card-head">
        <span className="review-card-avatar" aria-hidden="true">
          {author.charAt(0).toUpperCase()}
        </span>
        <div className="review-card-identity">
          <b>{author}</b>
          <div className="review-card-meta">
            {ratingValue ? <StarRow value={ratingValue} size={12} /> : null}
            {date ? <time>{date}</time> : null}
          </div>
        </div>
      </div>
      <p>{review.text || "No review body provided."}</p>
    </article>
  );
}

function StarRow({ value, size = 13 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="review-star-row" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={index < rounded ? "is-filled" : ""} size={size} aria-hidden="true" />
      ))}
    </span>
  );
}

function formatReviewDate(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function TagPills({ tags }: { tags: Tag[] }) {
  const visible = tags.filter((tag) => ["care_model", "goal", "price_tier", "trust"].includes(tag.facet));
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
    .filter((image): image is ImageRef & { blob_url: string } => Boolean(image.blob_url))
    .slice(0, 5);
}

function imageSource(src: string) {
  return src;
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
