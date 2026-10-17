import { GENERATED_LEARNING_STEPS } from './learningSteps.generated';

export type CategoryId =
  | "fundamentals"
  | "technical-analysis"
  | "risk-management"
  | "fundamental-analysis"
  | "trading-psychology"
  | "strategies-practice";

export type LessonDifficulty = "beginner" | "intermediate" | "advanced";

export type ToolRoute =
  | "/lot-size-calculator"
  | "/risk-management"
  | "/economic-calendar"
  | "/daily-brief";

export interface LearningCategory {
  id: CategoryId;
  title: string;
  description: string;
  icon: string;
  groups: LearningGroup[];
}

export interface LearningGroup {
  id: string;
  title: string;
  lessonIds: string[];
}

export interface LessonSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  formula?: string;
}

export type LearningStep =
  | { type: 'learn' | 'example'; title?: string; body: string; visual?: string; keyPoint?: string }
  | { type: 'check'; question: string; options: [string, string] | [string, string, string] | [string, string, string, string]; correctIndex: number; feedback: string }
  | { type: 'practice'; body: string }
  | { type: 'recap'; points: string[] };

export interface LearningLesson {
  id: string;
  title: string;
  shortDescription: string;
  categoryId: CategoryId;
  topicGroup: string;
  difficulty: LessonDifficulty;
  estimatedMinutes: number;
  aliases: string[];
  intro: string;
  sections: LessonSection[];
  steps?: LearningStep[];
  keyTakeaways: string[];
  commonMistakes: string[];
  relatedLessonIds: string[];
  toolRoute?: ToolRoute;
  practicePrompt?: string;
}

const categoryDefinitions: {
  id: CategoryId;
  title: string;
  description: string;
  icon: string;
  groups: Omit<LearningGroup, "lessonIds">[];
}[] = [
  {
    id: "fundamentals",
    title: "Trading Fundamentals",
    description: "How markets, orders, and trades work.",
    icon: "book-open",
    groups: [
      { id: "getting-started", title: "Getting started" },
      { id: "markets-and-instruments", title: "Markets and instruments" },
      { id: "orders-and-execution", title: "Orders and execution" },
    ],
  },
  {
    id: "technical-analysis",
    title: "Technical Analysis",
    description: "Read price charts while accounting for uncertainty.",
    icon: "bar-chart-2",
    groups: [
      { id: "candlesticks", title: "Candlesticks" },
      { id: "chart-patterns", title: "Chart patterns" },
      { id: "market-structure", title: "Market structure" },
      { id: "liquidity-and-smc", title: "Liquidity and SMC" },
      { id: "tools-and-chart-reading", title: "Tools and chart reading" },
    ],
  },
  {
    id: "risk-management",
    title: "Risk Management",
    description: "Plan exposure, losses, and trade invalidation before entry.",
    icon: "shield",
    groups: [
      { id: "position-sizing", title: "Position sizing" },
      { id: "risk-and-reward", title: "Risk and reward" },
      { id: "protection-and-portfolio-risk", title: "Protection and portfolio risk" },
    ],
  },
  {
    id: "fundamental-analysis",
    title: "Fundamental Analysis",
    description: "Understand economic releases, valuation drivers, and event risk.",
    icon: "globe",
    groups: [
      { id: "economic-context", title: "Economic context" },
      { id: "company-and-asset-analysis", title: "Company and asset analysis" },
      { id: "events-and-research", title: "Events and research" },
    ],
  },
  {
    id: "trading-psychology",
    title: "Trading Psychology",
    description: "Build process-focused habits for uncertain outcomes.",
    icon: "heart",
    groups: [
      { id: "decision-making", title: "Decision-making" },
      { id: "emotions-and-discipline", title: "Emotions and discipline" },
      { id: "review-and-wellbeing", title: "Review and wellbeing" },
    ],
  },
  {
    id: "strategies-practice",
    title: "Strategies and Practice",
    description: "Turn ideas into testable rules and practice them safely.",
    icon: "check-square",
    groups: [
      { id: "strategy-design", title: "Strategy design" },
      { id: "backtesting", title: "Backtesting" },
      { id: "simulated-practice", title: "Simulated practice" },
    ],
  },
];

