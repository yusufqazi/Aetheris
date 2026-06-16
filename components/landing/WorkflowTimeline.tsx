"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useScroll,
  useTransform,
  useVelocity,
} from "framer-motion";
import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  FileStack,
  Files,
  GitCompareArrows,
  ScrollText,
  SearchCode,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const steps = [
  {
    title: "Upload source documents",
    detail: "Source intake",
    copy: "A researcher uploads oncology-study.pdf, safety-label.pdf, and exposure-appendix.pdf for one focused review.",
    icon: Files,
    accent: "from-[#1d4ed8]/40 via-[#60a5fa]/18 to-transparent",
    visual: "documents",
  },
  {
    title: "Extract and chunk text",
    detail: "Text preparation",
    copy: "Long PDFs become structured passages tied to page context, source names, and review-ready metadata.",
    icon: FileStack,
    accent: "from-[#2563eb]/36 via-[#7dd3fc]/16 to-transparent",
    visual: "chunks",
  },
  {
    title: "Retrieve evidence",
    detail: "Evidence ranking",
    copy: "The system ranks excerpts about adverse-event burden, interaction language, and missing exposure context.",
    icon: SearchCode,
    accent: "from-[#60a5fa]/34 via-[#bfdbfe]/16 to-transparent",
    visual: "retrieval",
  },
  {
    title: "Run specialist agents",
    detail: "Parallel review",
    copy: "Safety, interaction, trial, retrieval, consensus, and report agents review the same ranked evidence.",
    icon: BrainCircuit,
    accent: "from-[#38bdf8]/34 via-[#93c5fd]/16 to-transparent",
    visual: "agents",
  },
  {
    title: "Compare disagreements",
    detail: "Consensus shaping",
    copy: "Agreement, disagreement, missing appendices, and escalation boundaries are preserved before conclusion.",
    icon: GitCompareArrows,
    accent: "from-[#93c5fd]/30 via-[#c4b5fd]/14 to-transparent",
    visual: "debate",
  },
  {
    title: "Generate final briefing",
    detail: "Report delivery",
    copy: "The final artifact combines executive summary, evidence table, safety signals, limits, and follow-up questions.",
    icon: ScrollText,
    accent: "from-[#bfdbfe]/30 via-[#67e8f9]/14 to-transparent",
    visual: "report",
  },
] as const;

