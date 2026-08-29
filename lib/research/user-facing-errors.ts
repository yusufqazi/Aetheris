import type { PipelineStageId, ResearchError } from "@/lib/types";

export function toUserFacingResearchError(
  error: unknown,
  options: {
    code?: string;
    stageId?: PipelineStageId | null;
    defaultTitle?: string;
    defaultMessage?: string;
  } = {},
): ResearchError {
  const details = error instanceof Error ? error.message : String(error || "Unknown error");

  if (/429|quota|rate.?limit|resource exhausted/i.test(details)) {
    return {
      code: "MODEL_RATE_LIMITED",
      title: "Model service is busy",
      message: "Gemini is temporarily handling too many requests. Your documents are preserved; wait a moment and retry the analysis.",
      stageId: options.stageId,
      retryable: true,
      details,
    };
  }

  if (/503|high demand|service unavailable|\bUNAVAILABLE\b/i.test(details)) {
    return {
      code: "MODEL_BUSY",
      title: "Gemini is temporarily busy",
      message: "Aetheris preserved the completed specialist work. Retry the final analysis when Gemini capacity is available.",
      stageId: options.stageId,
      retryable: true,
      details,
    };
  }

  if (/abort|timeout|timed out|did not respond before/i.test(details)) {
    return {
      code: "MODEL_TIMEOUT",
      title: "The model response took too long",
      message: "Aetheris preserved your documents and completed checkpoints. Retry the analysis when you are ready.",
      stageId: options.stageId,
      retryable: true,
      details,
    };
  }

  if (/fetch failed|network|socket|ECONNRESET|connection/i.test(details)) {
    return {
      code: "ANALYSIS_CONNECTION_INTERRUPTED",
      title: "Connection interrupted",
      message: "Aetheris could not reach the analysis service. Your prepared documents are preserved and the analysis can be retried.",
      stageId: options.stageId,
      retryable: true,
      details,
    };
  }

  return {
    code: options.code ?? "PIPELINE_FAILED",
    title: options.defaultTitle ?? "Research analysis paused",
    message: options.defaultMessage ?? "Aetheris preserved the completed work, but the research run did not finish.",
    stageId: options.stageId,
    retryable: true,
    details,
  };
}

export function modelFallbackReason(sessionEvents: Array<{ type: string; data?: unknown }>) {
  const event = [...sessionEvents].reverse().find((item) => {
    if (item.type !== "analysis.mode" || !item.data || typeof item.data !== "object") return false;
    const data = item.data as { mode?: unknown; reason?: unknown };
    return data.mode === "demo" && typeof data.reason === "string" &&
      /rate.?limit|quota|timeout|did not respond|fetch failed|network|structured response/i.test(data.reason);
  });
  if (!event?.data || typeof event.data !== "object") return null;
  const reason = (event.data as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}
