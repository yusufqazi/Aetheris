import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/reports/pdf/route";

describe("PDF report API", () => {
  it("accepts human-readable citation labels derived from long document names", async () => {
    const documentName = "Aetheris_Mock_Clinical_Study_With_A_Very_Descriptive_Filename.pdf";
    const citationLabel = "Aetheris Mock Clinical Study With A Very Descriptive Filename - p.1";
    const response = await POST(new Request("http://localhost/api/reports/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Are there interactions in these documents?",
        directAnswer: "A source-grounded interaction concern was identified.",
        supportLabel: "Moderately supported",
        supportDescription: "One finding in one cited source.",
        primaryUncertainty: "The available evidence remains source limited.",
        mode: "live",
        createdAt: "2026-07-16T12:00:00.000Z",
        documents: [documentName],
        citedDocumentCount: 1,
        sections: [{
          title: "Findings",
          items: [{ text: "A supported finding.", citations: [citationLabel] }],
        }],
        citations: [{
          label: citationLabel,
          documentName,
          page: 1,
          excerpt: "A supported source excerpt.",
        }],
        disclaimer: "Research support only.",
      }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(2_000);
  });
});
