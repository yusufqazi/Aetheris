"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";

import { CitationLinks, documentTitle } from "@/components/workspace/report/CitationLinks";
import { InvestigationSummary } from "@/components/workspace/report/InvestigationSummary";
import { ResearchQuestionSummary } from "@/components/workspace/ResearchQuestionSummary";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { getSessionCitations, selectNarrowEvidenceQuote } from "@/lib/research/evidence-spans";
import {
  areSemanticallyEquivalent,
  semanticTopics,
} from "@/lib/research/evidence-relationships";
import { buildInvestigationData } from "@/lib/research/investigation";
import { createClinicalFindingTitle } from "@/lib/research/finding-titles";
import { modelFallbackReason } from "@/lib/research/user-facing-errors";
import type { AgentId, Citation, ResearchSession } from "@/lib/types";

const PROCESS_LABELS: Record<AgentId, string> = {
  "literature-search": "Evidence retrieval",
  "drug-interaction": "Interaction extraction",
  "adverse-reaction": "Safety review",
  "trial-summarizer": "Clinical-context review",
  "debate-consensus": "Cross-document comparison",
  "report-generation": "Report assembly",
};

export function InteractiveReport({ session }: { session: ResearchSession }) {
  const { startAnalysis } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [retryingModel, setRetryingModel] = useState(false);
  const report = session.results?.reportGeneration;
  const citations = getSessionCitations(session);
  const investigation = buildInvestigationData(session);
  const strongestEvidence = selectStrongestEvidenceItems(investigation, citations, session.question);
  const primaryAnswerSources = primaryAnswerCitationTargets(investigation);
  const fallbackReason = modelFallbackReason(session.events);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyReport() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(createCopyText(session, investigation, citations));
      setCopied(true);
    } catch {
      setCopyError("The report could not be copied. Check this browser's clipboard permission and try again.");
    }
  }

  async function retryModelAnalysis() {
    if (retryingModel) return;
    setRetryingModel(true);
    try {
      await startAnalysis(session, { retry: true });
    } finally {
      setRetryingModel(false);
    }
  }

  async function downloadReport() {
    if (!report || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const exportSections = createExportSections(investigation);
      const citationIds = new Set(exportSections.flatMap((section) => section.items.flatMap((item) => item.citationIds)));
      const response = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: session.question,
          directAnswer: investigation.directAnswer,
          supportLabel: investigation.support,
          supportDescription: investigation.supportDescription,
          primaryUncertainty: investigation.primaryUncertainty,
          mode: session.mode,
          createdAt: session.updatedAt,
          documents: session.documents.map((document) => document.name),
          citedDocumentCount: investigation.citedDocumentCount,
          sections: exportSections.map((section) => ({
            title: section.title,
            items: section.items.map((item) => ({
              text: item.text,
              citations: item.citationIds
                .map((id) => citations.find((citation) => citation.id === id))
                .filter((citation): citation is Citation => Boolean(citation))
                .map((citation) => `${documentTitle(citation.documentName)} · p.${citation.page ?? "?"}`),
            })),
          })),
          citations: citations
            .filter((citation) => citationIds.has(citation.id))
            .map((citation) => ({
              label: `${documentTitle(citation.documentName)} · p.${citation.page ?? "?"}`,
              documentName: citation.documentName,
              page: citation.page,
              excerpt: citation.excerpt,
            })),
          disclaimer: report.researchDisclaimer,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "The PDF could not be created.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "aetheris-evidence-brief.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The PDF could not be created.");
    } finally {
      setExporting(false);
    }
  }

  if (!report) {
    return <p className="py-16 text-center text-sm text-slate-500">The evidence brief is still being assembled.</p>;
  }

  return (
    <article aria-label="Aetheris evidence brief">
      <header className="border-b border-white/[0.07] pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-200">
            <ArrowLeft className="h-3.5 w-3.5" /> All analyses
          </Link>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[8px] uppercase tracking-[0.15em]">
            <span className="inline-flex items-center gap-1.5 text-emerald-300/75"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Completed</span>
            <span className="text-slate-700">/</span>
            <span className="text-sky-300/75">{session.mode === "live" ? "AI-assisted" : "Local analysis"}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <ResearchQuestionSummary question={session.question} />
            <p className="mt-3 text-[11px] text-slate-500">
              {session.documents.length} source{session.documents.length === 1 ? "" : "s"} · {session.metrics.pageCount} pages · {session.metrics.retrievedEvidenceCount} ranked passages
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void copyReport()} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.09] px-4 text-xs text-slate-300 transition hover:border-sky-300/20 hover:text-white">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => void downloadReport()} disabled={exporting} className="inline-flex h-10 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#1d4ed8,#60a5fa)] px-4 text-xs font-semibold text-white shadow-[0_12px_34px_rgba(37,99,235,0.2)] transition hover:-translate-y-px disabled:cursor-wait disabled:opacity-60">
              {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
            </button>
          </div>
        </div>
        {copyError ? <p role="alert" className="mt-2 text-right text-[10px] text-amber-200/70">{copyError}</p> : null}
        {exportError ? <p role="alert" className="mt-2 text-right text-[10px] text-amber-200/70">{exportError}</p> : null}
      </header>

      {fallbackReason ? (
        <section className="mt-5 flex flex-col gap-3 rounded-[1rem] border border-amber-200/15 bg-amber-200/[0.035] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Model analysis status">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.17em] text-amber-200/70">Model-assisted review unavailable</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              This brief completed with local source-grounded processing. Your documents and completed work were preserved.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void retryModelAnalysis()}
            disabled={retryingModel}
            aria-busy={retryingModel}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-amber-200/15 px-3.5 text-[11px] text-amber-100/80 transition hover:border-amber-200/30 hover:text-amber-50 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retryingModel ? "animate-spin" : ""}`} />
            {retryingModel ? "Retrying" : "Retry model analysis"}
          </button>
        </section>
      ) : null}

      <section className="mt-6 rounded-[1.35rem] border border-sky-300/15 bg-[radial-gradient(circle_at_92%_0%,rgba(37,99,235,0.15),transparent_40%),linear-gradient(145deg,rgba(37,99,235,0.07),rgba(255,255,255,0.015))] p-5 sm:p-7" aria-labelledby="primary-answer-title">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.32fr)]">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-sky-300">Primary answer</p>
            <h2 id="primary-answer-title" className="mt-3 max-w-4xl text-[clamp(1.15rem,2.2vw,1.65rem)] font-medium leading-[1.5] tracking-[-0.025em] text-slate-100">
              {investigation.directAnswer}
            </h2>
            {primaryAnswerSources.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Sources supporting the primary answer">
                {primaryAnswerSources.map((source) => (
                  <CitationLinks
                    key={source.citationId}
                    citationIds={[source.citationId]}
                    citations={citations}
                    session={session}
                    limit={1}
                    claim={source.claim}
                    relationships={source.relationships}
                    compact
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="border-t border-white/[0.08] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p title="Support reflects cited source breadth and whether a direct contradiction affects the conclusion." className="text-sm font-medium text-emerald-200/85">{investigation.support}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{investigation.supportDescription}</p>
            <details className="mt-3 text-[11px] leading-5 text-slate-500">
              <summary className="cursor-pointer text-slate-400">How support labels work</summary>
              <div className="mt-2 space-y-2 border-l border-white/[0.08] pl-3">
                <p><span className="text-slate-300">Strongly supported:</span> multiple direct passages or documents with little material conflict.</p>
                <p><span className="text-slate-300">Moderately supported:</span> relevant evidence with incomplete confirmation or important uncertainty.</p>
                <p><span className="text-slate-300">Limited support:</span> one weak or indirect source.</p>
                <p><span className="text-slate-300">Conflicting:</span> meaningful evidence supports different interpretations.</p>
              </div>
            </details>
            <div className="mt-5 border-l border-amber-200/25 pl-3">
              <p className="font-mono text-[7px] uppercase tracking-[0.15em] text-amber-200/60">Main uncertainty</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{investigation.primaryUncertainty}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8">
        <InvestigationSummary investigation={investigation} citations={citations} session={session} />
      </div>

      <section className="mt-8 border-t border-white/[0.07] pt-7" aria-labelledby="strongest-evidence-title">
        <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-sky-400">Supporting evidence</p>
        <h2 id="strongest-evidence-title" className="mt-2 text-lg font-medium tracking-[-0.025em] text-white">What the strongest passages establish</h2>
        {strongestEvidence.length > 0 ? (
          <div className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {strongestEvidence.map((item) => (
              <div key={item.citation.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <p className="text-sm font-medium text-slate-200">{item.title}</p>
                  <blockquote className="mt-2 text-sm leading-6 text-slate-300">“{item.quote}”</blockquote>
                  <p className="mt-2 text-xs leading-5 text-slate-500"><span className="text-slate-400">Linked conclusion:</span> {item.supports}</p>
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">{documentTitle(item.citation.documentName)} · p.{item.citation.page ?? "?"}</p>
                </div>
                <CitationLinks citationIds={[item.citation.id]} citations={citations} session={session} limit={1} claim={item.supports} relationships={item.relationships} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 border-y border-white/[0.07] py-5 text-sm leading-6 text-slate-500">
            No individual passage was strong and distinct enough to drive the conclusion on its own.
          </p>
        )}
      </section>

      <ProcessDisclosure session={session} />
    </article>
  );
}

export function primaryAnswerCitationTargets(
  investigation: ReturnType<typeof buildInvestigationData>,
) {
  const preferredIds = new Set(investigation.strongestCitationIds);
  const alignedFindings = investigation.findings.filter((finding) =>
    answerIncludesFinding(investigation.directAnswer, finding.statement),
  );

  return alignedFindings
    .flatMap((finding) => finding.citationIds.map((citationId) => ({
      citationId,
      claim: finding.statement,
      relationships: finding.relationships.filter((item) => item.citationId === citationId),
      preferred: preferredIds.has(citationId),
    })))
    .sort((left, right) => Number(right.preferred) - Number(left.preferred))
    .filter((item, index, items) =>
      items.findIndex((candidate) => candidate.citationId === item.citationId) === index,
    )
    .slice(0, 4);
}

function answerIncludesFinding(answer: string, finding: string) {
  if (areSemanticallyEquivalent(answer, finding)) return true;
  const answerTopics = new Set(semanticTopics(answer));
  const findingTopics = semanticTopics(finding);
  const shared = findingTopics.filter((topic) => answerTopics.has(topic)).length;
  const findingNumbers: string[] = finding.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const answerNumbers: string[] = answer.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const numbersAlign = findingNumbers.length === 0 ||
    findingNumbers.every((value) => answerNumbers.includes(value));
  return numbersAlign && shared >= Math.min(3, Math.max(2, findingTopics.length));
}

function ProcessDisclosure({ session }: { session: ResearchSession }) {
  const report = session.results?.reportGeneration;
  const modelReason = [...session.events].reverse().find((event) => event.type === "analysis.mode")?.data.reason;
  const fallbackReason = modelFallbackReason(session.events);
  const executionDescription = fallbackReason
    ? "Model-assisted analysis became unavailable; local source-grounded processing completed this brief."
    : session.mode === "live"
      ? modelReason ?? "Configured model-assisted analysis"
      : "Deterministic local evidence processing";
  return (
    <details className="group mt-8 border-y border-white/[0.07] py-1">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium text-slate-300">
        <span>How Aetheris analyzed this</span>
        <ChevronDown className="h-4 w-4 text-slate-600 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/[0.07] pb-5 pt-5">
        <div className="grid gap-5 text-xs leading-5 text-slate-500 sm:grid-cols-3">
          <div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">Sources</p><p className="mt-2">{session.documents.length} documents · {session.metrics.pageCount} extracted pages</p></div>
          <div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">Retrieval</p><p className="mt-2">{session.metrics.retrievedEvidenceCount} passages ranked with {session.metrics.retrievalMethod ?? "document"} retrieval</p></div>
          <div><p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">Execution</p><p className="mt-2">{executionDescription}</p></div>
        </div>

        <div className="mt-6 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {session.selectedAgents.map((agentId) => {
            const execution = session.agentExecutions[agentId];
            const contribution = execution?.output?.summary || execution?.currentTask || "No contribution was recorded.";
            return (
              <div key={agentId} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <p className="text-xs font-medium text-slate-300">{PROCESS_LABELS[agentId]}</p>
                <p className="text-xs leading-5 text-slate-500">{contribution}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-slate-600">
          {session.documents.map((document) => <span key={document.id} title={document.name}>{document.name} · {document.pageCount}p</span>)}
        </div>
        <p className="mt-5 border-l border-white/[0.08] pl-4 text-[10px] leading-5 text-slate-600">{report?.researchDisclaimer}</p>
      </div>
    </details>
  );
}

export function selectStrongestEvidenceItems(
  investigation: ReturnType<typeof buildInvestigationData>,
  citations: Citation[],
  question: string,
) {
  const candidates = investigation.findings.flatMap((finding) => finding.citationIds.map((id) => {
      const citation = citations.find((item) => item.id === id);
      if (!citation) return null;
      const evidenceQuery = finding.evidenceQuery ?? finding.statement;
      const quote = citation.exactQuote ?? selectNarrowEvidenceQuote(citation.excerpt) ?? citation.excerpt;
      const relationships = finding.relationships.filter((relationship) => relationship.citationId === citation.id);
      const hasSupportRelationship = relationships.some((relationship) => relationship.relationshipType === "supports");
      const legacyCompatibleSupport = investigation.findings.every((item) => item.relationships.length === 0) &&
        evidenceGenerallySupportsFinding(evidenceQuery, quote);
      if (
        quote.length < 20 ||
        /\?$/.test(quote.trim()) ||
        !isCompleteEvidenceQuote(quote) ||
        (!hasSupportRelationship && !legacyCompatibleSupport)
      ) return null;
      return {
        citation,
        quote,
        supports: finding.statement,
        title: createClinicalFindingTitle({
          statement: evidenceQuery,
          providedTitle: finding.theme,
          dimension: finding.dimension,
        }),
        dimension: finding.dimension,
        theme: finding.theme,
        priorityScore: finding.priorityScore,
        relationships,
        evidenceScore: finding.priorityScore
          + Number(finding.priority === "Primary finding") * 3
          + Number(relationships.some((relationship) => relationship.confidence === "high") || legacyCompatibleSupport) * 2
          + questionRelevanceScore(question, quote, evidenceQuery)
          + Number(/\b\d+(?:\.\d+)?\s*(?:%|mg|g\/dL|ng\/mL|ms|weeks?|months?)\b|\bp\s*[=<]/i.test(quote)) * 2
          + Number(/\b(?:follow-up|after|versus|compared|remained|persisted)\b|\bfrom\b.{1,40}\bto\b/i.test(quote)) * 3
          - Number(/^(?:baseline|initial)\b/i.test(quote)) * 2,
      };
    }))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.evidenceScore - left.evidenceScore);
  const requestedThemes = Array.from(new Set(investigation.findings.map((finding) => finding.theme)));
  const documentCount = new Set(candidates.map((candidate) => candidate.citation.documentId)).size;
  const targetCount = Math.min(6, Math.max(3, requestedThemes.length + Number(documentCount >= 4)));
  const selected: typeof candidates = [];
  const usedSources = new Set<string>();
  const usedDocuments = new Set<string>();

  const add = (candidate: typeof candidates[number] | undefined) => {
    if (!candidate) return false;
    const key = `${candidate.citation.documentId}:${candidate.citation.page ?? "na"}:${candidate.citation.startOffset ?? candidate.quote}`;
    const repeatsSelectedEvidence = selected.some((item) =>
      areSemanticallyEquivalent(item.quote, candidate.quote),
    );
    if (usedSources.has(key) || repeatsSelectedEvidence) return false;
    selected.push(candidate);
    usedSources.add(key);
    usedDocuments.add(candidate.citation.documentId);
    return true;
  };
  for (const theme of requestedThemes) {
    const scoped = candidates.filter((candidate) => candidate.theme === theme);
    if (!add(scoped.find((candidate) => !usedDocuments.has(candidate.citation.documentId)))) {
      add(scoped[0]);
    }
  }
  for (const candidate of candidates) {
    if (selected.length >= targetCount) break;
    if (usedDocuments.has(candidate.citation.documentId) || candidate.evidenceScore < 4) continue;
    add(candidate);
  }
  for (const candidate of candidates) {
    if (selected.length >= targetCount) break;
    if (candidate.evidenceScore < 4) continue;
    add(candidate);
  }
  return selected.slice(0, targetCount);
}

function isCompleteEvidenceQuote(quote: string) {
  const value = quote.replace(/\s+/g, " ").trim();
  return !/\b(?:and|or|that|which|because|with|from|to|of|initial|provided|including|following|ongoing)\s*[,:;.-]*$/i.test(value)
    && !/\bstudy\b.*\benrolling\b.*\b(?:chronic|acute|neuropathic|clinical|moderate|severe)\s*[.]*$/i.test(value);
}

function questionRelevanceScore(question: string, quote: string, finding: string) {
  const stopWords = new Set([
    "about", "after", "across", "could", "does", "from", "have", "into", "should", "that", "their", "these", "this", "what", "when", "which", "with",
  ]);
  const questionTokens = Array.from(new Set(
    question.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)?.filter((token) => !stopWords.has(token)) ?? [],
  ));
  const evidenceText = `${quote} ${finding}`.toLowerCase();
  const matches = questionTokens.filter((token) => evidenceText.includes(token)).length;
  return Math.min(4, matches);
}

function evidenceGenerallySupportsFinding(finding: string, quote: string) {
  const findingTokens = semanticTopics(finding);
  const quoteTokens = semanticTopics(quote);
  const shared = findingTokens.filter((token) => quoteTokens.includes(token)).length;
  const findingNumbers: string[] = finding.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const quoteNumbers: string[] = quote.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const numbersCompatible = findingNumbers.length === 0 ||
    quoteNumbers.length === 0 ||
    findingNumbers.some((value) => quoteNumbers.includes(value));
  return numbersCompatible && shared >= Math.min(2, Math.max(1, findingTokens.length));
}

function createExportSections(investigation: ReturnType<typeof buildInvestigationData>) {
  return [
    { title: "Findings", items: investigation.findings.map((item) => ({ text: item.statement, citationIds: item.citationIds })) },
    { title: "Conflicts", items: investigation.conflicts.map((item) => ({ text: `${item.type}: ${item.statement} ${item.explanation}`, citationIds: item.citationIds })) },
    { title: "Changes", items: investigation.changes.map((item) => ({ text: `${item.measure}: ${item.earlierValue} to ${item.laterValue}. ${item.interpretation}`, citationIds: item.citationIds })) },
    { title: "Open Questions", items: investigation.openQuestions.map((item) => ({ text: `${item.question} Known: ${item.known} Still missing: ${item.missingEvidence} Why it matters: ${item.whyItMatters}`, citationIds: item.citationIds })) },
  ].filter((section) => section.items.length > 0);
}

function createCopyText(session: ResearchSession, investigation: ReturnType<typeof buildInvestigationData>, citations: Citation[]) {
  const sections = createExportSections(investigation).map((section) => `## ${section.title}\n${section.items.map((item) => `- ${item.text}${copyCitationLabels(item.citationIds, citations)}`).join("\n")}`).join("\n\n");
  return `# Aetheris Evidence Brief\n\n**Research question:** ${session.question}\n\n## Primary Answer\n${investigation.directAnswer}\n\n**Support:** ${investigation.support}. ${investigation.supportDescription}\n\n**Main uncertainty:** ${investigation.primaryUncertainty}\n\n${sections}\n\n## Research-Use Note\n${session.results?.reportGeneration.researchDisclaimer ?? "Independent review is required."}`;
}

function copyCitationLabels(ids: string[], citations: Citation[]) {
  const labels = ids.map((id) => citations.find((citation) => citation.id === id)).filter((citation): citation is Citation => Boolean(citation)).map((citation) => `${documentTitle(citation.documentName)} p.${citation.page ?? "?"}`);
  return labels.length > 0 ? ` [${labels.join("; ")}]` : "";
}
