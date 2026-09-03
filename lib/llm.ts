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
  shouldUseProvider,
  maxAttempts,
}: {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  fallback: () => T;
  qualityCheck?: (value: T) => boolean | { valid: boolean; reason?: string };
  onFallback?: (reason: string) => void;
  shouldUseProvider?: () => boolean;
  maxAttempts?: number;
}) {
  const configuration = getLlmConfiguration();
  if (!configuration.enabled || !configuration.provider || !configuration.model) {
    onFallback?.("No AI provider is configured; deterministic local extraction was used.");
    return fallback();
  }
  if (shouldUseProvider && !shouldUseProvider()) {
    onFallback?.("The AI provider is unavailable for this analysis; deterministic local extraction was used.");
    return fallback();
  }

  let failureReason = "The AI response could not be validated.";

  const googleModels = configuration.provider === "google"
    ? googleGenerationModels(configuration.model)
    : [configuration.model];
  // Keep one correction attempt on the primary model, then reserve one call
  // for a second live Gemini model when the primary is unavailable or invalid.
  const defaultMaximumAttempts = configuration.provider === "google" && googleModels.length > 1 ? 3 : 2;
  const maximumAttempts = Math.max(
    1,
    Math.min(defaultMaximumAttempts, maxAttempts ?? defaultMaximumAttempts),
  );
  let googleModelIndex = 0;
  let qualityFailuresForModel = 0;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    const attemptModel = googleModels[Math.min(googleModelIndex, googleModels.length - 1)] as string;
    try {
      const correction = attempt === 0
        ? ""
        : `\n\nCorrection required because the previous response failed validation: ${failureReason} ` +
          "Rewrite the affected fields as complete natural-language claims. Answer every requested part, use only supplied evidence IDs, preserve observed versus possible versus recommended versus planned versus performed versus pending versus final states, keep neutral statements neutral, and remove fragments, repetition, and mechanically stitched prose.";
      const parsed = configuration.provider === "google"
        ? await withGoogleSlot(() => {
            if (shouldUseProvider && !shouldUseProvider()) {
              throw new Error("The AI provider became unavailable during this analysis.");
            }
            return generateWithGoogle({
              system,
              user: `${user}${correction}`,
              schema,
              schemaName,
              model: attemptModel,
              attempt,
            });
          })
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
        qualityFailuresForModel += 1;
        logModelAttempt(schemaName, attempt, attemptStartedAt, `${attemptModel}: ${failureReason}`);
        if (qualityFailuresForModel >= 2 && googleModelIndex < googleModels.length - 1) {
          googleModelIndex += 1;
          qualityFailuresForModel = 0;
        }
        continue;
      }
      if (qualityCheck) {
        const quality = qualityCheck(result.data);
        const valid = typeof quality === "boolean" ? quality : quality.valid;
        if (!valid) {
          const reason = typeof quality === "boolean" ? undefined : quality.reason;
          failureReason = reason
            ? `AI output for ${schemaName} failed grounding checks: ${reason}.`
            : `AI output for ${schemaName} was too vague or insufficiently grounded.`;
          qualityFailuresForModel += 1;
          logModelAttempt(schemaName, attempt, attemptStartedAt, `${attemptModel}: ${failureReason}`);
          if (qualityFailuresForModel >= 2 && googleModelIndex < googleModels.length - 1) {
            googleModelIndex += 1;
            qualityFailuresForModel = 0;
          }
          continue;
        }
      }

      logModelAttempt(schemaName, attempt, attemptStartedAt, `${attemptModel}: completed`);
      return result.data;
    } catch (error) {
      failureReason = describeModelError(error);
      logModelAttempt(schemaName, attempt, attemptStartedAt, `${attemptModel}: ${failureReason}`);
      const retryable = isRetryableModelError(error);
      const providerUnavailable = isProviderAvailabilityError(error);
      const nextModelIndex = configuration.provider === "google"
        ? nextGoogleModelIndex(googleModelIndex, googleModels.length, error)
        : null;
      if (nextModelIndex != null) {
        googleModelIndex = nextModelIndex;
        qualityFailuresForModel = 0;
        continue;
      }
      if (attempt < maximumAttempts - 1 && retryable && !providerUnavailable) {
        await delay(modelRetryDelayMs(error, attempt));
        continue;
      }
      break;
    }
  }

  console.error(
    `[Aetheris AI] ${configuration.providerLabel} ${schemaName} generation failed: ${failureReason}`,
  );
  if (configuration.enabled) {
    throw new Error(
      `${configuration.providerLabel} could not complete ${schemaName} generation. ${failureReason}`,
    );
  }
  onFallback?.(`${failureReason} Deterministic local extraction was used instead.`);
  return fallback();
}

function isProviderAvailabilityError(error: unknown) {
  return error instanceof Error && /429|quota|rate.?limit|timeout|fetch failed|network|socket|ECONNRESET|503|temporar/i.test(error.message);
}

export function nextGoogleModelIndex(
  currentIndex: number,
  modelCount: number,
  error: unknown,
) {
  return isProviderAvailabilityError(error) && currentIndex < modelCount - 1
    ? currentIndex + 1
    : null;
}

