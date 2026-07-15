"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, UploadCloud } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

const agentStates = ["Retrieval ready", "Safety agent active", "Consensus queued"];

export function FinalCta() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate -mt-px overflow-hidden bg-[#020711] px-4 pb-24 pt-40 sm:pb-28 sm:pt-48 lg:pt-56">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[18rem] z-0 h-[38rem] w-[74rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.24),rgba(37,99,235,0.08)_42%,transparent_72%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[42rem] z-0 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.1),transparent_68%)] blur-3xl"
      />

      <div className="section-shell relative z-10">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 54 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: false, amount: 0.28 }}
          transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-5xl text-center"
        >
          <p className="section-label">Final Workspace Preview</p>
          <h2 className="mx-auto mt-4 max-w-4xl text-[clamp(2.6rem,5vw,5.4rem)] font-medium leading-[0.98] tracking-[-0.055em] text-white">
            Ready to turn documents into evidence-backed research?
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
            Step into the Aetheris workspace and transform complex clinical documents into
            structured, traceable research briefings.
          </p>
        </motion.div>

        <motion.div
          className="mx-auto mt-12 max-w-5xl"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.965, y: 76 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: false, amount: 0.28 }}
          transition={{ delay: 0.16, duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="relative overflow-hidden rounded-[2rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(15,23,42,0.72),rgba(7,17,31,0.94)_48%,rgba(37,99,235,0.22))] p-4 shadow-[0_42px_160px_rgba(2,6,23,0.72),0_0_90px_rgba(37,99,235,0.16)] backdrop-blur-2xl sm:p-5 lg:p-6"
          >
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(219,234,254,0.72),transparent)]" />
            <div className="relative grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
              <div className="rounded-[1.45rem] border border-white/[0.08] bg-black/[0.16] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent-bright)]">
                      Workspace
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Clinical evidence session</h3>
                  </div>
                  <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent-bright)]">
                    Ready
                  </span>
                </div>

                <div className="mt-5 rounded-[1.2rem] border border-dashed border-blue-100/[0.22] bg-white/[0.035] p-5 text-left">
                  <UploadCloud className="h-5 w-5 text-[var(--accent-bright)]" />
                  <p className="mt-4 text-sm font-semibold text-white">Drop clinical documents</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    oncology-study.pdf, safety-label.pdf, exposure-appendix.pdf
                  </p>
                </div>

                <div className="mt-4 space-y-2.5">
                  {agentStates.map((state) => (
                    <div
                      key={state}
                      className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-white/[0.07] bg-white/[0.04] px-3 py-2.5"
                    >
                      <span className="text-sm text-[var(--text-secondary)]">{state}</span>
                      <CheckCircle2 className="h-4 w-4 text-[var(--accent-bright)]" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.45rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,23,42,0.68),rgba(8,16,30,0.82))] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent-bright)]">
                      Evidence-backed briefing
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Research session ready</h3>
                  </div>
                  <span className="rounded-full bg-white/[0.07] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    Traceable
                  </span>
                </div>

                <div className="mt-5 space-y-3 text-left">
                  <PreviewLine label="Finding" value="Recurring safety signal identified across sources." />
                  <PreviewLine label="Evidence" value="Source-linked excerpts are attached for review." />
                  <PreviewLine label="Next step" value="Generate a structured briefing with visible uncertainty." />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="mt-10 flex flex-col items-center"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: 34 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: false, amount: 0.35 }}
          transition={{ delay: 0.36, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/research/new"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#1d4ed8,#60a5fa)] px-6 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(37,99,235,0.34)] transition duration-300 hover:translate-y-[-1px] hover:shadow-[0_24px_70px_rgba(37,99,235,0.46)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-bright)]"
            >
              Launch Workspace
              <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="https://github.com/yusufqazi/Aetheris"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full border border-blue-100/[0.24] bg-[#071a31]/80 px-6 text-sm font-semibold text-blue-50 shadow-[0_18px_50px_rgba(2,6,23,0.28)] backdrop-blur-xl transition duration-300 hover:translate-y-[-1px] hover:border-[var(--accent-border)] hover:bg-[#0b2442] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-bright)]"
            >
              View GitHub Repository
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PreviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/[0.07] bg-white/[0.04] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
