import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "About FXSnap",
  description:
    "Learn about FXSnap, an AI-powered forex chart analysis application built to help traders interpret uploaded chart screenshots.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">About FXSnap</p>
          <h1>Technology for a more thoughtful chart review.</h1>
          <p>
            FXSnap is an AI-powered forex chart analysis application that helps
            traders interpret uploaded trading-chart screenshots and explore
            potential technical setups.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container split-section">
          <div>
            <p className="eyebrow">Our approach</p>
            <h2 style={{ margin: 0, fontSize: "clamp(34px, 4vw, 48px)", fontWeight: 560, letterSpacing: "-.065em", lineHeight: 1.08 }}>
              Explain the evidence. Respect its limits.
            </h2>
          </div>
          <div className="disclaimer-copy">
            <p>
              FXSnap analyses chart images supplied by users. Its AI-generated
              observations may include visible instrument and timeframe details,
              price action, market structure and candidate technical levels
              when the image supports them.
            </p>
            <p>
              An unclear or incomplete image can limit the analysis. FXSnap is
              designed to communicate uncertainty rather than inventing chart
              details. Screenshot-derived prices are not verified live quotes.
            </p>
            <p>
              FXSnap is an analysis tool—not a broker, signal service or
              financial adviser. Users remain responsible for verifying
              information, managing risk and making their own decisions.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
