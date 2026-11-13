import { ArrowUpRight, Mail } from "lucide-react";
import { PageStructuredData } from "@/components/structured-data";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Contact FXSnap",
  description:
    "Contact FXSnap support for questions about the app, account or subscription.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <PageStructuredData
        description="Contact FXSnap support for questions about the app, account or subscription."
        path="/contact"
        title="Contact FXSnap"
        type="ContactPage"
      />
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Contact</p>
          <h1>Talk to the FXSnap team.</h1>
          <p>
            For help with the app, account access or subscriptions, reach out
            using the support channel below. Do not send passwords, payment
            details or chart screenshots containing private information.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container contact-panel">
          <div className="pricing-icon"><Mail aria-hidden="true" size={21} /></div>
          <div>
            <p className="eyebrow">Product and account support</p>
            <h2>{siteConfig.supportEmail}</h2>
            <p>
              If you can access the app, you can also start a private support
              conversation from its Settings screen.
            </p>
          </div>
          <a className="button button-lime" href={`mailto:${siteConfig.supportEmail}`}>
            Email support <ArrowUpRight aria-hidden="true" size={15} />
          </a>
        </div>
      </section>
    </>
  );
}
