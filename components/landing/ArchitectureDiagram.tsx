"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BrainCircuit,
  Braces,
  Database,
  FileText,
  Layers3,
  Network,
  ScrollText,
  SearchCode,
} from "lucide-react";

const nodes = [
  {
    title: "Frontend",
    detail: "Next.js, TypeScript, Tailwind, cinematic glass UI",
    icon: Braces,
  },
  {
    title: "PDF upload",
    detail: "Clinical source intake through API routes",
    icon: FileText,
  },
  {
    title: "Extraction",
    detail: "PDF parsing and document normalization",
    icon: Layers3,
  },
  {
    title: "Chunk retrieval",
    detail: "Evidence-grounded passage ranking",
    icon: SearchCode,
  },
  {
    title: "Specialist agents",
    detail: "Safety, interaction, trial, consensus, report roles",
    icon: BrainCircuit,
  },
  {
    title: "Consensus synthesis",
    detail: "Agreement, disagreement, and uncertainty handling",
    icon: Network,
  },
  {
    title: "Report generation",
    detail: "Structured outputs with source references",
    icon: ScrollText,
  },
  {
    title: "Stored session",
    detail: "Supabase-ready persistence for research sessions",
    icon: Database,
  },
];

export function ArchitectureDiagram() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="section-shell px-4 pt-20" id="architecture">
      <div className="grid gap-8 lg:grid-cols-[0.84fr_1.16fr] lg:items-center">
        <div>
          <p className="section-label">Technical Architecture</p>
          <h2 className="section-title mt-3">Engineered for evidence-grounded research flow.</h2>
          <p className="section-copy mt-4">
            Beneath the cinematic interface is a structured pipeline: ingestion, extraction,
            retrieval, orchestration, consensus, reporting, and session persistence.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[2.1rem] border border-[var(--border)] bg-[linear-gradient(145deg,var(--panel),rgba(7,17,31,0.84))] p-5 shadow-[var(--shadow-lg)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-[linear-gradient(180deg,transparent,rgba(147,197,253,0.28),transparent)]" />
          <div className="pointer-events-none absolute -left-20 top-1/3 h-56 w-56 rounded-full bg-[#1d4ed8]/[0.14] blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-0 h-56 w-56 rounded-full bg-[#60a5fa]/[0.09] blur-3xl" />

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
            viewBox="0 0 780 560"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="architecture-line" x1="80" x2="700" y1="280" y2="280">
                <stop stopColor="#60a5fa" stopOpacity="0.12" />
                <stop offset="0.5" stopColor="#bfdbfe" stopOpacity="0.48" />
                <stop offset="1" stopColor="#60a5fa" stopOpacity="0.12" />
              </linearGradient>
            </defs>
            <motion.path
              d="M 84 96 C 250 100 212 226 376 232 C 540 238 516 366 696 462"
              fill="none"
              stroke="url(#architecture-line)"
              strokeLinecap="round"
              strokeWidth="2"
              initial={{ pathLength: reduceMotion ? 1 : 0, opacity: reduceMotion ? 0.52 : 0 }}
              whileInView={{ pathLength: 1, opacity: 0.76 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </svg>

          <div className="relative grid gap-3 md:grid-cols-2">
            {nodes.map((node, index) => {
              const Icon = node.icon;

              return (
                <motion.div
                  key={node.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 16, rotateX: 5 }}
                  whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.36, delay: index * 0.05, ease: "easeOut" }}
                  className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.7),rgba(255,255,255,0.045))] p-4 shadow-[0_18px_55px_rgba(2,6,23,0.2)] backdrop-blur-xl"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        0{index + 1}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                        {node.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {node.detail}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
