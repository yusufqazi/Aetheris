import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  runStructuredGeneration: vi.fn().mockRejectedValue(new Error("fetch failed")),
}));

import { runReportAgent } from "@/lib/agents/reportAgent";
import { makeDemoSession } from "@/lib/demo-data";
import { normalizeEvidenceItems } from "@/lib/research/evidence-normalization";
import type { EvidenceItem, GroundedFact } from "@/lib/types";

describe("report assembly recovery", () => {
  it("completes from preserved specialist outputs when the final model call disconnects", async () => {
    const session = makeDemoSession();
    const results = session.results;
    expect(results).not.toBeNull();

    const onAssemblyRecovery = vi.fn();
    const report = await runReportAgent({
      question: session.question,
      literature: results!.literatureSearch,
      drug: results!.drugInteraction,
      adverse: results!.adverseReaction,
      trial: results!.trialSummarizer,
      debate: results!.debateConsensus,
      facts: results!.groundedFacts ?? [],
      evidence: session.evidence,
      normalizedEvidence: normalizeEvidenceItems(session.evidence),
      onAssemblyRecovery,
    });

    expect(onAssemblyRecovery).toHaveBeenCalledOnce();
    expect(report.executiveSummary).toMatch(/evidence|interaction|safety|source/i);
    expect(report.keyFindings.length).toBeGreaterThan(0);
    expect(report.evidence.length).toBeGreaterThan(0);
  });

  it("carries an accepted intensity disagreement and pending evidence into the recovered report", async () => {
    const session = makeDemoSession();
    const results = session.results!;
    const records = [
      {
        name: "03_specialist_a.pdf",
        contentType: "recommendation" as const,
        text: "Continue IV diuresis at the current intensity while congestion persists.",
      },
      {
        name: "04_specialist_b.pdf",
        contentType: "recommendation" as const,
        text: "Reduce the intensity of IV diuresis because kidney function has worsened.",
      },
      {
        name: "10_case_summary.pdf",
        contentType: "limitation" as const,
        text: "Response to oral therapy and repeat renal function remain needed before the discharge decision.",
      },
    ];
    const facts = records.map((record, index) => ({
      id: `fact:report-recovery:${index}`,
      category: record.contentType === "limitation" ? "limitation" as const : "context" as const,
      contentType: record.contentType,
      text: record.text,
      evidenceId: `evidence:report-recovery:${index}`,
      documentId: `document:report-recovery:${index}`,
      documentName: record.name,
      page: 1,
      excerpt: record.text,
      relevance: "Direct evidence for the decision under review.",
    })) satisfies GroundedFact[];
    const evidence = facts.map((fact, index) => ({
      ...session.evidence[index % session.evidence.length],
      id: fact.evidenceId,
      chunkId: `chunk:report-recovery:${index}`,
      documentId: fact.documentId,
      documentName: fact.documentName,
      page: 1,
      excerpt: fact.text,
      contextBefore: "",
      contextAfter: "",
    })) satisfies EvidenceItem[];
    const question = "Where do the specialists disagree about treatment intensity, and what evidence is still needed before discharge?";

    const report = await runReportAgent({
      question,
      literature: results.literatureSearch,
      drug: results.drugInteraction,
      adverse: results.adverseReaction,
      trial: results.trialSummarizer,
      debate: {
        ...results.debateConsensus,
        disagreements: ["The specialists differ in the intensity of continued treatment."],
        missingEvidence: [
          "Confirmation of response to oral therapy.",
          "Evidence of stable or improving renal function.",
        ],
        finalConsensus: "One specialist recommends continuing the current treatment intensity, whereas the other recommends reducing it. Response to oral therapy and repeat renal function remain pending before discharge.",
      },
      facts,
      evidence,
      normalizedEvidence: normalizeEvidenceItems(evidence),
    });

    expect(report.researchIntelligence?.contradictions).toHaveLength(1);
    expect(report.researchIntelligence?.decisionChangingUnknowns.length).toBeGreaterThan(0);
    expect(report.executiveSummary).toMatch(/continuing|current treatment intensity/i);
    expect(report.executiveSummary).toMatch(/reducing|reduce/i);
    expect(report.executiveSummary).toMatch(/response to oral therapy|renal function/i);
    expect(report.executiveSummary).not.toMatch(/disagreement cannot be determined/i);
  });
});
