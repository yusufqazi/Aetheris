"use client";

import { ChevronDown, FileSearch, Quote, X } from "lucide-react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { documentTitle } from "@/components/workspace/report/CitationLinks";
import {
  findExactEvidenceSpan,
  getSessionCitations,
  pageTextFor,
  selectNarrowEvidenceQuote,
  surroundingEvidenceContext,
} from "@/lib/research/evidence-spans";
import type {
  Citation,
  EvidenceItem,
  EvidenceRelationship,
  GroundedFact,
  ResearchSession,
} from "@/lib/types";

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
  const views = session ? buildEvidenceViews(
    session,
    evidence,
    inspector.citationIds ?? [],
    inspector.claimText,
    inspector.evidenceRelationships ?? [],
  ) : [];
  const source = views[0];
  const sections = evidenceSections(views);

  return (
    <div data-testid="evidence-inspector" className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-sky-400">Source evidence</p>
          {source ? (
            <>
              <h2 className="mt-2 truncate text-sm font-semibold text-white">{documentTitle(source.citation.documentName)}</h2>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.15em] text-slate-600">Page {source.citation.page ?? "unavailable"}</p>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setMobileInspectorOpen(false)}
          className="shrink-0 rounded-full border border-white/[0.08] p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close source evidence"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {source ? (
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] border border-sky-300/15 bg-sky-400/[0.07] text-sky-300">
                <FileSearch className="h-4 w-4" />
              </div>
              <div>
                <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-sky-400/80">Mapped evidence</p>
                <p className="mt-1 text-[10px] text-slate-500">{views.length} relevant excerpt{views.length === 1 ? "" : "s"} selected</p>
              </div>
            </div>

            <div className="mt-5 space-y-6">
              {sections.map((section) => (
                <section key={section.title} aria-label={section.title}>
                  <h3 className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-400">{section.title}</h3>
                  <p className="mt-1 text-[10px] leading-5 text-slate-600">{section.description}</p>
                  <div className="mt-3 space-y-3">
                    {section.views.map((view) => (
                      <article key={view.citation.id} className="rounded-[1rem] border border-white/[0.08] bg-black/20 p-4">
                        <p className="font-mono text-[7px] uppercase tracking-[0.15em] text-sky-300/70">{relationshipLabel(view.relationship.relationshipType)}</p>
                        {view.positioned ? (
                          <mark className="mt-2 block whitespace-pre-wrap rounded bg-sky-400/[0.13] px-2 py-1.5 text-sm leading-6 text-sky-50 ring-1 ring-inset ring-sky-300/15">
                            {view.quote}
                          </mark>
                        ) : (
                          <>
                            <blockquote className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{view.quote}</blockquote>
                            <p className="mt-2 text-[9px] leading-4 text-amber-200/60">The quote was extracted, but exact positioning in the stored page text was unavailable.</p>
                          </>
                        )}
                        <p className="mt-3 text-[11px] leading-5 text-slate-400">{view.relationship.relevanceExplanation}</p>
                        <div className="mt-3 border-l border-sky-300/20 pl-3">
                          <p className="font-mono text-[7px] uppercase tracking-[0.14em] text-slate-600">Mapped to</p>
                          <p className="mt-1 text-[11px] leading-5 text-slate-400">{view.claim}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {views.some((view) => view.positioned && (view.context.before || view.context.after)) ? (
              <details className="group mt-4 border-y border-white/[0.07] py-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs text-slate-400">
                  Show more context
                  <ChevronDown className="h-3.5 w-3.5 text-slate-700 transition group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t border-white/[0.06] py-4">
                  {views.filter((view) => view.positioned).map((view) => (
                    <blockquote key={view.citation.id} className="whitespace-pre-wrap text-xs leading-6 text-slate-600">
                      {view.context.before ? <span>{view.context.before} </span> : null}
                      <mark className="rounded bg-sky-400/[0.12] px-1 text-sky-100">{view.quote}</mark>
                      {view.context.after ? <span> {view.context.after}</span> : null}
                    </blockquote>
                  ))}
                </div>
              </details>
            ) : null}

            {source.pageText ? (
              <details className="group border-b border-white/[0.07] py-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs text-slate-500">
                  View full page text
                  <ChevronDown className="h-3.5 w-3.5 text-slate-700 transition group-open:rotate-180" />
                </summary>
                <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border-t border-white/[0.06] py-4 font-sans text-[11px] leading-6 text-slate-600">{source.pageText}</pre>
              </details>
            ) : null}

            <div className="mt-5">
              <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-600">Source details</p>
              <dl className="mt-3 space-y-3 text-[11px] leading-5 text-slate-500">
                <div><dt className="text-slate-700">Document</dt><dd>{source.citation.documentName}</dd></div>
                <div><dt className="text-slate-700">Imported</dt><dd>{source.importedAt}</dd></div>
                <div><dt className="text-slate-700">Evidence relevance</dt><dd>{source.citation.relevance ?? source.evidence?.relevance ?? "Relevant to the active research question."}</dd></div>
              </dl>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[24rem] flex-col items-center justify-center text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-slate-600">
              <Quote className="h-4 w-4" />
            </div>
            <h2 className="mt-5 text-sm font-semibold text-slate-300">Choose a citation to verify it</h2>
            <p className="mt-2 max-w-xs text-xs leading-6 text-slate-600">The exact supporting quote appears first; surrounding source text stays collapsed.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function buildEvidenceViews(
  session: ResearchSession,
  selectedEvidence: EvidenceItem | null,
  selectedCitationIds: string[],
  selectedClaim?: string | null,
  selectedRelationships: EvidenceRelationship[] = [],
) {
  const citations = getSessionCitations(session);
  const selected = selectedCitationIds.length > 0
    ? selectedCitationIds.map((id) => citations.find((citation) => citation.id === id)).filter((citation): citation is Citation => Boolean(citation))
    : citations.filter((citation) => citation.evidenceId === selectedEvidence?.id);
  const fallback = selected.length > 0 ? selected : selectedEvidence ? [fallbackCitation(selectedEvidence)] : [];

  return fallback.map((citation) => {
    const evidence = session.evidence.find((item) => item.id === citation.evidenceId) ?? selectedEvidence;
    const pageText = pageTextFor(session.documents, citation.documentId, citation.page);
    const candidate = citation.exactQuote
      ?? matchingFact(session, citation)?.excerpt
      ?? selectNarrowEvidenceQuote(citation.excerpt, evidence?.matchedTerms ?? []);
    const span = pageText && candidate ? findExactEvidenceSpan(pageText, candidate) : null;
    const document = session.documents.find((item) => item.id === citation.documentId);
    const relationship = selectedRelationships.find((item) => item.citationId === citation.id)
      ?? fallbackRelationship(citation, selectedClaim, span?.quote ?? candidate ?? citation.excerpt);
    return {
      citation,
      evidence,
      pageText,
      quote: span?.quote ?? candidate ?? "No narrow exact quote was available for this legacy evidence record.",
      positioned: Boolean(span),
      context: span ? surroundingEvidenceContext(pageText, span.startOffset, span.endOffset) : { before: "", after: "" },
      claim: selectedClaim ?? matchingFact(session, citation)?.text ?? citation.relevance ?? "The selected analytical finding.",
      relationship,
      importedAt: document?.uploadedAt ? new Date(document.uploadedAt).toLocaleDateString() : "Unavailable",
    };
  });
}

function evidenceSections(views: ReturnType<typeof buildEvidenceViews>) {
  const definitions = [
    {
      title: "Relevant evidence",
      description: "Evidence describing what is currently known.",
      types: ["supports", "provides_context"],
    },
    {
      title: "Missing evidence",
      description: "Source text identifying an unresolved gap or proposed follow-up.",
      types: ["identifies_missing_evidence", "proposes_follow_up"],
    },
    {
      title: "Related but not supporting",
      description: "Evidence that weakens or conflicts with the selected item.",
      types: ["weakens", "contradicts"],
    },
  ] as const;
  return definitions.map((definition) => ({
    ...definition,
    views: views.filter((view) => definition.types.includes(view.relationship.relationshipType as never)),
  })).filter((section) => section.views.length > 0);
}

function fallbackRelationship(
  citation: Citation,
  claim: string | null | undefined,
  quote: string,
): EvidenceRelationship {
  const relationshipType = claim?.trim().endsWith("?") ? "provides_context" : "supports";
  return {
    id: `relationship:fallback:${citation.id}`,
    evidenceId: citation.evidenceId,
    citationId: citation.id,
    supportedItemId: "legacy-selection",
    relationshipType,
    relevanceExplanation: relationshipType === "provides_context"
      ? "Documents a directly relevant observation without resolving the open question."
      : "Directly documents the selected finding.",
    exactQuote: quote,
    documentId: citation.documentId,
    documentName: citation.documentName,
    page: citation.page,
    confidence: "medium",
  };
}

function relationshipLabel(type: EvidenceRelationship["relationshipType"]) {
  return {
    supports: "Supports",
    weakens: "Weakens",
    contradicts: "Contradicts",
    provides_context: "Documents what is known",
    identifies_missing_evidence: "Identifies missing evidence",
    proposes_follow_up: "Proposes follow-up",
  }[type];
}

function matchingFact(session: ResearchSession, citation: Citation): GroundedFact | undefined {
  const facts = session.results?.groundedFacts ?? [];
  return citation.supportedClaimIds?.map((id) => facts.find((fact) => fact.id === id)).find(Boolean)
    ?? facts.find((fact) => fact.evidenceId === citation.evidenceId);
}

function fallbackCitation(evidence: EvidenceItem): Citation {
  return {
    id: `citation:fallback:${evidence.id}`,
    evidenceId: evidence.id,
    chunkId: evidence.chunkId,
    documentId: evidence.documentId,
    documentName: evidence.documentName,
    page: evidence.page,
    excerpt: evidence.excerpt,
    label: "[1]",
    relevance: evidence.relevance,
  };
}
