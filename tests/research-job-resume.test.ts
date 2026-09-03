import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isStaleActiveSession,
  STALE_RESEARCH_RUN_MS,
} from "@/app/api/analyze/[id]/route";

describe("research job recovery", () => {
  afterEach(() => vi.useRealTimers());

  it("does not restart a live job during a long model generation", () => {
    const now = new Date("2026-09-03T02:30:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(isStaleActiveSession({
      status: "processing",
      updatedAt: new Date(now.getTime() - 60_000).toISOString(),
    })).toBe(false);

    expect(isStaleActiveSession({
      status: "processing",
      updatedAt: new Date(now.getTime() - STALE_RESEARCH_RUN_MS - 1).toISOString(),
    })).toBe(true);
  });

  it("never restarts a terminal session", () => {
    const oldTimestamp = new Date(Date.now() - STALE_RESEARCH_RUN_MS - 1).toISOString();

    expect(isStaleActiveSession({ status: "completed", updatedAt: oldTimestamp })).toBe(false);
    expect(isStaleActiveSession({ status: "error", updatedAt: oldTimestamp })).toBe(false);
  });
});
