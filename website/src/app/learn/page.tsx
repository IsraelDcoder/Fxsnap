import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title: "Forex Learning Centre | FXSnap",
  description:
    "Explore practical guides to forex chart analysis, technical concepts and risk-to-reward planning.",
  path: "/learn",
});

const guides = [
  { category: "Foundations", title: "How to analyse forex charts", href: "/learn/forex-chart-analysis", summary: "A structured way to observe price, timeframe and chart context." },
  { category: "Technical analysis", title: "Support and resistance", href: "/learn/support-and-resistance", summary: "Understand price areas traders use to frame market behaviour." },
  { category: "Risk management", title: "Risk-to-reward explained", href: "/learn/risk-to-reward", summary: "Learn the basic calculation and what a ratio can—and cannot—tell you." },
];

export default function LearnPage() {
  return (
    <>
      <header className="page-hero">
        <div className="container">
          <p className="eyebrow">FXSnap learning centre</p>
          <h1>Learn the ideas behind the chart.</h1>
          <p>
            Clear, educational introductions to forex chart analysis and risk
            planning. No guide can remove trading risk or provide a personal
            recommendation.
          </p>
        </div>
      </header>
      <section className="section">
        <div className="container">
          <div className="article-grid">
            {guides.map((guide) => (
              <Link className="article-link" href={guide.href} key={guide.href}>
                <span>{guide.category}</span>
                <h2>{guide.title}</h2>
                <p>{guide.summary}</p>
                <span className="article-read">Read guide <ArrowRight aria-hidden="true" size={14} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
