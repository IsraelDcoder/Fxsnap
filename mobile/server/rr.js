// Risk:Reward and price parsing utilities

function normalizeNumberString(s) {
  if (typeof s !== 'string') return null;
  // Replace unicode dash variants and commas used as thousands separators
  const cleaned = s.replace(/[‐–—−]/g, '-').replace(/[,\s]+/g, '').trim();
  return cleaned;
}

function parseRiskReward(value) {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'string') return null;
  const raw = normalizeNumberString(value);
  // Common formats: "1.8", "1:2", "1.8:1", "1/2", "RR=1.8"
  // Extract numeric tokens
  const colon = raw.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (colon) {
    const a = Number(colon[1]);
    const b = Number(colon[2]);
    if (a === 1 && b !== 0) return b;
    if (b === 1 && a !== 0) return a;
    if (a > 0) return b / a;
  }
  const slash = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    if (a === 1 && b !== 0) return b;
    if (b === 1 && a !== 0) return a;
    if (a > 0) return b / a;
  }
  const lone = raw.match(/(\d+(?:\.\d+)?)/);
  if (lone) return Number(lone[1]);
  return null;
}

function parsePriceOrRange(value) {
  if (typeof value === 'number') return { type: 'price', value };
  if (!value || typeof value !== 'string') return null;
  if (/^\s*[-−]\s*\d/.test(value)) return null;
  const raw = normalizeNumberString(value.replace(/[‐–—−]/g, '-'));
  // Try explicit hyphen-separated ranges first
  if (raw.includes('-')) {
    const parts = raw.split('-').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const a = Number(parts[0].match(/(\d+(?:\.\d+)?)/)?.[1]);
      const b = Number(parts[1].match(/(\d+(?:\.\d+)?)/)?.[1]);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) return { type: 'range', low: Math.min(a, b), high: Math.max(a, b), midpoint: (a + b) / 2 };
    }
  }
  const m = raw.match(/(\d+(?:\.\d+)?)[^0-9\.-]+(\d+(?:\.\d+)?)/);
  if (m) {
    const low = Number(m[1]);
    const high = Number(m[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) return { type: 'range', low: Math.min(low, high), high: Math.max(low, high), midpoint: (low + high) / 2 };
  }
  const num = raw.match(/(\d+(?:\.\d+)?)/);
  if (num && Number.isFinite(Number(num[1])) && Number(num[1]) > 0) return { type: 'price', value: Number(num[1]) };
  return null;
}

function computeRRFromLevels({ entry, sl, tp, direction, tickSize }) {
  const issues = [];
  const e = parsePriceOrRange(entry);
  const s = parsePriceOrRange(sl);
  const t = parsePriceOrRange(tp);
  if (!e || !s || !t) {
    issues.push('Non-numeric or missing price levels');
    return { rr: null, issues };
  }
  const entryLow = e.type === 'range' ? e.low : e.value;
  const entryHigh = e.type === 'range' ? e.high : e.value;
  const slLow = s.type === 'range' ? s.low : s.value;
  const slHigh = s.type === 'range' ? s.high : s.value;
  const tpLow = t.type === 'range' ? t.low : t.value;
  const tpHigh = t.type === 'range' ? t.high : t.value;

  if ([entryLow, entryHigh, slLow, slHigh, tpLow, tpHigh].some((price) => !Number.isFinite(price) || price <= 0)) {
    issues.push('Prices must be finite and greater than zero');
    return { rr: null, issues };
  }

  if (tickSize != null) {
    if (!Number.isFinite(tickSize) || tickSize <= 0) {
      issues.push('Instrument tick size must be finite and greater than zero');
      return { rr: null, issues };
    }
    const prices = [entryLow, entryHigh, slLow, slHigh, tpLow, tpHigh];
    if (prices.some((price) => Math.abs(price / tickSize - Math.round(price / tickSize)) > 1e-7)) {
      issues.push('A proposed price is not aligned to the instrument tick size');
      return { rr: null, issues };
    }
  }

  if (direction === 'buy') {
    const slDist = entryHigh - slLow;
    const tpDist = tpLow - entryHigh;
    if (slHigh >= entryLow) issues.push('Stop-loss zone is not entirely below entry for BUY');
    if (tpLow <= entryHigh) issues.push('Take-profit zone is not entirely above entry for BUY');
    if (slDist <= 0 || tpDist <= 0) return { rr: null, issues };
    if (issues.length) return { rr: null, issues };
    const rr = tpDist / slDist;
    return { rr, issues };
  }
  if (direction === 'sell') {
    const slDist = slHigh - entryLow;
    const tpDist = entryLow - tpHigh;
    if (slLow <= entryHigh) issues.push('Stop-loss zone is not entirely above entry for SELL');
    if (tpHigh >= entryLow) issues.push('Take-profit zone is not entirely below entry for SELL');
    if (slDist <= 0 || tpDist <= 0) return { rr: null, issues };
    if (issues.length) return { rr: null, issues };
    const rr = tpDist / slDist;
    return { rr, issues };
  }
  issues.push('Unknown direction');
  return { rr: null, issues };
}

module.exports = {
  parseRiskReward,
  parsePriceOrRange,
  computeRRFromLevels,
};
