import { BarChart3, BrainCircuit, Files, SearchCheck, Shield } from "lucide-react";

const stats = [
  {
    title: "Session-level memory",
    description: "The same upload, question, excerpts, findings, and limitations stay connected.",
    icon: BrainCircuit,
  },
  {
    title: "Document-first intake",
    description: "Clinical studies, labels, and appendices are treated as source material, not chat context.",
    icon: Files,
  },
  {
    title: "Evidence-ranked retrieval",
    description: "Relevant passages are selected before agents reason over safety and interaction concerns.",
    icon: SearchCheck,
  },
  {
    title: "Disagreement preserved",
    description: "Conflicts, missing appendices, and uncertainty labels remain visible in the conclusion.",
    icon: BarChart3,
  },
  {
    title: "Research-only framing",
    description: "Outputs support review and are not a substitute for physician judgment or regulatory work.",
    icon: Shield,
  },
];

export function StatBand() {
  return (
    <section className="section-shell px-4 pt-6" id="platform">
      <div className="grid gap-3 rounded-[1.85rem] border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadow-md)] backdrop-blur-xl lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--panel-strong)]/92 p-4"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{stat.title}</p>
              <p className="mt-1.5 text-sm leading-6 text-[var(--text-secondary)]">
                {stat.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
