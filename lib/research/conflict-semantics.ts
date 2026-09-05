import type { GroundedFact } from "@/lib/types";
import {
  compareClinicalSourceOrder,
  isLaterClinicalUpdate,
  sameClinicalSource,
} from "@/lib/research/chronology";

const SUBJECT_STOP_WORDS = new Set([
  "additional",
  "assessment",
  "benefit",
  "clinical",
  "concern",
  "concerns",
  "continue",
  "continued",
  "decision",
  "defer",
  "deferred",
  "delay",
  "delayed",
  "document",
  "documents",
  "effect",
  "evidence",
  "finding",
  "findings",
  "group",
  "improved",
  "improvement",
  "management",
  "monitor",
  "negative",
  "observed",
  "outcome",
  "patient",
  "patients",
  "positive",
  "proceed",
  "recommend",
  "recommended",
  "report",
  "reported",
  "result",
  "results",
  "risk",
  "safety",
  "should",
  "significant",
  "source",
  "start",
  "started",
  "study",
  "support",
  "supported",
  "treatment",
  "trial",
  "worsened",
]);

const MANAGEMENT_ACTION =
  /\b(?:admit|approve|avoid|begin|continue|decrease|defer|delay|discharge|discontinue|escalate|hold|hospitali[sz]|increase|initiate|intensify|monitor|prefer|proceed|recommend|reduce|restrict|start|stop|taper|target|transfer|withhold)\w*\b/i;

const NEUTRAL_POSITION =
  /\b(?:does not|do not|did not|cannot|should not)\s+(?:determine|establish|constitute|represent|imply)\b.{0,100}\b(?:recommendation|whether|start|begin|initiate|hold|withhold|defer|delay|stop)\b|\b(?:not|neither)\s+(?:a\s+)?(?:treatment\s+)?recommendation\b|\bshould not be interpreted as\s+(?:a\s+)?recommendation\b|\bno position (?:is|was) taken\b/i;

const SAFETY_INFORMATION =
  /\b(?:risk|safety|hazard|toxicity|adverse|interaction|contraindication|monitoring consideration|medication safety)\w*\b/i;

const UNCERTAINTY_LANGUAGE =
  /\b(?:cannot exclude|not confirmed|not established|possible|plausible|suspected|uncertain|unclear|unknown|pending|insufficient evidence)\b/i;

const ELIGIBILITY_EVIDENCE =
  /\b(?:no|without)\b.{0,120}\b(?:contraindicat|prohibition|barrier)\w*\b|\b(?:contraindicat|prohibition|barrier)\w*\b.{0,80}\b(?:not identified|not found|absent)\b/i;

export type RecommendationAction = "proceed" | "delay" | "stop" | "restrict" | "monitor";
export type RecommendationConflictKind = "direct" | "timing-or-threshold";
export type GroundedRecommendationConflictState = "current" | "historical-resolved" | "invalid";
export type StatementRole =
  | "recommendation_for"
  | "recommendation_against"
  | "safety_information"
  | "observation"
  | "uncertainty"
  | "neutral";

export interface NormalizedRecommendation {
  action: RecommendationAction | null;
  stance: "for" | "against" | "neutral" | "informational";
  intensity: "increase" | "decrease" | "maintain" | null;
  timing: string[];
  conditions: string[];
  subjects: string[];
}

export function isNeutralPositionStatement(text: string) {
  const value = normalize(text);
  if (!NEUTRAL_POSITION.test(value)) return false;
  return !hasExplicitDirective(stripNeutralClarifications(value));
}

export function classifyStatementRole(text: string): StatementRole {
  const value = normalize(text);
  if (!value || isNeutralPositionStatement(value)) return "neutral";
  if (ELIGIBILITY_EVIDENCE.test(value)) {
    return SAFETY_INFORMATION.test(value) ? "safety_information" : "observation";
  }

  const action = recommendationAction(value);
  if (action === "proceed" || action === "monitor") return "recommendation_for";
  if (action === "delay" || action === "stop" || action === "restrict") {
    return "recommendation_against";
  }
  if (SAFETY_INFORMATION.test(value)) return "safety_information";
  if (UNCERTAINTY_LANGUAGE.test(value)) return "uncertainty";
  return "observation";
}

