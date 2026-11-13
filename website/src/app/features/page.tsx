import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "FXSnap Features | AI Forex Chart Analysis",
  description:
    "Explore FXSnap's screenshot-based forex chart analysis, technical context, candidate levels and learning tools.",
  path: "/features",
});

const features = [
  ["Screenshot-based analysis", "Submit a chart image for an AI-generated explanation grounded in what can be seen. A selected instrument is only a hint; the screenshot remains the source of evidence."],
  ["Market structure and bias", "Review the analysis of visible price action, trend and structure. These observations can be uncertain, especially when chart details are small or obscured."],
  ["Candidate technical levels", "When the chart supports them, analysis may include a potential entry area, invalidation level and target levels. They are possibilities to review, not instructions."],
  ["Risk-to-reward context", "Where entry, stop and target values are sufficiently clear, the app can show a calculated risk-to-reward relationship. The ratio does not predict whether a trade will succeed."],
  ["Multi-timeframe review", "The app includes a Multi-Timeframe analysis flow for an H4 context chart and an M15 entry chart. Both images need readable evidence; labels alone do not confirm alignment."],
  ["Learning and planning tools", "Continue your routine with learning resources, saved work and trading-planning tools available in the app. Availability can depend on account and subscription access."],
];

export default function FeaturesPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Product · FXSnap</p>
          <h1>Chart analysis that shows its working—and its limits.</h1>
          <p>
            FXSnap is an AI-powered forex chart analysis application. Explore
            the available capabilities and how to use them as part of your own
            review.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container">
          <SectionHeading eyebrow="What you can explore" title="Tools for a more structured chart review." />
          <div className="feature-grid">
            {features.map(([title, description], index) => (
              <article className="feature-card" key={title}>
                <span className="feature-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <div className="content-link-row">
            <Link className="inline-link" href="/how-it-works">
              See how analysis works <ArrowRight aria-hidden="true" size={15} />
            </Link>
            <Link className="inline-link" href="/risk-reward-calculator">
              Try the risk-to-reward calculator <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