const ARTICLE_LESSONS: LearningLesson[] = [
  {
    id: "fundamentals-market-basics",
    title: "What is a financial market?",
    shortDescription: "Learn what markets do and why prices change.",
    categoryId: "fundamentals",
    topicGroup: "Getting started",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["market basics", "financial market", "buyers and sellers"],
    intro: "A market is a system for matching people who want to trade an asset.",
    sections: [
      {
        heading: "Prices are negotiated",
        paragraphs: [
          "A traded price is the result of orders meeting, not a guaranteed estimate of an asset's true worth. Buyers submit bids and sellers submit offers; completed trades show where willing participants found a match.",
          "Expectations, available information, liquidity, and urgency can all change those offers. A price move alone does not reveal why it happened.",
        ],
      },
      {
        heading: "Markets differ",
        bullets: [
          "Stocks represent ownership interests; bonds are debt instruments; currencies are traded in pairs; commodities and derivatives have their own contract terms.",
          "Trading hours, settlement, leverage, fees, and regulation vary by venue and instrument.",
        ],
      },
    ],
    keyTakeaways: ["A market price reflects transactions and available orders.", "Know an instrument's terms and risks before trading it."],
    commonMistakes: ["Treating a recent price as a promise of future value.", "Assuming all markets have the same hours, costs, or protections."],
    relatedLessonIds: ["fundamentals-how-trades-work", "fundamentals-orders-execution"],
  },
  {
    id: "fundamentals-how-trades-work",
    title: "How a trade works",
    shortDescription: "Follow a trade from an order to its result.",
    categoryId: "fundamentals",
    topicGroup: "Getting started",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["trade lifecycle", "buy and sell", "long and short"],
    intro: "A trade opens exposure to price movement, then closes or settles under the instrument's rules.",
    sections: [
      {
        heading: "Opening and closing exposure",
        paragraphs: [
          "Buying first is commonly called going long; selling first to benefit from a decline is commonly called going short. Shorting may require borrowing, margin, or a derivative and can have losses that exceed the initial amount at risk.",
          "The result depends on entry and exit prices, position size, contract value, fees, financing, and execution. A correct market view can still lose after costs or poor execution.",
        ],
      },
      {
        heading: "An order is an instruction",
        bullets: [
          "A market order prioritizes execution, not a particular price; fast markets can produce slippage.",
          "A limit order sets a price boundary but may not fill. A stop order's trigger and resulting execution behavior depend on venue and broker rules.",
        ],
      },
    ],
    keyTakeaways: ["Understand how the instrument is opened, closed, and settled.", "Execution and costs affect outcomes as well as direction."],
    commonMistakes: ["Assuming an order type guarantees both fill and price.", "Ignoring margin, financing, borrow costs, or contract specifications."],
    relatedLessonIds: ["fundamentals-market-basics", "fundamentals-orders-execution", "risk-position-sizing"],
  },
  {
    id: "fundamentals-orders-execution",
    title: "Orders, spread, and execution",
    shortDescription: "Compare common orders and the practical cost of execution.",
    categoryId: "fundamentals",
    topicGroup: "Orders and execution",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["market order", "limit order", "spread", "slippage"],
    intro: "An order specifies how you want to participate; it cannot remove market or execution uncertainty.",
    sections: [
      {
        heading: "Choosing an order",
        paragraphs: [
          "The bid is the best displayed buying price and the ask is the best displayed selling price; their difference is the spread. A buy commonly executes at or near the ask and a sell at or near the bid, subject to the venue and available depth.",
          "A market order seeks available liquidity. A limit order controls the worst acceptable price but may remain unfilled. Stop orders can trigger into market or limit instructions, depending on their type.",
        ],
      },
      {
        heading: "Execution is not guaranteed",
        bullets: [
          "Slippage is the difference between an expected and actual execution price.",
          "Thin liquidity, gaps, volatility, latency, and partial fills can change the result. Check the broker's order and protection rules.",
        ],
      },
    ],
    keyTakeaways: ["Spread is an immediate trading cost to consider.", "A limit price may prevent an unfavorable fill but does not ensure a fill."],
    commonMistakes: ["Assuming a stop-loss always executes at its trigger price.", "Ignoring spread and slippage when evaluating a strategy."],
    relatedLessonIds: ["fundamentals-how-trades-work", "risk-stop-and-gap-risk"],
  },
  {
    id: "fundamentals-market-participants",
    title: "Who participates in markets?",
    shortDescription: "See how different participants and time horizons interact.",
    categoryId: "fundamentals",
    topicGroup: "Markets and instruments",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["market participants", "liquidity providers", "investors and traders"],
    intro: "Market activity combines many goals, constraints, and holding periods.",
    sections: [
      {
        heading: "Different roles, mixed motives",
        paragraphs: [
          "Participants may include long-term investors, companies hedging exposures, funds, dealers, market makers, and short-term traders. A single participant can also act differently across instruments and time.",
          "Some participants provide liquidity by quoting both sides; others consume it to transact. These roles are not fixed, and displayed orders may change or disappear.",
        ],
      },
      {
        heading: "No single explanation",
        bullets: [
          "Price and volume can inform an analysis, but usually cannot identify the trader or motive behind an order.",
          "Avoid narratives that claim certainty about institutional intent from one candle, sweep, or volume spike.",
        ],
      },
    ],
    keyTakeaways: ["Markets aggregate diverse decisions rather than one controlling viewpoint.", "Observed price action rarely proves who traded or why."],
    commonMistakes: ["Attributing every move to a specific participant without evidence.", "Confusing a useful market narrative with a verified cause."],
    relatedLessonIds: ["fundamentals-market-basics", "technical-liquidity-smc"],
  },
  {
    id: "technical-candlestick-anatomy",
    title: "Candlestick anatomy and context",
    shortDescription: "Read open, high, low, close, body, and wicks.",
    categoryId: "technical-analysis",
    topicGroup: "Candlesticks",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["OHLC", "candle body", "wick", "candlestick chart"],
    intro: "A candle compresses four prices over a chosen interval; it is a summary, not a forecast.",
    sections: [
      {
        heading: "Four prices, one interval",
        paragraphs: [
          "OHLC means open, high, low, and close. The real body spans open to close; the upper and lower wicks show the interval's extremes beyond the body. Chart colors are configurable, so check the platform legend.",
          "A candle's shape depends on timeframe and data source. A five-minute candle and a daily candle can tell different stories about the same session.",
        ],
      },
      {
        heading: "Read rather than predict",
        bullets: [
          "A long wick shows rejection or movement away from an extreme within that interval, but does not establish what happens next.",
          "Compare candles with nearby structure, volatility, volume quality, and the instrument's trading hours.",
        ],
      },
    ],
    keyTakeaways: ["Know the interval and OHLC values behind each candle.", "Candle shape is descriptive evidence, not a standalone signal."],
    commonMistakes: ["Reading a wick as proof of a reversal.", "Comparing candle patterns across inconsistent timeframes."],
    relatedLessonIds: ["technical-doji-and-spinning-top", "technical-engulfing-patterns", "technical-chart-reading"],
  },
  {
    id: "technical-doji-and-spinning-top",
    title: "Doji and spinning-top candles",
    shortDescription: "Interpret small real bodies without overreading them.",
    categoryId: "technical-analysis",
    topicGroup: "Candlesticks",
    difficulty: "beginner",
    estimatedMinutes: 4,
    aliases: ["doji", "spinning top", "indecision candle"],
    intro: "A small body means open and close were relatively close for that candle; context decides whether it matters.",
    sections: [
      {
        heading: "Shape and interpretation",
        paragraphs: [
          "A doji typically has nearly equal open and close; a spinning top has a small body with wicks on both sides. Exact definitions vary between charting references and depend on the instrument's scale.",
          "Either shape can appear during consolidation or after a strong move. It can reflect temporary balance, but one candle cannot confirm a change in control.",
        ],
      },
      {
        heading: "Look for confirmation",
        bullets: [
          "Ask where the candle formed relative to a well-defined range, trend, or level.",
          "Wait for subsequent price behavior if a strategy requires confirmation; confirmation still does not guarantee follow-through.",
        ],
      },
    ],
    keyTakeaways: ["Small-body candles describe limited net movement within an interval.", "Use location and later evidence rather than a candle name alone."],
    commonMistakes: ["Calling every doji a reversal.", "Ignoring the timeframe and surrounding range."],
    relatedLessonIds: ["technical-candlestick-anatomy", "technical-chart-reading"],
  },
  {
    id: "technical-hammer-shooting-star",
    title: "Hammer and shooting-star shapes",
    shortDescription: "Compare long-wick candles and their location.",
    categoryId: "technical-analysis",
    topicGroup: "Candlesticks",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["hammer candle", "hanging man", "shooting star", "inverted hammer", "pin bar"],
    intro: "Long-wick shapes have different traditional names depending on their location, but neither predicts a reversal by itself.",
    sections: [
      {
        heading: "Anatomy and location",
        paragraphs: [
          "A hammer-like candle has a small upper body and a relatively long lower wick. Near a decline it is traditionally called a hammer; near an advance a similar shape may be called a hanging man. A shooting-star shape has a small lower body and a long upper wick; location affects its traditional label.",
          "The labels are conventions, not laws. These shapes are sometimes grouped under the informal term pin bar, though definitions vary. A wick shows that price traveled and then moved back before the close; it does not reveal future order flow.",
        ],
      },
      {
        heading: "Test the setup",
        bullets: [
          "Define the preceding trend, nearby structure, candle-size threshold, and confirmation rule before testing.",
          "Consider gaps, session boundaries, and volatility, which can create similar shapes for unrelated reasons.",
        ],
      },
    ],
    keyTakeaways: ["Location and prior movement matter to traditional pattern names.", "Any reversal hypothesis needs explicit confirmation and invalidation rules."],
    commonMistakes: ["Treating a long wick as a guaranteed rejection.", "Changing pattern definitions after seeing the outcome."],
    relatedLessonIds: ["technical-candlestick-anatomy", "technical-engulfing-patterns", "technical-market-structure"],
  },
  {
    id: "technical-engulfing-patterns",
    title: "Engulfing candles",
    shortDescription: "Define bullish and bearish engulfing patterns consistently.",
    categoryId: "technical-analysis",
    topicGroup: "Candlesticks",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["bullish engulfing", "bearish engulfing", "outside body"],
    intro: "An engulfing pattern compares consecutive candle bodies; its definition and meaning need context.",
    sections: [
      {
        heading: "A common definition",
        paragraphs: [
          "In a common convention, a bullish engulfing candle closes up and its body covers the prior down candle's body; a bearish engulfing candle does the reverse. Some definitions compare full ranges instead, so state which rule you use.",
          "A larger body can represent a shift in interval-level pressure, but a pattern can fail, especially in sideways or illiquid conditions.",
        ],
      },
      {
        heading: "Evaluate consistently",
        bullets: [
          "Specify whether equal boundaries count and whether wicks are included.",
          "Record location, trend, spread, and confirmation criteria in a test; avoid selecting only visually compelling examples.",
        ],
      },
    ],
    keyTakeaways: ["Engulfing definitions differ; use a repeatable rule.", "A large candle is not proof of durable buying or selling."],
    commonMistakes: ["Mixing body-based and range-based definitions.", "Using the pattern without defining risk or invalidation."],
    relatedLessonIds: ["technical-candlestick-anatomy", "strategies-backtesting-basics"],
  },
  {
    id: "technical-morning-evening-star",
    title: "Morning-star and evening-star patterns",
    shortDescription: "Understand three-candle reversal hypotheses and their limits.",
    categoryId: "technical-analysis",
    topicGroup: "Candlesticks",
    difficulty: "intermediate",
    estimatedMinutes: 5,
    aliases: ["morning star", "evening star", "three-candle reversal"],
    intro: "These traditional three-candle patterns describe a pause and a strong move in the opposite direction.",
    sections: [
      {
        heading: "Typical structure",
        paragraphs: [
          "A morning star is commonly described as a substantial bearish candle, a smaller middle candle, then a bullish candle closing well into the first body's range. An evening star reverses those directions. Gap requirements differ across markets and references.",
          "The sequence is a hypothesis about changing pressure, not a causal explanation. Its reliability depends on market, timeframe, costs, and exact rule choices.",
        ],
      },
      {
        heading: "Make it testable",
        bullets: [
          "Write down body-size, gap, and closing-location thresholds before reviewing examples.",
          "Compare outcomes with a baseline and include transaction costs and failed signals.",
        ],
      },
    ],
    keyTakeaways: ["The pattern's three-candle sequence has several accepted variants.", "A visually recognizable setup still needs objective testing."],
    commonMistakes: ["Requiring gaps in markets that trade continuously without checking the convention.", "Counting only successful examples."],
    relatedLessonIds: ["technical-candlestick-anatomy", "strategies-backtesting-basics"],
  },
  {
    id: "technical-inside-outside-bars",
    title: "Inside bars and outside bars",
    shortDescription: "Compare a candle's range with the previous candle.",
    categoryId: "technical-analysis",
    topicGroup: "Candlesticks",
    difficulty: "beginner",
    estimatedMinutes: 4,
    aliases: ["inside candle", "outside candle", "mother bar"],
    intro: "Range relationships can describe contraction or expansion, but do not determine direction.",
    sections: [
      {
        heading: "Range comparison",
        paragraphs: [
          "An inside bar has a high below and a low above the previous bar's high and low, under a strict definition. An outside bar has a high above and low below the previous bar's range. Some practitioners allow equal boundaries.",
          "An inside bar may reflect temporary contraction; an outside bar may reflect expansion and two-sided movement. Either can occur in a trend or a range.",
        ],
      },
      {
        heading: "Avoid directional assumptions",
        bullets: [
          "Choose whether boundaries are strict or inclusive and keep that rule fixed.",
          "If trading a breakout hypothesis, plan for false breaks and gaps through the trigger.",
        ],
      },
    ],
    keyTakeaways: ["Inside/outside describes relative ranges, not bullish or bearish certainty.", "Volatility expansion can move in either direction."],
    commonMistakes: ["Assuming an inside bar must break toward the prior trend.", "Ignoring how equal highs and lows are classified."],
    relatedLessonIds: ["technical-candlestick-anatomy", "technical-chart-reading"],
  },
  {
    id: "technical-double-tops-bottoms",
    title: "Double tops and double bottoms",
    shortDescription: "Study repeated tests of an area and neckline confirmation.",
    categoryId: "technical-analysis",
    topicGroup: "Chart patterns",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["M pattern", "W pattern", "neckline", "double bottom"],
    intro: "A double top or bottom is a chart interpretation of two tests near a similar price area.",
    sections: [
      {
        heading: "Structure and confirmation",
        paragraphs: [
          "A double top has two peaks separated by a trough; a double bottom has two troughs separated by a peak. The intervening swing is often called the neckline. The pattern is commonly treated as confirmed only after a break of that level, though definitions vary.",
          "Peaks need not be identical. A second test can fail to reverse, and a neckline break can be a false breakout.",
        ],
      },
      {
        heading: "Use measured moves cautiously",
        bullets: [
          "Some traders project the pattern's height from the neckline; this is a heuristic, not a price target with assured reach.",
          "Define swing points, tolerance, confirmation, and invalidation before evaluating examples.",
        ],
      },
    ],
    keyTakeaways: ["A repeated test is not confirmed until your stated rule is met.", "Pattern projections are estimates and can fail."],
    commonMistakes: ["Labeling ordinary noise as matching tops or bottoms after the fact.", "Entering before defining what invalidates the pattern."],
    relatedLessonIds: ["technical-market-structure", "technical-chart-reading", "risk-trade-planning"],
  },
  {
    id: "technical-head-and-shoulders",
    title: "Head-and-shoulders patterns",
    shortDescription: "Identify shoulders, head, neckline, and failure conditions.",
    categoryId: "technical-analysis",
    topicGroup: "Chart patterns",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["inverse head and shoulders", "neckline break", "H&S pattern"],
    intro: "This reversal pattern organizes swing highs or lows into a testable visual structure.",
    sections: [
      {
        heading: "The pattern",
        paragraphs: [
          "A standard head-and-shoulders has a central higher peak (the head) between lower peaks (shoulders), with a neckline drawn through the intervening lows. The inverse form uses three lows, with the central low deepest.",
          "Necklines can slope, and analysts differ on whether confirmation requires a close, a touch, or a retest beyond it. Pick a rule in advance.",
        ],
      },
      {
        heading: "Limits of interpretation",
        bullets: [
          "A pattern can remain incomplete or fail after a neckline break.",
          "Volume is sometimes used as context, but volume data quality and interpretation differ across venues.",
        ],
      },
    ],
    keyTakeaways: ["The pattern is defined by relative swings and a chosen neckline rule.", "Do not treat a neckline break as certainty."],
    commonMistakes: ["Forcing shoulders onto irregular price action.", "Ignoring sloped necklines, timeframe, or the risk of a false break."],
    relatedLessonIds: ["technical-market-structure", "technical-double-tops-bottoms", "strategies-backtesting-basics"],
  },
  {
    id: "technical-triangles-flags-wedges",
    title: "Triangles, flags, and wedges",
    shortDescription: "Compare common continuation and compression patterns.",
    categoryId: "technical-analysis",
    topicGroup: "Chart patterns",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    aliases: ["ascending triangle", "descending triangle", "symmetrical triangle", "bull flag", "bear flag", "wedge"],
    intro: "These pattern names describe converging boundaries or pauses; their labels do not guarantee a breakout direction.",
    sections: [
      {
        heading: "Common forms",
        paragraphs: [
          "Ascending and descending triangles pair a relatively flat boundary with rising lows or falling highs. A symmetrical triangle has converging boundaries. Flags are short consolidations after a sharp move; wedges have converging, often sloped boundaries.",
          "Textbook labels simplify messy charts. Analysts disagree about swing-point selection, minimum touches, duration, and whether a breakout needs a closing price or retest.",
        ],
      },
      {
        heading: "Plan for either outcome",
        bullets: [
          "Mark boundaries using a consistent method and identify the point where the idea is no longer valid.",
          "Breakouts can reverse or gap beyond a planned entry. Risk controls and costs matter more than the pattern name.",
        ],
      },
    ],
    keyTakeaways: ["Compression patterns describe geometry, not a certain future move.", "Define boundaries and confirmation rules before testing."],
    commonMistakes: ["Assuming an ascending triangle must break upward.", "Redrawing boundaries to fit a preferred result."],
    relatedLessonIds: ["technical-market-structure", "technical-trendlines", "strategies-breakout-example"],
  },
  {
    id: "technical-market-structure",
    title: "Market structure: swings, BOS, and CHoCH",
    shortDescription: "Map swing sequences and define break-of-structure terminology.",
    categoryId: "technical-analysis",
    topicGroup: "Market structure",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    aliases: ["BOS", "break of structure", "CHoCH", "change of character", "swing highs and lows"],
    intro: "Market-structure labels can help describe price sequences, but terminology varies among traders.",
    sections: [
      {
        heading: "Swings and breaks",
        paragraphs: [
          "A swing high or low is a local turning point defined by a chosen number of bars or a price threshold. In a common framework, higher highs and higher lows describe an advancing sequence; lower highs and lower lows describe a declining sequence.",
          "BOS (break of structure) often means price breaks a prior swing in the direction of the current trend. CHoCH (change of character) often labels a break against the prior sequence and may be treated as an early warning, not confirmation of a lasting reversal.",
        ],
      },
      {
        heading: "State the methodology",
        bullets: [
          "Specify swing rules, timeframe, whether a wick or close counts, and which swing is relevant.",
          "A minor swing break can coexist with a larger-timeframe trend; timeframe hierarchy is an analytical choice, not a universal rule.",
        ],
      },
    ],
    keyTakeaways: ["BOS and CHoCH do not have universally fixed definitions.", "A structure break is evidence to assess, not a prediction."],
    commonMistakes: ["Switching swing definitions mid-analysis.", "Treating a wick through a level as confirmation without a predefined rule."],
    relatedLessonIds: ["technical-liquidity-smc", "technical-trendlines", "technical-chart-reading"],
  },
  {
    id: "technical-liquidity-smc",
    title: "Liquidity and Smart Money Concepts",
    shortDescription: "Examine liquidity, stop clusters, order blocks, and fair value gaps carefully.",
    categoryId: "technical-analysis",
    topicGroup: "Liquidity and SMC",
    difficulty: "advanced",
    estimatedMinutes: 8,
    aliases: ["SMC", "liquidity sweep", "stop hunt", "order block", "fair value gap", "FVG"],
    intro: "SMC is a family of chart-reading frameworks; its labels are interpretations, not direct views of hidden orders.",
    sections: [
      {
        heading: "What a chart can and cannot show",
        paragraphs: [
          "Liquidity broadly describes how readily an asset can trade without large price impact. Traders sometimes infer likely stop areas near visible highs and lows and call a move through them a sweep. A chart alone cannot prove stops were present, who triggered them, or intent.",
          "An order block is commonly marked as a prior candle or zone before a strong move; a fair value gap is often defined as a three-candle range imbalance. There is no single standardized definition, and price may never revisit a marked zone.",
        ],
      },
      {
        heading: "Use labels as hypotheses",
        bullets: [
          "Record the exact zone and confirmation rule, then test it across unseen data with costs.",
          "Avoid claims that institutions must defend a zone or that every sweep causes reversal.",
        ],
      },
    ],
    keyTakeaways: ["Liquidity concepts can organize hypotheses but do not reveal hidden intent.", "SMC terms and drawing rules vary substantially."],
    commonMistakes: ["Treating inferred stops or order blocks as observable facts.", "Selecting zones retrospectively after a reaction."],
    relatedLessonIds: ["fundamentals-market-participants", "technical-market-structure", "strategies-backtesting-basics"],
  },
  {
    id: "technical-trendlines",
    title: "Trendlines and support/resistance",
    shortDescription: "Draw levels as zones and test them without false precision.",
    categoryId: "technical-analysis",
    topicGroup: "Tools and chart reading",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["support", "resistance", "trend line", "horizontal levels"],
    intro: "Trendlines and horizontal levels summarize prior reactions; they are approximate regions, not barriers.",
    sections: [
      {
        heading: "Drawing a useful reference",
        paragraphs: [
          "A trendline connects selected rising lows or falling highs. Horizontal support and resistance mark areas where price previously paused or turned. Different swing choices create different lines, and prices can pass through them.",
          "Treat a level as a zone appropriate to the instrument's volatility. More touches do not automatically make it stronger; repeated tests may also consume resting interest.",
        ],
      },
      {
        heading: "Make drawings reproducible",
        bullets: [
          "Choose swing rules and timeframe before drawing; record why a line would be invalidated.",
          "Do not move a line after a loss simply to make the original idea appear correct.",
        ],
      },
    ],
    keyTakeaways: ["Chart levels are approximate and analyst-dependent.", "A reaction at a level is uncertain and must be evaluated in context."],
    commonMistakes: ["Drawing through arbitrary points to fit a narrative.", "Assuming past support must hold again."],
    relatedLessonIds: ["technical-market-structure", "technical-triangles-flags-wedges", "technical-chart-reading"],
  },
  {
    id: "technical-indicators",
    title: "Moving averages, RSI, and MACD",
    shortDescription: "Understand what common indicators calculate and what they omit.",
    categoryId: "technical-analysis",
    topicGroup: "Tools and chart reading",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    aliases: ["SMA", "EMA", "relative strength index", "MACD", "technical indicators"],
    intro: "Indicators transform past price or volume data; they do not add certainty or independent information automatically.",
    sections: [
      {
        heading: "Three common tools",
        paragraphs: [
          "A simple moving average is the mean of a selected number of recent prices; an exponential moving average weights recent values more heavily. Both smooth data and lag turning points.",
          "RSI compares recent average gains and losses on a bounded scale. MACD compares moving averages and is often displayed with a signal line and histogram. Formula details, input prices, and settings may vary by platform.",
        ],
      },
      {
        heading: "Use with restraint",
        bullets: [
          "An 'overbought' RSI reading can persist in a strong rise; 'oversold' can persist in a decline.",
          "Indicators built from the same price series are often correlated. Adding more indicators can create redundancy rather than confirmation.",
          "Test settings on data not used to choose them and account for lag, costs, and regime changes.",
        ],
      },
    ],
    keyTakeaways: ["Indicators summarize historical inputs and necessarily have limitations.", "A threshold is not a trade instruction by itself."],
    commonMistakes: ["Treating RSI extremes as automatic reversals.", "Optimizing many indicator settings on the same historical sample."],
    relatedLessonIds: ["technical-chart-reading", "strategies-backtesting-basics"],
  },
  {
    id: "technical-chart-reading",
    title: "A practical chart-reading workflow",
    shortDescription: "Move from broad context to a testable, risk-aware observation.",
    categoryId: "technical-analysis",
    topicGroup: "Tools and chart reading",
    difficulty: "beginner",
    estimatedMinutes: 7,
    aliases: ["chart analysis", "top down analysis", "read price action"],
    intro: "A repeatable chart routine separates observation from prediction and keeps uncertainty visible.",
    sections: [
      {
        heading: "A simple sequence",
        bullets: [
          "Confirm the symbol, data source, timeframe, session, and whether prices are adjusted.",
          "Describe the broad regime: advancing, declining, ranging, or unclear. Mark only a few relevant swings and zones.",
          "Observe current price action and any pattern using explicit definitions; write down alternative explanations.",
          "If considering a trade, specify the trigger, invalidation, position risk, costs, and what would make you stand aside.",
        ],
      },
      {
        heading: "Keep evidence in proportion",
        paragraphs: [
          "A chart is a lossy view of a market. Apparent patterns can result from random variation, and different timeframes can conflict. A useful process records what was knowable at the time rather than annotating only after the outcome.",
        ],
      },
    ],
    keyTakeaways: ["Separate observations, interpretations, and decisions.", "A valid decision can have an adverse outcome; process quality is not the same as profit."],
    commonMistakes: ["Adding indicators until a preferred story appears.", "Ignoring data quality, timeframe, and the possibility of no trade."],
    relatedLessonIds: ["technical-candlestick-anatomy", "technical-market-structure", "risk-trade-planning"],
  },
  {
    id: "risk-position-sizing",
    title: "Position sizing from a risk limit",
    shortDescription: "Calculate a theoretical size from account risk and stop distance.",
    categoryId: "risk-management",
    topicGroup: "Position sizing",
    difficulty: "beginner",
    estimatedMinutes: 7,
    aliases: ["lot size", "position size", "risk per trade", "units calculation"],
    intro: "Position size connects a planned exit distance to a chosen loss limit; it cannot cap every real-world loss.",
    sections: [
      {
        heading: "Basic arithmetic",
        formula: "position units = cash risk / (entry-to-stop distance per unit)",
        paragraphs: [
          "For a linear instrument quoted in the account currency, a simplified formula is: position units = cash risk / (entry-to-stop distance per unit). If account equity is $10,000 and the hypothetical risk limit is 0.5%, cash risk is $10,000 x 0.005 = $50. With a $2 per-unit stop distance, size is $50 / $2 = 25 units before costs.",
          "If the stop distance is $2 per share but each share's value changes by $2 at the stop, 25 shares imply a planned $50 loss. This arithmetic assumes a fill at the stop and excludes fees, spread, gaps, FX conversion, and contract multipliers.",
        ],
      },
      {
        heading: "Instrument-specific adjustments",
        bullets: [
          "Futures, options, CFDs, FX, and leveraged products have different contract values, margin, and loss behavior. Verify tick value, multiplier, quote currency, and broker rules.",
          "Round size down to an allowed increment and recalculate the exposure. A stop does not guarantee the planned loss.",
        ],
      },
    ],
    keyTakeaways: ["Size follows from a defined risk amount and instrument-specific stop value.", "The planned risk is not a guaranteed maximum loss."],
    commonMistakes: ["Using account balance instead of a deliberate risk limit.", "Forgetting contract multipliers, currency conversion, or gap risk."],
    relatedLessonIds: ["risk-risk-reward", "risk-stop-and-gap-risk", "risk-trade-planning"],
    toolRoute: "/lot-size-calculator",
  },
  {
    id: "risk-risk-reward",
    title: "Risk, reward, and expectancy",
    shortDescription: "Compare planned outcomes using probabilities and costs.",
    categoryId: "risk-management",
    topicGroup: "Risk and reward",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    aliases: ["risk reward ratio", "R multiple", "expectancy", "win rate"],
    intro: "A reward-to-risk estimate describes a plan, not the probability that its target will be reached.",
    sections: [
      {
        heading: "Use consistent units",
        formula: "expectancy = (win probability x average win) - (loss probability x average loss)",
        paragraphs: [
          "If planned loss is $50 and planned gain is $100, the reward-to-risk ratio is $100 / $50 = 2:1 before costs. In R notation, a $50 planned loss is 1R and a $100 gain is 2R.",
          "A simplified expectancy is (win probability x average win) - (loss probability x average loss). For a hypothetical 40% win rate, $100 average win, and $50 average loss: 0.40 x $100 - 0.60 x $50 = $10 per trade before costs. This is an estimate, not a promise; observed rates and outcomes vary.",
        ],
      },
      {
        heading: "Interpret carefully",
        bullets: [
          "Include fees, spread, slippage, financing, partial exits, and unfilled trades when measuring outcomes.",
          "A favorable ratio alone says nothing about whether the setup reaches its target often enough.",
        ],
      },
    ],
    keyTakeaways: ["Compare planned gain and loss in the same units.", "Expectancy depends on both outcome size and frequency, and on costs."],
    commonMistakes: ["Assuming a 2:1 plan means twice as many wins as losses.", "Estimating win probability from a tiny or selectively chosen sample."],
    relatedLessonIds: ["risk-position-sizing", "strategies-backtesting-basics"],
    toolRoute: "/risk-management",
  },
  {
    id: "risk-stop-and-gap-risk",
    title: "Stops, gaps, and loss limits",
    shortDescription: "Understand what stops can and cannot control.",
    categoryId: "risk-management",
    topicGroup: "Protection and portfolio risk",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["stop loss", "stop order", "gap risk", "slippage risk"],
    intro: "Stops are risk-management instructions, not insurance against execution at a specific price.",
    sections: [
      {
        heading: "Trigger versus fill",
        paragraphs: [
          "A stop-market order commonly becomes a market order after its trigger condition is met. It prioritizes an exit but can fill at a worse price in a fast market or gap. A stop-limit adds a price boundary but may not execute at all.",
          "Some platforms use last-traded, bid, ask, or other trigger references. Check the venue's rules and simulate likely behavior before relying on an order.",
        ],
      },
      {
        heading: "Layer risk controls",
        bullets: [
          "Size positions for plausible adverse movement, not only the intended stop distance.",
          "Consider overnight announcements, illiquidity, correlated positions, and operational failure.",
        ],
      },
    ],
    keyTakeaways: ["A stop trigger and execution price are different concepts.", "Gaps and thin markets can exceed a planned loss."],
    commonMistakes: ["Describing stop distance as a guaranteed maximum loss.", "Using stop-limit orders without considering non-execution."],
    relatedLessonIds: ["fundamentals-orders-execution", "risk-position-sizing", "risk-portfolio-exposure"],
  },
  {
    id: "risk-portfolio-exposure",
    title: "Portfolio exposure and drawdown",
    shortDescription: "Consider correlated trades, concentration, and losing periods.",
    categoryId: "risk-management",
    topicGroup: "Protection and portfolio risk",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["portfolio risk", "correlation", "drawdown", "concentration risk"],
    intro: "Several positions can amount to one concentrated bet when their risks move together.",
    sections: [
      {
        heading: "Aggregate rather than isolate",
        paragraphs: [
          "Two trades in related assets may lose together. Correlations change over time, so historical diversification can weaken during stress. Consider total exposure by currency, sector, instrument, and scenario rather than only risk per trade.",
          "Drawdown is a decline from a prior account peak. A 20% decline on $10,000 leaves $8,000; returning from $8,000 to $10,000 requires a 25% gain because $2,000 / $8,000 = 0.25.",
        ],
      },
      {
        heading: "Plan resilience",
        bullets: [
          "Set exposure limits and a review process appropriate to personal circumstances and instrument risk.",
          "Stress-test clustered losses, gaps, and reduced liquidity; no historical scenario covers every future event.",
        ],
      },
    ],
    keyTakeaways: ["Per-trade sizing does not capture all portfolio risk.", "Loss recovery percentages are asymmetric."],
    commonMistakes: ["Assuming different tickers guarantee diversification.", "Increasing risk to quickly recover a drawdown."],
    relatedLessonIds: ["risk-position-sizing", "risk-stop-and-gap-risk", "psychology-losses"],
  },
  {
    id: "risk-trade-planning",
    title: "Write a trade plan before entry",
    shortDescription: "Specify a hypothesis, invalidation, size, and contingencies.",
    categoryId: "risk-management",
    topicGroup: "Risk and reward",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["trade plan", "invalidation", "pre-trade checklist"],
    intro: "A written plan makes assumptions visible and reduces the temptation to improvise under pressure.",
    sections: [
      {
        heading: "A compact plan",
        bullets: [
          "State the setup and the evidence that would trigger entry.",
          "Define the price or condition that invalidates the hypothesis and the exit instruction.",
          "Calculate position size, total exposure, costs, and plausible gap loss.",
          "Record target logic, event risks, and what you will do if the order only partially fills.",
        ],
      },
      {
        heading: "Allow for no trade",
        paragraphs: [
          "If the trigger, risk, or instrument details are unclear, waiting is a valid decision. A plan organizes uncertainty; it does not remove it or make a trade suitable for every person.",
        ],
      },
    ],
    keyTakeaways: ["Decide in advance what would change your view.", "A clear plan includes size and failure conditions, not just entry."],
    commonMistakes: ["Writing a rationale only after taking a position.", "Moving an invalidation level to avoid recording a loss."],
    relatedLessonIds: ["risk-position-sizing", "technical-chart-reading", "psychology-journaling"],
    toolRoute: "/risk-management",
  },
  {
    id: "fundamental-economic-drivers",
    title: "Economic drivers and market expectations",
    shortDescription: "Relate growth, inflation, rates, and expectations cautiously.",
    categoryId: "fundamental-analysis",
    topicGroup: "Economic context",
    difficulty: "beginner",
    estimatedMinutes: 7,
    aliases: ["macroeconomics", "interest rates", "inflation", "economic drivers"],
    intro: "Fundamental analysis studies factors that may affect value; markets respond to expectations as well as published data.",
    sections: [
      {
        heading: "A connected system",
        paragraphs: [
          "Growth, employment, inflation, fiscal policy, and central-bank decisions can influence rates, currencies, bonds, equities, and commodities through multiple channels. Relationships are not fixed: the same data can be interpreted differently across regimes.",
          "Prices often move before an announcement as expectations change. A result that is strong in absolute terms can still disappoint if it is weaker than expected.",
        ],
      },
      {
        heading: "Separate fact from forecast",
        bullets: [
          "Record the release, prior value, consensus estimate, and revisions from a reliable source.",
          "Treat a causal story as a hypothesis; unexpected positioning, policy, or external shocks may dominate.",
        ],
      },
    ],
    keyTakeaways: ["Markets price expectations, not just headline values.", "Macroeconomic relationships vary over time."],
    commonMistakes: ["Assuming a strong report must lift every related asset.", "Treating consensus or one economic model as certainty."],
    relatedLessonIds: ["fundamentals-events-calendar", "fundamentals-company-analysis"],
  },
  {
    id: "fundamentals-company-analysis",
    title: "Company and asset fundamentals",
    shortDescription: "Organize a basic review of business quality, valuation, and risk.",
    categoryId: "fundamental-analysis",
    topicGroup: "Company and asset analysis",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    aliases: ["financial statements", "valuation", "revenue and cash flow", "company analysis"],
    intro: "Fundamental research asks what can support or undermine an asset's value, without producing a certain fair price.",
    sections: [
      {
        heading: "Questions to investigate",
        bullets: [
          "How does the business earn revenue, and what affects its costs, margins, and competitive position?",
          "Review cash flow, debt, liquidity, dilution, and accounting notes alongside reported earnings.",
          "Compare valuation measures only among reasonably comparable businesses and understand their assumptions.",
          "For non-company assets, examine supply, demand, contract design, custody, and relevant policy or network risks.",
        ],
      },
      {
        heading: "Valuation is assumption-sensitive",
        paragraphs: [
          "A valuation model translates assumptions into an estimate; small changes to growth, discount rates, margins, or terminal value can change the result materially. Financial statements are historical and may be revised or affected by accounting choices.",
        ],
      },
    ],
    keyTakeaways: ["Use multiple sources and examine cash, debt, and business risks.", "A valuation is conditional on assumptions, not an objective guarantee."],
    commonMistakes: ["Relying on one ratio without comparing business models.", "Confusing a good company with an asset that is attractively priced."],
    relatedLessonIds: ["fundamental-economic-drivers", "fundamentals-events-calendar"],
  },
  {
    id: "fundamentals-events-calendar",
    title: "Economic calendars and event risk",
    shortDescription: "Prepare for scheduled releases and uncertainty around them.",
    categoryId: "fundamental-analysis",
    topicGroup: "Events and research",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["economic calendar", "earnings calendar", "news risk", "event trading"],
    intro: "A calendar helps identify scheduled events; it cannot predict their market impact.",
    sections: [
      {
        heading: "Prepare, do not predict",
        paragraphs: [
          "Central-bank decisions, inflation releases, employment reports, earnings, and policy announcements can coincide with wider spreads and rapid repricing. Check the event time, time zone, source, and whether a release has been revised.",
          "The direction of the first move may differ from the later response. Consensus, positioning, guidance, and details can matter as much as the headline.",
        ],
      },
      {
        heading: "Manage exposure",
        bullets: [
          "Know whether positions will be open during a scheduled event and what the instrument's overnight rules are.",
          "A calendar is incomplete for unscheduled news. Avoid relying on a scheduled stop fill in a gap.",
        ],
      },
    ],
    keyTakeaways: ["Scheduled events can change liquidity and volatility.", "A calendar informs preparation, not the result."],
    commonMistakes: ["Trading a headline without checking the actual release and context.", "Assuming all event risk is listed in advance."],
    relatedLessonIds: ["fundamental-economic-drivers", "risk-stop-and-gap-risk"],
    toolRoute: "/economic-calendar",
  },
  {
    id: "fundamentals-research-sources",
    title: "Build a reliable research routine",
    shortDescription: "Check sources, timestamps, revisions, and alternative explanations.",
    categoryId: "fundamental-analysis",
    topicGroup: "Events and research",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["research methodology", "data quality", "market news sources"],
    intro: "Research quality depends on source quality and a transparent distinction between evidence and interpretation.",
    sections: [
      {
        heading: "Verify inputs",
        bullets: [
          "Prefer primary releases, filings, exchange notices, or clearly attributed data providers.",
          "Check units, period, currency, release time, revisions, and whether figures are seasonally adjusted.",
          "Keep the original observation separate from commentary or a forecast.",
        ],
      },
      {
        heading: "Keep uncertainty explicit",
        paragraphs: [
          "A concise daily brief can summarize known events and plausible scenarios, but should not imply that it knows the next price move. Confirm material claims independently and note when information is unavailable or stale.",
        ],
      },
    ],
    keyTakeaways: ["Timestamp and verify data before drawing conclusions.", "Separate observed facts, estimates, and interpretations."],
    commonMistakes: ["Repeating an unverified headline as established fact.", "Ignoring revisions or using a data point from the wrong period."],
    relatedLessonIds: ["fundamental-economic-drivers", "fundamentals-events-calendar"],
    toolRoute: "/daily-brief",
  },
  {
    id: "psychology-process-over-outcome",
    title: "Process over outcome",
    shortDescription: "Judge decisions by the information and rules available at the time.",
    categoryId: "trading-psychology",
    topicGroup: "Decision-making",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["process focused trading", "outcome bias", "decision quality"],
    intro: "A good process can produce a loss, and a poor process can occasionally produce a gain.",
    sections: [
      {
        heading: "Separate decision and result",
        paragraphs: [
          "Because each trade has an uncertain outcome, one result is weak evidence about whether a decision rule is sound. Review whether you followed a defined plan, used valid information, and respected risk limits.",
          "Over many observations, carefully collected results can help assess a method, but even a large sample may not represent a changed market regime.",
        ],
      },
      {
        heading: "Use a review checklist",
        bullets: [
          "Was the setup valid by the rule written before entry?",
          "Was exposure within plan, and were changes documented?",
          "What would you repeat or revise based on evidence rather than hindsight?",
        ],
      },
    ],
    keyTakeaways: ["Evaluate the decision process separately from one trade's result.", "Consistent review is more informative than reacting to a single outcome."],
    commonMistakes: ["Calling a risky rule good because it won once.", "Abandoning a tested process after a small run of losses."],
    relatedLessonIds: ["psychology-journaling", "strategies-backtesting-basics", "psychology-losses"],
  },
  {
    id: "psychology-losses",
    title: "Losses, drawdowns, and emotional control",
    shortDescription: "Recognize common reactions and use pre-planned boundaries.",
    categoryId: "trading-psychology",
    topicGroup: "Emotions and discipline",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["loss aversion", "revenge trading", "drawdown psychology", "fear and greed"],
    intro: "Uncertainty and losses can prompt impulsive decisions; practical limits help reduce the chance of escalation.",
    sections: [
      {
        heading: "Notice the pattern",
        paragraphs: [
          "After a loss, people may increase size to recover quickly, move a stop, or take a low-quality setup. After a win, overconfidence can lead to the same disregard for limits. These reactions are common but not inevitable.",
          "A losing streak does not by itself prove that a method has stopped working, and it also does not justify continuing without review.",
        ],
      },
      {
        heading: "Set guardrails",
        bullets: [
          "Define a maximum session loss, pause conditions, and when to seek an independent review before trading.",
          "Reduce exposure or step away when tired, distressed, or unable to follow the plan.",
        ],
      },
    ],
    keyTakeaways: ["Emotional guardrails should be decided before high-pressure moments.", "Protect wellbeing and capital rather than trying to force a recovery."],
    commonMistakes: ["Revenge trading to erase a loss immediately.", "Increasing risk because a recent outcome feels unusually certain."],
    relatedLessonIds: ["risk-portfolio-exposure", "psychology-process-over-outcome", "psychology-journaling"],
  },
  {
    id: "psychology-journaling",
    title: "Trading journals and review",
    shortDescription: "Record decisions in a way that supports honest learning.",
    categoryId: "trading-psychology",
    topicGroup: "Review and wellbeing",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["trade journal", "trading diary", "performance review"],
    intro: "A journal is useful when it captures decisions and context consistently, including trades that were not taken.",
    sections: [
      {
        heading: "What to record",
        bullets: [
          "Timestamp, instrument, timeframe, setup rule, entry and exit, planned risk, and actual costs.",
          "A chart or note showing what was visible before the outcome, plus any rule deviation.",
          "Market context, emotional state, and an alternative explanation where relevant.",
        ],
      },
      {
        heading: "Review without hindsight",
        paragraphs: [
          "Use fixed labels and review periods so categories remain comparable. Preserve the original plan; do not edit it after the result. Protect personal and financial data stored in a journal.",
        ],
      },
    ],
    keyTakeaways: ["Consistent records reveal process patterns that memory can distort.", "Include missed, invalid, and losing setups to reduce selection bias."],
    commonMistakes: ["Recording only winning trades.", "Changing labels or rules during analysis to improve apparent results."],
    relatedLessonIds: ["psychology-process-over-outcome", "strategies-backtesting-basics"],
  },
  {
    id: "psychology-routines",
    title: "Routines, attention, and boundaries",
    shortDescription: "Create sustainable limits around screen time and decision-making.",
    categoryId: "trading-psychology",
    topicGroup: "Emotions and discipline",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["trading discipline", "trading routine", "screen time", "wellbeing"],
    intro: "A routine can reduce avoidable decisions, but it cannot make an unsuitable or risky activity safe for everyone.",
    sections: [
      {
        heading: "A practical routine",
        bullets: [
          "Prepare relevant events and define the times you will and will not monitor markets.",
          "Use alerts and written rules rather than watching every price change.",
          "Schedule breaks, review exposure, and stop when attention or wellbeing deteriorates.",
        ],
      },
      {
        heading: "Keep boundaries",
        paragraphs: [
          "Never risk money needed for essentials, and consider whether trading is compatible with your circumstances. If market activity is causing significant distress or loss of control, pause and seek appropriate support.",
        ],
      },
    ],
    keyTakeaways: ["Attention and wellbeing are part of risk management.", "A deliberate pause is a valid part of a trading routine."],
    commonMistakes: ["Confusing more screen time with better decisions.", "Continuing while tired, distressed, or outside personal limits."],
    relatedLessonIds: ["psychology-losses", "psychology-journaling"],
  },
  {
    id: "strategies-rules-and-hypotheses",
    title: "Turn an idea into strategy rules",
    shortDescription: "Define observable conditions, exits, and scope before testing.",
    categoryId: "strategies-practice",
    topicGroup: "Strategy design",
    difficulty: "beginner",
    estimatedMinutes: 7,
    aliases: ["trading strategy", "trading system", "entry and exit rules"],
    intro: "A strategy becomes testable when its signals and decisions can be applied consistently without hindsight.",
    sections: [
      {
        heading: "Specify the method",
        bullets: [
          "Define eligible instruments, timeframe, data source, and trading sessions.",
          "Describe entry trigger, order type, stop or invalidation, exit, and position-size calculation.",
          "Write down exclusions such as scheduled events or poor liquidity.",
          "Choose evaluation measures and a comparison baseline before looking at results.",
        ],
      },
      {
        heading: "Keep rules operational",
        paragraphs: [
          "Terms such as 'strong trend' or 'clean breakout' need measurable definitions. If a rule requires judgment, document the judgment process and assess whether another reviewer can apply it similarly.",
        ],
      },
    ],
    keyTakeaways: ["Rules should be clear enough to reproduce.", "A strategy is a hypothesis to evaluate, not a guarantee of returns."],
    commonMistakes: ["Changing entry rules after seeing historical outcomes.", "Leaving costs, unfilled orders, or exclusions unspecified."],
    relatedLessonIds: ["strategies-backtesting-basics", "risk-trade-planning"],
  },
  {
    id: "strategies-backtesting-basics",
    title: "Backtesting without fooling yourself",
    shortDescription: "Test historical rules with realistic costs and out-of-sample data.",
    categoryId: "strategies-practice",
    topicGroup: "Backtesting",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    aliases: ["historical testing", "overfitting", "out of sample", "backtest"],
    intro: "A backtest estimates how fixed rules would have behaved on historical data; it cannot establish future performance.",
    sections: [
      {
        heading: "Design a credible test",
        bullets: [
          "Use timestamped data appropriate to the instrument and avoid look-ahead or survivorship bias.",
          "Model spread, commissions, slippage, financing, contract changes, and fills as realistically as possible.",
          "Separate development data from an untouched test period; consider walk-forward or paper validation.",
          "Compare with a simple baseline and report drawdown, trade count, exposure, and uncertainty, not only total return.",
        ],
      },
      {
        heading: "Interpret results modestly",
        paragraphs: [
          "Trying many variants and reporting only the best creates data-mining bias. A small sample can look compelling by chance; market structure and costs can change. Past test performance is not a prediction or promise.",
        ],
      },
    ],
    keyTakeaways: ["Avoid using the same data to invent and validate a strategy.", "Include realistic execution costs and examine adverse periods."],
    commonMistakes: ["Optimizing many parameters until historical results look ideal.", "Treating a backtest as a guarantee or as evidence of suitability."],
    relatedLessonIds: ["strategies-rules-and-hypotheses", "risk-risk-reward", "psychology-journaling"],
  },
  {
    id: "strategies-breakout-example",
    title: "A hypothetical breakout exercise",
    shortDescription: "Practice writing entry, failure, and risk rules for a simulated setup.",
    categoryId: "strategies-practice",
    topicGroup: "Simulated practice",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    aliases: ["breakout strategy", "paper trading exercise", "simulated example"],
    intro: "This is a hypothetical learning exercise using invented levels, not a live market example or recommendation.",
    sections: [
      {
        heading: "Simulated setup",
        paragraphs: [
          "Suppose a fictional asset has repeatedly traded inside a range from 48 to 52. For practice only, define a breakout trigger as a completed hourly close above 52, with no scheduled event in the exercise window. These numbers are invented and do not describe market data.",
          "A learner might record an entry rule, an invalidation condition back inside the range, and a maximum cash risk. The exercise does not assume that a breakout will continue; a false break is an equally relevant scenario.",
        ],
      },
      {
        heading: "Review both paths",
        bullets: [
          "Scenario A: price gaps above the trigger; compare the planned order with possible slippage or a missed fill.",
          "Scenario B: price closes above 52, then falls back into the range; follow the prewritten invalidation rule rather than improvising.",
          "Do not infer an edge from one example. Collect many simulated cases and then test fixed rules on separate data.",
        ],
      },
    ],
    keyTakeaways: ["The example is fictional and intended for simulation only.", "A breakout rule must describe false breaks and execution uncertainty."],
    commonMistakes: ["Treating an invented scenario as a current market setup.", "Counting only successful breakouts when reviewing the exercise."],
    relatedLessonIds: ["technical-triangles-flags-wedges", "strategies-rules-and-hypotheses", "risk-trade-planning"],
  },
  {
    id: "strategies-paper-practice",
    title: "Paper trading and deliberate practice",
    shortDescription: "Practice execution rules in simulation while recognizing its limits.",
    categoryId: "strategies-practice",
    topicGroup: "Simulated practice",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["paper trading", "demo account", "simulation practice"],
    intro: "Simulation can help rehearse rules, but it does not fully reproduce real execution or emotional stakes.",
    sections: [
      {
        heading: "Practice the process",
        bullets: [
          "Use the same entry, sizing, exit, and journal rules intended for evaluation.",
          "Record hypothetical fills using conservative assumptions for spread, partial fills, and slippage.",
          "Include no-trade decisions, losing sequences, and event conditions.",
        ],
      },
      {
        heading: "Know the gap to live markets",
        paragraphs: [
          "Demo fills may be instant or unrealistically favorable; liquidity, queue position, latency, and emotions differ with real exposure. A simulation is practice evidence, not proof of future profitability or suitability.",
        ],
      },
    ],
    keyTakeaways: ["Simulation is useful for rehearsing process, not predicting returns.", "Model execution conservatively and record deviations."],
    commonMistakes: ["Assuming demo results will transfer unchanged to live trading.", "Changing rules whenever a simulated trade loses."],
    relatedLessonIds: ["strategies-rules-and-hypotheses", "strategies-backtesting-basics", "psychology-journaling"],
  },
  {
    id: "fundamentals-forex-pairs",
    title: "Forex pairs: base, quote, major, and exotic",
    shortDescription: "Read a currency pair and understand what its quoted price means.",
    categoryId: "fundamentals",
    topicGroup: "Markets and instruments",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["forex", "currency pairs", "base currency", "quote currency", "majors", "minors", "exotics"],
    intro: "Forex quotes compare one currency with another; a pair's price is not the price of a single currency in isolation.",
    sections: [
      {
        heading: "Reading a pair",
        paragraphs: [
          "In EUR/USD, EUR is the base currency and USD is the quote currency. A hypothetical quote of 1.0800 means one euro is priced at 1.08 US dollars. If the quote rises, the euro has strengthened relative to the dollar under that quote convention; it does not mean every euro-related asset rose.",
          "Major pairs commonly include the US dollar and another heavily traded currency. Crosses or minors omit USD, while exotic pairs often combine a major currency with a less-traded one. Classifications vary by provider, and the labels do not guarantee low costs or high liquidity.",
        ],
      },
      {
        heading: "Contract details matter",
        bullets: [
          "Check the broker's symbol, contract size, quote precision, trading hours, and financing terms; symbols and specifications can differ.",
          "A currency's value is always relative to another currency, and multiple economic forces can move the relationship.",
        ],
      },
    ],
    keyTakeaways: ["The first currency is the base; the second is the quote.", "Major/minor/exotic are descriptive groupings, not risk ratings."],
    commonMistakes: ["Reversing the meaning of a pair's quote.", "Assuming an exotic pair is safe because the chart looks quiet."],
    relatedLessonIds: ["fundamentals-market-basics", "fundamentals-market-participants", "fundamentals-orders-execution"],
  },
  {
    id: "fundamentals-sessions-liquidity",
    title: "Forex sessions, liquidity, and volatility",
    shortDescription: "Understand trading hours and why activity changes through the day.",
    categoryId: "fundamentals",
    topicGroup: "Markets and instruments",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["forex sessions", "London session", "New York session", "Asian session", "market liquidity", "volatility"],
    intro: "Currency trading is decentralized and activity varies as financial centers open, overlap, and close.",
    sections: [
      {
        heading: "Sessions are time zones, not guarantees",
        paragraphs: [
          "Traders often describe Asian, London, and New York sessions. Their hours depend on daylight-saving changes and the convention being used. The London-New York overlap is often active, but activity and spreads vary by pair, day, news, and venue.",
          "Liquidity is the ability to trade without large price impact; volatility describes the degree of price variation over a period. They are related but not identical: a market can move sharply in thin conditions, and a liquid market can still be volatile.",
        ],
      },
      {
        heading: "Plan around conditions",
        bullets: [
          "Check the instrument's actual trading hours and your local time zone instead of relying on a fixed UTC offset year-round.",
          "News, holidays, rollover, and market closures can widen spreads or reduce available liquidity. A quiet chart does not prove low risk.",
        ],
      },
    ],
    keyTakeaways: ["Forex sessions describe regional activity, not fixed performance windows.", "Liquidity and volatility are distinct concepts."],
    commonMistakes: ["Treating an overlap as a guaranteed profitable period.", "Ignoring daylight-saving shifts or holiday conditions."],
    relatedLessonIds: ["fundamentals-forex-pairs", "fundamentals-orders-execution", "fundamentals-events-calendar"],
  },
  {
    id: "fundamentals-forex-prices-pips",
    title: "Bid, ask, spread, pips, and lot size",
    shortDescription: "Learn common FX price units and how trade size affects money at risk.",
    categoryId: "fundamentals",
    topicGroup: "Orders and execution",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["bid", "ask", "spread", "pip", "pip value", "lots", "position size"],
    intro: "Quotes, price increments, and contract size determine how price movement translates into trading cost or profit and loss.",
    sections: [
      {
        heading: "Quote and measure movement",
        paragraphs: [
          "The bid is the price at which a participant may sell and the ask is the price at which a participant may buy; the spread is the difference. A retail platform's exact display and execution rules depend on the provider.",
          "A pip is a conventional FX movement unit, often 0.0001 for many non-JPY pairs and 0.01 for many JPY pairs, but contract specifications and fractional pip display vary. Always confirm the symbol's tick size rather than assuming precision.",
        ],
      },
      {
        heading: "Size changes the cash effect",
        formula: "Approximate cash risk = stop distance in pips x pip value per lot x lot size",
        paragraphs: [
          "For illustration only, if a contract's pip value is $10 per standard lot, a 20-pip stop on 0.10 lot implies about $20 of price risk before spread, commissions, slippage, and conversion effects. Pip value varies by pair, account currency, and contract.",
          "A standard lot is often 100,000 base-currency units in retail FX, but mini, micro, and broker-specific contract sizes exist. Do not infer cash risk from the word 'lot' alone.",
        ],
      },
    ],
    keyTakeaways: ["Bid/ask spread is an immediate execution cost.", "Pip value and contract size must match the actual instrument."],
    commonMistakes: ["Using one pip value for every currency pair.", "Confusing chart decimal places with pip value or position size."],
    relatedLessonIds: ["risk-position-sizing", "risk-risk-reward", "fundamentals-orders-execution"],
    toolRoute: "/lot-size-calculator",
  },
  {
    id: "fundamentals-order-types-and-financing",
    title: "Order types, leverage, margin, and financing",
    shortDescription: "Compare common orders and the risks created by leverage and overnight positions.",
    categoryId: "fundamentals",
    topicGroup: "Orders and execution",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    aliases: ["market order", "limit order", "stop order", "leverage", "margin", "swap", "overnight financing", "slippage"],
    intro: "An order instruction is not a guarantee of its fill price, and leveraged products can magnify losses as well as gains.",
    sections: [
      {
        heading: "Order instructions differ",
        bullets: [
          "A market order prioritizes execution at available prices; it can slip in fast or thin markets.",
          "A limit order sets the worst acceptable price but may never fill. A stop order activates under specified conditions and can fill beyond its trigger during a gap.",
          "Broker terminology, trigger source, partial fills, and order duration vary. Read the product and platform rules.",
        ],
      },
      {
        heading: "Leverage and holding costs",
        paragraphs: [
          "Leverage allows a position's notional exposure to exceed the cash margin set aside. Margin is collateral, not a maximum-loss guarantee; a margin close-out may occur during a rapid move, and local protections differ.",
          "Holding a position overnight may incur or earn financing (often called swap or rollover). Rates, triple-charge days, holidays, and conversion rules depend on the broker and instrument. Include these costs in plans and testing.",
        ],
      },
    ],
    keyTakeaways: ["Market, limit, and stop instructions have different execution trade-offs.", "Leverage increases exposure and can accelerate losses; financing affects held positions."],
    commonMistakes: ["Assuming a stop guarantees the exact trigger price.", "Treating required margin as the full amount at risk."],
    relatedLessonIds: ["fundamentals-forex-prices-pips", "risk-leverage-and-ruin", "risk-stop-and-gap-risk"],
  },
  {
    id: "technical-forming-candles",
    title: "Forming candles and completed-candle context",
    shortDescription: "Separate a live candle's changing shape from a confirmed historical bar.",
    categoryId: "technical-analysis",
    topicGroup: "Candlesticks",
    difficulty: "beginner",
    estimatedMinutes: 5,
    aliases: ["current candle", "still forming", "completed candle", "OHLC", "latest candle"],
    intro: "A candle's open, high, low, and close summarize one chosen interval, but its close is final only after that interval ends.",
    sections: [
      {
        heading: "A candle changes before it closes",
        paragraphs: [
          "While a candle is forming, its high, low, and current price can change. A green or red body may shrink, grow, or switch direction before the interval completes. A screenshot can capture a moment that does not match the candle's eventual close.",
          "Completed candles preserve an interval's final OHLC values. On a chart's right edge, identify whether the last bar is partial, whether a separate current-price marker is visible, and which timeframe each bar represents.",
        ],
      },
      {
        heading: "Avoid reading old prices as current",
        bullets: [
          "Do not label a previous completed candle's close as today's current quote.",
          "If the price scale or current marker is unclear, state that the screenshot does not provide a reliable current price rather than estimating one.",
        ],
      },
    ],
    keyTakeaways: ["A forming bar is provisional; its final close is not yet known.", "State whether a price is a screenshot observation or a live quote."],
    commonMistakes: ["Treating a forming candle's shape as fixed.", "Using an earlier candle close as the current market price."],
    relatedLessonIds: ["technical-candlestick-anatomy", "technical-chart-reading", "risk-trade-planning"],
  },
  {
    id: "technical-classic-patterns",
    title: "Triple tops, bottoms, wedges, and pattern failures",
    shortDescription: "Compare repeated swing patterns and plan for false breaks.",
    categoryId: "technical-analysis",
    topicGroup: "Chart patterns",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    aliases: ["triple top", "triple bottom", "rising wedge", "falling wedge", "false breakout", "neckline"],
    intro: "Chart patterns are names for price geometry. Their interpretations vary, and none guarantees a reversal or continuation.",
    sections: [
      {
        heading: "Describe before you label",
        paragraphs: [
          "A triple top or bottom describes three tests of a broadly similar price area; a neckline or range boundary is often used as a reference. Peaks and troughs need not be equal, and three tests can lead to either a break or continued range trading.",
          "A rising wedge has converging boundaries that slope upward; a falling wedge converges while sloping downward. Traders may interpret them as possible exhaustion or continuation formations, but that interpretation is not a law. Textbook tendency is not confirmation.",
        ],
      },
      {
        heading: "Define confirmation and invalidation",
        bullets: [
          "Choose the timeframe, swing-selection rule, and whether a close, volume condition, or retest is required before looking for a trade.",
          "Plan for price to return inside the pattern, gap past an entry, or invalidate the idea before a fill. Test false breaks as well as clean textbook examples.",
        ],
      },
    ],
    keyTakeaways: ["Pattern geometry does not reveal the next direction.", "Predefine a confirmation rule and invalidation point."],
    commonMistakes: ["Calling any three nearby highs a triple top.", "Ignoring examples that fail or retesting after seeing the outcome."],
    relatedLessonIds: ["technical-double-tops-bottoms", "technical-head-and-shoulders", "technical-triangles-flags-wedges"],
  },
  {
    id: "technical-market-regimes",
    title: "Trends, ranges, continuation, and reversals",
    shortDescription: "Describe the market regime before choosing a chart hypothesis.",
    categoryId: "technical-analysis",
    topicGroup: "Market structure",
    difficulty: "beginner",
    estimatedMinutes: 6,
    aliases: ["uptrend", "downtrend", "range-bound", "market regime", "breakout", "retest", "reversal", "continuation"],
    intro: "A regime label summarizes past structure; it does not establish what price will do next.",
    sections: [
      {
        heading: "Classify observable behavior",
        paragraphs: [
          "An uptrend is commonly described by successive higher swing highs and higher swing lows; a downtrend by lower highs and lower lows. In a range, price repeatedly trades between approximate boundaries without a sustained directional sequence. Swing rules differ among analysts.",
          "A continuation hypothesis expects the existing move to resume after a pause. A reversal hypothesis expects a change in the prior sequence. A breakout is a move beyond a selected boundary; a retest is a later return toward it. None is confirmed by its label alone.",
        ],
      },
      {
        heading: "Keep timeframe and invalidation explicit",
        bullets: [
          "A short-timeframe breakout may occur inside a higher-timeframe range. State which timeframe supports each claim.",
          "Define what would disprove the hypothesis before entry, and include false-break and gap scenarios.",
        ],
      },
    ],
    keyTakeaways: ["Describe swing evidence and timeframe rather than relying on labels alone.", "A breakout, retest, continuation, or reversal can fail."],
    commonMistakes: ["Calling one candle a confirmed trend reversal.", "Changing timeframes selectively after a setup fails."],
    relatedLessonIds: ["technical-market-structure", "technical-triangles-flags-wedges", "technical-chart-reading"],
  },
  {
    id: "technical-liquidity-zones",
    title: "Buy-side and sell-side liquidity concepts",
    shortDescription: "Understand common liquidity-zone language without claiming to see hidden orders.",
    categoryId: "technical-analysis",
    topicGroup: "Liquidity and SMC",
    difficulty: "advanced",
    estimatedMinutes: 7,
    aliases: ["buy-side liquidity", "sell-side liquidity", "equal highs", "equal lows", "premium", "discount", "mitigation", "imbalance"],
    intro: "Some price-action frameworks use visible swing levels to hypothesize where orders may cluster; a chart cannot confirm hidden orders or intent.",
    sections: [
      {
        heading: "Common vocabulary",
        paragraphs: [
          "Buy-side liquidity is often used for hypothetical buy stops above visible highs; sell-side liquidity for hypothetical sell stops below visible lows. Equal highs and equal lows can make these zones salient to a chart reader, but they do not prove orders are actually there.",
          "Some Smart Money Concepts frameworks divide a chosen range into premium and discount halves, or mark a prior impulse zone as an order block. Mitigation and imbalance rules are methodology-specific. A fair value gap is commonly defined using a three-candle non-overlap, but definitions vary.",
        ],
      },
      {
        heading: "Use as testable hypotheses",
        bullets: [
          "State exactly how a level is drawn and what observable event would confirm or invalidate the idea.",
          "A wick beyond equal highs may be called a sweep in some frameworks; it can also be ordinary volatility. Price is not required to reverse or fill an imbalance.",
        ],
      },
    ],
    keyTakeaways: ["Visible levels are observable; the presumed orders behind them are not.", "SMC labels and zone rules are not standardized."],
    commonMistakes: ["Calling every wick a stop hunt.", "Assuming every imbalance must fill or every order block must hold."],
    relatedLessonIds: ["technical-liquidity-smc", "technical-market-structure", "technical-forming-candles"],
  },
  {
    id: "technical-volume-data",
    title: "Volume, indicators, and data limitations",
    shortDescription: "Ask what an indicator or volume feed measures before using it as confirmation.",
    categoryId: "technical-analysis",
    topicGroup: "Tools and chart reading",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["volume", "tick volume", "market data", "indicator limitations"],
    intro: "Charts display measurements from a provider; missing, aggregated, or venue-specific data can change their meaning.",
    sections: [
      {
        heading: "Know the feed",
        paragraphs: [
          "Exchange-traded products may report venue volume, while spot FX is decentralized and chart volume is often a provider-specific tick count rather than a consolidated count of all contracts. The same volume display can therefore differ across brokers.",
          "Indicators such as moving averages, RSI, and MACD transform historical prices. They may lag, share inputs, or disagree across lookback settings. A second indicator derived from the same candles is not necessarily independent evidence.",
        ],
      },
      {
        heading: "Use a repeatable method",
        bullets: [
          "Record the source, timeframe, and settings, and avoid claims that unavailable volume is visible.",
          "Compare indicator observations with price structure and test fixed rules on data not used to design them.",
        ],
      },
    ],
    keyTakeaways: ["Volume quality depends on market structure and the provider's feed.", "Indicators summarize data; they do not remove uncertainty."],
    commonMistakes: ["Treating spot-FX tick volume as total global traded volume.", "Stacking correlated indicators and calling them independent confirmation."],
    relatedLessonIds: ["technical-indicators", "technical-chart-reading", "strategies-backtesting-basics"],
  },
  {
    id: "risk-leverage-and-ruin",
    title: "Leverage, margin, and risk of ruin",
    shortDescription: "See how repeated losses, leverage, and recovery math affect account survival.",
    categoryId: "risk-management",
    topicGroup: "Protection and portfolio risk",
    difficulty: "advanced",
    estimatedMinutes: 7,
    aliases: ["leverage risk", "margin call", "risk of ruin", "account ruin", "drawdown recovery"],
    intro: "Risk controls can reduce exposure but cannot make trading safe or guarantee that an account avoids severe loss.",
    sections: [
      {
        heading: "Leverage magnifies exposure",
        paragraphs: [
          "If an account posts $1,000 of margin for a $20,000 notional position, the notional-to-margin ratio is 20:1. This does not cap possible loss at $1,000. Price movement, gaps, liquidation rules, fees, and legal protections determine outcomes.",
          "Risk of ruin describes the chance of reaching a defined unacceptable capital threshold under a particular model. It depends on the distribution and dependence of returns, risk size, costs, and the threshold. No simple calculator can know the true future distribution.",
        ],
      },
      {
        heading: "Losses change recovery requirements",
        formula: "After a 20% drawdown, remaining capital is 80%; recovery requires a 25% gain on that reduced capital.",
        bullets: [
          "A sequence of losses can erode capital even when each planned risk seems small; reduce exposure or stop at predetermined limits rather than escalating to recover.",
          "Stress-test gaps, correlated positions, and costs beyond the intended stop.",
        ],
      },
    ],
    keyTakeaways: ["Margin is collateral, not the maximum possible loss.", "Risk of ruin is model-dependent; smaller risk does not eliminate loss."],
    commonMistakes: ["Increasing leverage because a stop appears close.", "Assuming a long losing streak is impossible after several wins."],
    relatedLessonIds: ["risk-position-sizing", "risk-portfolio-exposure", "risk-stop-and-gap-risk"],
    toolRoute: "/risk-management",
  },
  {
    id: "risk-streaks-and-loss-limits",
    title: "Losing streaks, daily limits, and capital protection",
    shortDescription: "Plan how to pause and reduce exposure during adverse periods.",
    categoryId: "risk-management",
    topicGroup: "Protection and portfolio risk",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["consecutive losses", "losing streak", "daily loss limit", "weekly loss limit", "volatile markets"],
    intro: "A plan for an adverse sequence is more useful when written before emotions or urgency rise.",
    sections: [
      {
        heading: "Plan limits in advance",
        paragraphs: [
          "A daily or weekly loss limit is a personal risk control, not a promise that losses stop exactly at that number. Gaps, multiple open positions, fees, conversion, or system outages can move realized loss beyond a planned threshold.",
          "Decide when to stop opening new positions, how existing positions are handled, and when to review the plan. A limit should not be reset during the period merely to continue trading.",
        ],
      },
      {
        heading: "Volatility changes execution",
        bullets: [
          "When spreads widen or news creates gaps, a fixed position size may create more risk than expected. Reduce size, stand aside, or use a different pretested rule.",
          "Smaller risk per trade can make a losing sequence more survivable, but cannot prevent losses or guarantee recovery.",
        ],
      },
    ],
    keyTakeaways: ["Set stop-trading conditions and review rules before a losing streak.", "Risk controls can be exceeded by gaps or execution failure."],
    commonMistakes: ["Doubling size to recover after consecutive losses.", "Treating daily limits as exact loss caps in all market conditions."],
    relatedLessonIds: ["risk-leverage-and-ruin", "psychology-losses", "risk-trade-planning"],
    toolRoute: "/risk-management",
  },
  {
    id: "fundamental-economic-releases",
    title: "Inflation, jobs, growth, and economic releases",
    shortDescription: "Interpret CPI, PPI, employment, GDP, and retail-sales data in context.",
    categoryId: "fundamental-analysis",
    topicGroup: "Economic context",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["CPI", "consumer price index", "PPI", "producer price index", "employment reports", "GDP", "retail sales", "inflation"],
    intro: "Economic reports provide partial, revised measurements of an economy; currency reactions depend on context and expectations.",
    sections: [
      {
        heading: "What common reports measure",
        bullets: [
          "CPI estimates changes in a consumer-price basket; PPI tracks prices received by producers under a particular methodology. Neither is a perfect measure of every household or business cost.",
          "Employment reports measure labor-market conditions through surveys and administrative sources; definitions, revisions, and seasonal adjustments matter.",
          "GDP estimates aggregate economic output over a period and is revised. Retail-sales reports track selected sales measures, not every part of household demand.",
        ],
      },
      {
        heading: "Read the release with care",
        paragraphs: [
          "Markets compare an actual release with forecasts, previous readings, revisions, and the detail underneath the headline. A higher inflation number may affect expected policy, but its significance depends on what was anticipated and on other data.",
          "The values and example definitions in this lesson are educational, not current market figures. Check a current primary source and the time zone before drawing conclusions.",
        ],
      },
    ],
    keyTakeaways: ["Reports are estimates with methodologies and possible revisions.", "A headline number alone does not determine a currency's direction."],
    commonMistakes: ["Treating one data point as a complete picture of an economy.", "Confusing month-over-month, year-over-year, seasonally adjusted, and unadjusted values."],
    relatedLessonIds: ["fundamental-economic-policy", "fundamentals-events-calendar", "fundamentals-research-sources"],
  },
  {
    id: "fundamental-economic-policy",
    title: "Central banks, interest rates, and policy language",
    shortDescription: "Learn how policy expectations can influence currencies without assuming a fixed reaction.",
    categoryId: "fundamental-analysis",
    topicGroup: "Economic context",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    aliases: ["central bank", "monetary policy", "hawkish", "dovish", "interest rates", "recession", "geopolitical risk"],
    intro: "Central-bank policy is one influence on currency markets, but its effect depends on relative expectations and other conditions.",
    sections: [
      {
        heading: "Policy and relative rates",
        paragraphs: [
          "Central banks set or influence policy rates and communicate how they assess inflation, employment, and growth. A hawkish description usually suggests greater concern about inflation or tighter policy; dovish usually signals more emphasis on support or easier conditions. These are shorthand labels, not formal predictions.",
          "A currency pair compares two economies. A rate increase can already be priced in, or traders may focus on guidance, risk sentiment, real yields, or developments in the other country. Therefore the same announcement can lead to different price reactions.",
        ],
      },
      {
        heading: "Broader conditions",
        bullets: [
          "Growth, recession risk, fiscal decisions, and geopolitical events can change forecasts and risk appetite; outcomes and transmission channels are uncertain.",
          "Use dated, reputable sources and separate confirmed facts from interpretation. FXSnap's Economic Calendar and Daily Brief can help locate event information, but their current data must be checked at the time of use.",
        ],
      },
    ],
    keyTakeaways: ["Relative expectations matter for a currency pair.", "Hawkish/dovish are interpretations; news reactions are not mechanical."],
    commonMistakes: ["Assuming a rate rise always strengthens a currency.", "Trading a label without checking what was already expected."],
    relatedLessonIds: ["fundamental-economic-releases", "fundamentals-events-calendar", "fundamentals-research-sources"],
    toolRoute: "/daily-brief",
  },
  {
    id: "fundamental-market-expectations",
    title: "Actual, forecast, previous, and market expectations",
    shortDescription: "Read economic-calendar fields and understand why surprises can still move unpredictably.",
    categoryId: "fundamental-analysis",
    topicGroup: "Events and research",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["actual vs forecast", "previous value", "economic calendar", "news trading", "market expectations"],
    intro: "An economic release is interpreted against a shifting baseline of expectations, not in isolation.",
    sections: [
      {
        heading: "Compare like with like",
        paragraphs: [
          "An economic calendar may list a new actual value, a forecast consensus, and a previous reading. Check units, reference period, revision status, and whether the values are comparable. A blank actual value usually means the release has not occurred or is not yet published by that source.",
          "A result can beat a forecast yet still be viewed as weak relative to market positioning, prior revisions, subcomponents, or a competing release. Expectations are not directly observable as a single complete market belief.",
        ],
      },
      {
        heading: "Event risk is two-sided",
        bullets: [
          "Prices may move before release; spreads can widen and liquidity can change around the event.",
          "Use the Economic Calendar to check scheduled times and the Daily Brief for context, then verify the original release. Do not treat an educational example as current data.",
        ],
      },
    ],
    keyTakeaways: ["Actual, forecast, and previous fields require comparable units and periods.", "A surprise does not dictate a simple trade direction."],
    commonMistakes: ["Reading a revised previous number as the original one.", "Assuming a positive surprise must strengthen the related currency."],
    relatedLessonIds: ["fundamental-economic-releases", "fundamental-economic-policy", "risk-streaks-and-loss-limits"],
    toolRoute: "/economic-calendar",
  },
  {
    id: "psychology-biases-and-fomo",
    title: "FOMO, confirmation bias, and overconfidence",
    shortDescription: "Notice common thinking traps and use a pause to return to written rules.",
    categoryId: "trading-psychology",
    topicGroup: "Decision-making",
    difficulty: "intermediate",
    estimatedMinutes: 6,
    aliases: ["FOMO", "fear of missing out", "confirmation bias", "overconfidence", "impatience", "loss aversion"],
    intro: "Behavioral biases can influence decisions, but noticing them is a practice—not a guarantee of better outcomes.",
    sections: [
      {
        heading: "Recognize the pattern",
        bullets: [
          "FOMO can make a trader chase a move after the planned entry has passed; impatience can turn waiting into an unplanned position.",
          "Confirmation bias favors evidence that supports an existing view and discounts contradictory evidence. Write down what would prove the idea wrong before entry.",
          "Overconfidence may follow a winning streak; loss aversion may encourage holding a loser or closing a winner too early. Both can conflict with a tested plan.",
        ],
      },
      {
        heading: "A practical pause",
        paragraphs: [
          "Before acting, name the setup rule, maximum risk, invalidation point, and one alternative explanation. If those are unclear, a no-trade decision is valid. Psychology tools do not make a strategy profitable by themselves.",
        ],
      },
    ],
    keyTakeaways: ["Record disconfirming evidence as well as supporting evidence.", "A missed trade does not create an obligation to chase it."],
    commonMistakes: ["Changing rules to explain away contradictory evidence.", "Treating a short winning streak as proof of skill."],
    relatedLessonIds: ["psychology-process-over-outcome", "psychology-losses", "psychology-journaling"],
  },
  {
    id: "psychology-revenge-and-overtrading",
    title: "Revenge trading, overtrading, and discipline",
    shortDescription: "Build practical guardrails for impulsive entries and trading after losses.",
    categoryId: "trading-psychology",
    topicGroup: "Emotions and discipline",
    difficulty: "intermediate",
    estimatedMinutes: 5,
    aliases: ["revenge trading", "overtrading", "emotional discipline", "trading after a loss"],
    intro: "A pause after an emotional trigger can protect a decision process, even though it cannot control market outcomes.",
    sections: [
      {
        heading: "Interrupt the cycle",
        paragraphs: [
          "Revenge trading is an attempt to quickly recover a loss, often through a larger size or a lower-quality entry. Overtrading can arise from boredom, urgency, or treating activity as progress. The extra trade may have no tested edge and can compound costs.",
          "Loss aversion can make accepting a small planned loss feel worse than allowing it to grow. Moving a stop farther away changes the risk plan; it does not remove the underlying exposure.",
        ],
      },
      {
        heading: "Set a routine before the session",
        bullets: [
          "Use written limits for trades, risk, and a cooling-off period after a rule violation or loss threshold.",
          "Record the trigger and the action you took. Ask for qualified support if trading is causing distress or interfering with finances or wellbeing.",
        ],
      },
    ],
    keyTakeaways: ["A pause and a no-trade choice are part of a disciplined process.", "Do not increase risk to recover a previous loss."],
    commonMistakes: ["Believing that more trades necessarily mean more learning.", "Removing a loss limit while upset or under time pressure."],
    relatedLessonIds: ["psychology-biases-and-fomo", "psychology-routines", "risk-streaks-and-loss-limits"],
  },
  {
    id: "strategies-entry-exit-and-review",
    title: "Entry, exit, management, and performance review",
    shortDescription: "Specify a complete trading process and evaluate decisions separately from outcomes.",
    categoryId: "strategies-practice",
    topicGroup: "Strategy design",
    difficulty: "intermediate",
    estimatedMinutes: 7,
    aliases: ["entry conditions", "exit conditions", "trade management", "trading checklist", "process quality"],
    intro: "A strategy needs rules for when to act, when the idea fails, how much to risk, and how to review it.",
    sections: [
      {
        heading: "Write the complete rule set",
        bullets: [
          "Define eligible instrument, timeframe, market condition, entry trigger, and any required confirmation.",
          "Define the stop or invalidation condition, exit or target logic, position sizing, and what happens if the market gaps.",
          "Specify exclusions such as a missing price reference, spread threshold, or scheduled event. Include a no-trade outcome.",
        ],
      },
      {
        heading: "Review process and outcome separately",
        paragraphs: [
          "A trade that followed the plan can lose; an impulsive trade can win by chance. Record both process adherence and outcome, costs, and uncertainty. Evaluate groups of trades using a defined sample and do not change rules after every result.",
        ],
      },
    ],
    keyTakeaways: ["Predefine entry, exit, invalidation, risk, and exclusions.", "One result cannot establish whether a process has an edge."],
    commonMistakes: ["Reviewing only winning examples.", "Calling an unplanned lucky outcome a good process."],
    relatedLessonIds: ["strategies-rules-and-hypotheses", "risk-trade-planning", "strategies-backtesting-basics"],
  },
  {
    id: "fundamentals-choosing-a-forex-broker",
    title: "Choosing and checking a forex broker",
    shortDescription: "Compare regulation, execution terms, account safeguards, and costs before opening an account.",
    categoryId: "fundamentals",
    topicGroup: "Markets and instruments",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["broker due diligence", "forex broker", "client money", "broker regulation"],
    intro: "A broker affects how an order reaches the market and what protections and costs apply to your account.",
    sections: [
      {
        heading: "Check the legal entity, not just the brand",
        paragraphs: [
          "A trading brand may operate through different legal entities in different countries. Before depositing funds, identify the entity that would hold your account and verify its authorisation directly with the relevant regulator's public register. Check that the register's website address is genuine, the firm name matches, and the permission covers the service being offered. A logo or a link on a broker's own website is not independent verification.",
          "Regulation and compensation arrangements differ by jurisdiction and product. Read the client agreement to learn whether you are trading a rolling spot product, a contract for difference, or another instrument; what happens if the provider becomes insolvent; and how complaints are handled. Protections may not apply to every client or account type, so do not assume that a regulated brand guarantees reimbursement or prevents losses.",
        ],
      },
      {
        heading: "Compare the complete trading conditions",
        paragraphs: [
          "Review spreads, commissions, overnight financing, deposit and withdrawal charges, inactivity fees, minimum trade size, margin rules, and the broker's handling of volatile markets. A low advertised spread is only one component of total cost and may apply only under selected conditions. Compare the same instrument, account type, time period, and order size when evaluating published figures.",
          "Read how orders are executed, whether partial fills or requotes can occur, and how stop orders behave around gaps. Test the platform and customer support with small, non-sensitive questions before committing. Never send money to a personal account or rely on pressure, guaranteed-return claims, or a salesperson's verbal promise. Keep records of the terms you accepted and use funds you can afford to lose.",
        ],
      },
    ],
    keyTakeaways: ["Verify the exact legal entity and its permissions independently.", "Compare total costs, execution rules, and withdrawal terms before funding an account."],
    commonMistakes: ["Assuming a familiar brand name identifies the regulated entity.", "Choosing a provider from a headline spread or promised returns alone."],
    relatedLessonIds: ["fundamentals-market-basics", "fundamentals-orders-execution", "fundamentals-order-types-and-financing"],
    practicePrompt: "Compare two hypothetical broker termsheets. List the legal entity, regulator, spread, commission, margin policy, and withdrawal rules you would verify before considering an account.",
  },
  {
    id: "fundamentals-trading-account-equity-margin",
    title: "Trading account balance, equity, and margin",
    shortDescription: "Understand the account figures that change as positions and costs change.",
    categoryId: "fundamentals",
    topicGroup: "Markets and instruments",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["account equity", "used margin", "free margin", "margin level"],
    intro: "Balance, equity, and available margin describe different parts of an account; none is a measure of safe risk by itself.",
    sections: [
      {
        heading: "Balance is not the same as equity",
        paragraphs: [
          "Account balance generally reflects booked deposits, withdrawals, and closed trade results. Equity commonly combines balance with the current unrealised result of open positions, with exact display rules set by the provider. If open positions move against you, equity can fall while the displayed balance has not yet changed. Financing, commissions, and other charges may also affect the values according to when the platform books them.",
          "Free margin is often calculated from equity less margin currently required for open positions. Margin level is commonly expressed as equity divided by used margin, multiplied by 100, but firms can use different terms and thresholds. These figures describe collateral and current exposure; free margin is not a recommended amount to risk and a high margin level does not make a position low-risk.",
        ],
      },
      {
        heading: "Know the provider's intervention rules",
        paragraphs: [
          "A margin call, close-out level, or stop-out policy describes what a provider may do when account equity becomes inadequate relative to required margin. The trigger, order in which positions may be closed, warning method, and treatment during fast markets depend on the contract and provider. A warning may not arrive before action when prices move quickly or a market gaps.",
          "Before trading, find the exact margin and liquidation terms for your instrument and account jurisdiction. Work through a hypothetical adverse move using the provider's calculator, including costs and a possible gap. Keep position risk and account-level exposure within written limits rather than using all available margin. If the account display or contract terms are unclear, ask the provider before opening a position.",
        ],
      },
    ],
    keyTakeaways: ["Balance, equity, and free margin are different account measures.", "Margin availability is not a substitute for a risk limit or a guaranteed buffer."],
    commonMistakes: ["Treating free margin as money that is safe to expose.", "Assuming margin-call or stop-out rules are identical across providers."],
    relatedLessonIds: ["fundamentals-order-types-and-financing", "risk-leverage-and-ruin", "risk-portfolio-exposure"],
    practicePrompt: "Use a hypothetical account statement to distinguish balance, unrealised P/L, equity, used margin, and free margin. Then explain which provider rules you would check before trading.",
  },
  {
    id: "technical-timeframes-and-candle-close",
    title: "Timeframes, candle closes, and chart context",
    shortDescription: "Compare chart intervals and avoid mixing unfinished and completed candle evidence.",
    categoryId: "technical-analysis",
    topicGroup: "Tools and chart reading",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["chart timeframe", "timeframe alignment", "candle close", "multi timeframe analysis"],
    intro: "A timeframe changes how price data is grouped; it does not change the underlying market or guarantee a clearer signal.",
    sections: [
      {
        heading: "A candle summarises an interval",
        paragraphs: [
          "On a one-hour chart, each completed candle summarises the open, high, low, and close recorded during an hour under the chart provider's time convention. A daily candle groups a longer interval. The same market movement can look like a large sequence of small candles on one chart and a few wider candles on another. Neither view is automatically the correct one; each answers questions at a different scale.",
          "Until its interval ends, a candle's high, low, and close can still change. A wick that appears to reject a level during an unfinished candle may disappear or become a body before the close. If a method requires a candle close beyond a level, apply that rule only after the relevant candle is complete and note the data feed and timezone used.",
        ],
      },
      {
        heading: "Keep context and execution rules distinct",
        paragraphs: [
          "Some traders use a higher timeframe to describe broad context and a lower timeframe to specify an entry condition. This can organise observation, but adding charts does not create independent evidence when the same price data is being viewed repeatedly. Decide in advance which chart defines the market condition, which defines the trigger, and what would invalidate the idea.",
          "Write down the chosen intervals before reviewing a chart. Compare like-for-like historical examples and do not switch timeframes after seeing an inconvenient candle. A higher interval may hide detail and a lower interval may add noise, spreads, and decision pressure. Choose intervals that match a tested plan and your available review time, then record uncertainty rather than calling visual agreement a guarantee.",
        ],
      },
    ],
    keyTakeaways: ["An unfinished candle can change before its interval closes.", "Define the role of each timeframe before interpreting a chart."],
    commonMistakes: ["Calling an intrabar wick a confirmed candle-close event.", "Adding timeframes until a chart seems to agree with a preferred view."],
    relatedLessonIds: ["technical-forming-candles", "technical-chart-reading", "technical-market-structure"],
    practicePrompt: "Choose one completed and one still-forming candle in a chart replay. Record their intervals, what can still change, and which timeframe your hypothetical rule uses for context versus trigger.",
  },
  {
    id: "risk-setting-a-risk-budget",
    title: "Setting a risk budget before a trade",
    shortDescription: "Translate a written account-level loss limit into a consistent per-idea budget.",
    categoryId: "risk-management",
    topicGroup: "Position sizing",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["risk budget", "risk per trade", "account risk limit"],
    intro: "A risk budget is a planning limit for a possible loss, not a target that must be used on every trade.",
    sections: [
      {
        heading: "Choose the limit before looking for a setup",
        paragraphs: [
          "A risk budget begins with a clear account reference, such as current equity or a separately defined capital amount, and a maximum planned loss for one idea or a group of correlated positions. If an educational example uses a 0.5% budget on a hypothetical $10,000 account, the arithmetic amount is $50 before fees, slippage, and gaps. The example does not recommend that percentage or account size.",
          "A budget should reflect personal circumstances, experience, instrument behavior, and the possibility that the realised loss can exceed the planned amount. A stop order is not a guarantee of an exit at its trigger. Define daily and weekly loss limits as well as per-position limits, and decide what happens when a limit is reached before emotions or market movement can influence the rule.",
        ],
      },
      {
        heading: "Let the invalidation distance determine size",
        paragraphs: [
          "After identifying where a trade idea would be invalidated, measure the entry-to-stop distance in the instrument's correct units. Position size is then derived from the cash risk budget and the value of that distance for the specific contract. A wider stop generally requires a smaller size to keep the same planned cash exposure; a tighter stop does not justify a larger position unless the calculation, costs, and execution assumptions still fit the budget.",
          "Check the result against minimum size, lot increments, pip or tick value, account currency conversion, commissions, and margin rules. If the smallest permitted size exceeds the budget, skip the setup or use a suitable instrument; do not quietly increase the risk limit. Record the assumptions so the calculation can be repeated and audited.",
        ],
      },
    ],
    keyTakeaways: ["Set a cash risk ceiling before deciding position size.", "If the instrument cannot fit the written limit, declining the trade is valid."],
    commonMistakes: ["Choosing position size first and moving the stop to make it fit.", "Treating the planned stop loss as a guaranteed maximum realised loss."],
    relatedLessonIds: ["risk-position-sizing", "risk-trade-planning", "risk-stop-and-gap-risk"],
    practicePrompt: "For a hypothetical account, select a clearly labeled educational cash-risk ceiling. Write the invalidation point first, then list the assumptions needed to calculate size without exceeding that ceiling.",
  },
  {
    id: "risk-calculating-pip-value",
    title: "Pip value, stop distance, and position size",
    shortDescription: "Connect price movement units to the account-currency exposure of a forex position.",
    categoryId: "risk-management",
    topicGroup: "Position sizing",
    difficulty: "beginner",
    estimatedMinutes: 9,
    aliases: ["pip value calculation", "forex position size", "stop distance calculation"],
    intro: "A pip count alone does not tell you the cash risk; contract size and account currency matter.",
    sections: [
      {
        heading: "Measure movement using the instrument's convention",
        paragraphs: [
          "Many non-JPY forex quotes use a pip convention of 0.0001, while many JPY pairs use 0.01; platforms may also display fractional pipettes. Confirm the convention and contract specification for the exact instrument rather than assuming every symbol uses the same decimal place. For a hypothetical EUR/USD quote, a move from 1.0800 to 1.0820 is 20 conventional pips, while a provider may display those points differently.",
          "Pip value depends on trade size and the currency in which the pair's profit or loss is denominated. If that quote currency differs from the account currency, conversion rates affect the cash result. Contract size, lot increments, and the provider's treatment of commissions and financing also matter. Use the broker's contract details or a verified calculator and record the assumptions used.",
        ],
      },
      {
        heading: "Work from the loss limit toward size",
        paragraphs: [
          "First define a hypothetical maximum cash risk. Next identify a structurally meaningful invalidation price and calculate the number of pips between entry and stop using the instrument's convention. Convert that stop distance to cash risk per lot using the correct pip value, then divide the budget by that per-lot exposure. Round down to a size the account can actually place; never round up beyond the risk limit.",
          "For an illustration only, if a 25-pip stop would risk $25 per standard lot under the verified contract assumptions and a planned budget is $50, the arithmetic result is two lots before additional costs and execution uncertainty. This is not advice to use those values. Recalculate whenever the instrument, account currency, price, stop distance, or contract changes.",
        ],
      },
    ],
    keyTakeaways: ["Pip value changes with position size, contract terms, and currency conversion.", "Verify the instrument's specification before relying on a size calculation."],
    commonMistakes: ["Assuming all pairs have the same pip value.", "Using displayed decimal points as pips without checking the quote convention."],
    relatedLessonIds: ["fundamentals-forex-prices-pips", "risk-position-sizing", "risk-risk-reward"],
    practicePrompt: "Using an instrument specification supplied by your broker, calculate pip distance to a hypothetical stop and identify how contract size and account-currency conversion affect the result.",
  },
  {
    id: "risk-understanding-drawdown",
    title: "Drawdown, recovery, and capital resilience",
    shortDescription: "Measure declines from a prior account peak and understand why recovery is asymmetric.",
    categoryId: "risk-management",
    topicGroup: "Protection and portfolio risk",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    aliases: ["maximum drawdown", "drawdown recovery", "capital preservation"],
    intro: "Drawdown describes a decline from a previous equity peak; managing it requires limits set before a stressful period.",
    sections: [
      {
        heading: "Calculate a drawdown consistently",
        paragraphs: [
          "A percentage drawdown is commonly measured as the fall from a prior equity peak to a later trough, divided by that peak. If a hypothetical account falls from $10,000 to $9,000, the decline is 10%. Returning from $9,000 to $10,000 then requires an 11.11% gain on the smaller remaining balance, before costs or further losses. A deeper fall creates a larger recovery hurdle.",
          "Specify whether a report uses closed balance, intraday equity, or end-of-day equity, and how deposits and withdrawals are treated. Otherwise two reports may describe the same trading period differently. Track both the size and duration of drawdowns, the rules followed, and the market conditions. A short profitable period does not erase the need to understand earlier risk.",
        ],
      },
      {
        heading: "Set protective responses in advance",
        paragraphs: [
          "A drawdown response can include reducing exposure, pausing new trades, reviewing execution and rule adherence, or seeking independent help. The thresholds should be chosen before a drawdown begins and should account for the strategy's documented variability and the learner's financial circumstances. No threshold makes trading safe, and increasing size to recover losses can accelerate deterioration.",
          "Use a defined review sample rather than changing a strategy after each loss. Compare realised results with expected costs, risk assumptions, and planned limits. If the strategy behaves outside its documented conditions, stop and investigate instead of rationalising the deviation. Capital preservation is partly about keeping the ability to make future decisions, not forcing a rapid return to a previous account peak.",
        ],
      },
    ],
    keyTakeaways: ["The percentage gain needed to recover rises as capital falls.", "Define review and exposure-reduction rules before a drawdown occurs."],
    commonMistakes: ["Increasing position size to recover losses quickly.", "Comparing drawdowns without checking how deposits and equity peaks were measured."],
    relatedLessonIds: ["risk-portfolio-exposure", "risk-leverage-and-ruin", "risk-streaks-and-loss-limits"],
    practicePrompt: "Calculate the percentage decline from a hypothetical equity peak, then calculate the gain needed to return to that peak. Write one precommitted review or exposure-reduction rule.",
  },
  {
    id: "fundamental-interest-rate-differentials",
    title: "Interest rates and currency differentials",
    shortDescription: "Compare policy rates and expectations without assuming a mechanical currency direction.",
    categoryId: "fundamental-analysis",
    topicGroup: "Economic context",
    difficulty: "intermediate",
    estimatedMinutes: 9,
    aliases: ["interest-rate differential", "central bank rates", "rate expectations"],
    intro: "Interest rates influence currency valuation through several channels, but the relationship is conditional and often anticipated.",
    sections: [
      {
        heading: "Compare policies and the path expected",
        paragraphs: [
          "A forex pair expresses one currency relative to another, so analysis often compares economic conditions and policy expectations for both economies. A policy rate is one input among inflation, growth, employment, fiscal conditions, risk appetite, and capital flows. A higher current rate does not automatically mean that the currency will strengthen; markets may have expected it already or may focus on the likely direction and credibility of future policy.",
          "Central banks communicate through decisions, statements, forecasts, minutes, and speeches. Markets can revise expectations before a formal rate change, and different instruments reflect different horizons. When comparing two economies, state the timeframe and evidence being considered. Do not reduce a complex relative valuation question to a single rate number or imply that one release determines a pair's movement.",
        ],
      },
      {
        heading: "Separate observation from interpretation",
        paragraphs: [
          "An analyst can record the current policy rates, recent inflation and employment trends, and the market-implied path where reliable data is available. The next step is to identify what is already expected and what could challenge that view. Expectations are estimates, not promises, and market-implied pricing can shift as liquidity and information change.",
          "For a classroom comparison, write two plausible scenarios: policy expectations become more hawkish in one economy relative to the other, or they move in the opposite direction. Note what evidence would support each scenario and what remains unknown. This exercise teaches conditional reasoning; it does not provide a trading signal. Check release timestamps and sources, and avoid presenting a causal explanation as proven from a price move alone.",
        ],
      },
    ],
    keyTakeaways: ["Forex analysis is relative and includes expectations, not only current rate levels.", "State evidence and uncertainty separately from an interpretation."],
    commonMistakes: ["Assuming the currency with the highest current policy rate must appreciate.", "Treating a market-implied policy path as a guaranteed outcome."],
    relatedLessonIds: ["fundamental-economic-policy", "fundamental-economic-drivers", "fundamental-market-expectations"],
    practicePrompt: "Compare two economies using a current policy rate and one published expectation measure. Write what the comparison suggests, one alternative explanation, and what it cannot establish.",
  },
  {
    id: "fundamental-reading-employment-data",
    title: "Reading employment reports carefully",
    shortDescription: "Distinguish headline employment numbers from participation, wages, revisions, and context.",
    categoryId: "fundamental-analysis",
    topicGroup: "Economic context",
    difficulty: "intermediate",
    estimatedMinutes: 9,
    aliases: ["jobs report", "employment data", "unemployment rate", "wage growth"],
    intro: "An employment report is a collection of measures with different definitions, release schedules, and limitations.",
    sections: [
      {
        heading: "Know what each measure represents",
        paragraphs: [
          "Employment releases may report payroll changes, unemployment, labour-force participation, hours worked, wages, or job vacancies. These measures can come from different surveys and definitions, cover different populations, and be revised later. A headline change is therefore not a complete description of the labour market. Read the release notes and compare the current figure with a consistent series.",
          "The unemployment rate generally depends on who is counted in the labour force and who is actively seeking work. A change can reflect people entering or leaving the labour force as well as hiring or job losses. Wage growth can affect inflation and household income, but interpretation depends on productivity, composition, prior values, and the broader economic context. One data point rarely settles those questions.",
        ],
      },
      {
        heading: "Compare the release with expectations responsibly",
        paragraphs: [
          "Before a release, record the source, publication time, consensus estimate, and previous value. After publication, note the actual values and any revisions, then identify which parts were stronger or weaker than expected. Consensus is a surveyed or compiled estimate, not a neutral truth or a promise about price reaction. Different participants may focus on different components.",
          "A report can surprise in one component while revisions or other measures point another way. Prices may also have moved beforehand or react to unrelated information. In a study, save the full release and timestamp, then compare comparable historical events rather than selecting only dramatic examples. Treat any explanation for a market move as a hypothesis, and state what additional evidence would be needed to support it.",
        ],
      },
    ],
    keyTakeaways: ["Employment releases contain several measures that can tell different stories.", "Check definitions, revisions, and expectations before interpreting a headline."],
    commonMistakes: ["Equating one payroll estimate with the entire state of employment.", "Assuming a positive headline must cause a specific currency move."],
    relatedLessonIds: ["fundamental-economic-releases", "fundamental-economic-drivers", "fundamentals-events-calendar"],
    practicePrompt: "Find a historical employment release and identify its source, headline measure, one secondary measure, revision, consensus, and one reason a single number may mislead.",
  },
  {
    id: "fundamental-event-preparation",
    title: "Preparing a plan for scheduled forex events",
    shortDescription: "Use a calendar to identify exposure and execution risks before a release.",
    categoryId: "fundamental-analysis",
    topicGroup: "Events and research",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["news trading risk", "forex event plan", "economic calendar preparation"],
    intro: "An event plan helps you decide how to handle uncertainty; it does not predict the release or its price reaction.",
    sections: [
      {
        heading: "Verify the event and affected instruments",
        paragraphs: [
          "Start with a reliable calendar and verify the event name, releasing authority, local time conversion, and whether the schedule can change. Identify which currencies may be directly relevant and whether a central bank decision, inflation report, or employment release is involved. The label 'high impact' is a prioritisation aid, not a guarantee of volatility or direction.",
          "Review whether you already have exposure in the affected currency, including positions in correlated instruments. Write down the planned risk, invalidation conditions, and any limits for spread or slippage. Remember that a stop can execute beyond its trigger during a gap or fast market. If you cannot evaluate the contract rules or total exposure, reducing activity or staying out is a reasonable plan.",
        ],
      },
      {
        heading: "Choose actions before the release",
        paragraphs: [
          "A written event plan can specify whether you will avoid opening new positions for a defined window, reduce or close existing exposure, or continue only if pre-established conditions remain satisfied. There is no universally correct choice; it depends on a tested method and personal risk constraints. Avoid inventing rules after seeing the first price movement.",
          "After the event, record the actual values, revisions, execution conditions, and what you did against the plan. Compare the market's behavior with multiple explanations instead of claiming the report caused every move. Review the process separately from the result, and do not increase risk because the announcement appears to confirm a prior opinion. Event preparation is risk management, not a promise of advantage.",
        ],
      },
    ],
    keyTakeaways: ["Check event timing and existing currency exposure before the release.", "Decide how to handle the event before observing its immediate price reaction."],
    commonMistakes: ["Treating a calendar impact label as a directional forecast.", "Assuming stops and spreads behave normally during a release."],
    relatedLessonIds: ["fundamentals-events-calendar", "fundamental-market-expectations", "risk-trade-planning"],
    practicePrompt: "Select a scheduled release from a reliable calendar. Draft a hypothetical before-event checklist for time, currency exposure, spread risk, position limits, and conditions for standing aside.",
  },
  {
    id: "psychology-fear-and-greed",
    title: "Recognising fear and greed in trading decisions",
    shortDescription: "Identify emotional pressure and use a pause to return to written risk rules.",
    categoryId: "trading-psychology",
    topicGroup: "Emotions and discipline",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["fear of loss", "greed in trading", "emotional trading"],
    intro: "Emotions are information about your state, not instructions to enter, exit, or increase a position.",
    sections: [
      {
        heading: "Notice the decision pressure",
        paragraphs: [
          "Fear may appear as avoiding a valid planned action, closing early without a rule, or repeatedly moving a stop because a loss feels uncomfortable. Greed may appear as increasing size after a win, removing an exit, or taking an unplanned setup because a move seems exciting. These behaviors are not diagnoses; they are observable prompts to pause and check the written process.",
          "Emotional reactions can be intensified by fatigue, stress outside trading, financial pressure, recent wins or losses, and fast-changing prices. A trader can feel confident and still be wrong, or feel uneasy while following a sound risk limit. The goal is not to suppress emotion or force confidence. It is to avoid letting a temporary state silently rewrite exposure rules.",
        ],
      },
      {
        heading: "Use a practical pause and boundary",
        paragraphs: [
          "Before acting, stop and state the planned setup, invalidation, maximum loss, and reason the decision is being considered now. Compare each item with the written plan. If the action is not allowed by the plan, wait or decline it. A brief breathing or movement break may help some learners reset attention, but it does not remove financial risk or replace professional support where needed.",
          "Afterward, journal the trigger, feeling, choice, and outcome without judging yourself by profit alone. Look for repeated links, such as trading after a loss or changing rules near a target. Set a precommitted pause rule for those situations and ask a trusted person or qualified professional for help if trading distress affects wellbeing. Protecting health is more important than continuing to trade.",
        ],
      },
    ],
    keyTakeaways: ["Notice emotional pressure, then compare the proposed action with written risk rules.", "Review decisions by process and wellbeing, not only by profit or loss."],
    commonMistakes: ["Treating a strong emotion as proof that a trade must be taken.", "Increasing exposure to recover a loss or extend a winning streak."],
    relatedLessonIds: ["psychology-process-over-outcome", "psychology-losses", "psychology-routines"],
    practicePrompt: "Describe a hypothetical moment of fear or excitement before a trading decision. Name the observable behavior, the written rule to check, and a safe pause you could take.",
  },
  {
    id: "psychology-post-loss-reset",
    title: "A process for pausing after a loss",
    shortDescription: "Use a structured reset to prevent one loss from turning into unplanned exposure.",
    categoryId: "trading-psychology",
    topicGroup: "Emotions and discipline",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["after a losing trade", "revenge trading prevention", "post-loss routine"],
    intro: "A loss is a point to review the plan and your state, not a debt the next trade must repay.",
    sections: [
      {
        heading: "Separate the result from the rule check",
        paragraphs: [
          "First establish what happened: the planned entry, stop or invalidation, size, execution, costs, and exit. Compare those facts with the rules that were written before the trade. A loss that followed the plan is different from a loss caused by a rule breach, but neither single outcome proves whether a method is effective. Avoid rewriting the rules immediately to make the last result feel preventable.",
          "Notice whether you feel pressure to trade again, increase size, or recover a specific amount. Those urges can narrow attention and lead to a position that was not evaluated on its own merits. If you are not able to assess the next decision calmly or the session limit has been reached, stop trading for the planned period. There is no requirement to take another trade.",
        ],
      },
      {
        heading: "Reset using a written checklist",
        paragraphs: [
          "A reset can include stepping away from the screen, recording the trade, checking remaining daily and weekly limits, and rereading the entry criteria before considering another setup. Keep the checklist brief enough to use under pressure. If a rule was broken, describe the behavior specifically and decide on a practical prevention step, such as disabling one-click orders or ending the session after a defined breach.",
          "Review repeated losses as a sample with costs and market conditions included. Seek qualified support if trading causes persistent distress or harms finances or relationships. Avoid self-punishment and avoid framing recovery as a challenge. The purpose of a pause is to protect decision quality and capital, not to guarantee that the next trade will succeed.",
        ],
      },
    ],
    keyTakeaways: ["A planned loss does not create an obligation to take another trade.", "Use prewritten session limits and a repeatable post-trade reset."],
    commonMistakes: ["Increasing size to win back a specific amount.", "Changing a strategy based on one losing example."],
    relatedLessonIds: ["psychology-revenge-and-overtrading", "risk-streaks-and-loss-limits", "psychology-journaling"],
    practicePrompt: "Write a five-step post-loss reset for a hypothetical session, including a risk-limit check, journaling prompt, and a clear condition for ending the session.",
  },
  {
    id: "psychology-confirmation-bias",
    title: "Confirmation bias and alternative scenarios",
    shortDescription: "Challenge a preferred market view by recording evidence that could contradict it.",
    categoryId: "trading-psychology",
    topicGroup: "Decision-making",
    difficulty: "intermediate",
    estimatedMinutes: 8,
    aliases: ["confirmation bias", "alternative market scenarios", "trading cognitive bias"],
    intro: "When you favor a view, it is easy to notice supporting evidence and discount facts that challenge it.",
    sections: [
      {
        heading: "Make the view testable",
        paragraphs: [
          "Confirmation bias describes a tendency to seek, interpret, or remember information in ways that support an existing belief. In chart work, a trader may mark only the levels that fit a bullish view, describe every pullback as temporary, or switch timeframes when contrary evidence appears. The same pattern can affect fundamental research when only favorable forecasts or headlines are collected.",
          "Convert a broad view into a conditional statement with observable evidence. For example: 'The range remains intact while price stays between the marked boundaries; a completed close outside it would require a new assessment.' This statement does not predict which outcome will occur. It identifies what would challenge the current description and helps prevent a belief from becoming impossible to disprove.",
        ],
      },
      {
        heading: "Write a credible competing explanation",
        paragraphs: [
          "Before acting, record at least one plausible alternative scenario, the evidence that would support it, and what information is missing. Try to use the same timeframe, data source, and standard of proof for both scenarios. Ask what observation would make you reduce confidence or stand aside. Do not treat a token counterargument as sufficient if the actual evidence has not been checked.",
          "Review whether your decision changed after the market moved or after reading a persuasive post. Keep dated notes so hindsight does not rewrite the original thesis. Over time, compare the accuracy and usefulness of the criteria, not just the outcome of one position. A balanced process cannot eliminate bias, but it makes assumptions more visible and gives you a defined reason to revise or reject an idea.",
        ],
      },
    ],
    keyTakeaways: ["State evidence that would challenge a preferred market view.", "Compare alternatives using the same data and decision rules."],
    commonMistakes: ["Changing timeframes or criteria only after contrary evidence appears.", "Collecting information that supports a view while ignoring its source or quality."],
    relatedLessonIds: ["psychology-biases-and-fomo", "technical-chart-reading", "fundamentals-research-sources"],
    practicePrompt: "Take a hypothetical directional chart view and write one observation that supports it, one that challenges it, and one rule-based condition that would make you reassess.",
  },
  {
    id: "psychology-boundaries-and-screen-time",
    title: "Trading boundaries, breaks, and screen time",
    shortDescription: "Set practical limits for attention and activity so trading does not consume every decision.",
    categoryId: "trading-psychology",
    topicGroup: "Review and wellbeing",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["trading screen time", "trading wellbeing", "healthy trading boundaries"],
    intro: "A trading routine includes limits on when not to watch or trade, not only rules for market entries.",
    sections: [
      {
        heading: "Define a realistic session",
        paragraphs: [
          "Continuous screen watching can increase fatigue and create pressure to act on ordinary price movement. Decide in advance which markets and times you can review, what information is necessary, and how long a session will last. A schedule should fit work, study, sleep, and personal responsibilities. There is no need to monitor every market or remain available around the clock to learn effectively.",
          "Create clear start and stop conditions, such as ending at a planned time, after a loss limit, or when concentration is impaired. Disable unnecessary alerts and do not use leverage or trade while distracted. If your method requires monitoring that you cannot realistically provide, reconsider the method in a simulation rather than compromising sleep or essential responsibilities.",
        ],
      },
      {
        heading: "Monitor the effect on wellbeing",
        paragraphs: [
          "Track whether trading changes your sleep, mood, relationships, study, or ability to meet financial obligations. Treat repeated negative effects as a signal to reduce activity or stop and seek appropriate support. Do not use trading to solve urgent financial problems or risk money needed for essential expenses. Market access and educational content do not establish that trading is suitable for you.",
          "At the end of a session, record what you learned and close the platform when the review is complete. A deliberate break helps distinguish study from live decision pressure. If you feel unable to stop despite harm, consider speaking with a healthcare professional or a support service in your region. Protecting your health and life outside trading comes before maintaining a streak or meeting a screen-time target.",
        ],
      },
    ],
    keyTakeaways: ["Predefine session boundaries that protect rest and responsibilities.", "Persistent harm or distress is a reason to reduce activity and seek support."],
    commonMistakes: ["Assuming more screen time always improves skill.", "Trading with money needed for essentials or while unable to focus."],
    relatedLessonIds: ["psychology-routines", "psychology-losses", "psychology-journaling"],
    practicePrompt: "Draft a realistic study or simulated-trading schedule with a start, stop, break, and interruption rule that protects sleep and other responsibilities.",
  },
  {
    id: "strategies-understanding-expectancy",
    title: "Expectancy: evaluating a series of trades",
    shortDescription: "Combine outcome frequency and average win/loss in a sample without promising future results.",
    categoryId: "strategies-practice",
    topicGroup: "Backtesting",
    difficulty: "intermediate",
    estimatedMinutes: 9,
    aliases: ["trading expectancy", "expected value", "average win loss"],
    intro: "Expectancy is a summary of average historical outcomes under stated assumptions, not a guarantee about the next trade.",
    sections: [
      {
        heading: "Use consistent units and include costs",
        paragraphs: [
          "A simple expectancy estimate can be expressed as the proportion of winning outcomes multiplied by the average win, minus the proportion of losing outcomes multiplied by the average loss. If a hypothetical sample wins 40% of the time with an average gain of 2R and loses 60% with an average loss of 1R, the arithmetic estimate is 0.2R per trade before any omitted costs. R is a consistent unit of planned risk, not necessarily a fixed currency amount.",
          "The estimate depends on how trades were selected, measured, and executed. Include commissions, spread, financing, slippage, skipped signals, and any difference between the tested and tradable market. If wins and losses are not independent or if rules changed during the sample, a single average can hide important structure. Record the sample definition and calculation so another person can reproduce it.",
        ],
      },
      {
        heading: "Interpret the estimate with uncertainty",
        paragraphs: [
          "A positive historical estimate does not show that the edge will persist. Small samples can be dominated by a few outcomes, and market conditions can change. Compare results across time periods and conditions, examine drawdown and losing sequences, and use out-of-sample data where possible. Avoid reporting only the most favorable subset or changing assumptions after inspecting results.",
          "For a learning exercise, calculate expectancy from a clearly labeled hypothetical list of outcomes, then change the win rate, average win, and average loss to see how sensitive the result is. Keep every value illustrative rather than a forecast. A strategy should also be judged on implementation feasibility, risk limits, and data quality. Statistical summaries support review; they do not prove future profitability.",
        ],
      },
    ],
    keyTakeaways: ["Expectancy combines outcome frequency and average win/loss under stated assumptions.", "Historical expectancy is uncertain and must include costs and a reproducible sample."],
    commonMistakes: ["Treating a backtest estimate as a promised future return.", "Ignoring costs or selecting only a favorable subset of trades."],
    relatedLessonIds: ["risk-risk-reward", "strategies-backtesting-basics", "strategies-rules-and-hypotheses"],
    practicePrompt: "Calculate expectancy from a small, clearly labeled hypothetical outcome list in R units. Recalculate after including an illustrative transaction cost and note the limits of the sample.",
  },
  {
    id: "strategies-defining-a-test-sample",
    title: "Choosing a useful historical test sample",
    shortDescription: "Define eligible markets, periods, and observations before evaluating a strategy.",
    categoryId: "strategies-practice",
    topicGroup: "Backtesting",
    difficulty: "intermediate",
    estimatedMinutes: 9,
    aliases: ["backtest sample size", "historical test sample", "selection bias trading"],
    intro: "A test is only as useful as its rules, data, and sample selection are clear and reproducible.",
    sections: [
      {
        heading: "Specify the population before testing",
        paragraphs: [
          "Write down the instruments, timeframe, date range, trading sessions, market conditions, and entry rules that define an eligible observation. Include what counts as a signal, how overlapping positions are handled, and how exits are measured. If you change these rules after seeing results, record a new version and reserve fresh data for evaluation rather than quietly reusing the same sample.",
          "Historical data may contain missing bars, different session boundaries, survivorship effects, or unrealistic execution assumptions. Check the source, timestamps, price adjustments, and whether bid/ask spread is represented. A chart can make past setups look obvious because the outcome is already known. Apply a written method consistently, including examples that fail, rather than selecting only memorable winners.",
        ],
      },
      {
        heading: "Use enough diverse observations",
        paragraphs: [
          "There is no single sample count that proves a strategy works. More independent and varied observations can reduce the influence of one unusual result, but they cannot correct poor rules or biased data. Trades clustered in one short period may share the same market conditions and therefore provide less variety than their raw count suggests. Record sample size alongside the period and context.",
          "Separate rule development from evaluation where possible: use one sample to define and refine a hypothesis, then use another period or a forward simulation to check whether the rules remain plausible. Report losing sequences, drawdown, costs, and deviations, not only a win rate. Treat the result as evidence with limitations and never convert a historical sample into a certainty about future market behavior.",
        ],
      },
    ],
    keyTakeaways: ["Define eligible observations and data assumptions before viewing results.", "A larger raw trade count does not remove shared-condition or selection bias."],
    commonMistakes: ["Selecting historical examples after seeing their outcomes.", "Changing rules on the same sample and presenting it as independent validation."],
    relatedLessonIds: ["strategies-backtesting-basics", "strategies-rules-and-hypotheses", "strategies-understanding-expectancy"],
    practicePrompt: "Write a test protocol naming instrument, interval, date range, eligibility rules, data source, cost assumptions, and how you will separate development from evaluation samples.",
  },
  {
    id: "strategies-overfitting-and-out-of-sample",
    title: "Overfitting and out-of-sample testing",
    shortDescription: "Recognise when repeated tuning describes historical noise rather than a durable method.",
    categoryId: "strategies-practice",
    topicGroup: "Backtesting",
    difficulty: "advanced",
    estimatedMinutes: 9,
    aliases: ["overfitting a strategy", "out of sample test", "walk forward testing"],
    intro: "A strategy can fit historical data extremely well and still fail to generalise to unseen conditions.",
    sections: [
      {
        heading: "How a backtest becomes overfit",
        paragraphs: [
          "Every extra filter, parameter, instrument, and date range gives a researcher another opportunity to select a result that looks unusually good by chance. This is especially risky when many variations are tried but only the winning version is reported. The final rules may describe random details of the sample rather than a repeatable market behavior. Complex rules are not automatically wrong, but each needs a reason that can be stated before testing.",
          "Warning signs include sharp performance deterioration after a small parameter change, a result driven by a few trades, many filters chosen after inspecting winners, or reliance on ideal fills. Keep a record of every tested variation and the date it was selected. That history helps reviewers see how much search occurred and reduces the temptation to present only the best result.",
        ],
      },
      {
        heading: "Reserve data for an honest check",
        paragraphs: [
          "An out-of-sample period is held aside while rules are developed. Evaluate the locked rules once on that data, including realistic costs and the same execution assumptions. If you modify the strategy after seeing the holdout result, that period has become part of development and is no longer an untouched validation sample. A later period or forward simulation would then be needed for another check.",
          "Walk-forward evaluation can repeat development and testing across sequential windows, but it still depends on disciplined rules and reliable data. Results remain uncertain and may not represent future liquidity or regulation. Compare robustness across plausible assumptions rather than searching for the single best configuration. The goal is to learn where a method fails as well as where it appeared to work.",
        ],
      },
    ],
    keyTakeaways: ["Repeatedly tuning rules on one dataset increases the risk of fitting noise.", "A holdout stops being independent once its results guide a rule change."],
    commonMistakes: ["Reporting only the best of many unreported parameter combinations.", "Treating one successful out-of-sample test as proof of future performance."],
    relatedLessonIds: ["strategies-backtesting-basics", "strategies-defining-a-test-sample", "strategies-rules-and-hypotheses"],
    practicePrompt: "Review a hypothetical strategy tuned through many variations. List signs of overfitting, define an untouched evaluation period, and state what action would invalidate that holdout.",
  },
  {
    id: "strategies-writing-a-trading-checklist",
    title: "Writing a repeatable pre-trade checklist",
    shortDescription: "Turn a strategy into observable entry, risk, execution, and exclusion rules.",
    categoryId: "strategies-practice",
    topicGroup: "Strategy design",
    difficulty: "beginner",
    estimatedMinutes: 8,
    aliases: ["pre-trade checklist", "trading rules checklist", "setup checklist"],
    intro: "A checklist makes the decision process visible and helps identify conditions where the best action is to stand aside.",
    sections: [
      {
        heading: "Write criteria another person could check",
        paragraphs: [
          "A useful checklist identifies the instrument and timeframe, the market condition required, the exact entry trigger, and the evidence that invalidates the idea. Replace vague terms such as 'strong trend' with observable definitions your method can apply consistently. Include position-size calculation, maximum planned risk, target or exit logic, and how spread, slippage, or gaps affect the plan.",
          "Specify exclusions too: a missing price reference, an event window, a spread above a threshold, insufficient time to monitor, or a daily risk limit already reached. A no-trade outcome is part of a complete strategy. Rules should be concise enough to use before entry, while detailed definitions and examples belong in the strategy document and test protocol.",
        ],
      },
      {
        heading: "Test the checklist for ambiguity",
        paragraphs: [
          "Apply the checklist to historical examples without looking first at what happened next. Mark each item as yes, no, or unknown, and record where two reviewers might disagree. If an item cannot be answered from available data, define the missing evidence or remove the criterion. Do not resolve ambiguity by selecting whichever interpretation produces a favorable result.",
          "After testing, version the checklist and keep the old version for comparison. During a live or simulated session, record exceptions rather than editing rules mid-trade. Review adherence and outcomes separately. A checklist supports consistency but cannot remove uncertainty, guarantee a fill, or replace an appropriate risk limit.",
        ],
      },
    ],
    keyTakeaways: ["Define entry, invalidation, sizing, execution, and exclusions before placing a trade.", "Treat no-trade conditions as explicit parts of the strategy."],
    commonMistakes: ["Using subjective checklist items that change after the outcome is known.", "Ignoring missing evidence because a setup otherwise looks attractive."],
    relatedLessonIds: ["strategies-entry-exit-and-review", "strategies-rules-and-hypotheses", "risk-trade-planning"],
    practicePrompt: "Create a one-page hypothetical setup checklist with objective entry criteria, invalidation, sizing, cost limits, event exclusions, and a no-trade condition.",
  },
  {
    id: "strategies-scenario-rehearsal",
    title: "Rehearsing alternative market scenarios",
    shortDescription: "Practise conditional planning for more than one outcome using historical or simulated charts.",
    categoryId: "strategies-practice",
    topicGroup: "Simulated practice",
    difficulty: "intermediate",
    estimatedMinutes: 9,
    aliases: ["scenario planning", "historical chart practice", "trading simulation"],
    intro: "Scenario rehearsal develops a process for responding to evidence; it does not predict which path the market will take.",
    sections: [
      {
        heading: "Frame the exercise without hindsight",
        paragraphs: [
          "Choose a historical chart and hide the data to the right of a selected point. Record the instrument, timeframe, visible price, and levels that can be identified from the available chart. Write two plausible paths, such as a hold at a range boundary or a completed break beyond it. For each, state what observable event would change your assessment and what would invalidate the idea.",
          "Do not name a pattern solely because you already know how the chart ended. Avoid moving levels after revealing later candles. Include a no-trade scenario where evidence is mixed, a level is unclear, or costs and risk do not fit. If you use a replay tool, verify that future candles and indicators are not visible in the interface.",
        ],
      },
      {
        heading: "Review the decision process",
        paragraphs: [
          "Reveal the next segment one interval at a time and note which prewritten condition occurred, if any. Record whether the plan would have armed, invalidated, or remained inactive. Use the same cost and execution assumptions throughout and distinguish a theoretical trigger from a fill that could realistically have occurred.",
          "After the exercise, compare your notes with the full chart and identify hindsight judgments, missing information, and rule ambiguities. Score process adherence separately from whether the eventual move aligned with one scenario. Repeat across examples that resolve in different ways. The objective is consistent conditional reasoning and safer practice, not learning to claim that a past move was obvious.",
        ],
      },
    ],
    keyTakeaways: ["Write alternative scenarios and invalidation rules before revealing later price data.", "Evaluate process consistency separately from the direction of the eventual move."],
    commonMistakes: ["Using future chart data to choose levels for a supposedly blind exercise.", "Treating one correctly guessed outcome as proof of skill or profitability."],
    relatedLessonIds: ["strategies-breakout-example", "technical-chart-reading", "strategies-paper-practice"],
    practicePrompt: "Use chart replay with future candles hidden. Record two conditional scenarios, their invalidation evidence, and a no-trade case before revealing the next segment.",
  },
];