export function recommendationAction(text: string): RecommendationAction | null {
  const original = normalize(text);
  if (!original || isNeutralPositionStatement(original)) return null;
  const value = stripNeutralClarifications(original);

  if (ELIGIBILITY_EVIDENCE.test(value)) return null;
  if (/\bno objection to\b.{0,80}\b(?:discharg|proceed|transfer|start|begin|initiat|continu|use|administer)\w*\b/i.test(value)) {
    return "proceed";
  }
  if (/\b(?:do not|should not|must not|would not)\s+(?:delay|defer|postpone|withhold)\w*\b/i.test(value)) {
    return "proceed";
  }

  if (/\b(?:would|should|will|can|could|may)\s+not\s+(?:arrange|commit|prescribe|proceed|start|begin|initiate|continue|use|administer)\w*\b/i.test(value)) {
    return /\b(?:before|pending|until|unless|without)\b/i.test(value) ? "delay" : "stop";
  }

  if (/\b(?:do not|should not|must not|recommend(?:s|ed)?\s+against)\b.{0,80}\b(?:add|administer|begin|continue|escalate|initiate|perform|proceed|start|undertake|use)\w*\b/i.test(value)) {
    return "stop";
  }
  if (/\b(?:no\b.{0,80}|not)\b(?:is|are|was|were)?\s*recommended\b|\b(?:is|are|was|were)\s+not\s+recommended\b/i.test(value)) {
    return "stop";
  }
  if (/\b(?:prefer|recommend|advise)\w*\b.{0,120}\b(?:additional|another|repeat|further)\b.{0,100}\bbefore\b|\b(?:wait|remain|stay)\b.{0,100}\buntil\b/i.test(value)) {
    return "delay";
  }
  if (/\b(?:delay|defer|postpone|hold|withhold|wait)\w*\b/i.test(value)) return "delay";
  if (/\b(?:stop|discontinu|cease|avoid|contraindicat)\w*\b/i.test(value)) return "stop";
  if (/\b(?:restrict|dose reduction|lower starting dose|limited indication)\w*\b/i.test(value) ||
    /\b(?:reduce|decrease|lower|taper|de-escalate)\w*\b.{0,60}\b(?:dose|dosage|frequency|goal|intensity|rate|target|therapy|treatment)\w*\b/i.test(value) ||
    /^(?:reduce|decrease|lower|taper|de-escalate)\b/i.test(value)) return "restrict";
  if (
    /\b(?:monitor|surveillance|repeat|recheck|follow-up testing)\w*\b/i.test(value) &&
    !/\b(?:discharg|admit|admission|transfer|release home)\w*\b/i.test(value)
  ) return "monitor";

  const affirmativeRecommendation =
    /^(?:start|begin|initiate|continue|administer|proceed|approve|discharge|admit|transfer|use|increase|intensify|escalate|target)\b|\b(?:recommend|advise|favor|support|prefer)\w*\b.{0,120}\b(?:start|begin|initiate|continue|administer|proceed|discharge|admit|transfer|use|increase|intensify|escalate|target|treatment|therapy)\w*\b|\b(?:should|must|needs? to)\s+(?:be\s+)?(?:start|begin|initiat|continu|administer|proceed|discharg|admit|transfer|use|increas|intensif|escalat|target)\w*\b|\b(?:discharge|transfer|procedure|intervention|treatment|therapy)\b.{0,60}\b(?:is|are|may be|can be|could be)\s+(?:reasonable|appropriate|acceptable|possible|supported)\b|\b(?:is|are|was|were)\s+recommended\b/i;
  return affirmativeRecommendation.test(value) ? "proceed" : null;
}

