import type { ResearchAnswerDimension, ResearchContentType } from "@/lib/types";

const AWKWARD_TITLE_WORDS = /\b(?:because|cause|final|reasoning|true|needs?|recommends?|recommended|states?|reported|documents?|finding|findings|patient|source|summary)\b/i;
const TITLE_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "because", "been", "being", "but", "by",
  "could", "document", "documents", "evidence", "final", "finding", "findings", "for",
  "from", "has", "have", "in", "is", "it", "may", "most", "needs", "of", "on", "or",
  "patient", "reasoning", "report", "reported", "recommends", "remain", "remains",
  "should", "source", "that", "the", "this", "to", "true", "until", "was", "were",
  "while", "with", "would",
]);

export function createClinicalFindingTitle({
  statement,
  providedTitle,
  dimension = "context",
  contentTypes = [],
}: {
  statement: string;
  providedTitle?: string | null;
  dimension?: ResearchAnswerDimension;
  contentTypes?: ResearchContentType[];
}) {
  const text = normalize(statement);
  const combined = `${providedTitle ?? ""} ${text}`.trim();

  const diagnosis = diagnosisTitle(text);
  if (diagnosis) return diagnosis;

  if (isDisagreement(combined)) {
    const treatment = treatmentSubject(text);
    if (treatment && hasTimingLanguage(text)) return `${treatment} Timing Disagreement`;
    return treatment ? `${treatment} Disagreement` : "Clinical Recommendation Disagreement";
  }

  if (/\bdelay(?:ed|ing)?\s+(?:definitive\s+)?(?:treatment|therapy|intervention|management)\b/i.test(text) &&
      /\b(?:cause|risk|harm|injury|worsen|irreversible|progress)\w*\b/i.test(text)) {
    return "Risk of Delayed Treatment";
  }

  if (/\b(?:infection|infectious|sepsis|bacteremia|fungemia)\w*\b/i.test(text) &&
      /\b(?:risk|worsen|uncontrolled|concern|withhold|defer|delay)\w*\b/i.test(text)) {
    return "Infection Risk";
  }

  if (isOutstandingEvidence(text)) {
    const needsBiopsy = /\bbiops\w*\b/i.test(text);
    const needsCulture = /\bcultur\w*\b/i.test(text);
    if (needsBiopsy && needsCulture) return "Outstanding Evidence";
    if (needsBiopsy) return "Biopsy Evidence";
    if (needsCulture) return "Culture Evidence";
    return "Outstanding Evidence";
  }

  const treatment = treatmentSubject(text);
  if (treatment && (contentTypes.includes("recommendation") || isRecommendation(text))) {
    return hasTimingLanguage(text)
      ? `${treatment} Timing`
      : `${treatment} Recommendation`;
  }

  if (dimension === "safety" || /\b(?:risk|harm|toxicity|adverse|contraindicat|worsen)\w*\b/i.test(text)) {
    const subject = clinicalSubject(text);
    return subject ? `${subject} Risk` : "Clinical Risk";
  }

  if (dimension === "efficacy" || /\b(?:improv|response|benefit|outcome|resolve|progress)\w*\b/i.test(text)) {
    const subject = outcomeSubject(text);
    return subject ? `${subject} Outcome` : "Clinical Outcomes";
  }

  if (dimension === "limitation" || contentTypes.includes("limitation")) {
    const subject = clinicalSubject(text);
    return subject ? `${subject} Evidence Gap` : "Evidence Limitations";
  }

  const naturalProvidedTitle = normalizeProvidedTitle(providedTitle, text);
  if (naturalProvidedTitle) return naturalProvidedTitle;

  const subject = clinicalSubject(text);
  return subject ? `${subject} Assessment` : "Clinical Assessment";
}

function diagnosisTitle(text: string) {
  const match = text.match(
    /^(.{3,90}?)\s+(?:is|remains?|was)\s+(?:the\s+)?(?:most likely|leading|primary|best-supported)\s+(?:cause|diagnosis|explanation|interpretation)\b/i,
  ) ?? text.match(
    /\b(?:supports?|confirms?|identifies?)\s+(.{3,80}?)\s+as\s+(?:the\s+)?(?:most likely|leading|primary|best-supported)\s+(?:cause|diagnosis)\b/i,
  );
  if (!match) return null;
  const subject = titlePhrase(match[1], 4);
  return subject ? `${subject} Diagnosis` : "Leading Diagnosis";
}

