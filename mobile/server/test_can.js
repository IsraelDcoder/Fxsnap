const fs = require('fs');
const path = require('path');
const vm = require('vm');
const serverPath = path.join(process.cwd(), 'server', 'serve.js');
const code = fs.readFileSync(serverPath, 'utf8');
const sandbox = {
  nativeRequire: require,
  console,
  Buffer,
  process,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  __dirname: path.dirname(serverPath),
  __filename: serverPath,
};
sandbox.globalThis = { require: (id) => sandbox.require(id) };
sandbox.require = (id) => {
  if (id === './persistentStore') return {};
  if (id === './auth') return { createAuth: () => 'token', verifyAuth: () => 'device' };
  if (id === './tradingSessions') return { buildSessionContext: () => 'context' };
  return sandbox.nativeRequire(id);
};
const context = vm.createContext(sandbox);
const wrapper = 'const module={exports:{}}; const exports=module.exports; const require = globalThis.require;' + code + '; module.exports={canonicalizeRawAnalysis,TradeAnalysisSchema};';
vm.runInContext(wrapper, context, { timeout: 5000 });
const { canonicalizeRawAnalysis, TradeAnalysisSchema } = context.module.exports;
const sample = {
  status: 'success',
  analysis: {
    trend: 'Bullish',
    structure: 'Higher highs',
    volatility: 'Moderate',
    volume: 'not visible',
    sentiment: 'Bullish',
    indicators: 'none',
    notes: 'Looks good',
  },
  zones: {
    support: '1.10',
    resistance: '1.12',
    liquidity: 'above',
  },
  trade_setup: {
    type: 'long',
    entry_zone: '1.1050',
    stop_loss: '1.0980',
    take_profit: '1.1250',
    risk_reward: '2.5',
  },
  confidence: '85',
};
const canon = canonicalizeRawAnalysis(sample);
console.log('canonicalized:', JSON.stringify(canon, null, 2));
const parsed = TradeAnalysisSchema.safeParse(canon);
console.log('schema_valid:', parsed.success);
if (!parsed.success) console.log(JSON.stringify(parsed.error.flatten(), null, 2));
