"use client";

import { useRouter } from "next/navigation";
import { Beaker, BrainCircuit, FileSearch, FlaskConical, ShieldAlert, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";

import { DashboardShell } from "@/components/DashboardShell";
import { FileUploader } from "@/components/FileUploader";
import { saveLocalSession } from "@/lib/session-store";
import { AGENT_IDS, type AgentId, type ResearchSession, type UploadedDocument } from "@/lib/types";

const AGENT_META: Array<{ id: AgentId; label: string; description: string; icon: ReactNode }> = [
  {
    id: "literature-search",
    label: "Literature Search",
    description: "Semantic-style retrieval across the uploaded source set.",
    icon: <FileSearch className="h-5 w-5" />,
  },
  {
    id: "drug-interaction",
    label: "Drug Interaction",
    description: "Flags possible co-administration concerns and severity.",
    icon: <FlaskConical className="h-5 w-5" />,
  },
  {
    id: "adverse-reaction",
    label: "Adverse Reaction",
    description: "Extracts safety signals, warnings, and contraindications.",
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  {
    id: "trial-summarizer",
    label: "Trial Summarizer",
    description: "Condenses design, endpoints, findings, and limitations.",
    icon: <Beaker className="h-5 w-5" />,
  },
  {
    id: "debate-consensus",
    label: "Debate / Consensus",
    description: "Identifies agent agreement, disagreement, and uncertainty.",
    icon: <BrainCircuit className="h-5 w-5" />,
  },
  {
    id: "report-generation",
    label: "Report Generator",
    description: "Produces the physician-style and patient-friendly briefings.",
    icon: <Stethoscope className="h-5 w-5" />,
  },
];

export function NewResearchClient() {
  const router = useRouter();
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [question, setQuestion] = useState(
    "Compare adverse event profiles across these studies.",
  );
  const [selectedAgents, setSelectedAgents] = useState<AgentId[]>([...AGENT_IDS]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canRun = question.trim().length > 6 && documents.length > 0;
  const selectedCountLabel = useMemo(
    () => `${selectedAgents.length} of ${AGENT_IDS.length} agents enabled`,
    [selectedAgents.length],
  );

  function toggleAgent(agentId: AgentId) {
    setSelectedAgents((current) =>
      current.includes(agentId)
        ? current.filter((item) => item !== agentId)
        : [...current, agentId],
    );
  }

  function runAnalysis() {
    if (!canRun) {
      setError("Add at least one PDF and a research question before starting analysis.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          selectedAgents,
          documents,
        }),
      });

      if (!response.ok) {
        setError("The analysis pipeline did not complete. Please try again.");
        return;
      }

      const session = (await response.json()) as ResearchSession;
      saveLocalSession(session);
      router.push(`/research/${session.id}`);
    });
  }

  return (
    <DashboardShell
      title="New Research Session"
      description="Upload the primary PDFs, define the research objective, and launch the multi-agent workflow. If API credentials are not configured, Aetheris falls back to a polished demo mode so the experience stays usable."
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <FileUploader documents={documents} onDocumentsChange={setDocuments} />

          <div className="glass-panel rounded-[2rem] p-6">
            <label className="font-semibold text-[var(--text-primary)]">
              Research question
            </label>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={5}
              className="mt-4 w-full rounded-[1.5rem] border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-4 text-sm leading-7 text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Compare adverse event profiles across these studies.",
                "Summarize contraindications mentioned in these documents.",
                "Generate a physician-style briefing.",
                "Generate a patient-friendly summary.",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuestion(preset)}
                  className="rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--panel-muted)]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-[2rem] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">Agent lineup</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {selectedCountLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgents([...AGENT_IDS])}
                className="rounded-full bg-[var(--panel-muted)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
              >
                Reset
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {AGENT_META.map((agent) => {
                const active = selectedAgents.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--panel-strong)] hover:bg-[var(--panel-muted)]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 text-[var(--navy)]">{agent.icon}</div>
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="font-semibold">{agent.label}</p>
                          <span className="rounded-full bg-[var(--panel)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                            {active ? "Enabled" : "Off"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                          {agent.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] p-6">
            <h3 className="text-xl font-semibold">Run workflow</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              The pipeline extracts text, ranks relevant chunks, fans out specialized agent
              reasoning, then assembles a final consensus report with visible evidence.
            </p>
            <button
              type="button"
              onClick={runAnalysis}
              className="mt-5 w-full rounded-full bg-[var(--navy)] px-5 py-4 text-sm font-semibold text-white transition hover:bg-[#0f2740] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canRun || isPending}
            >
              {isPending ? "Running multi-agent analysis..." : "Run analysis"}
            </button>
            {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
