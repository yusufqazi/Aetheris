"use client";

import {
  motion,
  type MotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import {
  Beaker,
  BrainCircuit,
  FileSearch,
  FlaskConical,
  ScrollText,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";

type Agent = {
  title: string;
  purpose: string;
  finding: string;
  confidence: string;
  icon: LucideIcon;
};

const agents: Agent[] = [
  {
    title: "Literature Retrieval Agent",
    purpose: "Find strongest evidence.",
    finding:
      "Safety-label.pdf p.4 and oncology-study.pdf p.7 contain strongest supporting excerpts.",
    confidence: "Source-grounded",
    icon: FileSearch,
  },
  {
    title: "Drug Interaction Agent",
    purpose: "Evaluate interaction concerns.",
    finding: "Potential interaction language appears but severity remains unconfirmed.",
    confidence: "Moderate uncertainty",
    icon: FlaskConical,
  },
  {
    title: "Adverse Reaction Agent",
    purpose: "Surface recurring safety signals.",
    finding: "Nausea and dizziness appear repeatedly across uploaded sources.",
    confidence: "High evidence overlap",
    icon: ShieldAlert,
  },
  {
    title: "Clinical Trial Summarizer",
    purpose: "Review study limitations.",
    finding: "Cohort remains oncology-specific with limited follow-up duration.",
    confidence: "Bounded confidence",
    icon: Beaker,
  },
  {
    title: "Debate / Consensus Agent",
    purpose: "Compare disagreements.",
    finding: "Interaction concern exists but available evidence remains incomplete.",
    confidence: "Escalation recommended",
    icon: BrainCircuit,
  },
  {
    title: "Report Generation Agent",
    purpose: "Generate final briefing.",
    finding:
      "Research concern surfaced with visible uncertainty and source-grounded reasoning.",
    confidence: "Briefing ready",
    icon: ScrollText,
  },
];

const CARD_TOPS = [20, 32, 44, 56, 68, 80];
const CARD_OPEN_PROGRESS = CARD_TOPS.map((top) =>
  clamp((top / 100 * 5.2 - 0.55) / 4.2, 0, 1),
);
const NUMBER_CHANGE_PROGRESS = [0, 0.18, 0.36, 0.54, 0.72, 0.82];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function getAmbientNumberIndex(progress: number) {
  let index = 0;

  for (let i = 1; i < NUMBER_CHANGE_PROGRESS.length; i += 1) {
    if (progress >= NUMBER_CHANGE_PROGRESS[i]) {
      index = i;
    }
  }

  return index;
}

export function MultiAgentAnalysis() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const visibleProgress = scrollYProgress;
  const progressVelocity = useVelocity(scrollYProgress);

  const markerOffset = useSpring(
    useTransform(progressVelocity, (latest) => clamp(latest * 46, -18, 18)),
    { stiffness: 190, damping: 28, mass: 0.55 },
  );
  const dottedY = useTransform(visibleProgress, [0, 1], ["0%", "-54%"]);
  const fieldOpacity = useTransform(visibleProgress, [0, 0.4, 0.72, 1], [0.08, 0.18, 0.14, 0.06]);
  const glowY = useTransform(visibleProgress, [0, 0.5, 1], ["-18%", "12%", "42%"]);
  const leftGlowX = useTransform(visibleProgress, [0, 0.5, 1], ["-14%", "2%", "-8%"]);
  const leftGlowY = useTransform(visibleProgress, [0, 0.5, 1], ["-18%", "12%", "30%"]);
  const rightGlowX = useTransform(visibleProgress, [0, 0.5, 1], ["12%", "-4%", "10%"]);
  const rightGlowY = useTransform(visibleProgress, [0, 0.5, 1], ["24%", "-8%", "18%"]);
  const sideGlowOpacity = useTransform(visibleProgress, [0, 0.2, 0.5, 0.82, 1], [0.08, 0.22, 0.32, 0.2, 0.1]);
  const trailLength = useSpring(
    useTransform(progressVelocity, (latest) => 34 + Math.min(220, Math.abs(latest) * 420)),
    { stiffness: 180, damping: 24, mass: 0.55 },
  );
  const downTrailOpacity = useSpring(
    useTransform(progressVelocity, (latest) => clamp(latest * 2.8, 0, 0.84)),
    { stiffness: 190, damping: 26, mass: 0.5 },
  );
  const upTrailOpacity = useSpring(
    useTransform(progressVelocity, (latest) => clamp(latest * -2.8, 0, 0.84)),
    { stiffness: 190, damping: 26, mass: 0.5 },
  );
  const numberGlowOpacity = useSpring(
    useTransform(progressVelocity, (latest) => clamp(Math.abs(latest) * 2.8, 0, 0.72)),
    { stiffness: 190, damping: 26, mass: 0.5 },
  );
  const numberScrollGlow = useTransform(
    numberGlowOpacity,
    (latest) =>
      `0 0 ${8 + latest * 22}px rgba(96,165,250,${latest * 0.36}), 0 0 ${
        34 + latest * 42
      }px rgba(37,99,235,${latest * 0.22})`,
  );

  useMotionValueEvent(visibleProgress, "change", (latest) => {
    const nextIndex = getAmbientNumberIndex(latest);

    setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
  });

  return (
    <section ref={sectionRef} className="relative isolate h-[520vh] bg-black" id="agents">
      <div className="sticky top-0 z-10 h-screen overflow-hidden bg-black">
        <EvidenceParticles reduceMotion={Boolean(reduceMotion)} />
        <div className="pointer-events-none absolute left-5 top-24 z-20 hidden font-mono text-[10px] uppercase tracking-[0.34em] text-blue-100/[0.34] md:block lg:left-8">
          MULTI-AGENT REVIEW
        </div>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center font-mono text-[31vw] font-semibold leading-none tracking-[-0.12em] md:text-[23vw]"
          initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.46, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            className="absolute inset-0 flex items-center justify-center text-white/[0.055]"
            style={{
              textShadow: reduceMotion ? "none" : numberScrollGlow,
            }}
          >
            {String(activeIndex + 1).padStart(2, "0")}
          </motion.span>
        </motion.div>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-[4%] top-[16%] z-0 h-[32rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.2),rgba(30,64,175,0.09)_42%,transparent_72%)] blur-3xl"
          style={{
            opacity: reduceMotion ? 0.14 : sideGlowOpacity,
            x: reduceMotion ? 0 : leftGlowX,
            y: reduceMotion ? 0 : leftGlowY,
          }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute right-[3%] top-[30%] z-0 h-[34rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.16),rgba(37,99,235,0.08)_46%,transparent_72%)] blur-3xl"
          style={{
            opacity: reduceMotion ? 0.12 : sideGlowOpacity,
            x: reduceMotion ? 0 : rightGlowX,
            y: reduceMotion ? 0 : rightGlowY,
          }}
        />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.18),rgba(30,64,175,0.08)_42%,transparent_72%)] blur-3xl"
          style={{ opacity: reduceMotion ? 0.08 : fieldOpacity, y: reduceMotion ? 0 : glowY }}
        />

        <div className="absolute inset-0 flex items-center justify-center">
          <CroppedDotPath
            dottedY={dottedY}
            downTrailOpacity={downTrailOpacity}
            markerOffset={markerOffset}
            reduceMotion={Boolean(reduceMotion)}
            trailLength={trailLength}
            upTrailOpacity={upTrailOpacity}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">
        <ScrollingSectionIntro />
        {agents.map((agent, index) => (
          <ScrollingPerspectiveCard
            agent={agent}
            index={index}
            key={agent.title}
            progress={visibleProgress}
            reduceMotion={Boolean(reduceMotion)}
          />
        ))}
      </div>
    </section>
  );
}

