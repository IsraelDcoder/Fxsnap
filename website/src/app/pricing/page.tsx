import { ArrowRight, Smartphone } from "lucide-react";
import { MotionDownloadLink } from "@/components/motion-download-link";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "FXSnap Pricing | Free and Premium Access",
  description:
    "Learn how FXSnap subscription availability works. Current offers and prices are shown in the app store for your account and region.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Plans and access</p>
          <h1>See the current options in the app.</h1>
          <p>
            FXSnap includes free and paid functionality. Subscription offers
            depend on the app store, account eligibility and region.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container">
          <div className="pricing-note">
            <strong>Pricing is not fixed on this page.</strong> The app retrieves
            available subscription packages through RevenueCat and the relevant
            app store. Check the in-app paywall for the price, billing period
            and any applicable trial terms before purchasing.
          </div>
          <div className="pricing-explainer">
            <div className="pricing-icon"><Smartphone aria-hidden="true" size={21} /></div>
            <h2>Manage access where you subscribed</h2>
            <p>
              Purchases, restoration and entitlement checks are handled through
              the app’s subscription flow. Store prices and offers can change;
              review the terms displayed by the store before confirming.
            </p>
            <MotionDownloadLink className="button button-lime" href={siteConfig.googlePlayUrl}>
              Explore FXSnap on Google Play <ArrowRight aria-hidden="true" size={15} />
            </MotionDownloadLink>
          </div>
          <p className="pricing-footnote">
            Premium availability and included features are subject to
            in-app/store configuration. FXSnap does not promise financial
            outcomes.
          </p>
        </div>
      </section>
    </>
  );
}
