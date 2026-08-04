#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { parseCsv } from "./lib.mjs";

const ROOT = path.resolve("analysis/search-demand");
const DATA = path.join(ROOT, "output");
const REPORT_DIR = path.resolve("output/pdf");
const HTML_PATH = path.join(DATA, "fountain-us-market-opportunity-report-2026.html");
const PDF_PATH = path.join(REPORT_DIR, "fountain-us-market-opportunity-report-2026.pdf");

const summary = JSON.parse(await readFile(path.join(DATA, "market-study-summary.json"), "utf8"));
const opportunities = await csv("market-study-topic-opportunities.csv");
const keywordRows = await csv("market-study-keyword-results.csv");
const supplyRows = await csv("market-study-supply.csv");
const inventory = await csv("market-study-treatment-inventory.csv");

const markets = summary.markets.map((row) => numeric(row));
const categories = summary.categories.map((row) => numeric(row));
const opps = opportunities.map((row) => numeric(row));
const supply = supplyRows.map((row) => numeric(row));
const keywords = keywordRows.map((row) => numeric(row));
const sfSupply = supply.find((row) => row.market === "san-francisco-bay") || {};

const C = {
  ink: "#15201d",
  muted: "#67736f",
  green: "#176e55",
  mint: "#b9e4d1",
  lime: "#dff2b3",
  cream: "#f5f0e6",
  rose: "#e7b5aa",
  gold: "#d9aa54",
  blue: "#87b7c9",
  paper: "#fffdf8",
};

const marketOrder = markets.map((row) => row.market);
const selectedTopics = [
  "DEXA scan", "Full-body MRI", "Botox", "Hair restoration", "IV Infusions",
  "Functional medicine", "Medical weight loss", "Hormone optimization",
  "Microneedling", "Laser hair removal", "Hyperbaric oxygen therapy", "Red light therapy",
];

