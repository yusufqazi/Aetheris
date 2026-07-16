"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, FileText, LoaderCircle, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";

import { readResearchEventStream } from "@/lib/research/events";
import type { ResearchEvent, UploadedDocument } from "@/lib/types";

export function FileUploader({
  sessionId,
  documents,
  onDocumentsChange,
  onEvent,
}: {
  sessionId: string;
  documents: UploadedDocument[];
  onDocumentsChange: (documents: UploadedDocument[]) => void;
  onEvent: (event: ResearchEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sequenceRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [progressMessage, setProgressMessage] = useState("Waiting for clinical documents");
  const [progress, setProgress] = useState(0);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length || isProcessing) {
      return;
    }

    setError(null);
    setErrorDetails(null);
    setIsProcessing(true);
    setProgress(4);
    setProgressMessage("Uploading source documents");

    try {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("startingSequence", String(sequenceRef.current));
      Array.from(fileList).forEach((file) => formData.append("files", file));
      const response = await fetch("/api/upload", { method: "POST", body: formData });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Aetheris could not prepare the selected PDFs.");
      }

      await readResearchEventStream(response, (event) => {
        sequenceRef.current = Math.max(sequenceRef.current, event.sequence);
        onEvent(event);
        setProgressMessage(event.message);
        if (event.type === "stage.started" || event.type === "stage.progress" || event.type === "stage.completed") {
          setProgress((current) => event.data?.progress ?? current);
        }
        if (event.type === "documents.ready") {
          onDocumentsChange([...documents, ...event.data.documents]);
          setProgress(100);
        }
        if (event.type === "session.failed") {
          setError(event.data?.error?.message ?? "Document preparation failed.");
          setErrorDetails(event.data?.error?.details ?? null);
        }
        if (event.type === "timeline.note" && event.data?.error) {
          setError(event.data.error.message);
          setErrorDetails(event.data.error.details ?? null);
        }
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Document preparation failed.");
      setErrorDetails(uploadError instanceof Error ? uploadError.message : null);
      setProgress(0);
      setProgressMessage("Upload interrupted");
    } finally {
      setIsProcessing(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div>
      <div
        className={`relative overflow-hidden rounded-[1.5rem] border transition duration-300 ${
          isDragging
            ? "border-sky-300/40 bg-sky-400/[0.07]"
            : "border-white/[0.09] bg-white/[0.025] hover:border-white/[0.14]"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.12),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] [background-size:30px_30px]" />
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <div className="relative flex min-h-[17rem] flex-col items-center justify-center px-6 py-10 text-center">
          <motion.div
            animate={isProcessing && !reduceMotion ? { rotate: 360 } : { rotate: 0 }}
            transition={isProcessing ? { duration: 1.8, ease: "linear", repeat: Infinity } : undefined}
            className="flex h-14 w-14 items-center justify-center rounded-[1rem] border border-sky-200/10 bg-sky-400/[0.08] text-sky-300 shadow-[0_15px_40px_rgba(37,99,235,0.16)]"
          >
            {isProcessing ? <LoaderCircle className="h-5 w-5" /> : <UploadCloud className="h-6 w-6" />}
          </motion.div>
          <h2 className="mt-5 text-xl font-medium tracking-[-0.025em] text-white">
            {isProcessing ? "Preparing source documents" : "Add clinical or pharma PDFs"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Page boundaries and surrounding context are preserved so every downstream citation can return to its exact source passage.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
            className="mt-6 inline-flex h-10 items-center rounded-full border border-white/[0.1] bg-white/[0.05] px-5 text-sm font-semibold text-slate-200 transition hover:border-sky-300/25 hover:bg-sky-400/[0.08] disabled:cursor-wait disabled:opacity-60"
          >
            {isProcessing ? "Processing…" : "Select PDFs"}
          </button>
        </div>
        <AnimatePresence>
          {isProcessing || progress > 0 ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative border-t border-white/[0.07] px-5 py-4"
            >
              <div className="flex items-center justify-between gap-4 text-[11px]">
                <span className="truncate text-slate-400">{progressMessage}</span>
                <span className="font-mono text-[9px] text-slate-600">{progress}%</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#7dd3fc)] shadow-[0_0_14px_rgba(56,189,248,0.5)]"
                  animate={{ width: `${progress}%` }}
                  transition={{ type: "spring", stiffness: 130, damping: 24 }}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {error ? (
        <div className="mt-3 rounded-[1rem] border border-amber-300/15 bg-amber-300/[0.055] px-4 py-3 text-xs leading-5 text-amber-100/75">
          <p>{error} Your existing prepared documents are unchanged.</p>
          {errorDetails ? (
            <details className="mt-2 text-amber-100/55">
              <summary className="cursor-pointer select-none text-[10px] uppercase tracking-[0.14em] text-amber-200/55">
                Technical detail
              </summary>
              <p className="mt-2 break-words font-mono text-[10px] leading-5">{errorDetails}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-white/[0.07]">
        {documents.map((document) => (
          <motion.div
            layout
            key={document.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.8rem] border border-white/[0.08] bg-white/[0.03] text-sky-400">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-300">{document.name}</p>
              <p className="mt-1 text-[10px] text-slate-600">
                {document.pageCount} pages · {(document.size / 1024).toFixed(0)} KB · exact page text ready
              </p>
            </div>
            <Check className="h-4 w-4 text-emerald-400" />
            <button
              type="button"
              onClick={() => onDocumentsChange(documents.filter((item) => item.id !== document.id))}
              className="rounded-full p-2 text-slate-700 transition hover:bg-white/[0.05] hover:text-slate-300"
              aria-label={`Remove ${document.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
