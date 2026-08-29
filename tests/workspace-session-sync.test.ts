import { describe, expect, it } from "vitest";

import {
  mergeSessions,
  preferredSession,
} from "@/components/workspace/WorkspaceProvider";
import { makeDemoSession } from "@/lib/demo-data";

describe("workspace session synchronization", () => {
  it("does not let a stale idle checkpoint replace an in-flight analysis", () => {
    const idle = makeSession("idle");
    const processing = {
      ...idle,
      status: "processing" as const,
      updatedAt: new Date(Date.parse(idle.updatedAt) + 1_000).toISOString(),
    };
    const staleRemote = {
      ...idle,
      updatedAt: new Date(Date.parse(processing.updatedAt) + 1_000).toISOString(),
    };

    expect(preferredSession(processing, staleRemote)).toBe(processing);
    expect(mergeSessions([processing], [staleRemote])).toEqual([processing]);
  });

  it("accepts a completed server session over an in-flight browser snapshot", () => {
    const processing = {
      ...makeSession("processing"),
      status: "processing" as const,
    };
    const completed = makeDemoSession();
    completed.id = processing.id;

    expect(preferredSession(processing, completed)).toBe(completed);
  });
});

function makeSession(status: "idle" | "processing") {
  const session = makeDemoSession();
  return {
    ...session,
    status,
    events: [],
    results: undefined,
    confidence: undefined,
    reportSections: [],
  };
}
