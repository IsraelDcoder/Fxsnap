# FXSnap website

Independent Next.js App Router project for the public FXSnap website. It lives
in this folder so its dependencies and build output remain separate from the
Expo application in `../mobile`.

## Local development

Requirements: Node.js 20.9 or later and npm.

```powershell
cd website
npm install
npm run dev
```

Open `http://localhost:3000`. To verify a production build:

```powershell
npm run typecheck
npm run test
npm run build
npm start
```

## Structure

- `src/app/` contains App Router pages and SEO routes.
- `src/components/` contains shared navigation, footer, structured data and
  interactive UI.
- `src/lib/product-pages.ts` contains distinct product landing-page content.
- `src/lib/articles.ts` contains the initial educational article drafts.
- `public/images/` contains the FXSnap icon, three supplied app-screen
  screenshots optimized as WebP, and the original chart example image.
- `tests/` contains focused calculator tests.

Stable pages are statically generated. Product pages and learning articles use
content data with shared route templates. The risk-to-reward calculator is an
isolated client component; its calculation helper is independently tested.

## Environment and deployment

No secrets are required to build the current site. `.env.example` reserves a
blank public GA4 measurement ID, but analytics and consent handling are not
configured. Do not put private service credentials in `NEXT_PUBLIC_*`
variables.

The site targets `https://fxsnapp.app`. Before deployment, configure the domain
and HTTPS on the chosen host, then verify canonical URLs, sitemap and robots
responses. The current project has not been connected to a hosting provider or
DNS. Review Next.js hosting requirements before choosing Cloudflare Pages.

Security response headers are configured in `next.config.ts`. The CSP permits
inline scripts and styles for the current Next.js rendering and inline styling;
review and tighten it if analytics, embeds or other third parties are added.

## Publication checklist

- The homepage hero uses the supplied home, chart-upload and analysis-history
  screenshots. Add the Apple App Store URL when it is provided.
- Privacy Policy and Terms pages now describe the reviewed app data flows,
  deletion behavior, contact address and retention settings. Confirm the
  operator's exact legal identity and governing jurisdiction with qualified
  counsel before launch; the public Terms preserve mandatory local protections
  rather than naming a jurisdiction that has not been supplied.
- Confirm contact-form handling requirements before adding a contact form.
- Israel Thompson is listed as the supplied educational author. Editorial
  review is still pending; article drafts remain `noindex` and are excluded
  from the sitemap.
- Add and validate GA4, consent controls and any webmaster verification
  identifiers before enabling analytics.
- Review product/pricing wording against current store and RevenueCat
  configuration.
- Validate structured data, accessibility, mobile layouts and Core Web Vitals
  in the selected production environment.

## Current pages

Home, About, Features, How it Works, Pricing, Download, Contact, Support,
Account Deletion, Financial Disclaimer, six distinct product landing pages,
Learning Centre with three educational article drafts, Privacy and Terms
drafts, and the risk-to-reward calculator.
