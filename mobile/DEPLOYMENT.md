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
   - OPENROUTER_SITE_URL
   - OPENROUTER_APP_NAME
   - ALPHA_VANTAGE_API_KEY
   - REVENUECAT_SECRET_API_KEY
   - REVENUECAT_ENTITLEMENT_ID
   - FXSNAP_AUTH_SECRET
   - EXPO_PUBLIC_API_URL (set to your Vercel deployment URL)
4. Deploy.

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

1. Create the products `fxsnap_weekly` and `fxsnap_quarterly` in RevenueCat.
2. Link them to the Google Play subscription products.
3. Configure the entitlement `premium`.
4. Set the public SDK keys in the Expo app environment and the secret key on the backend.
5. Test with Google Play internal / license-test tracks.

## 5. Production checklist

- Add privacy policy, terms, support, and account deletion URLs
- Complete Play Data Safety and App content declarations
- Test purchases, restores, expiration, refunds, camera access, and image analysis on real devices
