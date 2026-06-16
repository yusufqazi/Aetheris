"use client";

import {
  FileText,
  HelpCircle,
  Link2,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  motion,
  type Variants,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SafetyDisclaimer } from "@/components/landing/SafetyDisclaimer";

const keyFindings = [
  "Recurring nausea and dizziness reported across uploaded sources",
  "Potential interaction pathway requires further review",
  "Trial population limits confidence in broad conclusions",
];

const evidenceMap = [
  {
    finding: "Recurring nausea and dizziness",
    source: "safety-label.pdf - Page 4",
    confidence: "Moderate",
  },
  {
    finding: "Interaction language detected",
    source: "oncology-study.pdf - Page 7",
    confidence: "Moderate",
  },
  {
    finding: "Population limitation identified",
    source: "exposure-appendix.pdf - Page 12",
    confidence: "Bounded",
  },
];

const agentContributions = [
  ["Literature Retrieval Agent", "Identified strongest supporting excerpts"],
  ["Drug Interaction Agent", "Flagged interaction-related language"],
  ["Adverse Reaction Agent", "Found recurring safety signals"],
  ["Clinical Trial Summarizer", "Identified population and follow-up limitations"],
  ["Consensus Agent", "Reconciled agreement and disagreement"],
  ["Report Generation Agent", "Assembled the structured research briefing"],
];

const followUps = [
  "Are additional exposure-response datasets available?",
  "Do post-market observations support the interaction signal?",
  "Would subgroup analysis change interpretation?",
];

const confidenceLabels = [
  "Moderate Confidence",
  "Bounded Evidence",
  "Requires Clinical Review",
  "Further Validation Recommended",
];