const recommendations = [
  {
    title: "Make DEXA the diagnostic acquisition wedge",
    type: "Ads + SEO + GEO",
    markets: "NYC, Austin, Houston, San Diego, Chicago, Las Vegas",
    evidence: "9,610 searches in the measured city-keyword basket. NYC contributes 1,930; Austin 1,060; Houston 980; San Diego 940; Chicago 930. Las Vegas has 630 against only 1 mapped location.",
    ads: "Launch exact and phrase groups for dexa scan, dexa body composition, body composition scan, and bone density test by city. Split diagnostic/body-composition intent from osteoporosis intent. Route only to inventory-backed pages.",
    seo: "Build one complete DEXA hub and qualified city pages with price range, what the scan measures, preparation, scan duration, and provider comparison. Prioritize the six markets above.",
    geo: "Add concise answer blocks for cost, accuracy, radiation, and DEXA vs InBody; expose provider count, addresses, and booking paths in crawlable HTML and ItemList markup.",
    metric: "Qualified outbound clicks per 100 paid visits; non-brand top-10 rankings for DEXA + city; provider-page click-through rate.",
  },
  {
    title: "Use aesthetics as the paid-demand engine, with a fit filter",
    type: "Ads",
    markets: "Houston, Chicago, Miami, Los Angeles, Austin, San Diego",
    evidence: "Rejuvenate is the largest measured category in 11 of 12 covered markets. Laser hair removal, microneedling, Botox, and hair restoration repeatedly combine high city demand with sparse mapped inventory.",
    ads: "Start with exact high-intent treatment-city terms, not broad med spa. Separate Botox, microneedling, laser hair removal, fillers, and hair restoration into distinct campaigns and landing pages.",
    seo: "Create modality pages and treatment-city comparisons. Do not publish generic med-spa pages unless taxonomy and provider coverage are first fixed.",
    geo: "Make prices, treatment areas, downtime, credentials, and provider availability machine-readable and visible. Avoid unsupported outcome claims.",
    metric: "Cost per qualified provider click, lead-to-booking proxy, landing-page coverage rate, and query-level negative-keyword rate.",
  },
  {
    title: "Build a dedicated hair-restoration vertical",
    type: "Ads + SEO",
    markets: "NYC, Miami, Chicago, Houston",
    evidence: "Measured baskets are 3,840 in NYC, 2,800 Miami, 2,780 Chicago, and 2,400 Houston. Weighted CPC is roughly $5.71-$9.23, a strong commercial-intent signal.",
    ads: "Test hair transplant, hair loss clinic, and PRP hair restoration in separate groups. Exclude jobs, training, products, and before/after browsing if the page cannot satisfy them.",
    seo: "Publish a vertical that compares transplant, PRP, medications, and regenerative options, then links to matched local providers.",
    geo: "Use clinician-reviewed treatment comparison tables with candidacy, recovery, price structure, evidence strength, and provider credential fields.",
    metric: "Revenue or qualified click value per search; organic share of non-brand hair-restoration clicks; assisted conversions.",
  },
  {
    title: "Own Las Vegas IV intent before expanding nationally",
    type: "Ads",
    markets: "Las Vegas first; Miami, Houston, Austin, Chicago second",
    evidence: "Las Vegas has a 4,380 IV-infusion query basket, the highest of all markets, with 23 mapped providers. NYC is larger in supply (143) but lower demand per mapped location.",
    ads: "Create separate clinic, mobile IV, hydration, vitamin IV, and IV lounge groups. Keep intent and claims tightly controlled; exclude emergency and at-home DIY searches.",
    seo: "Build a Las Vegas IV guide with neighborhood coverage and mobile-vs-clinic filters before copying the playbook elsewhere.",
    geo: "Answer availability, service area, hours, formulations, supervision, and contraindication questions using visible data sourced from providers.",
    metric: "Provider click yield by intent group, mobile-vs-clinic conversion, and inventory match rate.",
  },
  {
    title: "Reframe MRI around the language consumers actually use",
    type: "SEO + Ads",
    markets: "NYC, Tampa, Houston, Los Angeles, Miami",
    evidence: "The expanded MRI basket is 2,960 across covered markets. Top language is often full body scan or a provider brand, not Fountain's canonical Full-body MRI label. NYC leads at 610; Tampa 340; Houston 330.",
    ads: "Bid on generic full body scan and whole body MRI terms; keep brand-comparison groups separate and avoid implying affiliation with Prenuvo or Ezra.",
    seo: "Consolidate synonyms into a single authoritative hub, with comparison pages for full-body MRI vs CT and brand-vs-independent-provider searches.",
    geo: "Provide an evidence-reviewed section on limitations, incidental findings, contrast, eligibility, price, and what is and is not screened.",
    metric: "Generic-to-brand click mix, query coverage, provider clicks, and zero misleading-affiliation incidents.",
  },
  {
    title: "Fill functional-medicine inventory gaps before buying scale",
    type: "Supply + SEO",
    markets: "Houston, Chicago, Austin, Los Angeles, Denver",
    evidence: "Houston shows 1,040 searches and zero mapped locations; Chicago 770 and zero; Austin 1,130 with 2; Los Angeles 1,170 with 3; Denver 1,000 with 2.",
    ads: "Do not scale campaigns into zero-inventory pages. Use low-budget exact tests only after provider onboarding and page QA.",
    seo: "Prioritize provider acquisition, taxonomy cleanup, and service verification, then publish city pages with filters for virtual care, labs, specialties, and care model.",
    geo: "Explain what functional medicine means on Fountain, how providers are verified, and how it differs from primary or integrative care.",
    metric: "Verified providers per priority market, inventory-backed query coverage, and zero-result landing rate.",
  },
  {
    title: "Test medical weight loss as a recurring-care category",
    type: "Ads + SEO",
    markets: "Houston, Tampa, Denver, Chicago, Miami",
    evidence: "Houston leads with 3,090 against 5 mapped locations. Tampa has 1,750; Denver 980 with 4; Chicago 930 with 3; Miami 1,180 with 11. CPCs are mostly $4-$6, with Austin higher.",
    ads: "Split clinic/doctor/program intent from drug-name intent. Use exact location terms first; require strong landing-page disclosures and avoid guaranteed-result copy.",
    seo: "Create medical weight-loss city pages and a separate GLP-1 education architecture, with eligibility, monitoring, pricing model, and provider credentials.",
    geo: "Publish reviewed answers about prescription requirements, ongoing monitoring, side effects, and how listings are selected.",
    metric: "Qualified click rate, returning-user rate, treatment-to-provider conversion, and policy disapproval rate.",
  },
  {
    title: "Segment hormone demand instead of using one broad page",
    type: "SEO + controlled Ads",
    markets: "Miami, Houston, Tampa, Denver, San Diego",
    evidence: "Broad hormone optimization demand is strongest in Miami (1,480) and Houston (1,380). TRT is strongest in San Diego (610), Tampa (580), and Denver (460). Menopause-specific city wording was under-captured and needs organic validation.",
    ads: "Separate general hormone care, TRT, and menopause care. Never let generic campaign copy imply a diagnosis or guaranteed outcome.",
    seo: "Create distinct hubs for hormone optimization, TRT, and menopause HRT with clinician review, then city pages only where inventory is verified.",
    geo: "Use question-led pages on testing, monitoring, risks, and specialist types. Show reviewer identity and update dates.",
    metric: "Segment-level conversion, clinical-review completion, organic impressions for menopause questions, and disapproval rate.",
  },
  {
    title: "Turn the dynamic directory into a selective search surface",
    type: "SEO platform",
    markets: "All covered markets; San Francisco after demand validation",
    evidence: "Only 30 treatment-city URLs are explicitly included in the current sitemap, while 98 treatments and far more inventory-backed combinations exist. Current pages emit BreadcrumbList but not provider ItemList or LocalBusiness data.",
    ads: "Require every campaign URL to pass an automated inventory, canonical, status, and content-depth check before activation.",
    seo: "Generate sitemap entries only when a treatment-city pair passes demand, inventory, and uniqueness thresholds. Add editorial modules, related treatments, neighborhoods, and crawlable provider summaries.",
    geo: "Add ItemList for result sets and LocalBusiness/MedicalBusiness data on eligible provider pages, matching visible facts exactly.",
    metric: "Indexed qualified pages, impressions per indexed page, zero-result rate, canonical errors, and provider-data freshness.",
  },
  {
    title: "Instrument GEO as a measurable distribution channel",
    type: "GEO foundation",
    markets: "National architecture, market-specific answers",
    evidence: "Fountain already allows OAI-SearchBot and other discovery crawlers while blocking training crawlers. The remaining gap is answer-ready content, entity structure, citations, and referral measurement.",
    ads: "Keep OAI-AdsBot accessible if testing ChatGPT ads; validate paid landing pages independently from search crawler policy.",
    seo: "Preserve normal crawl/index fundamentals, strong internal links, textual content, and structured data that matches the page. No special AI file is required by Google.",
    geo: "Add concise sourced answers, methodology, reviewer/date, provider facts, and stable entities. Track ChatGPT referrals with utm_source=chatgpt.com and build an AI-citation benchmark.",
    metric: "AI referral sessions, cited-answer share across a fixed prompt set, provider clicks from AI referrals, and source freshness SLA.",
  },
];

const pages = [];
function page(title, kicker, body, source = "Source: Fountain analysis, August 2026.", cls = "") {
  pages.push(`<section class="page ${cls}"><header><div class="brand">FOUNTAIN</div><div class="folio">${String(pages.length + 1).padStart(2, "0")}</div></header><div class="kicker">${kicker}</div><h1>${title}</h1>${body}<footer>${source}</footer></section>`);
}

pages.push(`<section class="page cover"><div class="cover-mark">F</div><div class="cover-copy"><div class="eyebrow">SEARCH DEMAND x MARKETPLACE SUPPLY</div><h1>Where Fountain<br>can win next</h1><p class="dek">US market, treatment, paid acquisition, SEO, and GEO opportunity study</p><div class="cover-meta"><span>12 demand markets</span><span>98 treatments</span><span>2,395 returned keyword rows</span><span>August 2026</span></div></div><div class="cover-foot">Internal strategy report / Semrush data preserved before API access expired</div></section>`);

page("Decision brief", "MANDATE", `
  <div class="lead">Use the data already captured to decide where Fountain should invest in paid demand, organic search, and AI-answer visibility - without purchasing the $599 Semrush tier.</div>
  <div class="three"><div class="card"><b>What was measured</b><p>7,566 treatment and alias queries were designed across 13 metros. Semrush returned usable results for 12 markets.</p></div><div class="card"><b>What was joined</b><p>Search demand was matched to Fountain's current treatment taxonomy and active US marketplace supply.</p></div><div class="card"><b>What this report decides</b><p>Market priority, treatment plays, campaign design, page architecture, and a 90-day execution order.</p></div></div>
  <div class="callout"><b>The answer:</b> The saved corpus is sufficient for portfolio decisions and launch tests. San Francisco needs a later demand refresh, but it should not block action in the other 12 markets.</div>
`);

