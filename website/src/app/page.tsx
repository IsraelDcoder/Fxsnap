import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, MoveUpRight } from "lucide-react";
import { CinematicHero } from "@/components/cinematic-hero";
import { ScrollReveal } from "@/components/scroll-reveal";
import { createMetadata } from "@/lib/metadata";
import { PageStructuredData } from "@/components/structured-data";
import { StoreCtas } from "@/components/store-ctas";

export const metadata = createMetadata({
  title: "AI Chart Analysis & Trader Community",
  description:
    "Drop a chart. Get a structured AI trading setup, then take your analysis to the FXSnap trader community.",
  path: "/",
});

const receipts = [
  ["XAU/USD", "+180 pips"],
  ["EUR/USD", "+42 pips"],
  ["NAS100", "+68 pts"],
  ["GBP/USD", "+35 pips"],
  ["BTC/USD", "+1.9%"],
  ["US30", "+120 pts"],
  ["USD/JPY", "+28 pips"],
  ["V75", "+2,400 pts"],
];

const appScreens = [
  {
    src: "/images/fxsnap-home-screen.webp",
    alt: "FXSnap app home screen with market sessions and trading workspace",
    label: "Your trading workspace",
    detail: "Tools and market context, together.",
    width: 561,
    height: 1280,
  },
  {
    src: "/images/fxsnap-chart-analysis-screen.webp",
    alt: "FXSnap app chart analysis screen for uploading a chart and choosing timeframes",
    label: "Start with your chart",
    detail: "Bring a screenshot from your charting app.",
    width: 720,
    height: 1640,
  },
  {
    src: "/images/fxsnap-analysis-history-screen.webp",
    alt: "FXSnap app analysis history with saved chart reviews",
    label: "Keep your analysis close",
    detail: "Return to saved chart reviews.",
    width: 720,
    height: 1640,
  },
];

const processSteps = [
  {
    number: "01",
    title: "Screenshot your chart",
    text: "Any broker, any chart. Add a 4H and 15M view, then an optional timeframe for more context.",
  },
  {
    number: "02",
    title: "Get a checked setup",
    text: "Review entry, stop loss, take profit and risk:reward—or a clear no-setup explanation with levels to watch.",
  },
  {
    number: "03",
    title: "Share it with the community",
    text: "Post your read for the community. If you share the outcome, the original call stays in view.",
  },
];

