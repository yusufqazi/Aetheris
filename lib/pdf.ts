import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { nanoid } from "nanoid";

import { createDocumentPages, textItemsToStructuredText } from "@/lib/pdf.shared";
import type { UploadedDocument } from "@/lib/types";

const MIN_EXTRACTABLE_TEXT = 24;
let workerInitialized = false;
let workerConfigurationError: unknown = null;
let workerLoadingError: unknown = null;
type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;

function initializePdfWorker() {
  if (workerInitialized) {
    return;
  }
  workerInitialized = true;

  try {
    const nodeRequire = createRequire(import.meta.url);
    const workerPath = nodeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const workerSrc = pathToFileURL(workerPath).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    // Node intentionally uses PDF.js's in-process worker fallback. Loading the
    // resolved ESM module through createRequire keeps Next from rewriting it.
    const workerModuleSpecifier = ["pdfjs-dist", "legacy", "build", "pdf.worker.mjs"].join("/");
    const workerModule = nodeRequire.call(undefined, workerModuleSpecifier);
    (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = workerModule;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "MODULE_NOT_FOUND") {
      workerConfigurationError = error;
      console.error("[Aetheris PDF] Failed to resolve the PDF.js worker", error);
    } else {
      workerLoadingError = error;
      console.error("[Aetheris PDF] Failed to load the resolved PDF.js worker", error);
    }
  }
}

export interface PdfExtractionFailure {
  code:
    | "PDF_PARSER_INITIALIZATION"
    | "PDF_WORKER_LOAD_FAILED"
    | "PDF_NO_TEXT"
    | "PDF_INSUFFICIENT_TEXT"
    | "PDF_PASSWORD_REQUIRED"
    | "PDF_INVALID"
    | "PDF_FORMAT_ERROR"
    | "PDF_EXTRACTION_FAILED";
  message: string;
  details: string;
}

export class PdfExtractionError extends Error {
  readonly failure: PdfExtractionFailure;

  constructor(failure: PdfExtractionFailure) {
    super(failure.message);
    this.name = "PdfExtractionError";
    this.failure = failure;
  }
}

export async function extractPdfDocument(
  file: File,
  sessionId?: string,
): Promise<UploadedDocument> {
  initializePdfWorker();

  if (workerConfigurationError) {
    throw new PdfExtractionError({
      code: "PDF_PARSER_INITIALIZATION",
      message: "Aetheris PDF extraction is not initialized correctly on the server. The document was not blamed for this failure.",
      details: describeOriginalError(workerConfigurationError),
    });
  }

  if (workerLoadingError) {
    throw new PdfExtractionError({
      code: "PDF_WORKER_LOAD_FAILED",
      message: "Aetheris could not start its server-side PDF worker. This is a parser infrastructure problem, not a problem with the uploaded document.",
      details: describeOriginalError(workerLoadingError),
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let document: PdfDocument | null = null;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    document = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = textItemsToStructuredText(
          content.items.flatMap((item) =>
            "str" in item
              ? [{
                  str: item.str,
                  hasEOL: item.hasEOL,
                  transform: item.transform,
                  height: item.height,
                }]
              : [],
          ),
        );
        pages.push({ number: pageNumber, text });
      } finally {
        page.cleanup();
      }
    }

    const normalizedPages = createDocumentPages(pages);
    const text = normalizedPages.map((page) => page.text).join("\n\n");

    if (!text.trim()) {
      throw new PdfExtractionError({
        code: "PDF_NO_TEXT",
        message: `${file.name} appears to be scanned or image-only. Aetheris needs selectable text, so run OCR and upload the searchable PDF version.`,
        details: "The PDF opened successfully, but no selectable text was found on any page.",
      });
    }

    if (text.length < MIN_EXTRACTABLE_TEXT) {
      throw new PdfExtractionError({
        code: "PDF_INSUFFICIENT_TEXT",
        message: `${file.name} opened successfully but contains too little extractable text for a reliable research session.`,
        details: `Only ${text.length} normalized characters were extracted across ${normalizedPages.length} page${normalizedPages.length === 1 ? "" : "s"}.`,
      });
    }

    return {
      id: nanoid(),
      sessionId,
      name: file.name,
      size: file.size,
      pageCount: normalizedPages.length,
      uploadedAt: new Date().toISOString(),
      preview: text.slice(0, 280),
      text,
      pages: normalizedPages,
    };
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw error;
    }

    console.error(`[Aetheris PDF] Failed to extract ${file.name}`, error);
    throw new PdfExtractionError(describePdfExtractionError(error, file.name));
  } finally {
    if (document) {
      await document.destroy().catch((error) => {
        console.error(`[Aetheris PDF] Failed to release parser resources for ${file.name}`, error);
      });
    }
  }
}

export function describePdfExtractionError(error: unknown, fileName = "This PDF"): PdfExtractionFailure {
  if (error instanceof PdfExtractionError) {
    return error.failure;
  }

  const name = error instanceof Error ? error.name : "UnknownError";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const normalized = `${name} ${rawMessage}`.toLowerCase();
  const details = rawMessage || "The PDF parser returned an unknown error.";

  if (normalized.includes("fake worker") || normalized.includes("worker")) {
    return {
      code: "PDF_WORKER_LOAD_FAILED",
      message: "Aetheris could not start its server-side PDF worker. This is a parser infrastructure problem, not a problem with the uploaded document.",
      details,
    };
  }

  if (normalized.includes("password") || normalized.includes("encrypted")) {
    return {
      code: "PDF_PASSWORD_REQUIRED",
      message: `${fileName} is password-protected or encrypted. Remove the password and upload an unlocked PDF.`,
      details,
    };
  }

  if (normalized.includes("invalidpdf") || normalized.includes("invalid pdf") || normalized.includes("invalid header")) {
    return {
      code: "PDF_INVALID",
      message: `${fileName} is not a readable PDF file. It may be incomplete, damaged, or exported with the wrong file extension.`,
      details,
    };
  }

  if (normalized.includes("formaterror") || normalized.includes("format error")) {
    return {
      code: "PDF_FORMAT_ERROR",
      message: `${fileName} has a PDF structure that Aetheris could not read. Try exporting it again as a standard PDF.`,
      details,
    };
  }

  return {
    code: "PDF_EXTRACTION_FAILED",
    message: `${fileName} could not be read. Try opening it locally and exporting a fresh, searchable PDF copy.`,
    details,
  };
}

function describeOriginalError(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