page("Executive answer", "SYNTHESIS", `
  <div class="big-number">Do not buy the tier yet.</div><p class="lead">The corpus already identifies repeatable demand patterns, supply gaps, and exact launch terms. Spend the next 90 days converting that information into pages, inventory, and controlled campaigns.</p>
  <div class="two"><div><h2>Three moves now</h2><ol><li><b>DEXA:</b> the cleanest diagnostic wedge across markets.</li><li><b>Aesthetics:</b> the largest demand pool, but only when split by treatment and backed by verified providers.</li><li><b>SEO/GEO infrastructure:</b> expand beyond 30 sitemap-listed treatment-city pages selectively, with richer entity and answer structure.</li></ol></div><div><h2>Two guardrails</h2><ol><li>Do not equate query-basket volume with total local audience or forecasts.</li><li>Do not promote raw gaps such as Pilates, personal trainers, or generic med spa until taxonomy and strategic fit are resolved.</li></ol></div></div>
`);

page("The data asset already in hand", "DATA COVERAGE", `${coverageVisual()}<div class="four metrics"><div><b>7,566</b><span>designed market queries</span></div><div><b>2,395</b><span>returned keyword rows</span></div><div><b>1,071</b><span>national discovery rows</span></div><div><b>995</b><span>treatment-market summaries</span></div></div><p class="note">Twelve markets are complete or near-complete. Scottsdale missed 50 planned queries and Denver missed 40. San Francisco's 582-query map and marketplace supply are saved, but no Semrush demand rows were returned before access expired.</p>`, "Source: Semrush API captures and Fountain analysis files, generated August 2, 2026.");

page("How to read the numbers", "METHOD", `
  <div class="steps"><div><span>1</span><b>Taxonomy</b><p>98 live Fountain treatments plus curated synonyms and high-volume discovery terms.</p></div><div><span>2</span><b>Localization</b><p>Queries localized with one representative city suffix per metro, such as nyc or miami.</p></div><div><span>3</span><b>Demand</b><p>Semrush US keyword-volume, CPC, and paid-competition fields captured per returned phrase.</p></div><div><span>4</span><b>Supply</b><p>Active, non-virtual US Fountain locations mapped to metro locality sets.</p></div><div><span>5</span><b>Opportunity</b><p>A transparent composite ranks demand, demand per mapped location, CPC, and competition.</p></div></div>
  <div class="callout"><b>Query basket volume</b> is the exact sum of measured, deduplicated city-explicit phrases mapped to a treatment. It is a comparative index, not a forecast of all searches occurring inside the metro.</div>
`);

page("Limits that protect the decision", "PRECISION", `
  <table class="wide"><thead><tr><th>Known limitation</th><th>What it means</th><th>Decision treatment</th></tr></thead><tbody>
  <tr><td>Third-party modeled volume</td><td>Semrush volume is an estimate, even when the stored number is exact.</td><td>Use for relative prioritization; validate with campaign/search-console observations.</td></tr>
  <tr><td>City-explicit phrases</td><td>Near-me and unmodified local searches are not included.</td><td>Never call the basket total local TAM.</td></tr>
  <tr><td>One suffix per metro</td><td>Scottsdale represents the Phoenix metro; Dallas represents DFW.</td><td>Use metro supply, but test neighboring city variants in launch.</td></tr>
  <tr><td>Keyword overlap</td><td>Some phrases could fit more than one treatment.</td><td>Use canonical landing pages and negatives to prevent internal competition.</td></tr>
  <tr><td>Brand contamination</td><td>Some discovered terms are provider brands.</td><td>Separate or exclude brand campaigns; never infer generic demand from a brand spike.</td></tr>
  <tr><td>SF demand absent</td><td>No demand rows were returned before credits ended.</td><td>Keep SF out of demand rankings; retain its 119-location supply profile.</td></tr>
  </tbody></table>
`);

page("Market demand ranking", "MARKETS", `${barChart(markets, "queryBasketVolume", "marketName", C.green)}<p class="note">NYC is the largest measured basket. Houston and Chicago form a high-demand, relatively thin-supply second tier. The ranking excludes San Francisco because its API batch was not returned.</p>`);

page("Demand and Fountain supply tell different stories", "MARKET MATRIX", `${marketScatter()}<div class="legend"><span><i style="background:${C.rose}"></i>Thinner relative supply</span><span><i style="background:${C.green}"></i>Deeper relative supply</span></div><p class="note">Houston and Chicago combine large query baskets with far fewer mapped locations than NYC, LA, Miami, or Scottsdale/Phoenix. That creates opportunity only if Fountain can verify enough relevant treatment inventory.</p>`);

page("Category mix by market", "PORTFOLIO", `${stackedCategoryChart()}<p class="note">Rejuvenate is the largest measured category in every market except Las Vegas, where Optimize leads because IV-therapy demand is unusually high. Measure looks smaller because diagnostic demand is concentrated in fewer phrases and some concepts use non-city search language.</p>`);

page("Raw gaps require a strategic-fit filter", "OPPORTUNITY LANDSCAPE", `${topicScatter()}<div class="two small"><div class="callout good"><b>Pursue:</b> DEXA, specific aesthetics, hair restoration, IV therapy, functional medicine, medical weight loss, selected imaging.</div><div class="callout warn"><b>Do not auto-pursue:</b> Pilates, personal trainers, physical therapy, or generic med spa solely because mapped supply is low.</div></div>`);

page("Diagnostics: DEXA is the clearest wedge", "MEASURE", `${topicMarketBars("DEXA scan", C.green)}<p class="lead">DEXA has the best combination of repeatable multi-market demand, understandable consumer intent, moderate CPC, and a service that Fountain already represents.</p><div class="callout"><b>Launch order:</b> NYC, Austin, Houston, San Diego, Chicago, then Las Vegas. Chicago and Las Vegas are especially supply-thin in Fountain's current mapping.</div>`);

