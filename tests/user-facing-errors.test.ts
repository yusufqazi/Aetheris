import { describe, expect, it } from "vitest";

import {
  modelFallbackReason,
  toUserFacingResearchError,
} from "@/lib/research/user-facing-errors";

describe("user-facing research errors", () => {
  it("turns Gemini rate limits into a retryable nontechnical message", () => {
    const result = toUserFacingResearchError(
      new Error("429 RESOURCE_EXHAUSTED quota exceeded for model gemini"),
    );

    expect(result).toMatchObject({
      code: "MODEL_RATE_LIMITED",
      title: "Model service is busy",
      retryable: true,
    });
    expect(result.message).not.toMatch(/RESOURCE_EXHAUSTED|429/);
  });

  it("turns timeouts into a retryable preserved-work message", () => {
    const result = toUserFacingResearchError(new Error("The request timed out after 60000ms"));

    expect(result).toMatchObject({ code: "MODEL_TIMEOUT", retryable: true });
    expect(result.message).toMatch(/preserved/i);
  });

  it("turns Gemini high-demand failures into a specific retryable message", () => {
    const result = toUserFacingResearchError(
      new Error("503 UNAVAILABLE: This model is currently experiencing high demand"),
    );

    expect(result).toMatchObject({
      code: "MODEL_BUSY",
      title: "Gemini is temporarily busy",
      retryable: true,
    });
    expect(result.message).not.toMatch(/503|UNAVAILABLE/);
  });

  it("detects a completed model fallback but ignores an ordinary local run", () => {
    expect(modelFallbackReason([
      { type: "analysis.mode", data: { mode: "demo", reason: "429 quota exceeded" } },
    ])).toBe("429 quota exceeded");
    expect(modelFallbackReason([
      { type: "analysis.mode", data: { mode: "demo", reason: "No AI provider key is configured." } },
    ])).toBeNull();
  });
});
