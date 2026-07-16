import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { toJSONSchema, type ZodType } from "zod";

export type LlmProvider = "google" | "openai";

export interface LlmConfiguration {
  enabled: boolean;
  provider: LlmProvider | null;
  providerLabel: string;
  model: string | null;
  embeddingModel: string | null;
}

export function getLlmConfiguration(): LlmConfiguration {
  const preferredProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const hasGoogle = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY);

  if (preferredProvider === "openai" && hasOpenAi) {
    return openAiConfiguration();
  }
  if (preferredProvider === "google" && hasGoogle) {
    return googleConfiguration();
  }
  if (hasGoogle) {
    return googleConfiguration();
  }
  if (hasOpenAi) {
    return openAiConfiguration();
  }

  return {
    enabled: false,
    provider: null,
    providerLabel: "Local evidence extraction",
    model: null,
    embeddingModel: null,
  };
}

export function hasLlmAccess() {
  return getLlmConfiguration().enabled;
}

export async function runStructuredGeneration<T>({
  system,
  user,
  schema,
  schemaName,
  fallback,
  qualityCheck,
  onFallback,
}: {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  fallback: () => T;
  qualityCheck?: (value: T) => boolean;
  onFallback?: (reason: string) => void;
}) {
  const configuration = getLlmConfiguration();
  if (!configuration.enabled || !configuration.provider || !configuration.model) {
    onFallback?.("No AI provider is configured; deterministic local extraction was used.");
    return fallback();
  }

  let failureReason = "The AI response could not be validated.";

  const maximumAttempts = 2;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const correction = attempt === 0
        ? ""
        : "\n\nCorrection required: answer the research question directly, use only supplied evidence IDs, preserve concrete values, distinguish observations from interpretation, and remove vague or repeated language.";
      const parsed = configuration.provider === "google"
        ? await withGoogleSlot(() => generateWithGoogle({
            system,
            user: `${user}${correction}`,
            schema,
            schemaName,
            model: configuration.model as string,
          }))
        : await generateWithOpenAi({
            system,
            user: `${user}${correction}`,
            schema,
            schemaName,
            model: configuration.model as string,
          });
      const result = schema.safeParse(parsed);
      if (!result.success) {
        failureReason = `AI output failed ${schemaName} schema validation.`;
        logModelAttempt(schemaName, attempt, attemptStartedAt, failureReason);
        continue;
      }
      if (qualityCheck && !qualityCheck(result.data)) {
        failureReason = `AI output for ${schemaName} was too vague or insufficiently grounded.`;
        logModelAttempt(schemaName, attempt, attemptStartedAt, failureReason);
        continue;
      }

      logModelAttempt(schemaName, attempt, attemptStartedAt, "completed");
      return result.data;
    } catch (error) {
      failureReason = describeModelError(error);
      logModelAttempt(schemaName, attempt, attemptStartedAt, failureReason);
      const retryable = isRetryableModelError(error) && !isGoogleRateLimitCircuitOpen();
      if (attempt < maximumAttempts - 1 && retryable) {
        await delay(modelRetryDelayMs(error, attempt));
      } else if (!retryable) {
        break;
      }
    }
  }

  console.error(
    `[Aetheris AI] ${configuration.providerLabel} ${schemaName} generation fell back to local extraction: ${failureReason}`,
  );
  onFallback?.(`${failureReason} Deterministic local extraction was used instead.`);
  return fallback();
}

async function generateWithGoogle<T>({
  system,
  user,
  schema,
  schemaName,
  model,
}: {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  model: string;
}) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  const abortSignal = AbortSignal.timeout(googleRequestTimeoutMs(schemaName));
  const response = await client.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      temperature: 0.1,
      maxOutputTokens: googleOutputTokenBudget(schemaName),
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseJsonSchema: makeGeminiSchema(schema),
      abortSignal,
    },
  });
  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned no structured response.");
  }
  return JSON.parse(text) as unknown;
}

async function generateWithOpenAi<T>({
  system,
  user,
  schema,
  schemaName,
  model,
}: {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  model: string;
}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.parse({
    model,
    temperature: 0.1,
    response_format: zodResponseFormat(schema, schemaName),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return response.choices[0]?.message?.parsed;
}

function makeGeminiSchema<T>(schema: ZodType<T>) {
  const jsonSchema = toJSONSchema(schema, {
    target: "draft-07",
    io: "output",
    reused: "inline",
  }) as Record<string, unknown>;
  return stripUnsupportedSchemaKeywords(jsonSchema);
}

function stripUnsupportedSchemaKeywords(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedSchemaKeywords);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["$schema", "default", "examples"].includes(key))
      .map(([key, child]) => [key, stripUnsupportedSchemaKeywords(child)]),
  );
}

function googleConfiguration(): LlmConfiguration {
  return {
    enabled: true,
    provider: "google",
    providerLabel: "Google Gemini",
    model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2",
  };
}

