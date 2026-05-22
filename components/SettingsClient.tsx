"use client";

import type { ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";

export function SettingsClient() {
  const envRows = [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  return (
    <DashboardShell
      title="Settings & About"
      description="Aetheris is an educational SaaS-style reference workspace for structured pharma document analysis. This page documents the stack, architecture, and the guardrails that keep the product framed as research support rather than clinical advice."
    >
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <InfoPanel title="Research-use disclaimer">
            <p className="text-sm leading-7 text-[var(--text-secondary)]">{RESEARCH_DISCLAIMER}</p>
          </InfoPanel>

          <InfoPanel title="Tech stack">
            <div className="space-y-2 text-sm text-[var(--text-secondary)]">
              <p>Next.js App Router with TypeScript</p>
              <p>Tailwind CSS with a custom enterprise design system</p>
              <p>Supabase-ready auth and research session persistence</p>
              <p>OpenAI-backed structured generation with demo fallback</p>
              <p>PDF text extraction and chunked retrieval workflow</p>
            </div>
          </InfoPanel>
        </div>

        <div className="space-y-6">
          <InfoPanel title="Multi-agent architecture">
            <div className="space-y-3 text-sm leading-7 text-[var(--text-secondary)]">
              <p>1. PDF upload route extracts text and stores clean document payloads.</p>
              <p>2. Retrieval ranks relevant chunks for the active research question.</p>
              <p>3. Specialized agents analyze the same evidence from different perspectives.</p>
              <p>4. A debate agent surfaces disagreement, uncertainty, and missing evidence.</p>
              <p>5. A report agent assembles the final executive summary and evidence table.</p>
            </div>
          </InfoPanel>

          <InfoPanel title="Environment variables">
            <div className="space-y-2 font-mono text-xs text-[var(--text-secondary)]">
              {envRows.map((item) => (
                <p key={item} className="rounded-2xl bg-[var(--panel-muted)] px-3 py-2">
                  {item}
                </p>
              ))}
            </div>
          </InfoPanel>
        </div>
      </div>
    </DashboardShell>
  );
}

function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <h3 className="text-xl font-semibold">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}
