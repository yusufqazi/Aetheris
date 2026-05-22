import { PDFParse } from "pdf-parse";
import { nanoid } from "nanoid";

import type { SearchChunk, UploadedDocument } from "@/lib/types";

export async function extractPdfDocument(file: File): Promise<UploadedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();
  const cleaned = sanitizeText(parsed.text);

  return {
    id: nanoid(),
    name: file.name,
    size: file.size,
    pageCount: parsed.pages.length || estimatePages(cleaned),
    uploadedAt: new Date().toISOString(),
    preview: cleaned.slice(0, 280),
    text: cleaned,
  };
}

export function sanitizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function estimatePages(text: string) {
  return Math.max(1, Math.ceil(text.length / 2600));
}

export function chunkDocument(document: UploadedDocument, chunkSize = 1500) {
  const chunks: SearchChunk[] = [];

  for (let index = 0; index < document.text.length; index += chunkSize) {
    const text = document.text.slice(index, index + chunkSize);
    chunks.push({
      id: `${document.id}-${index}`,
      documentId: document.id,
      documentName: document.name,
      page: Math.max(1, Math.ceil(index / 2600)),
      text,
      score: 0,
    });
  }

  return chunks;
}
