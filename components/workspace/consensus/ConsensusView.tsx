"use client";

import { Check, HelpCircle, Minus, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  SPECIALIST_AGENT_IDS,
  type AgentId,
  type ConsensusClaim,
  type ConsensusStance,
  type ResearchSession,
} from "@/lib/types";

const AGENT_SHORT_LABELS: Record<AgentId, string> = {
  "literature-search": "Literature",
  "drug-interaction": "Interaction",
  "adverse-reaction": "Safety",
  "trial-summarizer": "Trials",
  "debate-consensus": "Consensus",
  "report-generation": "Report",
};

export function ConsensusView({ session }: { session: ResearchSession }) {
  const claims = session.results?.consensusClaims ?? session.results?.debateConsensus.claims ?? [];
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(claims[0]?.id ?? null);
  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId) ?? claims[0] ?? null;
  const debate = session.results?.debateConsensus;

  if (!debate) {
    return (
      <div className="flex min-h-[26rem] flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-white/[0.08] text-center">
        <HelpCircle className="h-5 w-5 text-slate-700" />
        <p className="mt-4 text-sm text-slate-400">Consensus appears after specialist analysis settles.</p>
        <p className="mt-2 text-xs text-slate-700">Agreement is never inferred before the evidence perspectives complete.</p>
      </div>
    );
  }

  return (
    <section>
      <div className="grid gap-7 border-b border-white/[0.07] pb-7 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-sky-400">Consensus engine</p>
          <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-white">Agreement without flattened uncertainty.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{debate.finalConsensus}</p>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[1rem] border border-white/[0.07] bg-white/[0.07] xl:grid-cols-1">
          <ConsensusMetric label="Agreements" value={debate.agreements.length} tone="positive" />
          <ConsensusMetric label="Disagreements" value={debate.disagreements.length} tone="caution" />
          <ConsensusMetric label="Evidence gaps" value={debate.missingEvidence.length} tone="muted" />
        </dl>
      </div>

      <div className="mt-7 grid gap-7 2xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 overflow-hidden rounded-[1.2rem] border border-white/[0.08] bg-[#050d19]/58">
          <div className="scrollbar-thin overflow-x-auto">
            <div className="min-w-[50rem]">
              <div className="grid grid-cols-[minmax(18rem,1.7fr)_repeat(4,minmax(7rem,0.7fr))] border-b border-white/[0.07] px-4 py-3 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-700">
                <span>Consensus claim</span>
                {SPECIALIST_AGENT_IDS.map((agentId) => <span key={agentId} className="text-center">{AGENT_SHORT_LABELS[agentId]}</span>)}
              </div>
              {claims.map((claim) => (
                <ClaimRow
                  key={claim.id}
                  claim={claim}
                  active={selectedClaim?.id === claim.id}
                  onSelect={() => setSelectedClaimId(claim.id)}
                  session={session}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="border-l border-white/[0.08] pl-5">
          {selectedClaim ? <ClaimInspector claim={selectedClaim} /> : null}
        </aside>
      </div>
    </section>
  );
}

function ClaimRow({
  claim,
  active,
  onSelect,
  session,
}: {
  claim: ConsensusClaim;
  active: boolean;
  onSelect: () => void;
  session: ResearchSession;
}) {
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  return (
    <div className={`grid grid-cols-[minmax(18rem,1.7fr)_repeat(4,minmax(7rem,0.7fr))] border-b border-white/[0.06] px-4 py-4 last:border-0 ${active ? "bg-sky-400/[0.035]" : ""}`}>
      <button type="button" onClick={onSelect} className="pr-5 text-left">
        <p className={`text-xs leading-5 ${active ? "text-sky-100" : "text-slate-400"}`}>{claim.claim}</p>
        <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.15em] text-slate-700">{claim.confidence}% consensus confidence</p>
      </button>
      {SPECIALIST_AGENT_IDS.map((agentId) => {
        const position = claim.positions.find((item) => item.agentId === agentId);
        return (
          <button
            key={agentId}
            type="button"
            onClick={() => {
              onSelect();
              selectInspector({ tab: "agent", sessionId: session.id, agentId });
              setMobileInspectorOpen(true);
            }}
            className="flex items-center justify-center"
            aria-label={`${AGENT_SHORT_LABELS[agentId]}: ${position?.stance ?? "insufficient"}`}
          >
            <StanceBadge stance={position?.stance ?? "insufficient"} />
          </button>
        );
      })}
    </div>
  );
}

function ClaimInspector({ claim }: { claim: ConsensusClaim }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-sky-400">Selected claim</p>
      <p className="mt-3 text-sm leading-6 text-slate-300">{claim.claim}</p>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#7dd3fc)]" style={{ width: `${claim.confidence}%` }} />
      </div>
      <p className="mt-2 text-[10px] text-slate-700">{claim.confidence}% aggregate confidence</p>
      <div className="mt-6">
        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-700">Why uncertainty remains</p>
        <div className="mt-3 space-y-3">
          {claim.uncertaintyReasons.length > 0 ? claim.uncertaintyReasons.map((reason) => (
            <p key={reason} className="border-l border-amber-300/20 pl-3 text-[11px] leading-5 text-slate-500">{reason}</p>
          )) : <p className="text-[11px] text-slate-600">No additional uncertainty reason was recorded.</p>}
        </div>
      </div>
    </div>
  );
}

function StanceBadge({ stance }: { stance: ConsensusStance }) {
  const config = {
    agree: { icon: Check, label: "Agree", classes: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-300" },
    caution: { icon: ShieldAlert, label: "Caution", classes: "border-sky-300/20 bg-sky-300/[0.08] text-sky-300" },
    disagree: { icon: Minus, label: "Disagree", classes: "border-amber-300/20 bg-amber-300/[0.08] text-amber-300" },
    insufficient: { icon: HelpCircle, label: "Insufficient", classes: "border-white/[0.08] text-slate-700" },
  }[stance];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9px] ${config.classes}`}>
      <Icon className="h-3 w-3" /> {config.label}
    </span>
  );
}

function ConsensusMetric({ label, value, tone }: { label: string; value: number; tone: "positive" | "caution" | "muted" }) {
  const color = tone === "positive" ? "text-emerald-300" : tone === "caution" ? "text-amber-300" : "text-slate-400";
  return (
    <div className="bg-[#07111f]/90 p-4">
      <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-700">{label}</dt>
      <dd className={`mt-1 text-2xl font-medium ${color}`}>{value}</dd>
    </div>
  );
}
