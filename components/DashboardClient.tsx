"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowRight, Clock3, FileText, FolderKanban } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { makeDemoSession } from "@/lib/demo-data";
import { loadLocalSessions, saveLocalSession } from "@/lib/session-store";
import type { ResearchSession } from "@/lib/types";

export function DashboardClient() {
  const [sessions] = useState<ResearchSession[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    const local = loadLocalSessions();
    if (local.length > 0) {
      return local;
    }

    return saveLocalSession(makeDemoSession());
  });

  return (
    <DashboardShell
      title="Research Dashboard"
      description="Review prior Aetheris sessions, inspect uploaded sources, and reopen saved reports. Demo mode persists in local storage, while production deployments can save to Supabase."
    >
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="glass-panel rounded-[2rem] p-6">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
            Workspace snapshot
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Saved sessions"
              value={String(sessions.length)}
              icon={<FolderKanban className="h-5 w-5" />}
            />
            <StatCard
              label="Uploaded PDFs"
              value={String(
                sessions.reduce((count, session) => count + session.documents.length, 0),
              )}
              icon={<FileText className="h-5 w-5" />}
            />
          </div>
          <Link
            href="/research/new"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--navy)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0f2740]"
          >
            Launch new analysis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="space-y-4">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/research/${session.id}`}
              className="glass-panel block rounded-[2rem] p-5 transition hover:-translate-y-0.5"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--panel-muted)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      {session.mode}
                    </span>
                    <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-deep)]">
                      {session.status}
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-[var(--text-primary)]">
                    {session.question}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {session.documents.length} document(s) · {session.selectedAgents.length} agents
                    · Updated {new Date(session.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-full bg-[var(--panel-strong)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  <Clock3 className="h-4 w-4" />
                  Open report
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] bg-[var(--panel-strong)] p-5 shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">{label}</p>
        <div className="text-[var(--accent)]">{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
