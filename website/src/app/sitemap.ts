import type { MetadataRoute } from "next";
import { productPages } from "@/lib/product-pages";
import { siteConfig } from "@/lib/site";

const staticPaths = [
  "",
  "/about",
  "/features",
  "/how-it-works",
  "/pricing",
  "/download",
  "/contact",
  "/delete-account",
  "/learn",
  "/risk-reward-calculator",
  "/disclaimer",
  "/support",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = staticPaths.map((path) => ({
    url: `${siteConfig.url}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
  }));
  const productLandingPages = productPages.map((page) => ({
    url: `${siteConfig.url}/${page.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
  }));
  return [...pages, ...productLandingPages];
}
