import type { DocumentPage, SearchChunk } from "@/lib/types";

const DEFAULT_CHUNK_SIZE = 1_200;
const DEFAULT_CHUNK_OVERLAP = 180;
const CONTEXT_SIZE = 320;

export function sanitizeText(text: string) {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim());
  const normalized: string[] = [];

  for (const line of lines) {
    if (line || normalized.at(-1) !== "") normalized.push(line);
  }

  return normalized.join("\n").trim();
}

export interface PdfTextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  height?: number;
}

export function textItemsToStructuredText(items: PdfTextItemLike[]) {
  let output = "";
  let previousY: number | null = null;
  let previousHeight = 0;
  let breakBeforeNext = false;

  for (const item of items) {
    const value = item.str.replace(/\s+/g, " ").trim();
    const y = item.transform?.[5];
    const height = Math.abs(item.height ?? item.transform?.[3] ?? previousHeight ?? 0);

    if (value) {
      const verticalShift = previousY !== null && y !== undefined
        ? Math.abs(y - previousY)
        : 0;
      const lineThreshold = Math.max(2, Math.min(8, Math.max(height, previousHeight) * 0.55));
      const blockThreshold = Math.max(10, Math.max(height, previousHeight) * 1.55);
      const separator = output
        ? breakBeforeNext || verticalShift > lineThreshold
          ? verticalShift > blockThreshold ? "\n\n" : "\n"
          : needsLeadingSpace(value) ? " " : ""
        : "";
      output += `${separator}${value}`;
    }

    breakBeforeNext = Boolean(item.hasEOL);
    if (y !== undefined) previousY = y;
    if (height > 0) previousHeight = height;
  }

  return sanitizeText(output);
}

function needsLeadingSpace(value: string) {
  return !/^[,.;:!?%)\]}]/.test(value);
}

export function createDocumentPages(pages: Array<{ number: number; text: string }>) {
  let globalOffset = 0;

  return pages.map<DocumentPage>((page, index) => {
    const text = sanitizeText(page.text);
    const startOffset = globalOffset;
    const endOffset = startOffset + text.length;
    globalOffset = endOffset + (index < pages.length - 1 ? 2 : 0);

    return {
      number: page.number || index + 1,
      text,
      startOffset,
      endOffset,
    };
  });
}

export function chunkDocument(
  document: { id: string; name: string; pages: DocumentPage[]; text: string },
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP,
) {
  const chunks: SearchChunk[] = [];
  const pages = document.pages.length > 0
    ? document.pages
    : createDocumentPages([{ number: 1, text: document.text }]);

  for (const page of pages) {
    if (!page.text) {
      continue;
    }

    let start = 0;
    while (start < page.text.length) {
      const roughEnd = Math.min(page.text.length, start + chunkSize);
      const end = findSentenceBoundary(page.text, roughEnd, start);
      const contentStart = skipWhitespaceForward(page.text, start, end);
      const contentEnd = skipWhitespaceBackward(page.text, end, contentStart);
      const text = page.text.slice(contentStart, contentEnd);

      if (text) {
        chunks.push({
          id: `${document.id}:p${page.number}:${contentStart}-${contentEnd}`,
          documentId: document.id,
          documentName: document.name,
          page: page.number,
          text,
          score: 0,
          startOffset: contentStart,
          endOffset: contentEnd,
          contextBefore: page.text.slice(Math.max(0, contentStart - CONTEXT_SIZE), contentStart),
          contextAfter: page.text.slice(contentEnd, Math.min(page.text.length, contentEnd + CONTEXT_SIZE)),
          matchedTerms: [],
          lexicalScore: 0,
          similarityScore: null,
          rank: null,
          retrievalMethod: "lexical",
        });
      }

      if (end >= page.text.length) {
        break;
      }

      start = findOverlappingSentenceStart(page.text, start, end, overlap);
    }
  }

  return chunks;
}

function findSentenceBoundary(text: string, roughEnd: number, start: number) {
  if (roughEnd >= text.length) {
    return text.length;
  }

  const minimumEnd = Math.max(start + 1, start + Math.floor((roughEnd - start) * 0.58));
  const backward = sentenceEndOffsets(text, minimumEnd, roughEnd).at(-1);
  if (backward !== undefined) return backward;

  const forwardLimit = Math.min(text.length, roughEnd + Math.max(320, roughEnd - start));
  const forward = sentenceEndOffsets(text, roughEnd, forwardLimit)[0];
  if (forward !== undefined) return forward;

  // A long unpunctuated source block is safer as one oversized passage than
  // as several fragments that could be mistaken for complete findings.
  return text.length;
}

function findOverlappingSentenceStart(
  text: string,
  previousStart: number,
  end: number,
  overlap: number,
) {
  const desired = Math.max(previousStart + 1, end - overlap);
  const sentenceEnds = sentenceEndOffsets(text, previousStart, desired);
  const previousSentenceEnd = sentenceEnds.at(-1);
  if (previousSentenceEnd === undefined) return end;
  const nextStart = skipWhitespaceForward(text, previousSentenceEnd, end);
  return nextStart > previousStart && nextStart < end ? nextStart : end;
}

function sentenceEndOffsets(text: string, from: number, to: number) {
  const offsets: number[] = [];
  const segment = text.slice(from, to);
  const pattern = /[.!?](?:["')\]]*)?(?=\s|$)/g;
  for (const match of segment.matchAll(pattern)) {
    const offset = from + (match.index ?? 0) + match[0].length;
    if (!isAbbreviationBoundary(text, offset)) offsets.push(offset);
  }
  return offsets;
}

function isAbbreviationBoundary(text: string, offset: number) {
  const prefix = text.slice(Math.max(0, offset - 8), offset).toLowerCase();
  return /\b(?:dr|mr|mrs|ms|prof|fig|eq|no|vs|e\.g|i\.e)\.$/.test(prefix);
}

function skipWhitespaceForward(text: string, start: number, end: number) {
  let offset = start;
  while (offset < end && /\s/.test(text[offset])) offset += 1;
  return offset;
}

function skipWhitespaceBackward(text: string, end: number, start: number) {
  let offset = end;
  while (offset > start && /\s/.test(text[offset - 1])) offset -= 1;
  return offset;
}