type Step = (typeof steps)[number];
type StepVisual = Step["visual"];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function WorkflowTimeline() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [railActive, setRailActive] = useState(false);
  const activeStepRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const railIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const sectionProgress = useTransform(scrollY, (latest) => {
    const section = sectionRef.current;

    if (!section || typeof window === "undefined") {
      return 0;
    }

    const sectionTop = section.offsetTop;
    const scrollableDistance = Math.max(1, section.offsetHeight - window.innerHeight);

    return Math.min(1, Math.max(0, (latest - sectionTop) / scrollableDistance));
  });
  const cobaltGlowOpacity = useTransform(
    sectionProgress,
    [0, 0.08, 0.22, 0.4, 0.62, 0.82, 1],
    [0, 0, 0.28, 0.12, 0.42, 0.14, 0],
  );
  const deepBlueGlowOpacity = useTransform(
    sectionProgress,
    [0, 0.1, 0.26, 0.46, 0.68, 0.86, 1],
    [0, 0, 0.14, 0.38, 0.12, 0.3, 0],
  );
  const navyDepthOpacity = useTransform(
    sectionProgress,
    [0, 0.1, 0.28, 0.48, 0.68, 0.86, 1],
    [0, 0, 0.28, 0.6, 0.3, 0.7, 1],
  );
  const cobaltScale = useTransform(sectionProgress, [0, 0.36, 0.66, 1], [0.7, 1.08, 1.2, 0.86]);
  const deepBlueScale = useTransform(sectionProgress, [0, 0.42, 0.76, 1], [0.74, 1.14, 1.02, 0.82]);
  const cobaltX = useTransform(sectionProgress, [0, 0.25, 0.5, 0.75, 1], ["-34%", "-16%", "4%", "20%", "36%"]);
  const cobaltY = useTransform(sectionProgress, [0, 0.5, 1], ["-18%", "2%", "18%"]);
  const deepBlueX = useTransform(sectionProgress, [0, 0.35, 0.62, 1], ["24%", "8%", "-10%", "-28%"]);
  const deepBlueY = useTransform(sectionProgress, [0, 0.5, 1], ["12%", "34%", "8%"]);
  const blackBlendOpacity = useTransform(
    sectionProgress,
    [0.06, 0.24, 0.42, 0.6, 0.78, 0.92, 1],
    [0, 0.08, 0.2, 0.38, 0.58, 0.78, 0.96],
  );
  const railProgress = useSpring(sectionProgress, { stiffness: 210, damping: 24, mass: 0.62 });
  const scrollVelocity = useVelocity(scrollY);
  const railMotionProgress = reduceMotion ? sectionProgress : railProgress;
  const railBubbleTop = useTransform(railMotionProgress, [0, 1], ["0%", "100%"]);
  const railFillHeight = useTransform(railMotionProgress, [0, 1], ["0%", "100%"]);
  const markerScaleX = useSpring(useTransform(scrollVelocity, [-3200, 0, 3200], [0.9, 1, 0.9]), {
    stiffness: 320,
    damping: 18,
    mass: 0.45,
  });
  const markerScaleY = useSpring(useTransform(scrollVelocity, [-3200, 0, 3200], [1.2, 1, 1.2]), {
    stiffness: 320,
    damping: 18,
    mass: 0.45,
  });
  const markerGlowOpacity = useSpring(useTransform(scrollVelocity, [-3200, 0, 3200], [0.8, 0.38, 0.8]), {
    stiffness: 220,
    damping: 20,
    mass: 0.5,
  });

  const active = steps[activeStep];
  const ActiveIcon = active.icon;

  const setCurrentStep = useCallback((index: number) => {
    const nextIndex = Math.min(steps.length - 1, Math.max(0, index));
    setActiveStep(nextIndex);
    activeStepRef.current = nextIndex;

    return nextIndex;
  }, []);

  const scrollToStep = useCallback((index: number) => {
    const nextIndex = setCurrentStep(index);

    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(max-width: 1023px)").matches) {
      document
        .getElementById(`workflow-mobile-step-${nextIndex}`)
        ?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      return;
    }

    const section = sectionRef.current;

    if (!section) {
      return;
    }

    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    const scrollableDistance = Math.max(0, section.offsetHeight - window.innerHeight);
    const progress = nextIndex / Math.max(1, steps.length - 1);

    window.scrollTo({
      top: sectionTop + scrollableDistance * progress,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [reduceMotion, setCurrentStep]);

  useEffect(() => {
    return () => {
      if (railIdleTimerRef.current) {
        clearTimeout(railIdleTimerRef.current);
      }
    };
  }, []);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const section = sectionRef.current;

    if (!section || typeof window === "undefined") {
      return;
    }

    if (Math.abs(latest - lastScrollYRef.current) > 0.5) {
      setRailActive(true);

      if (railIdleTimerRef.current) {
        clearTimeout(railIdleTimerRef.current);
      }

      railIdleTimerRef.current = setTimeout(() => {
        setRailActive(false);
        railIdleTimerRef.current = null;
      }, 420);
    }

    lastScrollYRef.current = latest;

    const sectionTop = section.offsetTop;
    const scrollableDistance = Math.max(1, section.offsetHeight - window.innerHeight);
    const bounded = clamp((latest - sectionTop) / scrollableDistance);
    const nextStep = Math.min(steps.length - 1, Math.round(bounded * (steps.length - 1)));

    if (activeStepRef.current !== nextStep) {
      activeStepRef.current = nextStep;
      setActiveStep(nextStep);
    }
  });

  function goToRelativeStep(direction: -1 | 1) {
    const nextStep = Math.min(steps.length - 1, Math.max(0, activeStepRef.current + direction));
    scrollToStep(nextStep);
  }

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-x-clip bg-[#061426] px-4 py-16 lg:h-[440vh] lg:py-0 lg:pt-24"
      id="workflow"
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(6,20,38,0.9),rgba(8,28,54,0.58)_22%,rgba(4,12,24,0.88)_48%,rgba(10,31,58,0.62)_66%,rgba(0,0,0,0.96))]"
        style={{ opacity: reduceMotion ? 0 : navyDepthOpacity }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-18%] top-[4%] z-0 h-[72rem] w-[72rem] rounded-full bg-[radial-gradient(circle,rgba(30,64,175,0.56)_0%,rgba(30,58,138,0.34)_32%,rgba(15,23,42,0.18)_58%,transparent_76%)] blur-3xl"
        style={{
          opacity: reduceMotion ? 0.14 : cobaltGlowOpacity,
          scale: reduceMotion ? 1 : cobaltScale,
          x: reduceMotion ? 0 : cobaltX,
          y: reduceMotion ? 0 : cobaltY,
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-18%] top-[18%] z-0 h-[58rem] w-[58rem] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.4)_0%,rgba(30,64,175,0.28)_30%,rgba(12,24,45,0.2)_58%,transparent_76%)] blur-3xl"
        style={{
          opacity: reduceMotion ? 0.12 : deepBlueGlowOpacity,
          scale: reduceMotion ? 1 : deepBlueScale,
          x: reduceMotion ? 0 : deepBlueX,
          y: reduceMotion ? 0 : deepBlueY,
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-[22%] top-[42%] z-0 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.26)_0%,rgba(29,78,216,0.18)_38%,rgba(8,17,34,0.08)_62%,transparent_74%)] blur-3xl"
        style={{
          opacity: reduceMotion ? 0.08 : deepBlueGlowOpacity,
          scale: reduceMotion ? 1 : cobaltScale,
          x: reduceMotion ? 0 : deepBlueX,
          y: reduceMotion ? 0 : cobaltY,
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-black"
        style={{ opacity: blackBlendOpacity }}
      />
      <div className="section-shell relative z-10 lg:sticky lg:top-20 lg:flex lg:h-[calc(100svh-7rem)] lg:items-center">
        <div className="w-full">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="section-title">
              How Aetheris turns documents into research briefings
            </h2>
            <p className="section-copy mx-auto mt-3">
              Follow one oncology safety review from uploaded PDFs to ranked evidence,
              uncertainty-aware consensus, and a structured briefing.
            </p>
          </div>

          <div className="mt-6 hidden gap-5 lg:grid lg:grid-cols-[0.76fr_1.24fr] lg:items-stretch xl:gap-6">
            <div className="grid grid-cols-[2.25rem_1fr] gap-3">
              <div className="pointer-events-none relative">
                <div className="absolute bottom-7 left-1/2 top-7 w-px -translate-x-1/2">
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(96,165,250,0.08),rgba(191,219,254,0.22)_14%,rgba(96,165,250,0.1)_52%,rgba(191,219,254,0.18)_86%,rgba(96,165,250,0.06))]" />
                  <div className="absolute inset-y-0 left-1/2 w-8 -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(96,165,250,0.16),transparent_64%)] blur-md" />
                  <motion.div
                    className="absolute left-0 top-0 w-px bg-[linear-gradient(180deg,rgba(219,234,254,0.95),rgba(96,165,250,0.8)_42%,rgba(37,99,235,0.18))] shadow-[0_0_22px_rgba(96,165,250,0.34)]"
                    style={{ height: railFillHeight }}
                  />
                  <motion.span
                    animate={{
                      height: railActive ? 24 : 7,
                      opacity: railActive ? 1 : 0.78,
                    }}
                    className="absolute left-1/2 ml-[-0.1875rem] w-1.5 -translate-y-1/2 overflow-visible rounded-full bg-[linear-gradient(180deg,rgba(241,248,255,0.98),rgba(191,219,254,0.88)_34%,rgba(96,165,250,0.7)_72%,rgba(37,99,235,0.34))] shadow-[0_0_10px_rgba(191,219,254,0.76),0_0_24px_rgba(96,165,250,0.44),0_0_48px_rgba(37,99,235,0.22)]"
                    transition={{ duration: reduceMotion ? 0 : 0.24, ease: "easeOut" }}
                    style={{
                      top: railBubbleTop,
                      scaleX: reduceMotion ? 1 : markerScaleX,
                      scaleY: reduceMotion ? 1 : markerScaleY,
                      transformPerspective: 700,
                    }}
                  >
                    <motion.span
                      className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(219,234,254,0.44)_0%,rgba(96,165,250,0.24)_34%,rgba(37,99,235,0.08)_58%,transparent_72%)] blur-md"
                      style={{ opacity: reduceMotion ? 0.28 : markerGlowOpacity }}
                    />
                    <span className="absolute inset-x-[1px] inset-y-[1px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(219,234,254,0.52)_42%,rgba(96,165,250,0.1))]" />
                    <span className="absolute left-1/2 top-1/2 h-[calc(100%+0.45rem)] w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.92)_44%,rgba(147,197,253,0.84)_56%,transparent)]" />
                  </motion.span>
                </div>
              </div>
              <div className="space-y-2.5">
                {steps.map((step, index) => (
                  <WorkflowStepButton
                    key={step.title}
                    index={index}
                    isActive={index === activeStep}
                    onSelect={() => scrollToStep(index)}
                    step={step}
                  />
                ))}
              </div>
            </div>

            <div className="flex h-[460px] flex-col gap-3 rounded-[1.85rem] border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[var(--shadow-lg)] backdrop-blur-xl">
              <div className="relative min-h-0 flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active.title}
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0, x: 22 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -22 }}
                    transition={{ duration: 0.36, ease: "easeOut" }}
                    className="absolute inset-0 overflow-hidden rounded-[1.55rem] border border-[var(--border)] bg-[linear-gradient(145deg,rgba(15,23,42,0.84),rgba(7,17,31,0.92)_54%,rgba(14,31,51,0.82))] p-5"
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(96,165,250,0.16),transparent_34%),radial-gradient(circle_at_24%_82%,rgba(125,211,252,0.09),transparent_32%)]" />
                    <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${active.accent}`} />

                    <div className="relative flex h-full flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-bright)]">
                            Phase 0{activeStep + 1}
                          </p>
                          <h3 className="mt-2 text-[1.45rem] font-semibold leading-tight text-[var(--text-primary)]">
                            {active.title}
                          </h3>
                        </div>
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-bright)] shadow-[0_16px_38px_rgba(37,99,235,0.16)]">
                          <ActiveIcon className="h-5 w-5" />
                        </div>
                      </div>

                      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                        {active.copy}
                      </p>

                      <div className="mt-4 flex-1">
                        <StepScene type={active.visual} />
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 rounded-[1.35rem] border border-[var(--border)] bg-[var(--panel-strong)] px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--panel-muted)]">
                    <motion.span
                      className="block h-full rounded-full bg-[var(--accent-bright)]"
                      animate={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
                    />
                  </span>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Step {activeStep + 1} of {steps.length}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goToRelativeStep(-1)}
                    disabled={activeStep === 0}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text-primary)] transition hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous workflow step"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goToRelativeStep(1)}
                    disabled={activeStep === steps.length - 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-primary)] transition hover:bg-[var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next workflow step"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-4 lg:hidden">
            {steps.map((step, index) => (
              <MobileWorkflowStep
                key={step.title}
                index={index}
                step={step}
                onSelect={() => scrollToStep(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowStepButton({
  index,
  isActive,
  onSelect,
  step,
}: {
  index: number;
  isActive: boolean;
  onSelect: () => void;
  step: Step;
}) {
  const Icon = step.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "step" : undefined}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-[1.15rem] border px-3 py-2.5 text-left transition duration-300 ${
        isActive
          ? "border-[var(--accent-border)] bg-[var(--panel-strong)] shadow-[0_16px_44px_rgba(37,99,235,0.18)]"
          : "border-[var(--border)] bg-[var(--panel)] opacity-72 hover:opacity-100 hover:bg-[var(--panel-strong)]"
      }`}
    >
      <motion.span
        layout
        className={`pointer-events-none absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,#60a5fa,transparent)] ${
          isActive ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition duration-300 ${
          isActive
            ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-bright)]"
            : "border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-muted)]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="relative z-10 min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            0{index + 1}
          </span>
          <span className="truncate text-[11px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            {step.detail}
          </span>
        </span>
        <span className="mt-1 block truncate text-sm font-semibold text-[var(--text-primary)]">
          {step.title}
        </span>
      </span>
    </button>
  );
}

function MobileWorkflowStep({
  index,
  onSelect,
  step,
}: {
  index: number;
  onSelect: () => void;
  step: Step;
}) {
  const Icon = step.icon;

  return (
    <article
      id={`workflow-mobile-step-${index}`}
      className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[var(--shadow-md)]"
    >
      <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-bright)]">
          <Icon className="h-4 w-4" />
        </span>
        <span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            0{index + 1} / {step.detail}
          </span>
          <span className="mt-1 block text-lg font-semibold text-[var(--text-primary)]">
            {step.title}
          </span>
          <span className="mt-2 block text-sm leading-6 text-[var(--text-secondary)]">
            {step.copy}
          </span>
        </span>
      </button>
      <div className="mt-4 rounded-[1.25rem] border border-[var(--border)] bg-[var(--panel-strong)] p-3">
        <StepScene type={step.visual} />
      </div>
    </article>
  );
}

function StepScene({ type }: { type: StepVisual }) {
  const reduceMotion = useReducedMotion();
  const sceneMotion = reduceMotion ? {} : { opacity: [0, 1], y: [10, 0] };
  const transition = { duration: reduceMotion ? 0 : 0.42, ease: "easeOut" as const };
  const panelClass =
    "rounded-[1.05rem] border border-white/10 bg-white/[0.055] shadow-[0_18px_55px_rgba(2,6,23,0.24)] backdrop-blur-xl";

  if (type === "documents") {
    return (
      <motion.div
        animate={sceneMotion}
        transition={transition}
        className="relative min-h-[195px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.66),rgba(8,18,32,0.88))] p-4"
      >
        <div className="absolute inset-x-10 top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.62),transparent)]" />
        <div className="relative grid h-full min-h-[163px] grid-cols-[1fr_0.72fr] items-center gap-4">
          <div className="space-y-2.5">
            {["oncology-study.pdf", "safety-label.pdf", "exposure-appendix.pdf"].map((document, index) => (
              <motion.div
                key={document}
                initial={reduceMotion ? false : { opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
                className={`${panelClass} flex items-center gap-3 px-4 py-2.5`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#60a5fa]/[0.14] text-[#bfdbfe]">
                  <Files className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-slate-100">{document}</span>
              </motion.div>
            ))}
          </div>
          <div className={`${panelClass} p-4`}>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
              Intake
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-100">
              Compare adverse events and possible interaction concerns.
            </p>
            <div className="mt-5 space-y-2.5">
              <span className="block h-2 rounded-full bg-[#93c5fd]/45" />
              <span className="block h-2 w-4/5 rounded-full bg-white/15" />
              <span className="block h-2 w-2/3 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (type === "chunks") {
    return (
      <motion.div
        animate={sceneMotion}
        transition={transition}
        className="grid min-h-[195px] gap-4 rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.66),rgba(8,18,32,0.88))] p-4 md:grid-cols-[0.82fr_1.18fr]"
      >
        <div className={`${panelClass} p-4`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            Source text
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-100">
            Safety labeling notes recurring nausea and dizziness in treatment context.
          </p>
          <div className="mt-5 space-y-2">
            {[100, 92, 74, 88, 54].map((width) => (
              <span
                key={width}
                className="block h-2 rounded-full bg-white/12"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {[82, 68, 74].map((width, index) => (
            <motion.div
              key={width}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.08, ease: "easeOut" }}
              className={`${panelClass} p-3`}
            >
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-[#60a5fa]/[0.12] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#bfdbfe]">
                  Chunk 0{index + 1}
                </span>
                <span className="h-2 rounded-full bg-[#bfdbfe]/45" style={{ width: `${width}%` }} />
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (type === "retrieval") {
    return (
      <motion.div
        animate={sceneMotion}
        transition={transition}
        className="grid min-h-[195px] gap-4 rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.66),rgba(8,18,32,0.88))] p-4 md:grid-cols-[0.72fr_1.28fr]"
      >
        <div className={`${panelClass} p-4`}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            Query
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-100">
            Compare adverse event burden and possible interaction concerns across uploaded sources.
          </p>
        </div>
        <div className="space-y-3">
          {["Safety labeling: nausea and dizziness", "Labeling: interaction language appears", "Study: oncology-only, short follow-up"].map(
            (item, index) => (
              <motion.div
                key={item}
                initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.36, delay: index * 0.08, ease: "easeOut" }}
                className={`${panelClass} flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-100`}
              >
                <span>{item}</span>
                <span className="rounded-full border border-[#60a5fa]/25 bg-[#60a5fa]/[0.1] px-2 py-1 font-mono text-[10px] text-[#bfdbfe]">
                  Rank {index + 1}
                </span>
              </motion.div>
            ),
          )}
        </div>
      </motion.div>
    );
  }

  if (type === "agents") {
    return (
      <motion.div
        animate={sceneMotion}
        transition={transition}
        className="relative min-h-[195px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.66),rgba(8,18,32,0.88))] p-4"
      >
        <div className="absolute left-[20%] right-[20%] top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.5),transparent)]" />
        <div className="relative grid min-h-[163px] place-items-center">
          <div className="grid w-full max-w-[34rem] grid-cols-2 gap-3 md:grid-cols-3">
            {["Retrieval", "Interaction", "Safety", "Trials", "Consensus", "Report"].map((agent, index) => (
              <motion.div
                key={agent}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.34, delay: index * 0.06, ease: "easeOut" }}
                className={`${panelClass} px-4 py-3 text-center text-sm font-medium text-slate-100`}
              >
                {agent}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  if (type === "debate") {
    return (
      <motion.div
        animate={sceneMotion}
        transition={transition}
        className="grid min-h-[195px] gap-4 rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.66),rgba(8,18,32,0.88))] p-4 md:grid-cols-3"
      >
        {["Interaction concern appears in labeling language.", "Study population is narrow and follow-up is limited.", "Safety signal appears across uploaded excerpts."].map(
          (item, index) => (
            <motion.div
              key={item}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: index * 0.08, ease: "easeOut" }}
              className={`${panelClass} flex min-h-[96px] flex-col justify-between p-4 text-sm leading-6 text-slate-100`}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                Agent 0{index + 1}
              </span>
              <span>{item}</span>
            </motion.div>
          ),
        )}
        <div className="md:col-span-3">
          <div className="rounded-[1.1rem] border border-[#60a5fa]/25 bg-[#60a5fa]/[0.1] px-4 py-3 text-sm text-[#dbeafe]">
            Consensus preserves uncertainty instead of flattening disagreement.
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      animate={sceneMotion}
      transition={transition}
      className="grid min-h-[195px] gap-4 rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.66),rgba(8,18,32,0.88))] p-4 md:grid-cols-[1.05fr_0.95fr]"
    >
      <div className={`${panelClass} p-5`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
          Briefing
        </p>
        <h4 className="mt-3 text-xl font-semibold text-white">Research memo</h4>
        <div className="mt-5 space-y-2.5">
          <span className="block h-2 rounded-full bg-[#bfdbfe]/55" />
          <span className="block h-2 w-5/6 rounded-full bg-white/16" />
          <span className="block h-2 w-2/3 rounded-full bg-white/12" />
        </div>
      </div>
      <div className={`${panelClass} p-5`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
          Output
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-100">
          Flag as research concern. Evidence is suggestive but incomplete and requires clinical
          review before operational use.
        </p>
      </div>
    </motion.div>
  );
}
