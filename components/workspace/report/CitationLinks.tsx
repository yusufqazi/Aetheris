"use client";

import { ExternalLink } from "lucide-react";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { Citation, EvidenceRelationship, ResearchSession } from "@/lib/types";

export function CitationLinks({
  citationIds,
  citations,
  session,
  limit = 3,
  claim,
  relationships = [],
}: {
  citationIds: string[];
  citations: Citation[];
  session: ResearchSession;
  limit?: number;
  claim?: string;
  relationships?: EvidenceRelationship[];
}) {
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  const mappedCitationIds = relationships.length > 0
    ? new Set(relationships.map((relationship) => relationship.citationId))
    : null;
  const linked = citationIds
    .filter((id) => !mappedCitationIds || mappedCitationIds.has(id))
    .map((id) => citations.find((citation) => citation.id === id))
    .filter((citation, index, values): citation is Citation =>
      Boolean(citation) && values.findIndex((item) => citationKey(item) === citationKey(citation)) === index,
    );
  const groups = groupCitationsBySourcePage(linked)
    .slice(0, limit);

  if (groups.length === 0) return null;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
      {groups.map((group) => {
        const citation = group[0];
        const excerptCount = new Set(group.map(citationKey)).size;
        return (
        <button
          key={`${citation.documentId}:${citation.page ?? "na"}`}
          type="button"
          onClick={() => {
            selectInspector({
              tab: "source",
              sessionId: session.id,
              evidenceId: citation.evidenceId,
              citationIds: group.map((item) => item.id),
              claimText: claim,
              evidenceRelationships: relationships.filter((relationship) => group.some((item) => item.id === relationship.citationId)),
            });
            setMobileInspectorOpen(true);
          }}
          className="inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border border-sky-300/15 bg-sky-400/[0.055] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-sky-300 transition hover:border-sky-300/25 hover:bg-sky-400/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          aria-label={`Open ${excerptCount} evidence excerpt${excerptCount === 1 ? "" : "s"} from ${citation.documentName}, page ${citation.page ?? "unknown"}`}
        >
          <span className="sm:hidden">{citation.label} · p.{citation.page ?? "?"}</span>
          <span className="hidden min-w-0 truncate sm:inline">
            {documentTitle(citation.documentName)} · p.{citation.page ?? "?"}
            {excerptCount > 1 ? ` · ${excerptCount} relevant excerpts` : ""}
          </span>
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
        );
      })}
    </div>
  );
}

function citationKey(citation?: Citation | null) {
  if (!citation) return "";
  const quote = (citation.exactQuote ?? citation.excerpt).toLowerCase().replace(/\s+/g, " ").trim();
  return `${citation.documentId}:${citation.page ?? "na"}:${citation.startOffset ?? quote}`;
}

function groupCitationsBySourcePage(citations: Citation[]) {
  const groups = new Map<string, Citation[]>();
  for (const citation of citations) {
    const key = `${citation.documentId}:${citation.page ?? "na"}`;
    groups.set(key, [...(groups.get(key) ?? []), citation]);
  }
  return Array.from(groups.values());
}

export function documentTitle(name: string) {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
