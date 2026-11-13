import Link from "next/link";
import { PageStructuredData } from "@/components/structured-data";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

const updatedOn = "4 November 2026";

export const metadata = createMetadata({
  title: "Privacy Policy",
  description:
    "Learn how FXSnap collects, uses, shares, stores and protects information when you use the app and website.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <PageStructuredData
        description="How FXSnap processes personal information in its app and website."
        path="/privacy"
        title="FXSnap Privacy Policy"
      />
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Privacy</p>
          <h1>Privacy policy</h1>
          <p>
            This policy explains what information FXSnap processes, why it is
            used, when it is shared, and how you can manage or delete it.
          </p>
          <p className="legal-updated">Effective date: {updatedOn}</p>
        </div>
      </header>
      <section className="section">
        <article className="container legal-copy">
          <p>
            FXSnap is the service brand for the FXSnap mobile application and
            website (together, the “Services”). In this policy, “FXSnap,” “we,”
            and “us” refer to the operator of those Services. Questions or
            privacy requests can be sent to{" "}
            <a className="inline-link" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            .
          </p>

          <h2>Information we process</h2>
          <ul>
            <li>
              <strong>Account information:</strong> if you sign in with Google,
              we receive account identifiers and profile details made
              available by Google, such as your name, email address, profile
              image and email-verification status. We also create FXSnap
              account and session records.
            </li>
            <li>
              <strong>App and device information:</strong> the app creates a
              random app-scoped device identifier for API sessions, access
              controls, subscriptions and service operation. We also receive
              the platform and app version when needed for a feature, such as
              support or push notifications. This identifier is not an
              advertising ID.
            </li>
            <li>
              <strong>Product activity and diagnostics:</strong> the app sends
              product events such as app opens, analysis attempts and results,
              and some feature interactions. Events can include the event
              time, pair or timeframe, result status, confidence score and
              limited error details. If crash reporting is configured, Sentry
              may receive diagnostic information such as device and software
              details, stack traces and error context. Default personal-data
              collection is disabled in that integration, but information
              included in an error or event can still be present.
            </li>
            <li>
              <strong>Content and preferences:</strong> chart images and
              analysis inputs you submit; saved analyses, strategies, briefs,
              risk-planning activity and settings; learning progress; and
              notification preferences. Much of this information is kept on
              your device. If you enable account sync, supported app data is
              also backed up to your FXSnap account.
            </li>
            <li>
              <strong>Community and support content:</strong> if you use these
              features, we process your username and profile image, posts,
              comments, reactions, follows, reports, event participation,
              support messages and any attachments you choose to send.
              Support requests may also include your app version, platform and
              selected topic.
            </li>
            <li>
              <strong>Purchase information:</strong> RevenueCat and the Apple
              App Store or Google Play provide purchase and entitlement
              information such as product, transaction and subscription
              status. FXSnap does not receive your full payment-card number
              from an in-app purchase.
            </li>
            <li>
              <strong>Push-notification information:</strong> if you enable
              notifications, we process your push token, platform and chosen
              notification categories so we and our delivery providers can
              send the notifications you requested.
            </li>
          </ul>

          <h2>How we use information</h2>
          <ul>
            <li>Provide, operate and maintain app and website features.</li>
            <li>
              Analyze chart images, return requested market information, and
              provide trading calculators and educational content.
            </li>
            <li>
              Create and secure accounts, sync user-requested backups, enforce
              access limits, and verify subscription entitlements.
            </li>
            <li>
              Host Community and live event features, respond to support
              requests, and protect users and the Services from abuse.
            </li>
            <li>
              Send notifications you enable, measure basic product usage,
              diagnose errors, and improve reliability.
            </li>
            <li>
              Meet legal obligations and establish, exercise or defend legal
              claims.
            </li>
          </ul>
          <p>
            Where applicable privacy law requires a legal basis, processing is
            based on providing a feature you request, our legitimate interests
            in operating and protecting the Services, compliance with legal
            obligations, or your consent where required. You can withdraw
            consent for optional notifications through your device or app
            settings.
          </p>

          <h2>Chart images, AI and market data</h2>
          <p>
            When you request chart analysis or an AI-generated strategy, the
            image or inputs are sent to the FXSnap backend and forwarded to
            the AI service configured for that feature, currently implemented
            through OpenRouter. The AI provider and, where applicable, its
            model provider process the request to return a result. We do not
            control all provider-side retention or processing; those providers’
            terms and privacy notices also apply. Avoid uploading images that
            show passwords, account numbers, payment details, private messages
            or other information you do not want processed by these services.
          </p>
          <p>
            Market news, calendars and other market information may be
            requested from providers configured for the feature, including
            Twelve Data and Finnhub. These requests may reveal the requested
            instrument or market topic and technical request information to
            the relevant provider. Chart-image analysis is not the same as a
            verified live quote.
          </p>

          <h2>When information is shared</h2>
          <p>
            We share information only as needed to provide and protect the
            Services, including with:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> for authentication, account data,
              Community, support, event and storage services.
            </li>
            <li>
              <strong>OpenRouter and its configured AI model providers</strong>
              for chart analysis and AI features you request.
            </li>
            <li>
              <strong>Twelve Data and Finnhub</strong> for market information
              when those integrations are enabled and used.
            </li>
            <li>
              <strong>RevenueCat, Apple and Google</strong> to process and
              validate in-app purchases and subscriptions.
            </li>
            <li>
              <strong>Expo and platform push services</strong> to deliver
              notifications you enable.
            </li>
            <li>
              <strong>LiveKit</strong> to provide live audio/event features
              when you join them.
            </li>
            <li>
              <strong>Sentry</strong> for error reporting when a valid
              production configuration is enabled.
            </li>
            <li>
              Service providers that host, secure or support the Services,
              and authorities or other parties when disclosure is required by
              law or necessary to protect rights and safety.
            </li>
          </ul>
          <p>
            Community posts and profile details you submit for public display
            can be seen by other Community members. Do not post personal,
            financial-account or confidential information. We do not sell
            personal information or use it for third-party targeted
            advertising.
          </p>

          <h2>Storage, transfers and retention</h2>
          <p>
            Information may be processed in countries where FXSnap or its
            service providers operate. Those countries may have privacy laws
            different from the laws where you live. Where required, appropriate
            safeguards are used for international transfers.
          </p>
          <p>
            We keep information for as long as needed for the purposes
            described in this policy, to provide your account and requested
            features, and to meet legal, security and dispute-resolution
            requirements. Product events are configured to expire after up to
            90 days; certain generated-signal records may be kept for up to one
            year. Account profiles and synced backups are kept until you delete
            your account or they are no longer needed. Provider, purchase,
            security and backup records may have separate retention periods.
          </p>

          <h2>Your choices and privacy rights</h2>
          <ul>
            <li>
              Manage notification permissions and categories in device or app
              settings. Turning notifications off removes the app’s
              registration from the FXSnap service when the app can reach the
              service.
            </li>
            <li>
              Manage locally stored app data through available app settings.
              Deleting your account clears FXSnap data from the device; you
              can also clear app data through your device settings. Information
              stored only on that device may then be lost.
            </li>
            <li>
              Delete a signed-in FXSnap account from the app’s Settings. This
              removes the account and synced FXSnap backup; related Community
              records are deleted or de-identified as described below.
            </li>
            <li>
              Contact us to request access, correction, deletion, restriction
              or a copy of personal information, or to object to processing,
              where those rights apply. We may need to verify your identity
              before acting.
            </li>
          </ul>
          <p>
            Account deletion does not cancel an Apple or Google subscription;
            cancel it separately through the store where you purchased it.
            Some Community posts may remain visible with the author replaced
            by “Deleted member” so existing conversations remain coherent.
            Backups, security records or information required by law may remain
            for a limited period before deletion or de-identification.
          </p>
          <p>
            See our{" "}
            <Link className="inline-link" href="/delete-account">
              account deletion guide
            </Link>{" "}
            for instructions.
          </p>

          <h2>Children</h2>
          <p>
            The Services are intended only for people aged 18 or older. We do
            not knowingly collect personal information from anyone under 18.
            If you believe a person under 18 has provided information to us,
            contact us so we can review and delete it where appropriate.
          </p>

          <h2>Website technologies</h2>
          <p>
            The FXSnap marketing website does not currently use Google
            Analytics, advertising pixels or a contact form. The website host
            and security services may process technical request information,
            such as IP address, browser and access time, to deliver and protect
            the site. If we add analytics, advertising or other optional
            tracking technologies, we will update this policy and provide any
            choices required by law.
          </p>

          <h2>Changes and contact</h2>
          <p>
            We may update this policy as the Services change or legal
            requirements evolve. We will publish the revised policy here and
            update its effective date. If a change materially affects how
            information is used, we will provide additional notice where
            required.
          </p>
          <p>
            For privacy questions or requests, email{" "}
            <a className="inline-link" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            . Please do not send passwords, payment-card details or account
            credentials.
          </p>
        </article>
      </section>
    </>
  );
}
