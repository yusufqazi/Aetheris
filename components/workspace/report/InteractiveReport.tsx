"use client";

import {
  AlertTriangle,
  Beaker,
  Check,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { ResearchIntelligence } from "@/components/workspace/report/ResearchIntelligence";
import type { Citation, ReportItem, ReportSection, ResearchSession } from "@/lib/types";

export function InteractiveReport({ session }: { session: ResearchSession }) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const sections = session.reportSections.length > 0
    ? session.reportSections
    : session.results?.reportGeneration.sections ?? [];
  const report = session.results?.reportGeneration;
  const citations = session.results?.citations ?? report?.citations ?? [];
  const keyFindings = findSection(sections, "key-findings");
  const safety = findSection(sections, "safety-findings");
  const design = findSection(sections, "study-design");
  const limitations = findSection(sections, "limitations");
  const followUp = findSection(sections, "follow-up-questions");
  const confidence = session.confidence?.overall ?? 0;
  const concreteFindingCount = session.results?.groundedFacts?.length
    ?? sections.reduce((sum, section) => sum + section.items.length, 0);
  const assessment = assessmentFor(confidence);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyReport() {
    const markdown = report?.markdownReport ?? sectionsToText(sections);
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
  }

  async function downloadReport() {
    if (!report || exporting) return;
    setExporting(true);
    setExportError(null);

    try {
      const exportSections = sections.filter((section) =>
        ["key-findings", "safety-findings", "study-design", "limitations", "follow-up-questions"].includes(section.id),
      );
      const intelligenceSections = createIntelligenceExportSections(report.researchIntelligence, citations);
      const citationIds = new Set([
        ...exportSections.flatMap((section) => section.items.flatMap((item) => item.citationIds)),
        ...intelligenceSections.flatMap((section) => section.items.flatMap((item) => item.citationIds)),
      ]);
      const reportItemIds = new Set(exportSections.flatMap((section) => section.items.map((item) => item.id)));
      const response = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: session.question,
          executiveSummary: report.executiveSummary,
          confidence,
          mode: session.mode,
          createdAt: session.updatedAt,
          documents: session.documents.map((document) => document.name),
          sections: [...intelligenceSections, ...exportSections].map((section) => ({
            title: section.title,
            items: section.items.map((item) => ({
              text: item.text,
              citations: item.citationIds
                .map((id) => citations.find((citation) => citation.id === id)?.label)
                .filter((label): label is string => Boolean(label)),
            })),
          })),
          citations: citations
            .filter((citation) => citationIds.has(citation.id))
            .map((citation) => ({
              label: citation.label,
              documentName: citation.documentName,
              page: citation.page,
              excerpt: sourcePassagesFor(citation.evidenceId, session, reportItemIds),
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

  if (!report || sections.length === 0) {
    return (
      <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-white/[0.08] text-center">
        <FileText className="h-5 w-5 text-slate-700" />
        <p className="mt-4 text-sm text-slate-400">The evidence brief is still being assembled.</p>
      </div>
    );
  }

  return (
    <article aria-label="Aetheris evidence brief">
      <header className="flex flex-col gap-6 border-b border-white/[0.07] pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-300/80">Evidence brief ready</p>
          </div>
          <h2 className="mt-3 text-[clamp(2.2rem,5vw,4.6rem)] font-medium leading-[0.98] tracking-[-0.06em] text-white">
            The answer, with the evidence attached.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
            {concreteFindingCount} concrete findings traced to {citations.length} source citation{citations.length === 1 ? "" : "s"} across {session.documents.length} document{session.documents.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void copyReport()} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.09] px-4 text-xs text-slate-400 transition hover:border-sky-300/20 hover:text-white">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy brief"}
          </button>
          <button type="button" onClick={() => void downloadReport()} disabled={exporting} className="inline-flex h-10 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#1d4ed8,#60a5fa)] px-4 text-xs font-semibold text-white shadow-[0_12px_34px_rgba(37,99,235,0.2)] transition hover:-translate-y-px disabled:cursor-wait disabled:opacity-60">
            {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
          </button>
        </div>
      </header>
      {exportError ? <p className="mt-3 text-right text-[10px] text-amber-200/70">{exportError}</p> : null}

      <section className="mt-8 overflow-hidden rounded-[1.5rem] border border-sky-300/15 bg-[radial-gradient(circle_at_90%_0%,rgba(37,99,235,0.16),transparent_38%),linear-gradient(145deg,rgba(37,99,235,0.08),rgba(255,255,255,0.018)_52%,rgba(2,6,23,0.1))] p-6 sm:p-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sky-300">Bottom line</p>
            <p className="mt-4 text-[clamp(1.15rem,2.3vw,1.75rem)] leading-[1.55] tracking-[-0.02em] text-slate-100">
              {report.executiveSummary}
            </p>
          </div>
          <div className="min-w-[13rem] border-l border-white/[0.08] pl-5">
            <p className="text-3xl font-medium tracking-[-0.05em] text-white">{confidence}%</p>
            <p className="mt-1 text-xs font-medium text-sky-200">{assessment.label}</p>
            <p className="mt-2 max-w-[13rem] text-[10px] leading-5 text-slate-600">Source support, not medical certainty.</p>
          </div>
        </div>
      </section>

      {report.researchIntelligence ? (
        <div className="mt-8">
          <ResearchIntelligence intelligence={report.researchIntelligence} citations={citations} session={session} />
        </div>
      ) : session.mode === "demo" ? (
        <div className="mt-8 rounded-[1rem] border border-amber-200/10 bg-amber-100/[0.025] px-5 py-4">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-200/60">Local extraction mode</p>
          <p className="mt-2 text-xs leading-6 text-slate-500">This briefing organizes traceable facts, but deep cross-document interpretation was not run because no AI provider was configured.</p>
        </div>
      ) : null}

      <div className="mt-12 space-y-12">
        <FindingSection
          index="01"
          title="Findings that answer your question"
          description="The source-backed facts that directly address what you asked."
          icon={<ClipboardCheck className="h-4 w-4" />}
          section={keyFindings}
          citations={citations}
          session={session}
        />

        <FindingSection
          index="02"
          title="Safety findings"
          description="Reported adverse events and safety observations, without interpretation beyond the sources."
          icon={<ShieldCheck className="h-4 w-4" />}
          section={safety}
          citations={citations}
          session={session}
        />

        <div className={`grid gap-8 ${(design?.items.length ?? 0) > 0 ? "lg:grid-cols-2" : ""}`}>
          {(design?.items.length ?? 0) > 0 ? (
            <CompactSection
              index="03"
              title="What the documents describe"
              description="The population, tests, timeline, or study setup needed to understand the answer."
              icon={<Beaker className="h-4 w-4" />}
              section={design}
              citations={citations}
              session={session}
            />
          ) : null}
          <CompactSection
            index={(design?.items.length ?? 0) > 0 ? "04" : "03"}
            title="What remains uncertain"
            description="Questions the documents do not resolve, conflicting records, or evidence that is still missing."
            icon={<AlertTriangle className="h-4 w-4" />}
            section={limitations}
            citations={citations}
            session={session}
          />
        </div>

        <section className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.018] p-6 sm:p-7">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sky-400">Aetheris assessment</p>
              <h3 className="mt-3 text-2xl font-medium tracking-[-0.035em] text-white">{assessment.label}</h3>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">
                Aetheris found {concreteFindingCount} concrete statements with traceable support. {report.risksAndUncertainties[0] ?? "The conclusion remains limited to the uploaded source set."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {session.confidence?.dimensions.slice(0, 3).map((dimension) => (
                  <span key={dimension.id} className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[10px] text-slate-500">
                    {dimension.label}: <strong className="font-medium text-slate-300">{dimension.score}%</strong>
                  </span>
                ))}
              </div>
            </div>
            <div className="border-t border-white/[0.07] pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-600">What to investigate next</p>
              <ul className="mt-4 space-y-3">
                {(followUp?.items ?? []).slice(0, 3).map((item) => (
                  <li key={item.id} className="flex gap-3 text-xs leading-5 text-slate-500">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sky-400" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <SourcesUsed session={session} citations={citations} />
      </div>

      <footer className="mt-12 border-t border-white/[0.07] pt-5 text-[10px] leading-5 text-slate-700">
        {report.researchDisclaimer}
      </footer>
    </article>
  );
}

function FindingSection({
  index,
  title,
  description,
  icon,
  section,
  citations,
  session,
}: {
  index: string;
  title: string;
  description: string;
  icon: ReactNode;
  section?: ReportSection;
  citations: Citation[];
  session: ResearchSession;
}) {
  return (
    <section>
      <SectionTitle index={index} title={title} description={description} icon={icon} />
      <div className="mt-5 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {(section?.items ?? []).map((item, itemIndex) => (
          <FindingRow key={item.id} item={item} number={itemIndex + 1} citations={citations} session={session} />
        ))}
        {(section?.items.length ?? 0) === 0 ? <EmptySection /> : null}
      </div>
    </section>
  );
}

function CompactSection({
  index,
  title,
  description,
  icon,
  section,
  citations,
  session,
}: {
  index: string;
  title: string;
  description: string;
  icon: ReactNode;
  section?: ReportSection;
  citations: Citation[];
  session: ResearchSession;
}) {
  return (
    <section className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.018] p-6">
      <SectionTitle index={index} title={title} description={description} icon={icon} />
      <div className="mt-5 space-y-3">
        {(section?.items ?? []).map((item) => (
          <CompactFinding key={item.id} item={item} citations={citations} session={session} />
        ))}
        {(section?.items.length ?? 0) === 0 ? <EmptySection /> : null}
      </div>
    </section>
  );
}

function SectionTitle({ index, title, description, icon }: { index: string; title: string; description: string; icon: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] border border-sky-300/15 bg-sky-400/[0.06] text-sky-300">{icon}</span>
      <div>
        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-sky-400">{index}</p>
        <h3 className="mt-1 text-xl font-medium tracking-[-0.03em] text-slate-100">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function FindingRow({ item, number, citations, session }: { item: ReportItem; number: number; citations: Citation[]; session: ResearchSession }) {
  return (
    <div className="grid gap-4 py-5 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-start">
      <span className="font-mono text-[9px] text-slate-700">{String(number).padStart(2, "0")}</span>
      <p className="text-sm leading-7 text-slate-300">{item.text}</p>
      <CitationButtons item={item} citations={citations} session={session} />
    </div>
  );
}

function CompactFinding({ item, citations, session }: { item: ReportItem; citations: Citation[]; session: ResearchSession }) {
  return (
    <div className="rounded-[0.9rem] border border-white/[0.06] bg-black/10 px-4 py-3">
      <p className="text-xs leading-6 text-slate-400">{item.text}</p>
      <CitationButtons item={item} citations={citations} session={session} compact />
    </div>
  );
}

function CitationButtons({ item, citations, session, compact = false }: { item: ReportItem; citations: Citation[]; session: ResearchSession; compact?: boolean }) {
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  const linked = item.citationIds
    .map((id) => citations.find((citation) => citation.id === id))
    .filter((citation): citation is Citation => Boolean(citation));

  if (linked.length === 0) return null;
  return (
    <div className={`${compact ? "mt-3" : ""} flex flex-wrap gap-1.5`}>
      {linked.map((citation) => (
        <button
          key={citation.id}
          type="button"
          onClick={() => {
            selectInspector({ tab: "source", sessionId: session.id, evidenceId: citation.evidenceId });
            setMobileInspectorOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/15 bg-sky-400/[0.055] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-sky-300 transition hover:bg-sky-400/[0.12]"
          aria-label={`Open evidence from ${citation.documentName}, page ${citation.page ?? "unknown"}`}
        >
          {citation.label} p.{citation.page ?? "?"} <ExternalLink className="h-2.5 w-2.5" />
        </button>
      ))}
    </div>
  );
}

function SourcesUsed({ session, citations }: { session: ResearchSession; citations: Citation[] }) {
  return (
    <section className="border-t border-white/[0.07] pt-7">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-600">Sources used</p>
      <div className="mt-4 divide-y divide-white/[0.06]">
        {session.documents.map((document) => {
          const count = citations.filter((citation) => citation.documentId === document.id).length;
          return (
            <div key={document.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-300">{document.name}</p>
                <p className="mt-1 text-[10px] text-slate-600">{document.pageCount} page{document.pageCount === 1 ? "" : "s"}</p>
              </div>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-600">{count} cited passage{count === 1 ? "" : "s"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EmptySection() {
  return <p className="py-5 text-xs leading-6 text-slate-600">No concrete source-grounded finding was available for this part of the question.</p>;
}

function findSection(sections: ReportSection[], id: ReportSection["id"]) {
  return sections.find((section) => section.id === id);
}

function assessmentFor(score: number) {
  if (score >= 80) return { label: "Strongly supported within these sources" };
  if (score >= 60) return { label: "Supported, with important limitations" };
  return { label: "Preliminary and evidence-limited" };
}

function sectionsToText(sections: ReportSection[]) {
  return sections
    .map((section) => `## ${section.title}\n\n${section.body ?? ""}\n${section.items.map((item) => `- ${item.text}`).join("\n")}`)
    .join("\n\n");
}

function sourcePassagesFor(evidenceId: string, session: ResearchSession, reportItemIds: Set<string>) {
  const passages = (session.results?.groundedFacts ?? [])
    .filter((fact) =>
      fact.evidenceId === evidenceId && Array.from(reportItemIds).some((itemId) => itemId.endsWith(fact.id)),
    )
    .map((fact) => fact.excerpt.trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
  if (passages.length > 0) {
    return passages.join("\n\n");
  }
  return session.results?.citations?.find((citation) => citation.evidenceId === evidenceId)?.excerpt
    ?? "The source passage is available in the Aetheris evidence inspector.";
}

function createIntelligenceExportSections(
  intelligence: NonNullable<ResearchSession["results"]>["reportGeneration"]["researchIntelligence"],
  citations: Citation[],
) {
  if (!intelligence) return [];
  const citationIdsFor = (evidenceIds: string[]) => evidenceIds
    .map((id) => citations.find((citation) => citation.evidenceId === id || citation.chunkId === id)?.id)
    .filter((id): id is string => Boolean(id));
  return [
    {
      title: "Research Intelligence",
      items: [
        { id: "intelligence:answer", text: intelligence.directAnswer, citationIds: [] },
        { id: "intelligence:conclusion", text: `Strongest supported conclusion: ${intelligence.strongestSupportedConclusion}`, citationIds: [] },
        { id: "intelligence:counterpoint", text: `Strongest counterpoint: ${intelligence.strongestCounterpoint}`, citationIds: [] },
      ],
    },
    {
      title: "Evidence Trajectory",
      items: intelligence.evidenceTrajectory.map((item, index) => ({
        id: `intelligence:trajectory:${index}`,
        text: `${item.label}: ${item.finding} Interpretation: ${item.interpretation}`,
        citationIds: citationIdsFor(item.evidenceIds),
      })),
    },
    {
      title: "Signal Pathways",
      items: intelligence.interactionPathways.map((item, index) => ({
        id: `intelligence:pathway:${index}`,
        text: `${item.title} (${item.priority}): ${item.finding} Why it matters: ${item.whyItMatters} Uncertainty: ${item.uncertainty}`,
        citationIds: citationIdsFor(item.evidenceIds),
      })),
    },
    {
      title: "Contradictions and Reconciliation",
      items: intelligence.contradictions.map((item, index) => ({
        id: `intelligence:contradiction:${index}`,
        text: `${item.issue} Reconciliation: ${item.reconciliation} Impact: ${item.impact}`,
        citationIds: citationIdsFor(item.evidenceIds),
      })),
    },
    {
      title: "What Could Change the Answer",
      items: intelligence.decisionChangingUnknowns.map((item, index) => ({
        id: `intelligence:unknown:${index}`,
        text: `${item.unknown} Why it matters: ${item.whyItMatters} Evidence needed: ${item.evidenceNeeded}`,
        citationIds: [],
      })),
    },
  ].filter((section) => section.items.length > 0);
}
