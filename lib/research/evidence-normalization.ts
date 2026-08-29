import type {
  EvidenceItem,
  NormalizedEvidenceBundle,
  NormalizedEvidenceKind,
  NormalizedEvidenceObject,
  NormalizedSectionHeading,
  NormalizedTableFact,
} from "@/lib/types";

const PATIENT_IDENTIFIER =
  /\b(?:MRN|medical record number|patient id|subject id|record id|encounter id|accession number|case number)\s*[:#-]?\s*[A-Z0-9][A-Z0-9._/-]{2,}\b/gi;
const PATIENT_NAME =
  /\b[Pp]atient(?:\s+name)?\s*[:#-]?\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}(?=\s+(?:MRN|DOB|date|study|report|region|finding)\b|[,;.]|$)/g;
const CALENDAR_DATE =
  /\b(?:(?:study|report|document|exam|service|visit|collection|scan|follow-up)\s+date\s*[:#-]?\s*)?(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/gi;
const TESTING_NOTICE =
  /\b(?:synthetic\b.{0,80}\b(?:document|report|record|case)|testing notice|for (?:testing|demonstration) purposes?|not for (?:clinical|diagnostic) use|mock clinical|sample document|all (?:names|patients|persons).{0,30}fictitious)\b/i;
const WORKFLOW_LANGUAGE =
  /\b(?:contradiction detection|conflict detection|discrepancy detection|source citations?|citation mapping|text extraction|extraction pipeline|longitudinal reasoning|chunking|embedding|retrieval pipeline|analysis pipeline)\b/i;
const DOCUMENT_PURPOSE =
  /\b(?:document purpose|this (?:document|report|record) (?:summarizes|demonstrates|tests|validates)|prepared for review|supports? aetheris testing)\b/i;
const DOCUMENT_FILE = /\b[^\s,;:()[\]]+\.(?:pdf|docx?|txt|rtf)\b/i;
const DOCUMENT_TITLE =
  /^(?:[A-Z0-9][A-Za-z0-9/&()+-]*\s+){1,10}(?:Report|Note|Consultation|Summary|Document|Record|Memorandum|Protocol|Review|Appendix|Brief)$/;
const PAGE_FURNITURE =
  /^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+|^page\s*[:#-]?\s*\d+|^(?:confidential|privileged|copyright|all rights reserved|do not distribute)\b/i;
const EVENT_METADATA =
  /^(?:consult|consultation|update|progress note|planning discussion|medication review|specimen|study|collection interval|encounter)\s*[:#-]\s*(?:(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\s*)?(?:\d{1,2}:\d{2})?\s*$/i;
const DOCUMENT_HEADER_WITH_TIMESTAMP =
  /^(?:[A-Za-z][A-Za-z0-9/&()+-]*\s+){0,8}(?:assessment|brief|consult|consultation|note|record|report|review|summary|update)\s*[—–-]\s*(?:(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\s*)?\d{1,2}:\d{2}\s*$/i;
const DYNAMIC_UNRESOLVED_SECTION =
  /^(?:unresolved|pending|missing|outstanding)\s+[a-z][a-z /-]{1,50}\s+(?:evidence|information|results?|data)$/i;
const CONTEXTUAL_SECTION =
  /^(?:[a-z][a-z /-]{1,50}\s+)?(?:assessment|consideration|course|distinction|evidence|findings?|function|plan|position|recommendation|status|strategy|tension|trend)$/i;
const KNOWN_SECTION =
  /^(?:abstract|background|methods?|results?|discussion|conclusion|program conclusion|assessment|initial assessment|assessment and plan|impression|interpretation|comparison|diagnosis|findings?|observed outcomes?|clinical course|clinical status|documentation discrepancy|safety findings?|efficacy findings?|limitations?|interpretive limitation|relevance limitation|recommendations?|treatment plan|plan|shared plan|hospitalist position|nephrology addendum|scope statement|discharge consideration|unresolved point|medication safety|laboratory results?|laboratory trend|renal trend|other results|adverse events?|follow-up|reason for consult|key distinction|presentation|testing|ed plan|discharge)$/i;
const INLINE_SECTION =
  /^(abstract|background|methods?|results?|discussion|conclusion|program conclusion|assessment|initial assessment|assessment and plan|impression|interpretation|diagnosis|findings?|observed outcomes?|clinical course|clinical status|documentation discrepancy|safety findings?|efficacy findings?|limitations?|interpretive limitation|relevance limitation|recommendations?|treatment plan|plan|shared plan|hospitalist position|nephrology addendum|scope statement|discharge consideration|unresolved point|medication safety|laboratory results?|laboratory trend|renal trend|other results|adverse events?|follow-up)\s*[:#-]\s+/i;
const FINITE_PREDICATE =
  /\b(?:is|are|was|were|has|have|had|shows?|showed|reports?|reported|demonstrates?|demonstrated|supports?|supported|indicates?|indicated|confirms?|confirmed|identifies?|identified|raises?|raised|requires?|required|recommends?|recommended|improves?|improved|increases?|increased|decreases?|decreased|reduces?|reduced|remains?|remained|persists?|persisted|occurred|observed|classified|excluded|received|developed|may|might|can|could|should|would|will)\b/i;
const CLINICAL_SIGNAL =
  /\b(?:diagnos|disease|syndrome|symptom|treatment|therapy|regimen|medication|dose|safety|efficacy|adverse|risk|fall|pain|laborator|biomarker|imaging|biopsy|culture|positive|negative|elevated|decreased|increased|improved|response|remission|mortality|survival|limitation|uncertain|recommend|should|mg|mcg|g\/dL|ng\/mL|mmHg|bpm|%|\d+(?:\.\d+)?)\b/i;
const UNCERTAINTY_SIGNAL =
  /\b(?:uncertain|unclear|unknown|cannot determine|does not yet contain|not yet available|not established|not confirmed|insufficient|could not determine|remains unresolved|not excluded|pending|unresolved evidence)\b/i;
const LIMITATION_SIGNAL =
  /\b(?:limitation|limited by|not represented|excluded|incomplete|missing evidence|additional study data|further study|small sample|short follow-up|no randomized comparator|single[- ]center)\b/i;
const RECOMMENDATION_SIGNAL =
  /\b(?:recommend(?:s|ed|ation)?|request(?:s|ed)?|prefer(?:s|red)?|favor(?:s|ed)?|should|must|consider|prioriti[sz]e|initiate|begin|start|continue|avoid|defer|delay|hold|withhold|stop|monitor|repeat|obtain|confirm|protocol amendment)\b|^(?:do not|reduce|decrease|increase|intensify|escalate|de-escalate|taper|target)\b|\b(?:discharge|transfer|treatment|therapy|procedure)\b.{0,60}\b(?:can|could|may)\s+be\s+(?:considered|reasonable|appropriate)\b/i;
const DIAGNOSIS_SIGNAL =
  /\b(?:diagnos(?:is|ed)|most likely cause|leading cause|consistent with|supports?.{0,60}(?:syndrome|disease|infection|condition))\b/i;
const NUMERIC_VALUE =
  /(?:[<>]=?\s*)?-?\d+(?:\.\d+)?\s*(?:%|mg(?:\/kg)?|mcg|ug|g\/dL|mg\/dL|ng\/mL|pg\/mL|mmol\/L|mEq\/L|U\/L|IU\/L|mg\/L|mmHg|bpm|ms|mL\/min|cm|mm|points?|weeks?|months?|years?|participants?|patients?|events?)?/gi;
const TABLE_HEADER_TERM =
  /^(?:outcome|measure|metric|observed result|result|value|status|group|population|frequency|rate|change|finding|observation|event|category|timepoint)$/i;
const FLAT_TABLE_START =
  /\b(?:average|mean|median|at least|at most|treatment|therapy|discontinuation|falls?|emergency visits?|hospitali[sz]ations?|mortality|survival|response|remission|adverse events?|serious adverse events?|pain|symptoms?|laboratory|biomarker|hemoglobin|creatinine|blood pressure|heart rate|documentation discrepancy)\b/gi;

export function normalizeEvidenceItems(items: EvidenceItem[]): NormalizedEvidenceBundle {
  const objects: NormalizedEvidenceObject[] = [];
  const sections: NormalizedSectionHeading[] = [];
  const repeatedFurniture = findRepeatedPageFurniture(items);

  for (const item of items) {
    normalizeEvidenceItem(item, objects, sections, repeatedFurniture);
  }

  return {
    objects: deduplicateObjects(objects),
    sections: deduplicateSections(sections),
  };
}

export function normalizedEvidenceForModel(bundle: NormalizedEvidenceBundle) {
  return {
    evidence: bundle.objects.map((item) => ({
      id: item.id,
      evidenceId: item.evidenceId,
      source: {
        documentId: item.documentId,
        page: item.page ?? null,
      },
      sectionId: item.sectionId ?? null,
      kind: item.kind,
      statement: item.statement,
      numericValues: item.numericValues,
      table: item.table ?? null,
    })),
    sections: bundle.sections.map((section) => ({
      id: section.id,
      source: {
        documentId: section.documentId,
        page: section.page ?? null,
      },
      heading: section.heading,
    })),
  };
}

export function containsNonEvidenceText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return matches(PATIENT_IDENTIFIER, normalized) ||
    matches(PATIENT_NAME, normalized) ||
    matches(CALENDAR_DATE, normalized) ||
    matches(TESTING_NOTICE, normalized) ||
    matches(WORKFLOW_LANGUAGE, normalized) ||
    matches(DOCUMENT_PURPOSE, normalized) ||
    matches(DOCUMENT_FILE, normalized) ||
    matches(DOCUMENT_TITLE, normalized) ||
    matches(PAGE_FURNITURE, normalized);
}

function normalizeEvidenceItem(
  item: EvidenceItem,
  objects: NormalizedEvidenceObject[],
  sections: NormalizedSectionHeading[],
  repeatedFurniture: Set<string>,
) {
  const sourceLines = item.excerpt
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);
  const lines = reflowWrappedEvidenceLines(sourceLines, item, repeatedFurniture);
  let currentSectionId: string | null = null;
  let currentSectionHeading = "";
  let tableHeaders: string[] | null = null;
  let objectIndex = 0;
  let sectionIndex = 0;

  const addSection = (heading: string) => {
    const normalized = normalizeHeading(heading);
    if (!normalized || isDocumentTitle(normalized)) return;
    const id = `section:${item.id}:${sectionIndex++}`;
    sections.push({
      id,
      evidenceId: item.id,
      documentId: item.documentId,
      page: item.page,
      heading: normalized,
    });
    currentSectionId = id;
    currentSectionHeading = normalized;
  };

  const addObject = (
    statement: string,
    table: NormalizedTableFact | null = null,
    sourceExcerpt = statement,
  ) => {
    const normalized = normalizeClinicalStatement(statement);
    if (!normalized || containsNonEvidenceText(normalized)) return;
    const sourceAnchor = sourceExcerpt.trim();
    const localOffset = item.excerpt.indexOf(sourceAnchor);
    const sourceStartOffset = localOffset >= 0 && item.startOffset != null
      ? item.startOffset + localOffset
      : item.startOffset;
    objects.push({
      id: `normalized:${item.id}:${objectIndex++}`,
      evidenceId: item.id,
      chunkId: item.chunkId,
      documentId: item.documentId,
      page: item.page,
      sectionId: currentSectionId,
      kind: classifyNormalizedKind(normalized, Boolean(table), currentSectionHeading),
      statement: normalized,
      numericValues: extractNumericValues(normalized),
      table,
      sourceExcerpt: sourceAnchor,
      sourceStartOffset,
      sourceEndOffset: sourceStartOffset != null
        ? sourceStartOffset + sourceAnchor.length
        : item.endOffset,
    });
  };

  for (const rawLine of lines) {
    const line = removeInlineMetadata(rawLine);
    if (!line || isStructuralLine(line, item, repeatedFurniture)) continue;
    if (isDiscardedLine(line) && splitSentences(line).every(isDiscardedLine)) continue;

    const inlineSection = line.match(INLINE_SECTION);
    let content = line;
    if (inlineSection) {
      addSection(inlineSection[1]);
      content = line.slice(inlineSection[0].length).trim();
      if (!content) continue;
    } else if (isSectionHeading(line)) {
      addSection(line);
      continue;
    }

    const embeddedTableIndex = content.search(
      /\b(?:observed outcomes?|outcomes?)\s+(?:outcome|measure|metric)\s+(?:observed result|result|value)\b/i,
    );
    if (embeddedTableIndex > 0) {
      const narrative = content.slice(0, embeddedTableIndex).trim();
      for (const sentence of splitSentences(narrative)) {
        if (!isDiscardedLine(sentence)) addObject(sentence);
      }
      for (const table of parseFlattenedTable(content.slice(embeddedTableIndex))) {
        addObject(tableStatement(table), table, tableSourceAnchor(table));
      }
      continue;
    }

    const cells = splitTableCells(content);
    if (cells.length >= 2) {
      if (cells.every((cell) => !extractNumericValues(cell).length) && cells.some((cell) => TABLE_HEADER_TERM.test(cell))) {
        tableHeaders = cells;
        continue;
      }
      if (cells.some((cell) => extractNumericValues(cell).length)) {
        const table = tableFactFromCells(cells, tableHeaders);
        addObject(tableStatement(table), table, content);
        continue;
      }
    }
    tableHeaders = null;

    if (looksLikeFlattenedTable(content)) {
      for (const table of parseFlattenedTable(content)) {
        addObject(tableStatement(table), table, tableSourceAnchor(table));
      }
      continue;
    }

    for (const sentence of splitSentences(content)) {
      if (isDiscardedLine(sentence)) continue;
      addObject(sentence);
    }
  }
}

function removeInlineMetadata(value: string) {
  return value
    .replace(PATIENT_NAME, "")
    .replace(PATIENT_IDENTIFIER, "")
    .replace(CALENDAR_DATE, "")
    .replace(DOCUMENT_FILE, "")
    .replace(/\b(?:DOB|date of birth)\s*[:#-]?\s*[^,;]{1,30}/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
    .trim();
}

function isDiscardedLine(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (
    TESTING_NOTICE.test(text) ||
    WORKFLOW_LANGUAGE.test(text) ||
    DOCUMENT_PURPOSE.test(text) ||
    PAGE_FURNITURE.test(text) ||
    EVENT_METADATA.test(text) ||
    DOCUMENT_HEADER_WITH_TIMESTAMP.test(text) ||
    isDocumentTitle(text)
  ) {
    return true;
  }
  return /^(?:patient|mrn|medical record number|document title|file name|filename|prepared by|reviewed by|author|facility|department)\s*[:#-]/i.test(text);
}

function reflowWrappedEvidenceLines(
  lines: string[],
  item: EvidenceItem,
  repeatedFurniture: Set<string>,
) {
  const output: string[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) output.push(buffer.replace(/\s+/g, " ").trim());
    buffer = "";
  };

  for (const line of lines) {
    const startsBullet = /^[•*-]\s*/.test(line);
    const startsTableRow = line.includes("|") || line.includes("\t");
    const structural = isStructuralLine(line, item, repeatedFurniture) ||
      isSectionHeading(line) ||
      isDiscardedLine(line);
    if (structural) {
      flush();
      output.push(line);
      continue;
    }
    if (startsBullet || startsTableRow || !buffer || /[.!?)]$/.test(buffer)) {
      flush();
      buffer = line;
      continue;
    }
    buffer = `${buffer} ${line}`;
  }
  flush();
  return output;
}

function isStructuralLine(
  value: string,
  item: EvidenceItem,
  repeatedFurniture: Set<string>,
) {
  const text = value.replace(/\s+/g, " ").trim();
  if (
    matches(PAGE_FURNITURE, text) ||
    isDocumentTitle(text) ||
    isCurrentDocumentTitle(text, item.documentName) ||
    repeatedFurniture.has(`${item.documentId}:${canonicalLine(text)}`)
  ) {
    return true;
  }
  return /^(?:patient|mrn|medical record number|document title|file name|filename|prepared by|reviewed by|author|facility|department)\s*[:#-]/i.test(text);
}

function isDocumentTitle(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > 160) return false;
  return DOCUMENT_TITLE.test(text) && !FINITE_PREDICATE.test(text) && !extractNumericValues(text).length;
}

function isCurrentDocumentTitle(value: string, documentName: string) {
  const line = canonicalLine(value);
  const title = canonicalLine(documentName.replace(/\.[^.]+$/, ""));
  return Boolean(line && title && (line === title || (line.length >= 18 && title.includes(line))));
}

function isSectionHeading(value: string) {
  const text = value.replace(/[:#-]+$/, "").replace(/\s+/g, " ").trim();
  if (KNOWN_SECTION.test(text) || DYNAMIC_UNRESOLVED_SECTION.test(text) || CONTEXTUAL_SECTION.test(text)) return true;
  if (text.length > 80 || extractNumericValues(text).length || FINITE_PREDICATE.test(text) || CLINICAL_SIGNAL.test(text)) {
    return false;
  }
  const words = text.split(/\s+/);
  const uppercase = words.filter((word) => word === word.toUpperCase() && /[A-Z]/.test(word)).length;
  const titleCase = words.filter((word) => /^[A-Z][A-Za-z-]*$/.test(word)).length;
  return words.length <= 8 && (uppercase / words.length >= 0.7 || titleCase / words.length >= 0.8);
}

function normalizeHeading(value: string) {
  const text = value.replace(/[:#-]+$/, "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function splitTableCells(value: string) {
  if (value.includes("|")) {
    return value.split("|").map((cell) => cell.trim()).filter(Boolean);
  }
  if (value.includes("\t")) {
    return value.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
  }
  return value.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
}

function tableFactFromCells(cells: string[], headers: string[] | null): NormalizedTableFact {
  if (headers && headers.length === cells.length) {
    const labelParts = cells.filter((_, index) => !extractNumericValues(cells[index]).length);
    const values = cells.filter((cell) => extractNumericValues(cell).length > 0);
    return {
      label: labelParts.join(" - ") || headers[0],
      values: values.length > 0
        ? values
        : cells.map((cell, index) => `${headers[index]}: ${cell}`),
    };
  }
  return {
    label: cells[0],
    values: cells.slice(1),
  };
}

function looksLikeFlattenedTable(value: string) {
  const numbers = extractNumericValues(value);
  const punctuation = value.replace(/\d\.\d/g, "").match(/[.!?]/g)?.length ?? 0;
  return numbers.length >= 3 &&
    punctuation <= 2 &&
    (
      /\b(?:outcome|measure|metric|observed result|result|value|frequency|rate)\b/i.test(value) ||
      value.split(/\s+/).length >= 28
    );
}

function parseFlattenedTable(value: string) {
  const withoutHeaders = value
    .replace(/^(?:observed outcomes?|outcomes?|measure|metric|observed result|result|value)(?:\s+(?:outcome|measure|metric|observed result|result|value)){1,5}\s*/i, "")
    .trim();
  const starts = Array.from(withoutHeaders.matchAll(FLAT_TABLE_START))
    .map((match) => match.index ?? 0)
    .filter((index, position, values) => position === 0 || index !== values[position - 1]);
  const segments = starts.length > 1
    ? starts.map((start, index) => withoutHeaders.slice(start, starts[index + 1] ?? withoutHeaders.length))
    : withoutHeaders.split(/\s*;\s*/);
  return segments
    .map((segment) => tableFactFromSegment(segment))
    .filter((table): table is NormalizedTableFact => Boolean(table));
}

function tableFactFromSegment(segment: string): NormalizedTableFact | null {
  let value = segment.replace(/\s+/g, " ").replace(/^[,;:\s-]+|[,;:\s-]+$/g, "").trim();
  const inlineSection = value.match(INLINE_SECTION);
  if (inlineSection) value = value.slice(inlineSection[0].length).trim();
  const matches = Array.from(value.matchAll(NUMERIC_VALUE));
  if (matches.length === 0) return null;
  const threshold = /^(?:at least|at most|greater than|less than|more than|fewer than)\b/i.test(value);
  const selected = threshold && matches.length > 1 ? matches.at(-1)! : matches[0];
  const valueStart = selected.index ?? 0;
  const label = value.slice(0, valueStart).replace(/[,;:\s-]+$/, "").trim();
  const reported = value.slice(valueStart).trim();
  if (!label || !reported) return null;
  return {
    label,
    values: extractNumericValues(reported).length > 0 ? [reported] : [selected[0]],
  };
}

function tableStatement(table: NormalizedTableFact) {
  const label = table.label.replace(/[.!?]+$/, "").trim();
  const values = table.values.join("; ").replace(/[.!?]+$/, "").trim();
  if (FINITE_PREDICATE.test(`${label} ${values}`)) {
    return ensureSentence(`${label} ${values}`);
  }
  return ensureSentence(`The reported value for ${lowercaseFirst(label)} was ${values}`);
}

function tableSourceAnchor(table: NormalizedTableFact) {
  return `${table.label} ${table.values.join(" ")}`.replace(/\s+/g, " ").trim();
}

function normalizeClinicalStatement(value: string) {
  let text = removeInlineMetadata(value)
    .replace(/^(?:finding|result|observation|assessment|impression|recommendation|limitation)\s*[:#-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || isDiscardedLine(text)) return "";
  if (!FINITE_PREDICATE.test(text) && extractNumericValues(text).length > 0) {
    const measurement = text.match(/^(.+?)\s+((?:[<>]=?\s*)?-?\d+(?:\.\d+)?\s*(?:%|mg(?:\/kg)?|mcg|ug|g\/dL|mg\/dL|ng\/mL|pg\/mL|mmol\/L|mEq\/L|U\/L|IU\/L|mg\/L|mmHg|bpm|ms|mL\/min|cm|mm|points?)?)$/i);
    if (measurement) text = `${measurement[1]} was ${measurement[2]}`;
  }
  if (!FINITE_PREDICATE.test(text) && !extractNumericValues(text).length && !RECOMMENDATION_SIGNAL.test(text)) {
    return "";
  }
  return ensureSentence(text);
}

function classifyNormalizedKind(value: string, table: boolean, sectionHeading = ""): NormalizedEvidenceKind {
  if (/\b(?:unresolved|pending|missing|outstanding)\b/i.test(sectionHeading)) return "limitation";
  if (RECOMMENDATION_SIGNAL.test(value)) return "recommendation";
  if (UNCERTAINTY_SIGNAL.test(value)) return "uncertainty";
  if (LIMITATION_SIGNAL.test(value)) return "limitation";
  if (DIAGNOSIS_SIGNAL.test(value)) return "diagnosis";
  if (table) return "table_fact";
  return "observation";
}

function splitSentences(value: string) {
  const decimal = "__AETHERIS_DECIMAL__";
  return (value.replace(/(\d)\.(\d)/g, `$1${decimal}$2`).match(/[^.!?]+[.!?]?/g) ?? [])
    .map((sentence) => sentence.replaceAll(decimal, ".").trim())
    .filter(Boolean);
}

function extractNumericValues(value: string) {
  return Array.from(value.matchAll(NUMERIC_VALUE))
    .map((match) => match[0].replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function ensureSentence(value: string) {
  const text = value.replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function lowercaseFirst(value: string) {
  if (!value || /^[A-Z]{2,}\b/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function deduplicateObjects(objects: NormalizedEvidenceObject[]) {
  const seen = new Set<string>();
  return objects.filter((item) => {
    const key = `${item.evidenceId}:${item.statement.toLowerCase().replace(/[^a-z0-9.%]+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateSections(sections: NormalizedSectionHeading[]) {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = `${section.documentId}:${section.page ?? "unknown"}:${section.heading.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matches(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  const result = pattern.test(value);
  pattern.lastIndex = 0;
  return result;
}

function findRepeatedPageFurniture(items: EvidenceItem[]) {
  const occurrences = new Map<string, Set<string>>();
  for (const item of items) {
    const pageKey = `${item.documentId}:${item.page ?? "unknown"}`;
    const lines = item.excerpt
      .replace(/\r\n?/g, "\n")
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => isFurnitureCandidate(line));
    for (const line of new Set(lines)) {
      const key = `${item.documentId}:${canonicalLine(line)}`;
      const pages = occurrences.get(key) ?? new Set<string>();
      pages.add(pageKey);
      occurrences.set(key, pages);
    }
  }

  return new Set(
    Array.from(occurrences.entries())
      .filter(([, pages]) => pages.size >= 2)
      .map(([key]) => key),
  );
}

function isFurnitureCandidate(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length >= 3 &&
    text.length <= 120 &&
    !FINITE_PREDICATE.test(text) &&
    !CLINICAL_SIGNAL.test(text);
}

function canonicalLine(value: string) {
  return value
    .toLowerCase()
    .replace(/\bpage\s*\d+(?:\s*(?:of|\/)\s*\d+)?\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
