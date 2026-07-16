import { NextResponse } from "next/server";
import { z } from "zod";

import { createAetherisReportPdf } from "@/lib/report-pdf";

export const runtime = "nodejs";

const reportSchema = z.object({
  question: z.string().min(7).max(4_000),
  executiveSummary: z.string().min(1).max(20_000),
  confidence: z.number().min(0).max(100),
  mode: z.enum(["live", "demo"]),
  createdAt: z.string(),
  documents: z.array(z.string().min(1).max(500)).max(100),
  sections: z.array(z.object({
    title: z.string().min(1).max(200),
    items: z.array(z.object({
      text: z.string().min(1).max(20_000),
      citations: z.array(z.string().max(40)).max(50),
    })).max(200),
  })).max(20),
  citations: z.array(z.object({
    label: z.string().max(40),
    documentName: z.string().min(1).max(500),
    page: z.number().int().positive().nullable().optional(),
    excerpt: z.string().min(1).max(20_000),
  })).max(300),
  disclaimer: z.string().min(1).max(10_000),
});

export async function POST(request: Request) {
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The evidence brief could not be prepared for PDF export." }, { status: 400 });
  }

  try {
    const bytes = await createAetherisReportPdf(parsed.data);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="aetheris-evidence-brief.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Aetheris PDF] Report export failed", error);
    return NextResponse.json({ error: "Aetheris could not create the PDF. Please try again." }, { status: 500 });
  }
}
