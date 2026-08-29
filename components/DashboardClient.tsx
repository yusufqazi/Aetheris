"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Clock3,
  FileSearch,
  FileText,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { WorkspacePageHeader } from "@/components/workspace/WorkspacePageHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { ResearchEvent, ResearchSession, UploadedDocument } from "@/lib/types";

export type DashboardView = "sessions" | "documents" | "reports" | "history";

const VIEW_COPY: Record<DashboardView, { eyebrow: string; title: string; description: string }> = {
  sessions: {
    eyebrow: "Your analyses",
    title: "Clinical questions. Verifiable answers.",
    description: "Each analysis turns a focused question and a bounded source set into a concise brief with evidence attached.",
  },
  documents: {
    eyebrow: "Source library",
    title: "Documents with research context.",
    description: "Every source remains connected to the sessions, evidence passages, and conclusions it informed.",
  },
  reports: {
    eyebrow: "Research briefings",
    title: "Completed, traceable reports.",
    description: "Open structured conclusions without losing the evidence, specialist perspectives, or uncertainty behind them.",
  },
  history: {
    eyebrow: "Research history",
    title: "A chronological audit trail.",
    description: "Review what the system did, when it happened, and which real session metrics were produced.",
  },
};

export function DashboardClient({ view = "sessions" }: { view?: DashboardView }) {
  const { sessions, hydrated, sessionSyncError, openDemoSession, deleteSession } = useWorkspace();
  const { user } = useAuth();
  const copy = VIEW_COPY[view];

  return (
    <div className="mx-auto w-full max-w-[100rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <WorkspacePageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <Link
            href="/research/new"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#06101d] transition duration-300 hover:-translate-y-px hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          >
            <Plus className="h-4 w-4" />
            New analysis
          </Link>
        }
      />

      {sessionSyncError ? (
        <div role="alert" className="mt-6 rounded-2xl border border-amber-200/15 bg-amber-100/[0.035] px-4 py-3 text-xs leading-5 text-amber-100/80">
          <p className="font-medium text-amber-100">Saved sessions could not be loaded.</p>
          <p className="mt-1 text-amber-100/60">{sessionSyncError} Your local workspace is still available, but this view may not include your Supabase history.</p>
        </div>
      ) : null}

      <div className="mt-8">
        {!hydrated ? (
          <LoadingWorkspace />
        ) : view === "sessions" ? (
          <SessionsView
            sessions={sessions}
            accountId={user?.id ?? null}
            accountEmail={user?.email ?? null}
            onOpenDemo={() => void openDemoSession()}
            onDelete={deleteSession}
          />
        ) : view === "documents" ? (
          <DocumentsView sessions={sessions} />
        ) : view === "reports" ? (
          <ReportsView sessions={sessions} />
        ) : (
          <HistoryView sessions={sessions} />
        )}
      </div>
    </div>
  );
}

