import {
  classifyStatementRole,
  sameManagementTarget,
} from "@/lib/research/conflict-semantics";
import { isSourceNoise } from "@/lib/research/source-cleaning";

const ADJACENT_DUPLICATE = /\b([a-z][a-z-]{1,})\s+\1\b/i;
const DANGLING_END = /\b(?:a|an|the|and|or|that|which|because|with|without|from|to|of|for|by|associated with|based on|consistent with|due to|including|following)\s*[,;:.-]*$/i;
const MECHANICAL_STITCH = /\b(?:supports?|identifies?|indicates?|reinforced by|associated with|resolution of)\b.{0,100}\b(?:does not determine|cannot be excluded|recommends?|should|final\s+final|result\s+result)\b/i;
const JSON_ARTIFACT = /(?:^|\s)[{}[\]"]{2,}|\b(?:evidenceIds|counterEvidenceIds|reasoningSummary|clinicalImplication)\b\s*[:=]/i;

const PENDING_STATE = /\b(?:pending|awaiting|awaited|not yet available|remain(?:s|ed)? unavailable|preliminary)\b/i;
const FINAL_STATE = /\b(?:finalized|completed result|grew|no growth|positive|negative|confirmed|ruled out)\b/i;
const PLANNED_STATE = /\b(?:planned|proposed|considered|reasonable|if obtained|if performed|should be (?:obtained|performed)|recommend(?:s|ed)? (?:obtaining|performing))\b/i;
const PERFORMED_STATE = /\b(?:was|were|has been|have been)\s+(?:performed|completed|obtained)|\b(?:underwent|demonstrated|showed|revealed)\b/i;
const POSSIBLE_STATE = /\b(?:cannot (?:be )?exclude(?:d)?|could not (?:be )?exclude(?:d)?|not excluded|possible|plausible|suspected|may represent|may reflect|concern for)\b/i;
const CONFIRMED_STATE = /\b(?:confirmed|definitive|definitively|established|proven|diagnosed as|is the cause|was the cause)\b/i;
const EPISTEMIC_NEGATION =
  /\b(?:does not|do not|did not|cannot|could not|is not sufficient to|are not sufficient to|fails? to)\s+(?:determine|establish|support|show|demonstrate|confirm|prove|indicate)\b/i;
const EXPLICIT_ABSENCE = /\b(?:no|not|without|unlikely|ruled out|excluded)\b/i;

export function proseQualityIssues(value: string) {
  const text = normalize(value);
  const issues: string[] = [];
  if (!text) issues.push("empty");
  if (ADJACENT_DUPLICATE.test(text)) issues.push("adjacent-duplicate");
  if (/\band\s+and\b/i.test(text)) issues.push("repeated-conjunction");
  if (DANGLING_END.test(text) || /\.\.\.|…/.test(text)) issues.push("dangling-clause");
  if (MECHANICAL_STITCH.test(text)) issues.push("mechanically-stitched");
  if (JSON_ARTIFACT.test(text)) issues.push("schema-artifact");
  return Array.from(new Set(issues));
}

export function evidenceStateAlignmentIssues(claim: string, sourceTexts: string[]) {
  const target = normalize(claim);
  const source = normalize(sourceTexts.join(" "));
  const issues: string[] = [];
  if (!target || !source) return ["missing-claim-or-source"];

  if (PENDING_STATE.test(source) && FINAL_STATE.test(target) && !PENDING_STATE.test(target) && !FINAL_STATE.test(source)) {
    issues.push("pending-promoted-to-final");
  }
  if (PLANNED_STATE.test(source) && PERFORMED_STATE.test(target) && !PERFORMED_STATE.test(source)) {
    issues.push("planned-promoted-to-performed");
  }
  if (
    POSSIBLE_STATE.test(source) &&
    CONFIRMED_STATE.test(target) &&
    !POSSIBLE_STATE.test(target) &&
    !(CONFIRMED_STATE.test(source) && !POSSIBLE_STATE.test(source))
  ) {
    issues.push("possibility-promoted-to-confirmed");
  }
  if (
    classifyStatementRole(source) === "neutral" &&
    ["recommendation_for", "recommendation_against"].includes(classifyStatementRole(target))
  ) {
    issues.push("neutral-promoted-to-recommendation");
  }
  return issues;
}

export function claimEvidenceAlignmentIssues(claim: string, sourceText: string) {
  const target = normalize(claim);
  const source = normalize(sourceText);
  const alignedSource = mostRelevantSourceText(target, source);
  const issues = evidenceStateAlignmentIssues(target, [alignedSource]);
  if (!target || !source) return Array.from(new Set(issues));
  if (isSourceNoise(source) || isMetadataOnly(source)) issues.push("source-is-metadata");

  const claimRole = classifyStatementRole(target);
  const sourceRole = classifyStatementRole(alignedSource);
  if (
    ["recommendation_for", "recommendation_against"].includes(claimRole) &&
    (
      claimRole !== sourceRole ||
      !sameManagementTarget(target, alignedSource)
    )
  ) {
    issues.push("recommendation-not-entailed");
  }

  if (EPISTEMIC_NEGATION.test(alignedSource) && !EPISTEMIC_NEGATION.test(target)) {
    issues.push("negated-source-promoted-to-support");
  }
  if (
    EXPLICIT_ABSENCE.test(alignedSource) !== EXPLICIT_ABSENCE.test(target) &&
    overlappingSubjectTerms(target, alignedSource) >= 2
  ) {
    issues.push("polarity-mismatch");
  }
  if (
    isHistoricalContext(source) &&
    !isHistoricalContext(target) &&
    !/\b(?:baseline|prior|previous|historical|history)\b/i.test(target)
  ) {
    issues.push("historical-source-promoted-to-current");
  }
  if (overlappingSubjectTerms(target, alignedSource) === 0) issues.push("no-shared-subject");
  return Array.from(new Set(issues));
}

export function isMetadataOnly(value: string) {
  const text = normalize(value);
  return /^(?:consult|consultation|update|progress note|planning discussion|medication review|specimen|study|collection interval|encounter)\s*[:#-]\s*(?:(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\s*)?(?:\d{1,2}:\d{2})?\s*[.!]?$/i.test(text) ||
    /^(?:report|document|record|note)\s+(?:date|time|title)\s*[:#-]/i.test(text);
}

export function isHistoricalContext(value: string) {
  const text = normalize(value);
  return /\b(?:historical|history of|previously|remote|unrelated prior|past medical history)\b/i.test(text) ||
    /^(?:a|an|the)?\s*prior\b/i.test(text) ||
    /(?:^|[_\s-])old(?:[_\s-]|$)/i.test(text);
}

export function isDirectCurrentEvidence(value: string) {
  const text = normalize(value);
  return !isHistoricalContext(text) && !/\b(?:background only|context only|unrelated to the current|does not address the current)\b/i.test(text);
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function overlappingSubjectTerms(left: string, right: string) {
  const rightTerms = new Set(subjectTerms(right));
  return subjectTerms(left).filter((term) => rightTerms.has(term)).length;
}

function mostRelevantSourceText(target: string, source: string) {
  const targetTerms = new Set(subjectTerms(target));
  const candidates = source
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (candidates.length <= 1) return source;
  const ranked = candidates
    .map((part) => ({
      part,
      score: subjectTerms(part).filter((term) => targetTerms.has(term)).length,
    }))
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.score ? ranked.slice(0, 2).map((item) => item.part).join(" ") : source;
}

function subjectTerms(value: string) {
  const stop = new Set([
    "about", "additional", "available", "clinical", "conclusion", "current", "documented",
    "evidence", "finding", "findings", "patient", "question", "record", "report", "result",
    "results", "source", "support", "supported", "that", "this", "uploaded", "with",
  ]);
  return Array.from(new Set(
    value.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)?.filter((term) => !stop.has(term)) ?? [],
  ));
}
