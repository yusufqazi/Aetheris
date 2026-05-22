import type { ReactNode } from "react";

import type { AgentBaseOutput } from "@/lib/types";

export function AgentCard({
  title,
  output,
  children,
}: {
  title: string;
  output: AgentBaseOutput;
  children?: ReactNode;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{output.summary}</p>
        </div>
        <div className="rounded-full bg-[var(--panel-muted)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          Confidence · {output.confidence}
        </div>
      </div>

      {children}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <InfoList title="Limitations" items={output.limitations} />
        <InfoList title="Warnings" items={output.warnings} />
      </div>
    </section>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl bg-[var(--panel-muted)] p-4">
      <p className="font-semibold text-[var(--text-primary)]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-sm leading-6 text-[var(--text-secondary)]">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}
