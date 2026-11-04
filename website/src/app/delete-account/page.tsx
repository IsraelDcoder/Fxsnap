import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { createMetadata } from "@/lib/metadata";
import { siteConfig } from "@/lib/site";

export const metadata = createMetadata({
  title: "Delete Your FXSnap Account",
  description:
    "Learn how to delete a signed-in FXSnap account in the app and what account deletion does not remove.",
  path: "/delete-account",
});

export default function DeleteAccountPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Account and data</p>
          <h1>Delete your FXSnap account.</h1>
          <p>
            Signed-in users can start account deletion from the FXSnap app’s
            Settings screen. Deletion is permanent and cannot be undone.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container legal-draft deletion-content">
          <h2>Delete your account in the app</h2>
          <ol>
            <li>Open FXSnap and go to Settings.</li>
            <li>Find the account section and choose “Delete account”.</li>
            <li>Review the confirmation and confirm deletion.</li>
          </ol>
          <p>
            The app removes the signed-in FXSnap account and this device’s
            saved FXSnap data. For linked accounts, the service also deletes
            the account record and associated FXSnap account backup. If
            Community account cleanup is enabled, that cleanup is attempted
            before deletion completes.
          </p>
          <div className="draft-notice">
            Account deletion does not cancel an Apple App Store or Google Play
            subscription. Cancel it separately in the store where you
            subscribed. The app’s deletion flow may report an error if a
            required service cannot confirm deletion.
          </div>
          <h2>Can’t access the app?</h2>
          <p>
            Email{" "}
            <a className="inline-link" href={`mailto:${siteConfig.supportEmail}`}>
              {siteConfig.supportEmail}
            </a>{" "}
            for help with account deletion. Do not email your password,
            payment-card details or account credentials.
          </p>
          <p>
            <Link className="inline-link" href="/privacy">
              Read the privacy policy <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
