"use client";

import { FileSearch, Quote, X } from "lucide-react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export function WorkspaceInspector() {
  const {
    sessions,
    activeSession,
    inspector,
    setMobileInspectorOpen,
  } = useWorkspace();
  const session = inspector.sessionId
    ? sessions.find((item) => item.id === inspector.sessionId) ?? activeSession
    : activeSession;
  const evidence = inspector.evidenceId
    ? session?.evidence.find((item) => item.id === inspector.evidenceId) ?? null
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-sky-400">Source evidence</p>
          <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
            The exact passage used to support the selected finding.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileInspectorOpen(false)}
          className="rounded-full border border-white/[0.08] p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close source evidence"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {evidence ? (
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] border border-sky-300/15 bg-sky-400/[0.07] text-sky-300">
              <FileSearch className="h-4 w-4" />
            </div>
            <h2 className="mt-5 text-lg font-semibold leading-7 text-white">{evidence.documentName}</h2>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.17em] text-slate-600">
              Page {evidence.page ?? "unavailable"}
            </p>

            <blockquote className="mt-6 rounded-[1.1rem] border border-white/[0.08] bg-black/20 p-5 text-sm leading-7 text-slate-500">
              <span>{evidence.contextBefore}</span>{" "}
              <mark className="rounded bg-sky-400/[0.16] px-1 py-0.5 text-sky-100 ring-1 ring-inset ring-sky-300/20">
                {evidence.excerpt}
              </mark>{" "}
              <span>{evidence.contextAfter}</span>
            </blockquote>

            <div className="mt-6 border-l border-sky-300/25 pl-4">
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-sky-400/80">Why this matters</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">{evidence.relevance}</p>
            </div>

            <p className="mt-8 break-all font-mono text-[8px] leading-4 text-slate-800">
              Evidence ID: {evidence.id}
            </p>
          </div>
        ) : (
          <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-slate-600">
              <Quote className="h-4 w-4" />
            </div>
            <h2 className="mt-5 text-sm font-semibold text-slate-300">Choose a citation to verify it</h2>
            <p className="mt-2 max-w-xs text-xs leading-6 text-slate-600">
              Source context stays out of the way until you open evidence attached to a finding.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
