"use client";

import { Copy, Download } from "lucide-react";
import { useState } from "react";

import type { ReportOutput } from "@/lib/types";

export function ReportViewer({ report }: { report: ReportOutput }) {
  const [copied, setCopied] = useState(false);

  async function copyReport() {
    await navigator.clipboard.writeText(report.markdownReport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadReport() {
    const blob = new Blob([report.markdownReport], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aetheris-report.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--accent)]">
            Final report
          </p>
          <h3 className="mt-2 text-2xl font-semibold">Executive-ready synthesis</h3>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={copyReport}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--panel-muted)]"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied" : "Copy report"}
          </button>
          <button
            type="button"
            onClick={downloadReport}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f2740]"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] bg-[var(--panel-strong)] p-5 shadow-[var(--shadow-md)]">
          <h4 className="text-lg font-semibold">Executive Summary</h4>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            {report.executiveSummary}
          </p>
          <div className="mt-6">
            <h5 className="font-semibold text-[var(--text-primary)]">Key findings</h5>
            <div className="mt-3 space-y-3">
              {report.keyFindings.map((item) => (
                <p key={item} className="rounded-2xl bg-[var(--panel-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <MiniPanel title="Physician-style briefing" body={report.physicianBriefing} />
          <MiniPanel title="Patient-friendly summary" body={report.patientFriendlySummary} />
          <MiniPanel title="Disclaimer" body={report.researchDisclaimer} />
        </div>
      </div>
    </section>
  );
}

function MiniPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.75rem] bg-[var(--panel-muted)] p-5">
      <h4 className="font-semibold text-[var(--text-primary)]">{title}</h4>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
    </div>
  );
}