function openAiConfiguration(): LlmConfiguration {
  return {
    enabled: true,
    provider: "openai",
    providerLabel: "OpenAI",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  };
}

function describeModelError(error: unknown) {
  if (!(error instanceof Error)) {
    return "The AI model call failed.";
  }
  if (/429|quota|rate.?limit/i.test(error.message)) {
    return "The AI provider rate limit was reached.";
  }
  if (/api.?key|unauthorized|401|403/i.test(error.message)) {
    return "The AI provider rejected the configured API key.";
  }
  if (/abort|timeout|timed out/i.test(error.message) || error.name === "TimeoutError") {
    return "The AI provider did not respond before the request timeout.";
  }
  return error.message;
}

function isRetryableModelError(error: unknown) {
  if (!(error instanceof Error) || /rate-limit circuit/i.test(error.message)) {
    return false;
  }
  return /429|quota|rate.?limit|timeout|503|temporar/i.test(error.message);
}

let activeGoogleRequests = 0;
let lastGoogleRequestStartedAt = 0;
let googleCooldownUntil = 0;
let googleRateLimitCircuitUntil = 0;
let consecutiveGoogleRateLimits = 0;
const googleWaiters: Array<() => void> = [];

async function withGoogleSlot<T>(operation: () => Promise<T>) {
  assertGoogleCircuitAvailable();
  let waitedForSlot = false;
  if (activeGoogleRequests >= 1) {
    waitedForSlot = true;
    await new Promise<void>((resolve) => googleWaiters.push(resolve));
  }
  try {
    assertGoogleCircuitAvailable();
  } catch (error) {
    if (waitedForSlot) googleWaiters.shift()?.();
    throw error;
  }
  activeGoogleRequests += 1;
  try {
    const minimumInterval = googleRequestIntervalMs();
    const earliestStart = Math.max(
      googleCooldownUntil,
      lastGoogleRequestStartedAt + minimumInterval,
    );
    if (earliestStart > Date.now()) {
      await delay(earliestStart - Date.now());
    }
    lastGoogleRequestStartedAt = Date.now();
    try {
      const result = await operation();
      consecutiveGoogleRateLimits = 0;
      return result;
    } catch (error) {
      if (isRetryableModelError(error)) {
        googleCooldownUntil = Math.max(googleCooldownUntil, Date.now() + modelRetryDelayMs(error, 0));
      }
      if (isGoogleRateLimitError(error)) {
        consecutiveGoogleRateLimits += 1;
        if (consecutiveGoogleRateLimits >= 2) {
          googleRateLimitCircuitUntil = Date.now() + 60_000;
        }
      }
      throw error;
    }
  } finally {
    activeGoogleRequests -= 1;
    googleWaiters.shift()?.();
  }
}

function assertGoogleCircuitAvailable() {
  if (!isGoogleRateLimitCircuitOpen()) return;
  throw new Error(
    "Google AI rate-limit circuit is temporarily open after repeated quota responses.",
  );
}

function isGoogleRateLimitCircuitOpen() {
  return googleRateLimitCircuitUntil > Date.now();
}

function isGoogleRateLimitError(error: unknown) {
  return error instanceof Error && /429|quota|rate.?limit/i.test(error.message);
}

function googleRequestIntervalMs() {
  const configured = Number(process.env.GEMINI_MIN_REQUEST_INTERVAL_MS ?? 13_000);
  return Number.isFinite(configured) ? Math.max(0, configured) : 13_000;
}

function googleRequestTimeoutMs(schemaName: string) {
  const defaultTimeout = schemaName === "report_generation_output" ? 75_000 : 55_000;
  const configured = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? defaultTimeout);
  return Number.isFinite(configured) ? Math.max(10_000, configured) : defaultTimeout;
}

function googleOutputTokenBudget(schemaName: string) {
  if (schemaName === "report_generation_output") return 6_144;
  if (schemaName === "debate_consensus_output") return 4_096;
  return 3_072;
}

function logModelAttempt(
  schemaName: string,
  attempt: number,
  startedAt: number,
  outcome: string,
) {
  if (process.env.NODE_ENV === "test") return;
  console.info(
    `[Aetheris AI] ${schemaName} attempt ${attempt + 1} ${outcome} after ${Date.now() - startedAt}ms`,
  );
}

export function modelRetryDelayMs(error: unknown, attempt: number) {
  const message = error instanceof Error ? error.message : String(error);
  const explicitDelay = message.match(/(?:retryDelay["']?\s*[:=]\s*["']?|retry(?:\s+after|\s+in)?\s+)(\d+(?:\.\d+)?)s/i)?.[1];
  if (explicitDelay) {
    return Math.min(65_000, Math.max(5_000, Math.ceil(Number(explicitDelay) * 1_000) + 500));
  }
  return Math.min(45_000, 15_000 * (attempt + 1));
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
