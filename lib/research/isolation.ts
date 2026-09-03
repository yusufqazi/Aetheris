import type { UploadedDocument } from "@/lib/types";

export class ResearchIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchIsolationError";
  }
}

export function bindUnownedDocumentsToSession(
  sessionId: string,
  documents: UploadedDocument[],
) {
  return documents.map((document) =>
    document.sessionId ? document : { ...document, sessionId },
  );
}

export function assertDocumentsBelongToSession(
  sessionId: string,
  documents: UploadedDocument[],
) {
  const foreignDocuments = documents.filter(
    (document) => document.sessionId !== sessionId,
  );

  if (foreignDocuments.length === 0) {
    return;
  }

  throw new ResearchIsolationError(
    `Prepared documents do not belong to analysis ${sessionId}. Start a new analysis and upload the documents again.`,
  );
}
