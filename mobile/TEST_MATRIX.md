# FXSnap integration test matrix

Automated tests cover pure backtesting and signed API tokens. The following require a configured service, simulator, or physical device and are intentionally not claimed as passed locally.

| Area | iOS | Android | Required setup |
|---|---|---|---|
| RevenueCat weekly purchase | Sandbox | License test track | Store products, RevenueCat offering, native development build |
| RevenueCat quarterly purchase | Sandbox | License test track | Same as above |
| Restore purchase | Sandbox | License test track | Existing test entitlement, new device/account |
| Expiration/refund/revocation | Store sandbox controls | Play test subscription controls | RevenueCat webhook and entitlement endpoint |
| Camera upload | Real device | Real device | Camera permissions, poor-light and denied-permission cases |
| Gallery upload | Simulator/device | Emulator/device | JPEG/PNG/WebP, large image, denied permission |
| Chart AI rejection | Device/browser | Device/browser | OpenRouter vision key and non-chart fixtures |
| Chart/data agreement | Device/browser | Device/browser | Matching and conflicting chart fixtures plus market candles |
| Sharing | Real device | Real device | Native share sheet, cancelled share, fallback clipboard |
| Offline analysis | Airplane mode | Airplane mode | Session token, provider timeout, retry UI |
| Redis persistence | Backend staging | Backend staging | Managed Redis, restart process, verify rate/cache/events survive |
| Sentry crash | Test build | Test build | Real DSN, source maps, release identifier |
| Accessibility | VoiceOver | TalkBack | Labels, focus order, contrast, dynamic type |

Before release, record build number, OS version, device model, test account, result, and evidence for every row.
