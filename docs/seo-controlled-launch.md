# SEO controlled launch

Launch started: July 2026

## What is live

- 20 indexable treatment-by-city pilot pages.
- Treatment catalog and treatment-only pages generated from active, non-virtual clinic offerings.
- Discovery crawlers allowed; training and bulk crawlers disallowed in `robots.txt` and at the application boundary.
- Vercel Bot Protection enabled in challenge mode; the AI Bots managed ruleset remains in log mode for traffic classification.
- Excessive `/api/` traffic challenged at the Vercel edge after 120 requests per IP in 60 seconds.
- GA4 page views, directory searches, and outbound clinic clicks.

## Search Console handoff

This requires an owner of the `fountain.clinic` Google Search Console property.

1. Verify the Domain property for `fountain.clinic` if it is not already verified.
2. Submit `https://fountain.clinic/sitemap.xml` in **Indexing → Sitemaps**.
3. Use **URL inspection → Test live URL** for this representative set:
   - `https://fountain.clinic/`
   - `https://fountain.clinic/treatments`
   - `https://fountain.clinic/treatments/dexa-scan`
   - `https://fountain.clinic/treatments/dexa-scan/miami-fl`
   - `https://fountain.clinic/treatments/iv-drip/san-francisco-ca`
4. Confirm **Crawl allowed: Yes**, **Page fetch: Successful**, **Indexing allowed: Yes**, and the expected canonical.
5. Request indexing for those representative URLs. Let the sitemap handle the remaining URLs.

Google may take days or weeks to crawl and index new pages. A successful live test or indexing request does not guarantee inclusion.

## Measurement schedule

### Daily for the first 7 days

- Check the five representative URLs return `200` and retain their self-canonical.
- In Vercel Firewall, review logged, challenged, denied, and rate-limited traffic by rule, path, user agent, and IP.
- Confirm Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, and PerplexityBot have no `403` or `429` responses.
- Review Vercel function errors and `5xx` responses. Investigate any sustained error rate above 1%.
- Confirm GA4 is receiving `page_view`, `search`, and `outbound_click` events from production only.

### Weekly for 4 weeks

- Search Console Performance: impressions, clicks, CTR, average position, queries, pages, and country.
- Search Console Page indexing: indexed pilot pages and exclusion reasons.
- GA4 organic sessions landing on `/treatments/` pages, directory searches, and outbound clinic clicks.
- Vercel Firewall: false-positive challenges, top automated paths, and repeated abusive sources.

Record the baseline and each weekly snapshot in this table:

| Date | Pilot indexed | Organic impressions | Organic clicks | Organic landing sessions | Searches | Outbound clicks | WAF challenged | Crawler errors | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Launch | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | |

## Expansion gate

Expand beyond the 20 location pilots only after all of these are true:

- No Search Console manual action or site-wide crawl/indexing problem.
- No verified discovery crawler is being challenged, denied, or rate-limited.
- At least 16 of the 20 pilot pages are indexed, or Search Console shows a clear non-quality reason that has been fixed.
- Pilot pages are receiving impressions, and the queries align with treatment-plus-location intent.
- No sustained production `5xx` rate above 1%.

If the pages are crawled but not indexed, improve unique local content and provider coverage before creating more combinations.

## Rollback

- API false positives: change **Challenge excessive API traffic** to log mode or disable it, then publish the Vercel Firewall draft.
- Bot false positives: change Vercel **Bot Protection** from Challenge to Log. Keep verified search and answer-engine crawlers allowed.
- Index quality problem: remove affected URLs from the sitemap and apply `noindex`; do not block them in `robots.txt` before Google can see the directive.

## References

- [Google Search Console Sitemaps report](https://support.google.com/webmasters/answer/7451001)
- [Google URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
- [Vercel Bot Management](https://vercel.com/docs/bot-management)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
