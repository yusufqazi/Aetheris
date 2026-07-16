import type { DocumentPage, SearchChunk } from "@/lib/types";

const DEFAULT_CHUNK_SIZE = 1_200;
const DEFAULT_CHUNK_OVERLAP = 180;
const CONTEXT_SIZE = 320;

export function sanitizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
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
      const text = page.text.slice(start, end).trim();

      if (text) {
        chunks.push({
          id: `${document.id}:p${page.number}:${start}-${end}`,
          documentId: document.id,
          documentName: document.name,
          page: page.number,
          text,
          score: 0,
          startOffset: start,
          endOffset: end,
          contextBefore: page.text.slice(Math.max(0, start - CONTEXT_SIZE), start),
          contextAfter: page.text.slice(end, Math.min(page.text.length, end + CONTEXT_SIZE)),
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

      start = Math.max(start + 1, end - overlap);
    }
  }

  return chunks;
}

function findSentenceBoundary(text: string, roughEnd: number, start: number) {
  if (roughEnd >= text.length) {
    return text.length;
  }

  const searchStart = Math.max(start + Math.floor((roughEnd - start) * 0.72), start + 1);
  const tail = text.slice(searchStart, roughEnd + 120);
  const match = tail.match(/[.!?](?:\s|$)/);

  return match?.index === undefined
    ? roughEnd
    : Math.min(text.length, searchStart + match.index + 1);
}
