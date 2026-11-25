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

function loadEnvFile() {
  const envPaths = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

loadEnvFile();

const { z } = require('zod');
const persistentStore = require('./persistentStore');
const { createCommunityApi } = require('./communityApi');
const { createEventSpacesApi } = require('./eventSpacesApi');
const { createSupportInboxApi } = require('./supportInboxApi');
const {
  createAuth,
  verifyAuth,
} = require('./auth');
const { getStaffAdminActor, getStaffAdminIds } = require('./staffAuth');
const { analyzeWithSingleRetry, callOpenRouterVision } = require('./singleSetupAnalysis');
const marketService = require('./marketService');
// Optional Twelve Data provider (server-side market data proxy)
let marketProvider = null;
try {
  const TwelveDataProvider = require('./twelvedataProvider');
  const tdKey = process.env.TWELVEDATA_API_KEY || null;
  if (tdKey && tdKey !== 'replace_with_twelvedata_api_key') {
    try {
      marketProvider = new TwelveDataProvider(tdKey);
      console.log('[market] Using Twelve Data provider for market data');
    } catch (e) {
      console.warn('[market] Twelve Data provider failed to initialize:', e && e.message ? e.message : e);
      marketProvider = null;
    }
  }
} catch (err) {
  // Not an error — provider module may not be present in some environments
}
const { buildInstrumentNewsResponse } = require('./newsService');
const { MarketNewsProvider } = require('./newsProvider');

let newsProvider = null;
let economicCalendarCache = null;
let economicCalendarFetchPromise = null;
const ECONOMIC_CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;
try {
  const finnhubApiKey = process.env.FINNHUB_API_KEY || null;
  const twelvedataApiKey = process.env.TWELVEDATA_API_KEY || null;
  newsProvider = new MarketNewsProvider({ finnhubApiKey, twelvedataApiKey });
  console.log('[news] Initialized calendar and configured news providers');
} catch (error) {
  console.warn('[news] Failed to initialize news providers:', error && error.message ? error.message : error);
}

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const PRIVACY_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'privacy-policy.html');
const TERMS_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'terms-of-use.html');
const STAFF_CONSOLE_TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'admin-console.html');
const STAFF_CONSOLE_SCRIPT_PATH = path.resolve(__dirname, 'templates', 'admin-console.js');
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
    'access-control-allow-headers': 'content-type, authorization, x-device-id, x-notification-secret, idempotency-key',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
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

function accountStorageKey(userId) {
  return `fxsnap:account:user:${userId}`;
}

function accountDataStorageKey(userId) {
  return `fxsnap:account:data:${userId}`;
}

function accountUserIdForDevice(deviceId) {
  return `device_${crypto.createHash('sha256').update(deviceId).digest('hex').slice(0, 32)}`;
}

async function touchAnonymousDevice(deviceId, accountId) {
  if (!persistentStore.supabaseEnabled) return;
  try {
    await persistentStore.touchAnonymousDevice(deviceId, accountId);
  } catch (error) {
    console.error('[Announcements] Anonymous device activity could not be recorded.', error?.message || 'Unknown error.');
  }
}

function publicAccountProfile(record) {
  return {
    userId: record.userId,
    provider: 'anonymous',
    displayName: record.displayName,
    pictureUrl: record.pictureUrl,
    communityUsername: record.communityUsername,
    status: 'active',
    createdAt: record.createdAt,
  };
}

async function getAnonymousAccountRecord(deviceId) {
  const userId = accountUserIdForDevice(deviceId);
  let record = await persistentStore.getJson(accountStorageKey(userId));
  if (!record) {
    record = {
      userId,
      displayName: '',
      pictureUrl: null,
      communityUsername: '',
      createdAt: new Date().toISOString(),
    };
    await persistentStore.setJson(accountStorageKey(userId), record);
  }
  return record;
}

async function getCommunityActor(req, res) {
  const deviceId = requireAuth(req, res);
  if (!deviceId) return null;
  if (!persistentStore.enabled) {
    sendJson(res, 503, { error: 'Community requires configured durable storage.' });
    return null;
  }
  const account = await getAnonymousAccountRecord(deviceId);
  return {
    accountId: account.userId,
    deviceId,
    supabaseUserId: null,
    displayName: typeof account.displayName === 'string' ? account.displayName : '',
    communityUsername: typeof account.communityUsername === 'string' ? account.communityUsername : '',
    pictureUrl: null,
  };
}

async function saveCommunityUsername(accountId, username) {
  const key = accountStorageKey(accountId);
  const account = await persistentStore.getJson(key);
  if (!account) throw new Error('The device profile could not be updated.');
  await persistentStore.setJson(key, { ...account, communityUsername: username });
}

