import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Financial Disclaimer",
  description:
    "Understand the limitations of FXSnap's AI-assisted chart analysis and the risks of forex trading.",
  path: "/disclaimer",
});

export default function DisclaimerPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Important information</p>
          <h1>Financial disclaimer</h1>
          <p>Read how to interpret FXSnap’s AI-assisted analysis and educational content.</p>
        </div>
      </header>
      <section className="section">
        <div className="container disclaimer-copy">
          <p>
            FXSnap provides AI-assisted technical chart analysis and general
            educational information. It is not a broker, investment adviser or
            financial adviser, and it does not provide personalised investment
            advice or a guarantee of market outcomes.
          </p>
          <h2>AI analysis can be wrong</h2>
          <p>
            Analysis is based on information visible in the chart image
            submitted by the user. Image-derived prices are not independently
            verified live quotes. AI output may be inaccurate, incomplete,
            outdated or unsuitable for a particular situation. Check all
            observations and levels against reliable, current information.
          </p>
          <h2>Trading involves risk</h2>
          <p>
            Forex and other financial trading involve substantial risk and may
            not be appropriate for everyone. You can lose some or all of your
            invested capital. Consider your circumstances and seek independent
            professional advice if needed.
          </p>
          <h2>You make the decisions</h2>
          <p>
            Any direction, setup status, entry, stop, target or risk-to-reward
            estimate is informational only, not an instruction or
            recommendation to open, maintain or close a position. Users are
            responsible for verifying information, managing risk and making
            their own decisions.
          </p>
        </div>
      </section>
    </>
  );
}
