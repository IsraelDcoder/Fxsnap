# Analysis Accuracy Audit and Evaluation Plan

## Audit findings

- Uploaded-chart analysis is a vision-model interpretation. The model reports trend, structure, zones, patterns, indicators, and proposed trade levels from pixels; exact market prices and broker tick size are not independently recoverable when the chart scale is unreadable.
- The single-chart flow does not have higher-timeframe data unless those charts are supplied. The separate H4/M15 flow checks alignment and suppresses contradictory or unsupported setups.
- The deterministic candle path compares closing-price movement over a 24-bar minimum, recent/prior 12-bar highs and lows, and average true range as a percent of price. These are measurable observations, not a complete swing-structure, false-breakout, or reversal classifier.
- The old candle path fabricated entry/stop/target levels, fixed five-decimal formatting, and a hard-coded 1.8 R:R. It now abstains instead of presenting those unsupported levels as a trade.
- AI trade levels are parsed and checked independently. BUY/SELL zones must be fully ordered, prices must be positive and finite, R:R is recomputed conservatively from range bounds, and a reported ratio must agree with the computed value. Tick alignment is supported by the validator when a tick size is supplied, but reliable broker tick-size metadata is not currently wired into the chart-analysis request.
- The vision prompt follows a fixed evidence-first sequence, requires explanations for entry/invalidation/one TP1, prohibits unsupported probability language, and directs the model to abstain when scale or context is inadequate. Any model-proposed TP2 is omitted from the final result.
- Confidence is a weighted evidence score. It is not calibrated against historical trade outcomes. The result UI labels it as an evidence score, not a probability of profit.
- Model-level NO TRADE, invalid image, unavailable model, and invalid model response remain distinct states. The local candle analyzer returns NO TRADE where it cannot justify chart-supported levels.

## Changes in this release

- Enforced fully ordered entry/stop/TP1 zones and conservative range-based R:R calculations; only TP1 is returned.
- Rejected non-positive levels, invalid tick sizes, off-tick prices when configured, and model-reported R:R mismatches.
- Rejected setups below the 1.5 minimum R:R rather than preserving their levels as a conditional trade.
- Validated OHLC consistency, positive prices, and unique timestamps; required at least 24 candles for the deterministic comparison.
- Removed the deterministic path's fabricated trade prices and hard-coded R:R.
- Fixed the backtest's in-sample boundary so a trade cannot use post-split candles to determine its in-sample result.
- Added server-side tests to the regular `npm test` command.

## Test results and measured baseline

The latest `npm test` run passed 47 TypeScript tests and 42 server tests. This measures parsing, contract integrity, conservative geometry, RR arithmetic, split-boundary handling, and regression behavior; it does not measure predictive trading accuracy. Synthetic cross-asset candles are regression fixtures, not historical performance evidence.

The workspace contains no historical OHLC research dataset or labeled chart corpus. Its local market service can generate simulated candles, and its Twelve Data adapter can request candles when configured, but neither is an archived, cost-adjusted, chronological evaluation dataset. Therefore there is no defensible baseline win rate, expectancy, or net return to report, and no improved-accuracy claim is made.

## Proposed evaluation architecture

1. Freeze a versioned, timestamped OHLC dataset for each supported instrument and timeframe, including provider, timezone, price precision, and data-quality metadata.
2. Define chart labels and objective acceptance criteria before running models: instrument/timeframe identification, visible-level error tolerance in ticks, trend/structure agreement, setup validity, and explicit uncertainty labels. Retain original chart images where licensing and privacy allow.
3. Split data chronologically into development, validation, and untouched out-of-sample periods. Any model, prompt, threshold, or feature selection uses development data only; purge trades whose outcome horizon crosses a split.
4. Run the exact versioned production analysis pipeline forward-only. Record raw model response, normalized response, deterministic validation results, data source, model/prompt version, latency, and technical failure state.
5. Simulate execution with instrument/timeframe-specific spread, commissions, slippage, financing where applicable, conservative same-bar stop-first handling, and tick/contract conventions. Report sample counts, abstention rate, invalid-output rate, win rate with uncertainty bounds, expectancy, drawdown, and net performance by instrument and timeframe.
6. Compare every candidate change against the frozen baseline and publish the dataset hashes, protocol, code version, and per-stratum results. Do not promote a change based on aggregate results that conceal an instrument-specific regression.

## Limitations and required infrastructure

- Historical tests cannot currently be run: there is no retained historical dataset or labeled chart benchmark in the workspace.
- Twelve Data access requires a configured API key and sufficient historical-data entitlements/credits. The applicable plan and cost are account-specific and cannot be inferred from this repository. Data licensing and image retention terms must be checked before building a corpus.
- Provider OHLC does not by itself supply broker-specific spreads, commissions, slippage, or tick sizes for every supported CFD/crypto instrument. Those must come from the intended execution venue or be explicitly modeled as conservative assumptions.
- The image model can still misread pixels. It must abstain when scale, candles, symbol, or timeframe cannot be verified; deterministic range checks cannot prove that a visually proposed level is supported by the chart.
- No win rate can be guaranteed. Any future probability claim requires calibration on unseen outcomes and monitoring for regime drift.

## Prioritized next steps

1. Add an audited tick-size/precision/cost registry per instrument and execution venue; reject unknown precision rather than guessing.
2. Build and version the multi-instrument, multi-timeframe historical corpus and chart-label protocol.
3. Connect a forward-only analysis runner to the frozen corpus, include realistic costs, and publish a baseline report before tuning.
4. Add measured swing-point, volatility-normalized zone, and breakout/retest features only when they improve out-of-sample metrics without materially degrading abstention or invalid-output rates.
5. Calibrate evidence scores only after sufficient historical outcomes; until then keep them explicitly non-probabilistic.