page("Imaging demand uses consumer and brand language", "MEASURE", `${topicMarketBars("Full-body MRI", C.blue)}<div class="two"><div><h2>Consumer language</h2><p>full body scan, whole body scan, full body MRI scan, preventive MRI.</p></div><div><h2>Comparison language</h2><p>Prenuvo scan and Ezra scan appear in local baskets. Treat these as comparison intent, not as proof of affiliation.</p></div></div><p class="note">The measured MRI basket is 2,960, including 610 in NYC, 340 in Tampa, and 330 in Houston.</p>`);

page("The taxonomy-language bridge", "SEARCH LANGUAGE", `${languageTable()}<p class="note">Fountain should keep medically precise canonical names, but page titles, copy, internal search, and ad groups need the terms people actually use.</p>`);

for (const market of markets) marketPage(market);

page("San Francisco: known supply, missing demand", "COVERAGE GAP", `
  <div class="two"><div><div class="big-number">119</div><p>active metro locations</p><div class="big-number">94</div><p>organizations</p></div><div><div class="big-number">911</div><p>offerings</p><div class="big-number">582</div><p>planned queries saved for a future refresh</p></div></div>
  <div class="callout"><b>Decision:</b> keep San Francisco in product and SEO infrastructure work, but do not rank or allocate paid budget based on unmeasured demand. First use Search Console and internal behavior; buy a narrow one-off data refresh later only if needed.</div>
  <h2>What can proceed now</h2><ul><li>Inventory QA and treatment-city page enrichment.</li><li>Schema and crawler work that applies nationally.</li><li>First-party measurement for existing SF pages.</li></ul>
`, "Source: Fountain production database snapshot and saved 582-query map. No Semrush SF demand rows were available.");

for (const category of ["Measure", "Optimize", "Recover", "Regenerate", "Rejuvenate"]) categoryPage(category);

playPage("DEXA", "A repeatable diagnostic acquisition loop", "DEXA scan", ["new-york", "austin", "houston", "san-diego", "chicago", "las-vegas"]);
playPage("Aesthetics", "Capture treatment demand, not generic med-spa noise", "Microneedling", ["chicago", "houston", "miami", "los-angeles", "denver-boulder", "san-diego"]);
playPage("Hair restoration", "High commercial intent supports a vertical", "Hair restoration", ["new-york", "miami", "chicago", "houston", "los-angeles", "denver-boulder"]);
playPage("IV therapy", "Las Vegas is the standout local test", "IV Infusions", ["las-vegas", "new-york", "miami", "houston", "austin", "chicago"]);
playPage("Medical weight loss", "Recurring care with strong Houston whitespace", "Medical weight loss", ["houston", "tampa-bay", "new-york", "los-angeles", "las-vegas", "miami"]);
playPage("Functional medicine", "A supply-development opportunity first", "Functional medicine", ["new-york", "los-angeles", "austin", "houston", "denver-boulder", "chicago"]);
playPage("Hormone care", "Segment broad demand, TRT, and menopause care", "Hormone optimization", ["miami", "houston", "tampa-bay", "dallas-fort-worth", "denver-boulder", "los-angeles"]);
playPage("Recovery stack", "Use organic comparison content before broad paid scale", "Hyperbaric oxygen therapy", ["san-diego", "new-york", "houston", "las-vegas", "los-angeles", "miami"]);

recommendations.forEach((rec, index) => recommendationPage(rec, index));

page("90-day execution roadmap", "OPERATING PLAN", `${roadmap()}<div class="three small"><div class="card"><b>Days 0-30</b><p>Inventory QA, baseline tracking, DEXA page template, crawler/schema implementation, ad account structure.</p></div><div class="card"><b>Days 31-60</b><p>Launch DEXA and two aesthetics tests; publish first qualified city pages; begin hair restoration vertical.</p></div><div class="card"><b>Days 61-90</b><p>Scale winners, launch Las Vegas IV and Houston weight loss, prune weak pages, run AI citation benchmark.</p></div></div>`);

page("Budget gates - not a budget guess", "PAID ACQUISITION", `
  <div class="funnel"><div><b>Gate 1</b><span>Inventory-backed page</span></div><div><b>Gate 2</b><span>Exact intent fit</span></div><div><b>Gate 3</b><span>Qualified click signal</span></div><div><b>Gate 4</b><span>Provider / booking value</span></div></div>
  <table class="wide"><thead><tr><th>Stage</th><th>Rule</th><th>Stop condition</th></tr></thead><tbody><tr><td>Probe</td><td>Exact and phrase only; one treatment-city per ad group.</td><td>No relevant inventory clicks after a pre-set sample.</td></tr><tr><td>Prove</td><td>Add aliases and controlled neighboring geographies.</td><td>Query quality or page-match rate deteriorates.</td></tr><tr><td>Scale</td><td>Increase only when downstream provider value is observed.</td><td>Spend grows faster than qualified outcomes.</td></tr></tbody></table>
  <p class="note">CPC is useful for commercial-intent and test-cost context; it is not a Fountain performance forecast.</p>
`);

page("Measurement system", "SCORECARD", `
  <table class="wide"><thead><tr><th>Layer</th><th>Primary metric</th><th>Diagnostic metrics</th></tr></thead><tbody>
  <tr><td>Ads</td><td>Cost per qualified provider click</td><td>Search-term relevance, zero-result rate, landing engagement, disapprovals</td></tr>
  <tr><td>SEO</td><td>Non-brand organic provider clicks</td><td>Indexed qualified pages, impressions/page, top-10 treatment-city terms, crawl waste</td></tr>
  <tr><td>GEO</td><td>AI referral provider clicks</td><td>Citation share across benchmark prompts, answer accuracy, source freshness</td></tr>
  <tr><td>Marketplace</td><td>Provider availability after click</td><td>Verified inventory, stale records, duplicate organizations, booking-path integrity</td></tr>
  </tbody></table>
  <div class="callout"><b>Instrumentation rule:</b> join campaign/search query, landing treatment-city, provider result set, outbound click, and any available downstream booking signal. Without that chain, paid optimization will select cheap clicks rather than useful demand.</div>
`);

