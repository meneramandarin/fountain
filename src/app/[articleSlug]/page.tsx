import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorialArticlePage } from "@/components/editorial-article-page";
import { editorialArticles, getEditorialArticle } from "@/lib/editorial-articles";
import { siteName } from "@/lib/site";

type ArticleRouteProps = {
  params: Promise<{
    articleSlug: string;
  }>;
};

export function generateStaticParams() {
  return editorialArticles.map((article) => ({
    articleSlug: article.slug,
  }));
}

export async function generateMetadata({ params }: ArticleRouteProps): Promise<Metadata> {
  const { articleSlug } = await params;
  const article = getEditorialArticle(articleSlug);

  if (!article) {
    return {};
  }

  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: `/${article.slug}`,
    },
    openGraph: {
      type: "article",
      siteName,
      title: article.title,
      description: article.description,
      publishedTime: article.published ?? article.updated,
      modifiedTime: article.updated,
      url: `/${article.slug}`,
    },
  };
}

export default async function ArticleRoute({ params }: ArticleRouteProps) {
  const { articleSlug } = await params;
  const article = getEditorialArticle(articleSlug);

  if (!article) {
    notFound();
  }

  return <EditorialArticlePage article={article} />;
}
