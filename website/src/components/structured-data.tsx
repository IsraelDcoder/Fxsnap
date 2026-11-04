import { siteConfig } from "@/lib/site";

type PageSchemaProps = {
  title: string;
  description: string;
  path: string;
  type?: "WebPage" | "ContactPage";
};

function JsonLd({ value }: { value: Record<string, unknown> }) {
  const json = JSON.stringify(value).replace(/</g, "\\u003c");
  return (
    <script
      dangerouslySetInnerHTML={{ __html: json }}
      type="application/ld+json"
    />
  );
}

export function SiteStructuredData() {
  return (
    <>
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: siteConfig.name,
          url: siteConfig.url,
          logo: `${siteConfig.url}/images/fxsnap-icon.png`,
        }}
      />
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: siteConfig.url,
          description: siteConfig.description,
          inLanguage: "en",
        }}
      />
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: siteConfig.name,
          description: siteConfig.description,
          url: siteConfig.url,
          operatingSystem: ["Android", "iOS"],
          downloadUrl: siteConfig.googlePlayUrl,
        }}
      />
    </>
  );
}

export function PageStructuredData({
  title,
  description,
  path,
  type = "WebPage",
}: PageSchemaProps) {
  const pageUrl = `${siteConfig.url}${path}`;
  return (
    <>
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": type,
          name: title,
          description,
          url: pageUrl,
          isPartOf: { "@type": "WebSite", url: siteConfig.url },
        }}
      />
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: siteConfig.url,
            },
            { "@type": "ListItem", position: 2, name: title, item: pageUrl },
          ],
        }}
      />
    </>
  );
}

export function ArticleStructuredData({
  title,
  description,
  path,
  author,
}: PageSchemaProps & { author: string }) {
  return (
    <JsonLd
      value={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        mainEntityOfPage: `${siteConfig.url}${path}`,
        author: { "@type": "Person", name: author },
        publisher: {
          "@type": "Organization",
          name: siteConfig.name,
          url: siteConfig.url,
        },
      }}
    />
  );
}
