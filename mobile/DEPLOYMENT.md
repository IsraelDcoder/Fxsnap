# FXSnap deployment guide

## 1. Push the app to GitHub

```bash
cd mobile
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

## 2. Host the backend

### Recommended options
- Vercel for the API layer
- Railway, Render, Fly.io, or Azure App Service if you want a long-running Node process
- Make sure the app exposes port 3000 for non-Vercel platforms
- Set the environment variables from .env.example in the deployment platform secret manager

### Vercel deployment
1. Open Vercel and create a new project.
2. Set the project root to the mobile folder.
3. Add the following environment variables:
   - OPENROUTER_API_KEY
   - OPENROUTER_MODEL (text model for strategy generation)
   - OPENROUTER_VISION_MODEL (OpenRouter vision model, e.g. `openai/gpt-4o-mini`)
   - OPENROUTER_SITE_URL
   - OPENROUTER_APP_NAME
   - GEMINI_API_KEY (Google Gemini key for chart analysis)
   - GEMINI_VISION_MODEL (default `gemini-1.5-flash`)
   - ALPHA_VANTAGE_API_KEY
   - TWELVEDATA_API_KEY (live forex quotes, candles, and economic calendar)
   - REVENUECAT_SECRET_API_KEY
   - REVENUECAT_ENTITLEMENT_ID
   - FXSNAP_AUTH_SECRET

   - EXPO_ACCESS_TOKEN (Expo access token used only by the backend to submit push messages)
   - NOTIFICATION_CRON_SECRET (long random secret required by the notification dispatch job)
   - SUPABASE_URL (required durable server-side store)
   - SUPABASE_SERVICE_ROLE_KEY (server-only; never expose this to the mobile app)
   - SUPABASE_KV_TABLE (optional, defaults to `fxsnap_kv`)
4. Deploy.

The mobile app targets `https://fxsnap.vercel.app` for all API requests. Deploy the backend at that URL before releasing a mobile build.

### Push notifications

1. Configure Android and iOS push credentials for the Expo project in EAS. Remote pushes require an EAS development or production build; they are not supported by Expo Go on Android.
2. Set `EXPO_ACCESS_TOKEN` and `NOTIFICATION_CRON_SECRET` in the backend's production environment. Do not add either value to an `EXPO_PUBLIC_*` variable.
3. Configure an external cron service to send a daily `POST` request to `/api/notifications/dispatch` with the `x-notification-secret` header set to `NOTIFICATION_CRON_SECRET`. The endpoint sends at most one campaign per device in each seven-day period.
4. Users opt in from Settings. Campaign delivery uses app-open and successful chart-analysis activity; users can separately disable Daily Brief, inactivity, and weekly activity campaigns.

### Supabase storage setup

Run `server/supabase-kv.sql` once in the Supabase SQL editor. This creates the shared key-value table and the per-device `fxsnap_push_devices` table used for Expo tokens and notification preferences. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Vercel Production environment. Push token registration and campaign dispatch require these Supabase credentials; Redis is not used for push notifications. Keep the service-role key server-side only.

```bash
cd mobile
npm install -g vercel
vercel login
npm run deploy:vercel
```

Your API endpoints will be available at:
- https://<your-project>.vercel.app/api/health
- https://<your-project>.vercel.app/api/strategy
- https://<your-project>.vercel.app/api/market-data
```

## 3. Build with EAS

```bash
cd mobile
npm install -g eas-cli
eas login
eas build:configure
npx eas build --platform android --profile production
```

Replace the placeholders in app.json and eas.json with your real Expo project ID and publishing credentials.

## 4. RevenueCat and Play Store

1. Create the products `fxsnap_weekly`, `fxsnap_premium_monthly`, and `fxsnap_quarterly` in RevenueCat.
2. Link them to the Google Play subscription products.
3. Attach all three products to the existing Premium entitlement.
4. Set the public SDK keys in the Expo app environment and the secret key on the backend.
5. Test with Google Play internal / license-test tracks.

Set `EXPO_PUBLIC_REVENUECAT_MONTHLY_PRODUCT_ID` if the monthly store product uses an identifier other than `fxsnap_premium_monthly`. Prices are loaded from the RevenueCat offering and are not hardcoded in the paywall.

## 5. Production checklist

- Add privacy policy, terms, support, and account deletion URLs
- Complete Play Data Safety and App content declarations
- Test purchases, restores, expiration, refunds, camera access, and image analysis on real devices
