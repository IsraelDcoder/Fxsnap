import type { Metadata } from "next";
import { Calculator } from "@/components/risk-reward-calculator";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Forex Risk-to-Reward Calculator",
  description:
    "Calculate a potential trade's risk-to-reward ratio using entry, stop-loss and take-profit prices.",
  path: "/risk-reward-calculator",
});

export default function RiskRewardPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">Free trading tool</p>
          <h1>Forex risk-to-reward calculator</h1>
          <p>
            Compare the price distance to a stop with the distance to a target.
            This calculator does not estimate probability, profit or position
            size.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container">
          <Calculator />
          <p className="calculator-disclaimer">
            This tool provides a simple arithmetic comparison only. It does not
            include spreads, commissions, slippage, financing costs or the
            chance of either level being reached. It is not financial advice.
          </p>
        </div>
      </section>
    </>
  );
}
