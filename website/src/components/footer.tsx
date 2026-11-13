import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";
import { MotionDownloadLink } from "./motion-download-link";
import { siteConfig } from "@/lib/site";

const footerLinks = [
  { label: "About FXSnap", href: "/about" },
  { label: "Features", href: "/features" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Learning centre", href: "/learn" },
  { label: "Risk-to-reward calculator", href: "/risk-reward-calculator" },
  { label: "Contact", href: "/contact" },
  { label: "Delete account", href: "/delete-account" },
  { label: "Financial disclaimer", href: "/disclaimer" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "Support", href: "/support" },
  { label: "Terms of use", href: "/terms" },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div className="footer-brand">
            <Brand />
            <p>Clearer chart context. More informed decisions.</p>
            <MotionDownloadLink className="footer-download" href={siteConfig.googlePlayUrl}>
              Get FXSnap on Google Play <ArrowUpRight aria-hidden="true" size={15} />
            </MotionDownloadLink>
          </div>
          <nav aria-label="Footer navigation" className="footer-links">
            {footerLinks.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} FXSnap</span>
          <span>AI-assisted analysis is educational and is not financial advice.</span>
          <span>FXSnap is not a broker or signal service.</span>
        </div>
      </div>
    </footer>
  );
}
