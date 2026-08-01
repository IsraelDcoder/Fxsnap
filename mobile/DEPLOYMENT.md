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
- Railway, Render, Fly.io, or Azure App Service
- Make sure the app exposes port 3000
- Set the environment variables from .env.example in the deployment platform secret manager

### Example Render / Railway / Fly deployment
```bash
# Render uses the included Procfile automatically
# Railway uses the Node app directly from the package.json start script
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
