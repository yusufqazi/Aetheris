"use client";

import { nanoid } from "nanoid";
import { ArrowRight, CheckCircle2, FileSearch, Quote, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { FileUploader } from "@/components/FileUploader";
import { WorkspacePageHeader } from "@/components/workspace/WorkspacePageHeader";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { makeDemoDocuments } from "@/lib/demo-data";
import { applyResearchEvent, createResearchSession } from "@/lib/research/session";
import { AGENT_IDS, type ResearchEvent, type UploadedDocument } from "@/lib/types";

const QUESTION_PRESETS = [
  "Summarize the efficacy, safety findings, and limitations of this treatment.",
  "Which conclusions are strongly supported, and what evidence is missing?",
  "Compare the reported outcomes and adverse events across these documents.",
];

const OUTPUT_PROMISES = [
  {
    icon: <FileSearch className="h-4 w-4" />,
    title: "Concrete findings",
    body: "Reported outcomes, safety signals, study design, and limitations without generic filler.",
  },
  {
    icon: <Quote className="h-4 w-4" />,
    title: "Evidence attached",
    body: "Every important claim links to the exact document passage and page that supports it.",
  },
  {
    icon: <CheckCircle2 className="h-4 w-4" />,
    title: "Six focused reviews",
    body: "Retrieval, interactions, adverse reactions, clinical context, consensus, and report assembly remain visible.",
  },
];

type AnalysisCapability = {
  mode: "live" | "demo";
  label: string;
  description: string;
  provider?: "google" | "openai" | null;
  model?: string | null;
  embeddingModel?: string | null;
};

export function NewResearchClient() {
  const { setActiveSessionId, startAnalysis } = useWorkspace();
  const [sessionId] = useState(() => nanoid());
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [uploadEvents, setUploadEvents] = useState<ResearchEvent[]>([]);
  const [question, setQuestion] = useState(QUESTION_PRESETS[0]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [capability, setCapability] = useState<AnalysisCapability | null>(null);

  useEffect(() => {
    setActiveSessionId(null);
  }, [setActiveSessionId]);

  useEffect(() => {
    let active = true;
    fetch("/api/analyze", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: AnalysisCapability) => {
        if (active) setCapability(value);
      })
      .catch(() => {
        if (active) {
          setCapability({
            mode: "demo",
            label: "Analysis mode unavailable",
            description: "Aetheris could not confirm whether model-assisted analysis is configured.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const canRun = question.trim().length > 6 && documents.length > 0;

  function addUploadEvent(event: ResearchEvent) {
    setUploadEvents((current) =>
      current.some((item) => item.id === event.id) ? current : [...current, event],
    );
  }

  function loadExampleSources() {
    setDocuments(makeDemoDocuments());
    setUploadEvents([]);
    setError(null);
  }

  async function runAnalysis() {
    if (!canRun || isStarting) {
      setError("Add at least one prepared PDF and ask a focused research question.");
      return;
    }

    setError(null);
    setIsStarting(true);
    let session = createResearchSession({
      id: sessionId,
      question: question.trim(),
      selectedAgents: [...AGENT_IDS],
      documents,
      mode: capability?.mode ?? "demo",
    });

    for (const event of uploadEvents) {
      session = applyResearchEvent(session, event);
    }
    session = {
      ...session,
      question: question.trim(),
      documents,
      metrics: {
        ...session.metrics,
        documentCount: documents.length,
        pageCount: documents.reduce((sum, document) => sum + document.pageCount, 0),
      },
    };

    try {
      await startAnalysis(session);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[82rem] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <WorkspacePageHeader
        eyebrow="New evidence brief"
        title="What do you need to know?"
        description="Add the source documents and ask one focused clinical research question. Aetheris will return a concise answer that can be checked against the original evidence."
      />

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.65fr)] xl:items-start">
        <div className="space-y-10">
          <section>
            <SectionHeading index="01" title="Add source documents" detail={`${documents.length} ready`} />
            <div className="mt-4">
              <FileUploader
                sessionId={sessionId}
                documents={documents}
                onDocumentsChange={setDocuments}
                onEvent={addUploadEvent}
              />
            </div>
            {documents.length === 0 ? (
              <button
                type="button"
                onClick={loadExampleSources}
                className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-sky-300"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                Try Aetheris with example clinical documents
              </button>
            ) : null}
          </section>

          <section>
            <SectionHeading index="02" title="Ask one focused question" detail="Required" />
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={5}
              className="mt-4 w-full resize-y rounded-[1.4rem] border border-white/[0.09] bg-white/[0.025] px-5 py-5 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-700 focus:border-sky-300/30 focus:bg-sky-400/[0.025] focus:shadow-[0_0_0_4px_rgba(56,189,248,0.035)]"
              aria-label="Research question"
              placeholder="What should Aetheris determine from these documents?"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {QUESTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuestion(preset)}
                  className="rounded-full border border-white/[0.07] px-3 py-2 text-left text-[10px] text-slate-600 transition hover:border-white/[0.13] hover:text-slate-300"
                >
                  {preset}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(150deg,rgba(37,99,235,0.1),rgba(255,255,255,0.02)_46%,rgba(2,6,23,0.08))] p-6 xl:sticky xl:top-10">
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sky-400">What you will get</p>
          <div className="mt-5 divide-y divide-white/[0.07]">
            {OUTPUT_PROMISES.map((item) => (
              <div key={item.title} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.75rem] border border-sky-300/15 bg-sky-400/[0.07] text-sky-300">
                  {item.icon}
                </span>
                <div>
                  <h2 className="text-sm font-medium text-slate-200">{item.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.body}</p>
                </div>
              </div>
            ))}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[0.9rem] border border-white/[0.07] bg-white/[0.07]">
            <ReadinessMetric label="Sources" value={String(documents.length)} />
            <ReadinessMetric label="Pages" value={String(documents.reduce((sum, item) => sum + item.pageCount, 0))} />
          </dl>

          <div className={`mt-4 rounded-[0.9rem] border px-4 py-3 ${capability?.mode === "live" ? "border-emerald-300/15 bg-emerald-300/[0.035]" : "border-sky-300/15 bg-sky-400/[0.04]"}`}>
            <p className={`font-mono text-[8px] uppercase tracking-[0.18em] ${capability?.mode === "live" ? "text-emerald-300/80" : "text-sky-300/80"}`}>
              {capability?.label ?? "Checking analysis mode"}
            </p>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">
              {capability?.description ?? "Aetheris is checking which research engine is available before this run begins."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void runAnalysis()}
            disabled={!canRun || isStarting}
            className="group mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#1d4ed8,#60a5fa)] px-5 text-sm font-semibold text-white shadow-[0_18px_52px_rgba(37,99,235,0.28)] transition duration-300 hover:-translate-y-px hover:shadow-[0_22px_60px_rgba(37,99,235,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {isStarting
              ? capability?.mode === "live" ? "Running six-agent analysis..." : "Extracting evidence locally..."
              : capability?.mode === "live" ? "Run six-agent analysis" : "Extract evidence locally"}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
          <p className="mt-3 text-center text-[10px] leading-5 text-slate-700">
            Research support only. Important conclusions should be independently reviewed.
          </p>
          {error ? <p className="mt-3 text-xs leading-5 text-amber-200/70">{error}</p> : null}
        </aside>
      </div>
    </div>
  );
}

function SectionHeading({ index, title, detail }: { index: string; title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] text-sky-400">{index}</span>
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-700">{detail}</span>
    </div>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#07111f]/80 px-3 py-3 text-center">
      <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-700">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-300">{value}</dd>
    </div>
  );
}
