import Link from "next/link";
import { PageStructuredData } from "@/components/structured-data";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

const updatedOn = "4 November 2026";

export const metadata = createMetadata({
  title: "Terms of Use",
  description:
    "Read the terms that apply when you use the FXSnap app, website, AI chart analysis and trader community.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <PageStructuredData
        description="Terms governing use of the FXSnap application and website."
        path="/terms"
        title="FXSnap Terms of Use"
      />
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Terms</p>
          <h1>Terms of use</h1>
          <p>
            Please read these terms before using FXSnap. They explain what the
            service provides and what to expect from AI-assisted analysis,
            Community content and subscriptions.
          </p>
          <p className="legal-updated">Effective date: {updatedOn}</p>
        </div>
      </header>
      <section className="section">
        <article className="container legal-copy">
          <p>
            These Terms of Use (“Terms”) apply to the FXSnap mobile
            application, website and related services (the “Services”). By
            accessing or using the Services, you agree to these Terms. “FXSnap,”
            “we,” and “us” refer to the operator of the Services under the
            FXSnap brand. If you do not agree, do not use the Services.
          </p>

          <h2>Who may use FXSnap</h2>
          <p>
            You must be at least 18 years old and legally able to agree to
            these Terms. The Services are not intended for anyone under 18.
            You are responsible for ensuring that your use is permitted by the
            laws and regulations that apply to you.
          </p>

          <h2>What the Services provide</h2>
          <p>
            FXSnap provides tools that may include AI-assisted chart analysis,
            market information, calculators, educational material, saved
            trading workflows, account sync, subscriptions, Community features,
            live audio events, notifications and support. Features may depend
            on your device, account, subscription, location and service
            availability. We may add, change, suspend or discontinue features
            as the Services evolve.
          </p>

          <h2>Not financial advice; trading risk</h2>
          <p>
            FXSnap is an educational and informational tool. It is not a
            broker, dealer, investment adviser or financial adviser, and it
            does not provide personalized financial, investment, tax or legal
            advice. An analysis, strategy or educational item is not an
            instruction or recommendation to buy, sell, hold, open or close any
            position.
          </p>
          <p>
            Foreign exchange, CFDs and other leveraged products involve
            substantial risk and may not be suitable for everyone. You may
            lose some or all of your capital. AI can misread charts, omit
            context or produce inaccurate, incomplete or outdated content.
            Prices inferred from screenshots are not verified live quotes;
            market information may be delayed or unavailable. Confidence
            scores are model assessments, not probabilities of profit. Past or
            hypothetical results do not guarantee future outcomes.
          </p>
          <p>
            Independently verify instruments, prices, levels, news and
            calculations with your broker and reliable sources before making a
            decision. You alone are responsible for your trading and financial
            decisions, orders, risk limits, taxes and losses. Consider
            independent professional advice where appropriate. See our{" "}
            <Link className="inline-link" href="/disclaimer">
              financial disclaimer
            </Link>
            .
          </p>

          <h2>Your account and security</h2>
          <p>
            Some features require a FXSnap account. You must provide accurate
            information, protect your device and account credentials, and
            promptly tell us if you suspect unauthorized access. You are
            responsible for activity carried out through your account, except
            where applicable law provides otherwise.
          </p>
          <p>
            You may delete a signed-in account in the app’s Settings. Deletion
            removes the FXSnap account and synced backup, and Community records
            may be deleted or de-identified. Deleting your account does not
            cancel an App Store or Google Play subscription. See the{" "}
            <Link className="inline-link" href="/delete-account">
              account deletion guide
            </Link>
            .
          </p>

          <h2>Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>
              Use the Services unlawfully, to defraud or harm others, or in a
              way that violates another person’s rights.
            </li>
            <li>
              Attempt to interfere with, disrupt, probe or gain unauthorized
              access to the Services, accounts, systems or data.
            </li>
            <li>
              Upload malware, spam, threats, harassment, unlawful content or
              content you do not have the right to share.
            </li>
            <li>
              Use automated means to scrape, overload, copy or access the
              Services except where law permits or we authorize it.
            </li>
            <li>
              Upload passwords, API keys, payment credentials, account
              statements or other sensitive information in chart images,
              Community posts or support messages.
            </li>
            <li>
              Misrepresent AI output or use FXSnap to provide regulated
              financial services without the required authorization.
            </li>
          </ul>

          <h2>Community and content you share</h2>
          <p>
            You retain ownership of content you submit. You grant FXSnap a
            worldwide, non-exclusive, royalty-free license to host, store,
            reproduce, adapt for formatting, and display that content as
            reasonably necessary to operate and secure the feature through
            which you chose to share it. This license ends when the content is
            deleted, except for copies retained in backups, content already
            shared by others, or records retained for legal, safety or security
            reasons.
          </p>
          <p>
            Community content may be visible to other users and can be copied
            or shared by them. You are responsible for the content you post
            and for having the rights and permissions needed to share it.
            FXSnap may review, remove or restrict content and may limit or
            suspend access for violations or to protect the Community. We do
            not guarantee that user-generated content is accurate, safe or
            endorsed by FXSnap.
          </p>

          <h2>Subscriptions and in-app purchases</h2>
          <p>
            Paid features, prices, billing periods and trial terms (if any)
            are shown in the applicable app store before purchase and may vary
            by location or platform. Purchases are billed by Apple or Google
            under that store’s payment terms. Subscriptions may automatically
            renew unless canceled before the renewal deadline shown by the
            store. Manage or cancel a subscription in the store account used
            to purchase it. Refunds are handled under the applicable store’s
            policies.
          </p>
          <p>
            RevenueCat helps FXSnap verify purchases and entitlements. Deleting
            a FXSnap account does not cancel a subscription or automatically
            entitle you to a refund. Restore purchases through the app or
            contact the relevant store if needed.
          </p>

          <h2>Intellectual property</h2>
          <p>
            The Services, including their software, design, branding and
            materials (excluding user content and third-party materials), are
            owned by FXSnap or its licensors and are protected by applicable
            intellectual-property laws. We give you a limited, personal,
            revocable, non-transferable license to use the Services for their
            intended purpose, subject to these Terms. No other rights are
            granted.
          </p>

          <h2>Third-party services</h2>
          <p>
            The Services rely on third-party providers for functions such as
            sign-in, cloud storage, AI processing, market data, billing,
            notifications and live audio. Third-party services may have their
            own terms and privacy notices, may change or become unavailable,
            and are not controlled by FXSnap. Your use of those services may
            also be subject to their terms.
          </p>

          <h2>Availability and warranty disclaimer</h2>
          <p>
            We work to keep FXSnap available and useful, but we do not promise
            uninterrupted access, error-free operation, or that information
            will be accurate, complete, current or suitable for your needs. To
            the fullest extent permitted by applicable law, the Services are
            provided “as is” and “as available,” without warranties or
            conditions not expressly stated in these Terms. This does not
            exclude any warranty or consumer right that cannot legally be
            excluded.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by applicable law, FXSnap is not
            liable for indirect, incidental, special, consequential or
            exemplary loss, loss of profits or data, or trading and investment
            losses arising from or related to your use of the Services,
            reliance on AI or market information, or inability to use the
            Services. Nothing in these Terms excludes or limits liability,
            rights or remedies that applicable law does not allow to be
            excluded or limited.
          </p>

          <h2>Suspension and termination</h2>
          <p>
            You may stop using the Services at any time and delete your account
            in the app. We may suspend or end access if you materially breach
            these Terms, create a security or legal risk, or where we
            discontinue a feature or the Services. Where reasonably possible,
            we will provide notice. Sections that by their nature should
            continue, including user-content licenses for retained copies,
            intellectual property, disclaimers, liability limits and dispute
            provisions, survive termination.
          </p>

          <h2>Changes to these Terms</h2>
          <p>
            We may update these Terms to reflect changes to FXSnap or legal
            requirements. The current version and effective date will be
            published on this page. If a change materially affects your
            rights, we will provide additional notice where required.
            Continued use after an update takes effect means you accept the
            updated Terms to the extent permitted by law.
          </p>

          <h2>Applicable law and contact</h2>
          <p>
            These Terms are subject to the laws and mandatory consumer
            protections that apply to you and to the operator of the Services.
            Any dispute will be handled by a court or other forum with
            jurisdiction under those applicable laws. Nothing in this section
            removes a right to bring a claim in a forum that applicable law
            makes available to you.
          </p>
          <p>
            For questions about these Terms, contact{" "}
            <a className="inline-link" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            .
          </p>
        </article>
      </section>
    </>
  );
}
