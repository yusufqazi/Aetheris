"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Clock3, Minus, TriangleAlert } from "lucide-react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { AGENT_IDS, type AgentExecution, type AgentId, type ResearchSession } from "@/lib/types";

const AGENT_LABELS: Record<AgentId, { index: string; label: string; role: string }> = {
  "literature-search": { index: "01", label: "Literature Retrieval", role: "Evidence specialist" },
  "drug-interaction": { index: "02", label: "Drug Interaction", role: "Exposure specialist" },
  "adverse-reaction": { index: "03", label: "Adverse Reaction", role: "Safety specialist" },
  "trial-summarizer": { index: "04", label: "Clinical Trial", role: "Study specialist" },
  "debate-consensus": { index: "05", label: "Debate / Consensus", role: "Synthesis engine" },
  "report-generation": { index: "06", label: "Report Generation", role: "Assembly engine" },
};

export function AgentExecutionBoard({ session }: { session: ResearchSession }) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-sky-400">Independent execution</p>
          <h2 className="mt-2 text-xl font-medium tracking-[-0.025em] text-white">Specialist perspectives</h2>
        </div>
        <p className="hidden max-w-sm text-right text-xs leading-5 text-slate-600 sm:block">
          Specialists settle independently. Consensus and report assembly remain sequential dependencies.
        </p>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {AGENT_IDS.map((agentId, index) => {
          const execution = session.agentExecutions[agentId];
          return execution ? (
            <AgentExecutionRow key={agentId} session={session} execution={execution} index={index} />
          ) : null;
        })}
      </div>
    </section>
  );
}

function AgentExecutionRow({
  session,
  execution,
  index,
}: {
  session: ResearchSession;
  execution: AgentExecution;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  const meta = AGENT_LABELS[execution.agentId];
  const active = execution.status === "running";

  function inspectAgent() {
    selectInspector({ tab: "agent", sessionId: session.id, agentId: execution.agentId });
    setMobileInspectorOpen(true);
  }

  return (
    <motion.button
      type="button"
      onClick={inspectAgent}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative overflow-hidden rounded-[1.2rem] border p-4 text-left transition duration-300 ${
        active
          ? "border-sky-300/20 bg-sky-400/[0.065] shadow-[0_18px_55px_rgba(2,132,199,0.08)]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.035]"
      }`}
    >
      {active ? (
        <motion.span
          className="absolute inset-y-0 left-0 w-px bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.9)]"
          animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <div className="flex items-start gap-3">
        <span className="font-mono text-[9px] text-sky-400">{meta.index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200 transition group-hover:text-white">{meta.label}</h3>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-700">{meta.role}</p>
            </div>
            <AgentStatus status={execution.status} />
          </div>
          <p className="mt-4 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{execution.currentTask}</p>
          <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className={`h-full rounded-full ${execution.status === "failed" ? "bg-amber-300" : "bg-[linear-gradient(90deg,#2563eb,#7dd3fc)]"}`}
              animate={{ width: `${execution.progress}%` }}
              transition={{ type: "spring", stiffness: 110, damping: 24 }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-slate-700">
            <span>{execution.evidenceCount} evidence passages</span>
            <span className="capitalize">{execution.confidence ? `${execution.confidence} confidence` : formatDuration(execution.durationMs)}</span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function AgentStatus({ status }: { status: AgentExecution["status"] }) {
  const classes = status === "completed"
    ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-300"
    : status === "running"
      ? "border-sky-300/20 bg-sky-300/[0.08] text-sky-300"
      : status === "failed"
        ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-300"
        : "border-white/[0.08] text-slate-700";
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${classes}`}>
      {status === "completed" ? <Check className="h-3 w-3" /> : status === "running" ? <Clock3 className="h-3 w-3" /> : status === "failed" ? <TriangleAlert className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
    </span>
  );
}

function formatDuration(duration?: number | null) {
  if (duration === null || duration === undefined) {
    return "Queued";
  }
  return duration < 1_000 ? `${duration} ms` : `${(duration / 1_000).toFixed(1)} s`;
}
