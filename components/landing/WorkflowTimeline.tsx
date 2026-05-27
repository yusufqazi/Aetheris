"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
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
import { useRef, useState } from "react";
import { flushSync } from "react-dom";

const steps = [
  {
    title: "Upload source documents",
    detail: "Source intake",
    copy: "Clinical studies, labels, and internal PDFs enter a workspace built for document-first research review.",
    icon: Files,
    accent: "from-[#1d4ed8]/40 via-[#60a5fa]/18 to-transparent",
    visual: "documents",
  },
  {
    title: "Extract and chunk text",
    detail: "Text preparation",
    copy: "Aetheris turns long PDFs into structured passages so retrieval and downstream review stay source-grounded.",
    icon: FileStack,
    accent: "from-[#2563eb]/36 via-[#7dd3fc]/16 to-transparent",
    visual: "chunks",
  },
  {
    title: "Retrieve evidence",
    detail: "Evidence ranking",
    copy: "The system surfaces the most relevant excerpts before specialist reasoning begins.",
    icon: SearchCode,
    accent: "from-[#60a5fa]/34 via-[#bfdbfe]/16 to-transparent",
    visual: "retrieval",
  },
  {
    title: "Run specialist agents",
    detail: "Parallel review",
    copy: "Retrieval, safety, interaction, and trial agents review the same evidence from distinct perspectives.",
    icon: BrainCircuit,
    accent: "from-[#38bdf8]/34 via-[#93c5fd]/16 to-transparent",
    visual: "agents",
  },
  {
    title: "Compare disagreements",
    detail: "Consensus shaping",
    copy: "Conflicts, missing evidence, and confidence gaps are preserved instead of flattened away.",
    icon: GitCompareArrows,
    accent: "from-[#93c5fd]/30 via-[#c4b5fd]/14 to-transparent",
    visual: "debate",
  },
  {
    title: "Generate final briefing",
    detail: "Report delivery",
    copy: "The final memo combines summary, evidence, uncertainty, and follow-up direction in a single artifact.",
    icon: ScrollText,
    accent: "from-[#bfdbfe]/30 via-[#67e8f9]/14 to-transparent",
    visual: "report",
  },
] as const;

type Step = (typeof steps)[number];
type StepVisual = Step["visual"];
type PinPhase = "before" | "active" | "after";

