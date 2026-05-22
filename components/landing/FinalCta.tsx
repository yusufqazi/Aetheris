import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FinalCta() {
  return (
    <section className="section-shell px-4 pb-16 pt-16">
      <div className="overflow-hidden rounded-[2.2rem] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(19,34,56,0.96),rgba(9,15,27,0.94))] px-6 py-9 shadow-[var(--shadow-hero)] lg:px-9 lg:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-end">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#93c5fd]">
              Final CTA
            </p>
            <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-[2.8rem]">
              Launch the demo workspace and explore Aetheris in context.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              A premium landing page should lead naturally into the product. Keep the next step
              simple, clear, and easy to scan.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link
              href="/research/new"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:translate-y-[-1px]"
            >
              Launch demo workspace
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
