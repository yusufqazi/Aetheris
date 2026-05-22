import { ArrowRight } from "lucide-react";

const nodes = [
  "Frontend",
  "API route",
  "PDF extraction",
  "Chunk retrieval",
  "Agent orchestration",
  "Consensus synthesis",
  "Report output",
  "Supabase persistence",
];

export function ArchitectureDiagram() {
  return (
    <section className="section-shell px-4 pt-24">
      <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
        <div>
          <p className="section-label">Architecture</p>
          <h2 className="section-title mt-4">
            A technical system diagram that reads clearly to recruiters and engineers.
          </h2>
          <p className="section-copy mt-4">
            The experience stays premium, but the information architecture still makes the
            engineering legible: UI, ingestion, retrieval, orchestration, synthesis, and
            persistence are easy to explain at a glance.
          </p>
        </div>

        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[var(--shadow-lg)]">
          <div className="grid gap-3 md:grid-cols-2">
            {nodes.map((node, index) => (
              <div
                key={node}
                className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--panel-strong)] p-4"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
                  0{index + 1}
                </p>
                <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">{node}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
            {nodes.map((node, index) => (
              <div key={node} className="inline-flex items-center gap-3">
                <span className="rounded-full border border-[var(--border)] bg-[var(--panel-muted)] px-3 py-2">
                  {node}
                </span>
                {index < nodes.length - 1 ? (
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
