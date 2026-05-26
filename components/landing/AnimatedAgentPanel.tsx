"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BrainCircuit, FileText, Sparkles } from "lucide-react";

const evidenceShards = [
  { label: "Evidence", className: "left-[27%] top-[27%]", delay: 0.28 },
  { label: "Signals", className: "left-[31%] top-[43%]", delay: 0.42 },
  { label: "Limits", className: "left-[27%] top-[59%]", delay: 0.56 },
];

const agentNodes = [
  { label: "Search", className: "left-[46%] top-[21%]", delay: 0.78 },
  { label: "Safety", className: "left-[56%] top-[45%]", delay: 0.94 },
  { label: "Trials", className: "left-[45%] top-[67%]", delay: 1.1 },
];

const flowPaths = [
  { d: "M 126 250 C 198 206 236 202 292 222", delay: 0.15 },
  { d: "M 128 250 C 202 250 244 250 314 250", delay: 0.35 },
  { d: "M 126 250 C 198 294 236 304 292 282", delay: 0.55 },
  { d: "M 318 250 C 364 212 398 210 434 236", delay: 0.85 },
  { d: "M 384 250 C 438 250 474 246 534 234", delay: 1.1 },
  { d: "M 384 270 C 440 304 484 310 548 292", delay: 1.3 },
];

const reportLines = [82, 64, 74];

