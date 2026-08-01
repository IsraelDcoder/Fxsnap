# FXSnap

FXSnap is a mobile-first trading companion app designed for people who want a faster, simpler way to analyze charts, generate trading ideas, and manage a personal strategy workflow from their phone.

The app combines image-based chart analysis, AI-generated trading insights, saved strategies, and premium subscription features into a single mobile experience. It is built as an Expo + React Native app with a lightweight Node.js backend for API access and server-side verification.

---

## What FXSnap does

FXSnap helps users:

- Upload or analyze trading charts from their phone
- Get AI-assisted interpretation of chart structure and market context
- Build trading plans and strategy ideas from their preferences
- Save favorite analyses and strategies for later review
- Access premium features through subscriptions

The core experience is focused on making trading analysis more accessible, faster, and more structured for everyday users.

---

## Product vision

FXSnap sits in the intersection of:

- Mobile trading tools
- AI-assisted market analysis
- Personal strategy journaling
- Subscription-based premium features

The long-term goal is to become a practical mobile trading assistant that helps users turn raw chart data into clear next-step decisions without needing a complex desktop workflow.

---

## Monetization potential

FXSnap has strong monetization potential because it can be positioned as a premium productivity and insight tool for active traders and aspiring traders.

### Possible monetization models

- Premium subscription for advanced analysis features
- Tiered plans for casual vs serious traders
- In-app upsells for enhanced AI analysis or strategy tools
- B2B or creator-oriented licensing in the future

### Why subscriptions make sense

- Users get ongoing value from AI analysis and strategy support
- The app can be updated regularly with new features and models
- Premium content can create recurring revenue rather than one-time purchases

### Current monetization implementation

The app already includes a subscription flow using RevenueCat with:

- Weekly and quarterly plans
- Premium entitlement checks
- Restore purchase support

This gives the product a strong foundation for paid growth once the store setup and backend verification are fully production-ready.

---

## What has been built

### Mobile app

The app currently includes:

- Onboarding experience
- Home and dashboard screens
- Chart analysis flow
- Analysis result screens
- Strategy generation flow
- Saved analysis and saved strategy views
- Premium/paywall experience
- Shared theme and UI consistency updates
- App state and persistence for saved content

### Backend

The backend includes:

- A Node.js server for API routes
- Auth/session handling
- Strategy generation endpoint
- Chart analysis endpoint
- Market data endpoint
- Event logging endpoint
- RevenueCat entitlement verification endpoint

### Billing and subscriptions

The app includes initial RevenueCat integration for:

- Purchase flow
- Restore purchases
- Premium entitlement status checks

### Technical stack

- Expo / React Native
- TypeScript
- Expo Router
- React Native Reanimated
- RevenueCat
- Node.js backend
- OpenRouter-backed AI features

---

## What is left to build / finish

The app is functional, but several items still need to be completed before a polished public launch.

### High-priority items

- Complete production backend deployment
- Replace placeholder environment variables with real production secrets
- Finalize and verify RevenueCat product setup for Apple and Google stores
- Configure real EAS build credentials and Expo project setup
- Add polished privacy policy, terms, support, and account deletion links
- Complete App Store and Google Play compliance requirements
- Test purchases, restores, and entitlement renewals on real devices

### Medium-priority items

- Improve AI response quality and reliability
- Add stronger error handling and fallback states
- Expand analytics and telemetry for retention and usage patterns
- Improve onboarding and user education
- Add more robust chart and market-data validation
- Expand strategy features beyond the current MVP flow

### Long-term roadmap ideas

- Advanced backtesting tools
- Signal tracking and journal features
- Social or community sharing
- More premium feature tiers
- Broader market coverage and data providers

---

## Target audience

FXSnap is best suited for:

- Beginner to intermediate traders who want guided analysis
- Retail traders who want a mobile-first workflow
- Users who want AI-assisted ideas without using a full desktop trading platform
- People who like to save strategies and review them later
- Traders who want a simple app for chart interpretation and planning

### Primary audience

- Retail forex traders
- Mobile-first traders who value convenience over complexity
- Users interested in AI-enhanced analysis tools

### Secondary audience

- Aspiring traders learning the basics of technical analysis
- Strategy-focused users who want to build repeatable routines

---

## Positioning

FXSnap can be positioned as:

- A mobile AI trading assistant
- A chart analysis companion for traders
- A premium strategy planning app for retail traders
- A lightweight alternative to overly complex trading platforms

---

## Current status

FXSnap is currently in an MVP-to-early-growth stage.

It has:

- A working mobile app experience
- Core AI-driven analysis and strategy flows
- Subscription infrastructure
- Backend API support

It still needs:

- Production deployment
- Store and billing hardening
- Compliance polish
- Final product validation before public launch

---

## Why this app matters

FXSnap has the potential to become a useful daily tool for traders who want help organizing their analysis and decision-making process. Its value is not only in the AI output, but also in the combination of:

- convenience
- personalization
- saved workflows
- premium recurring features

That makes it a strong candidate for a subscription-based mobile product if it is refined and launched carefully.

---

## Suggested next steps

1. Finish production deployment setup
2. Configure real billing and store credentials
3. Complete privacy/legal requirements
4. Run real-device testing for subscriptions and core features
5. Launch in internal or closed beta first
6. Collect usage feedback and improve the core experience

---

## Summary

FXSnap is a promising mobile trading assistant app with a clear premium-product opportunity. The foundation is already there, and the next phase is about hardening the product for real-world release and growth.
