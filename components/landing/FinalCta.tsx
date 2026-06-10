import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FinalCta() {
  return (
    <section className="section-shell px-4 pb-16 pt-20">
      <div className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-[linear-gradient(135deg,rgba(19,34,56,0.98),rgba(7,17,31,0.98)_54%,rgba(30,64,175,0.58))] px-6 py-12 shadow-[var(--shadow-hero)] lg:px-10 lg:py-14">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#2563eb]/[0.18] blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#60a5fa]/[0.12] blur-3xl" />
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(219,234,254,0.72),transparent)]" />

        <div className="relative grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div className="max-w-4xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#93c5fd]">
              Explore the workspace
            </p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white md:text-[3.3rem]">
              Research workflows built for uncertainty.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Evidence-first analysis across clinical documents, with disagreement, limitations,
              and review boundaries preserved from upload to briefing.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link
              href="/research/new"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:translate-y-[-1px]"
            >
              Start research session
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full border border-white/18 bg-white/8 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              View dashboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
