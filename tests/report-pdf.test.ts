import { describe, expect, it } from "vitest";

import { createAetherisReportPdf } from "@/lib/report-pdf";

describe("Aetheris PDF export", () => {
  it("creates a valid themed evidence brief", async () => {
    const bytes = await createAetherisReportPdf({
      question: "Are there any harmful drug interactions in these records?",
      executiveSummary: "Yes. The records identify a cumulative QT-prolongation concern and several medication-related risks.",
      confidence: 82,
      mode: "demo",
      createdAt: "2026-07-15T12:00:00.000Z",
      documents: ["Medication_Safety_Review.pdf"],
      sections: [{
        title: "Findings That Answer the Question",
        items: [{
          text: "Hydroxychloroquine and recent azithromycin exposure can create cumulative QT concern.",
          citations: ["[1]"],
        }],
      }],
      citations: [{
        label: "[1]",
        documentName: "Medication_Safety_Review.pdf",
        page: 1,
        excerpt: "Both can prolong QT and create cumulative QT concern.",
      }],
      disclaimer: "Research support only. Important conclusions require independent review.",
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(2_000);
  });
});
