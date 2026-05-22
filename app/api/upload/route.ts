import { NextResponse } from "next/server";

import { extractPdfDocument } from "@/lib/pdf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const documents = await Promise.all(files.map((file) => extractPdfDocument(file)));
    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to extract PDF text.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
