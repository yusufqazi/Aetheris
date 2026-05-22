"use client";

import { useEffect, useState } from "react";

import { AgentCard } from "@/components/AgentCard";
import { DashboardShell } from "@/components/DashboardShell";
import { EvidenceTable } from "@/components/EvidenceTable";
import { ReportViewer } from "@/components/ReportViewer";
import { findLocalSession } from "@/lib/session-store";
import type { ResearchSession } from "@/lib/types";

export function ResultsClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ResearchSession | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return findLocalSession(sessionId);
  });

  useEffect(() => {
    if (session) {
      return;
    }

    void fetch(`/api/sessions/${sessionId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setSession(data as ResearchSession | null))
      .catch(() => setSession(null));
  }, [session, sessionId]);

  if (!session?.results) {
    return (
      <DashboardShell
        title="Analysis Results"
        description="This session could not be found locally. If you expected it to exist, confirm your Supabase connection or rerun the analysis."
      >
        <div className="glass-panel rounded-[2rem] p-8">
          <h2 className="text-2xl font-semibold">Session not available</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
            Aetheris could not load the requested session. Demo sessions are stored locally in
            the browser, while deployed environments can also load them from Supabase.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const { results } = session;

  return (
    <DashboardShell title="Analysis Results" description={session.question}>
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <AgentCard title="Literature Search Agent" output={results.literatureSearch}>
            <div className="mt-5 space-y-3">
              {results.literatureSearch.topRelevantExcerpts.map((item, index) => (
                <div
                  key={`${item.documentName}-${index}`}
                  className="rounded-[1.5rem] bg-[var(--panel-muted)] p-4"
                >
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{item.excerpt}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                    {item.documentName} · {item.section ?? "Location unavailable"}
                  </p>
                </div>
              ))}
            </div>
          </AgentCard>

          <AgentCard title="Drug Interaction Agent" output={results.drugInteraction}>
            <div className="mt-5 space-y-3">
              {results.drugInteraction.findings.map((finding) => (
                <div
                  key={finding.possibleInteraction}
                  className="rounded-[1.5rem] bg-[var(--panel-muted)] p-4"
                >
                  <p className="font-semibold text-[var(--text-primary)]">
                    {finding.possibleInteraction}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {finding.notes}
                  </p>
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Severity {finding.severityEstimate} · Uncertainty {finding.uncertaintyLevel}
                  </p>
                </div>
              ))}
            </div>
          </AgentCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <AgentCard title="Adverse Reaction Agent" output={results.adverseReaction}>
            <div className="mt-5 space-y-3">
              {results.adverseReaction.findings.map((finding) => (
                <div
                  key={finding.adverseEvent + finding.sourceEvidence}
                  className="rounded-[1.5rem] bg-[var(--panel-muted)] p-4"
                >
                  <p className="font-semibold">{finding.adverseEvent}</p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {finding.frequency} · {finding.affectedPopulation}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {finding.sourceEvidence}
                  </p>
                </div>
              ))}
            </div>
          </AgentCard>

          <AgentCard title="Clinical Trial Summarizer Agent" output={results.trialSummarizer}>
            <div className="mt-5 space-y-3">
              {results.trialSummarizer.findings.map((finding) => (
                <div
                  key={finding.studyObjective}
                  className="rounded-[1.5rem] bg-[var(--panel-muted)] p-4 text-sm leading-6 text-[var(--text-secondary)]"
                >
                  <p>
                    <span className="font-semibold text-[var(--text-primary)]">Objective:</span>{" "}
                    {finding.studyObjective}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-[var(--text-primary)]">Methods:</span>{" "}
                    {finding.methods}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-[var(--text-primary)]">Key findings:</span>{" "}
                    {finding.keyFindings}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-[var(--text-primary)]">Limitations:</span>{" "}
                    {finding.limitations}
                  </p>
                </div>
              ))}
            </div>
          </AgentCard>
        </div>

        <AgentCard title="Debate / Consensus Agent" output={results.debateConsensus}>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <ConsensusList title="Agreements" items={results.debateConsensus.agreements} />
            <ConsensusList
              title="Disagreements"
              items={results.debateConsensus.disagreements}
            />
            <ConsensusList
              title="Missing evidence"
              items={results.debateConsensus.missingEvidence}
            />
          </div>
          <div className="mt-5 rounded-[1.5rem] bg-[var(--accent-soft)] p-5">
            <p className="font-semibold text-[var(--accent-deep)]">Final consensus</p>
            <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
              {results.debateConsensus.finalConsensus}
            </p>
          </div>
        </AgentCard>

        <ReportViewer report={results.reportGeneration} />

        <section className="space-y-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
              Evidence
            </p>
            <h3 className="mt-2 text-2xl font-semibold">Citations and source traceability</h3>
          </div>
          <EvidenceTable evidence={results.literatureSearch.evidence} />
        </section>
      </div>
    </DashboardShell>
  );
}

function ConsensusList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.5rem] bg-[var(--panel-muted)] p-4">
      <p className="font-semibold text-[var(--text-primary)]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-sm leading-6 text-[var(--text-secondary)]">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}
