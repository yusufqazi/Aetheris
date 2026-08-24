import {
  paraphrasePrimaryAnswerEvidence,
  polishPrimaryAnswerFluency,
} from "@/lib/research/primary-answer";

const GENERIC_LABEL =
  /^(?:important finding|primary finding|supporting context|finding|assessment(?: and plan)?|impression|diagnosis|conclusion|recommendation|results?|summary|evidence)\s*[:\-]\s*/i;
const SOURCE_HEADING =
  /^(?:the\s+)?[A-Za-z][A-Za-z &/()-]{1,60}(?:note|consultation|report|review|summary)\s*[:\-]\s*/i;
const MALFORMED_PREFIX =
  /^(?:(?:true\s+disagreement|documentation\s+discrepancy|potential\s+contradiction|outstanding\s+(?:evidence|needs?)|reasoning)\s*[:\-]?\s*)+/i;
const FINITE_PREDICATE =
  /\b(?:is|are|was|were|has|have|had|may|might|can|could|should|will|would|remains?|appears?|suggests?|supports?|indicates?|shows?|confirms?|requires?|recommends?|demonstrates?|documents?|identifies?|raises?|increases?|increased|decreases?|decreased|reduces?|reduced|improved|worsened|persisted|resolved|grew|tested|received|underwent|developed)\b/i;
const IMPERATIVE =
  /^(?:start|begin|initiate|continue|administer|avoid|defer|delay|hold|withhold|stop|monitor|repeat|obtain|confirm|proceed)\b/i;
const PATIENT_IDENTIFIER =
  /\b(?:MRN|medical record number|patient id|subject id|record id|accession number|case number)\s*[:#-]?\s*[A-Z0-9][A-Z0-9._/-]{2,}\b/i;
const PATIENT_NAME =
  /\bpatient(?:\s+name)?\s*[:#-]?\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}\b/;
const SYNTHETIC_NOTICE =
  /\b(?:synthetic\b.{0,80}\b(?:document|report|record)|testing notice|for (?:testing|demonstration) purposes?|not for clinical use|mock clinical|sample document)\b/i;
const RAW_FIELD_LABEL =
  /\b(?:patient|mrn|study|study date|report date|region|finding|result|value|status|impression|new lung finding|pleural effusion|distant disease)\b/gi;

export function polishGeneratedFinding(statement: string, theme?: string) {
  let value = statement
    .replace(/\r?\n+/g, " ")
    .replace(/^[\s>*#`_-]*(?:\d+[.)]\s*)?/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (containsFindingSourceTextLeakage(value)) {
    const paraphrased = paraphrasePrimaryAnswerEvidence(value);
    return isGeneratedFindingReviewable(paraphrased) ? paraphrased : "";
  }

  value = stripThemeLabel(value, theme)
    .replace(GENERIC_LABEL, "")
    .replace(SOURCE_HEADING, "")
    .replace(MALFORMED_PREFIX, "")
    .trim();

  const polished = polishPrimaryAnswerFluency(value);
  if (!polished) return "";
  if (FINITE_PREDICATE.test(polished) || IMPERATIVE.test(polished)) {
    const sentence = ensureSentence(polished);
    return containsFindingSourceTextLeakage(sentence) ? "" : sentence;
  }

  const fragment = polished.replace(/[.!?]+$/, "").trim();
  if (/^(?:no|insufficient|limited)\s+(?:evidence|support)\b/i.test(fragment)) {
    return ensureSentence(`The uploaded evidence provides ${lowercaseLeading(fragment)}`);
  }
  if (/^(?:possible|probable|suspected|potential)\b/i.test(fragment)) {
    return ensureSentence(`The evidence raises concern for ${lowercaseLeading(fragment)}`);
  }
  if (/^(?:risk|concern|uncertainty|limitation)\s+(?:of|for|about)\b/i.test(fragment)) {
    return ensureSentence(`The evidence identifies a ${lowercaseLeading(fragment)}`);
  }
  return ensureSentence(`The evidence documents ${lowercaseLeading(fragment)}`);
}

export function containsFindingSourceTextLeakage(statement: string) {
  const value = statement.replace(/\s+/g, " ").trim();
  if (!value) return false;
  const fieldLabels = value.match(RAW_FIELD_LABEL) ?? [];
  const flattenedRow =
    fieldLabels.length >= 3 ||
    (
      fieldLabels.length >= 2 &&
      (value.match(/[.!?]/g)?.length ?? 0) <= 1 &&
      (value.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0) >= 28
    );
  return PATIENT_IDENTIFIER.test(value) ||
    PATIENT_NAME.test(value) ||
    SYNTHETIC_NOTICE.test(value) ||
    flattenedRow;
}

export function generatedFindingQualityIssues(statement: string) {
  const value = statement.replace(/\s+/g, " ").trim();
  const issues: string[] = [];
  const words = value.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  if (!value || words.length < 5) issues.push("too-short");
  if (words.length > 80) issues.push("too-long");
  if (containsFindingSourceTextLeakage(value)) issues.push("source-text-leakage");
  if (/\.\.\.|…/.test(value) || /\b(?:and|or|that|which|because|with|from|to|of)\s*[,;:.-]*$/i.test(value)) {
    issues.push("incomplete");
  }
  const polished = polishPrimaryAnswerFluency(value);
  if (
    polished &&
    !FINITE_PREDICATE.test(polished) &&
    !IMPERATIVE.test(polished) &&
    !/\b\d+(?:\.\d+)?\s*(?:%|mg|g\/dL|ng\/mL|ms|weeks?|months?)\b.{0,50}\b(?:versus|vs\.?|compared|from|to|higher|lower)\b/i.test(polished)
  ) {
    issues.push("no-clinical-predicate");
  }
  return Array.from(new Set(issues));
}

export function isGeneratedFindingReviewable(statement: string) {
  return generatedFindingQualityIssues(statement).length === 0;
}

function stripThemeLabel(value: string, theme?: string) {
  const normalizedTheme = theme?.replace(/\s+/g, " ").trim();
  if (!normalizedTheme) return value;
  const escaped = normalizedTheme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`^${escaped}\\s*[:\\-]\\s*`, "i"), "");
}

function lowercaseLeading(value: string) {
  if (!value || /^[A-Z]{2,}\b/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function ensureSentence(value: string) {
  const normalized = value
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const capitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}