export function normalizeRecommendation(text: string): NormalizedRecommendation {
  const value = stripNeutralClarifications(normalize(text));
  const action = recommendationAction(text);
  const intensity = /\b(?:reduce|decrease|lower|taper|de-escalate|less aggressive)\w*\b/i.test(value)
    ? "decrease" as const
    : /\b(?:increase|intensify|escalate|aggressive|higher|target)\w*\b/i.test(value)
      ? "increase" as const
      : action === "proceed"
        ? "maintain" as const
        : null;
  return {
    action,
    stance: !action
      ? isNeutralPositionStatement(text) ? "neutral" : "informational"
      : ["delay", "stop", "restrict"].includes(action) ? "against" : "for",
    intensity,
    timing: phraseMatches(value, /\b(?:after|before|now|once|pending|today|tomorrow|until|unless|when|while)\b[^.;]{0,80}/gi),
    conditions: phraseMatches(value, /\b(?:because|due to|given|if|unless|while)\b[^.;]{0,120}/gi),
    subjects: managementTargetTokens(value),
  };
}

export function recommendationsMateriallyConflict(left: string, right: string) {
  if (!sameManagementTarget(left, right)) return false;
  const leftRole = classifyStatementRole(left);
  const rightRole = classifyStatementRole(right);
  if (
    !["recommendation_for", "recommendation_against"].includes(leftRole) ||
    !["recommendation_for", "recommendation_against"].includes(rightRole)
  ) return false;
  const leftRecommendation = normalizeRecommendation(left);
  const rightRecommendation = normalizeRecommendation(right);
  if (conditionsAreDistinct(leftRecommendation.conditions, rightRecommendation.conditions)) {
    return false;
  }
  const leftAction = leftRecommendation.action;
  const rightAction = rightRecommendation.action;
  if (!leftAction || !rightAction) return false;
  if (leftRole === rightRole) {
    return numericRecommendationTargetsConflict(left, right) ||
      sameStanceBoundaryConflict(left, right, leftAction, rightAction);
  }
  if (leftAction === rightAction) return false;

  const conflict = (
    (leftAction === "proceed" && ["delay", "stop", "restrict"].includes(rightAction)) ||
    (rightAction === "proceed" && ["delay", "stop", "restrict"].includes(leftAction)) ||
    (leftAction === "stop" && ["delay", "restrict"].includes(rightAction)) ||
    (rightAction === "stop" && ["delay", "restrict"].includes(leftAction))
  );
  if (!conflict) return false;

  return !shareCompatibleTimingBoundary(left, right);
}

function conditionsAreDistinct(left: string[], right: string[]) {
  const leftBranches = left.filter((condition) => /\b(?:if|unless|when)\b/i.test(condition));
  const rightBranches = right.filter((condition) => /\b(?:if|unless|when)\b/i.test(condition));
  if (leftBranches.length === 0 || rightBranches.length === 0) return false;
  const leftTerms = subjectTokens(leftBranches.join(" "));
  const rightTerms = subjectTokens(rightBranches.join(" "));
  if (leftTerms.length === 0 || rightTerms.length === 0) return false;
  return intersection(leftTerms, rightTerms).length === 0;
}

export function groundedRecommendationsMateriallyConflict(
  left: GroundedFact,
  right: GroundedFact,
  facts: GroundedFact[] = [left, right],
) {
  return groundedRecommendationConflictState(left, right, facts) === "current";
}

export function groundedRecommendationConflictState(
  left: GroundedFact,
  right: GroundedFact,
  facts: GroundedFact[] = [left, right],
): GroundedRecommendationConflictState {
  if (!recommendationsMateriallyConflict(left.text, right.text)) return "invalid";
  const order = compareClinicalSourceOrder(left, right);
  if (order > 0 && isLaterClinicalUpdate(left, right)) return "invalid";
  if (order < 0 && isLaterClinicalUpdate(right, left)) return "invalid";

  const latestLeft = latestRecommendationForSource(left, facts);
  const latestRight = latestRecommendationForSource(right, facts);
  const wasUpdated = latestLeft.id !== left.id || latestRight.id !== right.id;
  if (wasUpdated && !recommendationsMateriallyConflict(latestLeft.text, latestRight.text)) {
    return "historical-resolved";
  }
  if (laterSourcePositionsConverge(left, right, facts)) return "historical-resolved";
  return "current";
}

