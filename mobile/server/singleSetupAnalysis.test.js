const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SYSTEM_ERROR,
  SYSTEM_PROMPT,
  analyzeWithSingleRetry,
  buildAnalysisMessages,
  validateAnalysis,
} = require('./singleSetupAnalysis');

function validSetup(overrides = {}) {
  return {
    status: 'ok',
    pair: 'EURUSD',
    timeframe: '1H',
    direction: 'BUY',
    entry: 1.1,
    stop_loss: 1.09,
    take_profit_1: 1.12,
    risk_reward: 2,
    support: [1.095],
    resistance: [1.12],
    trend: 'bullish',
    structure: 'Higher highs and higher lows.',
    rightmost_candle: { type: 'bullish', bias: 'bullish' },
    next_candle_prediction: 'Likely to test 1.12.',
    confidence: 72,
    levels_estimated: false,
    reasoning: ['Support 1.095 is below entry 1.1.'],
    invalidation: 'Below 1.09 invalidates the BUY setup.',
    ...overrides,
  };
}

test('builds one vision request with the exact analyst prompt and selected context', () => {
  const messages = buildAnalysisMessages({
    imageBase64: 'image-data',
    mimeType: 'image/png',
    pair: 'EURUSD',
    timeframe: '1H',
    livePrice: { price: 1.101, source: 'Twelve Data', timestamp: '2026-01-01T00:00:00Z' },
  });

  assert.equal(messages.length, 3);
  assert.equal(messages[0].content, SYSTEM_PROMPT);
  assert.match(messages[1].content, /"take_profit_1": number/);
  assert.match(messages[2].content[0].text, /Selected pair: EURUSD/);
  assert.match(messages[2].content[0].text, /Selected timeframe: 1H/);
  assert.match(messages[2].content[0].text, /Live price: 1.101/);
  assert.equal(messages[2].content[1].type, 'image_url');
});

test('recomputes reward to risk and requires the selected pair and timeframe', () => {
  const result = validateAnalysis(validSetup(), { pair: 'EURUSD', timeframe: '1H' });
  assert.equal(result.valid, true);
  assert.equal(result.data.risk_reward, 2);

  assert.match(
    validateAnalysis(validSetup(), { pair: 'GBPUSD', timeframe: '1H' }).reason,
    /pair must match selected pair/,
  );
  assert.match(
    validateAnalysis(validSetup(), { pair: 'EURUSD', timeframe: '15m' }).reason,
    /timeframe must match selected timeframe/,
  );
});

test('rejects invalid ordering, low recomputed R/R, and entries outside chart levels', () => {
  const context = { pair: 'EURUSD', timeframe: '1H' };
  assert.match(validateAnalysis(validSetup({ stop_loss: 1.11 }), context).reason, /BUY ordering/);
  assert.match(validateAnalysis(validSetup({ take_profit_1: 1.114, risk_reward: 1.4 }), context).reason, /recomputed risk_reward/);
  assert.equal(validateAnalysis(validSetup({ risk_reward: 3 }), context).data.risk_reward, 2);
  assert.match(validateAnalysis(validSetup({ entry: 1.2 }), context).reason, /outside the visible support\/resistance range/);
});

test('uses live price distance when supplied', () => {
  const result = validateAnalysis(validSetup(), {
    pair: 'EURUSD',
    timeframe: '1H',
    livePrice: { price: 1.101, source: 'Twelve Data' },
  });
  assert.equal(result.valid, true);
  assert.match(
    validateAnalysis(validSetup({ support: [1.01], resistance: [1.05] }), {
      pair: 'EURUSD',
      timeframe: '1H',
      livePrice: { price: 1.2, source: 'Twelve Data' },
    }).reason,
    /more than 2% from live price/,
  );
});

test('accepts an entry inside the visible range when the live quote is far away', () => {
  const result = validateAnalysis(validSetup(), {
    pair: 'EURUSD',
    timeframe: '1H',
    livePrice: { price: 1.5, source: 'Twelve Data' },
  });

  assert.equal(result.valid, true);
  assert.equal(result.data.risk_reward, 2);
});

test('rejects an entry outside both the live-price tolerance and visible range', () => {
  const result = validateAnalysis(validSetup({
    entry: 1.2,
    stop_loss: 1.1,
    take_profit_1: 1.4,
    support: [1.08],
    resistance: [1.15],
  }), {
    pair: 'EURUSD',
    timeframe: '1H',
    livePrice: { price: 1.3, source: 'Twelve Data' },
  });

  assert.equal(result.valid, false);
  assert.match(result.reason, /outside the visible support\/resistance range/);
});

test('accepts only a status-only not-a-chart response', () => {
  assert.deepEqual(validateAnalysis({ status: 'not_a_chart' }, { pair: 'EURUSD', timeframe: '1H' }), {
    valid: true,
    notAChart: true,
    data: { status: 'not_a_chart' },
  });
  assert.equal(validateAnalysis({ status: 'not_a_chart', pair: 'EURUSD' }, {}).valid, false);
});

test('retries validation once with the exact failure reason', async () => {
  const calls = [];
  const result = await analyzeWithSingleRetry({
    imageBase64: 'image-data',
    mimeType: 'image/jpeg',
    pair: 'EURUSD',
    timeframe: '1H',
    requestModel: async (messages) => {
      calls.push(messages);
      return calls.length === 1 ? validSetup({ stop_loss: 1.11 }) : validSetup();
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(result.retryCount, 1);
  assert.equal(calls.length, 2);
  assert.match(calls[1][2].content[0].text, /Exact failure reason: BUY ordering must satisfy stop_loss < entry < take_profit_1\./);
});

test('returns the clear error after a second invalid response', async () => {
  let calls = 0;
  const result = await analyzeWithSingleRetry({
    imageBase64: 'image-data',
    mimeType: 'image/jpeg',
    pair: 'EURUSD',
    timeframe: '1H',
    requestModel: async () => {
      calls += 1;
      return validSetup({ stop_loss: 1.11 });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'error');
  assert.equal(result.message, SYSTEM_ERROR);
  assert.equal(result.retryCount, 1);
});

test('does not retry a not-a-chart result or an upstream failure', async () => {
  let calls = 0;
  const notChart = await analyzeWithSingleRetry({
    imageBase64: 'image-data',
    mimeType: 'image/jpeg',
    pair: 'EURUSD',
    timeframe: '1H',
    requestModel: async () => {
      calls += 1;
      return { status: 'not_a_chart' };
    },
  });
  assert.equal(notChart.status, 'not_a_chart');
  assert.equal(calls, 1);

  const upstreamError = await analyzeWithSingleRetry({
    imageBase64: 'image-data',
    mimeType: 'image/jpeg',
    pair: 'EURUSD',
    timeframe: '1H',
    requestModel: async () => {
      calls += 1;
      throw new Error('provider failed');
    },
  });
  assert.equal(upstreamError.status, 'error');
  assert.equal(calls, 2);
});
