const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePriceOrRange: parseRRPriceOrRange } = require('./rr');
const {
  buildStructuredObservations,
  evaluateDecisionEngine,
  applyMentorStrategy,
  enforceValidationRules,
  getTraderSystemPrompt,
  buildMultiTimeframeMessages,
  MultiTimeframeInputSchema,
  enforceMultiTimeframeAlignment,
  canonicalizeRawAnalysis,
  normalizeAnalysis,
  TradeAnalysisSchema,
} = require('./serve');

test('multi-timeframe request requires two bounded supported chart images', () => {
  const chart = { imageBase64: 'x'.repeat(100), mimeType: 'image/jpeg' };
  const valid = MultiTimeframeInputSchema.safeParse({ pair: 'XAUUSD', premiumAccess: true, charts: { h4: chart, m15: chart } });
  const missingChart = MultiTimeframeInputSchema.safeParse({ pair: 'XAUUSD', charts: { h4: chart } });
  const unsupportedImage = MultiTimeframeInputSchema.safeParse({ pair: 'XAUUSD', charts: { h4: chart, m15: { ...chart, mimeType: 'image/gif' } } });

  assert.equal(valid.success, true);
  assert.equal(missingChart.success, false);
  assert.equal(unsupportedImage.success, false);
});

test('both labeled charts are sent together in one multimodal AI message', () => {
  const image = 'eA==';
  const messages = buildMultiTimeframeMessages('XAUUSD', {
    h4: { imageBase64: image, mimeType: 'image/jpeg' },
    m15: { imageBase64: image, mimeType: 'image/png' },
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[1].content.filter((part) => part.type === 'image_url').length, 2);
  assert.match(messages[1].content[0].text, /4H higher-timeframe/);
  assert.match(messages[1].content[2].text, /15M entry-timeframe/);
  assert.match(messages[0].content, /analyze the two labeled images together/i);
  assert.match(messages[0].content, /do not treat them as separate requests or invent an intermediate timeframe/i);
});

test('multi-timeframe fields survive canonicalization for the unified result', () => {
  const raw = {
    status: 'no_trade',
    multiTimeframe: {
      alignment: 'aligned',
      summary: 'The 15M pullback is holding in 4H demand.',
      h4: { trend: 'bullish', structure: 'Higher highs and higher lows.' },
      m15: { trend: 'bullish', structure: 'Pullback into support.', confirmation: 'Bullish engulfing.' },
    },
    timeframes_detected: [
      { timeframe: 'H4', observations: { trend: 'bullish' } },
      { timeframe: 'M15', observations: { trend: 'bullish' } },
    ],
    m15: { confirmation: 'Bullish engulfing.', bos: { detected: true }, rsi: { visible: false }, liquidity: { swept: false } },
  };
  const canonical = canonicalizeRawAnalysis(raw);
  const normalized = normalizeAnalysis(canonical);

  assert.equal(normalized.multiTimeframe.h4.trend, 'bullish');
  assert.equal(normalized.multiTimeframe.m15.confirmation, 'Bullish engulfing.');
  assert.deepEqual(normalized.timeframes_detected.map((item) => item.timeframe), ['H4', 'M15']);
});

test('conflicting H4 and M15 direction always suppresses the trade setup', () => {
  const result = enforceMultiTimeframeAlignment({
    status: 'success',
    trade_setup: { type: 'buy', entry_zone: '2350', stop_loss: '2340', take_profit: '2380', risk_reward: 3 },
    marketBias: 'bullish',
    tradeDecision: 'BUY',
    multiTimeframe: {
      alignment: 'aligned',
      h4: { chartValid: true, trend: 'bearish', structure: 'Lower highs and lower lows.' },
      m15: { chartValid: true, trend: 'bullish', structure: 'Pullback setup.', confirmation: 'Bullish engulfing.' },
    },
    reasons: [],
  });

  assert.equal(result.multiTimeframe.alignment, 'conflicting');
  assert.equal(result.status, 'no_trade');
  assert.equal(result.trade_setup.type, 'none');
  assert.equal(result.marketBias, 'mixed');
  assert.equal(result.tradeDecision, 'NONE');
});

test('aligned labels cannot produce a trade without explicit evidence on both charts', () => {
  const result = enforceMultiTimeframeAlignment({
    status: 'success',
    trade_setup: { type: 'buy', entry_zone: '2350', stop_loss: '2340', take_profit: '2380', risk_reward: 3 },
    marketBias: 'bullish',
    tradeDecision: 'BUY',
    multiTimeframe: {
      alignment: 'aligned',
      h4: { chartValid: true, trend: 'bullish', structure: '' },
      m15: { chartValid: true, trend: 'bullish', structure: '', confirmation: '' },
    },
    reasons: [],
  });

  assert.equal(result.multiTimeframe.alignment, 'unclear');
  assert.equal(result.status, 'no_trade');
  assert.equal(result.trade_setup.type, 'none');
  assert.match(result.reasons.join(' '), /explicit evidence/i);
});

test('recognizable low-quality charts are analyzed conservatively instead of rejected as non-charts', () => {
  const result = applyMentorStrategy({
    status: 'no_trade',
    chart: { is_chart: true, chart_quality: 'poor', candles_visible: false },
    analysis: { trend: 'neutral', market_structure: '', structure: '' },
    zones: {},
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 0,
    reasons: [],
  });

  assert.equal(result.status, 'no_trade');
});

test('vision instructions reserve invalid_image for clearly non-chart or unrecognizable images', () => {
  const prompt = getTraderSystemPrompt();
  assert.match(prompt, /invalid_image" only when the image is clearly not a trading chart/i);
  assert.match(prompt, /chart is recognizable.*no_trade/i);
  assert.match(prompt, /forex, cryptocurrency, metals, indices, and commodities/i);
  assert.match(prompt, /do not assume forex pip conventions/i);
  assert.match(prompt, /one take-profit target/i);
  assert.match(prompt, /do not provide TP2/i);
  assert.match(prompt, /no win probability has been established/i);
  assert.match(prompt, /do not call a move a breakout unless a candle close is visibly beyond a prior level/i);
  assert.match(prompt, /NO TRADE means no validated entry, not necessarily no directional bias/i);
  assert.match(prompt, /Context: instrument, timeframe, chart quality/i);
  assert.match(prompt, /Structure: visible swing sequence and directional bias/i);
  assert.match(prompt, /Decision: BUY, SELL, or NO TRADE/i);
});

test('comma-formatted crypto prices and ranges parse as full price values', () => {
  assert.deepEqual(parseRRPriceOrRange('67,500'), { type: 'price', value: 67500 });
  assert.deepEqual(parseRRPriceOrRange('67,500 - 68,000'), {
    type: 'range',
    low: 67500,
    high: 68000,
    midpoint: 67750,
  });

  const result = evaluateDecisionEngine({
    raw: {
      chart: { is_chart: true },
      analysis: {
        trend: 'bullish',
        market_structure: 'higher highs and higher lows',
        structure: 'uptrend',
      },
      zones: { support: '67,400' },
      m15: {
        confirmation: 'Bullish engulfing at support.',
        bos: { detected: true },
        liquidity: { swept: true },
      },
      trade_setup: {
        type: 'buy',
        entry_zone: '67,500',
        stop_loss: '66,800',
        take_profit: '69,600',
      },
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(result.trade_setup.risk_reward, 3);
  assert.equal(result.trade_setup.entry_zone, '67,500');
});

test('canonical JSON parsing accepts object, string, and fenced JSON payloads', () => {
  const { canonicalizeRawAnalysis } = require('./serve');
  const objectPayload = { status: 'success', analysis: { trend: 'bullish' }, zones: { support: '1.1000' }, strategy: { daily_trend: 'bullish' }, trade_setup: { type: 'buy', risk_reward: 2.0 } };
  const jsonStringPayload = '{"status":"success","analysis":{"trend":"bearish"},"zones":{"support":"1.1000"},"strategy":{"daily_trend":"bearish"},"trade_setup":{"type":"sell","risk_reward":1.8}}';
  const fencedPayload = '```json\n{"status":"success","analysis":{"trend":"bullish"},"zones":{"support":"1.1000"},"strategy":{"daily_trend":"bullish"},"trade_setup":{"type":"buy","risk_reward":2.2}}\n```';

  const a = canonicalizeRawAnalysis(objectPayload);
  const b = canonicalizeRawAnalysis(jsonStringPayload);
  const c = canonicalizeRawAnalysis(fencedPayload);

  assert.equal(a.status, 'success');
  assert.equal(b.analysis.trend, 'bearish');
  assert.equal(c.trade_setup.type, 'buy');
  assert.equal(c.trade_setup.risk_reward, 2.2);
});

test('incomplete model success is returned as an explainable no-trade analysis', () => {
  const canonical = canonicalizeRawAnalysis({
    status: 'success',
    chart: { is_chart: true, chart_quality: 'good', price_scale_visible: true, candles_visible: true, has_enough_candles: true },
    analysis: {
      trend: 'bearish',
      structure: 'Lower highs and lower lows',
      notes: 'A clear bearish bias is visible, but setup prices were omitted.',
    },
    zones: { support: 1.3200, resistance: 1.3280, liquidity: 'not_clear' },
    trade_setup: { type: 'sell' },
    confidence: 70,
  });
  const parsed = TradeAnalysisSchema.safeParse(canonical);
  const result = parsed.success
    ? applyMentorStrategy(normalizeAnalysis(parsed.data))
    : null;

  assert.equal(canonical.status, 'success');
  assert.equal(parsed.success, true);
  assert.equal(result.status, 'no_trade');
  assert.equal(result.trade_setup.type, 'none');
  assert.match(result.analysis.notes, /setup prices were omitted/i);
});

test('valid numeric levels with omitted RR are normalized and score through the full analysis pipeline', () => {
  const canonical = canonicalizeRawAnalysis({
    status: 'success',
    chart: { is_chart: true, chart_quality: 'good', price_scale_visible: true, candles_visible: true, has_enough_candles: true },
    analysis: {
      trend: 'bullish',
      structure: 'Higher highs and higher lows',
      market_structure: 'An uptrend with a pullback to support.',
      notes: 'Price is holding above the visible support zone.',
    },
    zones: { support: 1.0950, resistance: 1.1200, liquidity: 'not_clear' },
    m15: { confirmation: 'Bullish rejection at support.', bos: { detected: true } },
    trade_setup: {
      type: 'BUY',
      entry_zone: 1.1000,
      stop_loss: 1.0900,
      take_profit: 1.1200,
    },
    confidence: 80,
  });
  const parsed = TradeAnalysisSchema.safeParse(canonical);
  assert.equal(parsed.success, true);

  const normalized = normalizeAnalysis(parsed.data);
  const result = applyMentorStrategy(normalized);
  assert.equal(result.status, 'success');
  assert.equal(result.trade_setup.type, 'buy');
  assert.equal(result.trade_setup.entry_zone, '1.1');
  assert.equal(result.trade_setup.stop_loss, '1.09');
  assert.equal(result.trade_setup.take_profit, '1.12');
  assert.equal(result.trade_setup.risk_reward, 2);
  assert.ok(result.confidence > 0);
  assert.ok(result.breakdown.trend > 0);
});

test('common model level aliases are normalized instead of dropped', () => {
  const canonical = canonicalizeRawAnalysis({
    status: 'success',
    chart: { is_chart: true, chart_quality: 'good', price_scale_visible: true, candles_visible: true, has_enough_candles: true },
    analysis: {
      trend: 'bullish',
      structure: 'Higher highs and higher lows',
      market_structure: 'An uptrend with a pullback to support.',
    },
    zones: { support: '1.0950', resistance: '1.1200' },
    direction: 'BUY',
    trade_setup: {
      entry: 1.1,
      sl: 1.09,
      tp: 1.12,
      rr: 9,
    },
  });
  const parsed = TradeAnalysisSchema.safeParse(canonical);
  assert.equal(parsed.success, true);

  const result = applyMentorStrategy(normalizeAnalysis(parsed.data));
  assert.equal(result.status, 'success');
  assert.equal(result.trade_setup.type, 'buy');
  assert.equal(result.trade_setup.entry_zone, '1.1');
  assert.equal(result.trade_setup.stop_loss, '1.09');
  assert.equal(result.trade_setup.take_profit, '1.12');
  assert.equal(result.trade_setup.risk_reward, 2);
});

test('overlong model prose is bounded before schema validation', () => {
  const canonical = canonicalizeRawAnalysis({
    status: 'no_trade',
    analysis: {
      trend: 'neutral',
      structure: 'S'.repeat(800),
      notes: 'N'.repeat(800),
      indicators: 'I'.repeat(500),
    },
    zones: { support: 'not_clear', resistance: 'not_clear', liquidity: 'not_clear' },
    trade_setup: { type: 'none' },
    reasoning: ['R'.repeat(500)],
  });
  const parsed = TradeAnalysisSchema.safeParse(canonical);

  assert.equal(parsed.success, true);
  assert.equal(canonical.analysis.structure.length, 300);
  assert.equal(canonical.analysis.notes.length, 400);
  assert.equal(canonical.reasoning[0].length, 300);
});

test('structured reasoning, support/resistance, and targets survive normalization', () => {
  const canonical = canonicalizeRawAnalysis({
    status: 'success',
    analysis: {
      trend: 'bullish',
      reasoning: ['Higher highs are visible.', 'Price is holding above support.'],
    },
    zones: { support: '1.1000', resistance: '1.1200' },
    support_resistance: {
      support: ['1.1000', '1.0950'],
      resistance: ['1.1200'],
    },
    trade_setup: {
      type: 'buy',
      entry_zone: '1.1050',
      stop_loss: '1.1000',
      take_profit: '1.1150',
      take_profit_levels: ['1.1150', '1.1200'],
      risk_reward: 2,
    },
  });
  const normalized = normalizeAnalysis(canonical);

  assert.deepEqual(normalized.reasoning, ['Higher highs are visible.', 'Price is holding above support.']);
  assert.deepEqual(normalized.support_resistance, {
    support: ['1.1000', '1.0950'],
    resistance: ['1.1200'],
  });
  assert.deepEqual(normalized.trade_setup.take_profit_levels, ['1.1150', '1.1200']);
});

test('incomplete successful payloads reach the decision engine and cannot produce a trade', () => {
  const result = TradeAnalysisSchema.safeParse({
    status: 'success',
    chart: {
      is_chart: true,
      pair: 'BTCUSD',
      timeframe: '4H',
      chart_quality: 'good',
      price_scale_visible: true,
      candles_visible: true,
      has_enough_candles: true,
    },
    analysis: {
      trend: 'bullish',
      market_structure: 'higher highs and higher lows',
      structure_bias: 'bullish',
      volatility: 'moderate',
      volume: 'not_visible',
      indicators_detected: [],
      price_action: ['breakout'],
      structure: 'Bullish continuation.',
      sentiment: 'bullish',
      indicators: 'none',
      notes: 'Trend is intact.',
      reasoning: ['Higher highs are visible.'],
    },
    zones: {
      support: '1.1000',
      resistance: '1.1200',
      demand: ['1.1000'],
      supply: ['1.1200'],
      liquidity: ['1.1100'],
    },
    strategy: {
      daily_trend: 'bullish',
      higher_timeframe_confirmation: 'confirmed',
      zone_status: 'inside_zone',
      liquidity_sweep: 'bullish',
      bos: 'bullish',
      rsi_confirmation: 'bullish',
    },
    trade_setup: {
      type: 'buy',
      entry_zone: '',
      stop_loss: '',
      take_profit: '',
      take_profit_levels: [],
      risk_reward: 1.8,
    },
    confidence: 72,
    reasons: ['Trend is intact.'],
    reasoning: ['Higher highs are visible.'],
  });

  assert.equal(result.success, true);
  const evaluated = applyMentorStrategy(normalizeAnalysis(result.data));
  assert.equal(evaluated.status, 'no_trade');
  assert.equal(evaluated.trade_setup.type, 'none');
});

test('invalid image yields invalid_image status and no trade', () => {
  const normalized = {
    status: 'no_trade',
    chart: { is_chart: false },
    analysis: {},
    zones: {},
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 0,
    reasons: [],
  };
  const res = applyMentorStrategy(normalized);
  assert.equal(res.status, 'invalid_image');
  assert.equal(res.trade_setup.type, 'none');
});

test('missing D1 or zones -> no_trade', () => {
  const normalized = {
    status: 'success',
    chart: { is_chart: true, timeframe: 'H1' },
    analysis: { market_structure: 'some consolidation' },
    zones: {},
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 90,
    reasons: [],
  };
  const res = applyMentorStrategy(normalized);
  assert.equal(res.status, 'no_trade');
  assert.ok(res.reasons && res.reasons.length > 0);
});

test('valid evidence with m15 confirmation and numeric levels -> success', () => {
  const normalized = {
    status: 'success',
    detectedPair: 'EURUSD',
    timeframe: 'D1',
    chart: { is_chart: true, timeframe: 'D1', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'higher highs higher lows', trend: 'bullish' },
    zones: { h1: '1.0950', h4: '1.0900' },
    m15: { inside_zone: true, liquidity: { swept: true }, confirmation: 'engulfing', bos: { detected: true }, rsi: { visible: true, confirms: true } },
    strategy: {},
    trade_setup: {
      type: 'buy',
      entry_zone: '1.1000',
      stop_loss: '1.0900',
      take_profit: '1.1200',
      take_profit_levels: ['1.1200', '1.1300'],
      risk_reward: 2.0,
    },
    confidence: 80,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.equal(res.status, 'success');
  assert.equal(res.trade_setup.type, 'buy');
  assert.deepEqual(res.trade_setup.take_profit_levels, ['1.1200']);
  assert.ok(res.confidence >= 70);
});

test('AI-proposed TP2 is omitted from the validated single-target result', () => {
  const result = applyMentorStrategy({
    status: 'success',
    chart: { is_chart: true, timeframe: 'H1', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { trend: 'bullish', market_structure: 'higher highs and higher lows' },
    zones: { support: '1.0900' },
    m15: { confirmation: 'bullish close above support', bos: { detected: true } },
    strategy: {},
    trade_setup: {
      type: 'buy', entry_zone: '1.1000', stop_loss: '1.0900', take_profit: '1.1200',
      take_profit_levels: ['1.1200', '1.1190-1.1210'], risk_reward: 2,
    },
    confidence: 80,
    reasons: [],
  });

  assert.equal(result.status, 'success');
  assert.deepEqual(result.trade_setup.take_profit_levels, ['1.1200']);
});

test('NO TRADE always includes an explanation when the model supplies none', () => {
  const result = applyMentorStrategy({
    status: 'no_trade',
    chart: { is_chart: true },
    analysis: {},
    zones: {},
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 0,
    reasons: [],
  });

  assert.ok(result.reasons.some((reason) => /directional structure is not clearly visible/i.test(reason)));
});

test('computed RR overrides a mismatched model report without dropping validated levels', () => {
  const normalized = {
    status: 'success',
    chart: { is_chart: true, timeframe: 'H1', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { trend: 'bullish', market_structure: 'higher highs and higher lows' },
    zones: { support: '1.0900' },
    m15: { confirmation: 'bullish close above support', bos: { detected: true } },
    strategy: {},
    trade_setup: { type: 'buy', entry_zone: '1.1000', stop_loss: '1.0900', take_profit: '1.1200', risk_reward: 9 },
    confidence: 80,
    reasons: [],
  };

  const result = applyMentorStrategy(normalized);

  assert.equal(result.status, 'success');
  assert.equal(result.trade_setup.type, 'buy');
  assert.equal(result.trade_setup.entry_zone, '1.1000');
  assert.equal(result.trade_setup.stop_loss, '1.0900');
  assert.equal(result.trade_setup.take_profit, '1.1200');
  assert.equal(result.trade_setup.risk_reward, 2);
  assert.ok(result.rrIssues.some((issue) => /differs/i.test(issue)));
});

test('insufficient RR should block trade', () => {
  const normalized = {
    status: 'success',
    timeframe: 'D1',
    chart: { is_chart: true, timeframe: 'D1', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'higher highs higher lows', trend: 'bullish' },
    zones: { h1: '1.0950' },
    m15: { inside_zone: true, liquidity: { swept: true }, confirmation: 'pin bar', bos: { detected: true }, rsi: { visible: true, confirms: true } },
    strategy: {},
    trade_setup: { type: 'buy', entry_zone: '1.1000', stop_loss: '1.0955', take_profit: '1.1020', risk_reward: 0.25 },
    confidence: 90,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  // With strict RR enforcement the final status should be no_trade, but a fallback candidate may be preserved for DEVELOPING workflows
  assert.equal(res.status, 'no_trade');
  assert.equal(res.marketBias, 'bullish');
  assert.equal(res.trade_setup.type, 'buy');
  assert.equal(res.trade_setup.entry_zone, '1.1000');
  assert.equal(res.trade_setup.stop_loss, '1.0955');
  assert.equal(res.trade_setup.take_profit, '1.1020');
  assert.ok(res.trade_setup.risk_reward < 1.5);
  assert.ok(res.reasons.some((r) => /risk.reward|risk\/reward/i.test(r)) || res.rrIssues.length > 0);
});

// Small sanity test for the observation builder
test('buildStructuredObservations returns expected shape for explicit timeframes_detected', () => {
  const norm = {
    timeframes_detected: [
      { timeframe: 'D1', observations: { trend: 'bullish' } },
      { timeframe: 'M15', observations: { confirmation: 'engulfing' } },
    ],
    chart: { is_chart: true },
  };
  const obs = buildStructuredObservations(norm);
  assert.equal(obs.chart_layout, 'multi_timeframe');
  assert.equal(obs.timeframes_detected.length, 2);
  assert.equal(obs.timeframes_detected[0].timeframe, 'D1');
});

test('applyMentorStrategy attaches explainable metrics and decision fields', () => {
  const normalized = {
    status: 'no_trade',
    detectedPair: 'XAUUSD',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'higher highs', trend: 'bullish' },
    zones: { demand: ['4320-4325'], supply: ['4373-4380'] },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: null, bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 10,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.ok(typeof res.setupConfidence === 'number');
  assert.ok(['BUY', 'SELL', 'WAIT', 'NO_TRADE'].includes(res.decision));
  assert.ok(Array.isArray(res.whyNotNow));
  assert.ok(Array.isArray(res.dataLimitations));
});

test('fallback candidate created from range strings when full validations missing', () => {
  const normalized = {
    status: 'no_trade',
    detectedPair: 'USDJPY',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: { market_structure: 'sharp bearish impulse breaking support', trend: 'bearish', volatility: 'high', sentiment: 'bearish' },
    zones: { support: '148.20-148.30', resistance: '149.00-149.20' },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: null, bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: {},
    trade_setup: { type: 'sell', entry_zone: '148.95-149.05', stop_loss: '149.30', take_profit: '148.20-148.30', risk_reward: '1.8' },
    confidence: 40,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  // Candidate should be preserved even if status is no_trade
  assert.equal(res.trade_setup.type, 'sell');
  assert.ok(res.trade_setup.entry_zone && res.trade_setup.entry_zone !== 'none');
  assert.ok(typeof res.setupQuality === 'number');
  // The decision should be WAIT or NO_TRADE depending on score; ensure not silently empty
  assert.ok(['BUY', 'SELL', 'WAIT', 'NO_TRADE'].includes(res.decision));
});

test('reported RR cannot hide conservative SELL geometry or its computed ratio', () => {
  const normalized = {
    status: 'success',
    detectedPair: 'XAUUSD',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: {
      trend: 'bearish',
      market_structure: 'lower highs and lower lows with bearish continuation',
      structure: 'lower highs lower lows',
      volatility: 'high',
      sentiment: 'bearish',
      volume: 'not_visible',
      indicators: 'none',
      notes: 'Strong bearish continuation on the current chart.'
    },
    zones: { support: '2348-2352', resistance: '2368-2375' },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: 'bearish continuation', bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: { zone_status: 'near_zone', liquidity_sweep: 'unavailable', bos: 'unavailable', rsi_confirmation: 'unavailable' },
    trade_setup: {
      type: 'sell',
      entry_zone: '2358-2362',
      stop_loss: '2368',
      take_profit: '2342-2348',
      risk_reward: '1.8',
    },
    confidence: 64,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.equal(res.marketBias, 'bearish');
  assert.ok(res.marketConfidence > 0);
  assert.equal(res.trade_setup.type, 'sell');
  assert.equal(res.trade_setup.entry_zone, '2358-2362');
  assert.equal(res.trade_setup.stop_loss, '2368');
  assert.equal(res.trade_setup.take_profit, '2342-2348');
  assert.equal(res.trade_setup.risk_reward, 1);
  assert.notEqual(res.decision, 'SELL');
  assert.ok(res.rrIssues.some((issue) => /differs/i.test(issue)));
  assert.ok(res.whyNotNow.some((reason) => /minimum 1.5/i.test(reason)));
  assert.ok(typeof res.breakdown?.trend === 'number' && res.breakdown.trend > 0);
  assert.ok(res.breakdown?.liquidity === null || res.breakdown?.liquidity === undefined);
  assert.ok(res.breakdown?.rsi === null || res.breakdown?.rsi === undefined);
  assert.ok(Array.isArray(res.dataLimitations));
  assert.ok(res.dataLimitations.some((item) => /rsi|volume|liquidity|timeframe/i.test(String(item))));
});

test('neutral market remains no_setup while preserving explainable reasons', () => {
  const normalized = {
    status: 'success',
    detectedPair: 'EURUSD',
    timeframe: 'M15',
    chart: { is_chart: true, timeframe: 'M15', candles_visible: true, price_scale_visible: true, has_enough_candles: true },
    analysis: {
      trend: 'neutral',
      market_structure: 'range bound with no clear breakout',
      structure: 'sideways price action',
      volatility: 'moderate',
      sentiment: 'neutral',
      volume: 'not_visible',
      indicators: 'none',
      notes: 'Price remains range-bound.'
    },
    zones: { support: '1.0880-1.0900', resistance: '1.0940-1.0960' },
    m15: { inside_zone: false, liquidity: { swept: false }, confirmation: null, bos: { detected: false }, rsi: { visible: false, confirms: false } },
    strategy: {},
    trade_setup: { type: 'none' },
    confidence: 35,
    reasons: [],
  };

  const res = applyMentorStrategy(normalized);
  assert.equal(res.marketBias, 'neutral');
  assert.equal(res.trade_setup.type, 'none');
  assert.ok(['NO_TRADE', 'WAIT'].includes(res.decision));
  assert.ok(Array.isArray(res.whyNotNow));
});

test('structured market analysis allows NO_SETUP and WAIT without forcing BUY or SELL', () => {
  const candles = [
    { time: '2024-01-01T00:00:00Z', open: 1.1000, high: 1.1015, low: 1.0992, close: 1.1007 },
    { time: '2024-01-01T00:15:00Z', open: 1.1007, high: 1.1020, low: 1.0995, close: 1.1014 },
    { time: '2024-01-01T00:30:00Z', open: 1.1014, high: 1.1024, low: 1.0998, close: 1.1009 },
    { time: '2024-01-01T00:45:00Z', open: 1.1009, high: 1.1022, low: 1.0997, close: 1.1011 },
    { time: '2024-01-01T01:00:00Z', open: 1.1011, high: 1.1028, low: 1.1003, close: 1.1016 },
    { time: '2024-01-01T01:15:00Z', open: 1.1016, high: 1.1029, low: 1.1005, close: 1.1010 },
    { time: '2024-01-01T01:30:00Z', open: 1.1010, high: 1.1018, low: 1.0992, close: 1.0998 },
    { time: '2024-01-01T01:45:00Z', open: 1.0998, high: 1.1008, low: 1.0987, close: 1.0993 },
    { time: '2024-01-01T02:00:00Z', open: 1.0993, high: 1.1005, low: 1.0986, close: 1.0990 },
    { time: '2024-01-01T02:15:00Z', open: 1.0990, high: 1.1002, low: 1.0985, close: 1.0997 },
    { time: '2024-01-01T02:30:00Z', open: 1.0997, high: 1.1008, low: 1.0989, close: 1.1001 },
    { time: '2024-01-01T02:45:00Z', open: 1.1001, high: 1.1016, low: 1.0998, close: 1.1005 },
    { time: '2024-01-01T03:00:00Z', open: 1.1005, high: 1.1014, low: 1.0990, close: 1.0994 },
    { time: '2024-01-01T03:15:00Z', open: 1.0994, high: 1.1001, low: 1.0983, close: 1.0989 },
    { time: '2024-01-01T03:30:00Z', open: 1.0989, high: 1.1000, low: 1.0982, close: 1.0991 },
    { time: '2024-01-01T03:45:00Z', open: 1.0991, high: 1.1007, low: 1.0985, close: 1.1004 },
    { time: '2024-01-01T04:00:00Z', open: 1.1004, high: 1.1012, low: 1.0990, close: 1.0996 },
    { time: '2024-01-01T04:15:00Z', open: 1.0996, high: 1.1004, low: 1.0989, close: 1.0995 },
    { time: '2024-01-01T04:30:00Z', open: 1.0995, high: 1.1003, low: 1.0988, close: 1.0992 },
    { time: '2024-01-01T04:45:00Z', open: 1.0992, high: 1.1001, low: 1.0985, close: 1.0991 },
    { time: '2024-01-01T05:00:00Z', open: 1.0991, high: 1.1000, low: 1.0987, close: 1.0994 },
    { time: '2024-01-01T05:15:00Z', open: 1.0994, high: 1.1005, low: 1.0989, close: 1.0999 },
    { time: '2024-01-01T05:30:00Z', open: 1.0999, high: 1.1010, low: 1.0991, close: 1.1002 },
    { time: '2024-01-01T05:45:00Z', open: 1.1002, high: 1.1008, low: 1.0990, close: 1.0996 },
    { time: '2024-01-01T06:00:00Z', open: 1.0996, high: 1.1005, low: 1.0989, close: 1.0993 },
  ];

  const res = require('./serve').analyzeMarketFromCandles('EUR/USD', '15m', candles);
  assert.ok(['no_trade', 'success'].includes(res.status));
  assert.ok(['NO_SETUP', 'DEVELOPING', 'WAIT'].includes(res.setupStatus || 'NO_SETUP'));
  assert.ok(!['BUY', 'SELL'].includes(res.decision) || res.trade_setup.type === 'none' || res.decision === 'WAIT');
  assert.ok(Array.isArray(res.whyNotNow));
});

test('candle analysis abstains from fabricated levels across supported asset classes', () => {
  const analyzeMarketFromCandles = require('./serve').analyzeMarketFromCandles;
  const startPrices = { EURUSD: 1.08, XAUUSD: 2300, BTCUSD: 65000, US30: 40000, USOIL: 75 };
  const intervalCandles = (start) => Array.from({ length: 30 }, (_, index) => {
    const close = start * (1 + index * 0.0002);
    const open = close - start * 0.00005;
    return {
      time: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
      open,
      high: close + start * 0.00005,
      low: open - start * 0.00005,
      close,
    };
  });

  for (const [symbol, start] of Object.entries(startPrices)) {
    const result = analyzeMarketFromCandles(symbol, '15min', intervalCandles(start));
    assert.equal(result.status, 'no_trade', symbol);
    assert.equal(result.trade_setup.type, 'none', symbol);
    assert.equal(result.trade_setup.risk_reward, null, symbol);
    assert.match(result.confidenceMeaning, /not a calibrated win probability/i);
  }
});

test('invalid candle OHLC values cause insufficient-data abstention', () => {
  const candles = Array.from({ length: 24 }, (_, index) => ({
    time: new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
    open: 1.1,
    high: 1.101,
    low: 1.099,
    close: 1.1,
  }));
  candles[10].low = 1.102;

  const result = require('./serve').analyzeMarketFromCandles('EURUSD', '15min', candles);

  assert.equal(result.status, 'no_trade');
  assert.equal(result.chart.has_enough_candles, false);
  assert.equal(result.trade_setup.type, 'none');
  assert.ok(result.dataLimitations.some((item) => /24 valid/i.test(item)));
});
