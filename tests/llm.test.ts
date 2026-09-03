import { afterEach, describe, expect, it } from "vitest";

import {
  getLlmConfiguration,
  googleGenerationModels,
  googleMaxConcurrentRequests,
  googleOutputTokenBudget,
  googleRequestTimeoutMs,
  hasLlmAccess,
  isDailyGoogleQuotaError,
  isRetryableModelError,
  makeGeminiSchema,
  modelRetryDelayMs,
  nextGoogleModelIndex,
  parseGeminiStructuredResponse,
} from "@/lib/llm";
import { researchDirectorOutputSchema } from "@/lib/research/schemas";

const original = {
  provider: process.env.AI_PROVIDER,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  geminiFallbackModels: process.env.GEMINI_FALLBACK_MODELS,
  geminiRequestTimeout: process.env.GEMINI_REQUEST_TIMEOUT_MS,
  geminiMaxConcurrentRequests: process.env.GEMINI_MAX_CONCURRENT_REQUESTS,
  openAiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL,
  openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
};

afterEach(() => {
  restore("AI_PROVIDER", original.provider);
  restore("GEMINI_API_KEY", original.geminiKey);
  restore("GEMINI_MODEL", original.geminiModel);
  restore("GEMINI_FALLBACK_MODELS", original.geminiFallbackModels);
  restore("GEMINI_REQUEST_TIMEOUT_MS", original.geminiRequestTimeout);
  restore("GEMINI_MAX_CONCURRENT_REQUESTS", original.geminiMaxConcurrentRequests);
  restore("OPENAI_API_KEY", original.openAiKey);
  restore("OPENAI_MODEL", original.openAiModel);
  restore("OPENAI_EMBEDDING_MODEL", original.openAiEmbeddingModel);
});

