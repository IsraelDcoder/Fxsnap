import { createMetadata } from "@/lib/metadata";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "FXSnap Support",
  description:
    "Find support for the FXSnap app and learn where to get help with account and product questions.",
  path: "/support",
});

export default function SupportPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Help and support</p>
          <h1>How can we help?</h1>
          <p>
            For help with the FXSnap app, use the private in-app support
            conversation or email our support address. This website does not
            collect account details or chart screenshots through a contact
            form.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container disclaimer-copy">
          <h2>App and account questions</h2>
          <p>
            Open FXSnap and navigate to Support Chat for product assistance.
            You can also email{" "}
            <a className="inline-link" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>
            . Never send passwords, payment-card details or private account
            credentials in a support message.
          </p>
          <h2>Subscription questions</h2>
          <p>
            Subscription purchases and cancellations are managed through the
            app store used for the purchase. Review the store’s subscription
            settings and the terms shown in the app.
          </p>
          <p>
            <Link className="inline-link" href="/delete-account">
              Learn how to delete an account
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
