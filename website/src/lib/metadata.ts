import type { Metadata } from "next";
import { siteConfig } from "./site";

export function createMetadata({
  title,
  description,
  path = "",
  robots,
}: {
  title: string;
  description: string;
  path?: string;
  robots?: Metadata["robots"];
}): Metadata {
  const canonical = `${siteConfig.url}${path}`;
  return {
    title: { absolute: `${title} | FXSnap` },
    description,
    robots,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: siteConfig.name,
      title,
      description,
      images: [{ url: "/images/fxsnap-icon.png", width: 1024, height: 1024, alt: "FXSnap logo" }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/images/fxsnap-icon.png"],
    },
  };
}
