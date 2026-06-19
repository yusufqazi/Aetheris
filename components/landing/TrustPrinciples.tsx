"use client";

import {
  Bot,
  CheckCircle2,
  FileCheck2,
  GitBranch,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useRef, useState } from "react";

type Comparison = {
  traditional: string;
  aetheris: string;
  icon: LucideIcon;
};

const comparisons: Comparison[] = [
  {
    traditional: "Produces an answer",
    aetheris: "Builds an evidence-backed briefing",
    icon: FileCheck2,
  },
  {
    traditional: "May not show where information came from",
    aetheris: "Every finding is linked to source material",
    icon: CheckCircle2,
  },
  {
    traditional: "Often sounds confident even when uncertain",
    aetheris: "Makes uncertainty visible and reviewable",
    icon: HelpCircle,
  },
  {
    traditional: "One reasoning path",
    aetheris: "Multiple specialist perspectives contribute before conclusions are generated",
    icon: GitBranch,
  },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getComparisonIndex(progress: number) {
  return Math.min(comparisons.length - 1, Math.max(0, Math.floor(clamp(progress) * comparisons.length)));
}

export function TrustPrinciples() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const blueFieldOpacity = useTransform(scrollYProgress, [0, 0.22, 0.52, 0.78, 1], [0.08, 0.2, 0.34, 0.2, 0.1]);
  const leftFieldY = useTransform(scrollYProgress, [0, 1], ["-10%", "24%"]);
  const rightFieldY = useTransform(scrollYProgress, [0, 1], ["18%", "-18%"]);
  const bridgeScale = useSpring(
    useTransform(scrollYProgress, [0.06, 0.94], [0.08, 1]),
    { stiffness: 160, damping: 24, mass: 0.7 },
  );

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const nextIndex = getComparisonIndex(latest);

    setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
  });

  return (
    <section
      ref={sectionRef}
      className="relative isolate -mt-px overflow-x-clip bg-[#020711] px-4 py-24 sm:py-28 lg:h-[360vh] lg:py-0"
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#020711_0%,#061426_48%,#020711_100%)]" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-14%] top-[14%] z-0 h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.26),rgba(30,64,175,0.12)_42%,transparent_72%)] blur-3xl"
        style={{
          opacity: reduceMotion ? 0.14 : blueFieldOpacity,
          y: reduceMotion ? 0 : leftFieldY,
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-16%] top-[20%] z-0 h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.18),rgba(37,99,235,0.1)_44%,transparent_72%)] blur-3xl"
        style={{
          opacity: reduceMotion ? 0.12 : blueFieldOpacity,
          y: reduceMotion ? 0 : rightFieldY,
        }}
      />
      <ComparisonParticles progress={scrollYProgress} reduceMotion={Boolean(reduceMotion)} />

      <div className="section-shell relative z-10 lg:sticky lg:top-16 lg:flex lg:h-[calc(100svh-4rem)] lg:items-center">
        <div className="w-full">
          <div className="mx-auto max-w-4xl text-center">
            <p className="section-label">WHY AETHERIS EXISTS</p>
            <h2 className="mt-2 text-[clamp(2rem,3.7vw,4.05rem)] font-medium leading-[0.98] tracking-[-0.065em] text-[var(--text-primary)]">
              Research is easy.
              <span className="block text-white/70">Trustworthy research is hard.</span>
            </h2>
            <p className="section-copy mx-auto mt-3 max-w-2xl">
              Most AI systems optimize for answers. Aetheris optimizes for evidence,
              traceability, and reviewable conclusions.
            </p>
          </div>

          <div className="mt-7 hidden lg:block">
            <div className="relative">
              <div className="relative grid min-h-[19.5rem] grid-cols-[1fr_auto_1fr] items-stretch gap-4">
                <ComparisonPanel
                  activeText={comparisons[activeIndex].traditional}
                  activeIndex={activeIndex}
                  kind="traditional"
                  reduceMotion={Boolean(reduceMotion)}
                  title="Traditional AI Assistant"
                />

                <div className="relative flex w-16 items-center justify-center">
                  <div className="absolute inset-y-7 left-1/2 w-px -translate-x-1/2 bg-[linear-gradient(180deg,transparent,rgba(147,197,253,0.2),transparent)]" />
                  <motion.div
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 h-px w-[10rem] origin-center -translate-x-1/2 -translate-y-1/2 bg-[linear-gradient(90deg,rgba(100,116,139,0.08),rgba(147,197,253,0.46),rgba(96,165,250,0.14))] shadow-[0_0_30px_rgba(96,165,250,0.22)]"
                    style={{ scaleX: reduceMotion ? 1 : bridgeScale }}
                  />
                  <motion.div
                    className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-blue-100/[0.14] bg-[linear-gradient(145deg,rgba(15,23,42,0.72),rgba(30,64,175,0.22))] font-mono text-[10px] uppercase tracking-[0.2em] text-blue-100/70 shadow-[0_24px_80px_rgba(37,99,235,0.18),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl"
                    animate={reduceMotion ? undefined : { boxShadow: `0 24px 80px rgba(37,99,235,${0.14 + activeIndex * 0.035}), inset 0 1px 0 rgba(255,255,255,0.1)` }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                  >
                    vs
                  </motion.div>
                </div>

                <ComparisonPanel
                  activeText={comparisons[activeIndex].aetheris}
                  activeIndex={activeIndex}
                  kind="aetheris"
                  reduceMotion={Boolean(reduceMotion)}
                  title="Aetheris Research Intelligence"
                />
              </div>

              <div className="mx-auto mt-5 grid max-w-3xl grid-cols-4 gap-2">
                {comparisons.map((comparison, index) => {
                  const Icon = comparison.icon;
                  const isActive = index === activeIndex;

                  return (
                    <div
                      className={`rounded-full border px-3 py-2 transition duration-300 ${
                        isActive
                          ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[0_0_34px_rgba(96,165,250,0.16)]"
                          : "border-white/[0.06] bg-white/[0.025] text-[var(--text-muted)]"
                      }`}
                      key={comparison.aetheris}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                          0{index + 1}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ComparisonStepRail
                activeIndex={activeIndex}
                progress={scrollYProgress}
                reduceMotion={Boolean(reduceMotion)}
              />
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:hidden">
            {comparisons.map((comparison, index) => (
              <MobileComparisonCard comparison={comparison} index={index} key={comparison.aetheris} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonStepRail({
  activeIndex,
  progress,
  reduceMotion,
}: {
  activeIndex: number;
  progress: MotionValue<number>;
  reduceMotion: boolean;
}) {
  const markerLeft = useTransform(progress, [0, 1], ["0%", "100%"]);
  const fillScale = useSpring(progress, { stiffness: 120, damping: 28, mass: 0.8 });
  const stepWidth = 100 / comparisons.length;
  const reducedMarkerLeft = `${(activeIndex + 0.5) * stepWidth}%`;
  const reducedFill = (activeIndex + 0.5) / comparisons.length;

  return (
    <div aria-hidden="true" className="pointer-events-none mx-auto mt-3 hidden max-w-3xl lg:block">
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <motion.div
          className="absolute left-0 top-1/2 h-px origin-left -translate-y-1/2 bg-blue-200/70"
          style={{
            opacity: 0.86,
            scaleX: reduceMotion ? reducedFill : fillScale,
          }}
        />

        <motion.span
          className="absolute top-1/2 h-1.5 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-100/85 shadow-[0_0_16px_rgba(147,197,253,0.24)]"
          style={{ left: reduceMotion ? reducedMarkerLeft : markerLeft }}
        />
      </div>
    </div>
  );
}

function ComparisonPanel({
  activeIndex,
  activeText,
  kind,
  reduceMotion,
  title,
}: {
  activeIndex: number;
  activeText: string;
  kind: "traditional" | "aetheris";
  reduceMotion: boolean;
  title: string;
}) {
  const isAetheris = kind === "aetheris";

  return (
    <motion.div
      className={`relative overflow-hidden rounded-[1.65rem] border p-5 shadow-[0_34px_120px_rgba(0,0,0,0.34)] backdrop-blur-2xl ${
        isAetheris
          ? "border-blue-100/[0.16] bg-[linear-gradient(145deg,rgba(15,23,42,0.72),rgba(37,99,235,0.16)_52%,rgba(2,7,17,0.78))]"
          : "border-white/[0.07] bg-[linear-gradient(145deg,rgba(15,23,42,0.5),rgba(2,7,17,0.74))]"
      }`}
      animate={
        reduceMotion
          ? undefined
          : {
              rotateX: isAetheris ? -0.45 : 0.45,
              rotateY: isAetheris ? -0.55 : 0.55,
              scale: isAetheris ? 1.004 : 0.998,
              transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
            }
      }
      style={{ transformPerspective: 1400, transformStyle: "preserve-3d" }}
    >
      {isAetheris ? (
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/[0.13] blur-3xl" />
      ) : (
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-slate-400/[0.035] blur-3xl" />
      )}
      <AnimatePresence initial={false}>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.015 }}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: isAetheris ? 1 : 0.72, scale: 1 }}
          key={`${kind}-depth-${activeIndex}`}
          transition={{ duration: reduceMotion ? 0 : 0.72, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className={`absolute inset-0 ${
              isAetheris
                ? "bg-[radial-gradient(circle_at_76%_24%,rgba(147,197,253,0.2),transparent_34%),radial-gradient(circle_at_28%_76%,rgba(37,99,235,0.12),transparent_40%)]"
                : "bg-[radial-gradient(circle_at_24%_28%,rgba(148,163,184,0.09),transparent_36%),radial-gradient(circle_at_74%_78%,rgba(59,130,246,0.055),transparent_42%)]"
            }`}
          />
        </motion.div>
      </AnimatePresence>
      <AnimatePresence initial={false}>
        <motion.div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-[inherit] border ${
            isAetheris
              ? "border-blue-100/20 bg-[radial-gradient(circle_at_50%_50%,rgba(147,197,253,0.11),transparent_58%)]"
              : "border-white/10 bg-[radial-gradient(circle_at_50%_50%,rgba(148,163,184,0.06),transparent_58%)]"
          }`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
          animate={
            reduceMotion
              ? { opacity: 0 }
              : { opacity: [0, isAetheris ? 0.95 : 0.48, 0], scale: [0.985, 1, 1.012] }
          }
          key={`${kind}-bloom-${activeIndex}`}
          transition={{ duration: reduceMotion ? 0 : 0.86, ease: [0.16, 1, 0.3, 1] }}
        />
      </AnimatePresence>

      <div className="relative flex h-full min-h-[16.5rem] flex-col">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
              {isAetheris ? "Structured system" : "General assistant"}
            </p>
            <h3 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
              {title}
            </h3>
          </div>
          <div
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[1.1rem] border ${
              isAetheris
                ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-bright)]"
                : "border-white/[0.08] bg-white/[0.035] text-[var(--text-muted)]"
            }`}
          >
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(219,234,254,0.24),transparent_48%)]"
              animate={reduceMotion ? undefined : { opacity: [0.35, 0.9, 0.35] }}
              key={`${kind}-icon-${activeIndex}`}
              transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
            />
            {isAetheris ? (
              <FileCheck2 className="relative z-10 h-5 w-5" />
            ) : (
              <Bot className="relative z-10 h-5 w-5" />
            )}
          </div>
        </div>

        <div className="mt-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Comparison 0{activeIndex + 1}
          </p>
          <div className="relative min-h-[8.2rem] overflow-visible">
            <AnimatePresence initial={false}>
              <motion.p
                className={`absolute inset-x-0 top-0 mt-4 max-w-xl pb-1 text-[clamp(1.6rem,2.35vw,2.55rem)] font-medium leading-[1.06] tracking-[-0.055em] ${
                  isAetheris ? "text-white" : "text-white/58"
                }`}
                exit={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: -8, scale: 0.996, filter: "blur(10px)" }
                }
                initial={
                  reduceMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 10, scale: 0.992, filter: "blur(10px)" }
                }
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                key={activeText}
                transition={{ duration: reduceMotion ? 0 : 0.56, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeText}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MobileComparisonCard({
  comparison,
  index,
}: {
  comparison: Comparison;
  index: number;
}) {
  const Icon = comparison.icon;

  return (
    <article className="rounded-[1.6rem] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(15,23,42,0.66),rgba(2,7,17,0.78))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.26)]">
      <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--accent-bright)]">
        <Icon className="h-4 w-4" />
        Comparison 0{index + 1}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.1rem] border border-white/[0.06] bg-white/[0.025] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Traditional AI
          </p>
          <p className="mt-2 text-lg font-semibold text-white/70">{comparison.traditional}</p>
        </div>
        <div className="rounded-[1.1rem] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-bright)]">
            Aetheris
          </p>
          <p className="mt-2 text-lg font-semibold text-white">{comparison.aetheris}</p>
        </div>
      </div>
    </article>
  );
}

function ComparisonParticles({
  progress,
  reduceMotion,
}: {
  progress: MotionValue<number>;
  reduceMotion: boolean;
}) {
  const drift = useTransform(progress, [0, 1], ["-2%", "4%"]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden md:block"
      style={{ y: reduceMotion ? 0 : drift }}
    >
      {Array.from({ length: 14 }).map((_, index) => {
        const left = `${8 + ((index * 19) % 86)}%`;
        const top = `${12 + ((index * 29) % 74)}%`;
        const width = 30 + ((index * 11) % 66);

        return (
          <span
            className="absolute h-px rounded-full bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.26),transparent)] opacity-20"
            key={`${left}-${top}`}
            style={{ left, top, width }}
          />
        );
      })}
    </motion.div>
  );
}
