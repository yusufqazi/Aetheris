import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { AnimatedAgentPanel } from "@/components/landing/AnimatedAgentPanel";
import { ArchitectureDiagram } from "@/components/landing/ArchitectureDiagram";
import { FinalCta } from "@/components/landing/FinalCta";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { MultiAgentAnalysis } from "@/components/landing/MultiAgentAnalysis";
import { ReportPreview } from "@/components/landing/ReportPreview";
import { TrustPrinciples } from "@/components/landing/TrustPrinciples";
import { WorkflowTimeline } from "@/components/landing/WorkflowTimeline";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";

export default function Home() {
  return (
    <div className="relative isolate bg-[#071a31]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[calc(100svh+6rem)] bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_82%_28%,rgba(30,64,175,0.2),transparent_34%),linear-gradient(180deg,#071a31_0%,#08192f_62%,#061426_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-[calc(100svh-2rem)] z-0 h-32 bg-[linear-gradient(180deg,transparent,#061426)]" />
      <LandingNavbar />

      <main className="relative z-10 overflow-x-clip pb-6">
        <section
          className="relative isolate -mb-px overflow-hidden bg-[#071a31] px-4 pt-6 lg:pt-5"
          id="platform"
        >
          <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_20%_18%,rgba(37,99,235,0.2),transparent_34%),radial-gradient(circle_at_82%_28%,rgba(30,64,175,0.18),transparent_34%),linear-gradient(180deg,#071a31_0%,#08192f_58%,#061426_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-[-1px] z-0 h-48 bg-[linear-gradient(180deg,transparent,#061426_82%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-[linear-gradient(90deg,transparent,rgba(96,165,250,0.3),transparent)]" />
          <div className="section-shell relative z-10">
            <div className="grid gap-8 lg:h-[calc(100svh-5.75rem)] lg:min-h-[620px] lg:max-h-[760px] lg:grid-cols-[0.95fr_1.05fr] lg:items-center xl:gap-12">
              <div className="max-w-[35rem] py-3 lg:py-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-sm)] backdrop-blur-xl">
                  <BrandMark className="h-5 w-5 rounded-full bg-[rgba(15,23,42,0.3)]" />
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
                  Aetheris turns clinical and pharma PDFs into source-grounded research
                  briefings, with evidence, disagreement, and uncertainty kept visible.
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

        <WorkflowTimeline />
        <MultiAgentAnalysis />
        <ReportPreview disclaimer={RESEARCH_DISCLAIMER} />
        <TrustPrinciples />
        <ArchitectureDiagram />
        <FinalCta />

        <footer className="section-shell px-4 pb-10">
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-muted)] md:flex-row md:items-center md:justify-between">
            <p>Aetheris · multi-agent research intelligence for pharma documents.</p>
            <p>Research support only. Requires clinical, regulatory, and source review.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
