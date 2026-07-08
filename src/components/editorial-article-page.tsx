import { readFile } from "node:fs/promises";
import path from "node:path";
import Image from "next/image";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import type { DirectoryLocationCardData } from "@/components/directory-location-card";
import { EditorialProviderRail } from "@/components/editorial-provider-rail";
import { EditorialShareButton } from "@/components/editorial-share-button";
import { MenopauseDelayCalculator } from "@/components/menopause-delay-calculator";
import type { EditorialArticle } from "@/lib/editorial-articles";
import { searchLocations } from "@/lib/queries";
import { siteUrl } from "@/lib/site";

const CONTENT_ROOT = path.join(process.cwd(), "src/content/editorial");
const MENOPAUSE_DELAY_CALCULATOR_TOKEN = "{{menopause-delay-calculator}}";
const ARTICLE_COMPONENT_TOKEN = /{{(menopause-delay-calculator|provider-rail:([a-z0-9-]+))}}/g;

function prioritizeTreatments(card: DirectoryLocationCardData, treatmentNames: string[] = []) {
  if (!treatmentNames.length || !card.treatments?.length) {
    return card;
  }

  const preferred = new Set(treatmentNames.map((name) => name.toLowerCase()));
  return {
    ...card,
    treatments: [...card.treatments].sort((a, b) => {
      const aPreferred = preferred.has(a.name.toLowerCase());
      const bPreferred = preferred.has(b.name.toLowerCase());

      if (aPreferred === bPreferred) {
        return 0;
      }

      return aPreferred ? -1 : 1;
    }),
  };
}

async function loadArticleBodyHtml(source: string) {
  const file = await readFile(path.join(CONTENT_ROOT, source), "utf8");
  return file.replaceAll(' target="_blank"', ' target="_blank" rel="noopener noreferrer"');
}

function renderHtml(html: string, key: string) {
  return <div key={key} dangerouslySetInnerHTML={{ __html: html }} />;
}

type DynamicRailCards = Record<string, DirectoryLocationCardData[]>;

async function loadDynamicRailCards(article: EditorialArticle): Promise<DynamicRailCards> {
  const railEntries = Object.entries(article.providerRails || {}).filter(
    ([, rail]) => rail.dynamicTreatmentId || rail.dynamicTreatmentIds?.length || rail.dynamicSearchQuery,
  );
  const resolved = await Promise.all(
    railEntries.map(async ([id, rail]) => {
      const treatmentIds = [...(rail.dynamicTreatmentIds || []), ...(rail.dynamicTreatmentId ? [rail.dynamicTreatmentId] : [])];
      const payload = await searchLocations(
        {
          kind: "locations",
          q: rail.dynamicSearchQuery,
          treatment_ids: treatmentIds,
        },
        0,
      );
      const cards = (payload.results.slice(0, 4) as DirectoryLocationCardData[]).map((card) =>
        prioritizeTreatments(card, rail.dynamicTreatmentNames),
      );
      return [id, cards] as const;
    }),
  );

  return Object.fromEntries(resolved);
}

function renderArticleBody(article: EditorialArticle, bodyHtml: string, dynamicRailCards: DynamicRailCards) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ARTICLE_COMPONENT_TOKEN.exec(bodyHtml)) !== null) {
    nodes.push(renderHtml(bodyHtml.slice(lastIndex, match.index), `article-html-${nodes.length}`));

    if (match[1] === MENOPAUSE_DELAY_CALCULATOR_TOKEN.slice(2, -2)) {
      nodes.push(<MenopauseDelayCalculator key={`article-component-${nodes.length}`} />);
    } else if (match[2]) {
      const rail = article.providerRails?.[match[2]];

      if (!rail) {
        throw new Error(`Missing provider rail "${match[2]}" for article ${article.slug}`);
      }

      nodes.push(
        <EditorialProviderRail
          directoryCards={dynamicRailCards[match[2]]}
          key={`article-component-${nodes.length}`}
          rail={rail}
        />,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  nodes.push(renderHtml(bodyHtml.slice(lastIndex), `article-html-${nodes.length}`));

  return nodes;
}

export async function EditorialArticlePage({ article }: { article: EditorialArticle }) {
  const [bodyHtml, dynamicRailCards] = await Promise.all([
    loadArticleBodyHtml(article.bodySource),
    loadDynamicRailCards(article),
  ]);
  const articleUrl = new URL(`/${article.slug}`, siteUrl).toString();

  return (
    <main className="editorial-page">
      <LandingScrollHeader alwaysVisible />

      <div className="wrap">
        <h1>{article.title}</h1>
        <p className="standfirst">{article.standfirst}</p>
        <div className="article-hero-image">
          <Image
            src={article.heroImage}
            alt=""
            fill
            priority
            sizes="(max-width: 760px) calc(100vw - 52px), 680px"
          />
        </div>
        <div className="dateline">
          <span>
            By <b>{article.byline}</b>
          </span>
          <span>
            <b>{article.updatedLabel}</b>
          </span>
          <EditorialShareButton title={article.title} url={articleUrl} />
        </div>
      </div>

      <div className="wrap">
        <article>{renderArticleBody(article, bodyHtml, dynamicRailCards)}</article>
      </div>

      <LandingFooter />
    </main>
  );
}