export default function HomePage() {
  return (
    <>
      <PageStructuredData
        description="Drop a chart. Get a structured AI trading setup, then take your analysis to the FXSnap trader community."
        path="/"
        title="AI Chart Analysis & Trader Community"
      />
      <CinematicHero />

      <div aria-label="FXSnap at a glance" className="proof-strip">
        <div className="container proof-strip-inner">
          <div className="proof-stat"><strong>10,000+</strong><span>FXSnap users</span></div>
          <span aria-hidden="true" className="proof-divider" />
          <div className="proof-stat"><strong>3</strong><span>timeframes in one read</span></div>
          <span aria-hidden="true" className="proof-divider" />
          <div className="proof-stat"><strong>Entry · SL · TP</strong><span>with risk:reward</span></div>
          <p>Analysis is based on your screenshot—not a live market feed.</p>
        </div>
      </div>

      <ScrollReveal>
        <section aria-labelledby="app-preview-title" className="app-preview-section">
          <div className="container">
            <div className="app-preview-heading">
              <div>
                <p className="eyebrow">Inside FXSnap</p>
                <h2 id="app-preview-title">Your chart workflow,<br />right in the app.</h2>
              </div>
              <p>From opening your workspace to reviewing chart analysis and saved history, take a look around the real FXSnap app.</p>
            </div>
            <div className="app-preview-grid">
              {appScreens.map((screen, index) => (
                <figure className={`app-preview-card app-preview-card-${index + 1}`} key={screen.src}>
                  <div className="app-preview-topline"><span>FXSNAP APP</span><span>0{index + 1} / 03</span></div>
                  <div className="app-preview-device">
                    <Image
                      alt={screen.alt}
                      className="app-preview-image"
                      height={screen.height}
                      sizes="(max-width: 620px) 68vw, (max-width: 820px) 42vw, 25vw"
                      src={screen.src}
                      width={screen.width}
                    />
                  </div>
                  <figcaption><strong>{screen.label}</strong><span>{screen.detail}</span></figcaption>
                </figure>
              ))}
            </div>
            <p className="app-preview-note">App screenshots are examples provided for this product preview. Visible values do not represent typical results or promise future performance.</p>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="section" id="analysis">
          <div className="container">
            <div className="showcase-heading">
              <p className="eyebrow">The analysis</p>
              <h2>Built to be right,<br /><span>not just fast.</span></h2>
              <p className="section-description">
                Every FXSnap setup is checked against the chart before it reaches
                you. If the evidence is unclear or the levels do not add up, the
                analysis should tell you—not make something up.
              </p>
            </div>
            <div className="analysis-grid">
              <article className="validation-card">
                <div className="validation-card-header">
                  <span className="validation-icon"><Check aria-hidden="true" size={16} /></span>
                  <div><span>SETUP VALIDATION</span><strong>Levels make sense together</strong></div>
                  <span className="validation-state">CHECKED</span>
                </div>
                <div className="validation-row"><span>Chart symbol</span><strong>XAU/USD <i>Read from screenshot</i></strong></div>
                <div className="validation-row"><span>Entry and stop</span><strong>Stop below entry <i>For this buy setup</i></strong></div>
                <div className="validation-row"><span>Target placement</span><strong>Target beyond entry <i>For this buy setup</i></strong></div>
                <div className="validation-row"><span>Risk : reward</span><strong>1 : 2.0 <i>Recalculated from levels</i></strong></div>
                <p className="validation-caption">A consistency check—not a promise that a setup will win.</p>
              </article>
              <div className="analysis-copy">
                <article>
                  <span className="analysis-number">01</span>
                  <div><h3>Every setup, double-checked</h3><p>Entry, stop and target are checked for consistency. Anything that does not fit the rules is revised or returned for another read.</p></div>
                </article>
                <article>
                  <span className="analysis-number">02</span>
                  <div><h3>No clean setup? We’ll say so.</h3><p>No forced trades. Get the reason, plus possible levels to watch if the chart supports them.</p></div>
                </article>
                <article>
                  <span className="analysis-number">03</span>
                  <div><h3>Wrong chart? We’ll flag it.</h3><p>FXSnap compares the selected pair with the symbol it can read in your screenshot, so you can review a mismatch before continuing.</p></div>
                </article>
                <article>
                  <span className="analysis-number">04</span>
                  <div><h3>Up to three timeframes</h3><p>Pair a 4H structure chart with a 15M entry view, then add an optional timeframe from 1M to Weekly for broader context.</p></div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="section section-muted community-section" id="community">
          <div className="container">
            <div className="community-intro">
              <div>
                <p className="eyebrow">The trader community</p>
                <h2>Have an opinion.<br /><span>Make the call. Prove it.</span></h2>
              </div>
              <p className="section-description">
                Share your take on the market, post a setup straight from your
                analysis, predict the news and let your calls build your name.
              </p>
            </div>
            <div className="townhall-grid">
              <article aria-label="Example community news poll" className="townhall-card townhall-poll">
                <div className="townhall-card-head"><span className="townhall-kicker"><i /> NEWS PULSE</span><span>US CPI · EXAMPLE</span></div>
                <h3>Make your call before the number drops.</h3>
                <div className="poll-row"><span>Long</span><strong>62%</strong><i style={{ width: "62%" }} /></div>
                <div className="poll-row"><span>Short</span><strong>31%</strong><i style={{ width: "31%" }} /></div>
                <div className="poll-row"><span>Sit out</span><strong>7%</strong><i style={{ width: "7%" }} /></div>
                <p className="townhall-footnote">Example poll layout · community sentiment is not a forecast.</p>
              </article>
              <article aria-label="Illustrative community post" className="townhall-card townhall-post">
                <div className="post-user"><span className="post-avatar">A</span><div><strong>Amara K.</strong><span>Illustrative post · Community</span></div><MoveUpRight aria-hidden="true" size={15} /></div>
                <p className="post-copy">TP HIT 😮‍💨🔥 Called it this morning. <span>#fxsnap #community</span></p>
                <div className="quoted-setup"><span>QUOTING YOUR SETUP</span><p>“I’m taking this one 👀 Let’s see how it plays out.”</p></div>
                <div className="post-receipt"><span className="receipt-mark">✓</span><div><strong>Setup shared before the outcome</strong><span>Original call stays attached to the update.</span></div></div>
              </article>
              <div className="townhall-benefits">
                <article><span>01</span><div><h3>Post, discuss, quote</h3><p>Share text, images and polls. Use mentions and hashtags, then quote a post or comment to add your take.</p></div></article>
                <article><span>02</span><div><h3>Share the setup, then the win</h3><p>Post an analysis in a tap. When you share an outcome, it stays connected to the original call.</p></div></article>
                <article><span>03</span><div><h3>Build your name</h3><p>Create a trader profile, grow your audience and let people follow your calls over time.</p></div></article>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section aria-labelledby="results-title" className="results-section">
          <div className="container results-heading">
            <div><p className="eyebrow">Shared by the community</p><h2 id="results-title">Receipts don't lie.</h2></div>
            <p>Examples of community-shared trade outcomes</p>
          </div>
          <div aria-label="Community outcome examples" className="results-ticker">
            <div className="results-ticker-track">
              {[...receipts, ...receipts].map(([symbol, outcome], index) => (
                <div aria-hidden={index >= receipts.length || undefined} className="result-chip" key={`${symbol}-${index}`}>
                  <span>{symbol}</span><i>TP HIT</i><strong>{outcome}</strong>
                </div>
              ))}
            </div>
          </div>
          <p className="container results-disclaimer">Individual community-shared outcomes are historical examples, not typical or promised results. Past outcomes do not predict future performance. Trading involves risk.</p>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="section" id="how-it-works">
          <div className="container">
            <div className="process-heading">
              <p className="eyebrow">How it works</p>
              <h2>From screenshot to community<br />in a few clear steps.</h2>
            </div>
            <div className="process-grid">
              {processSteps.map((step) => (
                <article className="process-card" key={step.number}>
                  <span>{step.number}</span><h3>{step.title}</h3><p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="section section-muted">
          <div className="container faq-layout">
            <div><p className="eyebrow">Clear-eyed by design</p><h2>Useful tools.<br />Your call.</h2><p className="section-description">FXSnap gives you another way to review a chart and compare ideas—not a substitute for your own judgment.</p></div>
            <div className="faq-list">
              <details><summary>Does FXSnap guarantee a winning setup?</summary><p>No. AI analysis can be wrong or incomplete. A checked setup is not a prediction or a guarantee of market outcomes.</p></details>
              <details><summary>Does FXSnap use live market prices?</summary><p>No. Analysis uses the screenshot you upload. Screenshot-derived prices are not verified live quotes, so check current market conditions separately.</p></details>
              <details><summary>Is this financial advice?</summary><p>No. FXSnap is an analysis and community platform, not a broker or financial adviser. You are responsible for your own research and decisions.</p></details>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="section">
          <div className="container">
            <div className="cta-panel">
              <div>
                <p className="eyebrow">Your next trade</p>
                <h2>Starts with a screenshot.</h2>
                <p>Join 10,000+ FXSnap users analysing charts and sharing their calls with the community.</p>
              </div>
              <div className="cta-panel-actions">
                <StoreCtas compact />
                <Link className="inline-link" href="/features">Explore FXSnap <ArrowRight aria-hidden="true" size={15} /></Link>
              </div>
            </div>
            <div className="disclaimer-inline">
              <Check aria-hidden="true" size={16} />
              <span>AI output may be incorrect or incomplete. Trading involves risk. FXSnap does not provide financial advice or guarantee results.</span>
            </div>
          </div>
        </section>
      </ScrollReveal>
    </>
  );
}