function EvidenceParticles({ reduceMotion }: { reduceMotion: boolean }) {
  const particles = [
    { left: "14%", top: "21%", width: 78, label: "safety-label.pdf", delay: 0 },
    { left: "74%", top: "18%", width: 54, label: "p.7", delay: 0.4 },
    { left: "21%", top: "64%", width: 46, label: "evidence", delay: 0.8 },
    { left: "79%", top: "69%", width: 72, label: "bounded", delay: 1.2 },
    { left: "10%", top: "82%", width: 58, label: "source", delay: 1.6 },
    { left: "84%", top: "42%", width: 66, label: "context", delay: 2 },
    { left: "30%", top: "34%", width: 38, label: "p.4", delay: 2.4 },
    { left: "66%", top: "84%", width: 42, label: "review", delay: 2.8 },
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {particles.map((particle, index) => (
        <motion.div
          className="absolute hidden items-center gap-2 text-blue-100/[0.12] md:flex"
          key={`${particle.left}-${particle.top}`}
          style={{ left: particle.left, top: particle.top }}
          animate={
            reduceMotion
              ? undefined
              : {
                  opacity: [0.05, 0.16, 0.07],
                  x: [0, index % 2 === 0 ? 10 : -10, 0],
                }
          }
          transition={{
            duration: 8 + index * 0.35,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <span
            className="h-px rounded-full bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.36),transparent)]"
            style={{ width: particle.width }}
          />
          <span className="font-mono text-[8px] uppercase tracking-[0.24em]">{particle.label}</span>
        </motion.div>
      ))}
    </div>
  );
}

function ScrollingSectionIntro() {
  return (
    <div className="absolute left-1/2 top-8 z-20 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 text-center sm:top-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-[#60a5fa]">
        Multi Agent analysis
      </p>
      <p className="mt-3 text-[clamp(1.9rem,4.2vw,3.55rem)] font-medium leading-[1.02] tracking-[-0.055em] text-white">
        Six specialist perspectives review the same evidence
      </p>
    </div>
  );
}

function CroppedDotPath({
  dottedY,
  downTrailOpacity,
  markerOffset,
  reduceMotion,
  trailLength,
  upTrailOpacity,
}: {
  dottedY: MotionValue<string>;
  downTrailOpacity: MotionValue<number>;
  markerOffset: MotionValue<number>;
  reduceMotion: boolean;
  trailLength: MotionValue<number>;
  upTrailOpacity: MotionValue<number>;
}) {
  return (
    <div className="relative h-[42vh] max-h-[390px] min-h-[280px] w-24 overflow-hidden [mask-image:linear-gradient(180deg,transparent,rgba(0,0,0,0.08)_4%,black_18%,black_82%,rgba(0,0,0,0.08)_96%,transparent)]">
      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 top-[-64%] h-[228%] w-px -translate-x-1/2"
        style={{
          y: reduceMotion ? 0 : dottedY,
          backgroundImage:
            "linear-gradient(180deg, rgba(248,250,252,0.42) 0 4px, transparent 4px 19px)",
          backgroundSize: "1px 19px",
        }}
      />

      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 z-20 w-[3px] -translate-x-1/2 -translate-y-full rounded-full bg-[linear-gradient(180deg,rgba(96,165,250,0),rgba(96,165,250,0.82),rgba(191,219,254,0.96))] shadow-[0_0_30px_rgba(96,165,250,0.78)]"
        style={{
          height: reduceMotion ? 52 : trailLength,
          opacity: reduceMotion ? 0.28 : downTrailOpacity,
          top: "50%",
          y: reduceMotion ? 0 : markerOffset,
        }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 z-20 w-[3px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(191,219,254,0.96),rgba(96,165,250,0.82),rgba(96,165,250,0))] shadow-[0_0_30px_rgba(96,165,250,0.78)]"
        style={{
          height: reduceMotion ? 52 : trailLength,
          opacity: reduceMotion ? 0 : upTrailOpacity,
          top: "50%",
          y: reduceMotion ? 0 : markerOffset,
        }}
      />

      <motion.div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 z-30 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#60a5fa] shadow-[0_0_28px_rgba(96,165,250,0.95),0_0_72px_rgba(37,99,235,0.34)]"
        style={{ y: reduceMotion ? 0 : markerOffset }}
      />
    </div>
  );
}

function ScrollingPerspectiveCard({
  agent,
  index,
  progress,
  reduceMotion,
}: {
  agent: Agent;
  index: number;
  progress: MotionValue<number>;
  reduceMotion: boolean;
}) {
  const Icon = agent.icon;
  const isLeft = index % 2 === 1;
  const openProgress = useSpring(
    useTransform(progress, (latest) =>
      clamp((latest - CARD_OPEN_PROGRESS[index] + 0.035) / 0.07),
    ),
    { stiffness: 210, damping: 27, mass: 0.62 },
  );
  const cardHeight = useTransform(openProgress, [0, 1], [116, 350]);
  const contentOpacity = useTransform(openProgress, [0.18, 0.62, 1], [0, 0.78, 1]);
  const contentY = useTransform(openProgress, [0, 1], [18, 0]);
  const cardScale = useTransform(openProgress, [0, 1], [0.965, 1]);
  const glowOpacity = useTransform(openProgress, [0, 1], [0.03, 0.13]);

  return (
    <article
      className={`absolute left-4 right-4 z-20 -translate-y-1/2 md:w-[min(34rem,calc(50vw-8rem))] lg:w-[min(38rem,calc(50vw-9rem))] ${
        isLeft
          ? "md:left-auto md:right-[calc(50%+6rem)] lg:right-[calc(50%+7rem)]"
          : "md:left-[calc(50%+6rem)] md:right-auto lg:left-[calc(50%+7rem)]"
      }`}
      style={{ top: `${CARD_TOPS[index]}%` }}
    >
      <motion.div
        className="relative overflow-hidden rounded-[1.65rem] border border-blue-200/[0.08] bg-[linear-gradient(145deg,rgba(3,7,18,0.54),rgba(6,17,32,0.42)_48%,rgba(0,0,0,0.36))] p-6 shadow-[0_34px_115px_rgba(0,0,0,0.72),0_0_64px_rgba(37,99,235,0.1),inset_0_1px_0_rgba(147,197,253,0.08)] backdrop-blur-2xl"
        style={{
          height: reduceMotion ? 350 : cardHeight,
          scale: reduceMotion ? 1 : cardScale,
        }}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.24),transparent)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_6%,rgba(96,165,250,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_42%)]" />
        <motion.div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-500 blur-3xl"
          style={{ opacity: reduceMotion ? 0.07 : glowOpacity }}
        />

        <div className="relative flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-200/[0.1] bg-blue-400/[0.055] text-[#93c5fd] shadow-[0_0_24px_rgba(37,99,235,0.12),inset_0_1px_0_rgba(147,197,253,0.08)]">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#60a5fa]">
              Perspective 0{index + 1}
            </p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight text-white">
              {agent.title}
            </h3>
          </div>
        </div>

        <motion.div
          className="relative mt-6 grid gap-4"
          style={{
            opacity: reduceMotion ? 1 : contentOpacity,
            y: reduceMotion ? 0 : contentY,
          }}
        >
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Purpose
            </p>
            <p className="mt-1 text-base leading-7 text-slate-200">{agent.purpose}</p>
          </div>
          <div className="rounded-[1.15rem] border border-blue-200/[0.07] bg-white/[0.028] p-4 shadow-[inset_0_1px_0_rgba(147,197,253,0.045)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Finding
            </p>
            <p className="mt-2 text-base leading-7 text-slate-100">{agent.finding}</p>
          </div>
          <p className="w-fit rounded-full border border-blue-200/[0.08] bg-blue-400/[0.045] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#bfdbfe]">
            {agent.confidence}
          </p>
        </motion.div>
      </motion.div>
    </article>
  );
}
