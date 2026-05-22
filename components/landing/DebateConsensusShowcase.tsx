"use client";

import { motion } from "framer-motion";
import { BrainCircuit, FlaskConical, Microscope, ShieldAlert } from "lucide-react";

const positions = [
  {
    agent: "Drug Interaction Agent",
    message: "Potential interaction risk detected in inhibitor-exposed cohorts.",
    icon: FlaskConical,
  },
  {
    agent: "Trial Summarizer",
    message: "Evidence remains narrow in the uploaded study population.",
    icon: Microscope,
  },
  {
    agent: "Adverse Reaction Agent",
    message: "Safety signal appears in multiple excerpts across the source set.",
    icon: ShieldAlert,
  },
];

export function DebateConsensusShowcase() {
  return (
    <section className="section-shell px-4 pt-16" id="consensus">
      <div className="grid gap-5 lg:grid-cols-[1.04fr_0.96fr] lg:items-start">
        <div className="rounded-[1.9rem] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadow-md)]">
          <p className="section-label">Debate / Consensus</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            Three viewpoints in, one bounded conclusion out.
          </h2>

          <div className="mt-5 grid gap-3">
            {positions.map((position, index) => {
              const Icon = position.icon;

              return (
                <motion.div
                  key={position.agent}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ delay: index * 0.07, duration: 0.35 }}
                  className="rounded-[1.3rem] border border-[var(--border)] bg-[var(--panel-strong)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {position.agent}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {position.message}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.9rem] border border-[var(--accent-border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-strong))] p-5 shadow-[var(--shadow-lg)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-bright)]">
                Consensus output
              </p>
              <h3 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
                Flag as research concern; requires clinical review.
              </h3>
            </div>
          </div>

          <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
            Aetheris keeps disagreement visible, weights the evidence, and preserves the
            boundary between research synthesis and clinical decision-making.
          </p>

          <div className="mt-5 rounded-[1.25rem] bg-[var(--panel-muted)] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Why this matters
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
              The homepage introduces the product as a multi-agent system, not a single-answer
              chatbot wrapper.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
