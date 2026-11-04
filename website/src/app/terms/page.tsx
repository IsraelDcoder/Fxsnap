import { PageStructuredData } from "@/components/structured-data";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Terms of Use (Draft)",
  description:
    "Draft terms for the FXSnap app and website. Operator identity, jurisdiction and subscription terms require legal review.",
  path: "/terms",
  robots: { index: false, follow: true },
});

export default function TermsPage() {
  return (
    <>
      <PageStructuredData
        description="Draft terms for the FXSnap app and website."
        path="/terms"
        title="Terms of Use"
      />
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Terms · Draft</p>
          <h1>Terms of use</h1>
          <p>
            Draft overview of the FXSnap product and service limitations. It
            requires operator and qualified legal review before publication.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container legal-draft">
          <div className="draft-notice">
            Draft for review. Add the legal operator, governing jurisdiction,
            final subscription terms and legally reviewed liability language
              before treating these terms as binding.
          </div>
          <h2>What FXSnap provides</h2>
          <p>
            FXSnap is an AI-powered forex chart analysis application with
            educational and trading-workflow tools. Product features can
            change, depend on configuration or account access, and may not be
            available at all times.
          </p>
          <h2>AI analysis and trading risk</h2>
          <p>
            Chart analysis is based on images submitted by users. AI output can
            be wrong, incomplete or based on misread image details.
            Screenshot-derived prices are not verified live quotes. FXSnap is
            not a broker, signal service or financial adviser and does not
            guarantee profitable trades or market outcomes. Users are
            responsible for verifying information, managing risk and making
            their own decisions. Forex trading carries substantial risk.
          </p>
          <h2>Your use of the service</h2>
          <p>
            Do not upload passwords, API keys, payment credentials or other
            private information in chart images, Community posts or support
            messages. You remain responsible for your device, account security,
            use of the service and compliance with laws that apply to you.
          </p>
          <h2>Subscriptions</h2>
          <p>
            FXSnap offers free and paid functionality. Available subscription
            products and prices are presented in the app and depend on the
            relevant store and configuration. Purchases, renewals, cancellations
            and refunds are governed by the applicable Apple App Store or
            Google Play terms. Deleting a FXSnap account does not cancel a
            store-billed subscription.
          </p>
          <h2>Contact</h2>
          <p>
            For product support, contact{" "}
            <a className="inline-link" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            . These draft terms do not identify the legal operator or
            jurisdiction; both need confirmation and legal review.
          </p>
        </div>
      </section>
    </>
  );
}
