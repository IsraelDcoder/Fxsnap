import { Smartphone } from "lucide-react";
import { createMetadata } from "@/lib/metadata";
import { StoreCtas } from "@/components/store-ctas";

export const metadata = createMetadata({
  title: "Download FXSnap",
  description:
    "Find FXSnap on Google Play and learn what to expect from the AI-powered forex chart analysis app.",
  path: "/download",
});

export default function DownloadPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Get the app</p>
          <h1>FXSnap, in your pocket.</h1>
          <p>
            Use FXSnap to explore AI-assisted analysis of trading-chart
            screenshots. FXSnap is available on Android and iOS.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container">
          <div className="download-card">
            <div className="pricing-icon"><Smartphone aria-hidden="true" size={21} /></div>
            <div>
              <p className="eyebrow">Android</p>
              <h2>Get FXSnap on Google Play</h2>
              <p>Review the official listing for current compatibility and availability.</p>
            </div>
            <StoreCtas compact platform="android" />
          </div>
          <div className="download-ios" id="ios">
            <p className="eyebrow">iOS</p>
            <h2>App Store link coming soon</h2>
            <p>The app is live on iOS. The direct App Store listing link will be added here.</p>
            <StoreCtas compact platform="ios" />
          </div>
        </div>
      </section>
    </>
  );
}
