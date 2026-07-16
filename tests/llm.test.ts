import { afterEach, describe, expect, it } from "vitest";

import { getLlmConfiguration, hasLlmAccess, modelRetryDelayMs } from "@/lib/llm";

const original = {
  provider: process.env.AI_PROVIDER,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  openAiKey: process.env.OPENAI_API_KEY,
};

afterEach(() => {
  restore("AI_PROVIDER", original.provider);
  restore("GEMINI_API_KEY", original.geminiKey);
  restore("GEMINI_MODEL", original.geminiModel);
  restore("OPENAI_API_KEY", original.openAiKey);
});

describe("AI provider configuration", () => {
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

    expect(getLlmConfiguration()).toMatchObject({ provider: "openai", enabled: true });
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
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
