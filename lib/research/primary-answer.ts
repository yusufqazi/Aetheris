import { areOverlappingClinicalConclusions } from "@/lib/research/finding-deduplication";

const SECTION_LABEL = /(?:primary answer|answer|diagnosis|assessment|conclusion|summary|findings?|efficacy|safety|treatment priority|management priority|key trade-?off|main uncertainty|remaining evidence|evidence needed|limitations?|study context)/i;
const SECTION_ONLY = /^(?:primary answer|answer|diagnosis|assessment|conclusion|summary|findings?|efficacy|safety|treatment priority|management priority|key trade-?off|main uncertainty|remaining evidence|evidence needed|limitations?|study context)[.:]?$/i;
const SOURCE_TAG = /\s*(?:\(|\[)(?:source|document|citation|page)\s*:[^\])]+[\])]/gi;
const NUMERIC_CITATION = /\s*\[(?:\d+(?:\s*[-,]\s*\d+)*)]/g;
const PROSE_LOWERCASE_WORDS = new Set([
  "against", "answer", "arguing", "assessment", "begin", "conclusion", "context",
  "continue", "decision", "diagnosis", "evidence", "factors", "findings", "for",
  "immediately", "increasing", "is", "key", "leading", "limitations", "main",
  "management", "may", "priority", "question", "recommendation", "remaining",
  "research", "risk", "safety", "should", "study", "summary", "the", "tradeoff",
  "treatment", "uncertainty", "was", "were", "worsen",
]);

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
  const matches = value.match(/[^.!?]+[.!?]?/g) ?? [];
  return matches.map((item) => item.trim()).filter(Boolean);
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
