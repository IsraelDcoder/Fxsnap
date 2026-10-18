# FXSnap release setup

## EAS

1. Install and authenticate the EAS CLI.
2. Create or link the Expo project.
3. Replace `replace_with_eas_project_id` in `app.json` and `.env` with the real EAS project ID.
4. Confirm `com.fxsnap.mobile` is available and owned by the publishing account.
5. Build with the production EAS profile.

The local `npm run build` command creates a web export. Native release builds use `npm run build:ios`, `npm run build:android`, or `npm run build:all`.
Android release builds use R8 minification and resource shrinking. Test the resulting release build before submitting it, and verify the updated DEX optimization metrics in Play Console. The app does not lock orientation, so include landscape and large-screen layouts in device testing.

## RevenueCat

Configure these exact product identifiers in Apple App Store Connect, Google Play Console, and RevenueCat:

- `fxsnap_premium_weekly`
- `fxsnap_premium_3months`

Create the existing `premium` entitlement and attach both products, then set:

- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID`
- `EXPO_PUBLIC_REVENUECAT_WEEKLY_PRODUCT_ID` if the weekly product uses a different identifier
- `EXPO_PUBLIC_REVENUECAT_QUARTERLY_PRODUCT_ID` if the three-month product uses a different identifier
- `REVENUECAT_SECRET_API_KEY` on the server only

Set each country’s weekly and three-month price tiers in App Store Connect and Google Play Console. The paywall reads localized prices from RevenueCat. Configure country tiers to support the “Save 71%” badge: $7.99 weekly and $29.99 for three months yields 71% savings against thirteen weekly renewals ($103.87), rounded to the nearest percent.
Test purchases and restores in Apple Sandbox and Google Play license-test tracks. Do not use the public paywall in production until the backend entitlement endpoint returns verified active state.

## Backend secrets

Set these in the deployment secret manager, not in a committed `.env`:

- `OPENROUTER_API_KEY`
- `ALPHA_VANTAGE_API_KEY` or a licensed replacement provider key
- `FXSNAP_AUTH_SECRET`
- `REVENUECAT_SECRET_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXPO_PUBLIC_SENTRY_DSN` for the client build
- `ALLOWED_ORIGIN` for the deployed web client origin

Use HTTPS and set `ALLOWED_ORIGIN` to the real web origin. Rotate any key previously exposed during development.

## Optional Google account sign-in through Supabase

Google sign-in is optional and does not change the anonymous device identity or RevenueCat App User ID. The mobile app uses Supabase Auth's Google provider with PKCE; the backend verifies the resulting access token against Supabase Auth before linking the verified Google identity to the existing FXSnap account.

1. In Supabase, enable Google under **Authentication → Sign In / Providers**. In Google Cloud Console, create a **Web application** OAuth client for Supabase's hosted OAuth flow. Copy the exact Supabase Auth callback shown on the Supabase provider page (`https://<project-ref>.supabase.co/auth/v1/callback`) into Google's **Authorized redirect URIs**. The Google OAuth client ID and secret belong in Supabase provider settings, not in the mobile app.
2. In Supabase **Authentication → URL Configuration**, set the Site URL to `https://fxsnap.vercel.app` and add `mobile://auth/callback` to Additional Redirect URLs. The app's existing Expo scheme is `mobile`; the native browser flow returns to this URI and exchanges its PKCE code in-app. There is no website `/auth/callback` route.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and either `EXPO_PUBLIC_SUPABASE_ANON_KEY` or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the app build environment. The URL is the Supabase project URL (not the Vercel app URL). These public keys are intended for client use; never place a service-role/secret key in any `EXPO_PUBLIC_*` variable.
4. Set server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for Supabase Auth token verification and account deletion. These same server settings are used by the existing Supabase durable storage. Also configure `FXSNAP_AUTH_SECRET` and durable storage. Do not put a service-role key or other server credential in an `EXPO_PUBLIC_*` variable.
5. Build and test on iOS and Android with the production app identifiers. Use an Expo development build for local OAuth testing so the existing `mobile://` scheme is registered; do not add an invented Expo Go redirect to production's allowed URLs.

After sign-in, FXSnap saves and restores the app backup (settings, saved analyses, strategies, briefs, and current risk activity), notification preferences, daily-brief progress, and a compressed profile photo to the authenticated account. Account data is limited to 5 MB per backup. Device identity, RevenueCat identity and entitlements, and device push tokens are not synced or changed. Chart analysis and AI strategy generation require an active Premium subscription. Account deletion removes the cloud backup; sign-out does not.

## Sentry

Create a Sentry React Native project, set `EXPO_PUBLIC_SENTRY_DSN`, and configure source maps for each EAS release. Verify a test exception on both iOS and Android before launch.

## Before store submission

- Replace draft privacy and terms documents with reviewed, hosted URLs.
- Add support and account-deletion URLs.
- Complete App Store privacy and Google Play Data Safety declarations.
- Test camera, gallery, image upload, billing, restore, expiration, refund/revocation, sharing, offline errors, and small-screen, landscape, tablet, and foldable layouts on real devices.

## Market-data launch scope

The current provider adapter is Alpha Vantage FX intraday data. Until a licensed multi-asset provider and contract metadata are configured, launch only with the supported liquid Forex pairs. Metals, indices, and cross-currency sizing must remain unavailable rather than using guessed tick values. Add the fallback provider adapter, persistent health metrics, stale-data policy, spread/slippage inputs, and circuit-breaker alerts before advertising multi-asset coverage.
