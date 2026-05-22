"use client";

import { Mail, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export function AuthEntry() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleMagicLink() {
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      setMessage("Supabase keys are not configured yet. Demo mode is available immediately.");
      return;
    }

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      setMessage(
        error
          ? error.message
          : "Magic link sent. After sign-in, you can continue in the dashboard.",
      );
    });
  }

  return (
    <div className="rounded-[2rem] bg-[var(--panel-strong)] p-5 shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">Sign in or use demo mode</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Supabase magic-link auth is ready when environment keys are present.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="researcher@company.com"
          className="rounded-full border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={handleMagicLink}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--navy)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0f2740]"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Sending link..." : "Send magic link"}
        </button>
        {message ? <p className="text-sm text-[var(--text-secondary)]">{message}</p> : null}
      </div>
    </div>
  );
}
