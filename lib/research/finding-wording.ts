import { polishPrimaryAnswerFluency } from "@/lib/research/primary-answer";

const GENERIC_LABEL =
  /^(?:important finding|primary finding|supporting context|finding|assessment(?: and plan)?|impression|diagnosis|conclusion|recommendation|results?|summary|evidence)\s*[:\-]\s*/i;
const SOURCE_HEADING =
  /^(?:the\s+)?[A-Za-z][A-Za-z &/()-]{1,60}(?:note|consultation|report|review|summary)\s*[:\-]\s*/i;
const MALFORMED_PREFIX =
  /^(?:(?:true\s+disagreement|documentation\s+discrepancy|potential\s+contradiction|outstanding\s+(?:evidence|needs?)|reasoning)\s*[:\-]?\s*)+/i;
const FINITE_PREDICATE =
  /\b(?:is|are|was|were|has|have|had|may|might|can|could|should|will|would|remains?|appears?|suggests?|supports?|indicates?|shows?|confirms?|requires?|recommends?|demonstrates?|documents?|identifies?|raises?|increases?|decreases?|improved|worsened|persisted|resolved|grew|tested|received|underwent|developed)\b/i;
const IMPERATIVE =
  /^(?:start|begin|initiate|continue|administer|avoid|defer|delay|hold|withhold|stop|monitor|repeat|obtain|confirm|proceed)\b/i;

export function polishGeneratedFinding(statement: string, theme?: string) {
  let value = statement
    .replace(/\r?\n+/g, " ")
    .replace(/^[\s>*#`_-]*(?:\d+[.)]\s*)?/, "")
    .replace(/\s+/g, " ")
    .trim();

  value = stripThemeLabel(value, theme)
    .replace(GENERIC_LABEL, "")
    .replace(SOURCE_HEADING, "")
    .replace(MALFORMED_PREFIX, "")
    .trim();

  const polished = polishPrimaryAnswerFluency(value);
  if (!polished) return ensureSentence(statement);
  if (FINITE_PREDICATE.test(polished) || IMPERATIVE.test(polished)) {
    return ensureSentence(polished);
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