describe("AI provider configuration", () => {
  it("adapts the research-director schema to Gemini's supported structured-output subset", () => {
    const serialized = JSON.stringify(makeGeminiSchema(researchDirectorOutputSchema));

    expect(serialized).not.toContain('"$schema"');
    expect(serialized).not.toContain('"minItems"');
    expect(serialized).not.toContain('"maxItems"');
    expect(serialized).not.toContain('"minLength"');
    expect(serialized).not.toContain('"maxLength"');
    expect(serialized).toContain('"claims"');
    expect(serialized).toContain('"contradictions"');
    expect(serialized).toContain('"unansweredQuestions"');
  });

  it("discards an incomplete contradiction without rejecting the rest of a report", () => {
    const parsed = researchDirectorOutputSchema.safeParse({
      answerStatus: "direct",
      directAnswer: "The supported evidence establishes the main conclusion.",
      claims: [],
      trajectory: [],
      contradictions: [
        {
          issue: "Incomplete model contradiction",
          sourcePositions: ["Only one position was returned."],
          reconciliation: "A comparison is not possible.",
          impact: "This item must not invalidate the complete report.",
          evidenceIds: ["evidence:one"],
        },
        {
          issue: "Complete model contradiction",
          sourcePositions: ["Begin therapy now.", "Delay therapy pending review."],
          reconciliation: "The timing recommendations remain incompatible.",
          impact: "The decision requires review of both positions.",
          evidenceIds: ["evidence:one", "evidence:two"],
        },
      ],
      unansweredQuestions: [],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.contradictions).toHaveLength(1);
    expect(parsed.data.contradictions[0].issue).toBe("Complete model contradiction");
  });

  it("prefers Gemini when a Google AI Studio key is configured", () => {
    delete process.env.AI_PROVIDER;
    process.env.GEMINI_API_KEY = "test-google-key";
    process.env.GEMINI_MODEL = "gemini-test-model";
    process.env.OPENAI_API_KEY = "test-openai-key";

    expect(getLlmConfiguration()).toMatchObject({
      enabled: true,
      provider: "google",
      model: "gemini-test-model",
      embeddingModel: "gemini-embedding-2",
    });
    expect(hasLlmAccess()).toBe(true);
  });

  it("honors an explicit OpenAI preference", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.GEMINI_API_KEY = "test-google-key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_EMBEDDING_MODEL;

    expect(getLlmConfiguration()).toMatchObject({
      provider: "openai",
      enabled: true,
      model: "gpt-5.6-luna",
      embeddingModel: "text-embedding-3-small",
    });
  });

  it("reports local extraction when no provider key exists", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(getLlmConfiguration()).toMatchObject({ enabled: false, provider: null });
    expect(hasLlmAccess()).toBe(false);
  });

  it("honors a provider retry delay and uses a conservative fallback", () => {
    expect(modelRetryDelayMs(new Error('{"retryDelay":"21.5s"}'), 0)).toBe(22_000);
    expect(modelRetryDelayMs(new Error("RESOURCE_EXHAUSTED"), 1)).toBe(30_000);
  });

  it("distinguishes daily exhaustion from a temporary Gemini throttle", () => {
    expect(isDailyGoogleQuotaError(new Error(
      'quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier"',
    ))).toBe(true);
    expect(isDailyGoogleQuotaError(new Error(
      'quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"',
    ))).toBe(false);
  });

  it("keeps a distinct live Gemini fallback model available", () => {
    process.env.GEMINI_FALLBACK_MODELS = "gemini-backup, gemini-primary, gemini-backup";
    expect(googleGenerationModels("gemini-primary")).toEqual([
      "gemini-primary",
      "gemini-backup",
    ]);
  });

  it("routes provider availability failures to the next live Gemini model", () => {
    expect(nextGoogleModelIndex(
      0,
      2,
      new Error("503 UNAVAILABLE: model is experiencing high demand"),
    )).toBe(1);
    expect(nextGoogleModelIndex(1, 2, new Error("503 UNAVAILABLE"))).toBeNull();
    expect(nextGoogleModelIndex(0, 2, new Error("Schema validation failed"))).toBeNull();
  });

  it("detects truncated structured output and retries with a larger budget", () => {
    expect(() => parseGeminiStructuredResponse('{"claims":[', "MAX_TOKENS")).toThrow(
      /truncated/i,
    );
    expect(isRetryableModelError(new Error(
      "Gemini structured response was truncated after reaching its output-token limit.",
    ))).toBe(true);
    expect(googleOutputTokenBudget("research_intelligence_output", 1)).toBeGreaterThan(
      googleOutputTokenBudget("research_intelligence_output", 0),
    );
  });

  it("bounds report assembly attempts so a dead connection cannot stall for minutes", () => {
    delete process.env.GEMINI_REQUEST_TIMEOUT_MS;
    expect(googleRequestTimeoutMs("research_intelligence_output", 0)).toBe(30_000);
    expect(googleRequestTimeoutMs("research_intelligence_output", 1)).toBe(22_000);
    expect(googleRequestTimeoutMs("specialist_output", 0)).toBe(45_000);
  });

  it("allows two staggered Gemini requests so one slow agent does not block the pipeline", () => {
    delete process.env.GEMINI_MAX_CONCURRENT_REQUESTS;
    expect(googleMaxConcurrentRequests()).toBe(2);
    process.env.GEMINI_MAX_CONCURRENT_REQUESTS = "99";
    expect(googleMaxConcurrentRequests()).toBe(4);
  });

  it("retries malformed JSON but does not invent a repaired response", () => {
    expect(() => parseGeminiStructuredResponse('{"claims":[', "STOP")).toThrow(
      /malformed JSON/i,
    );
    expect(isRetryableModelError(new Error(
      "Gemini structured response contained malformed JSON.",
    ))).toBe(true);
    expect(isRetryableModelError(new Error("TypeError: fetch failed"))).toBe(true);
    expect(parseGeminiStructuredResponse('{"claims":[]}', "STOP")).toEqual({ claims: [] });
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
