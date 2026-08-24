import { areOverlappingClinicalConclusions } from "@/lib/research/finding-deduplication";

const SECTION_LABEL = /(?:primary answer|answer|diagnosis|assessment|conclusion|summary|findings?|efficacy|safety|treatment priority|management priority|key trade-?off|main uncertainty|remaining evidence|evidence needed|limitations?|study context)/i;
const SECTION_ONLY = /^(?:primary answer|answer|diagnosis|assessment|conclusion|summary|findings?|efficacy|safety|treatment priority|management priority|key trade-?off|main uncertainty|remaining evidence|evidence needed|limitations?|study context)[.:]?$/i;
const SOURCE_TAG = /\s*(?:\(|\[)(?:source|document|citation|page)\s*:[^\])]+[\])]/gi;
const NUMERIC_CITATION = /\s*\[(?:\d+(?:\s*[-,]\s*\d+)*)]/g;
const PATIENT_IDENTIFIER = /\b(?:MRN|medical record number|patient id|subject id|record id|accession number|case number)\s*[:#-]?\s*[A-Z0-9][A-Z0-9._/-]{2,}\b/i;
const PATIENT_NAME = /\bpatient(?:\s+name)?\s*[:#-]?\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}\b/;
const CALENDAR_DATE = /\b(?:(?:study|report|document|exam|service|visit|collection|scan)\s+date\s*[:#-]?\s*)?(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/i;
const TESTING_NOTICE = /\b(?:synthetic\b.{0,80}\b(?:document|report|record)|testing notice|test(?:ing)? purposes? only|for demonstration purposes|not for clinical use|mock clinical|sample document)\b/i;
const DOCUMENT_FILE = /\b[^\s,;:()[\]]+\.(?:pdf|docx?|txt|rtf)\b/i;
const DOCUMENT_TITLE = /\b(?:according to|as (?:stated|reported|documented) in)\s+(?:the\s+)?[^,;.!?]{2,80}(?:report|note|consultation|summary|document|record|memorandum|protocol|review|appendix|brief)\b/i;
const TITLE_CASE_DOCUMENT = /\b(?:[A-Z][A-Za-z0-9-]+\s+){1,7}(?:Report|Note|Consultation|Summary|Document|Record|Memorandum|Protocol|Review|Appendix|Brief)\b/;
const RAW_LABEL_SEQUENCE = /\b(?:patient|mrn|study|study date|report date|region|finding|result|value|status|impression|new lung finding|pleural effusion|distant disease)\b[\s\S]{0,240}\b(?:mrn|study|study date|report date|region|finding|result|value|status|impression|new lung finding|pleural effusion|distant disease)\b/i;
const INLINE_SOURCE_LABEL = /(?:^|[.!?]\s+)(?:patient|mrn|study date|report date|region|finding|result|value|status|impression|document title|testing notice)\s*[:#-]/i;
const WORKFLOW_LANGUAGE = /\b(?:extraction|citation|source citation|contradiction detection|conflict detection|discrepancy detection|longitudinal reasoning|synthetic test document|chunking|embedding|retrieval pipeline|analysis pipeline)\b/i;
const FORBIDDEN_PRIMARY_TERM = /\b(?:MRN|patient|study date|synthetic|memorandum|detection|longitudinal reasoning|source citation)\b/i;
const SOURCE_SECTION_HEADING = /(?:^|[.!?]\s+)(?:abstract|background|methods?|results?|discussion|conclusion|assessment(?: and plan)?|impression|recommendations?|executive summary|document purpose)\s*[:#-]/i;
const DOCUMENT_PURPOSE_LANGUAGE = /\b(?:document purpose|this (?:document|report|record) (?:summarizes|demonstrates|tests|validates)|summarizes? (?:the )?(?:treatment response|case|record) for review|prepared for review)\b/i;
const PROSE_LOWERCASE_WORDS = new Set([
  "against", "answer", "arguing", "assessment", "begin", "conclusion", "context",
  "continue", "decision", "diagnosis", "evidence", "factors", "findings", "for",
  "immediately", "increasing", "is", "key", "leading", "limitations", "main",
  "management", "may", "priority", "question", "recommendation", "remaining",
  "research", "risk", "safety", "should", "study", "summary", "the", "tradeoff",
  "treatment", "uncertainty", "was", "were", "worsen",
]);

export function containsPrimaryAnswerSourceLeakage(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return [
    PATIENT_IDENTIFIER,
    PATIENT_NAME,
    CALENDAR_DATE,
    TESTING_NOTICE,
    DOCUMENT_FILE,
    DOCUMENT_TITLE,
    TITLE_CASE_DOCUMENT,
    RAW_LABEL_SEQUENCE,
    INLINE_SOURCE_LABEL,
    WORKFLOW_LANGUAGE,
    FORBIDDEN_PRIMARY_TERM,
    SOURCE_SECTION_HEADING,
    DOCUMENT_PURPOSE_LANGUAGE,
  ].some((pattern) => pattern.test(normalized));
}

export function primaryAnswerQualityIssues(
  value: string,
  options: { singleDocument?: boolean } = {},
) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const issues: string[] = [];
  if (!normalized) issues.push("empty");
  if (containsPrimaryAnswerSourceLeakage(normalized)) issues.push("source-text-leakage");
  if (options.singleDocument) {
    const sentenceCount = countPrimaryAnswerSentences(normalized);
    if (sentenceCount < 2 || sentenceCount > 4) {
      issues.push("single-document-sentence-count");
    }
  }
  return issues;
}

export function countPrimaryAnswerSentences(value: string) {
  return splitSentences(value).filter((sentence) => /[.!?]$/.test(sentence)).length;
}

export function paraphrasePrimaryAnswerEvidence(value: string) {
  const normalized = value
    .replace(/\r?\n+/g, " ")
    .replace(/(\d)\s*;\s*(\d)/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (DOCUMENT_PURPOSE_LANGUAGE.test(normalized)) return "";

  if (!containsPrimaryAnswerSourceLeakage(normalized)) {
    return polishPrimaryAnswerFluency(normalized);
  }

  const clinicalClauses = extractInterpretiveClinicalClauses(normalized)
    .map(naturalizeInterpretiveClinicalClause)
    .map((clause) => polishPrimaryAnswerFluency(clause))
    .filter((clause) => clause && !containsPrimaryAnswerSourceLeakage(clause));
  return clinicalClauses.slice(0, 2).join(" ");
}

export function polishPrimaryAnswerFluency(value: string) {
  const normalized = value
    .replace(/\r?\n+/g, " ")
    .replace(/[*_#`]+/g, "")
    .replace(SOURCE_TAG, "")
    .replace(NUMERIC_CITATION, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  const withoutLabels = stripSectionLabels(normalized);
  const sentences = splitSentences(withoutLabels)
    .map(stripSourceAttribution)
    .map(normalizeSentenceCapitalization)
    .map(cleanSentence)
    .filter((sentence) => sentence && !SECTION_ONLY.test(sentence));
  const accepted: string[] = [];

  for (const sentence of sentences) {
    const duplicate = accepted.some((candidate) =>
      areOverlappingClinicalConclusions(candidate, sentence)
    );
    if (duplicate) continue;

    if (isAwkwardFragment(sentence)) {
      if (/^(?:factors?|findings?|considerations?|evidence|summary|assessment)\b/i.test(sentence)) {
        continue;
      }
      if (accepted.length > 0) {
        accepted[accepted.length - 1] = joinFragment(accepted.at(-1)!, sentence);
        continue;
      }
      accepted.push(ensureTerminalPunctuation(
        `The evidence identifies ${sentence.charAt(0).toLowerCase()}${sentence.slice(1).replace(/[.!?]+$/, "")}`,
      ));
      continue;
    }
    accepted.push(ensureTerminalPunctuation(sentence));
  }

  return accepted.join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])\s*\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSectionLabels(value: string) {
  let result = value;
  const leadingLabel = new RegExp(`^${SECTION_LABEL.source}\\s*[:\\-]\\s*`, "i");
  const inlineLabel = new RegExp(
    `([.!?])\\s+${SECTION_LABEL.source}\\s*[:\\-]\\s*`,
    "gi",
  );
  result = result.replace(leadingLabel, "");
  result = result.replace(inlineLabel, "$1 ");
  return result
    .replace(/\bOn\s+(?:efficacy|safety|diagnosis|treatment|limitations?)\s*[:,]\s*/gi, "")
    .trim();
}

function splitSentences(value: string) {
  const decimalToken = "__AETHERIS_DECIMAL__";
  const protectedValue = value.replace(/(\d)\.(\d)/g, `$1${decimalToken}$2`);
  const matches = protectedValue.match(/[^.!?]+[.!?]?/g) ?? [];
  return matches
    .map((item) => item.replaceAll(decimalToken, ".").trim())
    .filter(Boolean);
}

function stripSourceAttribution(value: string) {
  return value
    .replace(/^(?:according to|as (?:stated|reported|documented) in)\s+[^,;]{2,80}[,;]\s*/i, "")
    .replace(
      /^(?:the\s+)?[^,;]{0,60}(?:document|report|note|consultation|summary)\s+(?:states?|reports?|indicates?|shows?|documents?|concludes?)\s+(?:that\s+)?/i,
      "",
    )
    .trim();
}

function normalizeSentenceCapitalization(value: string) {
  const words = value.split(/\s+/).map((word, index) => {
    const match = word.match(/^([^A-Za-z0-9]*)([A-Za-z][A-Za-z-]*)(.*)$/);
    if (!match) return word;
    const [, prefix, core, suffix] = match;
    if (index > 0 && PROSE_LOWERCASE_WORDS.has(core.toLowerCase())) {
      return `${prefix}${core.toLowerCase()}${suffix}`;
    }
    if (core.length > 5 && core === core.toUpperCase()) {
      return `${prefix}${core.toLowerCase()}${suffix}`;
    }
    return word;
  });
  const sentence = words.join(" ").trim();
  if (!sentence) return "";
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function cleanSentence(value: string) {
  return value
    .replace(/^[\s,;:.-]+/, "")
    .replace(/\s*[,;:]\s*([.!?])$/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isAwkwardFragment(value: string) {
  const words = value.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  if (words.length === 0) return true;
  if (SECTION_ONLY.test(value)) return true;
  if (words.length > 7) return false;
  return !/\b(?:is|are|was|were|has|have|had|should|may|might|can|could|will|would|supports?|indicates?|shows?|confirms?|requires?|remains?|improves?|improved|increases?|increased|decreases?|decreased|worsens?|worsened|depends?)\b/i.test(value);
}

function joinFragment(previous: string, fragment: string) {
  const base = previous.replace(/[.!?]+$/, "");
  const continuation = fragment.charAt(0).toLowerCase() + fragment.slice(1);
  return ensureTerminalPunctuation(`${base}; ${continuation}`);
}

function ensureTerminalPunctuation(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function extractInterpretiveClinicalClauses(value: string) {
  const candidates: string[] = [];
  const patterns = [
    /\b(?:(?:partial|complete|objective|mixed)\s+)?(?:radiographic|clinical|pathologic|treatment)?\s*(?:response|remission)\b[^.!?]{0,220}/gi,
    /\b(?:the\s+)?(?:available\s+)?(?:imaging|evidence|testing)\s+alone\s+cannot\s+determine\b[^.!?]{0,220}/gi,
    /\b[^.!?]{0,100}\b(?:is|remains)\s+(?:the\s+)?(?:leading|most likely|favored)\s+(?:diagnosis|cause|interpretation)\b[^.!?]{0,180}/gi,
    /\b(?:management|treatment|therapy|monitoring|follow-up)\s+should\b[^.!?]{0,220}/gi,
    /\b(?:the\s+)?(?:main|central|key)\s+(?:uncertainty|limitation|trade-?off)\b[^.!?]{0,220}/gi,
  ];

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const clause = trimMetadataBoundary(match[0]);
      if (clause.length >= 18 && !candidates.some((item) =>
        areOverlappingClinicalConclusions(item, clause)
      )) {
        candidates.push(clause);
      }
    }
  }
  return candidates;
}

function trimMetadataBoundary(value: string) {
  const boundary = value.search(
    /\b(?:synthetic (?:test )?(?:document|report|record)|testing notice|patient(?:\s+name)?\s*[:#-]|MRN\s*[:#-]|study date\s*[:#-]|report date\s*[:#-]|document title\s*[:#-])\b/i,
  );
  const trimmed = (boundary > 0 ? value.slice(0, boundary) : value)
    .replace(/\s+/g, " ")
    .replace(/[,;:\s-]+$/, "")
    .trim();
  return ensureTerminalPunctuation(trimmed);
}

function naturalizeInterpretiveClinicalClause(value: string) {
  const clause = value.replace(/[.!?]+$/, "").trim();
  if (!clause) return "";
  if (/^(?:(?:partial|complete|objective|mixed)\s+)?(?:radiographic|clinical|pathologic|treatment)?\s*(?:response|remission)\b/i.test(clause)) {
    return `The available evidence shows a ${clause.charAt(0).toLowerCase()}${clause.slice(1)}.`;
  }
  return ensureTerminalPunctuation(clause);
}
