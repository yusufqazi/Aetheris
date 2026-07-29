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
  /\b(?:approve|avoid|begin|continue|defer|delay|discontinue|hold|initiate|monitor|proceed|recommend|restrict|start|stop|withhold)\w*\b/i;

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
  const leftTargets = managementTargetTokens(left);
  const rightTargets = managementTargetTokens(right);
  const sharedTargets = intersection(leftTargets, rightTargets);

  return sharedTargets.length >= 2 || sharedTargets.some(isDistinctiveTarget);
}

export function sameOutcomeQuestion(left: string, right: string) {
  const shared = intersection(subjectTokens(left), subjectTokens(right));

  if (shared.length >= 2) return true;
  return shared.some((token) => OUTCOME_ANCHORS.has(token));
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
    token.length >= 8 ||
    /^(?:biopsy|dialysis|fluids|surgery|sedation)$/.test(token);
}
