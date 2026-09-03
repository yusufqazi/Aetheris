import { NextResponse } from "next/server";

import {
  describePdfExtractionError,
  extractPdfDocument,
  PdfExtractionError,
  type PdfExtractionFailure,
} from "@/lib/pdf";
import { createEventFactory, encodeResearchEvent } from "@/lib/research/events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const sessionId = String(formData.get("sessionId") || crypto.randomUUID());
    const startingSequence = Number(formData.get("startingSequence") || 0);

    if (files.length === 0) {
      return NextResponse.json({ error: "No PDF files were uploaded." }, { status: 400 });
    }

    const invalid = files.find(
      (file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"),
    );
    if (invalid) {
      return NextResponse.json(
        { error: `${invalid.name} is not a supported PDF document.` },
        { status: 415 },
      );
    }

    const encoder = new TextEncoder();
    const createEvent = createEventFactory(
      sessionId,
      Number.isFinite(startingSequence) ? Math.max(0, startingSequence) : 0,
    );
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (input: Parameters<typeof createEvent>[0]) => {
          controller.enqueue(encoder.encode(encodeResearchEvent(createEvent(input))));
        };

        try {
          send({
            type: "stage.started",
            phase: "uploading",
            stageId: "uploading",
            message: `${files.length} source document${files.length === 1 ? "" : "s"} received`,
            data: { progress: 15, detail: "Upload transfer complete; validating files" },
          });
          send({
            type: "stage.completed",
            phase: "processing",
            stageId: "uploading",
            message: "Document upload completed",
            data: { progress: 100, metrics: { documentCount: files.length } },
          });
          send({
            type: "stage.started",
            phase: "processing",
            stageId: "parsing",
            message: "Extracting ordered text from PDF pages",
            data: { progress: 5 },
          });

          const documents = [];
          const failedFiles: Array<{ name: string } & PdfExtractionFailure> = [];
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            try {
              const document = await extractPdfDocument(file, sessionId);
              documents.push(document);
            } catch (error) {
              const failure = describePdfExtractionError(error, file.name);
              failedFiles.push({ name: file.name, ...failure });
              send({
                type: "timeline.note",
                phase: "processing",
                message: `${file.name} could not be prepared; remaining documents will continue`,
                data: {
                  error: {
                    code: failure.code,
                    title: `${file.name} could not be prepared`,
                    message: failure.message,
                    stageId: "parsing",
                    retryable: true,
                    details: failure.details,
                  },
                },
              });
            }
            send({
              type: "stage.progress",
              phase: "processing",
              stageId: "parsing",
              message: failedFiles.some((item) => item.name === file.name)
                ? `${file.name} skipped after extraction failed`
                : `${file.name} parsed`,
              data: {
                progress: Math.round(((index + 1) / files.length) * 100),
                detail: `${documents.reduce((sum, item) => sum + item.pageCount, 0)} pages preserved with exact page boundaries`,
                metrics: {
                  pageCount: documents.reduce((sum, item) => sum + item.pageCount, 0),
                },
              },
            });
          }

          if (documents.length === 0) {
            const firstFailure = failedFiles[0];
            throw new PdfExtractionError(firstFailure ?? {
              code: "PDF_EXTRACTION_FAILED",
              message: "No readable PDF text was extracted.",
              details: "The PDF parser did not return a usable document.",
            });
          }

          const pageCount = documents.reduce((sum, document) => sum + document.pageCount, 0);
          send({
            type: "stage.completed",
            phase: "processing",
            stageId: "parsing",
            message: failedFiles.length > 0
              ? `${documents.length} documents prepared; ${failedFiles.length} could not be parsed`
              : `${pageCount} pages parsed across ${documents.length} documents`,
            data: {
              progress: 100,
              status: failedFiles.length > 0 ? "partial" : "completed",
              metrics: { documentCount: documents.length, pageCount },
            },
          });
          send({
            type: "stage.started",
            phase: "processing",
            stageId: "normalizing",
            message: "Normalizing extracted text while preserving source locations",
            data: { progress: 40 },
          });
          send({
            type: "documents.ready",
            phase: "processing",
            stageId: "normalizing",
            message: "Source documents are ready for research",
            data: {
              documents,
              metrics: { documentCount: documents.length, pageCount },
            },
          });
          send({
            type: "stage.completed",
            phase: "idle",
            stageId: "normalizing",
            message: "Source normalization completed",
            data: { progress: 100, metrics: { documentCount: documents.length, pageCount } },
          });
          send({
            type: "timeline.note",
            phase: "idle",
            message: "Research sources ready; define the objective and launch analysis",
            data: { metrics: { documentCount: documents.length, pageCount } },
          });
          controller.close();
        } catch (error) {
          const failure = describePdfExtractionError(error);
          const researchError = {
            code: failure.code,
            title: "A document could not be prepared",
            message: failure.message,
            stageId: "parsing" as const,
            retryable: true,
            details: failure.details,
          };
          send({
            type: "stage.failed",
            phase: "error",
            stageId: "parsing",
            message: researchError.message,
            data: { error: researchError },
          });
          send({
            type: "session.failed",
            phase: "error",
            message: researchError.message,
            data: { error: researchError },
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to accept the uploaded PDFs.",
        details: error instanceof Error ? error.message : "Unknown upload error",
      },
      { status: 500 },
    );
  }
}