function isDisagreement(text: string) {
  return /\b(?:disagree|disagreement|conflict|competing recommendation|opposing recommendation|different recommendation|true disagreement)\b/i.test(text);
}

function isOutstandingEvidence(text: string) {
  const evidenceNeed = /\b(?:await|pending|outstanding|needed|required|remain(?:s)? (?:unknown|uncertain|unavailable)|not yet (?:available|completed|obtained|reported)|still missing)\w*\b/i.test(text);
  const evidenceObject = /\b(?:biops|cultur|classification|result|quantification|trend|susceptibilit|workup|testing|evidence)\w*\b/i.test(text);
  return evidenceNeed && evidenceObject;
}

function isRecommendation(text: string) {
  return /\b(?:recommend|begin|start|initiat|administer|continue|withhold|hold|defer|delay|avoid|stop|proceed)\w*\b/i.test(text);
}

function hasTimingLanguage(text: string) {
  return /\b(?:immediate|immediately|now|early|before|after|until|while|withhold|hold|defer|delay|timing)\w*\b/i.test(text);
}

function treatmentSubject(text: string) {
  if (/\b(?:methylprednisolone|prednisone|corticosteroid|steroid)s?\b/i.test(text)) return "Steroid";
  if (/\b(?:antibiotic|antimicrobial)s?\b/i.test(text)) return "Antibiotic";
  if (/\b(?:norepinephrine|vasopressor)s?\b/i.test(text)) return "Vasopressor";
  if (/\b(?:immunosuppressive therapy|immunosuppression)\b/i.test(text)) return "Immunosuppression";
  if (/\b(?:fluid resuscitation|intravenous fluids?|iv fluids?)\b/i.test(text)) return "Fluid Resuscitation";

  const action = text.match(
    /\b(?:begin|start|initiat|administer|continue|withhold|hold|defer|delay|avoid|stop|proceed with)\w*\s+(?:empiric\s+|high-dose\s+|definitive\s+)?(.+?)(?=\s+(?:until|while|because|before|after|to reduce|to prevent)\b|[.;,]|$)/i,
  );
  return action ? titlePhrase(action[1], 3) : null;
}

function outcomeSubject(text: string) {
  const match = text.match(/^(.{2,70}?)\s+(?:improv|respond|increase|decrease|resolve|progress|stabili|worsen)\w*\b/i);
  return match ? titlePhrase(match[1], 3) : clinicalSubject(text);
}

function clinicalSubject(text: string) {
  const beforePredicate = text.match(
    /^(.{2,80}?)\s+(?:is|are|was|were|may|might|could|can|should|has|have|remains?|increases?|decreases?|improves?|worsens?|requires?|supports?|indicates?)\b/i,
  );
  return titlePhrase(beforePredicate?.[1] ?? text, 3);
}

function normalizeProvidedTitle(title: string | null | undefined, statement: string) {
  const value = normalize(title ?? "").replace(/[.:;,]+$/, "").trim();
  const words = value.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) ?? [];
  if (words.length === 0 || words.length > 6 || AWKWARD_TITLE_WORDS.test(value)) return null;
  if (/^(?:because|although|however|therefore|reasoning|true)\b/i.test(value)) return null;
  const titleTerms = meaningfulWords(value).map((word) => word.toLowerCase());
  const statementTerms = new Set(
    meaningfulWords(statement).map((word) => word.toLowerCase()),
  );
  const genericClinicalTitle = /\b(?:assessment|diagnosis|evidence|outcome|risk|safety|efficacy|monitoring|trajectory|decision|recommendation|uncertainty)\b/i.test(value);
  if (!genericClinicalTitle && !titleTerms.some((term) => statementTerms.has(term))) return null;
  return titleCase(value);
}

function titlePhrase(value: string, limit: number) {
  const words = meaningfulWords(value)
    .filter((word) => !/^\d+(?:\.\d+)?%?$/.test(word))
    .slice(0, limit);
  return words.length > 0 ? titleCase(words.join(" ")) : null;
}

function meaningfulWords(value: string) {
  return value
    .match(/[A-Za-z][A-Za-z0-9'-]*/g)
    ?.filter((word) =>
      word.length > 2 &&
      !TITLE_STOP_WORDS.has(word.toLowerCase()) &&
      !/^(?:argu|indicat|support|document|report|state|show|identify|determin)\w*$/i.test(word)
    ) ?? [];
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => /^[A-Z0-9-]{2,}$/.test(word) ||
        /[a-z][A-Z]/.test(word) ||
        (word.match(/[A-Z]/g)?.length ?? 0) >= 2
      ? word
      : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
