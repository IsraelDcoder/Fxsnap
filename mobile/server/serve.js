/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { z } = require('zod');
const persistentStore = require('./persistentStore');
const { createAuth, verifyAuth } = require('./auth');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile();

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const marketCache = new Map();
const requestCounts = new Map();
const recentEvents = [];
const providerState = { failures: 0, blockedUntil: 0 };
const AUTH_SECRET = process.env.FXSNAP_AUTH_SECRET || 'development-only-change-me';
const StrategyInputSchema = z.object({
  style: z.enum(['scalping', 'intraday', 'swing']),
  risk: z.string().regex(/^\d+(\.\d+)?$/).max(6),
  pairs: z.array(z.string().regex(/^[A-Z]{6}$/)).min(1).max(5),
  session: z.enum(['London', 'New York', 'Asian']),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  variation: z.number().int().min(0).max(100).optional(),
});
const StrategyResponseSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().min(20).max(700),
  marketFocus: z.string().trim().min(5).max(300),
  timeframe: z.string().trim().min(2).max(80),
  confidence: z.number().min(0).max(100),
  sections: z.array(z.object({ title: z.string(), items: z.array(z.string().trim().min(3).max(300)).min(1).max(8) })).length(5),
}).superRefine((value, ctx) => {
  const required = ['Entry rules', 'Stop loss', 'Take profit', 'Risk management', 'When not to trade'];
  const titles = value.sections.map((section) => section.title);
  if (new Set(titles).size !== required.length || required.some((title) => !titles.includes(title))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'AI response must contain the five required strategy sections.' });
});
const ChartResponseSchema = z.object({
  isChart: z.boolean(), confidence: z.number().min(0).max(100), reason: z.string().trim().min(3).max(500),
  detectedPair: z.string().nullable().optional(), timeframe: z.string().nullable().optional(), trend: z.string().nullable().optional(),
  indicators: z.array(z.string().max(100)).max(12).optional(), support: z.array(z.string().max(80)).max(12).optional(), resistance: z.array(z.string().max(80)).max(12).optional(), chartNotes: z.array(z.string().max(300)).max(12).optional(),
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return appJson.expo?.name || 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, 'utf-8');
  res.writeHead(200, {
    'content-type': 'application/json',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = forwardedProto || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'content-type': contentType });
  res.end(content);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': process.env.ALLOWED_ORIGIN || '*',
    'access-control-allow-headers': 'content-type, authorization, x-device-id',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function signToken(deviceId) {
  return createAuth(AUTH_SECRET, deviceId);
}
function verifyToken(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifyAuth(AUTH_SECRET, token);
}
function requireAuth(req, res) {
  const deviceId = verifyToken(req);
  if (!deviceId) { sendJson(res, 401, { error: 'A valid anonymous session is required.' }); return null; }
  return deviceId;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 12_000_000) reject(new Error('Request is too large.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

async function generateStrategy(req, res) {
  if (!requireAuth(req, res)) return;
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.startsWith('replace_')) {
    return sendJson(res, 503, { error: 'OpenRouter is not configured. Set OPENROUTER_API_KEY on the server.' });
  }

  try {
    const inputResult = StrategyInputSchema.safeParse(await readJsonBody(req));
    if (!inputResult.success) return sendJson(res, 400, { error: 'Invalid strategy profile.', details: inputResult.error.flatten() });
    const input = inputResult.data;
    const prompt = `Create a personalized forex trading strategy from this user profile. Do not invent live prices, backtest results, or guaranteed performance. Return ONLY valid JSON matching the requested schema. Profile: ${JSON.stringify(input)}`;
    const schema = {
      name: 'string', description: 'string', marketFocus: 'string', timeframe: 'string', confidence: 'number 0-100',
      sections: [{ title: 'string', items: ['string'] }],
    };
    const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'FXSnap',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', temperature: 0.7,
        messages: [
          { role: 'system', content: `You are a careful professional trading-plan assistant. Make the plan specific to every input. Include sections titled exactly: Entry rules, Stop loss, Take profit, Risk management, When not to trade. Keep confidence as a calibrated opinion, not a probability of profit. JSON schema: ${JSON.stringify(schema)}` },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const payload = await response.json();
    if (!response.ok) return sendJson(res, 502, { error: payload.error?.message || 'AI provider request failed.' });
    const content = payload.choices?.[0]?.message?.content;
    const rawStrategy = typeof content === 'string' ? JSON.parse(content) : null;
    const parsed = StrategyResponseSchema.safeParse(rawStrategy);
    if (!parsed.success) return sendJson(res, 502, { error: 'AI returned an invalid strategy shape.', details: parsed.error.flatten() });
    const strategy = { ...parsed.data, description: `${parsed.data.description} Educational information only; this is not financial advice and confidence is a model score, not a probability of profit.` };
    return sendJson(res, 200, strategy);
  } catch (error) {
    console.error('[Strategy AI]', error);
    return sendJson(res, 502, { error: error.message || 'Unable to generate strategy.' });
  }
}

async function allowRequest(req, deviceId) {
  const ip = deviceId || req.socket.remoteAddress || 'unknown';
  const redisCount = await persistentStore.increment(`fxsnap:rate:${ip}`, 60);
  if (redisCount !== null) return redisCount <= 30;
  const now = Date.now();
  const record = requestCounts.get(ip) || { started: now, count: 0 };
  if (now - record.started > 60_000) { record.started = now; record.count = 0; }
  record.count += 1;
  requestCounts.set(ip, record);
  return record.count <= 30;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function fetchProvider(url) {
  if (providerState.blockedUntil > Date.now()) throw new Error('Market data provider circuit is open.');
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      providerState.failures = 0;
      return response;
    } catch (error) {
      lastError = error;
      providerState.failures += 1;
      if (providerState.failures >= 5) providerState.blockedUntil = Date.now() + 30_000;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

function validTimeSeries(timeSeries) {
  const entries = Object.entries(timeSeries || {});
  if (entries.length < 36) return false;
  return entries.every(([timestamp, values]) => {
    const numbers = ['1. open', '2. high', '3. low', '4. close'].map((key) => Number(values[key]));
    return !Number.isNaN(Date.parse(timestamp)) && numbers.every(Number.isFinite) && numbers[1] >= numbers[2];
  });
}

async function marketData(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  if (!(await allowRequest(req, deviceId))) return sendJson(res, 429, { error: 'Too many requests. Try again shortly.' });
  if (!process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY.startsWith('replace_')) {
    return sendJson(res, 503, { error: 'Market data provider is not configured.' });
  }
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pair = String(url.searchParams.get('pair') || '').replace('/', '').toUpperCase();
  if (!/^[A-Z]{6}$/.test(pair)) return sendJson(res, 400, { error: 'A valid six-letter forex pair is required.' });
  const cached = (await persistentStore.getJson(`fxsnap:market:${pair}`)) || marketCache.get(pair);
  if (cached && Date.now() - cached.createdAt < 60_000) return sendJson(res, 200, cached.data);
  try {
    const response = await fetchProvider(`https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${pair.slice(0, 3)}&to_symbol=${pair.slice(3)}&interval=5min&outputsize=compact&apikey=${encodeURIComponent(process.env.ALPHA_VANTAGE_API_KEY)}`);
    const data = await response.json();
    if (!response.ok || data['Error Message'] || data['Note']) return sendJson(res, 502, { error: data['Error Message'] || data['Note'] || 'Market data provider failed.' });
    const timeSeries = data['Time Series FX (5min)'];
    if (!validTimeSeries(timeSeries)) return sendJson(res, 502, { error: 'Market data provider returned insufficient or malformed candles.' });
    const result = { pair, provider: 'alphavantage', providerTimestamp: Object.keys(timeSeries).sort().at(-1), timeSeries };
    marketCache.set(pair, { createdAt: Date.now(), data: result });
    await persistentStore.setJson(`fxsnap:market:${pair}`, { createdAt: Date.now(), data: result }, 60);
    return sendJson(res, 200, result);
  } catch (error) { return sendJson(res, 504, { error: error.name === 'AbortError' ? 'Market data request timed out.' : 'Market data request failed.' }); }
}

function normalizeLayer1(payload) {
  const confidenceScore = Number(payload?.confidence_score || payload?.confidence || 0);
  return {
    trend_direction: typeof payload?.trend_direction === 'string' ? payload.trend_direction : 'ranging',
    market_structure: typeof payload?.market_structure === 'string' ? payload.market_structure : 'unclear',
    support_levels: Array.isArray(payload?.support_levels) ? payload.support_levels : [],
    resistance_levels: Array.isArray(payload?.resistance_levels) ? payload.resistance_levels : [],
    price_action_signals: Array.isArray(payload?.price_action_signals) ? payload.price_action_signals : [],
    chart_quality: typeof payload?.chart_quality === 'string' ? payload.chart_quality : 'unclear',
    confidence_score: Number.isFinite(confidenceScore) ? Math.max(0, Math.min(100, confidenceScore)) : 0,
  };
}

function normalizeLayer2(payload) {
  const confidence = Number(payload?.confidence || 0);
  const tradeDecision = typeof payload?.trade_decision === 'string' ? payload.trade_decision.toLowerCase() : 'no_trade';
  return {
    trade_decision: tradeDecision,
    entry: typeof payload?.entry === 'string' ? payload.entry : '',
    stop_loss: typeof payload?.stop_loss === 'string' ? payload.stop_loss : '',
    take_profit: typeof payload?.take_profit === 'string' ? payload.take_profit : '',
    risk_reward_ratio: typeof payload?.risk_reward_ratio === 'string' ? payload.risk_reward_ratio : '',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
    reasoning: typeof payload?.reasoning === 'string' ? payload.reasoning : '',
  };
}

function parseJsonPayload(rawContent) {
  if (!rawContent) return null;
  const trimmed = String(rawContent).trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

async function callVisionModel(messages, timeoutMs = 30000) {
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  // Vision tasks MUST use a vision-capable model. Do not fall back to
  // OPENROUTER_MODEL here — that is typically a text-only model used for
  // strategy generation and will reject image_url payloads.
  const model = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini';
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'FXSnap',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
      response_format: { type: 'json_object' },
    }),
  }, timeoutMs);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'Chart AI request failed.');
  return parseJsonPayload(payload.choices?.[0]?.message?.content);
}

const GEMINI_CHART_PROMPT = `You are a professional forex chart analyst.

Analyze this chart image and extract ONLY factual observations.

DO NOT give any trading advice.

Return ONLY valid JSON.

Extract the following:

1. trend_direction: (bullish / bearish / ranging)
2. market_structure: (higher highs, lower lows, consolidation, breakout, etc.)
3. support_levels: array of price levels
4. resistance_levels: array of price levels
5. price_action_signals: array (e.g. rejection wicks, engulfing candles, break and retest)
6. chart_quality: (clear / unclear)
7. confidence_score: (0-100)

Return format:

{
  "trend_direction": "",
  "market_structure": "",
  "support_levels": [],
  "resistance_levels": [],
  "price_action_signals": [],
  "chart_quality": "",
  "confidence_score": 0
}`;

/**
 * Google Gemini Vision (Layer 1 — factual chart extraction only).
 *
 * Uses the native REST API (no SDK) so it works in this CommonJS server with
 * the existing fetchWithTimeout helper. Model is gemini-1.5-flash by default
 * and can be overridden with GEMINI_VISION_MODEL.
 */
async function callGeminiVision(imageBase64, mimeType, pair, timeoutMs = 15000) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: `Pair: ${pair || 'unknown'}\n\n${GEMINI_CHART_PROMPT}` },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.2 },
    }),
  }, timeoutMs);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  const text = String(
    payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').filter(Boolean).join('') || ''
  ).trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return parseJsonPayload(text);
}

