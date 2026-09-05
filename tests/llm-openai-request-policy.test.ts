import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const openAiMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  parse: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        parse: openAiMocks.parse,
      },
    };

    constructor(options: unknown) {
      openAiMocks.constructor(options);
    }
  },
}));

import { runStructuredGeneration } from "@/lib/llm";

const originalEnvironment = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
};

describe("OpenAI request policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
  });

  afterEach(() => {
    restoreEnvironment("AI_PROVIDER", originalEnvironment.AI_PROVIDER);
    restoreEnvironment("OPENAI_API_KEY", originalEnvironment.OPENAI_API_KEY);
    restoreEnvironment("OPENAI_MODEL", originalEnvironment.OPENAI_MODEL);
  });

  it("applies the report transport limit and does not retry a provider timeout", async () => {
    openAiMocks.parse.mockRejectedValueOnce(new Error("provider request timed out"));

    await expect(runStructuredGeneration({
      system: "Return a structured result.",
      user: "Test input",
      schema: z.object({ result: z.string() }),
      schemaName: "research_intelligence_output",
      maxAttempts: 2,
      openAiRequestPolicy: {
        timeoutMs: 40_000,
        maxRetries: 0,
      },
      fallback: () => ({ result: "fallback" }),
    })).rejects.toThrow(/request timeout/i);

    expect(openAiMocks.constructor).toHaveBeenCalledWith(expect.objectContaining({
      timeout: 40_000,
      maxRetries: 0,
    }));
    expect(openAiMocks.parse).toHaveBeenCalledOnce();
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
