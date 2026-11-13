export type Article = {
  slug: string;
  category: string;
  title: string;
  description: string;
  author: string;
  answer: string;
  sections: { heading: string; body: string }[];
};

export const articles: Article[] = [
  {
    slug: "forex-chart-analysis",
    category: "Chart analysis",
    title: "How to analyse forex charts",
    description: "A practical framework for reading forex chart context, price movement and technical levels.",
    author: "Israel Thompson",
    answer: "To analyse a forex chart, first identify its instrument and timeframe, then examine the visible price structure, important price areas and the context around the latest candles. Treat each observation as a hypothesis to verify—not a forecast.",
    sections: [
      { heading: "Start with the chart itself", body: "Check the currency pair, timeframe, price scale and whether the screenshot includes enough candles to understand recent context. A cropped or compressed image can hide important information. Do not assume a displayed price is current unless it has been checked against a live source." },
      { heading: "Describe structure before choosing direction", body: "Look for the sequence of visible swing highs and lows and note whether price is moving, ranging or unclear. A short sample can be misleading; compare more than one timeframe when your process calls for it, without treating a label as confirmation." },
      { heading: "Mark areas and write down uncertainty", body: "Support and resistance are often discussed as areas rather than exact prices. Record what supports your interpretation, what would invalidate it and what remains uncertain. Technical analysis does not ensure a particular outcome." },
    ],
  },
  {
    slug: "support-and-resistance",
    category: "Technical analysis",
    title: "Support and resistance: a practical guide",
    description: "Learn what support and resistance mean, how traders mark price areas and why those areas can fail.",
    author: "Israel Thompson",
    answer: "Support and resistance are price areas where buying or selling interest has previously appeared. Traders use them to organise chart observations, but they are not guaranteed turning points and can break or become irrelevant as conditions change.",
    sections: [
      { heading: "What do the terms mean?", body: "Support describes an area where a decline has previously slowed or reversed. Resistance describes an area where an advance has previously slowed or reversed. These labels describe past behaviour, not a promise about what happens next." },
      { heading: "How can you identify an area?", body: "Review multiple visible reactions in context, note the timeframe and avoid false precision. Different traders may draw slightly different zones because price rarely respects a single exact line. Use a consistent method and record the evidence." },
      { heading: "What can go wrong?", body: "A level can break, be crossed temporarily or fail to matter in new market conditions. A screenshot may also omit the history needed to judge a zone. Consider invalidation and risk before treating any area as part of a plan." },
    ],
  },
  {
    slug: "risk-to-reward",
    category: "Risk management",
    title: "Risk-to-reward explained",
    description: "Understand how to calculate a risk-to-reward ratio and why it does not predict profitability.",
    author: "Israel Thompson",
    answer: "Risk-to-reward compares the distance from an entry to a possible loss level with the distance from entry to a possible target. For a long setup, divide target minus entry by entry minus stop. The ratio alone says nothing about the probability of reaching either level.",
    sections: [
      { heading: "The basic calculation", body: "For a long position with entry 1.1000, stop 1.0950 and target 1.1100, the risk distance is 0.0050 and the potential reward distance is 0.0100. The distance ratio is 2:1. This example excludes costs, slippage and position sizing." },
      { heading: "Check direction and price geometry", body: "For a short position, the stop is above entry and the target below it. Use absolute price distances only after confirming the levels are on the correct side of the entry. If the stop and target are not valid for the chosen direction, the calculation should be rejected." },
      { heading: "A ratio is not a success rate", body: "A hypothetical 2:1 ratio does not mean a setup is likely to reach its target. Outcomes depend on execution, market conditions, costs and the quality of the underlying idea. Risk management includes more than comparing two distances." },
    ],
  },
];

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug);
}