function buildFallbackChartResult(input) {
  return {
    fallback: true,
    availability: 'fallback',
    canContinue: true,
    message: 'Image analysis unavailable. Continuing in manual mode.',
    isChart: false,
    confidence: 0,
    reason: 'The chart AI provider was unavailable, so FXSnap used manual mode with live market data.',
    detectedPair: input?.pair || null,
    timeframe: input?.timeframe || null,
    trend: 'Neutral',
    indicators: ['Manual review'],
    support: ['Manual review is recommended if you need a stricter technical read.'],
    resistance: [],
    chartNotes: ['This fallback keeps the app moving when the AI provider is unavailable.'],
  };
}

function buildHybridChartResult(input, layer1, layer2) {
  const direction = layer2.trade_decision === 'buy' ? 'Bullish' : layer2.trade_decision === 'sell' ? 'Bearish' : 'Neutral';
  const confidence = Math.round((Number(layer1.confidence_score || 0) + Number(layer2.confidence || 0)) / 2);
  return {
    fallback: false,
    availability: 'ai',
    canContinue: true,
    isChart: true,
    confidence,
    reason: layer2.reasoning || 'Structured chart analysis completed.',
    detectedPair: input?.pair || null,
    timeframe: input?.timeframe || null,
    trend: direction,
    indicators: layer1.price_action_signals || [],
    support: layer1.support_levels || [],
    resistance: layer1.resistance_levels || [],
    chartNotes: [
      layer1.market_structure || 'Market structure unclear',
      layer2.reasoning || 'Trade decision generated conservatively.',
      `Trade decision: ${layer2.trade_decision}`,
    ],
    hybrid: {
      layer1,
      layer2,
    },
    trade_decision: layer2.trade_decision,
    entry: layer2.entry,
    stop_loss: layer2.stop_loss,
    take_profit: layer2.take_profit,
    risk_reward_ratio: layer2.risk_reward_ratio,
  };
}

