"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BrainCircuit, FileText, Sparkles } from "lucide-react";

const documentCards = [
  { title: "Phase II oncology study", meta: "Clinical study PDF" },
  { title: "Safety label update", meta: "Labeling PDF" },
];

const pipelineSteps = [
  "Source intake",
  "Text extraction",
  "Evidence retrieval",
  "Specialist review",
  "Consensus",
];

export function AnimatedAgentPanel() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="relative overflow-hidden rounded-[2.35rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(18,31,50,0.96),rgba(7,17,31,0.96))] p-6 shadow-[var(--shadow-hero)] lg:p-7"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(96,165,250,0.16),transparent_28%),radial-gradient(circle_at_85%_78%,rgba(29,78,216,0.22),transparent_32%)]" />
        <motion.div
          animate={
            reduceMotion
              ? {}
              : {
                  opacity: [0.35, 0.58, 0.35],
                }
          }
          transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          className="absolute left-[12%] top-[28%] h-px w-[68%] bg-[linear-gradient(90deg,transparent,rgba(96,165,250,0.5),transparent)]"
        />
        <motion.div
          animate={
            reduceMotion
              ? {}
              : {
                  opacity: [0.2, 0.46, 0.2],
                }
          }
          transition={{ duration: 5.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: 0.4 }}
          className="absolute left-[26%] top-[58%] h-px w-[44%] bg-[linear-gradient(90deg,transparent,rgba(96,165,250,0.46),transparent)]"
        />
        {!reduceMotion ? (
          <>
            <motion.div
              animate={{ x: ["0%", "100%"] }}
              transition={{ duration: 4.8, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="absolute left-[15%] top-[27.55%] h-2.5 w-2.5 rounded-full bg-[#93c5fd] shadow-[0_0_20px_rgba(96,165,250,0.8)]"
            />
            <motion.div
              animate={{ x: ["0%", "100%"] }}
              transition={{ duration: 4.2, repeat: Number.POSITIVE_INFINITY, ease: "linear", delay: 1.1 }}
              className="absolute left-[30%] top-[57.55%] h-2 w-2 rounded-full bg-[#bfdbfe] shadow-[0_0_18px_rgba(191,219,254,0.75)]"
            />
          </>
        ) : null}
      </div>

      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-400">
              Product preview
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white lg:text-[1.75rem]">
              Source intake to final briefing
            </h3>
          </div>
          <div className="rounded-full border border-white/12 bg-white/6 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#bfdbfe]">
            Research workflow
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-4 lg:p-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
                  Uploaded documents
                </p>
                <p className="text-xs text-slate-400">Two representative sources</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {documentCards.map((document, index) => (
                  <motion.div
                    key={document.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + index * 0.08, duration: 0.45 }}
                    className="rounded-[1.3rem] border border-white/10 bg-white/[0.06] px-4 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#9bc2ff]">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{document.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                          {document.meta}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-4 lg:p-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-400">
                  Agent pipeline
                </p>
                <BrainCircuit className="h-4 w-4 text-[#93c5fd]" />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {pipelineSteps.map((step, index) => (
                  <div key={step} className="inline-flex items-center gap-2.5">
                    <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-slate-200">
                      {step}
                    </span>
                    {index < pipelineSteps.length - 1 ? (
                      <span className="hidden h-px w-5 bg-[linear-gradient(90deg,rgba(96,165,250,0.55),rgba(96,165,250,0.12))] sm:block" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.55 }}
            className="rounded-[1.7rem] border border-[rgba(96,165,250,0.22)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#93c5fd]">
                  Final output
                </p>
                <h4 className="mt-2 text-xl font-semibold text-white">Consensus briefing</h4>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(96,165,250,0.12)] text-[#bfdbfe]">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.05] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">
                  Executive summary
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  Evidence-ranked findings converge on a moderate safety concern with clear
                  uncertainty around interaction severity.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.05] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">
                    Evidence
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-200">
                    Ranked excerpts remain linked to source language and document context.
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.05] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-400">
                    Follow-up
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-200">
                    Additional PK appendices could tighten the current benefit-risk interpretation.
                  </p>
                </div>
              </div>

              <div className="rounded-[1.2rem] border border-[rgba(96,165,250,0.22)] bg-[rgba(96,165,250,0.08)] px-4 py-3 text-sm text-[#dbeafe]">
                Research support output with visible uncertainty and escalation boundaries.
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
