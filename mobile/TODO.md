# Fix Chart AI Analysis Core Feature

## Steps
- [x] 1. Diagnose root cause (server fallback + client hard-block)
- [x] 2. chartDetection.ts: add `availability` field + `buildNeutralChartResult`
- [x] 3. serve.js: enhance fallback response (`availability`, `canContinue`)
- [x] 4. analysis.tsx: fix corrupted analyzing title text
- [x] 5. analysis.tsx: automatic fallback to manual mode
- [x] 6. analysis.tsx: fix Reanimated StepRow warnings
- [x] 7. Typecheck (`tsc --noEmit`)
- [x] 8. Fix vision path: use vision-capable model + 30s timeout (was 5s)
- [x] 9. Document `OPENROUTER_VISION_MODEL` in `.env.example` + `DEPLOYMENT.md`
- [x] 10. Integrate Google Gemini Vision (`gemini-1.5-flash`) as Layer 1 chart analysis
- [x] 11. Add `GEMINI_API_KEY` + `GEMINI_VISION_MODEL` to `.env.example` + `DEPLOYMENT.md`
- [x] 12. Server syntax check (`node --check serve.js`)
- [x] 13. TypeScript typecheck (`tsc --noEmit`)
- [x] 14. Verify server starts + `/api/health` returns 200
- [ ] 15. Verify analysis flow in Expo Go (manual QA)

