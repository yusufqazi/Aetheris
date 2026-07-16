"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  FileText,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { InteractiveReport } from "@/components/workspace/report/InteractiveReport";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { AGENT_IDS, type AgentId, type PipelineStageId, type ResearchSession } from "@/lib/types";

const AGENT_COPY: Record<AgentId, { label: string; purpose: string }> = {
  "literature-search": { label: "Evidence Retrieval", purpose: "Finds the passages most relevant to the question." },
  "drug-interaction": { label: "Drug Interaction", purpose: "Checks medication combinations and interaction signals." },
  "adverse-reaction": { label: "Adverse Reaction", purpose: "Reviews reported symptoms and safety findings." },
  "trial-summarizer": { label: "Clinical Context", purpose: "Interprets study design, population, and outcomes." },
  "debate-consensus": { label: "Consensus", purpose: "Reconciles agreement, uncertainty, and contradictions." },
  "report-generation": { label: "Report Assembly", purpose: "Builds the cited answer without duplicating findings." },
};

const SIMPLE_STAGES: Array<{
  label: string;
  description: string;
  stageIds: PipelineStageId[];
}> = [
  {
    label: "Read the documents",
    description: "Extract page-addressable text from every source.",
    stageIds: ["uploading", "parsing", "normalizing", "chunking"],
  },
  {
    label: "Find relevant evidence",
    description: "Locate and rank passages against the research question.",
    stageIds: ["indexing", "retrieval", "evidence-ranking"],
  },
  {
    label: "Review the findings",
    description: "Examine outcomes, safety, study design, and limitations.",
    stageIds: ["literature-search", "drug-interaction", "adverse-reaction", "trial-summarizer"],
  },
  {
    label: "Resolve uncertainty",
    description: "Separate supported conclusions from gaps and contradictions.",
    stageIds: ["debate-consensus"],
  },
  {
    label: "Build the evidence brief",
    description: "Attach citations and assemble the final answer.",
    stageIds: ["report-generation"],
  },
];

export function ResultsClient({ sessionId }: { sessionId: string }) {
  const {
    sessions,
    hydrated,
    setActiveSessionId,
    startAnalysis,
  } = useWorkspace();
  const session = sessions.find((item) => item.id === sessionId) ?? null;

  useEffect(() => {
    setActiveSessionId(sessionId);
  }, [sessionId, setActiveSessionId]);

  if (!hydrated) {
    return <SessionLoading />;
  }
  if (!session) {
    return <MissingSession />;
  }

  const modeLabel = session.mode === "live" ? "AI analysis" : "Local document analysis";

  return (
    <div className="mx-auto w-full max-w-[86rem] px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
      <header className="border-b border-white/[0.07] pb-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs text-slate-600 transition hover:text-slate-300">
            <ArrowLeft className="h-3.5 w-3.5" /> All analyses
          </Link>
          <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.17em]">
            <span className={`h-1.5 w-1.5 rounded-full ${session.status === "completed" ? "bg-emerald-400" : session.status === "error" ? "bg-amber-400" : "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]"}`} />
            <span className="text-slate-600">{modeLabel}</span>
            <span className="text-slate-800">/</span>
            <span className={session.status === "error" ? "text-amber-300/80" : "text-sky-300/80"}>{session.status}</span>
          </div>
        </div>

        <p className="mt-7 font-mono text-[9px] uppercase tracking-[0.26em] text-sky-400">Research question</p>
        <h1 className="mt-3 max-w-5xl text-[clamp(1.9rem,4.2vw,3.9rem)] font-medium leading-[1.03] tracking-[-0.055em] text-white">
          {session.question}
        </h1>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-600">
          <span>{session.documents.length} source{session.documents.length === 1 ? "" : "s"}</span>
          <span>{session.metrics.pageCount} pages reviewed</span>
          {session.evidence.length > 0 ? <span>{session.evidence.length} supporting passages</span> : null}
          {session.metrics.elapsedMs ? <span>{formatDuration(session.metrics.elapsedMs)}</span> : null}
        </div>
      </header>

      <ModeNotice session={session} />

      {session.status === "error" ? (
        <ResearchErrorState session={session} onRetry={() => void startAnalysis(session, { retry: true })} />
      ) : session.status === "completed" ? (
        <div className="pt-9">
          <InteractiveReport session={session} />
          <AgentReviewRecord session={session} />
          <MethodDetails session={session} />
        </div>
      ) : (
        <AnalysisProgress session={session} />
      )}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Research phase: {session.status}
      </p>
    </div>
  );
}

