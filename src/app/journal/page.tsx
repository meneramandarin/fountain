import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { editorialArticles, editorialArticlePath } from "@/lib/editorial-articles";
import { ogImage, siteDescription, siteName } from "@/lib/site";

const CONTENT_ROOT = path.join(process.cwd(), "src/content/editorial");
const journalTitle = `Fountain Journal | ${siteName}`;

export const metadata: Metadata = {
  title: { absolute: journalTitle },
  description: siteDescription,
  alternates: {
    canonical: "/journal",
  },
  openGraph: {
    type: "website",
    url: "/journal",
    siteName,
    title: journalTitle,
    description: siteDescription,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: journalTitle,
    description: siteDescription,
    images: [ogImage.url],
  },
};

function excerptFromHtml(source: string, wordLimit = 50) {
  const plainText = source
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
  const words = plainText.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, wordLimit).join(" ");
  return words.length > wordLimit ? `${excerpt}…` : excerpt;
}

async function getFeaturedExcerpt(bodySource: string) {
  try {
    const file = await readFile(path.join(CONTENT_ROOT, bodySource), "utf8");
    return excerptFromHtml(file, 50);
  } catch (error) {
    console.error("[blog] failed reading featured post body", error);
    return "";
  }
}

export default async function BlogPage() {
  const sortedArticles = [...editorialArticles].sort((a, b) => {
    const left = new Date(b.updated || b.published || "2000-01-01").getTime();
    const right = new Date(a.updated || a.published || "2000-01-01").getTime();
    return left - right;
  });
  const [featured, ...otherArticles] = sortedArticles;
const featuredExcerpt = featured ? await getFeaturedExcerpt(featured.bodySource) : "";

  return (
    <main className="editorial-page blog-page">
      <LandingScrollHeader alwaysVisible />

      <section className="blog-journal-hero">
        <div className="wrap">
          <header className="blog-journal-masthead">
            <span className="blog-journal-eyebrow">Fountain Journal</span>
            <h1>On the pursuit of a longer life</h1>
            <p>Ideas, evidence, and dispatches from the evolving world of longevity care.</p>
          </header>
          {featured ? (
            <Link href={editorialArticlePath(featured.slug)} className="blog-journal-feature-link">
              <article className="blog-journal-feature">
                <div className="blog-journal-feature-copy">
                  <span className="blog-journal-feature-label">Featured story</span>
                  <h2>{featured.title}</h2>
                  <p>{featuredExcerpt || featured.standfirst}</p>
                  <span className="blog-journal-cta">Read the story <span aria-hidden="true">→</span></span>
                </div>
                <div className="blog-journal-feature-image">
                  <Image src={featured.heroImage} alt="" fill priority quality={100} unoptimized sizes="(max-width: 760px) 82vw, 360px" />
                </div>
              </article>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="wrap blog-journal-index">
        <header className="blog-journal-index-header">
          <span>Browse the journal</span>
          <h2>Latest stories</h2>
        </header>
        <ul className="blog-journal-grid">
          {otherArticles.map((article) => (
            <li key={article.slug}>
              <Link href={editorialArticlePath(article.slug)}>
                <span className="blog-journal-card-image">
                  <Image
                    src={article.heroImage}
                    alt=""
                    fill
                    quality={100}
                    unoptimized
                    sizes="(max-width: 640px) 88vw, (max-width: 900px) 44vw, 390px"
                  />
                </span>
                <span className="blog-journal-card-copy">
                  <strong>{article.title}</strong>
                  <p>{article.standfirst}</p>
                  <span className="blog-journal-card-cta">Read article <span aria-hidden="true">→</span></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <LandingFooter />
    </main>
  );
}