async function generateWithGoogle<T>({
  system,
  user,
  schema,
  schemaName,
  model,
  attempt,
}: {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  model: string;
  attempt: number;
}) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  const abortSignal = AbortSignal.timeout(googleRequestTimeoutMs(schemaName, attempt));
  const response = await client.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      temperature: 0.1,
      maxOutputTokens: googleOutputTokenBudget(schemaName, attempt),
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseJsonSchema: makeGeminiSchema(schema),
      abortSignal,
    },
  });
  return parseGeminiStructuredResponse(
    response.text,
    response.candidates?.[0]?.finishReason,
  );
}

export function parseGeminiStructuredResponse(
  text: string | undefined,
  finishReason?: string,
) {
  if (finishReason === "MAX_TOKENS") {
    throw new Error(
      "Gemini structured response was truncated after reaching its output-token limit.",
    );
  }
  if (finishReason && finishReason !== "STOP") {
    throw new Error(`Gemini structured generation stopped with reason ${finishReason}.`);
  }
  if (!text) {
    throw new Error("Gemini returned no structured response.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Gemini structured response contained malformed JSON.${detail}`);
  }
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
    response_format: zodResponseFormat(schema, schemaName),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return response.choices[0]?.message?.parsed;
}

export function makeGeminiSchema<T>(schema: ZodType<T>) {
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
      // Gemini validates the returned object, but its structured-output endpoint
      // rejects some otherwise-valid JSON Schema cardinality constraints. Keep
      // the provider schema structural and enforce the full Zod contract after
      // generation in runStructuredGeneration.
      .filter(([key]) => ![
        "$schema",
        "default",
        "examples",
        "minItems",
        "maxItems",
        "minLength",
        "maxLength",
      ].includes(key))
      .map(([key, child]) => [key, stripUnsupportedSchemaKeywords(child)]),
  );
}

function googleConfiguration(): LlmConfiguration {
  return {
    enabled: true,
    provider: "google",
    providerLabel: "Google Gemini",
    model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2",
  };
}

export function googleGenerationModels(primaryModel: string) {
  const configuredFallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.1-flash-lite")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return Array.from(new Set([primaryModel, ...configuredFallbacks]));
}

function openAiConfiguration(): LlmConfiguration {
  return {
    enabled: true,
    provider: "openai",
    providerLabel: "OpenAI",
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
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

export function isRetryableModelError(error: unknown) {
  if (!(error instanceof Error) || /rate-limit circuit/i.test(error.message)) {
    return false;
  }
  return /429|quota|rate.?limit|timeout|503|temporar|fetch failed|network|socket|ECONNRESET|structured response (?:was truncated|contained malformed JSON)/i.test(
    error.message,
  );
}

let activeGoogleRequests = 0;
let lastGoogleRequestStartedAt = 0;
let googleCooldownUntil = 0;
const googleWaiters: Array<() => void> = [];

async function withGoogleSlot<T>(operation: () => Promise<T>) {
  if (activeGoogleRequests >= googleMaxConcurrentRequests()) {
    await new Promise<void>((resolve) => googleWaiters.push(resolve));
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
      return result;
    } catch (error) {
      if (isGoogleRateLimitError(error) && !isDailyGoogleQuotaError(error)) {
        googleCooldownUntil = Math.max(googleCooldownUntil, Date.now() + modelRetryDelayMs(error, 0));
      }
      throw error;
    }
  } finally {
    activeGoogleRequests -= 1;
    googleWaiters.shift()?.();
  }
}

function isGoogleRateLimitError(error: unknown) {
  return error instanceof Error && /429|quota|rate.?limit/i.test(error.message);
}

export function isDailyGoogleQuotaError(error: unknown) {
  return error instanceof Error && (
    /GenerateRequestsPerDayPerProjectPerModel/i.test(error.message) ||
    /requests\s+per\s+day|daily\s+quota/i.test(error.message)
  );
}

function googleRequestIntervalMs() {
  // Keep concurrent agents from bursting requests while avoiding the former
  // 13-second serialization that made six-stage demo runs appear stalled.
  const configured = Number(process.env.GEMINI_MIN_REQUEST_INTERVAL_MS ?? 3_500);
  return Number.isFinite(configured) ? Math.max(0, configured) : 3_500;
}

export function googleMaxConcurrentRequests() {
  const configured = Number(process.env.GEMINI_MAX_CONCURRENT_REQUESTS ?? 2);
  return Number.isFinite(configured) ? Math.max(1, Math.min(4, Math.floor(configured))) : 2;
}

export function googleRequestTimeoutMs(schemaName: string, attempt = 0) {
  const defaultTimeout = schemaName === "research_intelligence_output"
    ? attempt === 0 ? 30_000 : 22_000
    : 45_000;
  const configured = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? defaultTimeout);
  return Number.isFinite(configured) ? Math.max(10_000, configured) : defaultTimeout;
}

export function googleOutputTokenBudget(schemaName: string, attempt = 0) {
  const initialBudget = schemaName === "research_intelligence_output"
    ? 6_144
    : schemaName === "debate_consensus_output"
      ? 4_096
      : 3_072;
  return attempt > 0 ? Math.round(initialBudget * 1.5) : initialBudget;
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
