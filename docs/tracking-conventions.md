# Tracking Conventions

## Inbound Campaign Links

Use standard UTM parameters only for external campaigns that bring visitors to Fountain.

- `utm_source`: `newsletter`, `x`, `linkedin`, `instagram`, or `partner-{name}`
- `utm_medium`: `social`, `email`, `referral`, or `paid`
- `utm_campaign`: `{topic}-{yyyymm}`, for example `launch-202608`

Values are lowercase and hyphenated. Do not invent new values without updating this document.

## Internal Navigation

Use `?from=` for internal Fountain navigation. Do not use `utm_*` for links between Fountain pages.

Allowed `from` values:

- `search`
- `directory`
- `home`
- `related`
- `reviews`

Indexable page metadata must emit clean canonicals without `from` or UTM parameters. Current spot checks:

- Location pages build canonicals as `/directory/locations/{slug}`.
- Practitioner pages build canonicals as `/directory/practitioners/{slug}`.
- The directory index canonical is `/directory`.

GA4 pageviews include `internal_from` when a page URL has `?from=...`.

GA4 production tags use property `G-HRXQ56P1Y7` by default and may be overridden with `NEXT_PUBLIC_GA_MEASUREMENT_ID`. The browser-side tag loader is hostname-gated to `fountain.clinic`; local and Vercel preview hosts must not load `gtag.js` or send `google-analytics.com/g/collect` hits to the production property.

## Outbound Clinic Links

Clinic website CTAs route through `/go/{location_slug}`.

The redirect appends these parameters at click time only:

- `utm_source=fountain.clinic`
- `utm_medium=referral`

Do not store Fountain outbound UTM parameters in `fountain.locations.website`. Stored URLs should stay canonical and free of tracking parameters.

Some destinations break when referral parameters are appended. Keep those domains in `OUTBOUND_REFERRAL_PARAM_SKIP_HOSTS` in `src/lib/url-sanitize.mjs`; `/go/` redirects for those domains skip UTM decoration but still log clicks. The initial denylisted domain is `shawellnessclinic.com`.

Outbound clicks are logged to `fountain.outbound_clicks`. The `param_skipped` column records redirects where UTM decoration was intentionally skipped. The database table is the source of truth for click counts; the GA4 `outbound_click` event is for dashboards and should use beacon transport.

Rendered outbound links use `rel="noopener"`. Keep links plain while listings are unpaid; switch paid listings to `rel="sponsored noopener"` when sponsorship begins.
