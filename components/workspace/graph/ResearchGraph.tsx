"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { AGENT_IDS, type AgentId, type ResearchSession } from "@/lib/types";

type GraphNodeKind = "document" | "evidence" | "agent" | "finding" | "consensus" | "report";

interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  detail: string;
  x: number;
  y: number;
  evidenceId?: string;
  agentId?: AgentId;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

const COLUMN_LABELS = [
  [80, "Documents"],
  [290, "Evidence"],
  [505, "Agents"],
  [720, "Findings"],
  [925, "Consensus"],
  [1110, "Report"],
] as const;

const AGENT_LABELS: Record<AgentId, string> = {
  "literature-search": "Literature",
  "drug-interaction": "Interaction",
  "adverse-reaction": "Safety",
  "trial-summarizer": "Trials",
  "debate-consensus": "Consensus",
  "report-generation": "Report",
};

export function ResearchGraph({ session }: { session: ResearchSession }) {
  const reduceMotion = useReducedMotion();
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  const { nodes, edges } = buildGraph(session);
  const [selectedId, setSelectedId] = useState<string | null>(nodes[0]?.id ?? null);
  const connected = new Set(
    edges
      .filter((edge) => edge.from === selectedId || edge.to === selectedId)
      .flatMap((edge) => [edge.from, edge.to]),
  );

  function selectNode(node: GraphNode) {
    setSelectedId(node.id);
    if (node.kind === "evidence" && node.evidenceId) {
      selectInspector({ tab: "source", sessionId: session.id, evidenceId: node.evidenceId });
    } else if (node.kind === "agent" && node.agentId) {
      selectInspector({ tab: "agent", sessionId: session.id, agentId: node.agentId });
    } else if (node.kind === "document") {
      selectInspector({ tab: "evidence", sessionId: session.id });
    } else {
      selectInspector({ tab: "confidence", sessionId: session.id });
    }
    setMobileInspectorOpen(true);
  }

  return (
    <section>
      <div className="border-b border-white/[0.07] pb-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-sky-400">Research graph</p>
        <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-white">See how evidence becomes a conclusion.</h2>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-600">
          Select a node to isolate its direct relationships and open the corresponding source, specialist, or confidence context.
        </p>
      </div>

      <div className="scrollbar-thin mt-6 overflow-x-auto rounded-[1.4rem] border border-white/[0.08] bg-[#030914]/72">
        <svg viewBox="0 0 1200 650" className="h-auto min-h-[40rem] min-w-[75rem] w-full" role="group" aria-label="Research relationship graph">
          <defs>
            <linearGradient id="edge-active" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#2563eb" stopOpacity="0.6" />
              <stop offset="1" stopColor="#7dd3fc" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          {COLUMN_LABELS.map(([x, label]) => (
            <text key={label} x={x} y="34" fill="rgba(100,116,139,0.62)" fontSize="9" fontFamily="var(--font-plex-mono)" letterSpacing="2">
              {label.toUpperCase()}
            </text>
          ))}
          {edges.map((edge, index) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const active = selectedId === null || edge.from === selectedId || edge.to === selectedId;
            const path = createCurve(from, to);
            return (
              <motion.path
                key={edge.id}
                d={path}
                fill="none"
                stroke={active ? "url(#edge-active)" : "rgba(148,163,184,0.065)"}
                strokeWidth={active ? 1.2 : 0.8}
                initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: active ? 1 : 0.45 }}
                transition={{ delay: Math.min(index * 0.025, 0.35), duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          })}
          {nodes.map((node) => {
            const active = selectedId === node.id;
            const related = connected.has(node.id);
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.kind}: ${node.label}`}
                onClick={() => selectNode(node)}
                onFocus={() => setSelectedId(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectNode(node);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <motion.rect
                  x={node.x}
                  y={node.y}
                  width="150"
                  height="62"
                  rx="14"
                  fill={active ? "rgba(37,99,235,0.2)" : related ? "rgba(56,189,248,0.075)" : "rgba(7,17,31,0.92)"}
                  stroke={active ? "rgba(125,211,252,0.55)" : related ? "rgba(125,211,252,0.2)" : "rgba(148,163,184,0.1)"}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
                  animate={{ opacity: selectedId && !active && !related ? 0.48 : 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 180, damping: 24 }}
                  style={{ transformOrigin: `${node.x + 75}px ${node.y + 31}px` }}
                />
                <text x={node.x + 13} y={node.y + 24} fill={active ? "#e0f2fe" : "#cbd5e1"} fontSize="11" fontWeight="600">
                  {truncate(node.label, 21)}
                </text>
                <text x={node.x + 13} y={node.y + 43} fill="rgba(100,116,139,0.8)" fontSize="8.5" fontFamily="var(--font-plex-mono)">
                  {truncate(node.detail, 24)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function buildGraph(session: ResearchSession) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const documents = session.documents.slice(0, 5);
  const evidence = session.evidence.slice(0, 7);
  const findings = session.results?.reportGeneration.keyFindings.slice(0, 5) ?? [];

  documents.forEach((document, index) => nodes.push({
    id: `document:${document.id}`,
    kind: "document",
    label: document.name.replace(/\.pdf$/i, ""),
    detail: `${document.pageCount} pages`,
    x: 30,
    y: distribute(index, documents.length),
  }));
  evidence.forEach((item, index) => nodes.push({
    id: `evidence:${item.id}`,
    kind: "evidence",
    label: `Passage ${String(index + 1).padStart(2, "0")}`,
    detail: `${item.documentName} p.${item.page ?? "—"}`,
    x: 240,
    y: distribute(index, evidence.length),
    evidenceId: item.id,
  }));
  AGENT_IDS.forEach((agentId, index) => nodes.push({
    id: `agent:${agentId}`,
    kind: "agent",
    label: AGENT_LABELS[agentId],
    detail: session.agentExecutions[agentId]?.status ?? "pending",
    x: 455,
    y: distribute(index, AGENT_IDS.length),
    agentId,
  }));
  findings.forEach((finding, index) => nodes.push({
    id: `finding:${index}`,
    kind: "finding",
    label: `Finding ${String(index + 1).padStart(2, "0")}`,
    detail: finding,
    x: 670,
    y: distribute(index, findings.length),
  }));
  nodes.push({ id: "consensus:final", kind: "consensus", label: "Consensus", detail: `${session.results?.debateConsensus.disagreements.length ?? 0} disagreements`, x: 875, y: 270 });
  nodes.push({ id: "report:final", kind: "report", label: "Final report", detail: `${session.reportSections.length} sections`, x: 1050, y: 270 });

  evidence.forEach((item) => {
    edges.push({ id: `document-evidence:${item.id}`, from: `document:${item.documentId}`, to: `evidence:${item.id}` });
    AGENT_IDS.slice(0, 4).forEach((agentId) => {
      if (session.agentExecutions[agentId]?.output?.evidence.some((entry) => entry.id === item.id)) {
        edges.push({ id: `evidence-agent:${item.id}:${agentId}`, from: `evidence:${item.id}`, to: `agent:${agentId}` });
      }
    });
  });
  findings.forEach((_, index) => {
    AGENT_IDS.slice(0, 4).forEach((agentId) => edges.push({ id: `agent-finding:${agentId}:${index}`, from: `agent:${agentId}`, to: `finding:${index}` }));
    edges.push({ id: `finding-consensus:${index}`, from: `finding:${index}`, to: "consensus:final" });
  });
  edges.push({ id: "consensus-report", from: "consensus:final", to: "report:final" });

  return { nodes, edges: edges.filter((edge) => nodes.some((node) => node.id === edge.from) && nodes.some((node) => node.id === edge.to)) };
}

function distribute(index: number, count: number) {
  const top = 62;
  const available = 520;
  return count <= 1 ? 270 : top + (index * available) / (count - 1);
}

function createCurve(from: GraphNode, to: GraphNode) {
  const startX = from.x + 150;
  const startY = from.y + 31;
  const endX = to.x;
  const endY = to.y + 31;
  const control = Math.max(30, (endX - startX) * 0.48);
  return `M ${startX} ${startY} C ${startX + control} ${startY}, ${endX - control} ${endY}, ${endX} ${endY}`;
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
