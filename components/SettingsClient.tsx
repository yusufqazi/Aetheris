import { CheckCircle2, Database, ShieldCheck, Sparkles } from "lucide-react";

import { WorkspacePageHeader } from "@/components/workspace/WorkspacePageHeader";
import { RESEARCH_DISCLAIMER } from "@/lib/prompts";

const SYSTEM_ROWS = [
  {
    icon: Sparkles,
    label: "Generation",
    value: "Google Gemini or OpenAI structured analysis with an explicitly labeled local fallback",
  },
  {
    icon: Database,
    label: "Persistence",
    value: "IndexedDB locally with optional Supabase checkpoints",
  },
  {
    icon: ShieldCheck,
    label: "Research boundary",
    value: "Evidence support only; never clinical decision-making",
  },
];

export function SettingsClient() {
  return (
    <div className="mx-auto w-full max-w-[100rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <WorkspacePageHeader
        eyebrow="System configuration"
        title="Research settings and guardrails."
        description="A concise view of the runtime, persistence path, and safety boundary governing this workspace."
      />

      <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-sky-400">Research-use boundary</p>
          <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">{RESEARCH_DISCLAIMER}</p>
          <div className="mt-6 space-y-3">
            {[
              "Original source review remains mandatory",
              "Confidence describes the evidence set, not clinical validity",
              "Uncertainty and contradictory findings stay visible",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-400/80" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {SYSTEM_ROWS.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="grid gap-3 py-5 sm:grid-cols-[auto_10rem_minmax(0,1fr)] sm:items-center">
                <Icon className="h-4 w-4 text-sky-400" />
                <p className="text-sm font-medium text-slate-300">{row.label}</p>
                <p className="text-sm leading-6 text-slate-600">{row.value}</p>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
