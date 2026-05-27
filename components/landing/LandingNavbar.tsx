import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "#platform", label: "Platform" },
  { href: "#workflow", label: "Workflow" },
  { href: "#agents", label: "Agents" },
  { href: "#consensus", label: "Consensus" },
  { href: "#demo", label: "Demo" },
];

export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="section-shell">
        <div className="flex items-center justify-between gap-4 rounded-full border border-[var(--border)] bg-[color:var(--nav-shell)] px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 rounded-full border border-[var(--border)] bg-[var(--panel-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[var(--text-muted)]">
                Aetheris
              </p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Research intelligence
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/research/new"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition duration-300 hover:translate-y-[-1px] hover:bg-[var(--accent-strong)]"
            >
              Launch demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
