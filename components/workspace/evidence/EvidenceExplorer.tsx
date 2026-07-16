"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { FileSearch, Search, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { EvidenceItem, ResearchSession } from "@/lib/types";

export function EvidenceExplorer({ session }: { session: ResearchSession }) {
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [documentId, setDocumentId] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const evidence = session.evidence.filter((item) => {
    const matchesDocument = documentId === "all" || item.documentId === documentId;
    const matchesQuery = !deferredQuery || `${item.excerpt} ${item.documentName} ${item.relevance}`.toLowerCase().includes(deferredQuery);
    return matchesDocument && matchesQuery;
  });
  // TanStack Virtual manages an imperative measurement cache by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: evidence.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (expandedId === evidence[index]?.id ? 310 : 184),
    overscan: 5,
  });

  function inspectSource(item: EvidenceItem) {
    selectInspector({ tab: "source", sessionId: session.id, evidenceId: item.id });
    setMobileInspectorOpen(true);
  }

  return (
    <section>
      <div className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-sky-400">Evidence explorer</p>
          <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-white">Inspect every ranked passage.</h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-slate-600">
            Scores reflect {session.metrics.retrievalMethod === "embedding" ? "semantic similarity blended with lexical overlap" : "deterministic lexical overlap"}; exact page context remains one click away.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-700" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search evidence"
              className="h-10 w-full rounded-full border border-white/[0.09] bg-white/[0.025] pl-9 pr-4 text-xs text-slate-300 outline-none transition placeholder:text-slate-700 focus:border-sky-300/25 sm:w-52"
            />
          </label>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-700" />
            <select
              value={documentId}
              onChange={(event) => setDocumentId(event.target.value)}
              className="h-10 w-full appearance-none rounded-full border border-white/[0.09] bg-[#07111f] pl-9 pr-8 text-xs text-slate-400 outline-none transition focus:border-sky-300/25 sm:w-48"
            >
              <option value="all">All documents</option>
              {session.documents.map((document) => (
                <option key={document.id} value={document.id}>{document.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 text-[10px] text-slate-700">
        <span>{evidence.length} of {session.evidence.length} passages</span>
        <span className="font-mono uppercase tracking-[0.14em]">{session.metrics.retrievalMethod ?? "pending"} retrieval</span>
      </div>

      {evidence.length > 0 ? (
        <div ref={parentRef} className="scrollbar-thin mt-3 h-[min(65svh,48rem)] overflow-auto rounded-[1.2rem] border border-white/[0.08] bg-[#050d19]/58">
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = evidence[virtualRow.index];
              return (
                <div
                  key={item.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full px-4"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <EvidenceRow
                    item={item}
                    index={virtualRow.index}
                    expanded={expandedId === item.id}
                    onExpand={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                    onInspect={() => inspectSource(item)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-10 flex min-h-[20rem] flex-col items-center justify-center rounded-[1.2rem] border border-dashed border-white/[0.08] text-center">
          <FileSearch className="h-5 w-5 text-slate-700" />
          <p className="mt-4 text-sm text-slate-400">No evidence matches the active filters.</p>
          <button type="button" onClick={() => { setQuery(""); setDocumentId("all"); }} className="mt-3 text-xs text-sky-400">Clear filters</button>
        </div>
      )}
    </section>
  );
}

function EvidenceRow({
  item,
  index,
  expanded,
  onExpand,
  onInspect,
}: {
  item: EvidenceItem;
  index: number;
  expanded: boolean;
  onExpand: () => void;
  onInspect: () => void;
}) {
  const score = item.similarityScore ?? item.lexicalScore;
  return (
    <article className="border-b border-white/[0.07] py-5 last:border-0">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 font-mono text-[9px] text-sky-400">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-300">{item.documentName}</p>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-700">
                Page {item.page ?? "—"} · {item.retrievalMethod} {Math.round(score * 100)}%
              </p>
            </div>
            <button type="button" onClick={onInspect} className="rounded-full border border-white/[0.08] px-3 py-1.5 text-[10px] text-slate-500 transition hover:border-sky-300/25 hover:text-sky-300">
              Open source
            </button>
          </div>
          <p className="mt-4 text-xs leading-6 text-slate-400">
            <HighlightedTerms text={item.excerpt} terms={item.matchedTerms} />
          </p>
          {expanded ? (
            <div className="mt-4 border-l border-sky-300/20 pl-4 text-[11px] leading-5 text-slate-600">
              <span>{item.contextBefore}</span>{" "}
              <span className="text-slate-400">{item.excerpt}</span>{" "}
              <span>{item.contextAfter}</span>
            </div>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="line-clamp-1 text-[10px] text-slate-700">{item.relevance}</p>
            <button type="button" onClick={onExpand} className="shrink-0 text-[10px] text-slate-600 transition hover:text-slate-300">
              {expanded ? "Collapse context" : "Surrounding context"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function HighlightedTerms({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) {
    return text;
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
      <mark key={`${part}:${index}`} className="rounded bg-sky-400/[0.13] px-0.5 text-sky-100">{part}</mark>
    ) : (
      <span key={`${part}:${index}`}>{part}</span>
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
