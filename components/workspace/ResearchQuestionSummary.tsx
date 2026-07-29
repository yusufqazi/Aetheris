"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

const COLLAPSE_THRESHOLD = 110;

export function ResearchQuestionSummary({ question }: { question: string }) {
  const [expanded, setExpanded] = useState(false);
  const questionId = useId();
  const collapsible = question.length > COLLAPSE_THRESHOLD;

  return (
    <div className="min-w-0 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-sky-400">
          Research question
        </p>
        {collapsible ? (
          <button
            type="button"
            aria-controls={questionId}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-slate-500 transition hover:text-sky-300"
          >
            {expanded ? "Collapse question" : "View full question"}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        ) : null}
      </div>
      <h1
        id={questionId}
        className={`mt-2 text-[clamp(1.05rem,1.65vw,1.4rem)] font-medium leading-[1.35] tracking-[-0.025em] text-slate-100 ${
          collapsible && !expanded ? "line-clamp-2" : ""
        }`}
      >
        {question}
      </h1>
    </div>
  );
}
