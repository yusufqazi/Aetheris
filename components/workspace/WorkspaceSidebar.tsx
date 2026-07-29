"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BookOpen,
  Clock3,
  LogOut,
  Plus,
  UserRound,
} from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/components/auth/AuthProvider";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const NAV_ITEMS = [
  { href: "/dashboard", label: "All analyses", icon: Archive, exact: true },
] as const;

export function WorkspaceSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { sessions } = useWorkspace();
  const { user, loading, signOut } = useAuth();
  const recentSessions = sessions.slice(0, 4);

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-4">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-3 px-2 py-2">
        <BrandMark className="h-10 w-10 rounded-[0.9rem] border border-white/[0.1] bg-[#0a1a31] shadow-[0_12px_34px_rgba(2,6,23,0.38)]" />
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.34em] text-slate-500">Aetheris</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-100">Clinical evidence briefs</p>
        </div>
      </Link>

      <Link
        href="/research/new"
        onClick={onNavigate}
        className="group mt-5 flex h-11 items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#1d4ed8,#4f8df8)] px-4 text-sm font-semibold text-white shadow-[0_16px_42px_rgba(37,99,235,0.28)] transition duration-300 hover:-translate-y-px hover:shadow-[0_20px_52px_rgba(37,99,235,0.38)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
      >
        <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
        New analysis
      </Link>

      <nav aria-label="Workspace" className="mt-6 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = "exact" in item && item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-sm transition duration-200 ${
                active
                  ? "bg-white/[0.075] text-white"
                  : "text-slate-500 hover:bg-white/[0.035] hover:text-slate-200"
              }`}
            >
              {active ? (
                <span className="absolute inset-y-2 left-0 w-px rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.85)]" />
              ) : null}
              <Icon className={`h-4 w-4 ${active ? "text-sky-300" : "text-slate-600 group-hover:text-slate-400"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-7 min-h-0 flex-1">
        <div className="flex items-center justify-between px-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-slate-600">Recent sessions</p>
          <Clock3 className="h-3.5 w-3.5 text-slate-700" />
        </div>

        <div className="mt-2 space-y-1">
          {recentSessions.length > 0 ? (
            recentSessions.map((session) => (
              <Link
                key={session.id}
                href={`/research/${session.id}`}
                onClick={onNavigate}
                className="group block rounded-[0.9rem] px-3 py-2.5 transition hover:bg-white/[0.035]"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      session.status === "completed"
                        ? "bg-emerald-400"
                        : session.status === "error"
                          ? "bg-amber-400"
                          : "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                    }`}
                  />
                  <div className="min-w-0">
                    <p title={session.question} className="line-clamp-2 text-xs leading-5 text-slate-400 transition group-hover:text-slate-200">
                      {session.question}
                    </p>
                    <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.18em] text-slate-700">
                      {session.status}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <p className="px-3 py-3 text-xs leading-5 text-slate-700">No research sessions yet.</p>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-white/[0.07] pt-3">
        {loading ? null : user ? (
          <div className="mb-2 rounded-[0.9rem] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <UserRound className="h-4 w-4 shrink-0 text-sky-300" />
              <p title={user.email} className="min-w-0 flex-1 truncate text-xs text-slate-300">{user.email}</p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-full p-1 text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <Link
            href="/sign-in"
            onClick={onNavigate}
            className="mb-2 flex items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-sm text-sky-300 transition hover:bg-sky-400/[0.06] hover:text-sky-100"
          >
            <UserRound className="h-4 w-4" />
            Sign in to save work
          </Link>
        )}
        <Link
          href="/#workflow"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-sm text-slate-500 transition hover:bg-white/[0.035] hover:text-slate-200"
        >
          <BookOpen className="h-4 w-4" />
          How Aetheris works
        </Link>
      </div>
    </div>
  );
}
