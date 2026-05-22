import type { EvidenceItem } from "@/lib/types";

export function EvidenceTable({ evidence }: { evidence: EvidenceItem[] }) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-[var(--border)] bg-white">
      <div className="grid grid-cols-[1.1fr_0.9fr_2fr] gap-4 border-b border-[var(--border)] bg-[var(--panel-muted)] px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        <p>Source</p>
        <p>Location</p>
        <p>Evidence</p>
      </div>
      <div>
        {evidence.map((item, index) => (
          <div
            key={`${item.documentName}-${index}`}
            className="grid grid-cols-1 gap-3 border-b border-[var(--border)] px-5 py-4 md:grid-cols-[1.1fr_0.9fr_2fr]"
          >
            <div>
              <p className="font-semibold text-[var(--text-primary)]">{item.documentName}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{item.relevance}</p>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {item.section ?? "Not specified"}
            </p>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">{item.excerpt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
