"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/components/auth/AuthProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type AuthMode = "sign-in" | "sign-up";

export function AuthPage() {
  const router = useRouter();
  const { configured, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [router, user]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setMessage("Enter a valid email address before continuing.");
      return;
    }
    if (password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }
    if (mode === "sign-up" && password !== confirmPassword) {
      setMessage("Your passwords do not match.");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setMessage("Supabase is not configured yet. Add the Project URL and Publishable Key, then restart the app.");
      return;
    }

    setMessage(null);
    startTransition(async () => {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) {
          setMessage(error.message);
          return;
        }
        router.replace("/dashboard");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: `${window.location.origin}/sign-in` },
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.session) {
        router.replace("/dashboard");
        return;
      }
      setMessage("Account created. Check your email to confirm your address, then sign in.");
    });
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#020711] px-5 py-12 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_14%,rgba(37,99,235,0.2),transparent_30%),radial-gradient(circle_at_88%_84%,rgba(14,165,233,0.1),transparent_34%)]" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-white/[0.1] bg-[#07111f]/85 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.46)] backdrop-blur-2xl sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Aetheris
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <BrandMark className="h-11 w-11 rounded-2xl border border-white/[0.1] bg-[#0a1a31]" />
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-sky-400">Aetheris account</p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
              {mode === "sign-in" ? "Welcome back." : "Create your workspace."}
            </h1>
          </div>
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-500">
          Sign in to keep your evidence briefs available whenever you return.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-full border border-white/[0.08] bg-white/[0.025] p-1">
          {(["sign-in", "sign-up"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => { setMode(option); setMessage(null); }}
              className={`rounded-full px-3 py-2 text-xs font-medium transition ${mode === option ? "bg-white/[0.1] text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
            >
              {option === "sign-in" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-300">Email address</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="researcher@company.com"
              className="h-12 w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-sky-300/40 focus:ring-4 focus:ring-sky-400/[0.05]"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-300">Password</span>
            <input
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              className="h-12 w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-sky-300/40 focus:ring-4 focus:ring-sky-400/[0.05]"
              required
            />
          </label>
          {mode === "sign-up" ? (
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-300">Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
                className="h-12 w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-sky-300/40 focus:ring-4 focus:ring-sky-400/[0.05]"
                required
              />
            </label>
          ) : null}
          <button
            type="submit"
            disabled={isPending || !configured}
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#1d4ed8,#60a5fa)] px-5 text-sm font-semibold text-white shadow-[0_16px_42px_rgba(37,99,235,0.28)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LockKeyhole className="h-4 w-4" />
            {isPending ? "Please wait..." : mode === "sign-in" ? "Sign in securely" : "Create account"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push("/research/new?guest=1")}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/[0.09] text-xs font-medium text-slate-400 transition hover:border-white/[0.16] hover:text-white"
        >
          <Sparkles className="h-3.5 w-3.5 text-sky-400" /> Continue as guest
        </button>
        <p className="mt-3 text-center text-[10px] leading-5 text-slate-600">Guest research is not saved and disappears when you leave or refresh.</p>
        {message ? <p role="status" className="mt-4 rounded-xl border border-sky-300/15 bg-sky-400/[0.04] px-3 py-2.5 text-xs leading-5 text-sky-100/80">{message}</p> : null}
        {!configured ? <p className="mt-4 text-xs leading-5 text-amber-200/75">Supabase configuration is unavailable in this environment.</p> : null}
        <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-600"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" /> Your saved briefs remain private to your account.</div>
      </div>
    </main>
  );
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
