import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createMetadata } from "@/lib/metadata";
import { productPages } from "@/lib/product-pages";
import { PageStructuredData } from "@/components/structured-data";

export function generateStaticParams() {
  return productPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = productPages.find((item) => item.slug === slug);
  if (!page) return {};
  return createMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
  });
}

export default async function ProductLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = productPages.find((item) => item.slug === slug);
  if (!page) notFound();

  return (
    <>
      <PageStructuredData
        description={page.description}
        path={`/${page.slug}`}
        title={page.title}
      />
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">FXSnap · Chart analysis</p>
          <h1>{page.heading}</h1>
          <p>{page.intro}</p>
        </div>
      </header>
      <section className="section">
        <div className="container product-copy">
          {page.sections.map((section, index) => (
            <section className="product-copy-section" key={section.heading}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{section.heading}</h2>
                <p>{section.body}</p>
              </div>
            </section>
          ))}
          <div className="product-related">
            <p className="eyebrow">Continue exploring</p>
            {page.related.map((link) => (
              <Link className="inline-link" href={link.href} key={link.href}>
                {link.label} <ArrowRight aria-hidden="true" size={15} />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