export function questionRequestsHistoricalDisagreement(question: string) {
  return /\b(?:where|how|what)\s+(?:did|had|were|was)\b.{0,120}\b(?:disagree|differ|conflict)\w*\b|\b(?:historical|earlier|previous|previously|over time)\b.{0,80}\b(?:disagree|disagreement|differ|conflict)\w*\b/i.test(question);
}

function latestRecommendationForSource(reference: GroundedFact, facts: GroundedFact[]) {
  return facts.reduce((latest, candidate) => {
    if (
      !["recommendation_for", "recommendation_against"].includes(classifyStatementRole(candidate.text)) ||
      !sameManagementTarget(reference.text, candidate.text) ||
      !isSameSource(reference, candidate) ||
      compareClinicalSourceOrder(candidate, latest) <= 0
    ) {
      return latest;
    }
    return candidate;
  }, reference);
}

function isSameSource(left: GroundedFact, right: GroundedFact) {
  return sameClinicalSource(left, right);
}

export function recommendationConflictKind(left: string, right: string): RecommendationConflictKind | null {
  if (!recommendationsMateriallyConflict(left, right)) return null;
  return /\b(?:after|before|if|once|pending|today|tomorrow|until|unless|when|additional|another|repeat|further|dose|frequency|goal|intensity|rate|target|aggressive)\b/i.test(`${left} ${right}`)
    ? "timing-or-threshold"
    : "direct";
}

const OUTCOME_ANCHORS = new Set([
  "activity",
  "admission",
  "clearance",
  "control",
  "duration",
  "hospitalization",
  "mortality",
  "progression",
  "relapse",
  "remission",
  "response",
  "score",
  "survival",
  "symptoms",
  "toxicity",
]);

export function sameManagementTarget(left: string, right: string) {
  const leftObjects = decisionObjects(left);
  const rightObjects = decisionObjects(right);
  if (leftObjects.length > 0 || rightObjects.length > 0) {
    return intersection(leftObjects, rightObjects).length > 0;
  }
  const leftTargets = managementTargetTokens(left);
  const rightTargets = managementTargetTokens(right);
  const sharedTargets = intersection(leftTargets, rightTargets);

  return sharedTargets.length >= 2 || sharedTargets.some(isDistinctiveTarget) ||
    shareDecisionMetric(left, right);
}

function decisionObjects(text: string) {
  const value = normalize(text);
  const objects: string[] = [];
  if (
    /^(?:discharg|release home|leave (?:the )?hospital)\w*\b/i.test(value) ||
    /\b(?:ready|reasonable|appropriate|acceptable|possible|prefer(?:s|red)?|wait|stay|remain)\b.{0,60}\bdischarg\w*\b|\bdischarg\w*\b.{0,60}\b(?:reasonable|appropriate|acceptable|possible|recommended|prefer(?:s|red)?)\b|\b(?:additional|another|repeat|further)\b.{0,80}\bbefore discharg\w*\b/i.test(value)
  ) objects.push("disposition-discharge");
  if (/\b(?:admit|admission|hospitali[sz])\w*\b/i.test(value)) objects.push("disposition-admission");
  if (/\btransfer\w*\b/i.test(value)) objects.push("disposition-transfer");
  for (const procedure of ["biopsy", "bronchoscopy", "dialysis", "imaging", "surgery", "operation"]) {
    if (new RegExp(`\\b${procedure}\\w*\\b`, "i").test(value)) objects.push(`procedure-${procedure}`);
  }
  return objects;
}

export function sameOutcomeQuestion(left: string, right: string) {
  const shared = intersection(subjectTokens(left), subjectTokens(right));

  if (shared.length >= 2) return true;
  return shared.some((token) => OUTCOME_ANCHORS.has(token));
}

