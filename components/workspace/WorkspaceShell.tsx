"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { GuestWorkspaceBanner } from "@/components/auth/GuestWorkspaceBanner";
import { WorkspaceInspector } from "@/components/workspace/WorkspaceInspector";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { mobileInspectorOpen, setMobileInspectorOpen } = useWorkspace();

  return (
    <div className="workspace-root relative min-h-svh overflow-hidden bg-[#020711] text-slate-100">
      <div className="workspace-atmosphere pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.32),transparent)]" />

      <header className="relative z-40 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#030914]/85 px-4 backdrop-blur-2xl xl:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-full border border-white/[0.08] p-2.5 text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
          aria-label="Open workspace navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-xl bg-[#0a1a31]" />
          <span className="text-sm font-semibold">Aetheris</span>
        </div>
        <span className="h-9 w-9" aria-hidden="true" />
      </header>

      <div className="relative z-10 grid h-[calc(100svh-4rem)] min-h-0 xl:h-svh xl:grid-cols-[14.5rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-white/[0.07] bg-[#030914]/72 backdrop-blur-2xl xl:block">
          <WorkspaceSidebar />
        </aside>
        <main className="scrollbar-thin min-h-0 min-w-0 overflow-y-auto">{children}</main>
      </div>

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm xl:hidden"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNavOpen(false)}
          >
            <motion.aside
              className="h-full w-[min(21rem,88vw)] border-r border-white/[0.08] bg-[#050d19] shadow-[30px_0_90px_rgba(0,0,0,0.5)]"
              initial={reduceMotion ? false : { x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 31 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="absolute right-4 top-4">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-full border border-white/[0.08] p-2 text-slate-500"
                  aria-label="Close workspace navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <WorkspaceSidebar onNavigate={() => setMobileNavOpen(false)} />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {mobileInspectorOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm xl:items-stretch xl:justify-end"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileInspectorOpen(false)}
          >
            <motion.aside
              className="h-[78svh] w-full overflow-hidden rounded-t-[1.5rem] border border-white/[0.09] bg-[#050d19] shadow-[0_-30px_100px_rgba(0,0,0,0.55)] xl:h-full xl:w-[30rem] xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-[-30px_0_100px_rgba(0,0,0,0.55)]"
              initial={reduceMotion ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 240, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
            >
              <WorkspaceInspector />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <GuestWorkspaceBanner />
    </div>
  );
}