page("Technical SEO and GEO audit", "FOUNTAIN TODAY", `
  <div class="two"><div><h2>Already strong</h2><ul><li>Discovery crawlers such as Googlebot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, and PerplexityBot are explicitly welcomed.</li><li>Training/bulk crawlers are separated from discovery crawlers.</li><li>Treatment and treatment-city routes have canonical metadata and BreadcrumbList.</li></ul></div><div><h2>Highest-impact gaps</h2><ul><li>Only 30 fixed treatment-city URLs are emitted by the sitemap.</li><li>Directory result pages do not currently expose provider ItemList structured data.</li><li>LocalBusiness/MedicalBusiness facts need stronger page-level entity markup.</li><li>Thin dynamic pages need a qualification rule, not mass indexation.</li></ul></div></div>
  <div class="callout"><b>Implementation sequence:</b> thresholded sitemap expansion -> crawlable provider summaries -> ItemList and business entities -> treatment FAQs/evidence -> first-party query and AI referral measurement.</div>
`, "Source: repository audit of src/app/sitemap.ts, treatment routes, fixed-treatment-location-pages.ts, and crawler-policy.ts; Google and OpenAI guidance cited in Sources.");

page("Data appendix", "REPRODUCIBILITY", `
  <table class="wide"><thead><tr><th>Artifact</th><th>Rows / role</th></tr></thead><tbody>
  <tr><td>market-study-keyword-map.csv</td><td>7,566 designed market-query mappings</td></tr>
  <tr><td>market-study-keyword-results.csv</td><td>2,395 analyzed Semrush keyword rows</td></tr>
  <tr><td>market-study-topic-opportunities.csv</td><td>995 treatment-market aggregates</td></tr>
  <tr><td>market-study-category-summary.csv</td><td>Category-market rollups</td></tr>
  <tr><td>market-study-market-summary.csv</td><td>12 covered market summaries</td></tr>
  <tr><td>market-study-supply.csv</td><td>Fountain metro supply by treatment</td></tr>
  <tr><td>market-study-treatment-inventory.csv</td><td>US location coverage by treatment</td></tr>
  <tr><td>raw/semrush-discovery/*.csv</td><td>1,071 broad national discovery rows</td></tr>
  <tr><td>raw/semrush-markets/*.csv</td><td>12 saved market response files</td></tr>
  </tbody></table><p class="note">All values in this report are reproducible from the saved files. Re-running the report does not call Semrush.</p>
`);

