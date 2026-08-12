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
  const raw = value.replace(/[‐–—−]/g, '-').trim();
  // Try explicit hyphen-separated ranges first
  if (raw.includes('-')) {
    const parts = raw.split('-').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const a = Number(parts[0].match(/(\d+(?:\.\d+)?)/)?.[1]);
      const b = Number(parts[1].match(/(\d+(?:\.\d+)?)/)?.[1]);
      if (!Number.isNaN(a) && !Number.isNaN(b)) return { type: 'range', low: Math.min(a, b), high: Math.max(a, b), midpoint: (a + b) / 2 };
    }
  }
  const m = raw.match(/(\d+(?:\.\d+)?)[^0-9\.-]+(\d+(?:\.\d+)?)/);
  if (m) {
    const low = Number(m[1]);
    const high = Number(m[2]);
    if (!Number.isNaN(low) && !Number.isNaN(high)) return { type: 'range', low: Math.min(low, high), high: Math.max(low, high), midpoint: (low + high) / 2 };
  }
  const num = raw.match(/(\d+(?:\.\d+)?)/);
  if (num) return { type: 'price', value: Number(num[1]) };
  return null;
}

function computeRRFromLevels({ entry, sl, tp, direction }) {
  const issues = [];
  const e = parsePriceOrRange(entry);
  const s = parsePriceOrRange(sl);
  const t = parsePriceOrRange(tp);
  if (!e || !s || !t) {
    issues.push('Non-numeric or missing price levels');
    return { rr: null, issues };
  }
  const entryVal = e.type === 'range' ? e.midpoint : e.value;
  const slVal = s.type === 'range' ? s.midpoint : s.value;
  const tpVal = t.type === 'range' ? t.midpoint : t.value;
  if (direction === 'buy') {
    const slDist = entryVal - slVal;
    const tpDist = tpVal - entryVal;
    if (slDist <= 0) issues.push('Stop-loss is not below entry for BUY');
    if (tpDist <= 0) issues.push('Take-profit is not above entry for BUY');
    if (slDist <= 0 || tpDist <= 0) return { rr: null, issues };
    const rr = tpDist / slDist;
    return { rr, issues };
  }
  if (direction === 'sell') {
    const slDist = slVal - entryVal;
    const tpDist = entryVal - tpVal;
    if (slDist <= 0) issues.push('Stop-loss is not above entry for SELL');
    if (tpDist <= 0) issues.push('Take-profit is not below entry for SELL');
    if (slDist <= 0 || tpDist <= 0) return { rr: null, issues };
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
