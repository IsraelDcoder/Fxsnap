const { z } = require('zod');

const SYSTEM_PROMPT = `You are a professional price-action analyst. You receive a chart screenshot, the selected pair, and the timeframe. Read the price axis, the last 30+ candles, the rightmost candle, swing highs and lows, support/resistance, trend and structure. Then output ONE complete, tradable setup for the selected pair. Rules:
- Always choose BUY or SELL based on the evidence. Do not return 'no setup' for a readable chart.
- Use only price levels visible on or implied by the chart axis. Match the pair's normal price precision (JPY pairs 3 decimals, most FX 5, gold 2).
- BUY: stop_loss < entry < take_profit_1.
- SELL: take_profit_1 < entry < stop_loss.
- Place the stop just beyond the nearest swing or S/R level.
- Place TP1 at the next opposing level, minimum 1.5R.
- Always return at least 1 support and 1 resistance level.
- Give a read on the rightmost candle and a prediction for the next candle.
- Every reasoning line must reference numbers that appear in your own JSON. Never contradict your own levels.
- If you cannot read the price axis, still give your best levels and set levels_estimated=true.
- If the image is not a price chart, return status='not_a_chart' and nothing else.
Return JSON only, no extra text.`;

const OUTPUT_SCHEMA_PROMPT = `For a readable chart, return exactly one JSON object with these fields and types:
{
  "status": "ok",
  "pair": "string",
  "timeframe": "string",
  "direction": "BUY" | "SELL",
  "entry": number,
  "stop_loss": number,
  "take_profit_1": number,
  "take_profit_2": number (optional),
  "risk_reward": number,
  "support": number[],
  "resistance": number[],
  "trend": "string",
  "structure": "string",
  "rightmost_candle": { "type": "string", "bias": "string" },
  "next_candle_prediction": "string",
  "confidence": number from 0 to 100,
  "levels_estimated": boolean,
  "reasoning": string[] with at most 4 short lines,
  "invalidation": one-line string
}
For a non-chart image, return only {"status":"not_a_chart"}.`;

const PositivePrice = z.number().finite().positive();
const SetupSchema = z.object({
  status: z.literal('ok'),
  pair: z.string().min(1),
  timeframe: z.string().min(1),
  direction: z.enum(['BUY', 'SELL']),
  entry: PositivePrice,
  stop_loss: PositivePrice,
  take_profit_1: PositivePrice,
  take_profit_2: PositivePrice.optional(),
  risk_reward: z.number().finite().positive(),
  support: z.array(PositivePrice).min(1),
  resistance: z.array(PositivePrice).min(1),
  trend: z.string().min(1),
  structure: z.string().min(1),
  rightmost_candle: z.object({
    type: z.string().min(1),
    bias: z.string().min(1),
  }).strict(),
  next_candle_prediction: z.string().min(1),
  confidence: z.number().finite().min(0).max(100),
  levels_estimated: z.boolean(),
  reasoning: z.array(z.string().trim().min(1).max(300)).max(4),
  invalidation: z.string().trim().min(1).max(300).refine((value) => !/[\r\n]/.test(value), 'must be one line'),
}).strict();

const NotAChartSchema = z.object({ status: z.literal('not_a_chart') }).strict();
const AnalysisResponseSchema = z.discriminatedUnion('status', [SetupSchema, NotAChartSchema]);
const SYSTEM_ERROR = "Couldn't generate a valid setup, try again";
const MAX_LIVE_PRICE_DISTANCE = 0.02;

function buildAnalysisMessages({ imageBase64, mimeType, pair, timeframe, livePrice, failureReason }) {
  const context = [
    `Selected pair: ${pair}`,
    `Selected timeframe: ${timeframe}`,
    livePrice == null
      ? 'Live price: unavailable.'
      : `Live price: ${livePrice.price} (${livePrice.source}${livePrice.timestamp ? `, ${livePrice.timestamp}` : ''}).`,
  ];
  if (failureReason) {
    context.push(`The previous JSON failed validation. Return a corrected complete JSON object. Exact failure reason: ${failureReason}`);
  } else {
    context.push('Analyze the attached chart and return the complete setup JSON.');
  }
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: OUTPUT_SCHEMA_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: context.join('\n') },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    },
  ];
}

