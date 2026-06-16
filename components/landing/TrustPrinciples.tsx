"use client";

import { ArrowRight, FileCheck2, Layers3, ShieldQuestion } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

const principles = [
  {
    title: "Evidence Traceability",
    description:
      "Every finding is tied back to uploaded source material so users can see where conclusions came from.",
    exampleLead: "Recurring nausea and dizziness",
    exampleSource: "safety-label.pdf, page 4",
    icon: FileCheck2,
  },
  {
    title: "Visible Uncertainty",
    description:
      "Aetheris surfaces confidence boundaries, missing evidence, and limitations instead of hiding them behind polished language.",
    exampleLead: "Interaction severity",
    exampleSource: "plausible, not confirmed",
    icon: ShieldQuestion,
  },
  {
    title: "Multi-Perspective Review",
    description:
      "Specialist agents evaluate the same evidence from different angles before the final briefing is assembled.",
    exampleLead: "Safety signal confirmed",
    exampleSource: "trial scope limited",
    icon: Layers3,
  },
] as const;

export function TrustPrinciples() {
  const reduceMotion = useReducedMotion();

  const reveal: Variants = {
    hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 },
    show: (delay = 0) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay,
        duration: reduceMotion ? 0 : 0.62,
        ease: [0.22, 1, 0.36, 1],
      },
    }),
  };

  return (
    <section className="relative isolate -mt-px overflow-hidden bg-[#020711] px-4 py-24 sm:py-28">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_12%,rgba(37,99,235,0.22),transparent_34%),radial-gradient(circle_at_18%_76%,rgba(96,165,250,0.1),transparent_30%),linear-gradient(180deg,#020711_0%,#061426_46%,#020711_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.32),transparent)]" />
      <EvidenceField />

      <div className="section-shell relative z-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.45 }}
          className="mx-auto max-w-4xl text-center"
        >
          <motion.p className="section-label" custom={0} variants={reveal}>
            Trust Layer
          </motion.p>
          <motion.h2 className="section-title mt-3" custom={0.08} variants={reveal}>
            Research that shows its work.
          </motion.h2>
          <motion.p className="section-copy mx-auto mt-4" custom={0.16} variants={reveal}>
            Aetheris is built around traceability, uncertainty, and multi-perspective review so
            research outputs stay grounded instead of sounding confident without evidence.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.22 }}
          className="relative mt-12 overflow-hidden rounded-[2.25rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(15,23,42,0.62),rgba(7,17,31,0.76)_52%,rgba(2,7,17,0.9))] p-5 shadow-[0_38px_140px_rgba(0,0,0,0.5),0_0_90px_rgba(37,99,235,0.12)] backdrop-blur-2xl md:p-8"
        >
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(219,234,254,0.62),rgba(96,165,250,0.22),transparent)]" />
          <div className="pointer-events-none absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.18),rgba(37,99,235,0.08)_42%,transparent_70%)] blur-3xl" />
          <EvidenceThreads reduceMotion={Boolean(reduceMotion)} />

          <motion.div custom={0.05} variants={reveal} className="relative mx-auto max-w-sm">
            <div className="relative overflow-hidden rounded-[1.6rem] border border-blue-100/[0.14] bg-[linear-gradient(145deg,rgba(219,234,254,0.12),rgba(15,23,42,0.68)_42%,rgba(2,7,17,0.76))] px-5 py-4 text-center shadow-[0_26px_80px_rgba(37,99,235,0.16),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.72),transparent)]" />
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-bright)] shadow-[0_0_34px_rgba(96,165,250,0.22)]">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Verified reasoning core
              </p>
              <p className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                Source-grounded briefing
              </p>
            </div>
          </motion.div>

          <div className="relative mt-10 grid gap-4 lg:grid-cols-3">
            {principles.map((principle, index) => (
              <PrincipleCard
                key={principle.title}
                delay={0.18 + index * 0.1}
                principle={principle}
                reduceMotion={Boolean(reduceMotion)}
                variants={reveal}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PrincipleCard({
  delay,
  principle,
  reduceMotion,
  variants,
}: {
  delay: number;
  principle: (typeof principles)[number];
  reduceMotion: boolean;
  variants: Variants;
}) {
  const Icon = principle.icon;

  return (
    <motion.article
      custom={delay}
      variants={variants}
      whileHover={
        reduceMotion
          ? undefined
          : {
              y: -8,
              scale: 1.015,
              transition: { duration: 0.28, ease: "easeOut" },
            }
      }
      className="group relative min-h-[19rem] overflow-hidden rounded-[1.65rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(15,23,42,0.58),rgba(255,255,255,0.045)_46%,rgba(7,17,31,0.7))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl transition duration-300 hover:border-blue-100/[0.2] hover:shadow-[0_30px_100px_rgba(37,99,235,0.18),inset_0_1px_0_rgba(255,255,255,0.12)]"
    >
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(219,234,254,0.34),transparent)] opacity-70 transition group-hover:opacity-100" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-400/[0.08] blur-3xl opacity-40 transition duration-300 group-hover:opacity-100" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.055] text-[var(--accent-bright)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Icon className="h-5 w-5" />
          </div>
          <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent-bright)] shadow-[0_0_24px_rgba(96,165,250,0.76)]" />
        </div>

        <h3 className="mt-6 text-xl font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
          {principle.title}
        </h3>
        <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{principle.description}</p>

        <div className="mt-auto pt-6">
          <div className="relative overflow-hidden rounded-[1.05rem] border border-white/[0.08] bg-black/[0.18] px-3.5 py-3 opacity-82 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition duration-300 group-hover:border-[var(--accent-border)] group-hover:bg-[var(--accent-soft)] group-hover:opacity-100">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Example
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-primary)]">
              <span>{principle.exampleLead}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--accent-bright)]" />
              <span className="text-[var(--text-secondary)]">{principle.exampleSource}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function EvidenceThreads({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      viewBox="0 0 1200 560"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="trust-thread" x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#60a5fa" stopOpacity="0.02" />
          <stop offset="0.5" stopColor="#bfdbfe" stopOpacity="0.5" />
          <stop offset="1" stopColor="#60a5fa" stopOpacity="0.02" />
        </linearGradient>
        <filter id="trust-thread-glow" x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[
        "M 185 448 C 280 330 430 246 600 150",
        "M 600 448 C 600 318 600 248 600 150",
        "M 1015 448 C 920 330 770 246 600 150",
      ].map((path, index) => (
        <motion.path
          key={path}
          d={path}
          fill="none"
          filter="url(#trust-thread-glow)"
          initial={{ pathLength: reduceMotion ? 1 : 0, opacity: reduceMotion ? 0.42 : 0 }}
          stroke="url(#trust-thread)"
          strokeLinecap="round"
          strokeWidth="2"
          transition={{ duration: 1.1, delay: 0.32 + index * 0.12, ease: "easeOut" }}
          viewport={{ once: true, amount: 0.35 }}
          whileInView={{ pathLength: 1, opacity: 0.78 }}
        />
      ))}
    </svg>
  );
}

function EvidenceField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {Array.from({ length: 16 }).map((_, index) => {
        const left = `${8 + ((index * 17) % 86)}%`;
        const top = `${10 + ((index * 23) % 78)}%`;
        const width = 34 + ((index * 13) % 68);
        const delay = index * 0.18;

        return (
          <motion.span
            key={`${left}-${top}`}
            className="absolute h-px rounded-full bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.38),transparent)] opacity-30"
            style={{ left, top, width }}
            animate={{
              opacity: [0.06, 0.32, 0.08],
              x: [0, index % 2 === 0 ? 18 : -18, 0],
            }}
            transition={{
              duration: 5.8 + (index % 4),
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}