page("Sources", "REFERENCES", `
  <div class="sources"><p><b>Internal</b></p><p>Fountain production database snapshot, captured August 2026.</p><p>Semrush API keyword-detail captures, stored in analysis/search-demand/raw.</p><p>Fountain treatment catalog: <a href="https://fountain.clinic/treatments">https://fountain.clinic/treatments</a></p>
  <p><b>Search and GEO guidance</b></p><p>Google Search Central, AI features and your website: <a href="https://developers.google.com/search/docs/appearance/ai-features">developers.google.com/search/docs/appearance/ai-features</a></p><p>Google Search Central, Local business structured data: <a href="https://developers.google.com/search/docs/appearance/structured-data/local-business">developers.google.com/search/docs/appearance/structured-data/local-business</a></p><p>Google Search Central, 2026 optimization resource: <a href="https://developers.google.com/search/blog/2026/05/a-new-resource-for-optimizing">developers.google.com/search/blog/2026/05/a-new-resource-for-optimizing</a></p><p>OpenAI Publisher FAQ: <a href="https://help.openai.com/en/articles/12627856">help.openai.com/en/articles/12627856</a></p><p>OpenAI advertiser crawler guidance: <a href="https://help.openai.com/en/articles/20001243-advertiser-guidance-for-allowing-openai-web-crawlers">help.openai.com/en/articles/20001243-advertiser-guidance-for-allowing-openai-web-crawlers</a></p></div>
  <div class="callout"><b>Prepared for Fountain.</b> The report intentionally avoids purchased-market-size claims and unsupported forecasts. It is a measured search-demand and marketplace-supply decision document.</div>
`);

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fountain US Market Opportunity Report</title><style>${styles()}</style></head><body>${pages.join("\n")}</body></html>`;
await mkdir(REPORT_DIR, { recursive: true });
await writeFile(HTML_PATH, html);
const browser = await chromium.launch({ headless: true });
const browserPage = await browser.newPage({ viewport: { width: 1100, height: 1424 }, deviceScaleFactor: 1 });
await browserPage.goto(`file://${HTML_PATH}`, { waitUntil: "load" });
await browserPage.pdf({ path: PDF_PATH, format: "Letter", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
await browser.close();
console.log(JSON.stringify({ html: HTML_PATH, pdf: PDF_PATH, pages: pages.length }, null, 2));

async function csv(name) {
  const rows = parseCsv(await readFile(path.join(DATA, name), "utf8"));
  const headers = rows.shift();
  return rows.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function numeric(row) {
  const output = { ...row };
  for (const key of ["queryBasketVolume", "measuredTreatments", "locations", "organizations", "offerings", "attemptedQueries", "returnedQueries", "returnedRate", "unqueriedDueToLimit", "medianOpportunityScore", "topQueryVolume", "weightedCpc", "paidCompetition", "treatmentLocations", "demandPerLocation", "opportunityScore", "avgMonthlySearches", "averageCpc", "competition", "us_locations"]) {
    if (key in output) output[key] = Number(output[key] || 0);
  }
  return output;
}

function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function n(value) { return Number(value || 0).toLocaleString("en-US"); }
function money(value) { return `$${Number(value || 0).toFixed(2)}`; }

function coverageVisual() {
  const rows = Object.entries(summary.collectionStatus);
  const name = (slug) => slug === "san-francisco-bay" ? "San Francisco" : (markets.find((m) => m.market === slug)?.marketName || slug);
  return `<div class="coverage">${rows.map(([slug, d]) => { const pct = d.attemptedQueries / 582 * 100; return `<div><span>${esc(name(slug))}</span><i><b style="width:${pct}%"></b></i><em>${d.attemptedQueries}/582</em></div>`; }).join("")}</div>`;
}

function barChart(rows, valueKey, labelKey, color) {
  const max = Math.max(...rows.map((row) => row[valueKey]));
  return `<div class="bars">${rows.map((row) => `<div><span>${esc(row[labelKey])}</span><i><b style="width:${row[valueKey] / max * 100}%;background:${color}"></b></i><em>${n(row[valueKey])}</em></div>`).join("")}</div>`;
}

function marketScatter() {
  const W = 790, H = 440, pad = 65;
  const maxX = Math.max(...markets.map((m) => m.locations)) * 1.08;
  const maxY = Math.max(...markets.map((m) => m.queryBasketVolume)) * 1.08;
  const labelOffsets = {
    "new-york": [11, 4], "houston": [10, -9], "chicago": [-42, -10],
    "miami": [10, -10], "los-angeles": [12, 15], "dallas-fort-worth": [12, 18],
    "austin": [10, -12], "san-diego": [15, 12], "denver-boulder": [10, 18],
    "las-vegas": [-48, 11], "tampa-bay": [10, 16], "scottsdale-phoenix": [10, 5],
  };
  const dots = markets.map((m) => {
    const x = pad + (m.locations / maxX) * (W - 2 * pad);
    const y = H - pad - (m.queryBasketVolume / maxY) * (H - 2 * pad);
    const thin = m.locations < 130;
    const [dx, dy] = labelOffsets[m.market] || [11, 4];
    return `<circle cx="${x}" cy="${y}" r="8" fill="${thin ? C.rose : C.green}"/><text x="${x + dx}" y="${y + dy}">${shortMarket(m.marketName)}</text>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}"/><text class="axis" x="${W/2}" y="${H-10}">Active Fountain metro locations</text><text class="axis" transform="translate(15 ${H/2}) rotate(-90)">Measured query basket volume</text>${dots}</svg>`;
}

function stackedCategoryChart() {
  const order = ["Measure", "Optimize", "Recover", "Regenerate", "Rejuvenate"];
  const colors = [C.blue, C.green, C.gold, C.rose, "#594a78"];
  return `<div class="stacked">${markets.map((market) => { const rows = categories.filter((c) => c.market === market.market && order.includes(c.category)); const total = rows.reduce((s, r) => s + r.queryBasketVolume, 0); return `<div><span>${shortMarket(market.marketName)}</span><i>${order.map((cat, i) => { const row = rows.find((r) => r.category === cat); const v = row?.queryBasketVolume || 0; return `<b style="width:${v / total * 100}%;background:${colors[i]}" title="${cat}: ${v}"></b>`; }).join("")}</i><em>${n(total)}</em></div>`; }).join("")}</div><div class="legend">${order.map((cat, i) => `<span><i style="background:${colors[i]}"></i>${cat}</span>`).join("")}</div>`;
}

function topicScatter() {
  const grouped = selectedTopics.map((topic) => { const rows = opps.filter((o) => o.topic === topic); return { topic, vol: rows.reduce((s, r) => s + r.queryBasketVolume, 0), supply: rows.reduce((s, r) => s + r.treatmentLocations, 0), score: median(rows.map((r) => r.opportunityScore)) }; });
  const W = 790, H = 440, pad = 65, maxX = Math.max(...grouped.map((x) => x.supply))*1.1, maxY = Math.max(...grouped.map((x) => x.vol))*1.08;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}"/><text class="axis" x="${W/2}" y="${H-10}">Mapped treatment locations across covered markets</text><text class="axis" transform="translate(15 ${H/2}) rotate(-90)">Measured query basket volume</text>${grouped.map((g) => { const x=pad+g.supply/maxX*(W-2*pad), y=H-pad-g.vol/maxY*(H-2*pad); return `<circle cx="${x}" cy="${y}" r="${5+g.score/18}" fill="${g.score>75?C.rose:C.green}" fill-opacity=".8"/><text x="${x+9}" y="${y+4}">${esc(shortTopic(g.topic))}</text>`; }).join("")}</svg>`;
}

function topicMarketBars(topic, color) {
  const rows = opps.filter((o) => o.topic === topic).sort((a,b)=>b.queryBasketVolume-a.queryBasketVolume);
  return barChart(rows, "queryBasketVolume", "marketName", color);
}

function languageTable() {
  const pairs = [
    ["Full-body MRI", "full body scan; whole body scan; Prenuvo scan; Ezra scan"],
    ["DEXA scan", "DEXA body composition; body composition scan; bone density test"],
    ["Medical weight loss", "weight loss clinic; weight loss doctor; weight loss program"],
    ["IV Infusions", "IV therapy; IV drip; IV hydration; mobile IV; IV lounge"],
    ["Hormone optimization", "hormone clinic; hormone specialist; bioidentical hormone therapy"],
    ["Microneedling", "RF microneedling; Morpheus8; collagen induction therapy"],
  ];
  return `<table class="wide"><thead><tr><th>Fountain canonical topic</th><th>Search language to incorporate</th></tr></thead><tbody>${pairs.map((p)=>`<tr><td>${p[0]}</td><td>${p[1]}</td></tr>`).join("")}</tbody></table>`;
}

function marketPage(market) {
  const top = opps.filter((o) => o.market === market.market && !["Personal Trainer", "Pilates", "Physical therapy", "Med spa"].includes(o.topic)).sort((a,b)=>b.opportunityScore-a.opportunityScore).slice(0,7);
  const cats = categories.filter((c) => c.market === market.market && c.category !== "Cross-category").sort((a,b)=>b.queryBasketVolume-a.queryBasketVolume);
  const caveat = market.unqueriedDueToLimit ? `<div class="badge warn">${market.unqueriedDueToLimit} planned queries not run</div>` : `<div class="badge">Full planned query batch attempted</div>`;
  page(market.marketName, "MARKET SCORECARD", `
    <div class="four metrics"><div><b>${n(market.queryBasketVolume)}</b><span>query basket</span></div><div><b>${n(market.locations)}</b><span>locations</span></div><div><b>${n(market.organizations)}</b><span>organizations</span></div><div><b>${n(market.offerings)}</b><span>offerings</span></div></div>${caveat}
    <div class="two"><div><h2>Category demand</h2>${miniBars(cats, "queryBasketVolume", "category")}</div><div><h2>Highest-fit opportunities</h2><table><thead><tr><th>Treatment</th><th>Basket</th><th>Supply</th></tr></thead><tbody>${top.map((o)=>`<tr><td>${esc(o.topic)}</td><td>${n(o.queryBasketVolume)}</td><td>${n(o.treatmentLocations)}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="callout"><b>Lead with:</b> ${top.slice(0,3).map((o)=>o.topic).join(", ")}. <b>Top exact observed terms:</b> ${top.slice(0,3).map((o)=>`"${o.topQuery}" (${n(o.topQueryVolume)})`).join("; ")}.</div>
  `, "Source: Semrush US keyword-detail captures and Fountain production database snapshot. Volumes are measured query baskets.");
}

function categoryPage(category) {
  const rows = opps.filter((o) => o.category === category);
  const topics = [...new Set(rows.map((r)=>r.topic))].map((topic)=>{ const x=rows.filter((r)=>r.topic===topic); return {topic, vol:x.reduce((s,r)=>s+r.queryBasketVolume,0), supply:x.reduce((s,r)=>s+r.treatmentLocations,0), score:median(x.map((r)=>r.opportunityScore))}; }).sort((a,b)=>b.vol-a.vol).slice(0,10);
  const stance = {
    Measure: "Use DEXA as the paid wedge; build MRI, screening, and performance testing as evidence-heavy organic assets.",
    Optimize: "Prioritize IV in Las Vegas, medical weight loss in Houston, and functional medicine only after filling inventory gaps.",
    Recover: "Favor comparison-led SEO for HBOT, red light, sauna, cryotherapy, and recovery bundles; paid economics are less compelling at current supply levels.",
    Regenerate: "Keep claims and evidence standards high. Use modality education and provider credentials before aggressive paid scale.",
    Rejuvenate: "This is the largest demand pool. Split by treatment, market, price, downtime, and credentials; generic med-spa intent is too noisy.",
  }[category];
  page(category, "CATEGORY STRATEGY", `<p class="lead">${stance}</p>${miniBars(topics,"vol","topic")}<table class="wide"><thead><tr><th>Topic</th><th>12-market basket</th><th>Mapped supply</th><th>Median score</th></tr></thead><tbody>${topics.slice(0,7).map((x)=>`<tr><td>${esc(x.topic)}</td><td>${n(x.vol)}</td><td>${n(x.supply)}</td><td>${x.score.toFixed(1)}</td></tr>`).join("")}</tbody></table>`);
}

function playPage(label, title, topic, marketsWanted) {
  const rows = marketsWanted.map((m)=>opps.find((o)=>o.market===m && o.topic===topic)).filter(Boolean);
  page(title, `${label.toUpperCase()} PLAY`, `<div class="three"><div class="card"><b>Intent</b><p>${esc(rows[0]?.topQuery || topic)} and close variants, separated by service meaning.</p></div><div class="card"><b>Landing promise</b><p>Verified local providers, transparent filters, and factual treatment guidance.</p></div><div class="card"><b>Conversion</b><p>Provider detail view or outbound booking action, not raw page traffic.</p></div></div>${miniBars(rows,"queryBasketVolume","marketName")}<table class="wide"><thead><tr><th>Market</th><th>Basket</th><th>Top observed query</th><th>CPC</th><th>Supply</th></tr></thead><tbody>${rows.map((r)=>`<tr><td>${esc(r.marketName)}</td><td>${n(r.queryBasketVolume)}</td><td>${esc(r.topQuery)}</td><td>${money(r.weightedCpc)}</td><td>${n(r.treatmentLocations)}</td></tr>`).join("")}</tbody></table>`);
}

function recommendationPage(rec, index) {
  page(rec.title, `RECOMMENDATION ${index + 1} / 10`, `<div class="rec-head"><span>${rec.type}</span><b>${rec.markets}</b></div><div class="callout"><b>Why now:</b> ${rec.evidence}</div><div class="channel"><div><b>ADS</b><p>${rec.ads}</p></div><div><b>SEO</b><p>${rec.seo}</p></div><div><b>GEO</b><p>${rec.geo}</p></div></div><div class="metric"><b>Success measure</b><span>${rec.metric}</span></div>`);
}

function miniBars(rows, valueKey, labelKey) {
  const max=Math.max(1,...rows.map(r=>r[valueKey])); return `<div class="mini-bars">${rows.map(r=>`<div><span>${esc(r[labelKey])}</span><i><b style="width:${r[valueKey]/max*100}%"></b></i><em>${n(r[valueKey])}</em></div>`).join("")}</div>`;
}

function roadmap() {
  const tracks=[['Data and measurement',0,12],['DEXA launch',1,7],['Aesthetics tests',3,9],['SEO page expansion',0,12],['Hair restoration',4,11],['GEO / schema',0,8],['Scale decisions',9,12]];
  return `<div class="roadmap"><div class="weeks"><span>0</span><span>30</span><span>60</span><span>90 days</span></div>${tracks.map(([name,start,end],i)=>`<div><span>${name}</span><i><b style="left:${start/12*100}%;width:${(end-start)/12*100}%;background:${[C.green,C.rose,C.gold,C.blue][i%4]}"></b></i></div>`).join("")}</div>`;
}

function shortMarket(name) { return name.replace("Miami / South Florida","Miami").replace("Dallas / Fort Worth","Dallas").replace("Scottsdale / Phoenix","Scottsdale").replace("Denver / Boulder","Denver").replace("New York City","NYC"); }
function shortTopic(topic) { return topic.replace("Hyperbaric oxygen therapy","HBOT").replace("Medical weight loss","Weight loss").replace("Hormone optimization","Hormones").replace("Laser hair removal","Laser hair"); }
function median(values) { if (!values.length) return 0; const x=[...values].sort((a,b)=>a-b); return x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2; }

function styles() { return `
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #ddd8cf; color: ${C.ink}; font-family: Arial, Helvetica, sans-serif; }
  .page { width: 8.5in; height: 11in; padding: .48in .58in .52in; background: ${C.paper}; page-break-after: always; position: relative; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  header { display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #c9cec9; padding-bottom: 9px; margin-bottom: 24px; }
  .brand { font-weight: 800; letter-spacing: .18em; font-size: 11px; color:${C.green}; }
  .folio { font-size: 11px; color:${C.muted}; }
  .kicker, .eyebrow { color:${C.green}; font-weight:800; font-size:11px; letter-spacing:.16em; margin-bottom:7px; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 32px; line-height: 1.05; margin: 0 0 20px; letter-spacing:-.025em; }
  h2 { font-size: 14px; margin: 14px 0 9px; color:${C.green}; }
  p, li { font-size: 12.2px; line-height: 1.45; }
  .lead { font-family: Georgia, 'Times New Roman', serif; font-size: 19px; line-height: 1.38; margin: 0 0 24px; }
  .note { color:${C.muted}; font-size:10.5px; }
  footer { position:absolute; left:.58in; right:.58in; bottom:.27in; border-top:1px solid #d8ddd8; padding-top:7px; font-size:8.5px; color:${C.muted}; }
  .cover { background:${C.green}; color:white; padding:.7in; }
  .cover-mark { position:absolute; right:-.2in; top:-.65in; font: 700 610px/1 Georgia; color:#247c62; opacity:.75; }
  .cover-copy { position:absolute; left:.7in; top:2.2in; width:6.6in; z-index:2; }
  .cover .eyebrow { color:${C.lime}; }
  .cover h1 { font-size:66px; line-height:.92; letter-spacing:-.05em; }
  .dek { font: 20px/1.35 Georgia; width:5.3in; }
  .cover-meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:38px; }
  .cover-meta span { border:1px solid #79a894; border-radius:20px; padding:8px 12px; font-size:10px; }
  .cover-foot { position:absolute; left:.7in; bottom:.6in; color:#bad8ca; font-size:10px; }
  .big-number { font: 700 38px/1.1 Georgia; color:${C.green}; margin:14px 0; }
  .two,.three,.four { display:grid; gap:14px; }
  .two { grid-template-columns:1fr 1fr; } .three { grid-template-columns:repeat(3,1fr); } .four { grid-template-columns:repeat(4,1fr); }
  .card { background:${C.cream}; padding:16px; border-radius:10px; min-height:120px; }
  .card b { color:${C.green}; font-size:13px; }
  .callout { border-left:5px solid ${C.green}; background:#eef5f0; padding:15px 17px; margin:18px 0; font-size:12px; line-height:1.5; }
  .callout.warn { border-color:${C.rose}; background:#faeeeb; } .callout.good { border-color:${C.green}; }
  .metrics { margin:10px 0 20px; }
  .metrics div { border-top:4px solid ${C.green}; padding-top:9px; }
  .metrics b { display:block; font:700 24px Georgia; }
  .metrics span { color:${C.muted}; font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; }
  .steps { display:grid; grid-template-columns:repeat(5,1fr); gap:9px; margin-top:28px; }
  .steps div { background:${C.cream}; padding:11px; min-height:175px; }
  .steps span { display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:${C.green}; color:white; margin-bottom:12px; }
  .steps b { font-size:11px; } .steps p { font-size:9.5px; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th { text-align:left; color:${C.green}; border-bottom:2px solid ${C.green}; padding:7px 6px; }
  td { border-bottom:1px solid #d7ddd8; padding:7px 6px; vertical-align:top; }
  .wide { margin:12px 0; font-size:10.5px; }
  .wide td { padding:9px 7px; }
  .bars>div,.coverage>div,.stacked>div,.mini-bars>div { display:grid; grid-template-columns:145px 1fr 58px; gap:9px; align-items:center; margin:8px 0; font-size:9.5px; }
  .bars i,.coverage i,.mini-bars i { height:13px; background:#e8ebe7; display:block; border-radius:8px; overflow:hidden; }
  .bars b,.coverage b,.mini-bars b { display:block; height:100%; background:${C.green}; }
  .bars em,.coverage em,.mini-bars em,.stacked em { font-style:normal; text-align:right; color:${C.muted}; }
  .coverage>div { margin:5px 0; }.coverage i{height:9px}.coverage b{background:${C.green}}
  .stacked>div { grid-template-columns:115px 1fr 55px; margin:9px 0; }
  .stacked>div>i { display:flex; height:18px; border-radius:9px; overflow:hidden; background:#eee; }
  .stacked>div>i b { display:block; height:100%; }
  .legend { display:flex; gap:14px; flex-wrap:wrap; margin:14px 0; font-size:9px; }
  .legend span { display:flex; gap:5px; align-items:center; }.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;}
  .chart { width:100%; height:5.25in; margin-top:4px; overflow:visible; }
  .chart line { stroke:#9ca8a3; stroke-width:1; }.chart text{font:9px Arial;fill:${C.ink}}.chart .axis{font-size:10px;fill:${C.muted}}
  .small p { font-size:10.5px; }.small .callout{margin:8px 0;}
  .badge { display:inline-block; border-radius:15px; padding:5px 9px; background:#e4f2ea; color:${C.green}; font-size:9px; margin-bottom:10px; }.badge.warn{background:#fae4de;color:#8b4135}
  .mini-bars>div { grid-template-columns:130px 1fr 48px; margin:6px 0; }.mini-bars i{height:9px}.mini-bars span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rec-head { display:flex; justify-content:space-between; gap:20px; border-top:1px solid #ccd4cf; border-bottom:1px solid #ccd4cf; padding:10px 0; margin-bottom:18px; font-size:11px; }.rec-head span{color:${C.green};font-weight:bold}.rec-head b{text-align:right}
  .channel { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:18px; }.channel>div{background:${C.cream};padding:14px;min-height:210px;border-radius:8px}.channel b{color:${C.green};font-size:10px;letter-spacing:.12em}.channel p{font-size:10.5px;}
  .metric { display:flex; gap:15px; align-items:center; margin-top:16px; border-top:2px solid ${C.green}; padding-top:11px; font-size:10.5px;}.metric b{color:${C.green};min-width:100px}
  .roadmap { margin:22px 0 28px; }.roadmap>div{display:grid;grid-template-columns:145px 1fr;gap:10px;align-items:center;margin:10px 0;font-size:10px}.roadmap .weeks{grid-template-columns:145px repeat(4,1fr);color:${C.muted};}.roadmap i{height:18px;background:repeating-linear-gradient(to right,#edf0ed 0,#edf0ed calc(25% - 1px),#cfd6d2 25%);position:relative}.roadmap b{position:absolute;top:2px;height:14px;border-radius:8px}
  .funnel { display:flex; flex-direction:column; align-items:center; gap:6px; margin:25px 0; }.funnel div{height:52px;background:${C.green};color:white;padding:10px 18px;display:flex;justify-content:space-between;align-items:center}.funnel div:nth-child(1){width:100%}.funnel div:nth-child(2){width:82%;background:#39816b}.funnel div:nth-child(3){width:64%;background:#689b8a}.funnel div:nth-child(4){width:46%;background:#91b5a7}.funnel span{font-size:10px}
  .sources p { margin:6px 0; font-size:10.5px; overflow-wrap:anywhere; }.sources a{color:${C.green}}
  ol,ul { padding-left:19px; }
  `; }
