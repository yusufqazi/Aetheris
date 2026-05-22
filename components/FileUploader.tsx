"use client";

import { FileText, UploadCloud, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import type { UploadedDocument } from "@/lib/types";

export function FileUploader({
  documents,
  onDocumentsChange,
}: {
  documents: UploadedDocument[];
  onDocumentsChange: (documents: UploadedDocument[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const formData = new FormData();
      Array.from(fileList).forEach((file) => formData.append("files", file));

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setError("We could not parse one or more PDFs. Please try another file.");
        return;
      }

      const data = (await response.json()) as { documents: UploadedDocument[] };
      onDocumentsChange([...documents, ...data.documents]);
    });
  }

  return (
    <div className="space-y-4">
      <div
        className="glass-panel grid-pattern rounded-[2rem] border border-dashed p-8 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <UploadCloud className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-xl font-semibold">Upload clinical or pharma PDFs</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          Drag documents here or browse from your device. Aetheris extracts plain text, chunks
          the evidence, and routes the most relevant passages to each specialized agent.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-6 inline-flex rounded-full bg-[var(--navy)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0f2740]"
        >
          {isPending ? "Processing PDFs..." : "Select PDFs"}
        </button>
        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {documents.map((document) => (
          <div
            key={document.id}
            className="glass-panel rounded-3xl p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--panel-muted)] text-[var(--navy)]">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">{document.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {document.pageCount} pages · {(document.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onDocumentsChange(documents.filter((item) => item.id !== document.id))
                }
                className="rounded-full p-2 text-[var(--text-muted)] transition hover:bg-[var(--panel-muted)]"
                aria-label={`Remove ${document.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
              {document.preview || "Preview unavailable."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