export const LEARNING_LESSONS: LearningLesson[] = ARTICLE_LESSONS.map((lesson) => ({
  ...lesson,
  ...(GENERATED_LEARNING_STEPS[lesson.id] ? { steps: GENERATED_LEARNING_STEPS[lesson.id] } : {}),
}));

export const LEARNING_CATEGORIES: LearningCategory[] = categoryDefinitions.map((category) => ({
  ...category,
  groups: category.groups.map((group) => ({
    ...group,
    lessonIds: LEARNING_LESSONS
      .filter((lesson) => lesson.categoryId === category.id && lesson.topicGroup === group.title)
      .map((lesson) => lesson.id),
  })),
}));

export function getLearningLesson(id: string): LearningLesson | undefined {
  return LEARNING_LESSONS.find((lesson) => lesson.id === id);
}

export function getEstimatedLessonMinutes(lesson: LearningLesson): number {
  const words = [
    lesson.title,
    lesson.intro,
    ...lesson.sections.flatMap((section) => [
      section.heading,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
      section.formula ?? "",
    ]),
    ...lesson.keyTakeaways,
    ...lesson.commonMistakes,
  ].join(" ").trim().split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.ceil((words / 220 * 60 + 15) / 60));
}

for (const lesson of LEARNING_LESSONS) {
  lesson.estimatedMinutes = getEstimatedLessonMinutes(lesson);
}

