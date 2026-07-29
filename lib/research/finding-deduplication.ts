const CONCLUSION_STOP_WORDS = new Set([
  "a", "across", "an", "and", "are", "as", "at", "based", "because", "been", "being",
  "by", "clinical", "conclusion", "conclusions", "current", "diagnosis", "document",
  "documented", "documents", "evidence", "finding", "findings", "for", "from", "has",
  "have", "in", "indicate", "indicates", "is", "it", "leading", "likely", "most", "of",
  "on", "overall", "record", "records", "remain", "remains", "report", "reported",
  "reports", "show", "shows", "source", "sources", "still", "strongly", "support",
  "supported", "supports", "that", "the", "this", "to", "uploaded", "was", "were",
  "with",
]);

const TOKEN_ALIASES: Record<string, string> = {
  administered: "administer",
  administering: "administer",
  began: "start",
  begin: "start",
  beginning: "start",
  confirmed: "confirm",
  confirms: "confirm",
  demonstrating: "demonstrate",
  demonstrated: "demonstrate",
  demonstrates: "demonstrate",
  diagnosed: "diagnosis",
  diagnostic: "diagnosis",
  diagnoses: "diagnosis",
  discontinued: "stop",
  discontinuation: "stop",
  discontinuing: "stop",
  initiated: "start",
  initiating: "start",
  initiation: "start",
  recommended: "recommend",
  recommending: "recommend",
  recommends: "recommend",
  started: "start",
  starting: "start",
  stopped: "stop",
  stopping: "stop",
  withheld: "defer",
  withholding: "defer",
};

type ManagementAction = "proceed" | "defer" | "stop" | "restrict";
type EvidencePolarity = "positive" | "negative";

export function areOverlappingClinicalConclusions(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (!numbersAreCompatible(left, right)) return false;
  if (meaningsOppose(left, right)) return false;

  const leftTokens = conclusionTokens(left);
  const rightTokens = conclusionTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  const smaller = Math.min(leftTokens.length, rightTokens.length);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const containment = shared / Math.max(1, smaller);
  const jaccard = shared / Math.max(1, union);

  if (smaller === 1) return shared === 1 && jaccard >= 0.5;
  return shared >= 2 && containment >= 0.75 && jaccard >= 0.6;
}

export function areOverlappingEvidencePassages(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (!numbersAreCompatible(left, right)) return false;

  const leftTokens = passageTokens(left);
  const rightTokens = passageTokens(right);
  const smaller = Math.min(leftTokens.length, rightTokens.length);
  if (smaller < 6) return false;

  if (
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) &&
    smaller >= 8
  ) {
    return true;
  }

  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  return shared >= 6 && shared / smaller >= 0.82;
}

export function areDuplicateSupportingPassages(
  left: string,
  right: string,
  sameSourcePage: boolean,
) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  return sameSourcePage && areOverlappingEvidencePassages(left, right);
}

function conclusionTokens(text: string) {
  return uniqueTokens(text)
    .map(canonicalToken)
    .filter((token) => token.length > 2 && !CONCLUSION_STOP_WORDS.has(token));
}

function passageTokens(text: string) {
  return uniqueTokens(text).map(canonicalToken).filter((token) => token.length > 2);
}

function uniqueTokens(text: string) {
  return Array.from(new Set(text.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?%?/g) ?? []));
}

function canonicalToken(token: string) {
  const alias = TOKEN_ALIASES[token];
  if (alias) return alias;
  if (/^improv(?:e|ed|ement|ements|ing|es)$/.test(token)) return "improve";
  if (/^worsen(?:ed|ing|s)?$/.test(token)) return "worsen";
  if (/^reduc(?:e|ed|tion|tions|ing|es)$/.test(token)) return "reduce";
  if (/^increas(?:e|ed|ing|es)$/.test(token)) return "increase";
  if (/^obstruct(?:ion|ive|ed|ing|s)?$/.test(token)) return "obstruction";
  return token;
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numbersAreCompatible(left: string, right: string) {
  const leftNumbers = numberSet(left);
  const rightNumbers = numberSet(right);
  if (leftNumbers.size === 0 || rightNumbers.size === 0) return true;
  if (leftNumbers.size !== rightNumbers.size) return false;
  return [...leftNumbers].every((value) => rightNumbers.has(value));
}

function numberSet(text: string) {
  return new Set(text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []);
}

function meaningsOppose(left: string, right: string) {
  const leftAction = managementAction(left);
  const rightAction = managementAction(right);
  if (leftAction && rightAction && leftAction !== rightAction) return true;

  const leftPolarity = evidencePolarity(left);
  const rightPolarity = evidencePolarity(right);
  return Boolean(leftPolarity && rightPolarity && leftPolarity !== rightPolarity);
}

function managementAction(text: string): ManagementAction | null {
  if (/\b(?:delay|defer|postpone|hold|withhold|wait before|not yet)\w*\b/i.test(text)) return "defer";
  if (/\b(?:stop|discontinu|cease|do not use|avoid|contraindicat|not recommend)\w*\b/i.test(text)) return "stop";
  if (/\b(?:restrict|dose reduction|lower dose|conditional use)\w*\b/i.test(text)) return "restrict";
  if (/\b(?:start|initiat|begin|continue|proceed|approve)\w*\b/i.test(text)) return "proceed";
  return null;
}

function evidencePolarity(text: string): EvidencePolarity | null {
  if (/\b(?:did not|does not|no meaningful|no significant|failed|negative|inferior|worsen|deteriorat|increased risk|higher risk)\w*\b/i.test(text)) {
    return "negative";
  }
  if (/\b(?:improv|benefit|positive|superior|response|stabili[sz]|reduced risk|lower risk)\w*\b/i.test(text)) {
    return "positive";
  }
  return null;
}
