"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit, FileStack, Files, GitCompareArrows, ScrollText, SearchCode } from "lucide-react";
import { useState } from "react";

const steps = [
  {
    title: "Upload source documents",
    detail: "Source intake",
    copy: "Clinical studies, labels, and internal PDFs enter a workspace built for document-first research review.",
    icon: Files,
    accent: "from-[#1d4ed8]/30 to-transparent",
    visual: "documents",
  },
  {
    title: "Extract and chunk text",
    detail: "Text preparation",
    copy: "Aetheris turns long PDFs into structured passages so retrieval and downstream review stay source-grounded.",
    icon: FileStack,
    accent: "from-[#2563eb]/28 to-transparent",
    visual: "chunks",
  },
  {
    title: "Retrieve evidence",
    detail: "Evidence ranking",
    copy: "The system surfaces the most relevant excerpts before specialist reasoning begins.",
    icon: SearchCode,
    accent: "from-[#60a5fa]/24 to-transparent",
    visual: "retrieval",
  },
  {
    title: "Run specialist agents",
    detail: "Parallel review",
    copy: "Retrieval, safety, interaction, and trial agents review the same evidence from distinct perspectives.",
    icon: BrainCircuit,
    accent: "from-[#38bdf8]/24 to-transparent",
    visual: "agents",
  },
  {
    title: "Compare disagreements",
    detail: "Consensus shaping",
    copy: "Conflicts, missing evidence, and confidence gaps are preserved instead of flattened away.",
    icon: GitCompareArrows,
    accent: "from-[#93c5fd]/22 to-transparent",
    visual: "debate",
  },
  {
    title: "Generate final briefing",
    detail: "Report delivery",
    copy: "The final memo combines summary, evidence, uncertainty, and follow-up direction in a single artifact.",
    icon: ScrollText,
    accent: "from-[#bfdbfe]/20 to-transparent",
    visual: "report",
  },
] as const;

export function WorkflowTimeline() {
  const [activeStep, setActiveStep] = useState(0);
  const active = steps[activeStep];
  const ActiveIcon = active.icon;

  return (
    <section className="section-shell px-4 pt-16" id="workflow">
      <div className="mx-auto max-w-3xl text-center">
        <p className="section-label">How Aetheris Works</p>
        <h2 className="section-title mt-3">
          A tighter scroll story that introduces the workflow one beat at a time.
        </h2>
        <p className="section-copy mt-3">
          Click through the pipeline to see how documents move from intake to a structured
          research briefing.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === activeStep;

            return (
              <button
                key={step.title}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`group relative w-full overflow-hidden rounded-[1.45rem] border p-4 text-left transition duration-300 ${
                  isActive
                    ? "border-[var(--accent-border)] bg-[var(--panel-strong)] shadow-[var(--shadow-md)]"
                    : "border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--panel-strong)]"
                }`}
              >
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#60a5fa,transparent)] transition-opacity ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                        0{index + 1}
                      </span>
                      <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                        {step.detail}
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {step.copy}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-[1.9rem] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadow-lg)] lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.title}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--panel-strong)] p-5 lg:p-6"
            >
              <div className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.12),transparent_36%)]`} />
              <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${active.accent}`} />

              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-bright)]">
                      Story beat
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                      {active.title}
                    </h3>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
                    <ActiveIcon className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                  {active.copy}
                </p>

                <div className="mt-6">
                  <StepScene type={active.visual} />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Step {activeStep + 1} of {steps.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveStep((current) => (current === 0 ? steps.length - 1 : current - 1))}
                className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-primary)] transition hover:bg-[var(--panel-muted)]"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setActiveStep((current) => (current + 1) % steps.length)}
                className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm text-[var(--text-primary)] transition hover:bg-[var(--panel-muted)]"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepScene({
  type,
}: {
  type: (typeof steps)[number]["visual"];
}) {
  const commonCard =
    "rounded-[1.15rem] border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--text-primary)]";

  if (type === "documents") {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <div className={commonCard}>Study dossier.pdf</div>
        <div className={commonCard}>Safety labeling.pdf</div>
        <div className={commonCard}>Exposure appendix.pdf</div>
      </div>
    );
  }

  if (type === "chunks") {
    return (
      <div className="space-y-3">
        {[82, 68, 74].map((width, index) => (
          <div key={width} className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--panel-muted)] p-3">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[var(--panel)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Chunk 0{index + 1}
              </span>
              <div className="h-2 rounded-full bg-[var(--panel)]" style={{ width: `${width}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "retrieval") {
    return (
      <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--panel-muted)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Query
          </p>
          <p className="mt-3 text-sm text-[var(--text-primary)]">
            Compare adverse event burden across uploaded studies.
          </p>
        </div>
        <div className="space-y-3">
          {["Safety section matched", "Interaction language ranked", "Trial limitation excerpt ranked"].map((item) => (
            <div key={item} className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--text-primary)]">
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "agents") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {["Retrieval", "Interaction", "Safety", "Trials", "Consensus", "Report"].map((agent) => (
          <div key={agent} className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--text-primary)]">
            {agent}
          </div>
        ))}
      </div>
    );
  }

  if (type === "debate") {
    return (
      <div className="grid gap-3">
        <div className={commonCard}>Interaction risk may be elevated.</div>
        <div className={commonCard}>Study population is limited.</div>
        <div className={commonCard}>Signal appears in multiple excerpts.</div>
        <div className="rounded-[1.15rem] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--text-primary)]">
          Consensus: flag for research review with visible uncertainty.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--panel-muted)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Briefing
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--text-primary)]">
          Executive summary, evidence traceability, uncertainty, and follow-up questions.
        </p>
      </div>
      <div className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--panel-muted)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          Output
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--text-primary)]">
          Research memo ready for internal review.
        </p>
      </div>
    </div>
  );
}
