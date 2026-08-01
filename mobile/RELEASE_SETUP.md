# FXSnap release setup

## EAS

1. Install and authenticate the EAS CLI.
2. Create or link the Expo project.
3. Replace `replace_with_eas_project_id` in `app.json` and `.env` with the real EAS project ID.
4. Confirm `com.fxsnap.mobile` is available and owned by the publishing account.
5. Build with the production EAS profile.

The local `npm run build` command creates a web export. Native release builds use `npm run build:ios`, `npm run build:android`, or `npm run build:all`.

## RevenueCat

Configure these exact product identifiers in Apple App Store Connect, Google Play Console, and RevenueCat:

- `fxsnap_weekly`
- `fxsnap_quarterly`

Create the entitlement `premium`, attach both products, then set:

- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
- `REVENUECAT_SECRET_API_KEY` on the server only

Test purchases and restores in Apple Sandbox and Google Play license-test tracks. Do not use the public paywall in production until the backend entitlement endpoint returns verified active state.

## Backend secrets

Set these in the deployment secret manager, not in a committed `.env`:

- `OPENROUTER_API_KEY`
- `ALPHA_VANTAGE_API_KEY` or a licensed replacement provider key
- `FXSNAP_AUTH_SECRET`
- `REVENUECAT_SECRET_API_KEY`
- `EXPO_PUBLIC_SENTRY_DSN` for the client build
- `REDIS_URL` for distributed rate limits, market cache, and telemetry retention
- `ALLOWED_ORIGIN` for the deployed web client origin

Use HTTPS and set `ALLOWED_ORIGIN` to the real web origin. Rotate any key previously exposed during development.

## Sentry

Create a Sentry React Native project, set `EXPO_PUBLIC_SENTRY_DSN`, and configure source maps for each EAS release. Verify a test exception on both iOS and Android before launch.

## Before store submission

- Replace draft privacy and terms documents with reviewed, hosted URLs.
- Add support and account-deletion URLs.
- Complete App Store privacy and Google Play Data Safety declarations.
- Test camera, gallery, image upload, billing, restore, expiration, refund/revocation, sharing, offline errors, and small-screen layouts on real devices.

## Market-data launch scope

The current provider adapter is Alpha Vantage FX intraday data. Until a licensed multi-asset provider and contract metadata are configured, launch only with the supported liquid Forex pairs. Metals, indices, and cross-currency sizing must remain unavailable rather than using guessed tick values. Add the fallback provider adapter, persistent health metrics, stale-data policy, spread/slippage inputs, and circuit-breaker alerts before advertising multi-asset coverage.