export function ReportPreview({ disclaimer }: { disclaimer: string }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const reportViewportRef = useRef<HTMLDivElement | null>(null);
  const reportContentRef = useRef<HTMLDivElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [reportScrollDistance, setReportScrollDistance] = useState(620);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const reportContentY = useTransform(
    scrollYProgress,
    [0.06, 0.94],
    [0, -reportScrollDistance],
  );
  const backgroundOpacity = useTransform(scrollYProgress, [0, 0.34, 0.82, 1], [0, 1, 1, 0.92]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.35, 0.72, 1], [0.12, 0.5, 0.62, 0.34]);
  const glowY = useTransform(scrollYProgress, [0, 1], ["-18%", "18%"]);
  const glowScale = useTransform(scrollYProgress, [0, 0.58, 1], [0.74, 1.08, 0.92]);
  const lineScale = useTransform(scrollYProgress, [0.08, 0.46], [0, 1]);

  const reveal: Variants = {
    hidden: reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 },
    show: (delay = 0) => ({
      opacity: 1,
      y: 0,
      transition: { delay, duration: reduceMotion ? 0 : 0.68, ease: [0.22, 1, 0.36, 1] },
    }),
  };

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");

    function syncDesktop() {
      setIsDesktop(query.matches);
    }

    syncDesktop();
    query.addEventListener("change", syncDesktop);

    return () => query.removeEventListener("change", syncDesktop);
  }, []);

  useEffect(() => {
    if (!isDesktop || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    function measureReportScroll() {
      const viewport = reportViewportRef.current;
      const content = reportContentRef.current;

      if (!viewport || !content) {
        return;
      }

      setReportScrollDistance(Math.max(0, content.scrollHeight - viewport.clientHeight + 32));
    }

    measureReportScroll();

    const observer = new ResizeObserver(measureReportScroll);
    const viewport = reportViewportRef.current;
    const content = reportContentRef.current;

    if (viewport) {
      observer.observe(viewport);
    }

    if (content) {
      observer.observe(content);
    }

    window.addEventListener("resize", measureReportScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureReportScroll);
    };
  }, [isDesktop]);

  return (
    <section
      ref={sectionRef}
      className="relative isolate -mt-px overflow-x-clip bg-black px-4 py-24 sm:py-28 lg:h-[220vh] lg:py-0"
      id="demo"
      style={
        isDesktop
          ? { height: `calc(100svh + ${Math.max(820, reportScrollDistance + 180)}px)` }
          : undefined
      }
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_28%,rgba(30,64,175,0.2),transparent_34%),linear-gradient(180deg,#020711_0%,#061426_48%,#020711_100%)]"
        style={{ opacity: reduceMotion ? 1 : backgroundOpacity }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[18%] z-0 h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.3),rgba(30,64,175,0.12)_38%,transparent_70%)] blur-3xl"
        style={
          reduceMotion
            ? undefined
            : {
                opacity: glowOpacity,
                scale: glowScale,
                y: glowY,
              }
        }
      />

      <div className="section-shell relative z-10 lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center">
        <div className="grid w-full gap-12 lg:grid-cols-[0.76fr_1.24fr] lg:items-center xl:gap-16">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.45 }}
            className="lg:flex lg:min-h-screen lg:flex-col lg:justify-center"
          >
            <motion.p className="section-label" custom={0} variants={reveal}>
              FINAL OUTPUT
            </motion.p>
            <motion.h2
              className="mt-4 max-w-[38rem] text-[clamp(2.3rem,4.5vw,4.55rem)] font-medium leading-[1.02] tracking-[-0.055em] text-[var(--text-primary)]"
              custom={0.08}
              variants={reveal}
            >
              Structured research briefing grounded in evidence, not assumptions
            </motion.h2>
            <motion.p
              className="mt-5 max-w-[34rem] text-base leading-8 text-[var(--text-secondary)]"
              custom={0.16}
              variants={reveal}
            >
              Rather than generating a generic AI answer, Aetheris produces a source-grounded
              research briefing with confidence framing, evidence traceability, and follow-up
              questions.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.24 }}
            className="relative"
          >
            <motion.div
              className="relative overflow-hidden rounded-[2.15rem] border border-blue-100/[0.12] bg-[linear-gradient(145deg,rgba(13,25,43,0.96),rgba(7,17,31,0.92)_54%,rgba(5,10,20,0.98))] p-3 text-[var(--text-primary)] shadow-[0_42px_150px_rgba(2,6,23,0.72),0_0_90px_rgba(37,99,235,0.14)] backdrop-blur-2xl lg:h-[min(78svh,760px)]"
              custom={0}
              variants={reveal}
            >
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(219,234,254,0.74),transparent)]" />
              <div className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-blue-500/[0.16] blur-3xl" />
              <div className="pointer-events-none absolute -left-24 bottom-10 h-72 w-72 rounded-full bg-[#1d4ed8]/[0.1] blur-3xl" />

              <div
                ref={reportViewportRef}
                className="relative h-full overflow-hidden rounded-[1.65rem] border border-white/[0.09] bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(8,16,30,0.86))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              >
                <motion.div
                  ref={reportContentRef}
                  className="grid gap-4 p-5 lg:pb-16"
                  style={isDesktop ? { y: reportContentY } : undefined}
                >
                  <motion.div
                    className="grid gap-5 border-b border-white/[0.08] pb-5 sm:grid-cols-[1fr_auto]"
                    custom={0.12}
                    variants={reveal}
                  >
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-bright)]">
                        Research briefing
                      </p>
                      <h3 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
                        Adverse event burden and interaction concern review
                      </h3>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                        Review adverse event burden and possible interaction concerns across
                        uploaded oncology sources.
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                        oncology-study.pdf / safety-label.pdf / exposure-appendix.pdf
                      </p>
                    </div>

                    <div className="flex h-fit items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent-bright)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-bright)] shadow-[0_0_18px_rgba(96,165,250,0.9)]" />
                      Report ready
                    </div>
                  </motion.div>

                  <motion.div
                    aria-hidden="true"
                    className="h-px origin-left bg-[linear-gradient(90deg,rgba(96,165,250,0.06),rgba(191,219,254,0.72),rgba(96,165,250,0.08))]"
                    style={{ scaleX: reduceMotion ? 1 : lineScale }}
                  />

                  <ReportBlock
                    delay={0.22}
                    icon={FileText}
                    label="Executive Summary"
                    variants={reveal}
                  >
                    Recurring nausea and dizziness signals appear across multiple uploaded sources.
                    Interaction-related language is present in safety labeling material, although
                    evidence remains insufficient to determine severity. Trial population limitations
                    reduce confidence in broad generalization.
                  </ReportBlock>

                  <motion.div className="grid gap-3" custom={0.34} variants={reveal}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-bright)]">
                      Key Findings
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {keyFindings.map((finding, index) => (
                        <motion.div
                          key={finding}
                          className="relative overflow-hidden rounded-[1.05rem] border border-white/[0.09] bg-white/[0.045] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                          custom={0.38 + index * 0.05}
                          variants={reveal}
                        >
                          <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(147,197,253,0.42),transparent)]" />
                          <p className="text-sm leading-6 text-[var(--text-primary)]">{finding}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>

                  <motion.div
                    className="relative overflow-hidden rounded-[1.25rem] border border-[var(--accent-border)] bg-[linear-gradient(135deg,rgba(37,99,235,0.16),rgba(15,23,42,0.74))] p-4 shadow-[0_22px_70px_rgba(37,99,235,0.14)]"
                    custom={0.5}
                    variants={reveal}
                  >
                    <div className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-blue-400/[0.14] blur-2xl" />
                    <div className="relative flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-bright)]">
                          Confidence Assessment
                        </p>
                        <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                          Moderate Confidence
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {confidenceLabels.map((label) => (
                          <span
                            key={label}
                            className="rounded-full border border-white/[0.1] bg-white/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  <ReportBlock
                    delay={0.62}
                    icon={Sparkles}
                    label="Evidence Contributions"
                    variants={reveal}
                  >
                    <div className="grid gap-2">
                      {agentContributions.map(([agent, contribution]) => (
                        <div
                          key={agent}
                          className="flex flex-col gap-1 rounded-[0.95rem] border border-white/[0.06] bg-black/[0.16] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="text-sm font-semibold text-[var(--text-primary)]">
                            {agent}
                          </span>
                          <span className="text-sm leading-6 text-[var(--text-secondary)]">
                            {contribution}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ReportBlock>

                  <ReportBlock
                    delay={0.74}
                    icon={ShieldCheck}
                    label="Consensus Outcome"
                    variants={reveal}
                  >
                    Evidence supports a recurring adverse event signal across uploaded sources.
                    Interaction concerns remain plausible but not confirmed. Additional clinical
                    review is recommended before operational use.
                  </ReportBlock>

                  <motion.div className="grid gap-3" custom={0.86} variants={reveal}>
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-[var(--accent-bright)]" />
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-bright)]">
                        Evidence Mapping
                      </p>
                    </div>
                    {evidenceMap.map((item) => (
                      <div
                        key={item.finding}
                        className="grid gap-2 rounded-[1.05rem] border border-white/[0.08] bg-white/[0.04] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                      >
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {item.finding}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)]">{item.source}</p>
                        <span className="w-fit rounded-full border border-white/[0.08] bg-black/[0.16] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          {item.confidence}
                        </span>
                      </div>
                    ))}
                  </motion.div>

                  <ReportBlock
                    delay={0.98}
                    icon={HelpCircle}
                    label="Follow-Up Questions"
                    variants={reveal}
                  >
                    <ul className="grid gap-2">
                      {followUps.map((question) => (
                        <li key={question} className="text-sm leading-6 text-[var(--text-secondary)]">
                          {question}
                        </li>
                      ))}
                    </ul>
                  </ReportBlock>

                  <SafetyDisclaimer
                    body={disclaimer}
                    className="relative border-white/[0.08] bg-white/[0.055] text-[var(--text-primary)] shadow-[0_18px_70px_rgba(2,6,23,0.22)] [&_p:last-child]:text-[var(--text-secondary)]"
                  />
                </motion.div>

                <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(180deg,rgba(8,16,30,0.96),transparent)]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,transparent,rgba(8,16,30,0.96))]" />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ReportBlock({
  children,
  delay,
  icon: Icon,
  label,
  variants,
}: {
  children: ReactNode;
  delay: number;
  icon: LucideIcon;
  label: string;
  variants: Variants;
}) {
  return (
    <motion.div
      className="rounded-[1.2rem] border border-white/[0.08] bg-white/[0.05] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      custom={delay}
      variants={variants}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--accent-bright)]" />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-bright)]">
          {label}
        </p>
      </div>
      <div className="text-sm leading-6 text-[var(--text-secondary)]">{children}</div>
    </motion.div>
  );
}
