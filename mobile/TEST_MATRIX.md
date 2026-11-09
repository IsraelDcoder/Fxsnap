# FXSnap integration test matrix

Automated tests cover pure backtesting and signed API tokens. The following require a configured service, simulator, or physical device and are intentionally not claimed as passed locally.

| Area | iOS | Android | Required setup |
|---|---|---|---|
| RevenueCat weekly purchase | Sandbox | License test track | Store products, RevenueCat offering, native development build |
| RevenueCat yearly purchase | Sandbox | License test track | Yearly store product attached to the existing Premium entitlement and offering; confirm the advertised 86% saving matches configured store prices |
| RevenueCat yearly exit offer | Not applicable | Eligible license tester | Tap the paywall X once; verify the separate offer screen, `exit_offer` annual package, `yearly-exit-20off` option, localized first-year/renewal prices, discounted Play confirmation, and Pro unlock. Close the offer and verify the hard paywall remains; tap X again and verify the offer is not repeated in that session. |
| Onboarding push permission | Real device | Real device | On the final onboarding screen, tap Unlock and verify the OS permission prompt appears; onboarding must remain there until permission and push registration succeed. Denial must show the notification-settings path. |
| Paywall reminder sequence | Real device | Real device | Opt into push and keep Trading reminders enabled, reach the paywall without subscribing, and verify server dispatch sends at 10m, 25m, 1h, 3h, 16h, 24h, 2d, 3d, and 7d from the paywall visit. Verify no countdown/expiry claim, no sends after Pro activates or reminders are disabled, and notification taps return to the paywall. |
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
