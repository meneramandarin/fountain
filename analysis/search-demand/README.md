# Fountain search-demand analysis

This workspace estimates Google search demand for Fountain's treatment taxonomy
in specific local markets. The code, market definitions, and curated keyword
aliases are versioned. Google exports, API responses, credentials, and generated
reports stay local and are ignored by Git.

## What the numbers mean

The primary source is Google Ads Keyword Planner historical metrics. Its average
monthly searches are rounded estimates for a keyword and its close variants,
using the selected location and Search Network settings. They measure searches,
not unique people. Category and treatment totals are directional sums of query
clusters, not an audience census.

Google Trends can later add seasonality and relative interest, but it should not
be used as absolute search volume. Search Console should be analyzed separately:
it describes searches where Fountain already appeared and does not expose a city
dimension.

Official references:

- https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics
- https://developers.google.com/google-ads/api/data/geotargets
- https://support.google.com/google-ads/answer/3022575
- https://support.google.com/trends/answer/4365533

## Fastest workflow: Keyword Planner CSV

Prepare the keyword upload:

```bash
npm run search-demand:prepare -- --market miami-fl
```

This reads the current `fountain.treatments` taxonomy and writes two ignored
files under `output/`:

- `miami-fl-keyword-planner-input.csv`: one-column upload for Keyword Planner.
- `miami-fl-keyword-map.csv`: the Fountain category/treatment mapping.

In Google Ads, open Keyword Planner, choose **Get search volume and forecasts**,
upload the input CSV, set the location to **Miami, Florida, United States**, the
language to English, and the network to Google. Download the historical metrics
CSV into `analysis/search-demand/raw/`, then run:

```bash
npm run search-demand:analyze -- \
  --market miami-fl \
  --input analysis/search-demand/raw/your-google-download.csv
```

The command produces ignored keyword, treatment, and category CSVs plus a local
HTML report. It also prints the IV Infusions query-family estimate.

## Direct Google Ads API workflow

Add these values to the already ignored `.env.local`:

```dotenv
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
```

`GOOGLE_ADS_LOGIN_CUSTOMER_ID` is optional. The developer token needs production
access and keyword-research permissible use; a test-account-only token cannot
call Keyword Planning against a production customer.

Then run:

```bash
npm run search-demand:fetch -- --market miami-fl
```

## Scalable Semrush workflow

Semrush's batch report accepts up to 100 keywords per request. For city-intent
analysis, query localized phrases such as `iv therapy miami`, export the combined
semicolon-delimited CSV, and run:

```bash
npm run search-demand:analyze-semrush -- \
  --market miami-fl \
  --keyword-suffix miami \
  --input analysis/search-demand/raw/miami-fl-semrush.csv
```

The suffix is removed only for matching against Fountain's taxonomy; the report
retains the full localized query.

The raw API response is stored under ignored `raw/`; normalized CSVs and the HTML
report are stored under ignored `output/`.

## Adding markets

Add an entry to `markets.json` using an active Google Ads geo target ID. Keep each
city as a separate run: sending several geo targets in one historical-metrics
request returns their combined volume rather than a city-by-city split.