async function handleAccountProfile(req, res) {
  const deviceId = requireAuth(req, res);
  if (!deviceId) return;
  if (!persistentStore.enabled) return sendJson(res, 503, { error: 'Device profile storage is unavailable.' });
  const account = await getAnonymousAccountRecord(deviceId);
  await touchAnonymousDevice(deviceId, account.userId);
  return sendJson(res, 200, { account: publicAccountProfile(account) });
}

async function handleAccountData(req, res) {
  const deviceId = requireAuth(req, res);
  if (!deviceId) return;
  if (!persistentStore.enabled) return sendJson(res, 503, { error: 'Device data storage is unavailable.' });
  const account = await getAnonymousAccountRecord(deviceId);
  const key = accountDataStorageKey(account.userId);
  if (req.method === 'GET') {
    const data = await persistentStore.getJson(key);
    return sendJson(res, 200, { data });
  }

  const input = z.object({ data: z.record(z.string(), z.unknown()) }).safeParse(await readJsonBody(req));
  if (!input.success || input.data.data.backupVersion !== 1) {
    return sendJson(res, 400, { error: 'A valid FXSnap data backup is required.' });
  }
  if (Buffer.byteLength(JSON.stringify(input.data.data), 'utf8') > 5_000_000) {
    return sendJson(res, 413, { error: 'This FXSnap backup is too large to sync.' });
  }

  const saved = {
    version: 1,
    updatedAt: new Date().toISOString(),
    data: input.data.data,
  };
  const displayName = input.data.data.settings?.displayName;
  await persistentStore.setJson(key, saved);
  if (typeof displayName === 'string' && displayName !== account.displayName) {
    await persistentStore.setJson(accountStorageKey(account.userId), { ...account, displayName: displayName.slice(0, 40) });
  }
  return sendJson(res, 200, { updatedAt: saved.updatedAt });
}