export function numericOutcomeDiffers(left: string, right: string) {
  const leftValues = numericValues(left);
  const rightValues = numericValues(right);
  if (
    leftValues.length === 0 ||
    rightValues.length === 0 ||
    (leftValues.length === rightValues.length && leftValues.every((value) => rightValues.includes(value)))
  ) return false;

  const leftTimepoints = timepointMarkers(left);
  const rightTimepoints = timepointMarkers(right);
  const isLongitudinal = [left, right].some((value) =>
    /\b(?:after|baseline|before|earlier|follow-up|initially|later|on admission|over time|then|trend)\b/i.test(value),
  );

  return !isLongitudinal || intersection(leftTimepoints, rightTimepoints).length > 0;
}

export function sameClinicalQuestion(left: string, right: string) {
  return sameManagementTarget(left, right) || sameOutcomeQuestion(left, right);
}

function managementTargetTokens(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const action = MANAGEMENT_ACTION.exec(normalized);
  if (!action) return subjectTokens(normalized);

  const afterAction = normalized
    .slice(action.index + action[0].length)
    .split(/\b(?:because|due to|given|if|until|unless|whereas|while)\b/i, 1)[0]
    .slice(0, 100);
  const actionTargets = subjectTokens(afterAction);

  return actionTargets.length > 0 ? actionTargets : subjectTokens(normalized);
}

function subjectTokens(text: string) {
  return Array.from(new Set(
    text.toLowerCase()
      .match(/[a-z]+-?\d+|[a-z]{4,}/g)
      ?.filter((token) => !SUBJECT_STOP_WORDS.has(token)) ?? [],
  ));
}

function intersection(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token));
}

function isDistinctiveTarget(token: string) {
  return /\d|-/.test(token) ||
    token.length >= 5;
}

function numericValues(text: string) {
  return text.toLowerCase().match(/\b\d+(?:\.\d+)?\s*(?:%|mg|mcg|g|ml|l|mmhg|mmol\/l|mg\/dl|ng\/ml|weeks?|months?|days?|hours?)?\b/g)
    ?.map((value) => value.replace(/\s+/g, "")) ?? [];
}

function timepointMarkers(text: string) {
  return Array.from(new Set(
    text.toLowerCase().match(
      /\b(?:at|on|by|during)\s+(?:week|month|day|hour)\s*\d+(?:\.\d+)?|\b(?:week|month|day|hour)\s*\d+(?:\.\d+)?\b/g,
    )?.map((value) => value.replace(/^(?:at|on|by|during)\s+/, "")) ?? [],
  ));
}

function shareCompatibleTimingBoundary(left: string, right: string) {
  const proceedText = recommendationAction(left) === "proceed" ? left : right;
  const deferText = proceedText === left ? right : left;
  const proceedBoundary = conditionTokens(proceedText, /\b(?:after|once|when)\b\s+(.{3,100})/i);
  const deferBoundary = conditionTokens(deferText, /\b(?:until|pending|while awaiting)\b\s+(.{3,100})/i);
  if (proceedBoundary.length === 0 || deferBoundary.length === 0) return false;
  return intersection(proceedBoundary, deferBoundary).length > 0;
}

function sameStanceBoundaryConflict(
  left: string,
  right: string,
  leftAction: RecommendationAction,
  rightAction: RecommendationAction,
) {
  const leftBoundary = decisionBoundaryTokens(left);
  const rightBoundary = decisionBoundaryTokens(right);
  if (leftBoundary.length === 0 || rightBoundary.length === 0) return false;
  if (intersection(leftBoundary, rightBoundary).length > 0) return false;
  return leftAction !== rightAction || leftAction === "delay";
}

function laterSourcePositionsConverge(
  left: GroundedFact,
  right: GroundedFact,
  facts: GroundedFact[],
) {
  const laterLeft = laterRecommendationsForSource(left, facts);
  const laterRight = laterRecommendationsForSource(right, facts);
  return laterLeft.some((leftUpdate) => laterRight.some((rightUpdate) =>
    leftUpdate.id !== rightUpdate.id &&
    sameManagementTarget(leftUpdate.text, rightUpdate.text) &&
    !recommendationsMateriallyConflict(leftUpdate.text, rightUpdate.text)
  ));
}

