import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
import { Brand } from "./brand";
import { MotionDownloadLink } from "./motion-download-link";
import { navigation, siteConfig } from "@/lib/site";

export function Navigation() {
  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Brand />
        <nav aria-label="Main navigation" className="desktop-nav">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <MotionDownloadLink className="button button-small button-lime nav-cta" href={siteConfig.googlePlayUrl}>
          Get the app <ArrowUpRight aria-hidden="true" size={15} />
        </MotionDownloadLink>
        <details className="mobile-menu">
          <summary aria-label="Open navigation menu">
            <Menu aria-hidden="true" size={21} />
          </summary>
          <nav aria-label="Mobile navigation">
            {navigation.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
            <Link href={siteConfig.googlePlayUrl} rel="noreferrer" target="_blank">
              Get the app
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
