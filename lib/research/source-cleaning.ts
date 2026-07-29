import type { SearchChunk } from "@/lib/types";

const PAGE_MARKER = /^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+|^page\s*[:#-]?\s*\d+$/i;
const RECORD_METADATA = /^(?:(?:patient|subject)(?:\s*(?:name|id|identifier|number))?|mrn|medical record number|dob|date of birth|record id|encounter id|accession number|case number|document id|report id|file name|filename|version|author|prepared by|reviewed by|provider|facility|department)\s*[:#-]/i;
const DATE_METADATA = /^(?:document|report|generated|printed|created|uploaded|exported)\s+(?:date|on|at)\s*[:#-]?/i;
const SYNTHETIC_NOTICE = /^(?:aetheris\s+)?(?:(?:synthetic|fictional|mock|sample)(?:\s+test)?|test(?:ing)?)\s+(?:document|record|case|data|notice)|^testing notice|not for (?:clinical|diagnostic) use|for demonstration purposes only|generated (?:by|for) (?:an? )?(?:ai|test|demonstration)|all (?:names|patients|persons) (?:are|in this document are) fictitious/i;
const LEGAL_FOOTER = /^(?:confidential|privileged|copyright|©|all rights reserved|research use only|do not distribute)\b/i;
const SECTION_HEADING = /^(?:abstract|assessment|assessment and plan|background|clinical history|conclusion|discussion|diagnosis|findings|history|history of present illness|impression|laboratory results?|medications?|methods?|plan|recommendations?|references?|results?|summary|treatment plan)$/i;
const CLINICAL_CONTENT = /\b(?:diagnos|disease|syndrome|symptom|risk|treatment|therapy|medication|dose|laborator|imaging|biopsy|culture|positive|negative|elevated|decreased|increased|improved|worsened|recommend|should|may|mg|mcg|g\/dL|ng\/mL|mmHg|bpm|%|\d+(?:\.\d+)?)\b/i;

export function cleanSearchChunks(chunks: SearchChunk[]) {
  const recurringFurniture = recurringPageFurniture(chunks);

  return chunks.flatMap((chunk) => {
    const text = cleanSourcePassage(chunk.text, recurringFurniture);
    if (!text) return [];

    return [{
      ...chunk,
      text,
      contextBefore: cleanSourcePassage(chunk.contextBefore, recurringFurniture),
      contextAfter: cleanSourcePassage(chunk.contextAfter, recurringFurniture),
    }];
  });
}

export function cleanSourcePassage(text: string, recurringFurniture = new Set<string>()) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .flatMap((line) => cleanLine(line, recurringFurniture))
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isSourceNoise(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (
    PAGE_MARKER.test(text) ||
    RECORD_METADATA.test(text) ||
    DATE_METADATA.test(text) ||
    SYNTHETIC_NOTICE.test(text) ||
    LEGAL_FOOTER.test(text) ||
    SECTION_HEADING.test(text)
  ) {
    return true;
  }

  const words = text.split(/\s+/);
  const uppercase = words.filter((word) => /[A-Z]/.test(word) && word === word.toUpperCase()).length;
  return words.length <= 10 && uppercase / Math.max(1, words.length) >= 0.8 && !CLINICAL_CONTENT.test(text);
}

function cleanLine(line: string, recurringFurniture: Set<string>) {
  const value = line.replace(/[\t ]+/g, " ").trim();
  if (!value) return [];
  const normalized = normalizeFurniture(value);
  if (recurringFurniture.has(normalized) || isSourceNoise(value)) return [];

  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => !isSourceNoise(sentence));
}

function recurringPageFurniture(chunks: SearchChunk[]) {
  const occurrences = new Map<string, Set<string>>();
  const display = new Map<string, string>();

  for (const chunk of chunks) {
    const pageKey = `${chunk.documentId}:${chunk.page ?? "unknown"}`;
    for (const line of chunk.text.replace(/\r\n?/g, "\n").split(/\n+/)) {
      const value = line.replace(/\s+/g, " ").trim();
      if (!looksLikePageFurniture(value)) continue;
      const normalized = normalizeFurniture(value);
      if (!normalized) continue;
      display.set(normalized, value);
      const pages = occurrences.get(normalized) ?? new Set<string>();
      pages.add(pageKey);
      occurrences.set(normalized, pages);
    }
  }

  return new Set(
    Array.from(occurrences.entries())
      .filter(([normalized, pages]) =>
        pages.size >= 2 && looksLikePageFurniture(display.get(normalized) ?? normalized),
      )
      .map(([normalized]) => normalized),
  );
}

function looksLikePageFurniture(value: string) {
  if (!value || value.length > 140) return false;
  return isSourceNoise(value) ||
    /^(?:clinical|medical|research|consultation|progress|follow-up|discharge|laboratory|radiology)(?:\s+[a-z-]+){0,3}\s+(?:note|report|record|summary)$/i.test(value);
}

function normalizeFurniture(value: string) {
  return value
    .toLowerCase()
    .replace(/\bpage\s+\d+(?:\s+of\s+\d+)?\b/g, "page")
    .replace(/\b\d+\b/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