export function WorkflowTimeline() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [pinPhase, setPinPhase] = useState<PinPhase>("before");
  const pinPhaseRef = useRef<PinPhase>("before");
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
  const cobaltGlowOpacity = useTransform(sectionProgress, [0, 0.2, 0.5, 0.78, 1], [0, 0.38, 0.56, 0.26, 0]);
  const deepBlueGlowOpacity = useTransform(sectionProgress, [0, 0.24, 0.5, 0.76, 1], [0, 0.22, 0.46, 0.28, 0]);
  const navyDepthOpacity = useTransform(sectionProgress, [0, 0.25, 0.5, 0.75, 1], [0.2, 0.08, 0.03, 0.1, 0.2]);
  const cobaltScale = useTransform(sectionProgress, [0, 0.5, 1], [0.72, 1.22, 0.86]);
  const deepBlueScale = useTransform(sectionProgress, [0, 0.5, 1], [0.78, 1.12, 0.82]);
  const cobaltX = useTransform(sectionProgress, [0, 0.25, 0.5, 0.75, 1], ["-34%", "-16%", "4%", "20%", "36%"]);
  const cobaltY = useTransform(sectionProgress, [0, 0.5, 1], ["-18%", "2%", "18%"]);
  const deepBlueX = useTransform(sectionProgress, [0, 0.35, 0.62, 1], ["24%", "8%", "-10%", "-28%"]);
  const deepBlueY = useTransform(sectionProgress, [0, 0.5, 1], ["12%", "34%", "8%"]);

  const active = steps[activeStep];
  const ActiveIcon = active.icon;

  useMotionValueEvent(scrollY, "change", (latest) => {
    const section = sectionRef.current;

    if (!section || typeof window === "undefined") {
      return;
    }

    const sectionTop = section.offsetTop;
    const scrollableDistance = Math.max(1, section.offsetHeight - window.innerHeight);
    const sectionEnd = sectionTop + scrollableDistance;
    const bounded = Math.min(0.999, Math.max(0, (latest - sectionTop) / scrollableDistance));
    const nextStep = Math.floor(bounded * steps.length);
    const nextPhase: PinPhase =
      latest < sectionTop ? "before" : latest > sectionEnd ? "after" : "active";

    setActiveStep((current) => (current === nextStep ? current : nextStep));
    if (pinPhaseRef.current !== nextPhase) {
      pinPhaseRef.current = nextPhase;
      flushSync(() => {
        setPinPhase(nextPhase);
      });
    }
  });

  function scrollToStep(index: number) {
    setActiveStep(index);

    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(max-width: 1023px)").matches) {
      document
        .getElementById(`workflow-mobile-step-${index}`)
        ?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      return;
    }

    const section = sectionRef.current;

    if (!section) {
      return;
    }

    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    const scrollableDistance = Math.max(0, section.offsetHeight - window.innerHeight);
    const progress = index / Math.max(1, steps.length - 1);

    window.scrollTo({
      top: sectionTop + scrollableDistance * progress,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  function goToRelativeStep(direction: -1 | 1) {
    const nextStep = Math.min(steps.length - 1, Math.max(0, activeStep + direction));
    scrollToStep(nextStep);
  }

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden px-4 pt-16 lg:h-[420vh]" id="workflow">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04),rgba(7,17,31,0.48)_34%,rgba(3,7,18,0.7)_74%,rgba(2,6,23,0.08))]"
        style={{ opacity: reduceMotion ? 0.14 : navyDepthOpacity }}
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
      <div
        className={`section-shell relative z-10 lg:flex lg:h-[calc(100svh-6rem)] lg:items-center ${
          pinPhase === "active"
            ? "lg:fixed lg:left-1/2 lg:top-16 lg:z-30 lg:-translate-x-1/2"
            : pinPhase === "after"
              ? "lg:absolute lg:left-1/2 lg:top-[calc(100%-100svh+4rem)] lg:-translate-x-1/2"
              : "lg:relative"
        }`}
      >
        <div className="w-full">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="section-title">
              How Aetheris turns documents into research briefings
            </h2>
            <p className="section-copy mx-auto mt-3">
              Upload source documents, route evidence through specialized agents, compare
              uncertainty, and generate a structured research-ready briefing.
            </p>
          </div>

          <div className="mt-6 hidden gap-5 lg:grid lg:grid-cols-[0.76fr_1.24fr] lg:items-stretch xl:gap-6">
            <div className="relative">
              <div className="absolute bottom-5 left-[1.7rem] top-5 w-px bg-[linear-gradient(180deg,rgba(96,165,250,0.46),rgba(96,165,250,0.06))]" />
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

            <div className="flex h-[460px] flex-col rounded-[1.85rem] border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-[var(--shadow-lg)] backdrop-blur-xl">
              <div className="relative h-[386px] shrink-0">
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
                            Beat 0{activeStep + 1}
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

              <div className="mt-2 flex items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--panel-strong)] px-3.5 py-2">
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
            {["Study dossier.pdf", "Safety labeling.pdf", "Exposure appendix.pdf"].map((document, index) => (
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
            Compare adverse event burden across uploaded studies.
          </p>
        </div>
        <div className="space-y-3">
          {["Safety section matched", "Interaction language ranked", "Trial limitation excerpt ranked"].map(
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
        {["Interaction risk may be elevated.", "Study population is limited.", "Signal appears in multiple excerpts."].map(
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
          Summary, evidence traceability, uncertainty, and follow-up questions assemble into one
          review-ready artifact.
        </p>
      </div>
    </motion.div>
  );
}