export function getLessonKnowledgeCheck(lesson: LearningLesson) {
  const correctAnswer = lesson.keyTakeaways[0];
  const commonPitfall = lesson.commonMistakes[0];
  if (!correctAnswer || !commonPitfall) {
    throw new Error(`Lesson "${lesson.id}" needs a takeaway and a common mistake for its knowledge check.`);
  }
  return {
    question: `Which statement is the soundest takeaway from "${lesson.title}"?`,
    options: [
      { id: "takeaway", text: correctAnswer, isCorrect: true },
      { id: "pitfall", text: commonPitfall, isCorrect: false },
    ],
  };
}

export function getLessonPracticePrompt(lesson: LearningLesson): string {
  if (lesson.practicePrompt?.trim()) return lesson.practicePrompt.trim();
  const prompts: Record<CategoryId, string> = {
    fundamentals: "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable.",
    "technical-analysis": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast.",
    "risk-management": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper.",
    "fundamental-analysis": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price.",
    "trading-psychology": "After a trading decision, journal the plan you followed, the emotion you noticed, and one process change. Review the decision process separately from the outcome.",
    "strategies-practice": "Write a testable checklist for this idea: market, timeframe, entry, exit, invalidation, and cost assumptions. Apply the same rules to historical examples before drawing conclusions.",
  };
  return prompts[lesson.categoryId];
}

export function getLearningCategory(id: string): LearningCategory | undefined {
  return LEARNING_CATEGORIES.find((category) => category.id === id);
}
