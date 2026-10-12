const crypto = require('crypto');

function signPayload(secret, payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function decodePayload(secret, token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (decoded.exp <= Date.now()) return null;
    return decoded;
  } catch { return null; }
}

function createAuth(secret, deviceId, ttlMs = 30 * 24 * 60 * 60 * 1000, freeAnalysisId = deviceId) {
  return signPayload(secret, { sub: deviceId, freeSub: freeAnalysisId, exp: Date.now() + ttlMs });
}

function decodeAuth(secret, token) {
  const decoded = decodePayload(secret, token);
  if (!decoded || decoded.scope === 'account' || typeof decoded.sub !== 'string') return null;
  return decoded;
}

function createAccountAuth(secret, userId, deviceId, sessionId, ttlMs = 30 * 24 * 60 * 60 * 1000) {
  return signPayload(secret, {
    sub: userId,
    deviceSub: deviceId,
    sid: sessionId,
    scope: 'account',
    exp: Date.now() + ttlMs,
  });
}

function decodeAccountAuth(secret, token) {
  const decoded = decodePayload(secret, token);
  if (!decoded || decoded.scope !== 'account'
    || typeof decoded.sub !== 'string' || typeof decoded.deviceSub !== 'string'
    || typeof decoded.sid !== 'string') return null;
  return decoded;
}

function verifyAuth(secret, token) {
  return decodeAuth(secret, token)?.sub || null;
}

function verifyFreeAnalysisIdentity(secret, token) {
  const decoded = decodeAuth(secret, token);
  return typeof decoded?.freeSub === 'string' ? decoded.freeSub : null;
}

module.exports = {
  createAuth,
  createAccountAuth,
  decodeAuth,
  decodeAccountAuth,
  verifyAuth,
  verifyFreeAnalysisIdentity,
};
