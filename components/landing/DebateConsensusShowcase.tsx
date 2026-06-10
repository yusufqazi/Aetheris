"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BrainCircuit, FlaskConical, Microscope, ShieldAlert } from "lucide-react";

const positions = [
  {
    agent: "Drug Interaction Agent",
    message: "Potential CYP3A4 interaction concern appears in labeling language.",
    confidence: "Severity unresolved",
    icon: FlaskConical,
  },
  {
    agent: "Adverse Reaction Agent",
    message: "Safety signals recur across uploaded labeling excerpts.",
    confidence: "High overlap",
    icon: ShieldAlert,
  },
  {
    agent: "Clinical Trial Summarizer",
    message: "Study population and follow-up duration remain limited.",
    confidence: "Bounded evidence",
    icon: Microscope,
  },
];

const consensusChecks = [
  "Agreement: recurring nausea and dizziness are source-supported.",
  "Disagreement: interaction severity cannot be established from the upload.",
  "Missing evidence: exposure-response appendix coverage is incomplete.",
  "Escalation boundary: clinical review is required before operational use.",
];

export function DebateConsensusShowcase() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="section-shell px-4 pt-20" id="consensus">
      <div className="mx-auto max-w-3xl text-center">
        <p className="section-label">Evidence Conflict / Consensus</p>
        <h2 className="section-title mt-3">
          The system challenges the evidence before it concludes.
        </h2>
        <p className="section-copy mt-3">
          Aetheris does not simply summarize PDFs. It compares agent findings, keeps missing
          context visible, and only then drafts a bounded research conclusion.
        </p>
      </div>

      <div className="relative mt-10 overflow-hidden rounded-[2.2rem] border border-[var(--border)] bg-[linear-gradient(145deg,var(--panel),rgba(7,17,31,0.86))] p-5 shadow-[var(--shadow-hero)] backdrop-blur-2xl lg:p-7">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#1d4ed8]/[0.14] blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-[#60a5fa]/[0.1] blur-3xl" />
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(191,219,254,0.58),transparent)]" />

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
          viewBox="0 0 1120 560"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="consensus-line" x1="180" x2="900" y1="280" y2="280">
              <stop stopColor="#60a5fa" stopOpacity="0.08" />
              <stop offset="0.5" stopColor="#bfdbfe" stopOpacity="0.56" />
              <stop offset="1" stopColor="#60a5fa" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          {[150, 280, 410].map((y, index) => (
            <motion.path
              key={y}
              d={`M 160 ${y} C 365 ${y} 520 ${280 + (index - 1) * 22} 730 280`}
              fill="none"
              stroke="url(#consensus-line)"
              strokeLinecap="round"
              strokeWidth="2"
              initial={{ pathLength: reduceMotion ? 1 : 0, opacity: reduceMotion ? 0.45 : 0 }}
              whileInView={{ pathLength: 1, opacity: 0.76 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.9, delay: index * 0.12, ease: "easeOut" }}
            />
          ))}
        </svg>

        <div className="relative grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="grid gap-3">
            {positions.map((position, index) => {
              const Icon = position.icon;

              return (
                <motion.div
                  key={position.agent}
                  initial={reduceMotion ? false : { opacity: 0, x: -18, rotateY: -4 }}
                  whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ delay: index * 0.09, duration: 0.42, ease: "easeOut" }}
                  className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.74),rgba(19,34,56,0.52))] p-4 shadow-[0_18px_60px_rgba(2,6,23,0.24)] backdrop-blur-xl"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {position.agent}
                        </p>
                        <span className="rounded-full border border-white/10 bg-white/[0.055] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {position.confidence}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {position.message}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.55, delay: 0.18, ease: "easeOut" }}
            className="relative overflow-hidden rounded-[1.85rem] border border-[var(--accent-border)] bg-[linear-gradient(180deg,rgba(191,219,254,0.12),var(--panel-strong))] p-5 shadow-[0_28px_95px_rgba(37,99,235,0.2)]"
          >
            <div className="pointer-events-none absolute -right-12 -top-10 h-44 w-44 rounded-full bg-[#60a5fa]/[0.16] blur-3xl" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)] shadow-[0_0_45px_rgba(96,165,250,0.18)]">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-bright)]">
                  Consensus layer
                </p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
                  Flag as research concern with visible uncertainty.
                </h3>
              </div>
            </div>

            <p className="relative mt-4 text-sm leading-7 text-[var(--text-secondary)]">
              Additional PK evidence is recommended before escalation. The conclusion remains
              research support, not a treatment, regulatory, or operational recommendation.
            </p>

            <div className="relative mt-5 grid gap-2.5">
              {consensusChecks.map((check, index) => (
                <motion.div
                  key={check}
                  initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.35, delay: 0.24 + index * 0.06, ease: "easeOut" }}
                  className="rounded-[1.1rem] border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)]"
                >
                  {check}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
