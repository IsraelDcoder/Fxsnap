# FXSnap release setup

## EAS

1. Install and authenticate the EAS CLI with the Expo account that owns the app.
2. Verify that the Expo project referenced by `extra.eas.projectId` in
   `app.json` exists and that the authenticated account has access to it. The
   project ID is already configured there; do not replace it with a placeholder.
3. Confirm `com.fxsnap.mobile` is available and owned by the publishing account.
4. Build with the production EAS profile.

The local `npm run build` command creates a web export. Native release builds use `npm run build:ios`, `npm run build:android`, or `npm run build:all`.
Android release builds use R8 minification and resource shrinking. Test the resulting release build before submitting it, and verify the updated DEX optimization metrics in Play Console. The app does not lock orientation, so include landscape and large-screen layouts in device testing.

## RevenueCat

Configure these exact product identifiers in Apple App Store Connect, Google Play Console, and RevenueCat:

- `fxsnap_premium_weekly`
- `fxsnap_premium_monthly`
- `fxsnap_premium_yearly`

Create the existing `premium` entitlement and attach all three products, then set:

- `EXPO_PUBLIC_RC_IOS_KEY`
- `EXPO_PUBLIC_RC_ANDROID_KEY`
- `EXPO_PUBLIC_RC_ENTITLEMENT_ID`
- `EXPO_PUBLIC_REVENUECAT_WEEKLY_PRODUCT_ID` if the weekly product uses a different identifier
- `EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID` if the monthly product uses a different identifier
- `EXPO_PUBLIC_REVENUECAT_YEARLY_PRODUCT_ID` if the yearly product uses a different identifier
- `REVENUECAT_SECRET_API_KEY` on the server only

Set each country’s weekly, monthly, and yearly price tiers in App Store Connect and Google Play Console. The paywall reads localized prices from RevenueCat and shows “Save 86%” on the yearly plan.

For the Google Play exit offer, create a RevenueCat offering named `exit_offer` with the yearly product as its `$rc_annual` package. Configure the `yearly-exit-50off` Play offer on that product and verify the returned subscription-option ID ends in `yearly-exit-50off`. The Android app shows this exit screen only when RevenueCat returns that option; it displays the localized first-phase and renewal prices and purchases the discounted subscription option. It is not available in the web preview or iOS.

Test purchases and restores in Apple Sandbox and Google Play license-test tracks. Test the discounted exit offer with an eligible Play license tester. Do not use the public paywall in production until the backend entitlement endpoint returns verified active state.

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

- In-app legal links point to `https://fxsnapp.app/privacy` and
  `https://fxsnapp.app/termsofuse`. Confirm both hosted pages are reachable
  before release.
- Add support and account-deletion URLs.
- Complete App Store privacy and Google Play Data Safety declarations.
- Test camera, gallery, image upload, billing, restore, expiration, refund/revocation, sharing, offline errors, and small-screen, landscape, tablet, and foldable layouts on real devices.

## Market-data launch scope

The current provider adapter is Alpha Vantage FX intraday data. Until a licensed multi-asset provider and contract metadata are configured, launch only with the supported liquid Forex pairs. Metals, indices, and cross-currency sizing must remain unavailable rather than using guessed tick values. Add the fallback provider adapter, persistent health metrics, stale-data policy, spread/slippage inputs, and circuit-breaker alerts before advertising multi-asset coverage.
