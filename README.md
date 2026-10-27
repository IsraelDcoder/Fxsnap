# FXSnap

FXSnap is a mobile-first AI chart-analysis and trading-workflow companion. It helps traders turn a chart screenshot into a structured market read, inspect the evidence and candidate levels, and carry that analysis into their own planning and review. Around that core flow, FXSnap brings together strategy tools, market information, learning resources, saved work, and an optional trader community.

FXSnap is an educational analysis tool, not a broker, signal service, or financial adviser. Analysis is not a promise of a profitable outcome, and users remain responsible for checking the chart, managing risk, and deciding whether to trade.

## The product in one flow

1. **Set up a personal workspace.** Onboarding introduces the app and preferences. The home dashboard brings together quick actions, market-session context, daily insights, and an account/risk snapshot.
2. **Choose a chart-analysis mode.** Start a quick analysis with one chart, selecting an image from the gallery or taking a photo, or use Multi-Timeframe analysis with higher-timeframe (H4) context and a lower-timeframe (M15) entry chart.
3. **Get a chart-grounded read.** The backend sends the image to a vision model and normalizes the response into a consistent result. The analysis can describe the visible instrument and timeframe, chart quality, latest visible price, price action, trend and structure, support/resistance, volatility, indicators when visible, and limitations.
4. **Review candidate levels separately from trade readiness.** When supported by the chart, results can include an entry zone, invalidation/stop, one or two targets, and risk/reward calculated from the same prices. A directional read or candidate setup is not automatically an actionable trade. Missing evidence, conflicting structure, stale or unreadable screenshot details, invalid price geometry, and insufficient risk/reward can all leave a result marked no-trade.
5. **Use or keep the result.** Inspect the analysis and insights, review the chart with its annotated levels, share an analysis card, share an eligible post to Community, save the analysis to history, or copy levels for personal review.
6. **Continue the workflow.** Use saved analyses and strategies, planning and risk tools, market information, learning content, and—when enabled—Community to support an ongoing trading routine.

## Analysis principles

FXSnap aims to return a useful, complete explanation of what the submitted chart supports, including uncertainty and missing fields. It does not invent prices or fill gaps with assumptions just to make a result look complete.

- The submitted chart is the evidence source. A selected instrument is only a hint and does not override what is visible.
- Screenshot-derived prices are not verified live quotes. Candle timestamps, current-price markers, and whether the latest candle is still forming may be unclear.
- Candidate levels and market direction are distinct from a validated, actionable setup. A no-trade result can still explain a directional bias and preserve chart-supported candidate levels.
- Risk/reward is calculated only when entry, stop, and the first target can be read or defensibly derived and have valid geometry.
- Multi-Timeframe mode requires readable evidence on both charts and clear alignment; it does not infer confirmation from trend labels alone.
- A second chart review may try to recover missing candidate levels on a readable chart. It must still rely on visible evidence and does not override the no-trade safeguards.
- AI analysis is not financial advice. Apply independent judgment and appropriate risk management.

## Product capabilities

### Chart analysis

- Quick Analysis from a single chart image, using camera or gallery.
- Multi-Timeframe analysis for an H4 context chart and an M15 entry chart.
- A structured result with market read, evidence score, trade readiness, reasoning, risk notes, and trade levels when supported.
- Analysis and Insights result views, including a chart preview with candidate target and stop annotations where available.
- A shareable analysis card: native image sharing on mobile and share/download support on web.
- Copy levels, save analysis history, and revisit saved analyses.
- Premium access checks for protected analysis features.

### Trading workflow and market tools

- AI-assisted strategy generation based on a trader's preferences.
- Saved strategies and daily briefs.
- Market quotes, candle data, session context, news/events, and an economic calendar where provider data is configured and available.
- Lot-size calculation and risk-management tools for planning exposure.
- Learning hub and lessons for structured learning.
- Daily insight content and account/risk settings on the home dashboard.

Market-data coverage depends on configured provider access and supported instrument rules. FXSnap must not imply that a quote is live or that an unsupported market's tick size, spread, or position sizing has been verified.

### Community and account

- Community includes For You, Following, engagement-ranked Trending, Latest, and Saved feeds; posts, image attachments, polls and voting, comments/replies, reactions, persistent reposts, sharing, reporting, member profiles, notifications, and post/member/topic search. Community is gated by a backend feature flag and requires its Supabase schema and storage configuration before production use.
- The redesigned market strip only displays provider-backed quotes; configure the server-only `TWELVEDATA_API_KEY` for supported instruments, otherwise it shows an unavailable-data notice rather than simulated prices.
- Optional Google account sign-in can link an account and synchronize supported app backup data, such as settings, saved analyses, strategies, briefs, and current risk activity. Device identity, free-analysis allowances, billing identity/entitlements, and push tokens are not synced as account backup.
- In-app notifications are available. Opt-in push campaigns require Expo credentials, server configuration, durable storage, and a scheduled dispatch request.
- No member-to-member private messaging is provided.

## Plans and access

FXSnap uses RevenueCat for subscription purchases, restore flows, and entitlement checks. The app is designed for weekly, monthly, and yearly Premium products; the exact available offers depend on the store, RevenueCat offering, and production configuration. Premium access is verified through the backend and should not be considered production-ready until store products, entitlements, and server verification have been tested on real devices.

## Technology

- **Mobile and web:** Expo, React Native, TypeScript, Expo Router
- **Backend:** Node.js API routes, deployed separately from native app builds
- **AI:** OpenRouter-backed vision and text model integrations
- **Account and durable data:** Supabase Auth and database/storage integrations
- **Billing:** RevenueCat
- **Mobile builds:** Expo Application Services (EAS)

## Repository layout

```text
mobile/
  app/            Expo Router screens
  components/     Shared interface components
  context/        App state and persistence
  services/       API, analysis, billing, market and product services
  server/         Node.js API, validation and backend tests
  tests/          Client-side tests
```

## Run locally

Requirements: Node.js, npm, and a supported Expo development environment.

```powershell
cd mobile
npm install
npm run dev
```

To preview the web app in a browser:

```powershell
cd mobile
npm run dev -- --web

## Legal and support

The repository includes draft [`mobile/PRIVACY_POLICY.md`](./mobile/PRIVACY_POLICY.md) and [`mobile/TERMS_OF_USE.md`](./mobile/TERMS_OF_USE.md). These require appropriate review and production hosting before store release.
