import type { LearningStep } from './learningContent';

export const GENERATED_LEARNING_STEPS: Record<string, LearningStep[]> = {
  "fundamentals-market-basics": [
    {
      "type": "learn",
      "title": "What is a financial market?",
      "body": "A market is a system for matching people who want to trade an asset.",
      "keyPoint": "Learn what markets do and why prices change"
    },
    {
      "type": "learn",
      "title": "Prices are negotiated",
      "body": "A traded price is the result of orders meeting, not a guaranteed estimate of an asset's true worth. Buyers submit bids and sellers submit offers; completed trades show where willing participants found a match.\n\nExpectations, available information, liquidity, and urgency can all change those offers. A price move alone does not reveal why it happened.",
      "keyPoint": "A traded price is the result of orders meeting, not a guaranteed estimate of an asset's true worth. Buyers submit bids and sellers submit..."
    },
    {
      "type": "learn",
      "title": "Markets differ",
      "body": "Stocks represent ownership interests; bonds are debt instruments; currencies are traded in pairs; commodities and derivatives have their own contract terms.\n\nTrading hours, settlement, leverage, fees, and regulation vary by venue and instrument.\n\nA market price reflects transactions and available orders.\n\nKnow an instrument's terms and risks before trading it.\n\nTreating a recent price as a promise of future value.\n\nAssuming all markets have the same hours, costs, or protections.",
      "keyPoint": "Stocks represent ownership interests; bonds are debt instruments; currencies are traded in pairs; commodities and derivatives have their..."
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Prices are negotiated",
        "Markets differ"
      ]
    }
  ],
  "fundamentals-how-trades-work": [
    {
      "type": "learn",
      "title": "How a trade works",
      "body": "A trade opens exposure to price movement, then closes or settles under the instrument's rules.",
      "keyPoint": "Follow a trade from an order to its result"
    },
    {
      "type": "learn",
      "title": "Opening and closing exposure",
      "body": "Buying first is commonly called going long; selling first to benefit from a decline is commonly called going short. Shorting may require borrowing, margin, or a derivative and can have losses that exceed the initial amount at risk.",
      "keyPoint": "Buying first is commonly called going long; selling first to benefit from a decline is commonly called going short. Shorting may require..."
    },
    {
      "type": "learn",
      "title": "Opening and closing exposure",
      "body": "The result depends on entry and exit prices, position size, contract value, fees, financing, and execution. A correct market view can still lose after costs or poor execution.",
      "keyPoint": "Buying first is commonly called going long; selling first to benefit from a decline is commonly called going short. Shorting may require..."
    },
    {
      "type": "learn",
      "title": "An order is an instruction",
      "body": "A market order prioritizes execution, not a particular price; fast markets can produce slippage.\n\nA limit order sets a price boundary but may not fill. A stop order's trigger and resulting execution behavior depend on venue and broker rules.\n\nUnderstand how the instrument is opened, closed, and settled.\n\nExecution and costs affect outcomes as well as direction.\n\nAssuming an order type guarantees both fill and price.\n\nIgnoring margin, financing, borrow costs, or contract specifications.",
      "keyPoint": "A market order prioritizes execution, not a particular price; fast markets can produce slippage"
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Opening and closing exposure",
        "An order is an instruction"
      ]
    }
  ],
  "fundamentals-orders-execution": [
    {
      "type": "learn",
      "title": "Orders, spread, and execution",
      "body": "An order specifies how you want to participate; it cannot remove market or execution uncertainty.",
      "keyPoint": "Compare common orders and the practical cost of execution"
    },
    {
      "type": "learn",
      "title": "Choosing an order",
      "body": "The bid is the best displayed buying price and the ask is the best displayed selling price; their difference is the spread. A buy commonly executes at or near the ask and a sell at or near the bid, subject to the venue and available depth.",
      "keyPoint": "The bid is the best displayed buying price and the ask is the best displayed selling price; their difference is the spread. A buy commonl..."
    },
    {
      "type": "learn",
      "title": "Choosing an order",
      "body": "A market order seeks available liquidity. A limit order controls the worst acceptable price but may remain unfilled. Stop orders can trigger into market or limit instructions, depending on their type.",
      "keyPoint": "The bid is the best displayed buying price and the ask is the best displayed selling price; their difference is the spread. A buy commonl..."
    },
    {
      "type": "learn",
      "title": "Execution is not guaranteed",
      "body": "Slippage is the difference between an expected and actual execution price.\n\nThin liquidity, gaps, volatility, latency, and partial fills can change the result. Check the broker's order and protection rules.\n\nSpread is an immediate trading cost to consider.\n\nA limit price may prevent an unfavorable fill but does not ensure a fill.\n\nAssuming a stop-loss always executes at its trigger price.\n\nIgnoring spread and slippage when evaluating a strategy.",
      "keyPoint": "Slippage is the difference between an expected and actual execution price"
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Choosing an order",
        "Execution is not guaranteed"
      ]
    }
  ],
  "fundamentals-market-participants": [
    {
      "type": "learn",
      "title": "Who participates in markets?",
      "body": "Market activity combines many goals, constraints, and holding periods.",
      "keyPoint": "See how different participants and time horizons interact"
    },
    {
      "type": "learn",
      "title": "Different roles, mixed motives",
      "body": "Participants may include long-term investors, companies hedging exposures, funds, dealers, market makers, and short-term traders. A single participant can also act differently across instruments and time.",
      "keyPoint": "Participants may include long-term investors, companies hedging exposures, funds, dealers, market makers, and short-term traders. A singl..."
    },
    {
      "type": "learn",
      "title": "Different roles, mixed motives",
      "body": "Some participants provide liquidity by quoting both sides; others consume it to transact. These roles are not fixed, and displayed orders may change or disappear.",
      "keyPoint": "Participants may include long-term investors, companies hedging exposures, funds, dealers, market makers, and short-term traders. A singl..."
    },
    {
      "type": "learn",
      "title": "No single explanation",
      "body": "Price and volume can inform an analysis, but usually cannot identify the trader or motive behind an order.\n\nAvoid narratives that claim certainty about institutional intent from one candle, sweep, or volume spike.\n\nMarkets aggregate diverse decisions rather than one controlling viewpoint.\n\nObserved price action rarely proves who traded or why.\n\nAttributing every move to a specific participant without evidence.\n\nConfusing a useful market narrative with a verified cause.",
      "keyPoint": "Price and volume can inform an analysis, but usually cannot identify the trader or motive behind an order"
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Different roles, mixed motives",
        "No single explanation"
      ]
    }
  ],
  "technical-candlestick-anatomy": [
    {
      "type": "learn",
      "title": "Candlestick anatomy and context",
      "body": "A candle compresses four prices over a chosen interval; it is a summary, not a forecast.",
      "keyPoint": "Read open, high, low, close, body, and wicks"
    },
    {
      "type": "learn",
      "title": "Four prices, one interval",
      "body": "OHLC means open, high, low, and close. The real body spans open to close; the upper and lower wicks show the interval's extremes beyond the body. Chart colors are configurable, so check the platform legend.\n\nA candle's shape depends on timeframe and data source. A five-minute candle and a daily candle can tell different stories about the same session.",
      "keyPoint": "OHLC means open, high, low, and close. The real body spans open to close; the upper and lower wicks show the interval's extremes beyond t..."
    },
    {
      "type": "learn",
      "title": "Read rather than predict",
      "body": "A long wick shows rejection or movement away from an extreme within that interval, but does not establish what happens next.\n\nCompare candles with nearby structure, volatility, volume quality, and the instrument's trading hours.\n\nKnow the interval and OHLC values behind each candle.\n\nCandle shape is descriptive evidence, not a standalone signal.\n\nReading a wick as proof of a reversal.\n\nComparing candle patterns across inconsistent timeframes.",
      "keyPoint": "A long wick shows rejection or movement away from an extreme within that interval, but does not establish what happens next"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Four prices, one interval",
        "Read rather than predict"
      ]
    }
  ],
  "technical-doji-and-spinning-top": [
    {
      "type": "learn",
      "title": "Doji and spinning-top candles",
      "body": "A small body means open and close were relatively close for that candle; context decides whether it matters.",
      "keyPoint": "Interpret small real bodies without overreading them"
    },
    {
      "type": "learn",
      "title": "Shape and interpretation",
      "body": "A doji typically has nearly equal open and close; a spinning top has a small body with wicks on both sides. Exact definitions vary between charting references and depend on the instrument's scale.",
      "keyPoint": "A doji typically has nearly equal open and close; a spinning top has a small body with wicks on both sides. Exact definitions vary betwee..."
    },
    {
      "type": "learn",
      "title": "Shape and interpretation",
      "body": "Either shape can appear during consolidation or after a strong move. It can reflect temporary balance, but one candle cannot confirm a change in control.",
      "keyPoint": "A doji typically has nearly equal open and close; a spinning top has a small body with wicks on both sides. Exact definitions vary betwee..."
    },
    {
      "type": "learn",
      "title": "Look for confirmation",
      "body": "Ask where the candle formed relative to a well-defined range, trend, or level.\n\nWait for subsequent price behavior if a strategy requires confirmation; confirmation still does not guarantee follow-through.\n\nSmall-body candles describe limited net movement within an interval.\n\nUse location and later evidence rather than a candle name alone.\n\nCalling every doji a reversal.\n\nIgnoring the timeframe and surrounding range.",
      "keyPoint": "Ask where the candle formed relative to a well-defined range, trend, or level"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Shape and interpretation",
        "Look for confirmation"
      ]
    }
  ],
  "technical-hammer-shooting-star": [
    {
      "type": "learn",
      "title": "Hammer and shooting-star shapes",
      "body": "Long-wick shapes have different traditional names depending on their location, but neither predicts a reversal by itself.",
      "keyPoint": "Compare long-wick candles and their location"
    },
    {
      "type": "learn",
      "title": "Anatomy and location",
      "body": "A hammer-like candle has a small upper body and a relatively long lower wick. Near a decline it is traditionally called a hammer; near an advance a similar shape may be called a hanging man. A shooting-star shape has a small lower body and a long upper wick; location affects its traditional label.",
      "keyPoint": "A hammer-like candle has a small upper body and a relatively long lower wick. Near a decline it is traditionally called a hammer; near an..."
    },
    {
      "type": "learn",
      "title": "Anatomy and location",
      "body": "The labels are conventions, not laws. These shapes are sometimes grouped under the informal term pin bar, though definitions vary. A wick shows that price traveled and then moved back before the close; it does not reveal future order flow.",
      "keyPoint": "A hammer-like candle has a small upper body and a relatively long lower wick. Near a decline it is traditionally called a hammer; near an..."
    },
    {
      "type": "learn",
      "title": "Test the setup",
      "body": "Define the preceding trend, nearby structure, candle-size threshold, and confirmation rule before testing.\n\nConsider gaps, session boundaries, and volatility, which can create similar shapes for unrelated reasons.\n\nLocation and prior movement matter to traditional pattern names.\n\nAny reversal hypothesis needs explicit confirmation and invalidation rules.\n\nTreating a long wick as a guaranteed rejection.\n\nChanging pattern definitions after seeing the outcome.",
      "keyPoint": "Define the preceding trend, nearby structure, candle-size threshold, and confirmation rule before testing"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Anatomy and location",
        "Test the setup"
      ]
    }
  ],
  "technical-engulfing-patterns": [
    {
      "type": "learn",
      "title": "Engulfing candles",
      "body": "An engulfing pattern compares consecutive candle bodies; its definition and meaning need context.",
      "keyPoint": "Define bullish and bearish engulfing patterns consistently"
    },
    {
      "type": "learn",
      "title": "A common definition",
      "body": "In a common convention, a bullish engulfing candle closes up and its body covers the prior down candle's body; a bearish engulfing candle does the reverse. Some definitions compare full ranges instead, so state which rule you use.\n\nA larger body can represent a shift in interval-level pressure, but a pattern can fail, especially in sideways or illiquid conditions.",
      "keyPoint": "In a common convention, a bullish engulfing candle closes up and its body covers the prior down candle's body; a bearish engulfing candle..."
    },
    {
      "type": "learn",
      "title": "Evaluate consistently",
      "body": "Specify whether equal boundaries count and whether wicks are included.\n\nRecord location, trend, spread, and confirmation criteria in a test; avoid selecting only visually compelling examples.\n\nEngulfing definitions differ; use a repeatable rule.\n\nA large candle is not proof of durable buying or selling.\n\nMixing body-based and range-based definitions.\n\nUsing the pattern without defining risk or invalidation.",
      "keyPoint": "Specify whether equal boundaries count and whether wicks are included"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "A common definition",
        "Evaluate consistently"
      ]
    }
  ],
  "technical-morning-evening-star": [
    {
      "type": "learn",
      "title": "Morning-star and evening-star patterns",
      "body": "These traditional three-candle patterns describe a pause and a strong move in the opposite direction.",
      "keyPoint": "Understand three-candle reversal hypotheses and their limits"
    },
    {
      "type": "learn",
      "title": "Typical structure",
      "body": "A morning star is commonly described as a substantial bearish candle, a smaller middle candle, then a bullish candle closing well into the first body's range. An evening star reverses those directions. Gap requirements differ across markets and references.\n\nThe sequence is a hypothesis about changing pressure, not a causal explanation. Its reliability depends on market, timeframe, costs, and exact rule choices.\n\nWrite down body-size, gap, and closing-location thresholds before reviewing examples.\n\nCompare outcomes with a baseline and include transaction costs and failed signals.\n\nThe pattern's three-candle sequence has several accepted variants.\n\nA visually recognizable setup still needs objective testing.\n\nRequiring gaps in markets that trade continuously without checking the convention.\n\nCounting only successful examples.",
      "keyPoint": "A morning star is commonly described as a substantial bearish candle, a smaller middle candle, then a bullish candle closing well into th..."
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Typical structure",
        "Make it testable"
      ]
    }
  ],
  "technical-inside-outside-bars": [
    {
      "type": "learn",
      "title": "Inside bars and outside bars",
      "body": "Range relationships can describe contraction or expansion, but do not determine direction.",
      "keyPoint": "Compare a candle's range with the previous candle"
    },
    {
      "type": "learn",
      "title": "Range comparison",
      "body": "An inside bar has a high below and a low above the previous bar's high and low, under a strict definition. An outside bar has a high above and low below the previous bar's range. Some practitioners allow equal boundaries.",
      "keyPoint": "An inside bar has a high below and a low above the previous bar's high and low, under a strict definition. An outside bar has a high abov..."
    },
    {
      "type": "learn",
      "title": "Range comparison",
      "body": "An inside bar may reflect temporary contraction; an outside bar may reflect expansion and two-sided movement. Either can occur in a trend or a range.",
      "keyPoint": "An inside bar has a high below and a low above the previous bar's high and low, under a strict definition. An outside bar has a high abov..."
    },
    {
      "type": "learn",
      "title": "Avoid directional assumptions",
      "body": "Choose whether boundaries are strict or inclusive and keep that rule fixed.\n\nIf trading a breakout hypothesis, plan for false breaks and gaps through the trigger.\n\nInside/outside describes relative ranges, not bullish or bearish certainty.\n\nVolatility expansion can move in either direction.\n\nAssuming an inside bar must break toward the prior trend.\n\nIgnoring how equal highs and lows are classified.",
      "keyPoint": "Choose whether boundaries are strict or inclusive and keep that rule fixed"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Range comparison",
        "Avoid directional assumptions"
      ]
    }
  ],
  "technical-double-tops-bottoms": [
    {
      "type": "learn",
      "title": "Double tops and double bottoms",
      "body": "A double top or bottom is a chart interpretation of two tests near a similar price area.",
      "keyPoint": "Study repeated tests of an area and neckline confirmation"
    },
    {
      "type": "learn",
      "title": "Structure and confirmation",
      "body": "A double top has two peaks separated by a trough; a double bottom has two troughs separated by a peak. The intervening swing is often called the neckline. The pattern is commonly treated as confirmed only after a break of that level, though definitions vary.\n\nPeaks need not be identical. A second test can fail to reverse, and a neckline break can be a false breakout.",
      "keyPoint": "A double top has two peaks separated by a trough; a double bottom has two troughs separated by a peak. The intervening swing is often cal..."
    },
    {
      "type": "learn",
      "title": "Use measured moves cautiously",
      "body": "Some traders project the pattern's height from the neckline; this is a heuristic, not a price target with assured reach.\n\nDefine swing points, tolerance, confirmation, and invalidation before evaluating examples.\n\nA repeated test is not confirmed until your stated rule is met.\n\nPattern projections are estimates and can fail.\n\nLabeling ordinary noise as matching tops or bottoms after the fact.\n\nEntering before defining what invalidates the pattern.",
      "keyPoint": "Some traders project the pattern's height from the neckline; this is a heuristic, not a price target with assured reach"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Structure and confirmation",
        "Use measured moves cautiously"
      ]
    }
  ],
  "technical-head-and-shoulders": [
    {
      "type": "learn",
      "title": "Head-and-shoulders patterns",
      "body": "This reversal pattern organizes swing highs or lows into a testable visual structure.",
      "keyPoint": "Identify shoulders, head, neckline, and failure conditions"
    },
    {
      "type": "learn",
      "title": "The pattern",
      "body": "A standard head-and-shoulders has a central higher peak (the head) between lower peaks (shoulders), with a neckline drawn through the intervening lows. The inverse form uses three lows, with the central low deepest.\n\nNecklines can slope, and analysts differ on whether confirmation requires a close, a touch, or a retest beyond it. Pick a rule in advance.",
      "keyPoint": "A standard head-and-shoulders has a central higher peak (the head) between lower peaks (shoulders), with a neckline drawn through the int..."
    },
    {
      "type": "learn",
      "title": "Limits of interpretation",
      "body": "A pattern can remain incomplete or fail after a neckline break.\n\nVolume is sometimes used as context, but volume data quality and interpretation differ across venues.\n\nThe pattern is defined by relative swings and a chosen neckline rule.\n\nDo not treat a neckline break as certainty.\n\nForcing shoulders onto irregular price action.\n\nIgnoring sloped necklines, timeframe, or the risk of a false break.",
      "keyPoint": "A pattern can remain incomplete or fail after a neckline break"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "The pattern",
        "Limits of interpretation"
      ]
    }
  ],
  "technical-triangles-flags-wedges": [
    {
      "type": "learn",
      "title": "Triangles, flags, and wedges",
      "body": "These pattern names describe converging boundaries or pauses; their labels do not guarantee a breakout direction.",
      "keyPoint": "Compare common continuation and compression patterns"
    },
    {
      "type": "learn",
      "title": "Common forms",
      "body": "Ascending and descending triangles pair a relatively flat boundary with rising lows or falling highs. A symmetrical triangle has converging boundaries. Flags are short consolidations after a sharp move; wedges have converging, often sloped boundaries.\n\nTextbook labels simplify messy charts. Analysts disagree about swing-point selection, minimum touches, duration, and whether a breakout needs a closing price or retest.",
      "keyPoint": "Ascending and descending triangles pair a relatively flat boundary with rising lows or falling highs. A symmetrical triangle has convergi..."
    },
    {
      "type": "learn",
      "title": "Plan for either outcome",
      "body": "Mark boundaries using a consistent method and identify the point where the idea is no longer valid.\n\nBreakouts can reverse or gap beyond a planned entry. Risk controls and costs matter more than the pattern name.\n\nCompression patterns describe geometry, not a certain future move.\n\nDefine boundaries and confirmation rules before testing.\n\nAssuming an ascending triangle must break upward.\n\nRedrawing boundaries to fit a preferred result.",
      "keyPoint": "Mark boundaries using a consistent method and identify the point where the idea is no longer valid"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Common forms",
        "Plan for either outcome"
      ]
    }
  ],
  "technical-market-structure": [
    {
      "type": "learn",
      "title": "Market structure: swings, BOS, and CHoCH",
      "body": "Market-structure labels can help describe price sequences, but terminology varies among traders.",
      "keyPoint": "Map swing sequences and define break-of-structure terminology"
    },
    {
      "type": "learn",
      "title": "Swings and breaks",
      "body": "A swing high or low is a local turning point defined by a chosen number of bars or a price threshold. In a common framework, higher highs and higher lows describe an advancing sequence; lower highs and lower lows describe a declining sequence.",
      "keyPoint": "A swing high or low is a local turning point defined by a chosen number of bars or a price threshold. In a common framework, higher highs..."
    },
    {
      "type": "learn",
      "title": "Swings and breaks",
      "body": "BOS (break of structure) often means price breaks a prior swing in the direction of the current trend. CHoCH (change of character) often labels a break against the prior sequence and may be treated as an early warning, not confirmation of a lasting reversal.",
      "keyPoint": "A swing high or low is a local turning point defined by a chosen number of bars or a price threshold. In a common framework, higher highs..."
    },
    {
      "type": "learn",
      "title": "State the methodology",
      "body": "Specify swing rules, timeframe, whether a wick or close counts, and which swing is relevant.\n\nA minor swing break can coexist with a larger-timeframe trend; timeframe hierarchy is an analytical choice, not a universal rule.\n\nBOS and CHoCH do not have universally fixed definitions.\n\nA structure break is evidence to assess, not a prediction.\n\nSwitching swing definitions mid-analysis.\n\nTreating a wick through a level as confirmation without a predefined rule.",
      "keyPoint": "Specify swing rules, timeframe, whether a wick or close counts, and which swing is relevant"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Swings and breaks",
        "State the methodology"
      ]
    }
  ],
  "technical-liquidity-smc": [
    {
      "type": "learn",
      "title": "Liquidity and Smart Money Concepts",
      "body": "SMC is a family of chart-reading frameworks; its labels are interpretations, not direct views of hidden orders.",
      "keyPoint": "Examine liquidity, stop clusters, order blocks, and fair value gaps carefully"
    },
    {
      "type": "learn",
      "title": "What a chart can and cannot show",
      "body": "Liquidity broadly describes how readily an asset can trade without large price impact. Traders sometimes infer likely stop areas near visible highs and lows and call a move through them a sweep. A chart alone cannot prove stops were present, who triggered them, or intent.",
      "keyPoint": "Liquidity broadly describes how readily an asset can trade without large price impact. Traders sometimes infer likely stop areas near vis..."
    },
    {
      "type": "learn",
      "title": "What a chart can and cannot show",
      "body": "An order block is commonly marked as a prior candle or zone before a strong move; a fair value gap is often defined as a three-candle range imbalance. There is no single standardized definition, and price may never revisit a marked zone.",
      "keyPoint": "Liquidity broadly describes how readily an asset can trade without large price impact. Traders sometimes infer likely stop areas near vis..."
    },
    {
      "type": "learn",
      "title": "Use labels as hypotheses",
      "body": "Record the exact zone and confirmation rule, then test it across unseen data with costs.\n\nAvoid claims that institutions must defend a zone or that every sweep causes reversal.\n\nLiquidity concepts can organize hypotheses but do not reveal hidden intent.\n\nSMC terms and drawing rules vary substantially.\n\nTreating inferred stops or order blocks as observable facts.\n\nSelecting zones retrospectively after a reaction.",
      "keyPoint": "Record the exact zone and confirmation rule, then test it across unseen data with costs"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "What a chart can and cannot show",
        "Use labels as hypotheses"
      ]
    }
  ],
  "technical-trendlines": [
    {
      "type": "learn",
      "title": "Trendlines and support/resistance",
      "body": "Trendlines and horizontal levels summarize prior reactions; they are approximate regions, not barriers.",
      "keyPoint": "Draw levels as zones and test them without false precision"
    },
    {
      "type": "learn",
      "title": "Drawing a useful reference",
      "body": "A trendline connects selected rising lows or falling highs. Horizontal support and resistance mark areas where price previously paused or turned. Different swing choices create different lines, and prices can pass through them.",
      "keyPoint": "A trendline connects selected rising lows or falling highs. Horizontal support and resistance mark areas where price previously paused or..."
    },
    {
      "type": "learn",
      "title": "Drawing a useful reference",
      "body": "Treat a level as a zone appropriate to the instrument's volatility. More touches do not automatically make it stronger; repeated tests may also consume resting interest.",
      "keyPoint": "A trendline connects selected rising lows or falling highs. Horizontal support and resistance mark areas where price previously paused or..."
    },
    {
      "type": "learn",
      "title": "Make drawings reproducible",
      "body": "Choose swing rules and timeframe before drawing; record why a line would be invalidated.\n\nDo not move a line after a loss simply to make the original idea appear correct.\n\nChart levels are approximate and analyst-dependent.\n\nA reaction at a level is uncertain and must be evaluated in context.\n\nDrawing through arbitrary points to fit a narrative.\n\nAssuming past support must hold again.",
      "keyPoint": "Choose swing rules and timeframe before drawing; record why a line would be invalidated"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Drawing a useful reference",
        "Make drawings reproducible"
      ]
    }
  ],
  "technical-indicators": [
    {
      "type": "learn",
      "title": "Moving averages, RSI, and MACD",
      "body": "Indicators transform past price or volume data; they do not add certainty or independent information automatically.",
      "keyPoint": "Understand what common indicators calculate and what they omit"
    },
    {
      "type": "learn",
      "title": "Three common tools",
      "body": "A simple moving average is the mean of a selected number of recent prices; an exponential moving average weights recent values more heavily. Both smooth data and lag turning points.",
      "keyPoint": "A simple moving average is the mean of a selected number of recent prices; an exponential moving average weights recent values more heavi..."
    },
    {
      "type": "learn",
      "title": "Three common tools",
      "body": "RSI compares recent average gains and losses on a bounded scale. MACD compares moving averages and is often displayed with a signal line and histogram. Formula details, input prices, and settings may vary by platform.",
      "keyPoint": "A simple moving average is the mean of a selected number of recent prices; an exponential moving average weights recent values more heavi..."
    },
    {
      "type": "learn",
      "title": "Use with restraint",
      "body": "An 'overbought' RSI reading can persist in a strong rise; 'oversold' can persist in a decline.\n\nIndicators built from the same price series are often correlated. Adding more indicators can create redundancy rather than confirmation.\n\nTest settings on data not used to choose them and account for lag, costs, and regime changes.\n\nIndicators summarize historical inputs and necessarily have limitations.\n\nA threshold is not a trade instruction by itself.\n\nTreating RSI extremes as automatic reversals.\n\nOptimizing many indicator settings on the same historical sample.",
      "keyPoint": "An 'overbought' RSI reading can persist in a strong rise; 'oversold' can persist in a decline"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Three common tools",
        "Use with restraint"
      ]
    }
  ],
  "technical-chart-reading": [
    {
      "type": "learn",
      "title": "A practical chart-reading workflow",
      "body": "A repeatable chart routine separates observation from prediction and keeps uncertainty visible.",
      "keyPoint": "Move from broad context to a testable, risk-aware observation"
    },
    {
      "type": "learn",
      "title": "A simple sequence",
      "body": "Confirm the symbol, data source, timeframe, session, and whether prices are adjusted.\n\nDescribe the broad regime: advancing, declining, ranging, or unclear. Mark only a few relevant swings and zones.\n\nObserve current price action and any pattern using explicit definitions; write down alternative explanations.\n\nIf considering a trade, specify the trigger, invalidation, position risk, costs, and what would make you stand aside.",
      "keyPoint": "Confirm the symbol, data source, timeframe, session, and whether prices are adjusted"
    },
    {
      "type": "learn",
      "title": "Keep evidence in proportion",
      "body": "A chart is a lossy view of a market. Apparent patterns can result from random variation, and different timeframes can conflict. A useful process records what was knowable at the time rather than annotating only after the outcome.\n\nSeparate observations, interpretations, and decisions.\n\nA valid decision can have an adverse outcome; process quality is not the same as profit.\n\nAdding indicators until a preferred story appears.\n\nIgnoring data quality, timeframe, and the possibility of no trade.",
      "keyPoint": "A chart is a lossy view of a market. Apparent patterns can result from random variation, and different timeframes can conflict. A useful..."
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "A simple sequence",
        "Keep evidence in proportion"
      ]
    }
  ],
  "risk-position-sizing": [
    {
      "type": "learn",
      "title": "Position sizing from a risk limit",
      "body": "Position size connects a planned exit distance to a chosen loss limit; it cannot cap every real-world loss.",
      "keyPoint": "Calculate a theoretical size from account risk and stop distance"
    },
    {
      "type": "learn",
      "title": "Basic arithmetic",
      "body": "For a linear instrument quoted in the account currency, a simplified formula is: position units = cash risk / (entry-to-stop distance per unit). If account equity is $10,000 and the hypothetical risk limit is 0.5%, cash risk is $10,000 x 0.005 = $50. With a $2 per-unit stop distance, size is $50 / $2 = 25 units before costs.",
      "keyPoint": "For a linear instrument quoted in the account currency, a simplified formula is: position units = cash risk / (entry-to-stop distance per..."
    },
    {
      "type": "learn",
      "title": "Basic arithmetic",
      "body": "If the stop distance is $2 per share but each share's value changes by $2 at the stop, 25 shares imply a planned $50 loss. This arithmetic assumes a fill at the stop and excludes fees, spread, gaps, FX conversion, and contract multipliers.\n\nposition units = cash risk / (entry-to-stop distance per unit)",
      "keyPoint": "For a linear instrument quoted in the account currency, a simplified formula is: position units = cash risk / (entry-to-stop distance per..."
    },
    {
      "type": "learn",
      "title": "Instrument-specific adjustments",
      "body": "Futures, options, CFDs, FX, and leveraged products have different contract values, margin, and loss behavior. Verify tick value, multiplier, quote currency, and broker rules.\n\nRound size down to an allowed increment and recalculate the exposure. A stop does not guarantee the planned loss.\n\nSize follows from a defined risk amount and instrument-specific stop value.\n\nThe planned risk is not a guaranteed maximum loss.\n\nUsing account balance instead of a deliberate risk limit.\n\nForgetting contract multipliers, currency conversion, or gap risk.",
      "keyPoint": "Futures, options, CFDs, FX, and leveraged products have different contract values, margin, and loss behavior. Verify tick value, multipli..."
    },
    {
      "type": "practice",
      "body": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper."
    },
    {
      "type": "recap",
      "points": [
        "Basic arithmetic",
        "Instrument-specific adjustments"
      ]
    }
  ],
  "risk-risk-reward": [
    {
      "type": "learn",
      "title": "Risk, reward, and expectancy",
      "body": "A reward-to-risk estimate describes a plan, not the probability that its target will be reached.",
      "keyPoint": "Compare planned outcomes using probabilities and costs"
    },
    {
      "type": "learn",
      "title": "Use consistent units",
      "body": "If planned loss is $50 and planned gain is $100, the reward-to-risk ratio is $100 / $50 = 2:1 before costs. In R notation, a $50 planned loss is 1R and a $100 gain is 2R.",
      "keyPoint": "If planned loss is $50 and planned gain is $100, the reward-to-risk ratio is $100 / $50 = 2:1 before costs. In R notation, a $50 planned..."
    },
    {
      "type": "learn",
      "title": "Use consistent units",
      "body": "A simplified expectancy is (win probability x average win) - (loss probability x average loss). For a hypothetical 40% win rate, $100 average win, and $50 average loss: 0.40 x $100 - 0.60 x $50 = $10 per trade before costs. This is an estimate, not a promise; observed rates and outcomes vary.\n\nexpectancy = (win probability x average win) - (loss probability x average loss)",
      "keyPoint": "If planned loss is $50 and planned gain is $100, the reward-to-risk ratio is $100 / $50 = 2:1 before costs. In R notation, a $50 planned..."
    },
    {
      "type": "learn",
      "title": "Interpret carefully",
      "body": "Include fees, spread, slippage, financing, partial exits, and unfilled trades when measuring outcomes.\n\nA favorable ratio alone says nothing about whether the setup reaches its target often enough.\n\nCompare planned gain and loss in the same units.\n\nExpectancy depends on both outcome size and frequency, and on costs.\n\nAssuming a 2:1 plan means twice as many wins as losses.\n\nEstimating win probability from a tiny or selectively chosen sample.",
      "keyPoint": "Include fees, spread, slippage, financing, partial exits, and unfilled trades when measuring outcomes"
    },
    {
      "type": "practice",
      "body": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper."
    },
    {
      "type": "recap",
      "points": [
        "Use consistent units",
        "Interpret carefully"
      ]
    }
  ],
  "risk-stop-and-gap-risk": [
    {
      "type": "learn",
      "title": "Stops, gaps, and loss limits",
      "body": "Stops are risk-management instructions, not insurance against execution at a specific price.",
      "keyPoint": "Understand what stops can and cannot control"
    },
    {
      "type": "learn",
      "title": "Trigger versus fill",
      "body": "A stop-market order commonly becomes a market order after its trigger condition is met. It prioritizes an exit but can fill at a worse price in a fast market or gap. A stop-limit adds a price boundary but may not execute at all.\n\nSome platforms use last-traded, bid, ask, or other trigger references. Check the venue's rules and simulate likely behavior before relying on an order.\n\nSize positions for plausible adverse movement, not only the intended stop distance.\n\nConsider overnight announcements, illiquidity, correlated positions, and operational failure.\n\nA stop trigger and execution price are different concepts.\n\nGaps and thin markets can exceed a planned loss.\n\nDescribing stop distance as a guaranteed maximum loss.\n\nUsing stop-limit orders without considering non-execution.",
      "keyPoint": "A stop-market order commonly becomes a market order after its trigger condition is met. It prioritizes an exit but can fill at a worse pr..."
    },
    {
      "type": "practice",
      "body": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper."
    },
    {
      "type": "recap",
      "points": [
        "Trigger versus fill",
        "Layer risk controls"
      ]
    }
  ],
  "risk-portfolio-exposure": [
    {
      "type": "learn",
      "title": "Portfolio exposure and drawdown",
      "body": "Several positions can amount to one concentrated bet when their risks move together.",
      "keyPoint": "Consider correlated trades, concentration, and losing periods"
    },
    {
      "type": "learn",
      "title": "Aggregate rather than isolate",
      "body": "Two trades in related assets may lose together. Correlations change over time, so historical diversification can weaken during stress. Consider total exposure by currency, sector, instrument, and scenario rather than only risk per trade.",
      "keyPoint": "Two trades in related assets may lose together. Correlations change over time, so historical diversification can weaken during stress. Co..."
    },
    {
      "type": "learn",
      "title": "Aggregate rather than isolate",
      "body": "Drawdown is a decline from a prior account peak. A 20% decline on $10,000 leaves $8,000; returning from $8,000 to $10,000 requires a 25% gain because $2,000 / $8,000 = 0.25.",
      "keyPoint": "Two trades in related assets may lose together. Correlations change over time, so historical diversification can weaken during stress. Co..."
    },
    {
      "type": "learn",
      "title": "Plan resilience",
      "body": "Set exposure limits and a review process appropriate to personal circumstances and instrument risk.\n\nStress-test clustered losses, gaps, and reduced liquidity; no historical scenario covers every future event.\n\nPer-trade sizing does not capture all portfolio risk.\n\nLoss recovery percentages are asymmetric.\n\nAssuming different tickers guarantee diversification.\n\nIncreasing risk to quickly recover a drawdown.",
      "keyPoint": "Set exposure limits and a review process appropriate to personal circumstances and instrument risk"
    },
    {
      "type": "practice",
      "body": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper."
    },
    {
      "type": "recap",
      "points": [
        "Aggregate rather than isolate",
        "Plan resilience"
      ]
    }
  ],
  "risk-trade-planning": [
    {
      "type": "learn",
      "title": "Write a trade plan before entry",
      "body": "A written plan makes assumptions visible and reduces the temptation to improvise under pressure.",
      "keyPoint": "Specify a hypothesis, invalidation, size, and contingencies"
    },
    {
      "type": "learn",
      "title": "A compact plan",
      "body": "State the setup and the evidence that would trigger entry.\n\nDefine the price or condition that invalidates the hypothesis and the exit instruction.\n\nCalculate position size, total exposure, costs, and plausible gap loss.\n\nRecord target logic, event risks, and what you will do if the order only partially fills.",
      "keyPoint": "State the setup and the evidence that would trigger entry"
    },
    {
      "type": "learn",
      "title": "Allow for no trade",
      "body": "If the trigger, risk, or instrument details are unclear, waiting is a valid decision. A plan organizes uncertainty; it does not remove it or make a trade suitable for every person.\n\nDecide in advance what would change your view.\n\nA clear plan includes size and failure conditions, not just entry.\n\nWriting a rationale only after taking a position.\n\nMoving an invalidation level to avoid recording a loss.",
      "keyPoint": "If the trigger, risk, or instrument details are unclear, waiting is a valid decision. A plan organizes uncertainty; it does not remove it..."
    },
    {
      "type": "practice",
      "body": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper."
    },
    {
      "type": "recap",
      "points": [
        "A compact plan",
        "Allow for no trade"
      ]
    }
  ],
  "fundamental-economic-drivers": [
    {
      "type": "learn",
      "title": "Economic drivers and market expectations",
      "body": "Fundamental analysis studies factors that may affect value; markets respond to expectations as well as published data.",
      "keyPoint": "Relate growth, inflation, rates, and expectations cautiously"
    },
    {
      "type": "learn",
      "title": "A connected system",
      "body": "Growth, employment, inflation, fiscal policy, and central-bank decisions can influence rates, currencies, bonds, equities, and commodities through multiple channels. Relationships are not fixed: the same data can be interpreted differently across regimes.",
      "keyPoint": "Growth, employment, inflation, fiscal policy, and central-bank decisions can influence rates, currencies, bonds, equities, and commoditie..."
    },
    {
      "type": "learn",
      "title": "A connected system",
      "body": "Prices often move before an announcement as expectations change. A result that is strong in absolute terms can still disappoint if it is weaker than expected.",
      "keyPoint": "Growth, employment, inflation, fiscal policy, and central-bank decisions can influence rates, currencies, bonds, equities, and commoditie..."
    },
    {
      "type": "learn",
      "title": "Separate fact from forecast",
      "body": "Record the release, prior value, consensus estimate, and revisions from a reliable source.\n\nTreat a causal story as a hypothesis; unexpected positioning, policy, or external shocks may dominate.\n\nMarkets price expectations, not just headline values.\n\nMacroeconomic relationships vary over time.\n\nAssuming a strong report must lift every related asset.\n\nTreating consensus or one economic model as certainty.",
      "keyPoint": "Record the release, prior value, consensus estimate, and revisions from a reliable source"
    },
    {
      "type": "practice",
      "body": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price."
    },
    {
      "type": "recap",
      "points": [
        "A connected system",
        "Separate fact from forecast"
      ]
    }
  ],
  "fundamentals-company-analysis": [
    {
      "type": "learn",
      "title": "Company and asset fundamentals",
      "body": "Fundamental research asks what can support or undermine an asset's value, without producing a certain fair price.",
      "keyPoint": "Organize a basic review of business quality, valuation, and risk"
    },
    {
      "type": "learn",
      "title": "Questions to investigate",
      "body": "How does the business earn revenue, and what affects its costs, margins, and competitive position?\n\nReview cash flow, debt, liquidity, dilution, and accounting notes alongside reported earnings.\n\nCompare valuation measures only among reasonably comparable businesses and understand their assumptions.\n\nFor non-company assets, examine supply, demand, contract design, custody, and relevant policy or network risks.",
      "keyPoint": "How does the business earn revenue, and what affects its costs, margins, and competitive position"
    },
    {
      "type": "learn",
      "title": "Valuation is assumption-sensitive",
      "body": "A valuation model translates assumptions into an estimate; small changes to growth, discount rates, margins, or terminal value can change the result materially. Financial statements are historical and may be revised or affected by accounting choices.\n\nUse multiple sources and examine cash, debt, and business risks.\n\nA valuation is conditional on assumptions, not an objective guarantee.\n\nRelying on one ratio without comparing business models.\n\nConfusing a good company with an asset that is attractively priced.",
      "keyPoint": "A valuation model translates assumptions into an estimate; small changes to growth, discount rates, margins, or terminal value can change..."
    },
    {
      "type": "practice",
      "body": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price."
    },
    {
      "type": "recap",
      "points": [
        "Questions to investigate",
        "Valuation is assumption-sensitive"
      ]
    }
  ],
  "fundamentals-events-calendar": [
    {
      "type": "learn",
      "title": "Economic calendars and event risk",
      "body": "A calendar helps identify scheduled events; it cannot predict their market impact.",
      "keyPoint": "Prepare for scheduled releases and uncertainty around them"
    },
    {
      "type": "learn",
      "title": "Prepare, do not predict",
      "body": "Central-bank decisions, inflation releases, employment reports, earnings, and policy announcements can coincide with wider spreads and rapid repricing. Check the event time, time zone, source, and whether a release has been revised.\n\nThe direction of the first move may differ from the later response. Consensus, positioning, guidance, and details can matter as much as the headline.",
      "keyPoint": "Central-bank decisions, inflation releases, employment reports, earnings, and policy announcements can coincide with wider spreads and ra..."
    },
    {
      "type": "learn",
      "title": "Manage exposure",
      "body": "Know whether positions will be open during a scheduled event and what the instrument's overnight rules are.\n\nA calendar is incomplete for unscheduled news. Avoid relying on a scheduled stop fill in a gap.\n\nScheduled events can change liquidity and volatility.\n\nA calendar informs preparation, not the result.\n\nTrading a headline without checking the actual release and context.\n\nAssuming all event risk is listed in advance.",
      "keyPoint": "Know whether positions will be open during a scheduled event and what the instrument's overnight rules are"
    },
    {
      "type": "practice",
      "body": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price."
    },
    {
      "type": "recap",
      "points": [
        "Prepare, do not predict",
        "Manage exposure"
      ]
    }
  ],
  "fundamentals-research-sources": [
    {
      "type": "learn",
      "title": "Build a reliable research routine",
      "body": "Research quality depends on source quality and a transparent distinction between evidence and interpretation.",
      "keyPoint": "Check sources, timestamps, revisions, and alternative explanations"
    },
    {
      "type": "learn",
      "title": "Verify inputs",
      "body": "Prefer primary releases, filings, exchange notices, or clearly attributed data providers.\n\nCheck units, period, currency, release time, revisions, and whether figures are seasonally adjusted.\n\nKeep the original observation separate from commentary or a forecast.",
      "keyPoint": "Prefer primary releases, filings, exchange notices, or clearly attributed data providers"
    },
    {
      "type": "learn",
      "title": "Keep uncertainty explicit",
      "body": "A concise daily brief can summarize known events and plausible scenarios, but should not imply that it knows the next price move. Confirm material claims independently and note when information is unavailable or stale.\n\nTimestamp and verify data before drawing conclusions.\n\nSeparate observed facts, estimates, and interpretations.\n\nRepeating an unverified headline as established fact.\n\nIgnoring revisions or using a data point from the wrong period.",
      "keyPoint": "A concise daily brief can summarize known events and plausible scenarios, but should not imply that it knows the next price move. Confirm..."
    },
    {
      "type": "practice",
      "body": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price."
    },
    {
      "type": "recap",
      "points": [
        "Verify inputs",
        "Keep uncertainty explicit"
      ]
    }
  ],
  "psychology-process-over-outcome": [
    {
      "type": "learn",
      "title": "Process over outcome",
      "body": "A good process can produce a loss, and a poor process can occasionally produce a gain.",
      "keyPoint": "Judge decisions by the information and rules available at the time"
    },
    {
      "type": "learn",
      "title": "Separate decision and result",
      "body": "Because each trade has an uncertain outcome, one result is weak evidence about whether a decision rule is sound. Review whether you followed a defined plan, used valid information, and respected risk limits.\n\nOver many observations, carefully collected results can help assess a method, but even a large sample may not represent a changed market regime.",
      "keyPoint": "Because each trade has an uncertain outcome, one result is weak evidence about whether a decision rule is sound. Review whether you follo..."
    },
    {
      "type": "learn",
      "title": "Use a review checklist",
      "body": "Was the setup valid by the rule written before entry?\n\nWas exposure within plan, and were changes documented?\n\nWhat would you repeat or revise based on evidence rather than hindsight?\n\nEvaluate the decision process separately from one trade's result.\n\nConsistent review is more informative than reacting to a single outcome.\n\nCalling a risky rule good because it won once.\n\nAbandoning a tested process after a small run of losses.",
      "keyPoint": "Was the setup valid by the rule written before entry"
    },
    {
      "type": "practice",
      "body": "After a trading decision, journal the plan you followed, the emotion you noticed, and one process change. Review the decision process separately from the outcome."
    },
    {
      "type": "recap",
      "points": [
        "Separate decision and result",
        "Use a review checklist"
      ]
    }
  ],
  "psychology-losses": [
    {
      "type": "learn",
      "title": "Losses, drawdowns, and emotional control",
      "body": "Uncertainty and losses can prompt impulsive decisions; practical limits help reduce the chance of escalation.",
      "keyPoint": "Recognize common reactions and use pre-planned boundaries"
    },
    {
      "type": "learn",
      "title": "Notice the pattern",
      "body": "After a loss, people may increase size to recover quickly, move a stop, or take a low-quality setup. After a win, overconfidence can lead to the same disregard for limits. These reactions are common but not inevitable.\n\nA losing streak does not by itself prove that a method has stopped working, and it also does not justify continuing without review.",
      "keyPoint": "After a loss, people may increase size to recover quickly, move a stop, or take a low-quality setup. After a win, overconfidence can lead..."
    },
    {
      "type": "learn",
      "title": "Set guardrails",
      "body": "Define a maximum session loss, pause conditions, and when to seek an independent review before trading.\n\nReduce exposure or step away when tired, distressed, or unable to follow the plan.\n\nEmotional guardrails should be decided before high-pressure moments.\n\nProtect wellbeing and capital rather than trying to force a recovery.\n\nRevenge trading to erase a loss immediately.\n\nIncreasing risk because a recent outcome feels unusually certain.",
      "keyPoint": "Define a maximum session loss, pause conditions, and when to seek an independent review before trading"
    },
    {
      "type": "practice",
      "body": "After a trading decision, journal the plan you followed, the emotion you noticed, and one process change. Review the decision process separately from the outcome."
    },
    {
      "type": "recap",
      "points": [
        "Notice the pattern",
        "Set guardrails"
      ]
    }
  ],
  "psychology-journaling": [
    {
      "type": "learn",
      "title": "Trading journals and review",
      "body": "A journal is useful when it captures decisions and context consistently, including trades that were not taken.",
      "keyPoint": "Record decisions in a way that supports honest learning"
    },
    {
      "type": "learn",
      "title": "What to record",
      "body": "Timestamp, instrument, timeframe, setup rule, entry and exit, planned risk, and actual costs.\n\nA chart or note showing what was visible before the outcome, plus any rule deviation.\n\nMarket context, emotional state, and an alternative explanation where relevant.",
      "keyPoint": "Timestamp, instrument, timeframe, setup rule, entry and exit, planned risk, and actual costs"
    },
    {
      "type": "learn",
      "title": "Review without hindsight",
      "body": "Use fixed labels and review periods so categories remain comparable. Preserve the original plan; do not edit it after the result. Protect personal and financial data stored in a journal.\n\nConsistent records reveal process patterns that memory can distort.\n\nInclude missed, invalid, and losing setups to reduce selection bias.\n\nRecording only winning trades.\n\nChanging labels or rules during analysis to improve apparent results.",
      "keyPoint": "Use fixed labels and review periods so categories remain comparable. Preserve the original plan; do not edit it after the result. Protect..."
    },
    {
      "type": "practice",
      "body": "After a trading decision, journal the plan you followed, the emotion you noticed, and one process change. Review the decision process separately from the outcome."
    },
    {
      "type": "recap",
      "points": [
        "What to record",
        "Review without hindsight"
      ]
    }
  ],
  "psychology-routines": [
    {
      "type": "learn",
      "title": "Routines, attention, and boundaries",
      "body": "A routine can reduce avoidable decisions, but it cannot make an unsuitable or risky activity safe for everyone.",
      "keyPoint": "Create sustainable limits around screen time and decision-making"
    },
    {
      "type": "learn",
      "title": "A practical routine",
      "body": "Prepare relevant events and define the times you will and will not monitor markets.\n\nUse alerts and written rules rather than watching every price change.\n\nSchedule breaks, review exposure, and stop when attention or wellbeing deteriorates.",
      "keyPoint": "Prepare relevant events and define the times you will and will not monitor markets"
    },
    {
      "type": "learn",
      "title": "Keep boundaries",
      "body": "Never risk money needed for essentials, and consider whether trading is compatible with your circumstances. If market activity is causing significant distress or loss of control, pause and seek appropriate support.\n\nAttention and wellbeing are part of risk management.\n\nA deliberate pause is a valid part of a trading routine.\n\nConfusing more screen time with better decisions.\n\nContinuing while tired, distressed, or outside personal limits.",
      "keyPoint": "Never risk money needed for essentials, and consider whether trading is compatible with your circumstances. If market activity is causing..."
    },
    {
      "type": "practice",
      "body": "After a trading decision, journal the plan you followed, the emotion you noticed, and one process change. Review the decision process separately from the outcome."
    },
    {
      "type": "recap",
      "points": [
        "A practical routine",
        "Keep boundaries"
      ]
    }
  ],
  "strategies-rules-and-hypotheses": [
    {
      "type": "learn",
      "title": "Turn an idea into strategy rules",
      "body": "A strategy becomes testable when its signals and decisions can be applied consistently without hindsight.",
      "keyPoint": "Define observable conditions, exits, and scope before testing"
    },
    {
      "type": "learn",
      "title": "Specify the method",
      "body": "Define eligible instruments, timeframe, data source, and trading sessions.\n\nDescribe entry trigger, order type, stop or invalidation, exit, and position-size calculation.\n\nWrite down exclusions such as scheduled events or poor liquidity.\n\nChoose evaluation measures and a comparison baseline before looking at results.",
      "keyPoint": "Define eligible instruments, timeframe, data source, and trading sessions"
    },
    {
      "type": "learn",
      "title": "Keep rules operational",
      "body": "Terms such as 'strong trend' or 'clean breakout' need measurable definitions. If a rule requires judgment, document the judgment process and assess whether another reviewer can apply it similarly.\n\nRules should be clear enough to reproduce.\n\nA strategy is a hypothesis to evaluate, not a guarantee of returns.\n\nChanging entry rules after seeing historical outcomes.\n\nLeaving costs, unfilled orders, or exclusions unspecified.",
      "keyPoint": "Terms such as 'strong trend' or 'clean breakout' need measurable definitions. If a rule requires judgment, document the judgment process..."
    },
    {
      "type": "practice",
      "body": "Write a testable checklist for this idea: market, timeframe, entry, exit, invalidation, and cost assumptions. Apply the same rules to historical examples before drawing conclusions."
    },
    {
      "type": "recap",
      "points": [
        "Specify the method",
        "Keep rules operational"
      ]
    }
  ],
  "strategies-backtesting-basics": [
    {
      "type": "learn",
      "title": "Backtesting without fooling yourself",
      "body": "A backtest estimates how fixed rules would have behaved on historical data; it cannot establish future performance.",
      "keyPoint": "Test historical rules with realistic costs and out-of-sample data"
    },
    {
      "type": "learn",
      "title": "Design a credible test",
      "body": "Use timestamped data appropriate to the instrument and avoid look-ahead or survivorship bias.\n\nModel spread, commissions, slippage, financing, contract changes, and fills as realistically as possible.\n\nSeparate development data from an untouched test period; consider walk-forward or paper validation.\n\nCompare with a simple baseline and report drawdown, trade count, exposure, and uncertainty, not only total return.",
      "keyPoint": "Use timestamped data appropriate to the instrument and avoid look-ahead or survivorship bias"
    },
    {
      "type": "learn",
      "title": "Interpret results modestly",
      "body": "Trying many variants and reporting only the best creates data-mining bias. A small sample can look compelling by chance; market structure and costs can change. Past test performance is not a prediction or promise.\n\nAvoid using the same data to invent and validate a strategy.\n\nInclude realistic execution costs and examine adverse periods.\n\nOptimizing many parameters until historical results look ideal.\n\nTreating a backtest as a guarantee or as evidence of suitability.",
      "keyPoint": "Trying many variants and reporting only the best creates data-mining bias. A small sample can look compelling by chance; market structure..."
    },
    {
      "type": "practice",
      "body": "Write a testable checklist for this idea: market, timeframe, entry, exit, invalidation, and cost assumptions. Apply the same rules to historical examples before drawing conclusions."
    },
    {
      "type": "recap",
      "points": [
        "Design a credible test",
        "Interpret results modestly"
      ]
    }
  ],
  "strategies-breakout-example": [
    {
      "type": "learn",
      "title": "A hypothetical breakout exercise",
      "body": "This is a hypothetical learning exercise using invented levels, not a live market example or recommendation.",
      "keyPoint": "Practice writing entry, failure, and risk rules for a simulated setup"
    },
    {
      "type": "learn",
      "title": "Simulated setup",
      "body": "Suppose a fictional asset has repeatedly traded inside a range from 48 to 52. For practice only, define a breakout trigger as a completed hourly close above 52, with no scheduled event in the exercise window. These numbers are invented and do not describe market data.",
      "keyPoint": "Suppose a fictional asset has repeatedly traded inside a range from 48 to 52. For practice only, define a breakout trigger as a completed..."
    },
    {
      "type": "learn",
      "title": "Simulated setup",
      "body": "A learner might record an entry rule, an invalidation condition back inside the range, and a maximum cash risk. The exercise does not assume that a breakout will continue; a false break is an equally relevant scenario.",
      "keyPoint": "Suppose a fictional asset has repeatedly traded inside a range from 48 to 52. For practice only, define a breakout trigger as a completed..."
    },
    {
      "type": "learn",
      "title": "Review both paths",
      "body": "Scenario A: price gaps above the trigger; compare the planned order with possible slippage or a missed fill.\n\nScenario B: price closes above 52, then falls back into the range; follow the prewritten invalidation rule rather than improvising.\n\nDo not infer an edge from one example. Collect many simulated cases and then test fixed rules on separate data.\n\nThe example is fictional and intended for simulation only.\n\nA breakout rule must describe false breaks and execution uncertainty.\n\nTreating an invented scenario as a current market setup.\n\nCounting only successful breakouts when reviewing the exercise.",
      "keyPoint": "Scenario A: price gaps above the trigger; compare the planned order with possible slippage or a missed fill"
    },
    {
      "type": "practice",
      "body": "Write a testable checklist for this idea: market, timeframe, entry, exit, invalidation, and cost assumptions. Apply the same rules to historical examples before drawing conclusions."
    },
    {
      "type": "recap",
      "points": [
        "Simulated setup",
        "Review both paths"
      ]
    }
  ],
  "strategies-paper-practice": [
    {
      "type": "learn",
      "title": "Paper trading and deliberate practice",
      "body": "Simulation can help rehearse rules, but it does not fully reproduce real execution or emotional stakes.",
      "keyPoint": "Practice execution rules in simulation while recognizing its limits"
    },
    {
      "type": "learn",
      "title": "Practice the process",
      "body": "Use the same entry, sizing, exit, and journal rules intended for evaluation.\n\nRecord hypothetical fills using conservative assumptions for spread, partial fills, and slippage.\n\nInclude no-trade decisions, losing sequences, and event conditions.",
      "keyPoint": "Use the same entry, sizing, exit, and journal rules intended for evaluation"
    },
    {
      "type": "learn",
      "title": "Know the gap to live markets",
      "body": "Demo fills may be instant or unrealistically favorable; liquidity, queue position, latency, and emotions differ with real exposure. A simulation is practice evidence, not proof of future profitability or suitability.\n\nSimulation is useful for rehearsing process, not predicting returns.\n\nModel execution conservatively and record deviations.\n\nAssuming demo results will transfer unchanged to live trading.\n\nChanging rules whenever a simulated trade loses.",
      "keyPoint": "Demo fills may be instant or unrealistically favorable; liquidity, queue position, latency, and emotions differ with real exposure. A sim..."
    },
    {
      "type": "practice",
      "body": "Write a testable checklist for this idea: market, timeframe, entry, exit, invalidation, and cost assumptions. Apply the same rules to historical examples before drawing conclusions."
    },
    {
      "type": "recap",
      "points": [
        "Practice the process",
        "Know the gap to live markets"
      ]
    }
  ],
  "fundamentals-forex-pairs": [
    {
      "type": "learn",
      "title": "Forex pairs: base, quote, major, and exotic",
      "body": "Forex quotes compare one currency with another; a pair's price is not the price of a single currency in isolation.",
      "keyPoint": "Read a currency pair and understand what its quoted price means"
    },
    {
      "type": "learn",
      "title": "Reading a pair",
      "body": "In EUR/USD, EUR is the base currency and USD is the quote currency. A hypothetical quote of 1.0800 means one euro is priced at 1.08 US dollars. If the quote rises, the euro has strengthened relative to the dollar under that quote convention; it does not mean every euro-related asset rose.",
      "keyPoint": "In EUR/USD, EUR is the base currency and USD is the quote currency. A hypothetical quote of 1.0800 means one euro is priced at 1.08 US do..."
    },
    {
      "type": "learn",
      "title": "Reading a pair",
      "body": "Major pairs commonly include the US dollar and another heavily traded currency. Crosses or minors omit USD, while exotic pairs often combine a major currency with a less-traded one. Classifications vary by provider, and the labels do not guarantee low costs or high liquidity.",
      "keyPoint": "In EUR/USD, EUR is the base currency and USD is the quote currency. A hypothetical quote of 1.0800 means one euro is priced at 1.08 US do..."
    },
    {
      "type": "learn",
      "title": "Contract details matter",
      "body": "Check the broker's symbol, contract size, quote precision, trading hours, and financing terms; symbols and specifications can differ.\n\nA currency's value is always relative to another currency, and multiple economic forces can move the relationship.\n\nThe first currency is the base; the second is the quote.\n\nMajor/minor/exotic are descriptive groupings, not risk ratings.\n\nReversing the meaning of a pair's quote.\n\nAssuming an exotic pair is safe because the chart looks quiet.",
      "keyPoint": "Check the broker's symbol, contract size, quote precision, trading hours, and financing terms; symbols and specifications can differ"
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Reading a pair",
        "Contract details matter"
      ]
    }
  ],
  "fundamentals-sessions-liquidity": [
    {
      "type": "learn",
      "title": "Forex sessions, liquidity, and volatility",
      "body": "Currency trading is decentralized and activity varies as financial centers open, overlap, and close.",
      "keyPoint": "Understand trading hours and why activity changes through the day"
    },
    {
      "type": "learn",
      "title": "Sessions are time zones, not guarantees",
      "body": "Traders often describe Asian, London, and New York sessions. Their hours depend on daylight-saving changes and the convention being used. The London-New York overlap is often active, but activity and spreads vary by pair, day, news, and venue.",
      "keyPoint": "Traders often describe Asian, London, and New York sessions. Their hours depend on daylight-saving changes and the convention being used...."
    },
    {
      "type": "learn",
      "title": "Sessions are time zones, not guarantees",
      "body": "Liquidity is the ability to trade without large price impact; volatility describes the degree of price variation over a period. They are related but not identical: a market can move sharply in thin conditions, and a liquid market can still be volatile.",
      "keyPoint": "Traders often describe Asian, London, and New York sessions. Their hours depend on daylight-saving changes and the convention being used...."
    },
    {
      "type": "learn",
      "title": "Plan around conditions",
      "body": "Check the instrument's actual trading hours and your local time zone instead of relying on a fixed UTC offset year-round.\n\nNews, holidays, rollover, and market closures can widen spreads or reduce available liquidity. A quiet chart does not prove low risk.\n\nForex sessions describe regional activity, not fixed performance windows.\n\nLiquidity and volatility are distinct concepts.\n\nTreating an overlap as a guaranteed profitable period.\n\nIgnoring daylight-saving shifts or holiday conditions.",
      "keyPoint": "Check the instrument's actual trading hours and your local time zone instead of relying on a fixed UTC offset year-round"
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Sessions are time zones, not guarantees",
        "Plan around conditions"
      ]
    }
  ],
  "fundamentals-forex-prices-pips": [
    {
      "type": "learn",
      "title": "Bid, ask, spread, pips, and lot size",
      "body": "Quotes, price increments, and contract size determine how price movement translates into trading cost or profit and loss.",
      "keyPoint": "Learn common FX price units and how trade size affects money at risk"
    },
    {
      "type": "learn",
      "title": "Quote and measure movement",
      "body": "The bid is the price at which a participant may sell and the ask is the price at which a participant may buy; the spread is the difference. A retail platform's exact display and execution rules depend on the provider.",
      "keyPoint": "The bid is the price at which a participant may sell and the ask is the price at which a participant may buy; the spread is the differenc..."
    },
    {
      "type": "learn",
      "title": "Quote and measure movement",
      "body": "A pip is a conventional FX movement unit, often 0.0001 for many non-JPY pairs and 0.01 for many JPY pairs, but contract specifications and fractional pip display vary. Always confirm the symbol's tick size rather than assuming precision.",
      "keyPoint": "The bid is the price at which a participant may sell and the ask is the price at which a participant may buy; the spread is the differenc..."
    },
    {
      "type": "learn",
      "title": "Size changes the cash effect",
      "body": "For illustration only, if a contract's pip value is $10 per standard lot, a 20-pip stop on 0.10 lot implies about $20 of price risk before spread, commissions, slippage, and conversion effects. Pip value varies by pair, account currency, and contract.",
      "keyPoint": "For illustration only, if a contract's pip value is $10 per standard lot, a 20-pip stop on 0.10 lot implies about $20 of price risk befor..."
    },
    {
      "type": "learn",
      "title": "Size changes the cash effect",
      "body": "A standard lot is often 100,000 base-currency units in retail FX, but mini, micro, and broker-specific contract sizes exist. Do not infer cash risk from the word 'lot' alone.\n\nApproximate cash risk = stop distance in pips x pip value per lot x lot size\n\nBid/ask spread is an immediate execution cost.\n\nPip value and contract size must match the actual instrument.\n\nUsing one pip value for every currency pair.\n\nConfusing chart decimal places with pip value or position size.",
      "keyPoint": "For illustration only, if a contract's pip value is $10 per standard lot, a 20-pip stop on 0.10 lot implies about $20 of price risk befor..."
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Quote and measure movement",
        "Size changes the cash effect"
      ]
    }
  ],
  "fundamentals-order-types-and-financing": [
    {
      "type": "learn",
      "title": "Order types, leverage, margin, and financing",
      "body": "An order instruction is not a guarantee of its fill price, and leveraged products can magnify losses as well as gains.",
      "keyPoint": "Compare common orders and the risks created by leverage and overnight positions"
    },
    {
      "type": "learn",
      "title": "Order instructions differ",
      "body": "A market order prioritizes execution at available prices; it can slip in fast or thin markets.\n\nA limit order sets the worst acceptable price but may never fill. A stop order activates under specified conditions and can fill beyond its trigger during a gap.\n\nBroker terminology, trigger source, partial fills, and order duration vary. Read the product and platform rules.",
      "keyPoint": "A market order prioritizes execution at available prices; it can slip in fast or thin markets"
    },
    {
      "type": "learn",
      "title": "Leverage and holding costs",
      "body": "Leverage allows a position's notional exposure to exceed the cash margin set aside. Margin is collateral, not a maximum-loss guarantee; a margin close-out may occur during a rapid move, and local protections differ.",
      "keyPoint": "Leverage allows a position's notional exposure to exceed the cash margin set aside. Margin is collateral, not a maximum-loss guarantee; a..."
    },
    {
      "type": "learn",
      "title": "Leverage and holding costs",
      "body": "Holding a position overnight may incur or earn financing (often called swap or rollover). Rates, triple-charge days, holidays, and conversion rules depend on the broker and instrument. Include these costs in plans and testing.\n\nMarket, limit, and stop instructions have different execution trade-offs.\n\nLeverage increases exposure and can accelerate losses; financing affects held positions.\n\nAssuming a stop guarantees the exact trigger price.\n\nTreating required margin as the full amount at risk.",
      "keyPoint": "Leverage allows a position's notional exposure to exceed the cash margin set aside. Margin is collateral, not a maximum-loss guarantee; a..."
    },
    {
      "type": "practice",
      "body": "Choose an instrument you follow. Find its trading hours, contract terms, typical costs, and one condition that could make execution unreliable."
    },
    {
      "type": "recap",
      "points": [
        "Order instructions differ",
        "Leverage and holding costs"
      ]
    }
  ],
  "technical-forming-candles": [
    {
      "type": "learn",
      "title": "Forming candles and completed-candle context",
      "body": "A candle's open, high, low, and close summarize one chosen interval, but its close is final only after that interval ends.",
      "keyPoint": "Separate a live candle's changing shape from a confirmed historical bar"
    },
    {
      "type": "learn",
      "title": "A candle changes before it closes",
      "body": "While a candle is forming, its high, low, and current price can change. A green or red body may shrink, grow, or switch direction before the interval completes. A screenshot can capture a moment that does not match the candle's eventual close.",
      "keyPoint": "While a candle is forming, its high, low, and current price can change. A green or red body may shrink, grow, or switch direction before..."
    },
    {
      "type": "learn",
      "title": "A candle changes before it closes",
      "body": "Completed candles preserve an interval's final OHLC values. On a chart's right edge, identify whether the last bar is partial, whether a separate current-price marker is visible, and which timeframe each bar represents.",
      "keyPoint": "While a candle is forming, its high, low, and current price can change. A green or red body may shrink, grow, or switch direction before..."
    },
    {
      "type": "learn",
      "title": "Avoid reading old prices as current",
      "body": "Do not label a previous completed candle's close as today's current quote.\n\nIf the price scale or current marker is unclear, state that the screenshot does not provide a reliable current price rather than estimating one.\n\nA forming bar is provisional; its final close is not yet known.\n\nState whether a price is a screenshot observation or a live quote.\n\nTreating a forming candle's shape as fixed.\n\nUsing an earlier candle close as the current market price.",
      "keyPoint": "Do not label a previous completed candle's close as today's current quote"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "A candle changes before it closes",
        "Avoid reading old prices as current"
      ]
    }
  ],
  "technical-classic-patterns": [
    {
      "type": "learn",
      "title": "Triple tops, bottoms, wedges, and pattern failures",
      "body": "Chart patterns are names for price geometry. Their interpretations vary, and none guarantees a reversal or continuation.",
      "keyPoint": "Compare repeated swing patterns and plan for false breaks"
    },
    {
      "type": "learn",
      "title": "Describe before you label",
      "body": "A triple top or bottom describes three tests of a broadly similar price area; a neckline or range boundary is often used as a reference. Peaks and troughs need not be equal, and three tests can lead to either a break or continued range trading.",
      "keyPoint": "A triple top or bottom describes three tests of a broadly similar price area; a neckline or range boundary is often used as a reference...."
    },
    {
      "type": "learn",
      "title": "Describe before you label",
      "body": "A rising wedge has converging boundaries that slope upward; a falling wedge converges while sloping downward. Traders may interpret them as possible exhaustion or continuation formations, but that interpretation is not a law. Textbook tendency is not confirmation.",
      "keyPoint": "A triple top or bottom describes three tests of a broadly similar price area; a neckline or range boundary is often used as a reference...."
    },
    {
      "type": "learn",
      "title": "Define confirmation and invalidation",
      "body": "Choose the timeframe, swing-selection rule, and whether a close, volume condition, or retest is required before looking for a trade.\n\nPlan for price to return inside the pattern, gap past an entry, or invalidate the idea before a fill. Test false breaks as well as clean textbook examples.\n\nPattern geometry does not reveal the next direction.\n\nPredefine a confirmation rule and invalidation point.\n\nCalling any three nearby highs a triple top.\n\nIgnoring examples that fail or retesting after seeing the outcome.",
      "keyPoint": "Choose the timeframe, swing-selection rule, and whether a close, volume condition, or retest is required before looking for a trade"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Describe before you label",
        "Define confirmation and invalidation"
      ]
    }
  ],
  "technical-market-regimes": [
    {
      "type": "learn",
      "title": "Trends, ranges, continuation, and reversals",
      "body": "A regime label summarizes past structure; it does not establish what price will do next.",
      "keyPoint": "Describe the market regime before choosing a chart hypothesis"
    },
    {
      "type": "learn",
      "title": "Classify observable behavior",
      "body": "An uptrend is commonly described by successive higher swing highs and higher swing lows; a downtrend by lower highs and lower lows. In a range, price repeatedly trades between approximate boundaries without a sustained directional sequence. Swing rules differ among analysts.",
      "keyPoint": "An uptrend is commonly described by successive higher swing highs and higher swing lows; a downtrend by lower highs and lower lows. In a..."
    },
    {
      "type": "learn",
      "title": "Classify observable behavior",
      "body": "A continuation hypothesis expects the existing move to resume after a pause. A reversal hypothesis expects a change in the prior sequence. A breakout is a move beyond a selected boundary; a retest is a later return toward it. None is confirmed by its label alone.",
      "keyPoint": "An uptrend is commonly described by successive higher swing highs and higher swing lows; a downtrend by lower highs and lower lows. In a..."
    },
    {
      "type": "learn",
      "title": "Keep timeframe and invalidation explicit",
      "body": "A short-timeframe breakout may occur inside a higher-timeframe range. State which timeframe supports each claim.\n\nDefine what would disprove the hypothesis before entry, and include false-break and gap scenarios.\n\nDescribe swing evidence and timeframe rather than relying on labels alone.\n\nA breakout, retest, continuation, or reversal can fail.\n\nCalling one candle a confirmed trend reversal.\n\nChanging timeframes selectively after a setup fails.",
      "keyPoint": "A short-timeframe breakout may occur inside a higher-timeframe range. State which timeframe supports each claim"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Classify observable behavior",
        "Keep timeframe and invalidation explicit"
      ]
    }
  ],
  "technical-liquidity-zones": [
    {
      "type": "learn",
      "title": "Buy-side and sell-side liquidity concepts",
      "body": "Some price-action frameworks use visible swing levels to hypothesize where orders may cluster; a chart cannot confirm hidden orders or intent.",
      "keyPoint": "Understand common liquidity-zone language without claiming to see hidden orders"
    },
    {
      "type": "learn",
      "title": "Common vocabulary",
      "body": "Buy-side liquidity is often used for hypothetical buy stops above visible highs; sell-side liquidity for hypothetical sell stops below visible lows. Equal highs and equal lows can make these zones salient to a chart reader, but they do not prove orders are actually there.",
      "keyPoint": "Buy-side liquidity is often used for hypothetical buy stops above visible highs; sell-side liquidity for hypothetical sell stops below vi..."
    },
    {
      "type": "learn",
      "title": "Common vocabulary",
      "body": "Some Smart Money Concepts frameworks divide a chosen range into premium and discount halves, or mark a prior impulse zone as an order block. Mitigation and imbalance rules are methodology-specific. A fair value gap is commonly defined using a three-candle non-overlap, but definitions vary.",
      "keyPoint": "Buy-side liquidity is often used for hypothetical buy stops above visible highs; sell-side liquidity for hypothetical sell stops below vi..."
    },
    {
      "type": "learn",
      "title": "Use as testable hypotheses",
      "body": "State exactly how a level is drawn and what observable event would confirm or invalidate the idea.\n\nA wick beyond equal highs may be called a sweep in some frameworks; it can also be ordinary volatility. Price is not required to reverse or fill an imbalance.\n\nVisible levels are observable; the presumed orders behind them are not.\n\nSMC labels and zone rules are not standardized.\n\nCalling every wick a stop hunt.\n\nAssuming every imbalance must fill or every order block must hold.",
      "keyPoint": "State exactly how a level is drawn and what observable event would confirm or invalidate the idea"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Common vocabulary",
        "Use as testable hypotheses"
      ]
    }
  ],
  "technical-volume-data": [
    {
      "type": "learn",
      "title": "Volume, indicators, and data limitations",
      "body": "Charts display measurements from a provider; missing, aggregated, or venue-specific data can change their meaning.",
      "keyPoint": "Ask what an indicator or volume feed measures before using it as confirmation"
    },
    {
      "type": "learn",
      "title": "Know the feed",
      "body": "Exchange-traded products may report venue volume, while spot FX is decentralized and chart volume is often a provider-specific tick count rather than a consolidated count of all contracts. The same volume display can therefore differ across brokers.",
      "keyPoint": "Exchange-traded products may report venue volume, while spot FX is decentralized and chart volume is often a provider-specific tick count..."
    },
    {
      "type": "learn",
      "title": "Know the feed",
      "body": "Indicators such as moving averages, RSI, and MACD transform historical prices. They may lag, share inputs, or disagree across lookback settings. A second indicator derived from the same candles is not necessarily independent evidence.",
      "keyPoint": "Exchange-traded products may report venue volume, while spot FX is decentralized and chart volume is often a provider-specific tick count..."
    },
    {
      "type": "learn",
      "title": "Use a repeatable method",
      "body": "Record the source, timeframe, and settings, and avoid claims that unavailable volume is visible.\n\nCompare indicator observations with price structure and test fixed rules on data not used to design them.\n\nVolume quality depends on market structure and the provider's feed.\n\nIndicators summarize data; they do not remove uncertainty.\n\nTreating spot-FX tick volume as total global traded volume.\n\nStacking correlated indicators and calling them independent confirmation.",
      "keyPoint": "Record the source, timeframe, and settings, and avoid claims that unavailable volume is visible"
    },
    {
      "type": "practice",
      "body": "On a chart, mark the timeframe, current structure, and nearby invalidation. Write down what evidence would change your read; do not treat one pattern as a forecast."
    },
    {
      "type": "recap",
      "points": [
        "Know the feed",
        "Use a repeatable method"
      ]
    }
  ],
  "risk-leverage-and-ruin": [
    {
      "type": "learn",
      "title": "Leverage, margin, and risk of ruin",
      "body": "Risk controls can reduce exposure but cannot make trading safe or guarantee that an account avoids severe loss.",
      "keyPoint": "See how repeated losses, leverage, and recovery math affect account survival"
    },
    {
      "type": "learn",
      "title": "Leverage magnifies exposure",
      "body": "If an account posts $1,000 of margin for a $20,000 notional position, the notional-to-margin ratio is 20:1. This does not cap possible loss at $1,000. Price movement, gaps, liquidation rules, fees, and legal protections determine outcomes.",
      "keyPoint": "If an account posts $1,000 of margin for a $20,000 notional position, the notional-to-margin ratio is 20:1. This does not cap possible lo..."
    },
    {
      "type": "learn",
      "title": "Leverage magnifies exposure",
      "body": "Risk of ruin describes the chance of reaching a defined unacceptable capital threshold under a particular model. It depends on the distribution and dependence of returns, risk size, costs, and the threshold. No simple calculator can know the true future distribution.",
      "keyPoint": "If an account posts $1,000 of margin for a $20,000 notional position, the notional-to-margin ratio is 20:1. This does not cap possible lo..."
    },
    {
      "type": "learn",
      "title": "Losses change recovery requirements",
      "body": "A sequence of losses can erode capital even when each planned risk seems small; reduce exposure or stop at predetermined limits rather than escalating to recover.\n\nStress-test gaps, correlated positions, and costs beyond the intended stop.\n\nAfter a 20% drawdown, remaining capital is 80%; recovery requires a 25% gain on that reduced capital.\n\nMargin is collateral, not the maximum possible loss.\n\nRisk of ruin is model-dependent; smaller risk does not eliminate loss.\n\nIncreasing leverage because a stop appears close.\n\nAssuming a long losing streak is impossible after several wins.",
      "keyPoint": "A sequence of losses can erode capital even when each planned risk seems small; reduce exposure or stop at predetermined limits rather th..."
    },
    {
      "type": "practice",
      "body": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper."
    },
    {
      "type": "recap",
      "points": [
        "Leverage magnifies exposure",
        "Losses change recovery requirements"
      ]
    }
  ],
  "risk-streaks-and-loss-limits": [
    {
      "type": "learn",
      "title": "Losing streaks, daily limits, and capital protection",
      "body": "A plan for an adverse sequence is more useful when written before emotions or urgency rise.",
      "keyPoint": "Plan how to pause and reduce exposure during adverse periods"
    },
    {
      "type": "learn",
      "title": "Plan limits in advance",
      "body": "A daily or weekly loss limit is a personal risk control, not a promise that losses stop exactly at that number. Gaps, multiple open positions, fees, conversion, or system outages can move realized loss beyond a planned threshold.",
      "keyPoint": "A daily or weekly loss limit is a personal risk control, not a promise that losses stop exactly at that number. Gaps, multiple open posit..."
    },
    {
      "type": "learn",
      "title": "Plan limits in advance",
      "body": "Decide when to stop opening new positions, how existing positions are handled, and when to review the plan. A limit should not be reset during the period merely to continue trading.",
      "keyPoint": "A daily or weekly loss limit is a personal risk control, not a promise that losses stop exactly at that number. Gaps, multiple open posit..."
    },
    {
      "type": "learn",
      "title": "Volatility changes execution",
      "body": "When spreads widen or news creates gaps, a fixed position size may create more risk than expected. Reduce size, stand aside, or use a different pretested rule.\n\nSmaller risk per trade can make a losing sequence more survivable, but cannot prevent losses or guarantee recovery.\n\nSet stop-trading conditions and review rules before a losing streak.\n\nRisk controls can be exceeded by gaps or execution failure.\n\nDoubling size to recover after consecutive losses.\n\nTreating daily limits as exact loss caps in all market conditions.",
      "keyPoint": "When spreads widen or news creates gaps, a fixed position size may create more risk than expected. Reduce size, stand aside, or use a dif..."
    },
    {
      "type": "practice",
      "body": "Work through a hypothetical setup: define invalidation first, measure the distance to it, then derive position size from a fixed risk budget. Keep the exercise on paper."
    },
    {
      "type": "recap",
      "points": [
        "Plan limits in advance",
        "Volatility changes execution"
      ]
    }
  ],
  "fundamental-economic-releases": [
    {
      "type": "learn",
      "title": "Inflation, jobs, growth, and economic releases",
      "body": "Economic reports provide partial, revised measurements of an economy; currency reactions depend on context and expectations.",
      "keyPoint": "Interpret CPI, PPI, employment, GDP, and retail-sales data in context"
    },
    {
      "type": "learn",
      "title": "What common reports measure",
      "body": "CPI estimates changes in a consumer-price basket; PPI tracks prices received by producers under a particular methodology. Neither is a perfect measure of every household or business cost.\n\nEmployment reports measure labor-market conditions through surveys and administrative sources; definitions, revisions, and seasonal adjustments matter.\n\nGDP estimates aggregate economic output over a period and is revised. Retail-sales reports track selected sales measures, not every part of household demand.",
      "keyPoint": "CPI estimates changes in a consumer-price basket; PPI tracks prices received by producers under a particular methodology. Neither is a pe..."
    },
    {
      "type": "learn",
      "title": "Read the release with care",
      "body": "Markets compare an actual release with forecasts, previous readings, revisions, and the detail underneath the headline. A higher inflation number may affect expected policy, but its significance depends on what was anticipated and on other data.",
      "keyPoint": "Markets compare an actual release with forecasts, previous readings, revisions, and the detail underneath the headline. A higher inflatio..."
    },
    {
      "type": "learn",
      "title": "Read the release with care",
      "body": "The values and example definitions in this lesson are educational, not current market figures. Check a current primary source and the time zone before drawing conclusions.\n\nReports are estimates with methodologies and possible revisions.\n\nA headline number alone does not determine a currency's direction.\n\nTreating one data point as a complete picture of an economy.\n\nConfusing month-over-month, year-over-year, seasonally adjusted, and unadjusted values.",
      "keyPoint": "Markets compare an actual release with forecasts, previous readings, revisions, and the detail underneath the headline. A higher inflatio..."
    },
    {
      "type": "practice",
      "body": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price."
    },
    {
      "type": "recap",
      "points": [
        "What common reports measure",
        "Read the release with care"
      ]
    }
  ],
  "fundamental-economic-policy": [
    {
      "type": "learn",
      "title": "Central banks, interest rates, and policy language",
      "body": "Central-bank policy is one influence on currency markets, but its effect depends on relative expectations and other conditions.",
      "keyPoint": "Learn how policy expectations can influence currencies without assuming a fixed reaction"
    },
    {
      "type": "learn",
      "title": "Policy and relative rates",
      "body": "Central banks set or influence policy rates and communicate how they assess inflation, employment, and growth. A hawkish description usually suggests greater concern about inflation or tighter policy; dovish usually signals more emphasis on support or easier conditions. These are shorthand labels, not formal predictions.",
      "keyPoint": "Central banks set or influence policy rates and communicate how they assess inflation, employment, and growth. A hawkish description usua..."
    },
    {
      "type": "learn",
      "title": "Policy and relative rates",
      "body": "A currency pair compares two economies. A rate increase can already be priced in, or traders may focus on guidance, risk sentiment, real yields, or developments in the other country. Therefore the same announcement can lead to different price reactions.",
      "keyPoint": "Central banks set or influence policy rates and communicate how they assess inflation, employment, and growth. A hawkish description usua..."
    },
    {
      "type": "learn",
      "title": "Broader conditions",
      "body": "Growth, recession risk, fiscal decisions, and geopolitical events can change forecasts and risk appetite; outcomes and transmission channels are uncertain.\n\nUse dated, reputable sources and separate confirmed facts from interpretation. FXSnap's Economic Calendar and Daily Brief can help locate event information, but their current data must be checked at the time of use.\n\nRelative expectations matter for a currency pair.\n\nHawkish/dovish are interpretations; news reactions are not mechanical.\n\nAssuming a rate rise always strengthens a currency.\n\nTrading a label without checking what was already expected.",
      "keyPoint": "Growth, recession risk, fiscal decisions, and geopolitical events can change forecasts and risk appetite; outcomes and transmission chann..."
    },
    {
      "type": "practice",
      "body": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price."
    },
    {
      "type": "recap",
      "points": [
        "Policy and relative rates",
        "Broader conditions"
      ]
    }
  ],
  "fundamental-market-expectations": [
    {
      "type": "learn",
      "title": "Actual, forecast, previous, and market expectations",
      "body": "An economic release is interpreted against a shifting baseline of expectations, not in isolation.",
      "keyPoint": "Read economic-calendar fields and understand why surprises can still move unpredictably"
    },
    {
      "type": "learn",
      "title": "Compare like with like",
      "body": "An economic calendar may list a new actual value, a forecast consensus, and a previous reading. Check units, reference period, revision status, and whether the values are comparable. A blank actual value usually means the release has not occurred or is not yet published by that source.",
      "keyPoint": "An economic calendar may list a new actual value, a forecast consensus, and a previous reading. Check units, reference period, revision s..."
    },
    {
      "type": "learn",
      "title": "Compare like with like",
      "body": "A result can beat a forecast yet still be viewed as weak relative to market positioning, prior revisions, subcomponents, or a competing release. Expectations are not directly observable as a single complete market belief.",
      "keyPoint": "An economic calendar may list a new actual value, a forecast consensus, and a previous reading. Check units, reference period, revision s..."
    },
    {
      "type": "learn",
      "title": "Event risk is two-sided",
      "body": "Prices may move before release; spreads can widen and liquidity can change around the event.\n\nUse the Economic Calendar to check scheduled times and the Daily Brief for context, then verify the original release. Do not treat an educational example as current data.\n\nActual, forecast, and previous fields require comparable units and periods.\n\nA surprise does not dictate a simple trade direction.\n\nReading a revised previous number as the original one.\n\nAssuming a positive surprise must strengthen the related currency.",
      "keyPoint": "Prices may move before release; spreads can widen and liquidity can change around the event"
    },
    {
      "type": "practice",
      "body": "Choose a scheduled release from a reliable calendar. Note its release time, consensus, prior value, and why expectations may already be reflected in price."
    },
    {
      "type": "recap",
      "points": [
        "Compare like with like",
        "Event risk is two-sided"
      ]
    }
  ],
  "psychology-biases-and-fomo": [
    {
      "type": "learn",
      "title": "FOMO, confirmation bias, and overconfidence",
      "body": "Behavioral biases can influence decisions, but noticing them is a practice—not a guarantee of better outcomes.",
      "keyPoint": "Notice common thinking traps and use a pause to return to written rules"
    },
    {
      "type": "learn",
      "title": "Recognize the pattern",
      "body": "FOMO can make a trader chase a move after the planned entry has passed; impatience can turn waiting into an unplanned position.\n\nConfirmation bias favors evidence that supports an existing view and discounts contradictory evidence. Write down what would prove the idea wrong before entry.\n\nOverconfidence may follow a winning streak; loss aversion may encourage holding a loser or closing a winner too early. Both can conflict with a tested plan.",
      "keyPoint": "FOMO can make a trader chase a move after the planned entry has passed; impatience can turn waiting into an unplanned position"
    },
    {
      "type": "learn",
      "title": "A practical pause",
      "body": "Before acting, name the setup rule, maximum risk, invalidation point, and one alternative explanation. If those are unclear, a no-trade decision is valid. Psychology tools do not make a strategy profitable by themselves.\n\nRecord disconfirming evidence as well as supporting evidence.\n\nA missed trade does not create an obligation to chase it.\n\nChanging rules to explain away contradictory evidence.\n\nTreating a short winning streak as proof of skill.",
      "keyPoint": "Before acting, name the setup rule, maximum risk, invalidation point, and one alternative explanation. If those are unclear, a no-trade d..."
    },
    {
      "type": "practice",
      "body": "After a trading decision, journal the plan you followed, the emotion you noticed, and one process change. Review the decision process separately from the outcome."
    },
    {
      "type": "recap",
      "points": [
        "Recognize the pattern",
        "A practical pause"
      ]
    }
  ],
  "psychology-revenge-and-overtrading": [
    {
      "type": "learn",
      "title": "Revenge trading, overtrading, and discipline",
      "body": "A pause after an emotional trigger can protect a decision process, even though it cannot control market outcomes.",
      "keyPoint": "Build practical guardrails for impulsive entries and trading after losses"
    },
    {
      "type": "learn",
      "title": "Interrupt the cycle",
      "body": "Revenge trading is an attempt to quickly recover a loss, often through a larger size or a lower-quality entry. Overtrading can arise from boredom, urgency, or treating activity as progress. The extra trade may have no tested edge and can compound costs.",
      "keyPoint": "Revenge trading is an attempt to quickly recover a loss, often through a larger size or a lower-quality entry. Overtrading can arise from..."
    },
    {
      "type": "learn",
      "title": "Interrupt the cycle",
      "body": "Loss aversion can make accepting a small planned loss feel worse than allowing it to grow. Moving a stop farther away changes the risk plan; it does not remove the underlying exposure.",
      "keyPoint": "Revenge trading is an attempt to quickly recover a loss, often through a larger size or a lower-quality entry. Overtrading can arise from..."
    },
    {
      "type": "learn",
      "title": "Set a routine before the session",
      "body": "Use written limits for trades, risk, and a cooling-off period after a rule violation or loss threshold.\n\nRecord the trigger and the action you took. Ask for qualified support if trading is causing distress or interfering with finances or wellbeing.\n\nA pause and a no-trade choice are part of a disciplined process.\n\nDo not increase risk to recover a previous loss.\n\nBelieving that more trades necessarily mean more learning.\n\nRemoving a loss limit while upset or under time pressure.",
      "keyPoint": "Use written limits for trades, risk, and a cooling-off period after a rule violation or loss threshold"
    },
    {
      "type": "practice",
      "body": "After a trading decision, journal the plan you followed, the emotion you noticed, and one process change. Review the decision process separately from the outcome."
    },
    {
      "type": "recap",
      "points": [
        "Interrupt the cycle",
        "Set a routine before the session"
      ]
    }
  ],
  "strategies-entry-exit-and-review": [
    {
      "type": "learn",
      "title": "Entry, exit, management, and performance review",
      "body": "A strategy needs rules for when to act, when the idea fails, how much to risk, and how to review it.",
      "keyPoint": "Specify a complete trading process and evaluate decisions separately from outcomes"
    },
    {
      "type": "learn",
      "title": "Write the complete rule set",
      "body": "Define eligible instrument, timeframe, market condition, entry trigger, and any required confirmation.\n\nDefine the stop or invalidation condition, exit or target logic, position sizing, and what happens if the market gaps.\n\nSpecify exclusions such as a missing price reference, spread threshold, or scheduled event. Include a no-trade outcome.",
      "keyPoint": "Define eligible instrument, timeframe, market condition, entry trigger, and any required confirmation"
    },
    {
      "type": "learn",
      "title": "Review process and outcome separately",
      "body": "A trade that followed the plan can lose; an impulsive trade can win by chance. Record both process adherence and outcome, costs, and uncertainty. Evaluate groups of trades using a defined sample and do not change rules after every result.\n\nPredefine entry, exit, invalidation, risk, and exclusions.\n\nOne result cannot establish whether a process has an edge.\n\nReviewing only winning examples.\n\nCalling an unplanned lucky outcome a good process.",
      "keyPoint": "A trade that followed the plan can lose; an impulsive trade can win by chance. Record both process adherence and outcome, costs, and unce..."
    },
    {
      "type": "practice",
      "body": "Write a testable checklist for this idea: market, timeframe, entry, exit, invalidation, and cost assumptions. Apply the same rules to historical examples before drawing conclusions."
    },
    {
      "type": "recap",
      "points": [
        "Write the complete rule set",
        "Review process and outcome separately"
      ]
    }
  ]
};
