"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { StoreCtas } from "@/components/store-ctas";

export function CinematicHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="hero">
      <div aria-hidden="true" className="hero-atmosphere">
        <motion.span
          className="hero-orb hero-orb-one"
          animate={reduceMotion ? undefined : { x: [0, 28, -10, 0], y: [0, -16, 20, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="hero-orb hero-orb-two"
          animate={reduceMotion ? undefined : { x: [0, -20, 12, 0], y: [0, 17, -12, 0] }}
          transition={{ duration: 23, repeat: Infinity, ease: "easeInOut" }}
        />
        <svg className="hero-chart-trace" fill="none" viewBox="0 0 640 330">
          <path d="M5 256 84 225 137 241 194 176 248 194 307 132 352 157 416 86 468 115 528 44 575 71 635 18" />
          <path className="hero-chart-trace-secondary" d="M0 293 95 264 174 276 246 230 328 248 405 188 492 206 571 148 640 163" />
        </svg>
      </div>
      <div className="container hero-grid">
        <motion.div
          className="hero-copy-column"
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.13, delayChildren: 0.1 } },
          }}
        >
          <motion.p
            className="eyebrow hero-eyebrow"
            variants={{
              hidden: { opacity: 0, y: 14 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            AI chart analysis <span /> Trader community
          </motion.p>
          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 35, filter: "blur(10px)" },
              visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.95, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            Drop a chart.
            <br />
            <span>Get the trade.</span>
          </motion.h1>
          <motion.p
            className="hero-copy"
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.72, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            Screenshot any chart. FXSnap turns what it can read into a
            structured setup—entry, stop loss, take profit and risk:reward.
            Then take your analysis to the trader community and make the call.
          </motion.p>
          <motion.div
            className="hero-actions"
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            <StoreCtas />
          </motion.div>
          <motion.div
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { duration: 0.7 } },
            }}
          >
            <Link className="hero-explore-link" href="#how-it-works">
              See how it works <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </motion.div>
          <motion.div
            className="hero-note"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { duration: 0.8 } },
            }}
          >
            <span aria-hidden="true" className="dot" />
            Screenshot-based analysis. Your decision stays yours.
          </motion.div>
        </motion.div>

        <div aria-label="Example XAU/USD setup generated from a chart screenshot" className="hero-visual">
          <div aria-hidden="true" className="hero-visual-ring hero-visual-ring-one" />
          <div aria-hidden="true" className="hero-visual-ring hero-visual-ring-two" />
          <motion.div
            className="setup-card"
            initial={reduceMotion ? false : { opacity: 0, y: 32, rotateX: 5, scale: 0.97 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: [32, 0, -7, 0], rotateX: [5, 0, 0], scale: [0.97, 1, 1] }}
            transition={{
              duration: 1.2,
              delay: 0.22,
              ease: [0.22, 1, 0.36, 1],
              y: { duration: 8, delay: 1.4, repeat: reduceMotion ? 0 : Infinity, repeatType: "reverse", ease: "easeInOut" },
            }}
          >
            <div className="setup-card-topline">
              <span className="setup-status"><span /> Example setup</span>
              <span className="setup-menu" aria-hidden="true">•••</span>
            </div>
            <div className="setup-market">
              <div>
                <span className="setup-symbol">XAU/USD</span>
                <span className="setup-context">4H structure <i /> 15M entry</span>
              </div>
              <span className="setup-side"><ArrowDownRight aria-hidden="true" size={14} /> BUY</span>
            </div>
            <div aria-hidden="true" className="setup-chart">
              <span className="chart-level chart-level-entry"><i>ENTRY</i><b>4,150.00</b></span>
              <span className="chart-level chart-level-stop"><i>STOP</i><b>4,140.00</b></span>
              <svg fill="none" preserveAspectRatio="none" viewBox="0 0 460 126">
                <defs>
                  <linearGradient id="chart-area" x1="230" x2="230" y1="0" y2="126" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#b7ff32" stopOpacity=".17" />
                    <stop offset="1" stopColor="#b7ff32" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 94 26 86 46 94 66 66 88 77 107 52 128 63 150 45 172 54 192 30 215 41 234 24 256 40 277 19 298 30 319 12 341 25 364 10 384 18 408 5 430 13 460 2V126H0V94Z" fill="url(#chart-area)" />
                <path d="M0 94 26 86 46 94 66 66 88 77 107 52 128 63 150 45 172 54 192 30 215 41 234 24 256 40 277 19 298 30 319 12 341 25 364 10 384 18 408 5 430 13 460 2" stroke="#b7ff32" strokeWidth="2" />
              </svg>
              <span className="chart-current-point" />
            </div>
            <div className="setup-levels">
              <div><span>ENTRY</span><strong>4,150.00</strong></div>
              <div><span>STOP LOSS</span><strong>4,140.00</strong></div>
              <div><span>TAKE PROFIT</span><strong>4,170.00</strong></div>
              <div><span>RISK : REWARD</span><strong className="setup-ratio">1 : 2</strong></div>
            </div>
            <div className="setup-checks">
              <span><Check aria-hidden="true" size={13} /> Levels checked</span>
              <span><Check aria-hidden="true" size={13} /> R:R verified</span>
              <span><ShieldCheck aria-hidden="true" size={13} /> Review before acting</span>
            </div>
          </motion.div>
          <div className="setup-footnote">
            Example only · screenshot-derived values, not live prices
          </div>
        </div>
      </div>
    </section>
  );
}
