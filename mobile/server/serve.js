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
const { buildSessionContext } = require('./tradingSessions');

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
const PRIVACY_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'privacy-policy.html');
const TERMS_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'terms-of-use.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const requestCounts = new Map();
const recentEvents = [];
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
const ANALYSIS_STATUS = ['success', 'no_trade', 'invalid_image'];
// Lenient schema: the AI may return minimal fields when it concludes
// "invalid_image". Post-parse normalization fills safe defaults, and the
// validation layer enforces the trade rules on "success" verdicts.
const TradeAnalysisSchema = z.object({
  status: z.enum(ANALYSIS_STATUS),
  analysis: z.object({
    trend: z.enum(['bullish', 'bearish', 'neutral']).optional(),
    structure: z.string().trim().max(300).optional(),
    volatility: z.enum(['low', 'moderate', 'high']).optional(),
    volume: z.enum(['low', 'moderate', 'high', 'not_visible']).optional(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral']).optional(),
    indicators: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(400).optional(),
  }).optional(),
  zones: z.object({
    support: z.string().trim().max(200).optional(),
    resistance: z.string().trim().max(200).optional(),
    liquidity: z.string().trim().max(200).optional(),
  }).optional(),
  trade_setup: z.object({
    type: z.enum(['buy', 'sell', 'none']).optional(),
    entry_zone: z.string().trim().max(200).optional(),
    stop_loss: z.string().trim().max(200).optional(),
    take_profit: z.string().trim().max(200).optional(),
    risk_reward: z.union([z.number(), z.string().trim().max(20)]).optional(),
  }).optional(),
  confidence: z.number().min(0).max(100).optional(),
});

/** Fill safe defaults so every state returns the same complete JSON shape. */
function normalizeAnalysis(raw) {
  const analysis = raw.analysis || {};
  const zones = raw.zones || {};
  const trade = raw.trade_setup || {};
  const normalized = {
    status: raw.status,
    analysis: {
      trend: analysis.trend || 'neutral',
      structure: analysis.structure || '',
      volatility: analysis.volatility || 'low',
      volume: analysis.volume || 'not_visible',
      sentiment: analysis.sentiment || 'neutral',
      indicators: analysis.indicators || 'none',
      notes: analysis.notes || '',
    },
    zones: {
      support: zones.support || 'not_clear',
      resistance: zones.resistance || 'not_clear',
      liquidity: zones.liquidity || 'not_clear',
    },
    trade_setup: {
      type: trade.type || 'none',
      entry_zone: trade.entry_zone || 'none',
      stop_loss: trade.stop_loss || 'none',
      take_profit: trade.take_profit || 'none',
      risk_reward: trade.risk_reward != null ? trade.risk_reward : 'none',
    },
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
  };
  // The disciplined output contract requires "no_trade" to always carry
  // trade_setup.type === "none".
  if (normalized.status === 'no_trade') {
    normalized.trade_setup.type = 'none';
  }
  return normalized;
}

function getTraderSystemPrompt() {
  return `You are a professional price action trader and technical analyst.

Your job is to analyze a trading chart image and return a structured, disciplined, and consistent analysis.

Current session context: ${buildSessionContext()}

You MUST behave like a strict, rule-based trader — not a storyteller.

IMPORTANT RULES:

1. The analysis is based ONLY on the uploaded chart image.
2. Do NOT assume real-time market data.
3. Do NOT hallucinate unknown data (news, fundamentals, unseen candles).
4. If the chart is unclear or not a valid trading chart → return "invalid_image".
5. If there is no clear, high-probability setup → return "no_trade".
6. You must be conservative. Avoid forcing trades.
7. Confidence must reflect clarity of structure, not guesswork.
8. Keep explanations short, precise, and professional.

ANALYSIS REQUIREMENTS:

You must extract and evaluate:

- Trend (bullish, bearish, or neutral)
- Market structure (higher highs/lows or lower highs/lows)
- Key zones (support and resistance)
- Liquidity areas (if visible)
- Volatility (low, moderate, high based on candle size and movement)
- Volume (only if visible on chart)
- Indicators (only if clearly visible)
- Price behavior (breakouts, consolidations, rejections)

TRADE DECISION RULES:

Only return a trade if ALL conditions are met:
- Clear trend or strong range structure
- Clear entry zone
- Logical stop loss placement
- Minimum risk-reward ratio of 1.5
- No conflicting signals

If any condition fails → return "no_trade"

OUTPUT FORMAT (STRICT JSON):

{
  "status": "success | no_trade | invalid_image",

  "analysis": {
    "trend": "bullish | bearish | neutral",
    "structure": "short description",
    "volatility": "low | moderate | high",
    "volume": "low | moderate | high | not_visible",
    "sentiment": "bullish | bearish | neutral",
    "indicators": "list or 'none'",
    "notes": "short explanation"
  },

  "zones": {
    "support": "price zone or description",
    "resistance": "price zone or description",
    "liquidity": "description or 'not_clear'"
  },

  "trade_setup": {
    "type": "buy | sell | none",
    "entry_zone": "zone or 'none'",
    "stop_loss": "level or 'none'",
    "take_profit": "level or 'none'",
    "risk_reward": "number or 'none'"
  },

  "confidence": 0-100
}

FINAL RULES:

- If status = "no_trade", then trade_setup.type MUST be "none"
- If status = "invalid_image", all fields except status can be null or minimal
- Do NOT include extra text outside JSON
- Do NOT explain beyond what is required`;
}

/** Backend validation layer — enforced AFTER the AI responds. */
function enforceValidationRules(response) {
  if (!response) return null;

  if (response.status === 'success') {
    if (response.confidence < 70) {
      response.status = 'no_trade';
      response.trade_setup.type = 'none';
      response.trade_setup.entry_zone = 'none';
      response.trade_setup.stop_loss = 'none';
      response.trade_setup.take_profit = 'none';
      response.trade_setup.risk_reward = 'none';
      response.analysis.notes = 'Signal held back: confidence is below the 70% validation threshold.';
    } else if (Number(response.trade_setup.risk_reward) < 1.5) {
      response.status = 'no_trade';
      response.trade_setup.type = 'none';
      response.trade_setup.entry_zone = 'none';
      response.trade_setup.stop_loss = 'none';
      response.trade_setup.take_profit = 'none';
      response.trade_setup.risk_reward = 'none';
      response.analysis.notes = 'Signal held back: risk-reward is below the 1.5 minimum.';
    }
  }

  return response;
}

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
    const prompt = `Create a personalized forex trading strategy from this user profile. Keep the plan concise and actionable. Return ONLY valid JSON matching the requested schema. Profile: ${JSON.stringify({
      style: input.style,
      risk: input.risk,
      pairs: input.pairs,
      session: input.session,
      experience: input.experience,
      variation: input.variation,
    })}`;
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
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 1500,
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

/**
 * Google Gemini Vision — single-pass disciplined chart analysis.
 *
 * Uses the native REST API (no SDK) so it works in this CommonJS server with
 * the existing fetchWithTimeout helper. Primary/fallback Gemini models are
 * defined by GEMINI_VISION_MODEL_PRIMARY and GEMINI_VISION_MODEL_FALLBACK.
 */
const DEFAULT_GEMINI_PRIMARY_MODEL = 'models/gemini-2.0-flash-001';
const DEFAULT_GEMINI_FALLBACK_MODEL = 'models/gemini-1.5-pro-latest';

async function callGeminiTrader(imageBase64, mimeType, pair, model, timeoutMs = 30000) {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = model || process.env.GEMINI_VISION_MODEL_PRIMARY || DEFAULT_GEMINI_PRIMARY_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: `Analyze this forex chart image for ${pair || 'unknown'} with careful market structure and risk-aware trade setup.\n\n${getTraderSystemPrompt()}` },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.2 },
    }),
  }, timeoutMs);

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  }

  const text = String(
    payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').filter(Boolean).join('') || ''
  ).trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return parseJsonPayload(text);
}

