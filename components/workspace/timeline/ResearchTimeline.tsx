"use client";

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { AgentId, ResearchEvent, ResearchSession } from "@/lib/types";

export function ResearchTimeline({ session }: { session: ResearchSession }) {
  const events = [...session.events].sort((left, right) => right.sequence - left.sequence);

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-sky-400">Audit trail</p>
          <h2 className="mt-2 text-xl font-medium tracking-[-0.025em] text-white">Research timeline</h2>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-700">{events.length} events</span>
      </div>

      <div className="relative mt-5 ml-2 border-l border-white/[0.08] pl-6">
        {events.length > 0 ? (
          events.slice(0, 40).map((event) => <TimelineEvent key={event.id} event={event} session={session} />)
        ) : (
          <p className="py-8 text-xs text-slate-600">Pipeline events will appear as research begins.</p>
        )}
      </div>
    </section>
  );
}

function TimelineEvent({ event, session }: { event: ResearchEvent; session: ResearchSession }) {
  const { selectInspector, setMobileInspectorOpen } = useWorkspace();
  const agentId = "agentId" in event ? event.agentId : null;

  function inspect() {
    if (!agentId) {
      return;
    }
    selectInspector({ tab: "agent", sessionId: session.id, agentId: agentId as AgentId });
    setMobileInspectorOpen(true);
  }

  const interactive = Boolean(agentId);
  const content = (
    <>
      <span className={`absolute -left-[1.72rem] top-5 h-2 w-2 rounded-full border bg-[#07111f] ${event.type.includes("failed") ? "border-amber-300/50" : event.type.includes("completed") ? "border-emerald-300/40" : "border-sky-300/30"}`} />
      <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs leading-5 text-slate-400">{event.message}</p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.15em] text-slate-700">
            {event.phase} · {event.type.replaceAll(".", " ")}
          </p>
        </div>
        <time className="mt-1 shrink-0 text-[9px] text-slate-700 sm:mt-0">{formatTime(event.timestamp)}</time>
      </div>
    </>
  );

  return interactive ? (
    <button type="button" onClick={inspect} className="group relative block w-full border-b border-white/[0.055] text-left last:border-0 hover:bg-white/[0.015]">
      {content}
    </button>
  ) : (
    <div className="relative border-b border-white/[0.055] last:border-0">{content}</div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