async function analyzeChart(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  if (!(await allowRequest(req, deviceId))) return sendJson(res, 429, { error: 'Too many requests. Try again shortly.' });

  let input = {};
  try {
    input = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'Invalid JSON body.' });
  }

  try {
    const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : typeof input.image === 'string' ? input.image : '';
    const mime = typeof input.mimeType === 'string' ? input.mimeType : 'image/jpeg';

    if (!imageBase64 || imageBase64.length < 100 || imageBase64.length > 10_000_000) {
      return sendJson(res, 400, { error: 'A chart image between 100 bytes and 7.5 MB is required.' });
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return sendJson(res, 400, { error: 'Only JPEG, PNG, and WebP chart images are supported.' });
    }
    const hasGemini = Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('replace_'));
    const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY.startsWith('replace_'));
    if (!hasGemini && !hasOpenRouter) {
      return sendJson(res, 200, { ...buildFallbackChartResult(input), message: 'Chart AI is not configured on the server.' });
    }

    const layer1Messages = [
      { role: 'system', content: 'You are a professional forex chart analyst. Analyze the chart image and extract only factual observations. Do not give any trade advice. Return only structured JSON with trend_direction, market_structure, support_levels, resistance_levels, price_action_signals, chart_quality, confidence_score.' },
      { role: 'user', content: [{ type: 'text', text: `Analyze this chart image for pair ${input.pair || 'unknown'} and timeframe ${input.timeframe || 'unknown'}.` }, { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } }] },
    ];

    let layer1 = null;
    let layer1Error = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // Preferred provider: Google Gemini Vision. Fallback: OpenRouter vision.
        layer1 = hasGemini
          ? await callGeminiVision(imageBase64, mime, input.pair || 'unknown', 15000)
          : await callVisionModel(layer1Messages, 30000);
        if (layer1) break;
      } catch (error) {
        layer1Error = error;
      }
    }

    if (!layer1) {
      console.error('[Hybrid Chart] Layer 1 failed:', layer1Error);
      const message = hasGemini
        ? `Chart analysis failed. Try again. (${(layer1Error instanceof Error ? layer1Error.message : 'unknown provider error')})`
        : `Chart AI could not analyze the image: ${(layer1Error instanceof Error ? layer1Error.message : 'unknown provider error')}`;
      return sendJson(res, 200, { ...buildFallbackChartResult(input), message });
    }

    const normalizedLayer1 = normalizeLayer1(layer1);
    console.log('[Hybrid Chart] Layer 1 raw:', layer1);
    console.log('[Hybrid Chart] Layer 1 confidence:', normalizedLayer1.confidence_score);

    if (normalizedLayer1.chart_quality === 'unclear' || normalizedLayer1.confidence_score < 60) {
      return sendJson(res, 200, { error: 'Chart unclear. Please upload a better image.', availability: 'rejected', canContinue: false, fallback: false, layer1: normalizedLayer1 });
    }

    const layer2Messages = [{ role: 'system', content: 'You are a professional forex trading strategist. Based on the structured chart analysis, generate a conservative trade setup. If conditions are unclear, return no_trade. Return only structured JSON with trade_decision, entry, stop_loss, take_profit, risk_reward_ratio, confidence, reasoning.' }, { role: 'user', content: `Trend: ${normalizedLayer1.trend_direction}\nStructure: ${normalizedLayer1.market_structure}\nSupport: ${normalizedLayer1.support_levels.join(', ') || 'none'}\nResistance: ${normalizedLayer1.resistance_levels.join(', ') || 'none'}\nSignals: ${normalizedLayer1.price_action_signals.join(', ') || 'none'}` }];
    let layer2 = null;
    if (hasOpenRouter) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          layer2 = await callVisionModel(layer2Messages, 30000);
          if (layer2) break;
        } catch (error) {
          console.error('[Hybrid Chart] Layer 2 failed:', error);
        }
      }
    }

    const normalizedLayer2 = normalizeLayer2(layer2 || {});
    console.log('[Hybrid Chart] Layer 2 raw:', layer2 || {});
    return sendJson(res, 200, buildHybridChartResult(input, normalizedLayer1, normalizedLayer2));
  } catch (error) {
    console.error('[Hybrid Chart] fallback:', error);
    return sendJson(res, 200, { ...buildFallbackChartResult(input), message: `Chart AI failed: ${(error instanceof Error ? error.message : 'unknown error')}` });
  }
}