function ModeNotice({ session }: { session: ResearchSession }) {
  const failed = session.status === "error";
  const local = session.mode === "demo" && !failed;
  const title = failed
    ? session.error?.stageId === "parsing" || session.error?.code.startsWith("PDF_")
      ? "Extraction failed"
      : "Analysis failed"
    : local
      ? "Local document analysis"
      : "Model-assisted analysis";
  const description = failed
    ? session.error?.message ?? "The current analysis did not complete."
    : local
      ? "No language model is active. Aetheris is ranking passages and extracting concrete facts directly from your PDFs, which is why this run can finish quickly."
      : "A language model is synthesizing the answer, while Aetheris validates the output against retrieved source passages.";

  return (
    <section className={`mt-5 rounded-[1rem] border px-4 py-3 ${failed ? "border-amber-300/15 bg-amber-300/[0.045]" : local ? "border-sky-300/15 bg-sky-400/[0.045]" : "border-emerald-300/15 bg-emerald-300/[0.035]"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${failed ? "bg-amber-300" : local ? "bg-sky-300" : "bg-emerald-300"}`} />
        <div>
          <p className={`font-mono text-[9px] uppercase tracking-[0.18em] ${failed ? "text-amber-200/80" : local ? "text-sky-200/80" : "text-emerald-200/80"}`}>{title}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>
        </div>
      </div>
    </section>
  );
}

