export type ProductPage = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  sections: { heading: string; body: string }[];
  related: { label: string; href: string }[];
};

export const productPages: ProductPage[] = [
  {
    slug: "ai-forex-chart-analyzer",
    title: "AI Forex Chart Analyzer",
    description:
      "Learn how FXSnap analyses uploaded forex chart screenshots and why AI chart analysis should always be independently checked.",
    heading: "An AI forex chart analyzer, grounded in your screenshot.",
    intro:
      "FXSnap reviews a trading-chart image you upload and returns a structured AI-generated analysis. The image—not a guessed quote or a promised prediction—is the basis for what it can describe.",
    sections: [
      { heading: "What a chart analyzer can help you review", body: "A structured read can help organise observations such as the visible instrument, timeframe, price action, market structure and technical areas. The result depends on what is legible and present in the screenshot." },
      { heading: "Candidate levels, not instructions", body: "If the image supports it, analysis may include candidate entry, stop-loss or take-profit levels. Those are technical observations to verify, not instructions to place a trade or a claim that price will reach a level." },
      { heading: "Check freshness and missing context", body: "An uploaded image may be old, cropped or incomplete. Prices derived from it are not verified live quotes. Confirm instrument, timeframe and current conditions in your own trading platform." },
    ],
    related: [
      { label: "How FXSnap works", href: "/how-it-works" },
      { label: "How to analyse forex charts", href: "/learn/forex-chart-analysis" },
    ],
  },
  {
    slug: "ai-trading-assistant",
    title: "AI Trading Assistant",
    description:
      "See how FXSnap can support a trader's chart-review workflow without placing trades or replacing independent judgment.",
    heading: "An AI trading assistant for chart review—not trade execution.",
    intro:
      "FXSnap helps traders examine uploaded chart screenshots with structured AI analysis. It is a tool for reviewing technical context, not an autonomous trading system, broker or financial adviser.",
    sections: [
      { heading: "Use it to organise observations", body: "A chart review can include visible market structure, directional context and potential technical areas. The analysis can also call out missing evidence or uncertainty when the screenshot is hard to interpret." },
      { heading: "Keep decisions in your hands", body: "FXSnap does not guarantee outcomes. A directional assessment or candidate setup is not automatically an actionable entry. Verify the chart, assess risk and decide independently whether any observation is relevant to your plan." },
      { heading: "Understand the limits of an image", body: "A screenshot cannot necessarily show current prices, spreads, news, account exposure or the full market history. FXSnap analysis is therefore limited to the information available in the submitted image and configured product features." },
    ],
    related: [
      { label: "Explore FXSnap features", href: "/features" },
      { label: "Read the financial disclaimer", href: "/disclaimer" },
    ],
  },
  {
    slug: "ai-technical-analysis",
    title: "AI Technical Analysis",
    description:
      "Explore how FXSnap applies AI to visible chart information and why technical observations are not market predictions.",
    heading: "AI technical analysis starts with what the chart shows.",
    intro:
      "FXSnap applies AI to a user-submitted chart screenshot to produce a structured technical read. It can help explain visible context, but it does not make uncertainty disappear.",
    sections: [
      { heading: "A screenshot is the source material", body: "The image may show candles, labels, chart levels and indicators. If those details are obscured or absent, the analysis may be limited. A chosen instrument is only a hint and does not override what is visible." },
      { heading: "Support and resistance are areas to assess", body: "FXSnap uses a support and resistance-based trading methodology. These areas help frame a technical discussion; they do not prove that price will reverse, hold or break at a particular point." },
      { heading: "AI output needs independent verification", body: "AI can misread chart elements or miss context. Review any explanation and levels against your current chart and risk plan. Do not treat confidence scores or directional language as guarantees." },
    ],
    related: [
      { label: "Support and resistance guide", href: "/learn/support-and-resistance" },
      { label: "How analysis works", href: "/how-it-works" },
    ],
  },
  {
    slug: "forex-chart-analysis",
    title: "Forex Chart Analysis",
    description:
      "Discover how FXSnap structures chart screenshot analysis and how traders can verify AI-generated technical observations.",
    heading: "Forex chart analysis, with the screenshot in focus.",
    intro:
      "FXSnap turns an uploaded trading-chart screenshot into a structured explanation of visible technical context. It is designed to support a trader's review, not replace it.",
    sections: [
      { heading: "Read the visible context first", body: "Instrument labels, timeframe, candle history and price scale affect how a chart can be interpreted. If the image does not show enough context, the analysis may say so rather than assuming missing information." },
      { heading: "Separate bias from trade readiness", body: "A market direction observation does not mean a setup is ready. Candidate levels, when supported by the image, are distinct from a decision to trade; incomplete or conflicting evidence can warrant waiting." },
      { heading: "Use current information for current decisions", body: "The submitted screenshot can be stale and is not a verified live price feed. Compare it to your current platform and account-specific risk before acting on any technical observation." },
    ],
    related: [
      { label: "Read the chart analysis guide", href: "/learn/forex-chart-analysis" },
      { label: "Try the risk-to-reward calculator", href: "/risk-reward-calculator" },
    ],
  },
  {
    slug: "support-resistance-analysis",
    title: "Support and Resistance Analysis",
    description:
      "Learn how FXSnap discusses support and resistance in a chart screenshot and why price levels are not guarantees.",
    heading: "Explore support and resistance in chart context.",
    intro:
      "FXSnap uses a support and resistance-based methodology to help interpret chart screenshots. The resulting areas are technical observations to examine—not exact promises about future price behaviour.",
    sections: [
      { heading: "Why traders mark price areas", body: "Previous reactions on a chart can help traders describe where buying or selling interest appeared. A zone is an interpretation of past chart behaviour, and different methods may mark it differently." },
      { heading: "What an image-based analysis can miss", body: "A screenshot may omit prior price action, higher-timeframe context or recent market changes. AI may also misread a level. Use a readable chart and check the analysis against your own method." },
      { heading: "A level is not a trade signal", body: "A support or resistance area can fail or be crossed. Consider invalidation, potential loss and current information. No technical area guarantees a reversal or profitable outcome." },
    ],
    related: [
      { label: "Read the support and resistance guide", href: "/learn/support-and-resistance" },
      { label: "Understand the FXSnap workflow", href: "/how-it-works" },
    ],
  },
  {
    slug: "ai-trading-signals",
    title: "AI Trading Signals Explained",
    description:
      "Understand the difference between AI-assisted chart analysis and a trading signal service, including FXSnap's limitations.",
    heading: "AI chart analysis is not the same as a trading signal.",
    intro:
      "A label such as buy or sell can sound definitive, but AI-generated chart analysis is an interpretation of an image. FXSnap is an analysis tool, not a signal service that promises a market outcome.",
    sections: [
      { heading: "What people may mean by a signal", body: "Trading products use the word signal in different ways. It can imply a suggested direction or entry, but a direction alone does not establish evidence, risk, suitability or the probability of success." },
      { heading: "How to read an AI-generated setup", body: "Treat any direction or candidate entry, stop or target as a technical observation to inspect. Confirm that the chart supports the levels and that the setup fits your own rules before making a decision." },
      { heading: "When waiting may be more appropriate", body: "If a chart is unreadable, missing important context or showing conflicting information, a confident-looking label should not replace caution. FXSnap analysis may identify limitations or a no-trade result." },
    ],
    related: [
      { label: "See how FXSnap works", href: "/how-it-works" },
      { label: "Read the financial disclaimer", href: "/disclaimer" },
    ],
  },
];