export function AnimatedAgentPanel() {
  const reduceMotion = useReducedMotion();

  const lineMotion = reduceMotion
    ? { pathLength: 1, opacity: 0.58 }
    : { pathLength: [0, 1, 1], opacity: [0.08, 0.82, 0.46] };

  return (
    <motion.div
      role="img"
      aria-label="Research pipeline visualization from clinical PDF to extracted evidence, activated AI agents, and a consensus report."
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.75, ease: "easeOut" }}
      className="relative h-[430px] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.94),rgba(7,17,31,0.98)_48%,rgba(10,28,48,0.94))] shadow-[0_34px_120px_rgba(2,6,23,0.46)] backdrop-blur-2xl sm:h-[470px] lg:h-full lg:min-h-[500px]"
      style={{ perspective: "1200px" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(96,165,250,0.16),transparent_38%),linear-gradient(250deg,rgba(125,211,252,0.1),transparent_44%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-8 h-px bg-[linear-gradient(90deg,transparent,rgba(191,219,254,0.58),transparent)]" />
      <div className="pointer-events-none absolute inset-x-12 bottom-10 h-px bg-[linear-gradient(90deg,transparent,rgba(59,130,246,0.32),transparent)]" />

      <motion.div
        aria-hidden="true"
        animate={
          reduceMotion
            ? {}
            : {
                rotateX: [0, 1.8, 0],
                rotateY: [-2.8, 2.2, -2.8],
              }
        }
        transition={{ duration: 11, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="absolute inset-4 sm:inset-6"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="absolute left-[9%] top-[15%] h-[70%] w-[82%] rounded-[2rem] border border-white/[0.045] bg-white/[0.025]" />
        <div className="absolute left-[16%] top-[23%] h-[52%] w-[70%] -rotate-3 rounded-[1.75rem] border border-white/[0.035] bg-white/[0.018]" />

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 680 500"
          fill="none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="pipeline-line" x1="80" x2="590" y1="250" y2="250">
              <stop stopColor="#60A5FA" stopOpacity="0.08" />
              <stop offset="0.45" stopColor="#BFDBFE" stopOpacity="0.86" />
              <stop offset="1" stopColor="#67E8F9" stopOpacity="0.24" />
            </linearGradient>
            <filter id="pipeline-glow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {flowPaths.map((path) => (
            <path
              key={`${path.d}-glow`}
              d={path.d}
              stroke="rgba(96,165,250,0.13)"
              strokeLinecap="round"
              strokeWidth="13"
              filter="url(#pipeline-glow)"
            />
          ))}

          {flowPaths.map((path) => (
            <motion.path
              key={path.d}
              d={path.d}
              stroke="url(#pipeline-line)"
              strokeLinecap="round"
              strokeWidth="2.4"
              initial={{ pathLength: reduceMotion ? 1 : 0, opacity: reduceMotion ? 0.58 : 0 }}
              animate={lineMotion}
              transition={{
                duration: 4.8,
                delay: path.delay,
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: 2.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </svg>

        <motion.div
          initial={{ opacity: 0, x: -18, rotateZ: -2 }}
          animate={{ opacity: 1, x: 0, rotateZ: -2 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          className="absolute left-[5%] top-[34%] w-[7.5rem] rounded-[1.35rem] border border-white/10 bg-white/[0.075] p-3.5 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-xl sm:w-[9.2rem] sm:p-4"
          style={{ transform: "translateZ(70px)" }}
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#60a5fa]/[0.15] text-[#bfdbfe]">
              <FileText className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-white">Clinical PDF</span>
          </div>
          <div className="mt-4 space-y-2">
            <span className="block h-1.5 w-full rounded-full bg-white/[0.18]" />
            <span className="block h-1.5 w-4/5 rounded-full bg-white/[0.12]" />
            <span className="block h-1.5 w-2/3 rounded-full bg-white/10" />
          </div>
        </motion.div>

        {evidenceShards.map((shard) => (
          <motion.div
            key={shard.label}
            initial={{ opacity: 0, x: -12, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: shard.delay, ease: "easeOut" }}
            className={`absolute ${shard.className} rounded-full border border-[#93c5fd]/[0.18] bg-[#93c5fd]/[0.1] px-3 py-2 text-xs font-semibold text-[#dbeafe] shadow-[0_16px_45px_rgba(37,99,235,0.18)] backdrop-blur-xl`}
            style={{ transform: "translateZ(95px)" }}
          >
            {shard.label}
          </motion.div>
        ))}

        <div className="absolute left-1/2 top-[49%] -translate-x-1/2 -translate-y-1/2">
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
            style={{ transform: "translateZ(130px)" }}
          >
            <motion.div
              animate={reduceMotion ? {} : { scale: [1, 1.035, 1] }}
              transition={{ duration: 4.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
              className="relative flex h-[6.25rem] w-[6.25rem] items-center justify-center rounded-[2rem] border border-[#bfdbfe]/[0.3] bg-[linear-gradient(180deg,rgba(191,219,254,0.22),rgba(37,99,235,0.14))] text-white shadow-[0_0_80px_rgba(96,165,250,0.34)] backdrop-blur-2xl"
            >
              <div className="absolute inset-[-0.65rem] rounded-[2.35rem] border border-[#60a5fa]/[0.12]" />
              <div className="text-center">
                <BrainCircuit className="mx-auto h-6 w-6 text-[#dbeafe]" />
                <p className="mt-2 text-sm font-semibold text-white">Agents</p>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {agentNodes.map((node) => (
          <motion.div
            key={node.label}
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={
              reduceMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : {
                    opacity: [0.74, 1, 0.74],
                    y: [0, -3, 0],
                    scale: [1, 1.04, 1],
                  }
            }
            transition={{
              duration: 3.8,
              delay: node.delay,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
            className={`absolute ${node.className} rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-slate-200 shadow-[0_14px_42px_rgba(2,6,23,0.26)] backdrop-blur-xl`}
            style={{ transform: "translateZ(110px)" }}
          >
            {node.label}
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, x: 18, rotateZ: 2 }}
          animate={{ opacity: 1, x: 0, rotateZ: 2 }}
          transition={{ duration: 0.72, delay: 1.05, ease: "easeOut" }}
          className="absolute right-[5%] top-[31%] w-[8.2rem] rounded-[1.45rem] border border-[#bfdbfe]/[0.22] bg-white/[0.11] p-3.5 shadow-[0_28px_82px_rgba(2,6,23,0.42)] backdrop-blur-2xl sm:w-[10rem] sm:p-4"
          style={{ transform: "translateZ(85px)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-300">Consensus</p>
              <p className="mt-1 text-sm font-semibold text-white sm:text-base">Research brief</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#67e8f9]/[0.12] text-[#bfdbfe]">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {reportLines.map((line, index) => (
              <motion.span
                key={line}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: `${line}%`, opacity: 1 }}
                transition={{ duration: 0.7, delay: 1.34 + index * 0.15, ease: "easeOut" }}
                className="block h-1.5 rounded-full bg-[linear-gradient(90deg,rgba(191,219,254,0.88),rgba(103,232,249,0.38))]"
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