function laterRecommendationsForSource(reference: GroundedFact, facts: GroundedFact[]) {
  return facts.filter((candidate) =>
    candidate.id !== reference.id &&
    ["recommendation_for", "recommendation_against"].includes(classifyStatementRole(candidate.text)) &&
    isSameSource(reference, candidate) &&
    compareClinicalSourceOrder(candidate, reference) > 0
  );
}

function shareDecisionMetric(left: string, right: string) {
  const leftTargets = recommendationNumericTargets(left);
  const rightTargets = recommendationNumericTargets(right);
  return leftTargets.some((leftTarget) =>
    rightTargets.some((rightTarget) => leftTarget.unit === rightTarget.unit)
  );
}

function numericRecommendationTargetsConflict(left: string, right: string) {
  const leftTargets = recommendationNumericTargets(left);
  const rightTargets = recommendationNumericTargets(right);
  return leftTargets.some((leftTarget) => rightTargets.some((rightTarget) =>
    leftTarget.unit === rightTarget.unit &&
    (leftTarget.maximum < rightTarget.minimum || rightTarget.maximum < leftTarget.minimum)
  ));
}

function recommendationNumericTargets(text: string) {
  if (!/\b(?:dose|dosage|frequency|goal|intensity|limit|range|rate|target)\b/i.test(text)) return [];
  const normalized = text.replace(/[–—]/g, "-");
  const targets: Array<{ minimum: number; maximum: number; unit: string }> = [];
  const ranges = normalized.matchAll(
    /\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%]+(?:\s*\/\s*[a-zA-Z]+)?)/g,
  );
  for (const match of ranges) {
    targets.push({
      minimum: Number(match[1]),
      maximum: Number(match[2]),
      unit: match[3].replace(/\s+/g, "").toLowerCase(),
    });
  }
  if (targets.length > 0) return targets;

  const singles = normalized.matchAll(
    /\b(\d+(?:\.\d+)?)\s*([a-zA-Z%]+(?:\s*\/\s*[a-zA-Z]+)?)/g,
  );
  for (const match of singles) {
    const value = Number(match[1]);
    targets.push({
      minimum: value,
      maximum: value,
      unit: match[2].replace(/\s+/g, "").toLowerCase(),
    });
  }
  return targets;
}

function decisionBoundaryTokens(text: string) {
  const match = normalize(text).match(
    /\b(?:after|before|if|once|pending|solely because|until|unless|while awaiting)\b\s+(.{3,100})/i,
  );
  return match ? subjectTokens(match[1]) : [];
}

function conditionTokens(text: string, pattern: RegExp) {
  const match = normalize(text).match(pattern);
  return match ? subjectTokens(match[1]) : [];
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripNeutralClarifications(value: string) {
  return value
    .replace(/(?:^|[.;])\s*[^.;]{0,100}\bshould not be interpreted as\s+(?:a\s+)?recommendation\b[^.;]*/gi, " ")
    .replace(/(?:^|[.;])\s*[^.;]{0,60}\b(?:does not|do not|did not|is not|are not)\b[^.;]{0,100}\b(?:mean|require|recommend|constitute|represent|equivalent|cessation|stop|withhold)\w*[^.;]*/gi, " ")
    .replace(/\bnot\s+(?:a\s+)?(?:treatment\s+)?recommendation\b[^.;]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasExplicitDirective(value: string) {
  return /^(?:start|begin|initiate|continue|reduce|decrease|increase|intensify|escalate|target|hold|stop|avoid|defer|delay|monitor|discharge|admit|transfer)\b|\b(?:recommend|advise|favor|prefer)\w*\b.{0,120}\b(?:start|begin|initiate|continue|reduce|decrease|increase|intensify|escalate|target|hold|stop|avoid|defer|delay|monitor|discharge|admit|transfer)\w*\b|\b(?:should|must|needs? to)\s+(?:be\s+)?(?:start|begin|initiat|continu|reduc|decreas|increas|intensif|escalat|target|hold|stop|avoid|defer|delay|monitor|discharg|admit|transfer)\w*\b/i.test(value);
}

function phraseMatches(value: string, pattern: RegExp) {
  return Array.from(value.matchAll(pattern), (match) => match[0].trim()).slice(0, 3);
}
