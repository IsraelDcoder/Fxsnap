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
   - FXSNAP_CHART_MAX_AGE_MINUTES (optional stricter cap; per-timeframe screenshot age limits default to M15 60 minutes, H1 4 hours, H4 12 hours, D1 48 hours, and unknown timeframes 60 minutes)
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

1. In Firebase, create an Android app with package name `com.fxsnap.mobile` and download its `google-services.json`. Enable the Firebase Installations API and Firebase Cloud Messaging Registration API in that Firebase project. If the API key is restricted, allow the Play app signing SHA-1 and the APIs required by Firebase.
2. Provide that file to EAS as a **file-type** Production environment variable named `GOOGLE_SERVICES_JSON`. The app config validates that it contains a Firebase Android client for `com.fxsnap.mobile`, then adds it to the native Android build without storing its contents in source control. A production EAS build now fails early if the file is missing. For local Android builds, set `GOOGLE_SERVICES_JSON` to the local file path; `google-services.json` is ignored by Git.
3. In EAS Android credentials, configure Firebase Cloud Messaging V1 with a service-account JSON from the same Firebase project as `google-services.json`. The app package, Firebase project/sender ID, and FCM V1 service account must match. These are separate from the Expo project ID in `extra.eas.projectId`.
4. Build and distribute a new development or production app after configuring credentials, then install that build and test there. Expo Go uses Expo's own native app configuration and does not verify this app's Firebase credentials. Remote pushes on Android require an EAS development or production build.
5. Store `EXPO_ACCESS_TOKEN` as a Supabase Edge Function secret for Community delivery. Set `EXPO_ACCESS_TOKEN` and `NOTIFICATION_CRON_SECRET` in the backend's production environment for scheduled campaigns and authenticated dispatch. Do not add any of these values to an `EXPO_PUBLIC_*` variable.
6. Configure an external cron service to send a `POST` request to `/api/notifications/dispatch` at least once per minute with the `x-notification-secret` header set to `NOTIFICATION_CRON_SECRET`. This retries queued Community activity notifications; scheduled retention campaigns remain limited to one per device in each seven-day period.
7. Users opt in from Settings and must grant OS notification permission. Push tokens are registered server-side against the signed-in FXSnap/Supabase identity and installation ID; multiple installations remain independently registered. Community activity notifications are enabled by default for push-enabled devices and can be disabled separately. Replies and reactions are sent only to the author of the target post or reply, excluding the acting account; new-post notifications retain community-wide fan-out.

### Supabase Edge delivery for Community pushes

The database triggers enqueue Community posts, replies, and reactions in `fxsnap_community_push_queue`. Replies and reactions target push-enabled devices belonging to the author of the replied-to or reacted-to message; the actor is excluded. New-post activity retains its existing community-wide fan-out. The backend invokes the `community-push` Edge Function to claim the queue, deliver through Expo Push Service, store Expo receipt IDs, log ticket/receipt error codes without logging tokens, and remove devices that return `DeviceNotRegistered`.

1. Run `server/supabase-kv.sql` in the production Supabase SQL Editor to add user ownership columns and the receipt table. Existing device rows have no user association and are ignored until each device re-registers from the signed-in app.
2. Set `EXPO_ACCESS_TOKEN` in Supabase Dashboard → Edge Functions → Secrets. The function uses Supabase's server-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never put either key in the mobile app.
3. From the repository root, link the Supabase CLI to the production project and deploy `supabase/functions/community-push` with `supabase functions deploy community-push`. Gateway JWT verification is disabled because the function authenticates the trusted backend by constant-time comparison against the server-only service-role key itself. Keep that key only in Vercel and Supabase Edge Function secrets; never expose it in the app.
4. Deploy the Vercel backend after the function is live. Verify Vercel production `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` match the Edge Function project and secret. The existing notification dispatch cron and immediate post/reply/reaction path will invoke the Edge Function; retention campaigns remain on the existing backend.

Reply/reaction notification routing is handled by the database and backend; no mobile app rebuild is required.

### Supabase storage setup

Run `server/supabase-kv.sql` once in the Supabase SQL editor. This creates the shared key-value table and the per-device `fxsnap_push_devices` table used for Expo tokens and notification preferences. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Vercel Production environment. Push token registration and campaign dispatch require these Supabase credentials; Redis is not used for push notifications. Keep the service-role key server-side only.

### Community production setup

Community is disabled until its schema is present. Before enabling it:

1. If Community is already enabled in production, set `FXSNAP_COMMUNITY_ENABLED=false` and redeploy first. Verify Community writes are disabled before applying the migration so the legacy reaction table can be safely converted without concurrent writes.
2. Apply the latest `server/community.sql` to the production Supabase project. It creates/updates the Community tables, profile-photo and comment-count support, member-count function, post view/share counts and private deduplication records, durable Community push queue, presence/realtime support, and the five-reaction single-selection constraint and transactional RPCs. The migration maps legacy `like`, `helpful`, `insightful`, and `interesting` reactions to Love, Clap, Wow, and Funny; if an account has multiple old reactions on one post, it retains the earliest one. It also enables RLS with client access restricted; configures realtime; provisions the public Community image bucket; and hides the old static starter posts.
   Engagement uses `POST /api/community/views` with batches of up to 30 post IDs, `POST /api/community/messages/:id/reactions` with one of `love`, `fire`, `funny`, `clap`, or `wow`, and `POST /api/community/messages/:id/shares`. The feed submits views only after the documented 60%-visible, one-second dwell; the database deduplicates by account/post for 24 hours, excludes author views, and exposes aggregate counts. New counts update across the feed via realtime. Successful text shares are deduplicated per account/post for 30 seconds.
3. Confirm the Vercel Production environment already has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The privileged key must remain server-only.
4. Deploy the updated backend with Community still disabled, then set `FXSNAP_COMMUNITY_ENABLED=true` and redeploy. The public rollout permits all authenticated Google-linked FXSnap accounts to join; there is no beta allowlist.
5. Set `FXSNAP_COMMUNITY_ADMIN_SUPABASE_USER_IDS` to the approved moderator Supabase user IDs only. Leave it empty if no additional moderators are approved.
6. Check the authenticated feed, post view counts (including author exclusion and repeat-impression deduplication), each reaction and reaction replacement/removal, text sharing, comments/replies, report flow, account deletion, and image upload with at least two distinct accounts. Confirm that a reply or reaction creates an in-app notification and sends a push only to the author of the target post/reply, and that the actor receives no notification. Confirm the resulting Vercel deployment and Supabase project are the same ones targeted by the production app.

The app now includes backend-backed post/member/topic search, member profiles, and a dedicated in-app notification screen. These use the existing authenticated API and Community tables; no member-to-member private messaging is added.

Keep the flag false until the migration is applied and verified. Publish a new Android build after deploying the backend to expose these UI changes, profile photos, persisted comment counts, post engagement, multi-reactions, and own-post edit/delete actions; backend activation alone does not publish client changes. The text share flow increments the share count only when the native share API reports a completed share. Expo's image-share API does not distinguish completion from cancellation, so image-sheet launches are not counted.

For UI work, opening `/community` in the Expo web development server uses a clearly labeled local preview identity and in-memory demo posts. Create, react, follow, and comment interactions stay in that browser session and reset on reload; this preview does not authenticate against or write to production. It is gated to web development builds only and is not a substitute for testing the authenticated mobile app or backend.

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
