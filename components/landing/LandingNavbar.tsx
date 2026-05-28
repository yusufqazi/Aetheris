"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "#platform", label: "Platform" },
  { href: "#workflow", label: "Workflow" },
  { href: "#agents", label: "Agents" },
  { href: "#consensus", label: "Consensus" },
  { href: "#demo", label: "Demo" },
];

type HoverBubble = {
  x: number;
  width: number;
  scaleX: number;
};

export function LandingNavbar() {
  const navRef = useRef<HTMLElement | null>(null);
  const lastBubbleRef = useRef<{ center: number; time: number } | null>(null);
  const [hoverBubble, setHoverBubble] = useState<HoverBubble | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 10);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function updateHoverBubble(element: HTMLElement) {
    const nav = navRef.current;

    if (!nav) {
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    const width = itemRect.width + 4;
    const center = itemRect.left - navRect.left + itemRect.width / 2;
    const previous = lastBubbleRef.current;
    const now = performance.now();
    const velocity = previous ? (center - previous.center) / Math.max(16, now - previous.time) : 0;
    const stretch = Math.min(0.08, Math.abs(velocity) * 0.01);
    const minX = 4;
    const maxX = Math.max(minX, navRect.width - width - minX);
    const x = Math.min(maxX, Math.max(minX, center - width / 2));

    lastBubbleRef.current = { center, time: now };
    setHoverBubble({
      x,
      width,
      scaleX: 1 + stretch,
    });
  }

  return (
    <header className={`sticky top-0 z-50 px-4 transition-[padding] duration-[250ms] ease-out ${isScrolled ? "pt-2.5" : "pt-4"}`}>
      <div className="section-shell">
        <div
          className={`relative overflow-hidden rounded-full border border-white/14 bg-[linear-gradient(135deg,rgba(226,232,240,0.11),rgba(15,23,42,0.58)_22%,rgba(8,18,34,0.42)_62%,rgba(30,64,175,0.14))] px-4 shadow-[0_22px_70px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(15,23,42,0.34)] backdrop-blur-[28px] transition-[padding,box-shadow,background-color] duration-[250ms] ease-out after:pointer-events-none after:absolute after:inset-x-8 after:top-0 after:h-px after:bg-[linear-gradient(90deg,transparent,rgba(239,246,255,0.72),rgba(147,197,253,0.24),transparent)] after:content-[''] ${
            isScrolled ? "py-2 shadow-[0_18px_54px_rgba(2,6,23,0.32),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(15,23,42,0.3)]" : "py-3"
          }`}
        >
          <div className="pointer-events-none absolute -left-16 top-1/2 h-24 w-48 -translate-y-1/2 rounded-full bg-blue-400/12 blur-3xl" />
          <div className="pointer-events-none absolute right-16 top-0 h-12 w-56 rounded-full bg-white/8 blur-2xl" />
          <div className="relative flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <BrandMark
              className={`rounded-full border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.8),rgba(19,34,56,0.58))] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_28px_rgba(2,6,23,0.22)] transition-[height,width] duration-[250ms] ease-out ${
                isScrolled ? "h-9 w-9" : "h-10 w-10"
              }`}
            />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[var(--text-muted)]">
                Aetheris
              </p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Research intelligence
              </p>
            </div>
          </Link>

          <nav
            ref={navRef}
            onMouseLeave={() => {
              lastBubbleRef.current = null;
              setHoverBubble(null);
            }}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;

              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                lastBubbleRef.current = null;
                setHoverBubble(null);
              }
            }}
            className="relative hidden items-center gap-1 overflow-hidden rounded-full p-1 lg:flex"
          >
            <AnimatePresence>
              {hoverBubble ? (
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-1 left-0 overflow-hidden rounded-full border border-white/18 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(96,165,250,0.13)_38%,rgba(15,23,42,0.28))] shadow-[0_12px_32px_rgba(37,99,235,0.18),0_1px_0_rgba(255,255,255,0.14),inset_0_1px_0_rgba(255,255,255,0.34),inset_0_-1px_0_rgba(15,23,42,0.24)] backdrop-blur-2xl"
                  initial={{
                    opacity: 0,
                    x: hoverBubble.x,
                    width: hoverBubble.width,
                    scaleX: 0.96,
                  }}
                  animate={{
                    opacity: 1,
                    x: hoverBubble.x,
                    width: hoverBubble.width,
                    scaleX: [hoverBubble.scaleX, 0.985, 1],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    opacity: { duration: 0.18, ease: "easeOut" },
                    x: { type: "spring", stiffness: 430, damping: 31, mass: 0.72 },
                    width: { type: "spring", stiffness: 390, damping: 30, mass: 0.76 },
                    scaleX: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
                  }}
                >
                  <span className="pointer-events-none absolute inset-x-2 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.82),transparent)]" />
                  <span className="pointer-events-none absolute -left-3 top-1 h-7 w-1/2 rotate-[-16deg] rounded-full bg-white/16 blur-md" />
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent_54%)]" />
                </motion.div>
              ) : null}
            </AnimatePresence>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onMouseEnter={(event) => updateHoverBubble(event.currentTarget)}
                onFocus={(event) => updateHoverBubble(event.currentTarget)}
                className="relative z-10 rounded-full px-4 py-2 text-sm text-[var(--text-secondary)] transition duration-200 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-bright)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/research/new"
              className={`inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition duration-300 hover:translate-y-[-1px] hover:bg-[var(--accent-strong)] ${
                isScrolled ? "py-2" : "py-2.5"
              }`}
            >
              Launch demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          </div>
        </div>
      </div>
    </header>
  );
}
