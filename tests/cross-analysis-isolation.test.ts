import { afterEach, describe, expect, it } from "vitest";

import type { ResearchEventInput } from "@/lib/research/events";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createResearchSession } from "@/lib/research/session";
import { AGENT_IDS, type UploadedDocument } from "@/lib/types";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

const GI_SENTINEL = "GI-APX-ISOLATION-7741";
const HEART_SENTINEL = "HF-EUVOLEMIA-ISOLATION-9927";

afterEach(() => {
  restoreEnvironment("OPENAI_API_KEY", originalOpenAiKey);
  restoreEnvironment("GEMINI_API_KEY", originalGeminiKey);
});

describe("cross-analysis evidence isolation", () => {
  it(
    "never allows prepared evidence or generated artifacts from analysis A to enter analysis B",
    async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const analysisAId = "analysis-gi-a";
      const analysisBId = "analysis-heart-b";
      const documentsA = [makeDocument({
        sessionId: analysisAId,
        id: "document-gi-a",
        name: "gi-bleed-sentinel.pdf",
        text: `${GI_SENTINEL}. Endoscopic hemostasis was achieved. The record discusses when apixaban may be restarted after melena resolves.`,
      })];
      const documentsB = [makeDocument({
        sessionId: analysisBId,
        id: "document-heart-b",
        name: "heart-failure-sentinel.pdf",
        text: `${HEART_SENTINEL}. The admission is due to acute decompensated heart failure with residual congestion. Response to oral diuretics and next-morning renal function remain pending before discharge.`,
      })];

      const resultA = await runLocalAnalysis(
        analysisAId,
        "What evidence guides anticoagulation restart after the gastrointestinal bleed?",
        documentsA,
      );
      expect(JSON.stringify(resultA)).toContain(GI_SENTINEL);

      const resultB = await runLocalAnalysis(
        analysisBId,
        "What is driving the heart-failure admission and what evidence is still needed before discharge?",
        documentsB,
      );
      const serializedB = JSON.stringify(resultB);

      expect(serializedB).toContain(HEART_SENTINEL);
      expect(serializedB).not.toContain(GI_SENTINEL);
      expect(serializedB).not.toContain("document-gi-a");
      expect(serializedB).not.toContain("gi-bleed-sentinel.pdf");
      expect(resultB.result.results.citations?.every(
        (citation) => citation.documentId === "document-heart-b",
      )).toBe(true);

      const contaminatedB = createResearchSession({
        id: analysisBId,
        question: "Analyze the heart-failure evidence.",
        selectedAgents: [...AGENT_IDS],
        documents: [...documentsB, ...documentsA],
        mode: "demo",
      });

      await expect(runResearchPipeline({
        session: contaminatedB,
        emit: () => undefined,
      })).rejects.toThrow(/do not belong to analysis analysis-heart-b/i);

      const contaminatedA = createResearchSession({
        id: analysisAId,
        question: "Analyze the gastrointestinal evidence.",
        selectedAgents: [...AGENT_IDS],
        documents: [...documentsA, ...documentsB],
        mode: "demo",
      });

      await expect(runResearchPipeline({
        session: contaminatedA,
        emit: () => undefined,
      })).rejects.toThrow(/do not belong to analysis analysis-gi-a/i);
    },
    20_000,
  );
});

async function runLocalAnalysis(
  id: string,
  question: string,
  documents: UploadedDocument[],
) {
  const events: ResearchEventInput[] = [];
  const session = createResearchSession({
    id,
    question,
    selectedAgents: [...AGENT_IDS],
    documents,
    mode: "demo",
  });
  const result = await runResearchPipeline({
    session,
    emit: (event) => {
      events.push(event);
    },
  });

  return { result, events };
}

function makeDocument({
  sessionId,
  id,
  name,
  text,
}: {
  sessionId: string;
  id: string;
  name: string;
  text: string;
}): UploadedDocument {
  return {
    id,
    sessionId,
    name,
    size: text.length,
    pageCount: 1,
    uploadedAt: "2026-08-29T00:00:00.000Z",
    preview: text,
    text,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
  };
}

function restoreEnvironment(name: "OPENAI_API_KEY" | "GEMINI_API_KEY", value?: string) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
