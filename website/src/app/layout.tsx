import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";
import { SiteStructuredData } from "@/components/structured-data";
import { siteConfig } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "FXSnap | AI Chart Analysis & Trader Community",
    template: "%s | FXSnap",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: "FXSnap | AI Chart Analysis & Trader Community",
    description: siteConfig.description,
    url: siteConfig.url,
    images: [{ url: "/images/fxsnap-icon.png", width: 1024, height: 1024, alt: "FXSnap logo" }],
  },
  twitter: {
    card: "summary",
    title: "FXSnap | AI Chart Analysis & Trader Community",
    description: siteConfig.description,
    images: ["/images/fxsnap-icon.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inter.variable} lang="en">
      <body>
        <SiteStructuredData />
        <Navigation />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
