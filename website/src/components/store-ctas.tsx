import Link from "next/link";
import { Apple, Play } from "lucide-react";
import { siteConfig } from "@/lib/site";

export function StoreCtas({
  compact = false,
  platform = "all",
}: {
  compact?: boolean;
  platform?: "all" | "android" | "ios";
}) {
  return (
    <div aria-label="Get the FXSnap app" className={`store-ctas${compact ? " store-ctas-compact" : ""}`}>
      {(platform === "all" || platform === "android") && (
        <a
          aria-label="Get FXSnap on Google Play"
          className="store-badge"
          href={siteConfig.googlePlayUrl}
          rel="noreferrer"
          target="_blank"
        >
          <Play aria-hidden="true" className="store-badge-icon" fill="currentColor" size={compact ? 21 : 25} />
          <span>
            <span className="store-badge-caption">GET IT ON</span>
            <span className="store-badge-name">Google Play</span>
          </span>
        </a>
      )}
      {(platform === "all" || platform === "ios") && (
        <Link
          aria-label="Learn about FXSnap on the App Store"
          className="store-badge store-badge-ios"
          href="/download#ios"
        >
          <Apple aria-hidden="true" className="store-badge-icon" size={compact ? 22 : 26} />
          <span>
            <span className="store-badge-caption">AVAILABLE ON</span>
            <span className="store-badge-name">App Store</span>
          </span>
        </Link>
      )}
    </div>
  );
}
