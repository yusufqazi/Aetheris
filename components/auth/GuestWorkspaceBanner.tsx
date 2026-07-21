"use client";

import Link from "next/link";
import { LogIn, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";

export function GuestWorkspaceBanner() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (loading || user || dismissed) return null;

  return (
    <aside className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-sky-300/20 bg-[#071424]/95 px-4 py-3.5 shadow-[0_22px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl sm:inset-x-auto sm:right-5 sm:w-[31rem]" aria-label="Guest workspace notice">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sky-300">Guest workspace</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">Your current research will not be saved when you leave or refresh. Create an account to keep your briefs and source trail.</p>
        <Link href="/sign-in" className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-sky-300 transition hover:text-sky-100">
          Sign in or create an account <LogIn className="h-3.5 w-3.5" />
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-full p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
        aria-label="Dismiss guest workspace notice"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
