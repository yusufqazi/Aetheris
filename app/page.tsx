import Link from "next/link";
import { Beaker, BrainCircuit, FileSearch, FlaskConical, Orbit, ShieldAlert, Stethoscope } from "lucide-react";

import { AgentShowcaseCard } from "@/components/landing/AgentShowcaseCard";
import { AnimatedAgentPanel } from "@/components/landing/AnimatedAgentPanel";
import { DebateConsensusShowcase } from "@/components/landing/DebateConsensusShowcase";
import { FinalCta } from "@/components/landing/FinalCta";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { ReportPreview } from "@/components/landing/ReportPreview";
import { SafetyDisclaimer } from "@/components/landing/SafetyDisclaimer";
import { StatBand } from "@/components/landing/StatBand";
import { WorkflowTimeline } from "@/components/landing/WorkflowTimeline";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";

const agents = [
  {
    title: "Literature Retrieval Agent",
    purpose: "Ranks the strongest passages before the rest of the system reasons over them.",
    output: "Most relevant safety excerpt identified with source context attached.",
    confidence: "medium",
    uncertainty: "Depends on source quality",
    icon: FileSearch,
    accent: "#7dd3fc",
  },
  {
    title: "Drug Interaction Agent",
    purpose: "Reviews co-administration concerns without overstating certainty.",
    output: "Possible exposure increase discussed cautiously, not as a firm contraindication.",
    confidence: "moderate",
    uncertainty: "Needs PK context",
    icon: FlaskConical,
    accent: "#93c5fd",
  },
  {
    title: "Adverse Reaction Agent",
    purpose: "Extracts recurring safety signals and population-specific warnings.",
    output: "Nausea and dizziness recur across the combination arm in source language.",
    confidence: "supported",
    uncertainty: "Frequency may be partial",
    icon: ShieldAlert,
    accent: "#60a5fa",
  },
  {
    title: "Clinical Trial Summarizer",
    purpose: "Condenses design, endpoints, outcomes, and limitations into one briefing view.",
    output: "Mid-stage randomized trial with useful benefit-risk framing and narrow subgroup depth.",
    confidence: "structured",
    uncertainty: "Population may be narrow",
    icon: Beaker,
    accent: "#a5b4fc",
  },
  {
    title: "Debate / Consensus Agent",
    purpose: "Surfaces disagreement, missing evidence, and where conclusions should stay bounded.",
    output: "Agents align on safety language but differ on how strong the interaction signal is.",
    confidence: "balanced",
    uncertainty: "Depends on evidence breadth",
    icon: BrainCircuit,
    accent: "#c4b5fd",
  },
  {
    title: "Report Generation Agent",
    purpose: "Assembles the final research memo with summary, evidence, and follow-up direction.",
    output: "Executive-ready report with visible limitations and research-only framing.",
    confidence: "briefing-ready",
    uncertainty: "Support material only",
    icon: Stethoscope,
    accent: "#67e8f9",
  },
];

export default function Home() {
  return (
    <>
      <LandingNavbar />

      <main className="overflow-hidden pb-6">
        <section className="section-shell px-4 pt-8">
          <div className="hero-frame relative overflow-hidden rounded-[2.5rem] border border-[var(--border)] bg-[var(--panel)] px-6 py-7 shadow-[var(--shadow-hero)] lg:px-10 lg:py-9">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.12),transparent_30%),radial-gradient(circle_at_78%_26%,rgba(29,78,216,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
            <div className="relative grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                  <Orbit className="h-4 w-4 text-[var(--accent-bright)]" />
                  Aetheris
                </div>

                <p className="mt-6 text-sm font-medium uppercase tracking-[0.24em] text-[var(--accent-bright)]">
                  Multi-agent research intelligence for pharma documents.
                </p>
                <h1 className="headline-display mt-4 max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-[var(--text-primary)] md:text-6xl xl:text-[4.35rem]">
                  AI Research Workspace for Pharma Document Intelligence
                </h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--text-secondary)]">
                  Upload clinical and pharmaceutical PDFs, orchestrate specialized AI agents,
                  compare evidence, surface uncertainty, and generate structured research
                  briefings with safety-first framing.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/research/new"
                    className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition duration-300 hover:translate-y-[-1px] hover:bg-[var(--accent-strong)]"
                  >
                    Launch demo workspace
                  </Link>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-6 py-3.5 text-sm font-semibold text-[var(--text-primary)] transition duration-300 hover:border-[var(--accent-border)] hover:bg-[var(--panel-muted)]"
                  >
                    View dashboard
                  </Link>
                </div>

                <SafetyDisclaimer body={RESEARCH_DISCLAIMER} className="mt-7 max-w-2xl" />
              </div>

              <AnimatedAgentPanel />
            </div>
          </div>
        </section>

        <StatBand />
        <WorkflowTimeline />

        <section className="section-shell px-4 pt-16" id="agents">
          <div className="mx-auto max-w-3xl text-center">
            <p className="section-label">Agent System</p>
            <h2 className="section-title mt-3">Six focused agents, shown quickly and cleanly.</h2>
            <p className="section-copy mt-3">
              Each role has a clear purpose, a single example output, and a visible boundary for
              uncertainty-aware research support.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentShowcaseCard key={agent.title} {...agent} />
            ))}
          </div>
        </section>

        <DebateConsensusShowcase />
        <ReportPreview disclaimer={RESEARCH_DISCLAIMER} />
        <FinalCta />

        <footer className="section-shell px-4 pb-10">
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-muted)] md:flex-row md:items-center md:justify-between">
            <p>Aetheris · multi-agent research intelligence for pharma documents.</p>
            <p>Built for evidence synthesis, uncertainty-aware analysis, and premium portfolio presentation.</p>
          </div>
        </footer>
      </main>
    </>
  );
}
