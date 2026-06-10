import type { LucideIcon } from "lucide-react";

type AgentShowcaseCardProps = {
  title: string;
  purpose: string;
  output: string;
  confidence: string;
  uncertainty: string;
  icon: LucideIcon;
  accent: string;
};

export function AgentShowcaseCard({
  title,
  purpose,
  output,
  confidence,
  uncertainty,
  icon: Icon,
  accent,
}: AgentShowcaseCardProps) {
  return (
    <article className="group rounded-[1.55rem] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-xl transition duration-300 hover:border-[var(--accent-border)] hover:bg-[var(--panel-strong)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel-strong)]">
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--panel-muted)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          {confidence}
        </span>
      </div>

      <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{purpose}</p>

      <div className="mt-4 rounded-[1.2rem] bg-[var(--panel-muted)] px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Session finding
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{output}</p>
      </div>

      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {uncertainty}
      </p>
    </article>
  );
}
