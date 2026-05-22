import Link from "next/link";
import { Database, FileText, Microscope, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

export function DashboardShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--nav-shell)] backdrop-blur-xl">
        <div className="section-shell flex items-center justify-between gap-6 px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--navy)] text-white shadow-lg">
              <Microscope className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Aetheris
              </p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Pharma Research Workspace
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-3 md:flex">
            <TopNavLink href="/dashboard" label="Dashboard" />
            <TopNavLink href="/research/new" label="New Research" />
            <TopNavLink href="/settings" label="Settings" />
          </nav>

          <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2 md:flex">
            <ShieldAlert className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              Research use only
            </span>
          </div>
        </div>
      </header>

      <main className="section-shell px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--accent)]">
              Workspace
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--text-secondary)]">
              {description}
            </p>
          </div>

          <div className="glass-panel flex gap-3 rounded-3xl px-4 py-3">
            <MetricBadge icon={<FileText className="h-4 w-4" />} label="Structured agent traces" />
            <MetricBadge icon={<Database className="h-4 w-4" />} label="Supabase-ready persistence" />
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

function TopNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--text-primary)]"
    >
      {label}
    </Link>
  );
}

function MetricBadge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-[var(--panel-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]">
      {icon}
      <span>{label}</span>
    </div>
  );
}