function AnalysisProgress({ session }: { session: ResearchSession }) {
  const reduceMotion = useReducedMotion();
  const elapsedSeconds = useAnalysisElapsedSeconds(session);
  const completeCount = SIMPLE_STAGES.filter((item) => groupStatus(session, item.stageIds) === "completed").length;
  const progress = Math.round((completeCount / SIMPLE_STAGES.length) * 100);
  const runningAgents = Object.values(session.agentExecutions).filter((agent) => agent.status === "running");
  const completedAgents = Object.values(session.agentExecutions).filter((agent) => agent.status === "completed");

  return (
    <section className="mx-auto max-w-4xl py-14 sm:py-20">
      <div className="text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-sky-400">Building your answer</p>
        <h2 className="mt-4 text-[clamp(2rem,5vw,4rem)] font-medium leading-[1] tracking-[-0.055em] text-white">
          Turning source documents into a verifiable brief.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-500">
          Aetheris is locating the passages that answer your question, checking the major findings, and preserving the evidence behind each conclusion.
        </p>
      </div>

      <div className="mt-12 overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-white/[0.02]">
        {SIMPLE_STAGES.map((item, index) => {
          const status = groupStatus(session, item.stageIds);
          const active = status === "running";
          const complete = status === "completed";
          return (
            <div key={item.label} className="flex gap-4 border-b border-white/[0.07] px-5 py-5 last:border-0 sm:px-6">
              <motion.span
                animate={active && !reduceMotion ? { boxShadow: ["0 0 0 rgba(56,189,248,0)", "0 0 24px rgba(56,189,248,0.32)", "0 0 0 rgba(56,189,248,0)"] } : undefined}
                transition={{ duration: 1.8, repeat: Infinity }}
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${complete ? "border-emerald-300/20 bg-emerald-400/[0.09] text-emerald-300" : active ? "border-sky-300/30 bg-sky-400/[0.1] text-sky-200" : "border-white/[0.08] text-slate-700"}`}
              >
                {complete ? <Check className="h-3.5 w-3.5" /> : <Circle className={`h-2.5 w-2.5 ${active ? "fill-current" : ""}`} />}
              </motion.span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className={`text-sm font-medium ${active ? "text-sky-100" : complete ? "text-slate-300" : "text-slate-600"}`}>{item.label}</h3>
                  {active ? <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-sky-400">In progress</span> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
              </div>
              <span className="ml-auto font-mono text-[9px] text-slate-700">0{index + 1}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#7dd3fc)]"
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 110, damping: 24 }}
        />
      </div>

      {runningAgents.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.13em] text-slate-600">
          <span>
            {session.mode === "live"
              ? "Gemini is evaluating the retrieved evidence"
              : "Local evidence review is running"}
          </span>
          <span className="text-sky-300/65">
            {completedAgents.length} of {session.selectedAgents.length} roles complete · {formatElapsed(elapsedSeconds)} elapsed
          </span>
        </div>
      ) : null}

      <AgentReviewRecord session={session} compact />
    </section>
  );
}

function useAnalysisElapsedSeconds(session: ResearchSession) {
  const activeStart = Object.values(session.agentExecutions)
    .map((agent) => agent.startedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .reduce<number | null>((earliest, value) => earliest === null ? value : Math.min(earliest, value), null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeStart) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [activeStart]);

  return activeStart ? Math.max(0, Math.floor((now - activeStart) / 1_000)) : 0;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function AgentReviewRecord({ session, compact = false }: { session: ResearchSession; compact?: boolean }) {
  return (
    <section className={compact ? "mt-10" : "mt-12 border-t border-white/[0.07] pt-8"} aria-label="Six research roles">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-sky-400">Six research roles</p>
          <h3 className="mt-2 text-xl font-medium tracking-[-0.03em] text-slate-100">Specialist review record</h3>
        </div>
        <p className="hidden max-w-sm text-right text-[10px] leading-5 text-slate-600 sm:block">Each role completes a distinct evidence task. This is the process advertised on the homepage.</p>
      </div>
      <div className="mt-5 grid gap-px overflow-hidden rounded-[1.1rem] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 xl:grid-cols-3">
        {AGENT_IDS.map((agentId, index) => {
          const execution = session.agentExecutions[agentId];
          const status = execution?.status ?? "pending";
          return (
            <div key={agentId} className="bg-[#07111f] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[8px] text-slate-700">0{index + 1}</span>
                <span className={`font-mono text-[8px] uppercase tracking-[0.14em] ${status === "completed" ? "text-emerald-300/70" : status === "running" ? "text-sky-300" : status === "failed" ? "text-amber-300" : "text-slate-700"}`}>{status}</span>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-300">{AGENT_COPY[agentId].label}</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-600">{AGENT_COPY[agentId].purpose}</p>
              {execution?.evidenceCount ? <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.12em] text-sky-400/60">{execution.evidenceCount} evidence passages</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MethodDetails({ session }: { session: ResearchSession }) {
  return (
    <details className="group mt-12 border-y border-white/[0.07] py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-sm text-slate-500 transition hover:text-slate-300">
        <span>How Aetheris produced this answer</span>
        <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" />
      </summary>
      <div className="mt-5 grid gap-3 text-xs leading-6 text-slate-600 md:grid-cols-2">
        <MethodItem value={`${session.metrics.pageCount} pages were extracted with page boundaries preserved.`} />
        <MethodItem value={`${session.metrics.retrievedEvidenceCount} passages were ranked using ${session.metrics.retrievalMethod ?? "document"} retrieval.`} />
        <MethodItem value="Outcomes, safety, study design, and limitations were reviewed separately before the answer was assembled." />
        <MethodItem value="Each visible citation points back to the exact evidence record used for that finding." />
      </div>
    </details>
  );
}

function MethodItem({ value }: { value: string }) {
  return (
    <div className="flex gap-3 rounded-[0.9rem] border border-white/[0.06] bg-white/[0.015] px-4 py-3">
      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-sky-400/70" />
      <p>{value}</p>
    </div>
  );
}

function ResearchErrorState({ session, onRetry }: { session: ResearchSession; onRetry: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <section className="mt-8 rounded-[1.2rem] border border-amber-300/15 bg-[linear-gradient(135deg,rgba(251,191,36,0.06),rgba(255,255,255,0.015))] px-5 py-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.08] text-amber-300"><ShieldAlert className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold text-amber-100/90">{session.error?.title ?? "Analysis paused"}</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/55">{session.error?.message ?? "Prepared documents are preserved."}</p>
            {session.error?.details ? (
              <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="mt-2 text-[10px] text-amber-200/45 underline-offset-2 hover:underline">
                {detailsOpen ? "Hide technical detail" : "Show technical detail"}
              </button>
            ) : null}
            {detailsOpen ? <p className="mt-2 max-w-2xl font-mono text-[9px] leading-5 text-amber-100/35">{session.error?.details}</p> : null}
          </div>
        </div>
        {session.error?.retryable !== false ? (
          <button type="button" onClick={onRetry} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/[0.07] px-4 text-xs font-semibold text-amber-100 transition hover:bg-amber-200/[0.12]">
            <RefreshCw className="h-3.5 w-3.5" /> Retry analysis
          </button>
        ) : null}
      </div>
    </section>
  );
}

function groupStatus(session: ResearchSession, stageIds: PipelineStageId[]) {
  const stages = stageIds
    .map((id) => session.pipeline.find((stage) => stage.id === id))
    .filter((stage): stage is ResearchSession["pipeline"][number] => Boolean(stage));
  if (stages.some((stage) => stage.status === "failed")) return "failed";
  if (stages.every((stage) => stage.status === "completed" || stage.status === "skipped")) return "completed";
  if (stages.some((stage) => stage.status === "running" || stage.status === "partial")) return "running";
  return "pending";
}

function SessionLoading() {
  return (
    <div className="mx-auto w-full max-w-[86rem] px-5 py-8 sm:px-8 lg:px-12">
      <div className="h-5 w-32 animate-pulse rounded-full bg-white/[0.04]" />
      <div className="mt-6 h-14 max-w-3xl animate-pulse rounded-[1rem] bg-white/[0.035]" />
      <div className="mt-10 h-[28rem] animate-pulse rounded-[1.5rem] border border-white/[0.06] bg-white/[0.02]" />
    </div>
  );
}

function MissingSession() {
  return (
    <div className="flex min-h-full items-center justify-center px-5 py-16 text-center">
      <div>
        <FileText className="mx-auto h-6 w-6 text-slate-700" />
        <h1 className="mt-5 text-3xl font-medium tracking-[-0.04em] text-white">This analysis could not be loaded.</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-600">It is not present in this browser workspace or optional remote storage.</p>
        <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-full border border-white/[0.09] px-4 text-xs text-slate-300">Return to analyses</Link>
      </div>
    </div>
  );
}

function formatDuration(value: number) {
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(1)} seconds`;
}