async function generateStrategy(req, res) {
  const deviceId = requireAuth(req, res);
  if (!deviceId) return;
  if (!(await requirePremiumSubscription(deviceId, res))) return;
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
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://fxsnap.vercel.app',
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

async function allowRequest(req, deviceId, limiterName, maximum = 30, windowSeconds = 60) {
  const identity = deviceId || req.socket.remoteAddress || 'unknown';
  const key = `fxsnap:rate:${limiterName}:${identity}`;
  const redisCount = await persistentStore.increment(key, windowSeconds);
  if (redisCount !== null) {
    if (redisCount <= maximum) return true;
    logRateLimitRejection(req, limiterName, redisCount, maximum, windowSeconds);
    return false;
  }
  const now = Date.now();
  const record = requestCounts.get(key) || { started: now, count: 0 };
  if (now - record.started > windowSeconds * 1000) { record.started = now; record.count = 0; }
  record.count += 1;
  requestCounts.set(key, record);
  if (record.count <= maximum) return true;
  logRateLimitRejection(req, limiterName, record.count, maximum, windowSeconds);
  return false;
}

function logRateLimitRejection(req, limiterName, count, maximum, windowSeconds) {
  const route = String(req.url || '/').split('?')[0];
  console.warn('[RateLimit] Request rejected.', {
    limiter: limiterName,
    route,
    status: 429,
    count,
    maximum,
    windowSeconds,
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function isSingleSetupAnalysisEnabled() {
  return process.env.FXSNAP_SINGLE_SETUP_ANALYSIS_ENABLED === 'true';
}

function getProviderSymbol(pair) {
  const compact = String(pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{6}$/.test(compact) ? `${compact.slice(0, 3)}/${compact.slice(3)}` : pair;
}

async function getLivePriceForPair(pair) {
  if (!marketProvider || typeof marketProvider.getQuote !== 'function') return null;
  let timer;
  try {
    const quote = await Promise.race([
      marketProvider.getQuote(getProviderSymbol(pair)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Live quote timed out.')), 6000);
      }),
    ]);
    const price = Number(quote?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      price,
      source: 'Twelve Data',
      timestamp: Number.isFinite(quote.timestamp) ? new Date(quote.timestamp).toISOString() : null,
    };
  } catch (error) {
    console.warn('[Chart Analysis] Live price unavailable; continuing with chart levels.', {
      pair,
      reason: error instanceof Error ? error.message : 'Quote provider failed.',
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function hasCompleteAnalysisSetup(setup) {
  return Boolean(setup
    && [setup.entry, setup.stop_loss, setup.take_profit_1, setup.risk_reward].every((value) => Number.isFinite(value))
    && Array.isArray(setup.support) && setup.support.length > 0
    && Array.isArray(setup.resistance) && setup.resistance.length > 0);
}

async function recordAnalysisMetrics({ status, retryCount, setup }) {
  const ttlSeconds = 60 * 60 * 24 * 30;
  const requests = await persistentStore.increment('fxsnap:analysis-v2:requests', ttlSeconds);
  const retried = retryCount > 0
    ? await persistentStore.increment('fxsnap:analysis-v2:retried', ttlSeconds)
    : await persistentStore.getCounter('fxsnap:analysis-v2:retried', ttlSeconds);
  const successes = status === 'success'
    ? await persistentStore.increment('fxsnap:analysis-v2:successes', ttlSeconds)
    : await persistentStore.getCounter('fxsnap:analysis-v2:successes', ttlSeconds);
  const missing = status === 'success' && !hasCompleteAnalysisSetup(setup)
    ? await persistentStore.increment('fxsnap:analysis-v2:missing', ttlSeconds)
    : await persistentStore.getCounter('fxsnap:analysis-v2:missing', ttlSeconds);

  if (Number.isFinite(successes) && successes > 0 && Number.isFinite(missing) && missing / successes > 0.02) {
    console.error('[Chart Analysis] Completeness alert: more than 2% of successes lack required setup fields.', {
      successes,
      missing,
      rate: missing / successes,
    });
  }
  if (Number.isFinite(requests) && requests > 0 && Number.isFinite(retried) && retried / requests > 0.1) {
    console.error('[Chart Analysis] Retry alert: more than 10% of requests required a retry.', {
      requests,
      retried,
      rate: retried / requests,
    });
  }
}

async function analyzeChart(req, res) {
  const imageId = crypto.randomBytes(12).toString('hex');
  let rawModelJson = null;
  let validationResult = { valid: false, reason: 'Request was not processed.' };
  let retryCount = 0;
  let outcome = 'error';
  let setup;

  try {
    const deviceId = requireAuth(req, res);
    if (!deviceId) return;
    if (!(await allowRequest(req, deviceId, 'chart_analysis'))) {
      return sendJson(res, 429, { status: 'error', message: 'Too many requests. Try again shortly.' });
    }

    let input;
    try {
      input = await readJsonBody(req);
    } catch (error) {
      validationResult = { valid: false, reason: 'Invalid JSON request body.' };
      return sendJson(res, 400, { status: 'error', message: error.message || 'Invalid JSON body.' });
    }
    const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : '';
    const mimeType = typeof input.mimeType === 'string' ? input.mimeType : 'image/jpeg';
    const pair = typeof input.pair === 'string' ? input.pair.trim() : '';
    const timeframe = typeof input.timeframe === 'string' ? input.timeframe.trim() : '';
    if (!imageBase64 || imageBase64.length < 100 || imageBase64.length > 10_000_000
      || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
      || !pair || !timeframe) {
      validationResult = { valid: false, reason: 'A supported chart image, selected pair, and timeframe are required.' };
      return sendJson(res, 400, {
        status: 'error',
        message: 'A chart image, selected pair, and timeframe are required.',
      });
    }

    if (!isSingleSetupAnalysisEnabled()) {
      validationResult = { valid: false, reason: 'FXSNAP_SINGLE_SETUP_ANALYSIS_ENABLED is not true.' };
      return sendJson(res, 503, { status: 'error', message: 'Chart analysis is currently disabled.' });
    }
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.startsWith('replace_')) {
      validationResult = { valid: false, reason: 'OpenRouter is not configured.' };
      return sendJson(res, 503, { status: 'error', message: 'Chart analysis is not configured on the server.' });
    }

    let usesFreeAnalysis = false;
    if (!isDevelopmentAnalysisPremiumBypassEnabled()) {
      const premium = await getRevenueCatPremiumStatus(deviceId);
      if (premium === null) {
        validationResult = { valid: false, reason: 'Subscription verification failed.' };
        return sendJson(res, 503, { status: 'error', message: 'Unable to verify your subscription. Please try again.' });
      }
      if (!premium) {
        const used = await persistentStore.getCounter(`fxsnap:free-analysis:${deviceId}`, 60 * 60 * 24 * 3650);
        if (used >= 1) {
          validationResult = { valid: false, reason: 'Free chart analysis was already used.' };
          return sendJson(res, 402, {
            code: 'PREMIUM_REQUIRED',
            error: 'premium_required',
            message: 'Your free chart analysis has been used. Subscribe to FXSnap Pro to run another analysis.',
          });
        }
        usesFreeAnalysis = true;
      }
    }

    const livePrice = await getLivePriceForPair(pair);
    const result = await analyzeWithSingleRetry({
      requestModel: callOpenRouterVision,
      imageBase64,
      mimeType,
      pair,
      timeframe,
      livePrice,
    });
    rawModelJson = result.rawModelJson;
    validationResult = result.validationResult;
    retryCount = result.retryCount;

    if (result.status === 'not_a_chart') {
      outcome = 'not_a_chart';
      return sendJson(res, 200, result.data);
    }
    if (result.status !== 'success') {
      validationResult = { ...validationResult, valid: false };
      return sendJson(res, 422, { status: 'error', message: result.message });
    }

    setup = result.data;
    if (usesFreeAnalysis) {
      await persistentStore.increment(`fxsnap:free-analysis:${deviceId}`, 60 * 60 * 24 * 3650);
    }
    outcome = 'success';
    return sendJson(res, 200, setup);
  } catch (error) {
    validationResult = {
      valid: false,
      reason: error instanceof Error ? error.message : 'Chart analysis failed.',
    };
    return sendJson(res, 500, {
      status: 'error',
      message: "Couldn't generate a valid setup, try again",
    });
  } finally {
    console.info('[Chart Analysis] Request completed.', {
      imageId,
      rawModelJson,
      validationResult,
      retryCount,
      outcome,
    });
    try {
      await recordAnalysisMetrics({ status: outcome, retryCount, setup });
    } catch (error) {
      console.error('[Chart Analysis] Monitoring persistence failed.', {
        imageId,
        reason: error instanceof Error ? error.message : 'Unknown monitoring error.',
      });
    }
  }
}

async function receiveEvent(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  if (!(await allowRequest(req, deviceId, 'analytics'))) return sendJson(res, 429, { error: 'Too many requests.' });
  try {
    const body = await readJsonBody(req);
    const events = Array.isArray(body.events) ? body.events : [body];
    if (events.length < 1 || events.length > 50
      || events.some((event) => !event || typeof event.name !== 'string' || event.name.length > 80)) {
      return sendJson(res, 400, { error: 'Invalid event batch.' });
    }

    const storedEvents = [];
    for (const event of events) {
      const occurredAt = event.occurredAt || new Date().toISOString();
      const date = new Date(occurredAt);
      if (!Number.isFinite(date.getTime())) return sendJson(res, 400, { error: 'Invalid event timestamp.' });
      const eventId = typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 120
        ? event.id
        : undefined;
      storedEvents.push({
        id: eventId,
        dedupeId: eventId ? `${deviceId}:${eventId}` : undefined,
        deviceId,
        name: event.name,
        properties: event.properties || {},
        occurredAt: date.toISOString(),
      });
    }

    const eventsByDay = new Map();
    for (const event of storedEvents) {
      const bucketDay = event.occurredAt.slice(0, 10);
      const bucket = eventsByDay.get(bucketDay) || [];
      bucket.push(event);
      eventsByDay.set(bucketDay, bucket);
    }
    try {
      await Promise.all(Array.from(eventsByDay, ([day, dayEvents]) => (
        persistentStore.appendJson(`fxsnap:events:${day}`, dayEvents, 10000, 60 * 60 * 24 * 8)
      )));
    } catch (error) {
      console.error('[Telemetry] Event persistence failed:', error instanceof Error ? error.message : 'Unknown storage error.');
      return sendJson(res, 503, { error: 'Event persistence failed.' });
    }
    return sendJson(res, 204, {});
  } catch (error) { return sendJson(res, 400, { error: error.message }); }
}

function getRevenueCatEntitlementCandidates() {
  const configured = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';
  return Array.from(new Set([
    configured,
    'premium',
    'Premium',
    'Pro',
    'pro',
  ].filter(Boolean))).map((value) => value.trim());
}

async function getEntitlement(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  const entitlementIds = getRevenueCatEntitlementCandidates();
  if (!secret || secret.startsWith('replace_')) return sendJson(res, 503, { error: 'RevenueCat server verification is not configured.' });
  try {
    const response = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`, { headers: { authorization: `Bearer ${secret}` } });
    const payload = await response.json();
    if (!response.ok) return sendJson(res, 502, { error: 'RevenueCat entitlement lookup failed.' });
    const entitlements = payload.subscriber?.entitlements ?? {};
    const matchingEntitlement = entitlementIds
      .map((entitlementId) => entitlements[entitlementId])
      .find(Boolean);
    const expiresAt = matchingEntitlement?.expires_date ? Date.parse(matchingEntitlement.expires_date) : null;
    const active = Boolean(matchingEntitlement && (!expiresAt || expiresAt > Date.now()));
    return sendJson(res, 200, { active, expiresAt: matchingEntitlement?.expires_date || null, store: matchingEntitlement?.store || null, entitlementId: matchingEntitlement?.identifier || null });
  } catch (error) { return sendJson(res, 504, { error: error.name === 'AbortError' ? 'RevenueCat lookup timed out.' : 'RevenueCat lookup failed.' }); }
}

function isDevelopmentAnalysisPremiumBypassEnabled() {
  return process.env.FXSNAP_DEV_ANALYSIS_PREMIUM_BYPASS === 'true'
    && process.env.NODE_ENV === 'development';
}

async function getRevenueCatPremiumStatus(deviceId) {
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  const entitlementIds = getRevenueCatEntitlementCandidates();
  if (!secret || secret.startsWith('replace_')) return null;
  try {
    const response = await fetchWithTimeout(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(deviceId)}`, { headers: { authorization: `Bearer ${secret}` } });
    if (!response.ok) return null;
    const payload = await response.json();
    const entitlements = payload.subscriber?.entitlements ?? {};
    const matchingEntitlement = entitlementIds
      .map((entitlementId) => entitlements[entitlementId])
      .find(Boolean);
    const expiresAt = matchingEntitlement?.expires_date ? Date.parse(matchingEntitlement.expires_date) : null;
    return Boolean(matchingEntitlement && (!expiresAt || expiresAt > Date.now()));
  } catch {
    return null;
  }
}

async function requirePremiumSubscription(deviceId, res, allowDevelopmentAnalysisBypass = false) {
  if (allowDevelopmentAnalysisBypass && isDevelopmentAnalysisPremiumBypassEnabled()) return true;
  const active = await getRevenueCatPremiumStatus(deviceId);
  if (active === true) return true;
  if (active === false) {
    sendJson(res, 402, {
      code: 'PREMIUM_REQUIRED',
      error: 'premium_required',
      message: 'An active subscription is required to use this feature.',
    });
  } else {
    sendJson(res, 503, {
      code: 'SUBSCRIPTION_VERIFICATION_UNAVAILABLE',
      error: 'subscription_verification_unavailable',
      message: 'Your subscription could not be verified. Please try again.',
    });
  }
  return false;
}

async function getAnalysisAccess(req, res) {
  const deviceId = requireAuth(req, res); if (!deviceId) return;
  if (isDevelopmentAnalysisPremiumBypassEnabled()) return sendJson(res, 200, { canAnalyze: true });
  const premium = await getRevenueCatPremiumStatus(deviceId);
  if (premium === null) return sendJson(res, 503, { error: 'Unable to verify your subscription.' });
  const freeAnalysisUsed = await persistentStore.getCounter(`fxsnap:free-analysis:${deviceId}`, 60 * 60 * 24 * 3650);
  return sendJson(res, 200, { canAnalyze: premium || freeAnalysisUsed < 1 });
}

function getPaywallRemoteConfig(req, res) {
  const configuredCount = Number(process.env.FXSNAP_TRADER_COUNT);
  const configuredRating = Number(process.env.FXSNAP_GOOGLE_PLAY_RATING);
  const configuredRatingCount = Number(process.env.FXSNAP_GOOGLE_PLAY_RATING_COUNT);
  let testimonials = [];
  try {
    const parsed = JSON.parse(process.env.FXSNAP_PAYWALL_TESTIMONIALS_JSON || '[]');
    if (Array.isArray(parsed)) {
      testimonials = parsed
        .filter((item) => item && typeof item.quote === 'string' && item.quote.trim() && typeof item.attribution === 'string' && item.attribution.trim())
        .slice(0, 2)
        .map((item) => ({ quote: item.quote.trim().slice(0, 220), attribution: item.attribution.trim().slice(0, 60) }));
    }
  } catch {}
  return sendJson(res, 200, {
    traderCount: Number.isInteger(configuredCount) && configuredCount > 0 ? configuredCount : null,
    googlePlayRating: configuredRating >= 1 && configuredRating <= 5 && configuredRatingCount > 0 ? configuredRating : null,
    googlePlayRatingCount: configuredRating >= 1 && configuredRating <= 5 && configuredRatingCount > 0 ? configuredRatingCount : null,
    testimonials,
  });
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
const staffConsoleTemplate = fs.readFileSync(STAFF_CONSOLE_TEMPLATE_PATH, 'utf-8');
const staffConsoleScript = fs.readFileSync(STAFF_CONSOLE_SCRIPT_PATH, 'utf-8');
const appName = getAppName();

function createRequestHandler() {
  const handleSupportInboxRequest = createSupportInboxApi({
    getActor: async (req, res) => {
      const pathname = String(req.url || '').split('?')[0];
      const actor = pathname.startsWith('/api/admin/support/')
        ? await getStaffAdminActor(req, res, { sendJson })
        : await getCommunityActor(req, res);
      if (!actor) return null;
      return { ...actor, isAdmin: actor.isAdmin || getStaffAdminIds(process.env).has(String(actor.supabaseUserId || '').toLowerCase()) };
    },
    sendJson,
    readJsonBody,
    getPremiumStatus: getRevenueCatPremiumStatus,
    notifyAdmins: () => require('./notificationService').sendSupportInboxNotification(),
    notifyMember: (accountId) => require('./notificationService').sendSupportReplyNotification(accountId),
  });
  const handleEventSpacesRequest = createEventSpacesApi({
    getActor: async (req, res) => {
      const pathname = String(req.url || '').split('?')[0];
      const actor = pathname.startsWith('/api/admin/event-spaces')
        ? await getStaffAdminActor(req, res, { sendJson })
        : await getCommunityActor(req, res);
      if (!actor) return null;
      return {
        ...actor,
        displayName: actor.displayName,
        isAdmin: actor.isAdmin || getStaffAdminIds(process.env).has(String(actor.supabaseUserId || '').toLowerCase()),
      };
    },
    sendJson,
    readJsonBody,
  });
  const handleCommunityRequest = createCommunityApi({
    getActor: (req, res) => {
      const pathname = String(req.url || '').split('?')[0];
      return pathname.startsWith('/api/admin/')
        ? getStaffAdminActor(req, res, { sendJson })
        : getCommunityActor(req, res);
    },
    sendJson,
    readJsonBody,
    saveCommunityUsername,
    requirePremiumSubscription: (deviceId, res) => requirePremiumSubscription(deviceId, res),
  });
  return (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    let pathname = url.pathname;

    if (req.method === 'OPTIONS') return sendJson(res, 204, {});
    if (pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { status: 'ok', service: 'fxsnap' });
    if (pathname === '/api/admin/auth-config' && req.method === 'GET') {
      const supabaseUrl = String(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '');
      const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
      if (!supabaseUrl || !publicKey) return sendJson(res, 503, { error: 'The staff console sign-in is not configured.' });
      return sendJson(res, 200, { supabaseUrl, publicKey });
    }
    if ((pathname === '/admin-console' || pathname === '/admin-console/') && req.method === 'GET') {
      const supabaseUrl = String(process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL || '');
      let supabaseOrigin = 'https://*.supabase.co';
      try { supabaseOrigin = new URL(supabaseUrl).origin; } catch {}
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${supabaseOrigin}; img-src 'self' data: https:; form-action 'self' ${supabaseOrigin}; base-uri 'none'; frame-ancestors 'none'; object-src 'none'`,
      });
      return res.end(staffConsoleTemplate);
    }
    if (pathname === '/admin-console' || pathname === '/admin-console/') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET' });
      return res.end('GET required.');
    }
    if (pathname === '/admin-console.js' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      return res.end(staffConsoleScript);
    }
    if (pathname.startsWith('/api/support/') || pathname.startsWith('/api/admin/support/')) {
      return Promise.resolve(handleSupportInboxRequest(req, res, url)).then((handled) => (
        handled === false ? sendJson(res, 404, { error: 'Support endpoint not found.' }) : undefined
      ));
    }
    if (pathname === '/api/session' && req.method === 'POST') {
      return readJsonBody(req).then((body) => {
        const deviceId = String(body.deviceId || '');
        if (!/^[a-zA-Z0-9_-]{16,128}$/.test(deviceId)) return sendJson(res, 400, { error: 'Invalid device identity.' });
        return sendJson(res, 200, { token: createAuth(AUTH_SECRET, deviceId), expiresIn: 30 * 24 * 60 * 60 });
      }).catch((error) => sendJson(res, 400, { error: error.message }));
    }
    if (pathname === '/api/account/data' && (req.method === 'GET' || req.method === 'POST')) {
      return handleAccountData(req, res).catch((error) => {
        console.error('[Account] Device data sync failed.', error?.name || 'Unknown error');
        return sendJson(res, 500, { error: 'Unable to sync your device data.' });
      });
    }
    if (pathname === '/api/account' && req.method === 'GET') {
      return handleAccountProfile(req, res).catch((error) => {
        console.error('[Account] Device profile lookup failed.', error?.name || 'Unknown error');
        return sendJson(res, 500, { error: 'Unable to load this device profile.' });
      });
    }

    if (pathname.startsWith('/api/events/spaces') || pathname.startsWith('/api/admin/event-spaces')) {
      return handleEventSpacesRequest(req, res, url);
    }

    if (pathname.startsWith('/api/community/')
      || pathname.startsWith('/api/admin/community/')
      || pathname.startsWith('/api/system-announcements')
      || pathname.startsWith('/api/admin/system-announcements')) {
      return handleCommunityRequest(req, res, url);
    }

    if (pathname === '/api/push-token' && (req.method === 'POST' || req.method === 'DELETE')) {
      const deviceId = requireAuth(req, res);
      if (!deviceId) return;
      if (!persistentStore.supabaseEnabled) return sendJson(res, 503, { error: 'Push notifications require Supabase storage.' });
      const notifications = require('./notificationService');
      const removeRegistration = () => notifications.unregisterPushToken(deviceId)
        .then(() => sendJson(res, 200, { registered: false }))
        .catch((error) => sendJson(res, 500, { error: error.message }));
      if (req.method === 'DELETE') return removeRegistration();
      const register = async () => {
        const body = await readJsonBody(req);
        if (typeof body.token !== 'string' || typeof body.platform !== 'string') {
          return sendJson(res, 400, { error: 'A push token and platform are required.' });
        }
        const account = await getAnonymousAccountRecord(deviceId);
        await notifications.registerPushToken(deviceId, {
          ...body,
          accountId: account.userId,
          supabaseUserId: null,
        });
        await touchAnonymousDevice(deviceId, account.userId);
        return sendJson(res, 200, { registered: true });
      };
      return register()
        .catch((error) => sendJson(res, 400, { error: error.message }));
    }
    if (pathname === '/api/notifications/paywall-reminders' && req.method === 'POST') {
      const deviceId = requireAuth(req, res);
      if (!deviceId) return;
      if (!persistentStore.supabaseEnabled) return sendJson(res, 503, { error: 'Push reminders require Supabase storage.' });
      const notifications = require('./notificationService');
      return allowRequest(req, deviceId, 'paywall_reminders')
        .then((allowed) => {
          if (!allowed) return sendJson(res, 429, { error: 'Too many requests.' });
          return notifications.startPaywallReminderSequence(deviceId)
            .then((scheduled) => sendJson(res, 200, { scheduled }));
        })
        .catch((error) => sendJson(res, 500, { error: error.message || 'Could not schedule paywall reminders.' }));
    }
    if (pathname === '/api/notifications/dispatch' && req.method === 'POST') {
      if (!persistentStore.supabaseEnabled) return sendJson(res, 503, { error: 'Push notifications require Supabase storage.' });
      const secret = process.env.NOTIFICATION_CRON_SECRET || '';
      const supplied = String(req.headers['x-notification-secret'] || '');
      if (!secret || secret.startsWith('replace_') || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
        return sendJson(res, 401, { error: 'Invalid notification dispatch credential.' });
      }
      const notifications = require('./notificationService');
      return Promise.all([
        notifications.sendScheduledCampaigns(new Date(), getRevenueCatPremiumStatus),
        notifications.sendPaywallReminderSequences(new Date(), getRevenueCatPremiumStatus),
        notifications.dispatchCommunityPushNotifications(),
      ])
        .then(([campaigns, paywallReminders, community]) => ({ campaigns, paywallReminders, community }))
        .then((result) => sendJson(res, 200, result))
        .catch((error) => sendJson(res, 500, { error: error.message || 'Notification dispatch failed.' }));
    }

    if (pathname === '/api/strategy' && req.method === 'POST') return generateStrategy(req, res);
    if (pathname === '/api/support-chat') return sendJson(res, 410, { error: 'The automated support chat has been retired. Use the private in-app support conversation.' });
    // Market endpoints (demo/skeleton)
    if (pathname === '/market/quotes' && req.method === 'GET') {
      const symbolsParam = url.searchParams.get('symbols') || '';
      const symbols = symbolsParam ? symbolsParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      const source = marketProvider || marketService;
      return Promise.resolve(source.getQuotes(symbols)).then((quotes) => sendJson(res, 200, { quotes, dataSource: marketProvider ? 'provider' : 'simulated' })).catch((err) => sendJson(res, 500, { error: err.message }));
    }
    if (pathname === '/market/calendar' && req.method === 'GET') {
      const forceRefresh = url.searchParams.has('refresh');
      res.setHeader('cache-control', forceRefresh ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=300');
      const calendarAvailable = Boolean(newsProvider?.providers?.some((provider) => typeof provider.getEconomicCalendar === 'function'));
      if (!calendarAvailable) return sendJson(res, 200, { events: [], dataSource: 'unavailable', updatedAt: null });
      if (!forceRefresh && economicCalendarCache && Date.now() - economicCalendarCache.fetchedAt < ECONOMIC_CALENDAR_CACHE_TTL_MS) {
        return sendJson(res, 200, {
          events: economicCalendarCache.events,
          dataSource: economicCalendarCache.source,
          updatedAt: new Date(economicCalendarCache.fetchedAt).toISOString(),
        });
      }
      if (!economicCalendarFetchPromise) {
        economicCalendarFetchPromise = newsProvider.getEconomicCalendar()
          .then((calendar) => {
            economicCalendarCache = { ...calendar, fetchedAt: Date.now() };
            return economicCalendarCache;
          });
      }
      const pendingCalendarFetch = economicCalendarFetchPromise;
      return pendingCalendarFetch
        .then((calendar) => sendJson(res, 200, {
          events: calendar.events,
          dataSource: calendar.source,
          updatedAt: new Date(calendar.fetchedAt).toISOString(),
        }))
        .catch((error) => sendJson(res, 502, { error: error.message || 'Unable to load economic calendar.' }))
        .finally(() => {
          if (economicCalendarFetchPromise === pendingCalendarFetch) economicCalendarFetchPromise = null;
        });
    }
    if (pathname === '/market/metrics' && req.method === 'GET') {
      try {
        const marketBroker = require('./marketBroker');
        const metrics = marketBroker.getMetrics ? marketBroker.getMetrics() : { error: 'metrics unavailable' };
        return sendJson(res, 200, { metrics });
      } catch (e) {
        return sendJson(res, 500, { error: 'metrics unavailable' });
      }
    }
    if (pathname === '/market/candles' && req.method === 'GET') {
      const symbol = url.searchParams.get('symbol');
      const interval = url.searchParams.get('interval') || '1min';
      const limit = Math.min(500, Number(url.searchParams.get('limit') || '100'));
      if (!symbol) return sendJson(res, 400, { error: 'symbol required' });
      const source = marketProvider || marketService;
      return Promise.resolve(source.getCandles(symbol, interval, limit)).then((candles) => sendJson(res, 200, { symbol, interval, candles, dataSource: marketProvider ? 'provider' : 'simulated' })).catch((err) => sendJson(res, 500, { error: err.message }));
    }
    if (pathname === '/market/news' && req.method === 'GET') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      if (!symbol) return sendJson(res, 400, { error: 'symbol required' });
      return (async () => {
        try {
          if (newsProvider) {
            const articles = await newsProvider.getNewsForInstrument(symbol);
            const events = await newsProvider.getUpcomingEvents(symbol);
            return sendJson(res, 200, buildInstrumentNewsResponse(symbol, { articles, events }));
          }

          const fallback = buildInstrumentNewsResponse(symbol, {
            articles: [
              { id: 'macro-boe-1', title: 'Bank of England policy tone remains key for GBP', summary: 'BoE officials continue to weigh inflation and wage pressure versus growth risks.', source: 'Reuters', publishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), currencies: ['GBP', 'USD'], category: 'central-bank', impact: 'MEDIUM' },
              { id: 'macro-fed-1', title: 'Federal Reserve focus stays on inflation and rates', summary: 'Investors remain focused on inflation and policy guidance, which influences the USD backdrop.', source: 'Bloomberg', publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), currencies: ['USD'], category: 'inflation', impact: 'HIGH' },
              { id: 'gold-fed-1', title: 'Fed path and yields remain central to gold pricing', summary: 'Gold is sensitive to the US rates outlook and calmer risk sentiment.', source: 'MarketWatch', publishedAt: new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString(), currencies: ['USD'], category: 'commodity', impact: 'MEDIUM' },
            ],
            events: [
              { id: 'uk-cpi-1', title: 'UK CPI release', date: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(), impact: 'HIGH', currency: 'GBP', country: 'United Kingdom' },
              { id: 'fed-rate-1', title: 'FOMC rate decision', date: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(), impact: 'HIGH', currency: 'USD', country: 'United States' },
            ],
          });
          return sendJson(res, 200, fallback);
        } catch (error) {
          return sendJson(res, 500, { error: error.message || 'Unable to load news.' });
        }
      })();
    }
    if (pathname === '/market/events' && req.method === 'GET') {
      const symbol = String(url.searchParams.get('symbol') || '').trim();
      if (!symbol) return sendJson(res, 400, { error: 'symbol required' });
      return (async () => {
        try {
          if (newsProvider) {
            const events = await newsProvider.getUpcomingEvents(symbol);
            return sendJson(res, 200, { symbol, events });
          }

          const fallback = buildInstrumentNewsResponse(symbol, {
            articles: [],
            events: [
              { id: 'uk-cpi-1', title: 'UK CPI release', date: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(), impact: 'HIGH', currency: 'GBP', country: 'United Kingdom' },
              { id: 'fed-rate-1', title: 'FOMC rate decision', date: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(), impact: 'HIGH', currency: 'USD', country: 'United States' },
            ],
          });
          return sendJson(res, 200, { symbol, events: fallback.events });
        } catch (error) {
          return sendJson(res, 500, { error: error.message || 'Unable to load events.' });
        }
      })();
    }
    if (pathname === '/market/daily-brief' && req.method === 'GET') {
      return sendJson(res, 410, { error: 'The market-news daily brief has been replaced by FXSnap Daily Brief educational content.' });
    }
    if (pathname === '/market/stream' && req.method === 'GET') {
      // optional ?symbols=SYM1,SYM2 - SSE stream of ticks
      const symbolsParam = url.searchParams.get('symbols') || '';
      const symbols = symbolsParam ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined;
      // Simple auth: allow if auth header present and valid; otherwise allow demo access
      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      // If token is provided validate it, otherwise continue as anonymous demo stream
      if (token) {
        const principal = verifyAuth(AUTH_SECRET, token);
        if (!principal) return sendJson(res, 401, { error: 'invalid token' });
      }
      // Use broker which multiplexes provider (Twelve Data) or falls back to simulator
      try {
        const marketBroker = require('./marketBroker');
        return marketBroker.attachSSE(req, res, symbols);
      } catch (e) {
        // fallback to legacy
        return marketService.attachSSE(req, res, symbols);
      }
    }
    if ((pathname === '/api/chart-analysis' || pathname === '/analyze-chart') && req.method === 'POST') return analyzeChart(req, res);
    if (pathname === '/api/events' && req.method === 'POST') return receiveEvent(req, res);
    if (pathname === '/api/analysis-access' && req.method === 'GET') return getAnalysisAccess(req, res);
    if (pathname === '/api/paywall-config' && req.method === 'GET') return getPaywallRemoteConfig(req, res);
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