function SessionsView({
  sessions,
  accountId,
  accountEmail,
  onOpenDemo,
  onDelete,
}: {
  sessions: ResearchSession[];
  accountId: string | null;
  accountEmail: string | null;
  onOpenDemo: () => void;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  if (sessions.length === 0) {
    return <EmptyWorkspace accountId={accountId} accountEmail={accountEmail} onOpenDemo={onOpenDemo} />;
  }

  const totals = {
    documents: sessions.reduce((sum, session) => sum + session.documents.length, 0),
    evidence: sessions.reduce((sum, session) => sum + session.evidence.length, 0),
    reports: sessions.filter((session) => session.status === "completed").length,
  };

  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-white/[0.07] pb-5">
        <InlineMetric value={sessions.length} label="sessions" />
        <InlineMetric value={totals.documents} label="source documents" />
        <InlineMetric value={totals.evidence} label="ranked passages" />
        <InlineMetric value={totals.reports} label="completed reports" />
      </div>
      <div className="divide-y divide-white/[0.07]">
        {sessions.map((session, index) => (
          <SessionRow key={session.id} session={session} index={index} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  index,
  onDelete,
}: {
  session: ResearchSession;
  index: number;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  const reduceMotion = useReducedMotion();
  async function removeSession() {
    const confirmed = window.confirm(
      "Delete this analysis? Its report, source records, and research history will be removed from this workspace.",
    );
    if (confirmed) await onDelete(session.id);
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="group grid gap-5 py-6 transition lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <Link href={`/research/${session.id}`} className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusDot status={session.status} />
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-600">
              {session.mode === "live" ? "AI-assisted" : "local"} / {session.status}
            </span>
            <span className="text-[10px] text-slate-700">{formatDate(session.updatedAt)}</span>
          </div>
          <h2 className="mt-3 max-w-3xl text-xl font-medium leading-7 tracking-[-0.025em] text-slate-200 transition group-hover:text-white sm:text-2xl">
            {session.question}
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {session.documents.length} documents / {session.metrics.pageCount} pages / {session.evidence.length} evidence passages
          </p>
        </Link>
        <div className="flex items-center gap-5">
          {session.confidence ? (
            <div className="text-right">
              <p className="text-2xl font-medium tracking-[-0.04em] text-slate-300">{session.confidence.overall}%</p>
              <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-700">confidence</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void removeSession()}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-slate-700 transition hover:border-rose-300/20 hover:bg-rose-300/[0.06] hover:text-rose-200"
            aria-label={`Delete analysis: ${session.question}`}
            title="Delete analysis"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/research/${session.id}`}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-slate-600 transition duration-300 group-hover:border-sky-300/25 group-hover:bg-sky-400/[0.08] group-hover:text-sky-300"
            aria-label={`Open analysis: ${session.question}`}
          >
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function DocumentsView({ sessions }: { sessions: ResearchSession[] }) {
  const documents = sessions.flatMap((session) =>
    session.documents.map((document) => ({ document, session })),
  );
  if (documents.length === 0) {
    return <CollectionEmpty icon={<FileSearch className="h-5 w-5" />} title="No source documents yet" />;
  }

  return (
    <div className="divide-y divide-white/[0.07]">
      {documents.map(({ document, session }) => (
        <DocumentRow key={`${session.id}:${document.id}`} document={document} session={session} />
      ))}
    </div>
  );
}

function DocumentRow({ document, session }: { document: UploadedDocument; session: ResearchSession }) {
  const citedPassages = session.evidence.filter((item) => item.documentId === document.id).length;
  return (
    <Link
      href={`/research/${session.id}?view=evidence`}
      className="group grid gap-4 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[0.9rem] border border-white/[0.08] bg-white/[0.03] text-slate-600 transition group-hover:text-sky-300">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-300 group-hover:text-white">{document.name}</p>
        <p className="mt-1 line-clamp-1 text-xs text-slate-600">{session.question}</p>
      </div>
      <div className="flex gap-5 text-xs text-slate-600">
        <span>{document.pageCount} pages</span>
        <span>{citedPassages} ranked passages</span>
      </div>
    </Link>
  );
}

function ReportsView({ sessions }: { sessions: ResearchSession[] }) {
  const reports = sessions.filter((session) => session.status === "completed" && session.results);
  if (reports.length === 0) {
    return <CollectionEmpty icon={<FileText className="h-5 w-5" />} title="No completed reports yet" />;
  }

  return (
    <div className="divide-y divide-white/[0.07]">
      {reports.map((session) => (
        <Link
          key={session.id}
          href={`/research/${session.id}?view=report`}
          className="group grid gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        >
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-emerald-400/70">Report assembled</p>
            <h2 className="mt-3 text-xl font-medium text-slate-200 transition group-hover:text-white">{session.question}</h2>
            <p className="mt-2 line-clamp-2 max-w-3xl text-xs leading-5 text-slate-600">
              {session.results?.reportGeneration.executiveSummary}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-600">
              {session.reportSections.length} sections
            </span>
            <ArrowRight className="h-4 w-4 text-slate-700 transition group-hover:translate-x-1 group-hover:text-sky-300" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function HistoryView({ sessions }: { sessions: ResearchSession[] }) {
  const events = sessions
    .flatMap((session) => session.events.map((event) => ({ event, session })))
    .sort((left, right) => right.event.timestamp.localeCompare(left.event.timestamp));
  if (events.length === 0) {
    return <CollectionEmpty icon={<Clock3 className="h-5 w-5" />} title="No research activity yet" />;
  }

  return (
    <div className="relative ml-2 border-l border-white/[0.08] pl-7">
      {events.map(({ event, session }) => (
        <HistoryRow key={`${session.id}:${event.id}`} event={event} session={session} />
      ))}
    </div>
  );
}

function HistoryRow({ event, session }: { event: ResearchEvent; session: ResearchSession }) {
  return (
    <Link href={`/research/${session.id}`} className="group relative block border-b border-white/[0.06] py-5 last:border-0">
      <span className="absolute -left-[2.05rem] top-7 h-2 w-2 rounded-full border border-sky-300/40 bg-[#07111f] transition group-hover:bg-sky-300 group-hover:shadow-[0_0_12px_rgba(125,211,252,0.75)]" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-300 transition group-hover:text-white">{event.message}</p>
          <p className="mt-1 line-clamp-1 text-xs text-slate-600">{session.question}</p>
        </div>
        <time className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-700">
          {formatDate(event.timestamp)}
        </time>
      </div>
    </Link>
  );
}

function EmptyWorkspace({
  accountId,
  accountEmail,
  onOpenDemo,
}: {
  accountId: string | null;
  accountEmail: string | null;
  onOpenDemo: () => void;
}) {
  return (
    <div className="grid min-h-[34rem] items-center gap-12 py-8 lg:grid-cols-[0.85fr_1.15fr]">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-sky-400">Empty workspace</p>
        <h2 className="mt-4 max-w-xl text-[clamp(2.25rem,5vw,4.75rem)] font-medium leading-[0.98] tracking-[-0.06em] text-white">
          Start your first research session.
        </h2>
        <p className="mt-5 max-w-lg text-sm leading-7 text-slate-500">
          Add clinical sources and ask one focused question. Aetheris will organize the findings, surface important limitations, and link every major claim back to the evidence.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/research/new" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#06101d] transition hover:-translate-y-px hover:bg-sky-50">
            Start an analysis <ArrowRight className="h-4 w-4" />
          </Link>
          <button type="button" onClick={onOpenDemo} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.035] px-5 text-sm font-semibold text-slate-300 transition hover:border-sky-300/25 hover:bg-sky-400/[0.06] hover:text-white">
            <Sparkles className="h-4 w-4 text-sky-400" /> Explore demo session
          </button>
        </div>
        {process.env.NODE_ENV !== "production" && accountId ? (
          <details className="mt-8 max-w-lg rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-slate-500">
            <summary className="cursor-pointer select-none text-slate-400">Storage diagnostics</summary>
            <dl className="mt-3 space-y-2 font-mono text-[10px] leading-5">
              <div className="flex gap-3"><dt className="text-slate-700">email</dt><dd className="break-all text-slate-500">{accountEmail ?? "unknown"}</dd></div>
              <div className="flex gap-3"><dt className="text-slate-700">user_id</dt><dd className="break-all text-slate-500">{accountId}</dd></div>
              <div className="flex gap-3"><dt className="text-slate-700">project</dt><dd className="break-all text-slate-500">{process.env.NEXT_PUBLIC_SUPABASE_URL ?? "not configured"}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-slate-600">Compare this user_id with the research_sessions rows in Supabase. They must match exactly.</p>
          </details>
        ) : null}
      </div>
      <ResearchConstellation />
    </div>
  );
}

function ResearchConstellation() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[32rem]" aria-hidden="true">
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_68%)] blur-2xl" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 500 500" fill="none">
        <circle cx="250" cy="250" r="170" stroke="rgba(148,163,184,0.08)" strokeDasharray="3 9" />
        <circle cx="250" cy="250" r="110" stroke="rgba(96,165,250,0.12)" />
        {[[-110, -72], [120, -95], [-145, 86], [142, 76]].map(([x, y], index) => (
          <motion.line
            key={`${x}:${y}`}
            x1="250"
            y1="250"
            x2={250 + x}
            y2={250 + y}
            stroke="rgba(96,165,250,0.18)"
            strokeDasharray="4 7"
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.2 + index * 0.12, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 flex h-28 w-24 -translate-x-1/2 -translate-y-1/2 flex-col rounded-[1.15rem] border border-sky-200/15 bg-[linear-gradient(145deg,rgba(30,64,175,0.22),rgba(7,17,31,0.92))] p-4 shadow-[0_28px_90px_rgba(2,6,23,0.6),0_0_45px_rgba(37,99,235,0.16)] backdrop-blur-xl">
        <FileText className="h-5 w-5 text-sky-300" />
        <span className="mt-auto h-1 w-full rounded-full bg-white/[0.1]" />
        <span className="mt-2 h-1 w-2/3 rounded-full bg-white/[0.07]" />
      </div>
      {["Evidence", "Safety", "Trials", "Consensus"].map((label, index) => {
        const positions = ["left-[12%] top-[28%]", "right-[8%] top-[23%]", "bottom-[20%] left-[5%]", "bottom-[22%] right-[5%]"];
        return (
          <div key={label} className={`absolute ${positions[index]} rounded-full border border-white/[0.09] bg-[#07111f]/90 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500 shadow-xl`}>
            {label}
          </div>
        );
      })}
    </div>
  );
}

function CollectionEmpty({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-slate-600">{icon}</div>
      <h2 className="mt-5 text-lg font-medium text-slate-300">{title}</h2>
      <Link href="/research/new" className="mt-4 text-sm text-sky-400 transition hover:text-sky-300">Start a research session</Link>
    </div>
  );
}

function LoadingWorkspace() {
  return (
    <div className="space-y-1">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-28 animate-pulse border-b border-white/[0.06] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.025),transparent)]" />
      ))}
    </div>
  );
}

function InlineMetric({ value, label }: { value: number; label: string }) {
  return <p className="text-xs text-slate-600"><span className="mr-2 text-sm font-medium text-slate-300">{value}</span>{label}</p>;
}

function StatusDot({ status }: { status: ResearchSession["status"] }) {
  return (
    <span className={`h-1.5 w-1.5 rounded-full ${status === "completed" ? "bg-emerald-400" : status === "error" ? "bg-amber-400" : "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]"}`} />
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
