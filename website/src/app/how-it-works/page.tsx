import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createMetadata } from "@/lib/metadata";
import { MotionDownloadLink } from "@/components/motion-download-link";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "How FXSnap Works | AI Chart Analysis",
  description:
    "Learn how FXSnap analyses uploaded forex chart screenshots, what the results can include and what to verify yourself.",
  path: "/how-it-works",
});

const steps = [
  {
    title: "Upload a chart screenshot",
    text: "Choose a chart image from your device. Image clarity matters: instrument labels, price scale, candles and timeframe may be difficult to read in a cropped or low-resolution screenshot.",
  },
  {
    title: "AI reviews what is visible",
    text: "FXSnap sends the image for AI-powered analysis and returns a structured explanation. The selected instrument is a hint; the submitted image is the evidence source.",
  },
  {
    title: "Inspect observations and uncertainty",
    text: "Depending on what the image supports, the result can describe direction, structure, candidate levels and risk-to-reward. Missing or conflicting evidence can result in a no-trade assessment.",
  },
  {
    title: "Verify and decide for yourself",
    text: "Screenshot-derived prices are not verified live quotes. Check the analysis against your current chart and plan, manage risk independently and make your own decision.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">A chart-first workflow</p>
          <h1>From a screenshot to a structured market read.</h1>
          <p>
            FXSnap helps interpret the technical information visible in a
            trading-chart image. It does not have a guaranteed view of current
            market conditions.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container">
          <div className="step-grid">
            {steps.map((step, index) => (
              <article className="step-card" key={step.title}>
                <span>STEP {String(index + 1).padStart(2, "0")}</span>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
          <div className="text-callout">
            <h2>What happens when the chart is unclear?</h2>
            <p>
              The analysis may identify limitations or return a no-trade
              assessment when details are missing, unreadable or conflicting.
              FXSnap should not invent price levels to make an incomplete chart
              seem actionable.
            </p>
            <Link className="inline-link" href="/disclaimer">
              Read the financial disclaimer <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>
          <p className="page-cta">
            <MotionDownloadLink className="button button-lime" href={siteConfig.googlePlayUrl}>
              Get FXSnap <ArrowRight aria-hidden="true" size={15} />
            </MotionDownloadLink>
          </p>
        </div>
      </section>
    </>
  );
}
