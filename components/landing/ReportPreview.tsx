import { SafetyDisclaimer } from "@/components/landing/SafetyDisclaimer";

export function ReportPreview({ disclaimer }: { disclaimer: string }) {
  return (
    <section className="section-shell px-4 pt-16" id="demo">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="section-label">Report Preview</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            One polished briefing card instead of a long simulated report.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
            Show the quality of the end artifact quickly: executive summary, evidence, risk
            framing, and follow-up direction in one compact surface.
          </p>
        </div>

        <div className="rounded-[1.95rem] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--shadow-lg)]">
          <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--panel-strong)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-bright)]">
                  Research briefing
                </p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                  Aetheris executive summary
                </h3>
              </div>
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--accent-bright)]">
                Moderate confidence
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              <PreviewBlock
                title="Executive summary"
                body="Safety findings recur across the uploaded sources, while interaction severity remains limited by narrow cohort evidence."
              />
              <div className="grid gap-3 md:grid-cols-2">
                <PreviewBlock
                  title="Evidence"
                  body="Phase-II-oncology-study.pdf p.7 supports the observed nausea and dizziness burden."
                />
                <PreviewBlock
                  title="Uncertainty"
                  body="Additional PK appendices would improve confidence in the interaction framing."
                />
              </div>
              <PreviewBlock
                title="Follow-up questions"
                body="Do subgroup analyses or exposure-response tables materially change the benefit-risk interpretation?"
              />
            </div>
          </div>

          <SafetyDisclaimer body={disclaimer} className="mt-4" />
        </div>
      </div>
    </section>
  );
}

function PreviewBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--panel-muted)] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">{body}</p>
    </div>
  );
}
