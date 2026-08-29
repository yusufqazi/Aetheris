"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { CitationLinks } from "@/components/workspace/report/CitationLinks";
import type {
  InvestigationConflict,
  InvestigationData,
  InvestigationFinding,
  InvestigationQuestion,
} from "@/lib/research/investigation";
import type { Citation, ResearchSession } from "@/lib/types";

type ViewId = "findings" | "conflicts" | "questions";

export function InvestigationSummary({
  investigation,
  citations,
  session,
}: {
  investigation: InvestigationData;
  citations: Citation[];
  session: ResearchSession;
}) {
  const views = availableViews(investigation);
  const [activeView, setActiveView] = useState<ViewId>(views[0]?.id ?? "findings");
  const selected = views.find((view) => view.id === activeView) ?? views[0];

  if (!selected) return null;
  return (
    <section aria-labelledby="investigation-summary-title" className="border-t border-white/[0.07] pt-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-sky-400">Investigation</p>
          <h2 id="investigation-summary-title" className="mt-2 text-xl font-medium tracking-[-0.03em] text-white">Findings and unresolved evidence</h2>
        </div>
        <p className="max-w-sm text-xs leading-5 text-slate-500">Open any source to verify the exact supporting quote.</p>
      </div>

      <div className="mt-6 hidden sm:block">
        <div role="tablist" aria-label="Investigation summary views" className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.025] p-1">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={selected.id === view.id}
              aria-controls={`investigation-panel-${view.id}`}
              onClick={() => setActiveView(view.id)}
              className={`rounded-full px-4 py-2 text-xs transition ${selected.id === view.id ? "bg-sky-400/[0.13] text-sky-100" : "text-slate-500 hover:text-slate-200"}`}
            >
              {view.label} <span className="ml-1 text-[9px] text-slate-600">{view.count}</span>
            </button>
          ))}
        </div>
        <div id={`investigation-panel-${selected.id}`} role="tabpanel" className="mt-5">
          <ViewContent view={selected.id} investigation={investigation} citations={citations} session={session} />
        </div>
      </div>

      <div className="mt-5 divide-y divide-white/[0.07] border-y border-white/[0.07] sm:hidden">
        {views.map((view, index) => (
          <details key={view.id} open={index === 0} className="group py-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium text-slate-200">
              <span>{view.label} <span className="ml-1 font-mono text-[9px] text-slate-600">{view.count}</span></span>
              <ChevronDown className="h-4 w-4 text-slate-600 transition group-open:rotate-180" />
            </summary>
            <div className="pb-4">
              <ViewContent view={view.id} investigation={investigation} citations={citations} session={session} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ViewContent({ view, investigation, citations, session }: { view: ViewId; investigation: InvestigationData; citations: Citation[]; session: ResearchSession }) {
  if (view === "findings") return <Findings items={investigation.findings} citations={citations} session={session} />;
  if (view === "conflicts") return <Conflicts items={investigation.conflicts} citations={citations} session={session} />;
  return <OpenQuestions items={investigation.openQuestions} citations={citations} session={session} />;
}

function Findings({ items, citations, session }: { items: InvestigationFinding[]; citations: Citation[]; session: ResearchSession }) {
  if (items.length === 0) {
    return <EmptyState>No reviewable findings could be grounded in the uploaded evidence.</EmptyState>;
  }
  const groups = groupFindingsByTheme(items);
  const displayIndexes = new Map(
    groups.flatMap(([, themeItems]) => themeItems).map((item, index) => [item.id, index]),
  );
  return (
    <div className="space-y-7">
      {groups.map(([theme, themeItems]) => (
        <section key={theme} aria-label={theme}>
          <div className="mb-2 flex items-center gap-3">
            <h3 className="font-mono text-[8px] uppercase tracking-[0.17em] text-sky-300/70">{theme}</h3>
            <span className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {themeItems.map((item) => {
            const index = displayIndexes.get(item.id) ?? 0;
            return (
        <article
          key={item.id}
          data-testid="finding-row"
          className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-3 py-4 lg:grid-cols-[2rem_minmax(20rem,1fr)_minmax(10rem,18rem)] lg:items-start ${item.priority === "Primary finding" ? "border-l-2 border-sky-300/45 bg-sky-400/[0.025] pl-4 pr-3" : ""}`}
        >
          <span className="font-mono text-[9px] text-slate-700">{String(index + 1).padStart(2, "0")}</span>
          <div data-testid="finding-content" className="min-w-0">
            <p className={`font-mono text-[7px] uppercase tracking-[0.15em] ${item.priority === "Primary finding" ? "text-sky-300" : item.priority === "Important finding" ? "text-slate-500" : "text-slate-700"}`}>{item.priority}</p>
            <p className={`mt-1.5 leading-6 text-slate-200 ${item.priority === "Primary finding" ? "text-[15px] font-medium" : "text-sm"}`}>{item.statement}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
              <span title="Support reflects cited source count and whether material conflicts affect this statement." className="text-sky-300/70">{item.support}</span>
              <span>·</span>
              <span>{item.sourceCount} cited source{item.sourceCount === 1 ? "" : "s"}</span>
            </div>
            <details className="mt-2 text-[10px] text-slate-600">
              <summary className="cursor-pointer">Why this was included</summary>
              <div className="mt-2 space-y-1 leading-5">
                <p>{item.reasoningType}</p>
                <p><span className="text-slate-700">Uncertainty:</span> {item.uncertainty}</p>
              </div>
            </details>
          </div>
          <div data-testid="finding-citations" className="col-start-2 min-w-0 max-w-full lg:col-start-3 lg:w-full">
            <CitationLinks citationIds={item.citationIds} citations={citations} session={session} claim={item.statement} relationships={item.relationships} align="end" />
          </div>
        </article>
            );
          })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Conflicts({ items, citations, session }: { items: InvestigationConflict[]; citations: Citation[]; session: ResearchSession }) {
  if (items.length === 0) {
    return <EmptyState>No meaningful conflicts were detected across the uploaded evidence.</EmptyState>;
  }
  return <div className="space-y-3">{items.map((item) => (
    <article key={item.id} className="rounded-[1rem] border border-amber-200/10 bg-amber-100/[0.025] p-4">
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-amber-200/65">{item.type}</p>
      <p className="mt-2 text-sm leading-6 text-slate-200">{item.statement}</p>
      {item.positions.length > 1 ? (
        <div className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {item.positions.map((position, index) => (
            <div key={`${item.id}:${position.documentName}:${index}`} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <p className="truncate text-[10px] font-medium text-amber-100/60" title={position.documentName}>{position.documentName}</p>
              <p className="text-xs leading-5 text-slate-400">{position.statement}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-slate-500"><span className="text-slate-400">Why it matters:</span> {item.explanation}</p>
      <div className="mt-3"><CitationLinks citationIds={item.citationIds} citations={citations} session={session} claim={item.statement} relationships={item.relationships} /></div>
    </article>
  ))}</div>;
}

function OpenQuestions({ items, citations, session }: { items: InvestigationQuestion[]; citations: Citation[]; session: ResearchSession }) {
  if (items.length === 0) {
    return <EmptyState>No material unanswered questions were identified from the uploaded evidence.</EmptyState>;
  }
  return <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">{items.map((item) => (
    <details key={item.id} className="group py-1">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium leading-6 text-slate-200">
        {item.question}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-700 transition group-open:rotate-180" />
      </summary>
      <div className="pb-4">
        <dl className="grid gap-4 text-xs leading-5 text-slate-500 md:grid-cols-3">
          <div><dt className="font-mono text-[8px] uppercase tracking-[0.13em] text-slate-600">Currently known</dt><dd className="mt-1">{item.known}</dd></div>
          <div><dt className="font-mono text-[8px] uppercase tracking-[0.13em] text-slate-600">Still missing</dt><dd className="mt-1">{item.missingEvidence}</dd></div>
          <div><dt className="font-mono text-[8px] uppercase tracking-[0.13em] text-slate-600">Why it matters</dt><dd className="mt-1">{item.whyItMatters}</dd></div>
        </dl>
        <div className="mt-3"><CitationLinks citationIds={item.citationIds} citations={citations} session={session} claim={item.known} relationships={item.relationships} /></div>
      </div>
    </details>
  ))}</div>;
}

function availableViews(investigation: InvestigationData) {
  return [
    { id: "findings" as const, label: "Findings", count: investigation.findings.length },
    { id: "conflicts" as const, label: "Conflicts", count: investigation.conflicts.length },
    { id: "questions" as const, label: "Open Questions", count: investigation.openQuestions.length },
  ];
}

function groupFindingsByTheme(items: InvestigationFinding[]) {
  const groups = new Map<string, InvestigationFinding[]>();
  for (const item of items) {
    const theme = item.theme.trim() || "Clinical context";
    groups.set(theme, [...(groups.get(theme) ?? []), item]);
  }
  return Array.from(groups.entries());
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="border-y border-white/[0.07] py-8 text-center text-xs leading-5 text-slate-600">
      {children}
    </div>
  );
}