async function callGeminiTraderWithFallback(imageBase64, mimeType, pair, timeoutMs = 30000) {
  const models = [
    process.env.GEMINI_VISION_MODEL_PRIMARY || DEFAULT_GEMINI_PRIMARY_MODEL,
    process.env.GEMINI_VISION_MODEL_FALLBACK || DEFAULT_GEMINI_FALLBACK_MODEL,
  ];

  let lastError = null;
  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const isFallback = modelIndex === 1;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        console.log(`[Chart AI] Gemini ${isFallback ? 'fallback' : 'primary'} model ${model} attempt ${attempt}`);
        const result = await callGeminiTrader(imageBase64, mimeType, pair, model, timeoutMs);
        if (attempt > 1) {
          console.log(`[Chart AI] Gemini model ${model} succeeded after retry ${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error;
        console.error(`[Chart AI] Gemini model failure: ${model} attempt ${attempt} - ${(error instanceof Error ? error.message : String(error))}`);
        if (attempt < 2) continue;
      }
    }

    if (isFallback) {
      console.error(`[Chart AI] Falling back to Gemini model: ${model}`);
    }
  }

  throw lastError || new Error('Gemini analysis failed after retries and fallback.');
}

/** OpenRouter vision fallback — single-pass disciplined chart analysis. */
async function callOpenRouterTrader(imageBase64, mimeType, pair, timeoutMs = 45000) {
  const messages = [
    { role: 'system', content: getTraderSystemPrompt() },
    { role: 'user', content: [{ type: 'text', text: `Analyze this trading chart image for ${pair || 'unknown'}.` }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }] },
  ];
  return callVisionModel(messages, timeoutMs);
}

function aiUnavailableResponse(input, message) {
  return {
    status: 'ai_unavailable',
    availability: 'ai_unavailable',
    message: message || 'Chart AI is unavailable right now. Please try again shortly.',
    detectedPair: input?.pair || null,
    timeframe: input?.timeframe || null,
    analysis: {
      trend: 'neutral',
      structure: '',
      volatility: 'low',
      volume: 'not_visible',
      sentiment: 'neutral',
      indicators: 'none',
      notes: message || 'Chart AI is unavailable right now. Please try again shortly.',
    },
    zones: {
      support: 'not_clear',
      resistance: 'not_clear',
      liquidity: 'not_clear',
    },
    trade_setup: {
      type: 'none',
      entry_zone: 'none',
      stop_loss: 'none',
      take_profit: 'none',
      risk_reward: 'none',
    },
    confidence: 0,
  };
}

/**
 * Single-pass disciplined chart analysis.
 *
 * Flow:
 * 1. Send image → AI (with the strict trader system prompt)
 * 2. AI returns structured JSON
 * 3. Backend validates rules (confidence < 70 → no_trade, RR < 1.5 → no_trade)
 * 4. Return ONE clean state: success | no_trade | invalid_image | ai_unavailable
 */
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
      return sendJson(res, 200, aiUnavailableResponse(input, 'Chart AI is not configured on the server.'));
    }

    // Preferred provider: Google Gemini Vision. Fallback: OpenRouter vision.
    let raw = null;
    let lastError = null;
    if (hasGemini) {
      try {
        raw = await callGeminiTraderWithFallback(imageBase64, mime, input.pair || 'unknown', 30000);
      } catch (error) {
        lastError = error;
        console.error('[Chart AI] Gemini pipeline failed, falling back to OpenRouter.', error);
      }
    }

    if (!raw && hasOpenRouter) {
      try {
        raw = await callOpenRouterTrader(imageBase64, mime, input.pair || 'unknown', 45000);
      } catch (error) {
        lastError = error;
        console.error('[Chart AI] OpenRouter fallback failed.', error);
      }
    }

    if (!raw) {
      console.error('[Chart AI] Provider failed:', lastError);
      const message = `Chart AI could not analyze the image. ${(lastError instanceof Error ? lastError.message : 'unknown provider error')}`;
      return sendJson(res, 200, aiUnavailableResponse(input, message));
    }

    const parsed = TradeAnalysisSchema.safeParse(raw);
    if (!parsed.success) {
      console.error('[Chart AI] Invalid AI shape:', parsed.error.flatten());
      return sendJson(res, 200, aiUnavailableResponse(input, 'Chart AI returned an invalid analysis shape.'));
    }

    // Normalize + enforce the backend validation layer.
    const normalized = enforceValidationRules(normalizeAnalysis(parsed.data));
    return sendJson(res, 200, normalized);
  } catch (error) {
    console.error('[Chart AI] Error:', error);
    return sendJson(res, 200, aiUnavailableResponse(input, `Chart AI failed: ${(error instanceof Error ? error.message : 'unknown error')}`));
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
const privacyTemplate = fs.existsSync(PRIVACY_TEMPLATE_PATH) ? fs.readFileSync(PRIVACY_TEMPLATE_PATH, 'utf-8') : null;
const termsTemplate = fs.existsSync(TERMS_TEMPLATE_PATH) ? fs.readFileSync(TERMS_TEMPLATE_PATH, 'utf-8') : null;
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
    if (pathname === '/api/strategy' && req.method !== 'POST') return sendJson(res, 405, { error: 'POST required.' });

    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || '/';
    }

    // Serve the privacy policy HTML template if requested
    if (pathname === '/privacy') {
      if (privacyTemplate) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(privacyTemplate);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Privacy policy not found.');
      return;
    }

    if (pathname === '/terms') {
      if (termsTemplate) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(termsTemplate);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Terms of use not found.');
      return;
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

