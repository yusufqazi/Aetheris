import { SafetyDisclaimer } from "@/components/landing/SafetyDisclaimer";

const reportSections = [
  {
    title: "Executive Summary",
    body: "Uploaded oncology sources suggest recurring adverse-event signals and possible interaction concerns, though evidence remains limited by cohort size and follow-up duration.",
  },
  {
    title: "Evidence Table",
    body: "safety-label.pdf p.4 and oncology-study.pdf p.7 support recurring nausea and dizziness with source-linked excerpts.",
  },
  {
    title: "Safety Signals",
    body: "Nausea and dizziness recur in labeling and trial language; frequency may be incomplete across the uploaded source set.",
  },
  {
    title: "Uncertainty / Limitations",
    body: "Current evidence is insufficient to establish interaction severity. Exposure-response appendix coverage is incomplete.",
  },
  {
    title: "Follow-up Questions",
    body: "Are exposure-response appendices available? Does subgroup analysis alter interpretation? Are findings repeated across independent sources?",
  },
  {
    title: "Source References",
    body: "oncology-study.pdf p.7 · safety-label.pdf p.4 · exposure-appendix.pdf missing table reference.",
  },
];

export function ReportPreview({ disclaimer }: { disclaimer: string }) {
  return (
    <section className="section-shell px-4 pt-20" id="demo">
      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div>
          <p className="section-label">Final Research Briefing</p>
          <h2 className="section-title mt-3">After the analysis, the artifact is clear.</h2>
          <p className="section-copy mt-4">
            The final output slows the experience down: a structured, source-grounded briefing
            that makes evidence, uncertainty, and follow-up work easy to review.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[2.1rem] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-hero)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute -right-24 -top-20 h-64 w-64 rounded-full bg-[#2563eb]/[0.16] blur-3xl" />
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(219,234,254,0.68),transparent)]" />

          <div className="relative rounded-[1.7rem] border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel-strong),rgba(15,23,42,0.62))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-bright)]">
                  Research briefing
                </p>
                <h3 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  Adverse event burden and interaction concern review
                </h3>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                  oncology-study.pdf · safety-label.pdf · exposure-appendix.pdf
                </p>
              </div>
              <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--accent-bright)]">
                Research support
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {reportSections.map((section, index) => (
                <ReportSection
                  key={section.title}
                  title={section.title}
                  body={section.body}
                  emphasis={index === 0}
                />
              ))}
            </div>
          </div>

          <SafetyDisclaimer body={disclaimer} className="relative mt-4" />
        </div>
      </div>
    </section>
  );
}

function ReportSection({
  title,
  body,
  emphasis = false,
}: {
  title: string;
  body: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.2rem] border p-4 ${
        emphasis
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--panel-muted)]"
      }`}
    >
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          emphasis ? "text-[var(--accent-bright)]" : "text-[var(--text-muted)]"
        }`}
      >
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{body}</p>
    </div>
  );
}
