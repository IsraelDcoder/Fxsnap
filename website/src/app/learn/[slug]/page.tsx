import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createMetadata } from "@/lib/metadata";
import { articles, getArticle } from "@/lib/articles";
import { ArticleStructuredData, PageStructuredData } from "@/components/structured-data";

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return createMetadata({
    title: article.title,
    description: article.description,
    path: `/learn/${article.slug}`,
    robots: { index: false, follow: true },
  });
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <article>
      <PageStructuredData
        description={article.description}
        path={`/learn/${article.slug}`}
        title={article.title}
      />
      <ArticleStructuredData
        author={article.author}
        description={article.description}
        path={`/learn/${article.slug}`}
        title={article.title}
      />
      <header className="page-hero">
        <div className="container article-container">
          <Link className="article-back" href="/learn">
            <ArrowLeft aria-hidden="true" size={14} /> Learning centre
          </Link>
          <p className="eyebrow">{article.category}</p>
          <h1>{article.title}</h1>
          <p>{article.description}</p>
          <div className="article-meta">By {article.author} · Educational draft · Editorial review pending</div>
        </div>
      </header>
      <div className="container article-body">
        <p className="article-lede">{article.answer}</p>
        {article.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        <div className="article-disclaimer">
          This material is for general educational purposes, not personalised
          financial advice or a recommendation to trade. Forex trading carries
          substantial risk; verify information and make your own decisions.
        </div>
        <Link className="inline-link" href="/risk-reward-calculator">
          Try the risk-to-reward calculator <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </div>
    </article>
  );
}
