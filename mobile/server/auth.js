const crypto = require('crypto');

function createAuth(secret, deviceId, ttlMs = 30 * 24 * 60 * 60 * 1000, freeAnalysisId = deviceId) {
  const payload = Buffer.from(JSON.stringify({ sub: deviceId, freeSub: freeAnalysisId, exp: Date.now() + ttlMs })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeAuth(secret, token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (decoded.exp <= Date.now() || typeof decoded.sub !== 'string') return null;
    return decoded;
  } catch { return null; }
}

function verifyAuth(secret, token) {
  return decodeAuth(secret, token)?.sub || null;
}

function verifyFreeAnalysisIdentity(secret, token) {
  const decoded = decodeAuth(secret, token);
  return typeof decoded?.freeSub === 'string' ? decoded.freeSub : null;
}

module.exports = { createAuth, verifyAuth, verifyFreeAnalysisIdentity };