async function receiveEvent(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  if (!(await allowRequest(req, deviceId))) return sendJson(res, 429, { error: 'Too many requests.' });
  try {
    const event = await readJsonBody(req);
    if (typeof event.name !== 'string' || event.name.length > 80) return sendJson(res, 400, { error: 'Invalid event.' });
    const storedEvent = { deviceId, name: event.name, properties: event.properties || {}, occurredAt: event.occurredAt || new Date().toISOString() };
    if (!(await persistentStore.appendJson('fxsnap:events', storedEvent, 10000, 60 * 60 * 24 * 90))) recentEvents.push(storedEvent);
    if (recentEvents.length > 1000) recentEvents.shift();
    return sendJson(res, 204, {});
  } catch (error) { return sendJson(res, 400, { error: error.message }); }
}

async function getEntitlement(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';
  if (!secret || secret.startsWith('replace_')) return sendJson(res, 503, { error: 'RevenueCat server verification is not configured.' });
  try {
    const response = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`, { headers: { authorization: `Bearer ${secret}` } });
    const payload = await response.json();
    if (!response.ok) return sendJson(res, 502, { error: 'RevenueCat entitlement lookup failed.' });
    const entitlement = payload.subscriber?.entitlements?.[entitlementId];
    const expiresAt = entitlement?.expires_date ? Date.parse(entitlement.expires_date) : null;
    const active = Boolean(entitlement && (!expiresAt || expiresAt > Date.now()));
    return sendJson(res, 200, { active, expiresAt: entitlement?.expires_date || null, store: entitlement?.store || null });
  } catch (error) { return sendJson(res, 504, { error: error.name === 'AbortError' ? 'RevenueCat lookup timed out.' : 'RevenueCat lookup failed.' }); }
}

async function recordSignal(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  const result = z.object({ id: z.string().min(8).max(100), pair: z.string().regex(/^[A-Z]{6}$/), direction: z.enum(['BUY', 'SELL']), entry: z.number(), sl: z.number(), tp: z.number(), generatedAt: z.string().datetime() }).safeParse(await readJsonBody(req));
  if (!result.success) return sendJson(res, 400, { error: 'Invalid signal record.' });
  const record = { ...result.data, deviceId, outcome: 'open', outcomeAt: null };
  await persistentStore.setJson(`fxsnap:signal:${deviceId}:${record.id}`, record, 60 * 60 * 24 * 365);
  return sendJson(res, 201, { accepted: true });
}

async function updateSignalOutcome(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  const id = String(req.url || '').split('/').pop();
  const result = z.object({ outcome: z.enum(['win', 'loss', 'open']), outcomeAt: z.string().datetime().optional(), realizedR: z.number().min(-10).max(10).optional() }).safeParse(await readJsonBody(req));
  if (!result.success || !id) return sendJson(res, 400, { error: 'Invalid signal outcome.' });
  const key = `fxsnap:signal:${deviceId}:${id}`;
  const existing = await persistentStore.getJson(key);
  if (!existing) return sendJson(res, 404, { error: 'Signal not found.' });
  await persistentStore.setJson(key, { ...existing, ...result.data, outcomeAt: result.data.outcomeAt || new Date().toISOString() }, 60 * 60 * 24 * 365);
  return sendJson(res, 200, { accepted: true });
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
const appName = getAppName();

function createRequestHandler() {
  return (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    let pathname = url.pathname;

    if (req.method === 'OPTIONS') return sendJson(res, 204, {});
    if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { status: 'ok', service: 'fxsnap' });
    if (pathname === '/api/session' && req.method === 'POST') {
      return readJsonBody(req).then((body) => {
        const deviceId = String(body.deviceId || '');
        if (!/^[a-zA-Z0-9_-]{16,128}$/.test(deviceId)) return sendJson(res, 400, { error: 'Invalid device identity.' });
        return sendJson(res, 200, { token: signToken(deviceId), expiresIn: 30 * 24 * 60 * 60 });
      }).catch((error) => sendJson(res, 400, { error: error.message }));
    }

    if (pathname === '/api/strategy' && req.method === 'POST') return generateStrategy(req, res);
    if ((pathname === '/api/chart-analysis' || pathname === '/analyze-chart') && req.method === 'POST') return analyzeChart(req, res);
    if (pathname === '/api/events' && req.method === 'POST') return receiveEvent(req, res);
    if (pathname === '/api/entitlement' && req.method === 'GET') return getEntitlement(req, res);
    if (pathname === '/api/signals' && req.method === 'POST') return recordSignal(req, res);
    if (pathname.startsWith('/api/signals/') && req.method === 'PATCH') return updateSignalOutcome(req, res);
    if (pathname === '/api/market-data' && req.method === 'GET') return marketData(req, res);
    if (pathname === '/api/strategy' && req.method !== 'POST') return sendJson(res, 405, { error: 'POST required.' });

    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || '/';
    }

    if (pathname === '/' || pathname === '/manifest') {
      const platform = req.headers['expo-platform'];
      if (platform === 'ios' || platform === 'android') {
        return serveManifest(platform, res);
      }

      if (pathname === '/') {
        return serveLandingPage(req, res, landingPageTemplate, appName);
      }
    }

    serveStaticFile(pathname, res);
  };
}

const requestHandler = createRequestHandler();

if (require.main === module) {
  const server = http.createServer(requestHandler);
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Serving static Expo build on port ${port}`);
  });
}

module.exports = requestHandler;
module.exports.createRequestHandler = createRequestHandler;
