import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { editorialArticles, editorialArticlePath } from "@/lib/editorial-articles";
import { siteDescription, siteName } from "@/lib/site";

const CONTENT_ROOT = path.join(process.cwd(), "src/content/editorial");

export const metadata: Metadata = {
  title: `Editorial Blog | ${siteName}`,
  description: siteDescription,
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

      <section className="blog-hero">
        <div className="wrap">
          {featured ? (
            <Link href={editorialArticlePath(featured.slug)} className="blog-featured-link">
              <article className="blog-featured-card">
                <div className="blog-featured-visual">
                  <Image src={featured.heroImage} alt="" fill priority sizes="(min-width: 1000px) 760px, 95vw" />
                  <h1 className="blog-featured-title">{featured.title}</h1>
                </div>
                <p className="blog-featured-excerpt">{featuredExcerpt || featured.standfirst}</p>
                <span className="blog-featured-cta">READ ARTICLE</span>
              </article>
            </Link>
          ) : null}
        </div>
      </section>

      <div className="wrap">
        <h2 className="blog-list-heading">All Posts</h2>
        <p className="standfirst">Editorial coverage of treatments, clinics, and longevity care.</p>
        <ul className="blog-post-list">
          {otherArticles.map((article) => (
            <li key={article.slug}>
              <Link href={editorialArticlePath(article.slug)}>
                <strong>{article.title}</strong>
                <p>{article.standfirst}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <LandingFooter />
    </main>
  );
}
