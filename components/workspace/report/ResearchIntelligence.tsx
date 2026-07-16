"use client";

import { AlertTriangle, ExternalLink, GitCompareArrows, Route, Target } from "lucide-react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { Citation, ResearchIntelligence as ResearchIntelligenceData, ResearchSession } from "@/lib/types";

export function ResearchIntelligence({
  intelligence,
  citations,
  session,
}: {
  intelligence: ResearchIntelligenceData;
  citations: Citation[];
  session: ResearchSession;
}) {
  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-sky-300/15 bg-[radial-gradient(circle_at_10%_0%,rgba(14,165,233,0.09),transparent_34%),linear-gradient(145deg,rgba(15,23,42,0.72),rgba(2,6,23,0.42))]">
      <div className="border-b border-white/[0.07] px-6 py-7 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-cyan-300">Research intelligence</p>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">
            {intelligence.answerStatus} answer
          </span>
        </div>
        <h3 className="mt-4 max-w-5xl text-[clamp(1.35rem,2.6vw,2.15rem)] font-medium leading-[1.3] tracking-[-0.035em] text-white">
          {intelligence.directAnswer}
        </h3>
        <div className="mt-7 grid gap-5 border-t border-white/[0.07] pt-6 lg:grid-cols-2">
          <ConclusionLine label="Strongest supported conclusion" text={intelligence.strongestSupportedConclusion} tone="supported" />
          <ConclusionLine label="Strongest counterpoint" text={intelligence.strongestCounterpoint} tone="counterpoint" />
        </div>
      </div>

      {intelligence.evidenceTrajectory.length > 0 ? (
        <IntelligenceBlock
          icon={<Route className="h-4 w-4" />}
          eyebrow="Evidence trajectory"
          title="How the evidence changes across the record"
          description="A source-linked sequence, not a blended document summary."
        >
          <div className="relative mt-6">
            <div className="absolute bottom-3 left-[0.66rem] top-3 w-px bg-gradient-to-b from-cyan-300/40 via-sky-400/20 to-transparent" />
            <div className="space-y-7">
              {intelligence.evidenceTrajectory.map((item, index) => (
                <div key={`${item.sequence}:${item.label}`} className="relative grid gap-3 pl-10 lg:grid-cols-[minmax(9rem,0.25fr)_minmax(0,1fr)]">
                  <span className="absolute left-0 top-0.5 flex h-[1.4rem] w-[1.4rem] items-center justify-center rounded-full border border-cyan-300/25 bg-[#071323] font-mono text-[7px] text-cyan-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-sky-300/75">{item.label}</p>
                  </div>
                  <div>
                    <p className="text-sm leading-7 text-slate-200">{item.finding}</p>
                    <p className="mt-2 text-xs leading-6 text-slate-500">{item.interpretation}</p>
                    <EvidenceLinks evidenceIds={item.evidenceIds} citations={citations} session={session} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </IntelligenceBlock>
      ) : null}

      {intelligence.interactionPathways.length > 0 ? (
        <IntelligenceBlock
          icon={<Target className="h-4 w-4" />}
          eyebrow="Signal pathways"
          title="What appears connected, and why it matters"
          description="Observed evidence stays separate from interpretation and uncertainty."
        >
          <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {intelligence.interactionPathways.map((pathway) => (
              <div key={pathway.title} className="grid gap-5 py-6 lg:grid-cols-[minmax(11rem,0.28fr)_minmax(0,1fr)]">
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.13em] ${priorityStyle(pathway.priority)}`}>
                    {pathway.priority} priority
                  </span>
                  <h4 className="mt-3 text-sm font-medium leading-6 text-white">{pathway.title}</h4>
                </div>
                <div>
                  <p className="text-sm leading-7 text-slate-200">{pathway.finding}</p>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Detail label="Observed signal" value={pathway.observedSignal} />
                    <Detail label="Why it matters" value={pathway.whyItMatters} />
                    <Detail label="Uncertainty" value={pathway.uncertainty} />
                  </dl>
                  <EvidenceLinks evidenceIds={pathway.evidenceIds} citations={citations} session={session} />
                </div>
              </div>
            ))}
          </div>
        </IntelligenceBlock>
      ) : null}

      {intelligence.contradictions.length > 0 ? (
        <IntelligenceBlock
          icon={<GitCompareArrows className="h-4 w-4" />}
          eyebrow="Contradiction review"
          title="Where the sources differ"
          description="Aetheris preserves disagreement and explains whether it can be reconciled."
        >
          <div className="mt-6 space-y-4">
            {intelligence.contradictions.map((contradiction) => (
              <div key={contradiction.issue} className="rounded-[1rem] border border-amber-200/10 bg-amber-100/[0.02] p-5">
                <h4 className="text-sm font-medium text-slate-100">{contradiction.issue}</h4>
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-amber-200/60">Source positions</p>
                    <ul className="mt-3 space-y-2">
                      {contradiction.sourcePositions.map((position) => <li key={position} className="text-xs leading-6 text-slate-500">{position}</li>)}
                    </ul>
                  </div>
                  <div>
                    <Detail label="Reconciliation" value={contradiction.reconciliation} />
                    <p className="mt-3 text-xs leading-6 text-amber-100/60">Impact: {contradiction.impact}</p>
                  </div>
                </div>
                <EvidenceLinks evidenceIds={contradiction.evidenceIds} citations={citations} session={session} />
              </div>
            ))}
          </div>
        </IntelligenceBlock>
      ) : null}

      {intelligence.decisionChangingUnknowns.length > 0 ? (
        <IntelligenceBlock
          icon={<AlertTriangle className="h-4 w-4" />}
          eyebrow="Decision-changing unknowns"
          title="What could change the answer"
          description="Prioritized evidence gaps, with the exact information needed to resolve them."
        >
          <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {intelligence.decisionChangingUnknowns.map((item, index) => (
              <div key={item.unknown} className="grid gap-4 py-5 sm:grid-cols-[2rem_minmax(0,1fr)]">
                <span className="font-mono text-[9px] text-slate-700">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium text-slate-200">{item.unknown}</h4>
                    <span className="font-mono text-[7px] uppercase tracking-[0.14em] text-amber-200/55">{item.priority}</span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-slate-500">{item.whyItMatters}</p>
                  <p className="mt-2 text-xs leading-6 text-sky-200/60">Evidence needed: {item.evidenceNeeded}</p>
                </div>
              </div>
            ))}
          </div>
        </IntelligenceBlock>
      ) : null}
    </section>
  );
}

function IntelligenceBlock({ icon, eyebrow, title, description, children }: { icon: React.ReactNode; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.07] px-6 py-8 last:border-b-0 sm:px-8 sm:py-9">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] border border-sky-300/15 bg-sky-400/[0.06] text-sky-300">{icon}</span>
        <div>
          <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>
          <h3 className="mt-1 text-xl font-medium tracking-[-0.03em] text-slate-100">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ConclusionLine({ label, text, tone }: { label: string; text: string; tone: "supported" | "counterpoint" }) {
  return (
    <div className={`border-l pl-4 ${tone === "supported" ? "border-emerald-300/30" : "border-amber-200/25"}`}>
      <p className={`font-mono text-[8px] uppercase tracking-[0.15em] ${tone === "supported" ? "text-emerald-300/70" : "text-amber-200/60"}`}>{label}</p>
      <p className="mt-2 text-xs leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">{label}</dt>
      <dd className="mt-2 text-xs leading-6 text-slate-500">{value}</dd>
    </div>
  );
}

function EvidenceLinks({ evidenceIds, citations, session }: { evidenceIds: string[]; citations: Citation[]; session: ResearchSession }) {
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  const linked = evidenceIds
    .map((id) => citations.find((citation) => citation.evidenceId === id || citation.chunkId === id))
    .filter((citation, index, values): citation is Citation => Boolean(citation) && values.findIndex((item) => item?.id === citation?.id) === index);

  if (linked.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-1.5">
      {linked.map((citation) => (
        <button
          key={citation.id}
          type="button"
          onClick={() => {
            selectInspector({ tab: "source", sessionId: session.id, evidenceId: citation.evidenceId });
            setMobileInspectorOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/15 bg-sky-400/[0.055] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-sky-300 transition hover:bg-sky-400/[0.12]"
        >
          {citation.label} p.{citation.page ?? "?"} <ExternalLink className="h-2.5 w-2.5" />
        </button>
      ))}
    </div>
  );
}

function priorityStyle(priority: ResearchIntelligenceData["interactionPathways"][number]["priority"]) {
  if (priority === "critical") return "border-rose-300/20 bg-rose-300/[0.06] text-rose-200";
  if (priority === "high") return "border-amber-200/20 bg-amber-200/[0.05] text-amber-100/80";
  if (priority === "moderate") return "border-sky-300/20 bg-sky-300/[0.05] text-sky-200/80";
  return "border-white/[0.08] bg-white/[0.025] text-slate-500";
}