function validateAnalysis(raw, { pair, timeframe, livePrice }) {
  const parsed = AnalysisResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    return { valid: false, reason };
  }
  if (parsed.data.status === 'not_a_chart') return { valid: true, notAChart: true, data: parsed.data };

  const setup = parsed.data;
  const failures = [];
  if (setup.pair !== pair) failures.push(`pair must match selected pair "${pair}".`);
  if (setup.timeframe !== timeframe) failures.push(`timeframe must match selected timeframe "${timeframe}".`);
  if (setup.direction === 'BUY' && !(setup.stop_loss < setup.entry && setup.entry < setup.take_profit_1)) {
    failures.push('BUY ordering must satisfy stop_loss < entry < take_profit_1.');
  }
  if (setup.direction === 'SELL' && !(setup.take_profit_1 < setup.entry && setup.entry < setup.stop_loss)) {
    failures.push('SELL ordering must satisfy take_profit_1 < entry < stop_loss.');
  }

  const risk = Math.abs(setup.entry - setup.stop_loss);
  const reward = Math.abs(setup.take_profit_1 - setup.entry);
  const calculatedRiskReward = reward / risk;
  if (!Number.isFinite(calculatedRiskReward) || calculatedRiskReward < 1.5) {
    failures.push('recomputed risk_reward must be at least 1.5.');
  }

  const visibleLevels = [...setup.support, ...setup.resistance];
  const visibleLow = Math.min(...visibleLevels);
  const visibleHigh = Math.max(...visibleLevels);
  const entryWithinVisibleRange = setup.entry >= visibleLow && setup.entry <= visibleHigh;
  if (livePrice?.price > 0) {
    const livePriceDistance = Math.abs(setup.entry - livePrice.price) / livePrice.price;
    if (livePriceDistance > MAX_LIVE_PRICE_DISTANCE && !entryWithinVisibleRange) {
      failures.push(`entry is more than ${MAX_LIVE_PRICE_DISTANCE * 100}% from live price ${livePrice.price} and outside the visible support/resistance range ${visibleLow}-${visibleHigh}.`);
    }
  } else if (!entryWithinVisibleRange) {
    failures.push(`entry ${setup.entry} is outside the visible support/resistance range ${visibleLow}-${visibleHigh}.`);
  }

  if (failures.length) return { valid: false, reason: failures.join(' ') };
  return {
    valid: true,
    notAChart: false,
    data: { ...setup, risk_reward: Math.round(calculatedRiskReward * 100) / 100 },
  };
}

async function analyzeWithSingleRetry({ requestModel, imageBase64, mimeType, pair, timeframe, livePrice }) {
  let messages = buildAnalysisMessages({ imageBase64, mimeType, pair, timeframe, livePrice });
  let retryCount = 0;
  let rawModelJson = null;
  let validationResult = { valid: false, reason: 'Model response was not received.' };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await requestModel(messages);
    } catch (error) {
      if (error?.code !== 'INVALID_MODEL_JSON') {
        return { status: 'error', message: 'Chart analysis is temporarily unavailable. Please try again.', retryCount, rawModelJson: error?.rawModelJson ?? rawModelJson, validationResult: { valid: false, reason: error?.message || 'Model request failed.' } };
      }
      rawModelJson = error.rawModelJson ?? null;
      validationResult = { valid: false, reason: error.message || 'Model response was not valid JSON.' };
    }

    if (response !== undefined) {
      const raw = response && Object.prototype.hasOwnProperty.call(response, 'modelJson')
        ? response.modelJson
        : response;
      rawModelJson = response?.rawModelJson ?? JSON.stringify(raw);
      validationResult = validateAnalysis(raw, { pair, timeframe, livePrice });
      if (validationResult.valid) {
        return {
          status: validationResult.notAChart ? 'not_a_chart' : 'success',
          data: validationResult.data,
          retryCount,
          rawModelJson,
          validationResult: { valid: true, notAChart: validationResult.notAChart === true },
        };
      }
    }

    if (attempt === 0) {
      retryCount = 1;
      messages = buildAnalysisMessages({
        imageBase64,
        mimeType,
        pair,
        timeframe,
        livePrice,
        failureReason: validationResult.reason,
      });
    }
  }

  return {
    status: 'error',
    message: SYSTEM_ERROR,
    retryCount,
    rawModelJson,
    validationResult,
  };
}

async function callOpenRouterVision(messages, timeoutMs = 45000) {
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const model = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://fxsnap.vercel.app',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'FXSnap',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: controller.signal,
    });

    const payloadText = await response.text();
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      throw new Error(`OpenRouter returned invalid response JSON (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter request failed (HTTP ${response.status}).`);

    const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.message?.parsed;
    const rawModelJson = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n')
        : '';
    let modelJson;
    try {
      modelJson = JSON.parse(rawModelJson);
    } catch {
      const error = new Error('Model response was not valid JSON.');
      error.code = 'INVALID_MODEL_JSON';
      error.rawModelJson = rawModelJson;
      throw error;
    }
    return { modelJson, rawModelJson };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  AnalysisResponseSchema,
  SYSTEM_ERROR,
  SYSTEM_PROMPT,
  analyzeWithSingleRetry,
  buildAnalysisMessages,
  callOpenRouterVision,
  validateAnalysis,
};
