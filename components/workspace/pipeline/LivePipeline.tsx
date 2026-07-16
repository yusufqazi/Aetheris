"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Minus, TriangleAlert } from "lucide-react";

import type { PipelineStageState, ResearchSession } from "@/lib/types";

const PREPARATION_IDS = [
  "uploading",
  "parsing",
  "normalizing",
  "chunking",
  "indexing",
  "retrieval",
  "evidence-ranking",
] as const;

export function LivePipeline({ session }: { session: ResearchSession }) {
  const preparation = PREPARATION_IDS.map((id) => session.pipeline.find((stage) => stage.id === id)).filter(
    (stage): stage is PipelineStageState => Boolean(stage),
  );
  const complete = session.pipeline.filter((stage) => stage.status === "completed").length;
  const total = session.pipeline.filter((stage) => stage.status !== "skipped").length;
  const progress = Math.round(
    session.pipeline
      .filter((stage) => stage.status !== "skipped")
      .reduce((sum, stage) => sum + stage.progress, 0) / Math.max(1, total),
  );

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-white/[0.09] bg-[#050d19]/72 shadow-[0_30px_100px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="flex flex-col gap-5 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-sky-400">Live orchestration</p>
          <h2 className="mt-2 text-xl font-medium tracking-[-0.025em] text-white">Research pipeline</h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">{currentPipelineMessage(session)}</p>
        </div>
        <div className="min-w-[11rem]">
          <div className="flex items-center justify-between text-[10px] text-slate-600">
            <span>{complete} of {total} stages</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#7dd3fc)] shadow-[0_0_14px_rgba(56,189,248,0.55)]"
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 24 }}
            />
          </div>
        </div>
      </div>

      <div className="scrollbar-thin overflow-x-auto px-5 py-6">
        <div className="flex min-w-[52rem] items-start">
          {preparation.map((stage, index) => (
            <StageNode
              key={stage.id}
              stage={stage}
              showConnector={index < preparation.length - 1}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.07] px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-700">
          <span>Retrieval: {session.metrics.retrievalMethod ?? "pending"}</span>
          <span>{session.metrics.pageCount} pages</span>
          <span>{session.metrics.chunkCount} chunks</span>
          <span>{session.metrics.retrievedEvidenceCount} ranked passages</span>
        </div>
      </div>
    </section>
  );
}

function StageNode({ stage, showConnector }: { stage: PipelineStageState; showConnector: boolean }) {
  const reduceMotion = useReducedMotion();
  const active = stage.status === "running";
  const completed = stage.status === "completed";
  const failed = stage.status === "failed";
  const skipped = stage.status === "skipped";

  return (
    <div className="flex flex-1 items-start">
      <div className="w-[6.5rem] shrink-0 text-center">
        <motion.div
          layout
          animate={active && !reduceMotion ? { boxShadow: "0 0 26px rgba(56,189,248,0.24)" } : { boxShadow: "0 0 0 rgba(56,189,248,0)" }}
          transition={{ duration: 0.55, repeat: active && !reduceMotion ? Infinity : 0, repeatType: "reverse" }}
          className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border ${
            completed
              ? "border-emerald-300/25 bg-emerald-400/[0.1] text-emerald-300"
              : active
                ? "border-sky-300/35 bg-sky-400/[0.13] text-sky-200"
                : failed
                  ? "border-amber-300/25 bg-amber-300/[0.08] text-amber-300"
                  : "border-white/[0.09] bg-[#07111f] text-slate-700"
          }`}
        >
          {completed ? <Check className="h-4 w-4" /> : failed ? <TriangleAlert className="h-3.5 w-3.5" /> : skipped ? <Minus className="h-3.5 w-3.5" /> : <Circle className={`h-2.5 w-2.5 ${active ? "fill-current" : ""}`} />}
        </motion.div>
        <p className={`mt-3 text-[11px] font-medium leading-4 ${active ? "text-sky-200" : completed ? "text-slate-300" : "text-slate-600"}`}>
          {stage.label}
        </p>
        <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-700">
          {active ? stage.detail : stage.status}
        </p>
      </div>
      {showConnector ? (
        <div className="relative mt-[1.08rem] h-px flex-1 overflow-hidden bg-white/[0.07]">
          <motion.div
            className="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,#2563eb,#7dd3fc)]"
            animate={{ width: `${completed ? 100 : active ? stage.progress : 0}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 25 }}
          />
        </div>
      ) : null}
    </div>
  );
}

function currentPipelineMessage(session: ResearchSession) {
  if (session.status === "completed") {
    return "Every selected stage completed; source traceability remains attached to the report.";
  }
  if (session.status === "error") {
    return session.error?.message ?? "The pipeline paused before completion.";
  }

  const active = session.pipeline.find((stage) => stage.status === "running");
  return active?.detail ?? active?.description ?? "The next research stage is queued.";
}
