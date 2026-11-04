import { PageStructuredData } from "@/components/structured-data";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Privacy Policy (Draft)",
  description:
    "Draft overview of information the FXSnap app processes. This policy requires operator and legal review before publication.",
  path: "/privacy",
  robots: { index: false, follow: true },
});

export default function PrivacyPage() {
  return (
    <>
      <PageStructuredData
        description="Draft overview of information the FXSnap app processes."
        path="/privacy"
        title="Privacy Policy"
      />
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Privacy · Draft</p>
          <h1>Privacy policy</h1>
          <p>
            This draft reflects code paths reviewed in the FXSnap application
            and server. It is not complete or approved for publication.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container legal-draft">
          <div className="draft-notice">
            Draft for review. The operating entity, applicable jurisdiction,
            provider settings and retention schedule must be confirmed before
            this page is published as the official policy.
          </div>
          <h2>Information the app may process</h2>
          <p>
            Depending on the features you use, the FXSnap app may process chart
            images and analysis settings; locally saved analyses, strategies,
            preferences and risk-planning data; account profile information
            when you link an account; and content you choose to post or send
            through Community or in-app support. Support conversations can
            include text and optional image attachments.
          </p>
          <p>
            The app also sends product events and limited diagnostic
            information to the FXSnap API. The server associates these events
            with an app-scoped device identifier. When persistent event storage
            is enabled, the server code assigns a 90-day expiry; otherwise
            events may remain in server memory temporarily. Error reporting
            through Sentry is enabled only when a valid Sentry DSN is
            configured; the app configuration disables default PII collection.
          </p>
          <h2>How chart analysis is processed</h2>
          <p>
            When you ask for chart analysis, the selected image and analysis
            parameters are sent to the FXSnap backend. The backend forwards
            chart images to its configured AI provider, currently implemented
            through OpenRouter. Provider processing and retention are subject
            to the provider’s terms and the operator’s configuration. The
            project code does not establish a single provider retention period.
            Avoid uploading images that contain passwords, account numbers or
            private messages.
          </p>
          <h2>Accounts, community and support</h2>
          <p>
            Account linking uses Google sign-in through Supabase. If you choose
            account backup, supported FXSnap data can be synced through the
            backend. When Community or private support conversations are
            enabled and used, account details, posts, messages and optional
            images may be processed using Supabase database and storage
            services. The project does not define a public retention schedule
            for all support and community content.
          </p>
          <h2>Other service providers</h2>
          <p>
            Subscription purchases and entitlement checks use RevenueCat and
            the Apple App Store or Google Play billing systems. Push
            notification delivery uses Expo services when notifications are
            enabled. Market information may be requested from providers
            configured for that service. These integrations are conditional on
            product settings and use. The marketing website currently does not
            load Google Analytics, Google Tag Manager or Meta Pixel.
          </p>
          <h2>Storage and deletion</h2>
          <p>
            Some app data is stored locally on your device. Linked-account
            backups and service data may be held by the configured FXSnap
            backend and its providers. Account deletion is available in the
            app’s Settings for signed-in accounts and does not cancel an
            app-store subscription. See the{" "}
            <a className="inline-link" href="/delete-account">account deletion guide</a>.
            Exact retention and any additional rights or procedures depend on
            the operator’s confirmed data practices and applicable law.
          </p>
          <h2>Contact</h2>
          <p>
            For privacy questions, contact{" "}
            <a className="inline-link" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            . The legal identity and jurisdiction of the data controller still
            need to be added to this draft.
          </p>
        </div>
      </section>
    </>
  );
}
