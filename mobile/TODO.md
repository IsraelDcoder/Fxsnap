# FXSnap: Strict Price-Action AI + Remove Alpha Vantage

## Steps
- [x] 1. serve.js: add trader system prompt + strict output Zod schema + single-pass AI chart analysis
- [x] 2. serve.js: add validation layer (confidence < 70 → no_trade, RR < 1.5 → no_trade)
- [x] 3. serve.js: remove Alpha Vantage / /api/market-data entirely
- [x] 4. services/marketData.ts: delete live market data service
- [x] 5. services/backtest.ts: self-contain CandleData/TrendAnalysis types (remove marketData import)
- [x] 6. tests/backtest.test.ts: update import (no longer references marketData)
- [x] 7. services/chartDetection.ts: rewrite to analyzeChartImage() with clean 4-state result
- [ ] 8. app/analysis.tsx: new flow (no live data, no manual mode fallback)
- [ ] 9. context/AppContext.tsx: update AnalysisResult shape (status, riskReward, analysis, zones, tradeSetup)
- [ ] 10. app/analysis-result.tsx: support no_trade state + Trade Setup / Price Action / Key Zones sections
- [ ] 11. app/saved.tsx: handle direction-null and missing lotSize gracefully
- [ ] 12. DEPLOYMENT.md + README.md: remove Alpha Vantage references
- [ ] 13. Typecheck (tsc --noEmit)
- [ ] 14. Server syntax check (node --check serve.js)
- [ ] 15. Run tests (npm test)
- [ ] 16. Verify server starts + /api/health returns 200

