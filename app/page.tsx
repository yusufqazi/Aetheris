import Link from "next/link";
import {
  ArrowRight,
  Beaker,
  BrainCircuit,
  FileSearch,
  FlaskConical,
  Orbit,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";

import { AgentShowcaseCard } from "@/components/landing/AgentShowcaseCard";
import { AnimatedAgentPanel } from "@/components/landing/AnimatedAgentPanel";
import { DebateConsensusShowcase } from "@/components/landing/DebateConsensusShowcase";
import { FinalCta } from "@/components/landing/FinalCta";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { ReportPreview } from "@/components/landing/ReportPreview";
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
        <section className="relative px-4 pt-6 lg:pt-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(96,165,250,0.3),transparent)]" />
          <div className="section-shell relative">
            <div className="grid gap-8 lg:h-[min(640px,calc(100svh-8rem))] lg:min-h-[540px] lg:grid-cols-[0.95fr_1.05fr] lg:items-center xl:gap-12">
              <div className="max-w-[35rem] py-3 lg:py-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-sm)] backdrop-blur-xl">
                  <Orbit className="h-4 w-4 text-[var(--accent-bright)]" />
                  <span>Aetheris</span>
                </div>

                <h1 className="mt-6 max-w-[38rem] text-[3rem] font-semibold leading-[1.03] text-[var(--text-primary)] sm:text-[3.45rem] lg:text-[3.3rem] xl:text-[3.55rem]">
                  <span className="block">AI Research</span>
                  <span className="block opacity-[0.82]">Workspace for</span>
                  <span className="block pb-2 bg-[linear-gradient(100deg,#f8fbff_0%,#9cccff_54%,#e4efff_100%)] bg-clip-text text-transparent">
                    Clinical Intelligence
                  </span>
                </h1>
                <p className="mt-6 max-w-[31rem] text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
                  Aetheris turns pharma and clinical PDFs into evidence-linked insight,
                  coordinating specialist AI agents into a clear research brief.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/research/new"
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#1d4ed8,#4f8df8)] px-5 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(37,99,235,0.34)] transition duration-300 hover:translate-y-[-1px] hover:shadow-[0_22px_60px_rgba(37,99,235,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-bright)]"
                  >
                    Start research
                    <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/dashboard"
                    className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.045)] px-5 text-sm font-semibold text-[var(--text-primary)] shadow-[0_14px_38px_rgba(2,6,23,0.18)] backdrop-blur-xl transition duration-300 hover:translate-y-[-1px] hover:border-[var(--accent-border)] hover:bg-[rgba(255,255,255,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-bright)]"
                  >
                    View workspace
                  </Link>
                </div>
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
