import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import {
  isClinicallyImportantUncertainty,
  openQuestionsFromGap,
} from "@/lib/research/open-questions";
import { cleanSourcePassage, isSourceNoise } from "@/lib/research/source-cleaning";
import type {
  EvidenceItem,
  GroundedFact,
  GroundedFactCategory,
  ResearchContentType,
  ReportOutput,
} from "@/lib/types";
import { assessEvidenceConfidence } from "@/lib/research/confidence";
import {
  containsPrimaryAnswerSourceLeakage,
  paraphrasePrimaryAnswerEvidence,
  polishPrimaryAnswerFluency,
} from "@/lib/research/primary-answer";
import {
  classifyStatementRole,
  isNeutralPositionStatement,
  recommendationsMateriallyConflict,
} from "@/lib/research/conflict-semantics";
import { isHistoricalContext } from "@/lib/research/semantic-quality";

const CONCRETE_SIGNAL = /(?:\b\d+(?:\.\d+)?\s*%|\bp\s*[=<]\s*0?\.\d+|\b\d+(?:\.\d+)?\s+(?:participants?|patients?|subjects?|weeks?|months?|years?|events?|groups?|arms?|mg|mcg|mL|mmHg|bpm|ms)\b|\b[A-Za-z][A-Za-z /_-]{1,30}\s+\d+(?:\.\d+)?\s+(?:(?:to|→|->)\s+)?\d+(?:\.\d+)?\b|randomi[sz]ed|blind(?:ed)?|controlled|comparator|endpoint|adverse event|complication|excluded|uncertain|does not prove|not establish|follow-up|recommended|diagnos|disease|condition|syndrome|symptom|laborator|biomarker|imaging|procedure|treatment|therapy|medication|dose|improved|decreased|increased|normalized|persisted|progressed|resolved|risk|concern|discrepancy|contradiction)/i;
const CLINICAL_MEASUREMENT = /\b\d+(?:\.\d+)?\s*(?:%|mg(?:\/kg)?|mcg|µg|ug|g\/dL|mg\/dL|ng\/mL|pg\/mL|mmol\/L|mEq\/L|U\/L|IU\/L|mg\/L|mmHg|bpm|ms|mL\/min|cells?\/µL|copies\/mL|cm|mm|weeks?|months?|years?)\b|\bp\s*[=<]\s*0?\.\d+/i;
const CLINICAL_DECISION = /\b(?:proceed(?:ed|ing)?|begin|approve(?:d)?|initiat(?:e|ed|ing)|start(?:ed|ing)?|continu(?:e|ed|ing)|discontinu(?:e|ed|ing)|stop(?:ped|ping)?|hold|held|withhold(?:ing)?|withheld|delay(?:ed|ing)?|defer(?:red|ring)?|postpone(?:d|ment)?|switch(?:ed|ing)?|titrat(?:e|ed|ing)|escalat(?:e|ed|ing)|de-escalat(?:e|ed|ing)|reduc(?:e|ed|ing)|decreas(?:e|ed|ing)|increas(?:e|ed|ing)|intensif(?:y|ied|ying)|favor(?:s|ed|ing)?|prioriti[sz](?:e|ed|ing)|administer(?:ed|ing)?|dose[- ]adjusted|dose (?:increased|decreased|reduced)|treatment was (?:recommended|approved|deferred|delayed))\b/i;
const MONITORING_SIGNAL = /\b(?:monitor(?:ed|ing)?|repeat(?:ed)?|recheck(?:ed)?|surveillance|follow-up (?:testing|laboratory|imaging|ecg)|serial (?:laboratory|imaging|ecg)|recommended follow-up)\b/i;
const CLINICAL_DOMAIN_SIGNAL = /\b(?:diagnos(?:is|ed)|disease|condition|syndrome|symptom|sign|biomarker|laborator(?:y|ies)|serolog(?:y|ic)|antibod(?:y|ies)|complement|assay|test(?:ing)?|result|positive|negative|elevated|decreased|low|high|abnormal|normal|patholog(?:y|ic)|biopsy|culture|quantification|measurement|protein(?:uria)?|hematuria|renal|kidney|organ|function|imaging|scan|radiograph|procedure|bronchoscop(?:y|ic)|bronchoalveolar lavage|BAL|respiratory|pulmonary|oxygen|surgery|intervention|treatment|therapy|medication|drug|dose|specimen|lesion|mass|injury|infection)\b/i;
const SOURCE_INSTRUCTION = /^(?:summarize|identify|explain|assess|generate|review|compare)\b/i;
const INTERACTION_FOCUS = /\b(?:drug|medication|interaction|contraindication|harmful|coadmin)/i;
const LEADING_LABEL = /^(?:(?:key\s+)?finding|observation|question|unresolved question|recommendation|recommended action|treatment plan|plan|priority|status|safety observation|potential (?:contradiction|conflict)|discrepancy|change|limitation|evidence)\s*[:\-]\s*/i;
const TABLE_HEADER = /^(?:(?:medication|drug|combination|pair|measure|test|date|finding|observation|result|value|status|priority|concern|rationale|recommendation|reference|range|interpretation|source)(?:\s+|$)){2,}$/i;

export function extractGroundedFacts(evidence: EvidenceItem[], question: string): GroundedFact[] {
  const seen: Array<{ documentId: string; statement: string }> = [];
  const facts: GroundedFact[] = [];

  for (const item of evidence) {
    const candidates = splitSourceStatements(cleanSourcePassage(item.excerpt));

    for (let index = 0; index < candidates.length; index += 1) {
      const excerpt = candidates[index].trim();
      const statement = excerpt.replace(/\s+/g, " ").trim();
      if (
        (statement.length < 18 && !CLINICAL_MEASUREMENT.test(statement)) ||
        statement.length > 560 ||
        isTruncatedCandidate(excerpt, index, candidates, item) ||
        isIncompleteStatement(statement) ||
        isStructuralNoise(statement) ||
        isSourceNoise(statement) ||
        (SOURCE_INSTRUCTION.test(statement) && !CONCRETE_SIGNAL.test(statement)) ||
        !isCompleteClinicalProposition(statement) ||
        !(CONCRETE_SIGNAL.test(statement) || CLINICAL_MEASUREMENT.test(statement) || CLINICAL_DECISION.test(statement) || MONITORING_SIGNAL.test(statement) || CLINICAL_DOMAIN_SIGNAL.test(statement) || isRecommendation(statement) || isPotentialInteractionStatement(statement))
      ) {
        continue;
      }

      const contentType = classifyContentType(statement);
      const displayText = normalizeDisplayStatement(statement);
      const normalized = normalizeForDeduplication(displayText);
      if (!normalized || seen.some((existing) =>
        existing.documentId === item.documentId &&
        areEquivalentStatements(existing.statement, normalized),
      )) {
        continue;
      }
      seen.push({ documentId: item.documentId, statement: normalized });

      const category = legacyCategoryFor(contentType, displayText);
      facts.push({
        id: `fact:${item.id}:${index}`,
        category,
        contentType,
        text: displayText,
        evidenceId: item.id,
        documentId: item.documentId,
        documentName: item.documentName,
        page: item.page,
        excerpt,
        relevance: relevanceFor(contentType, category),
      });
    }
  }

  const ordered = facts.sort((left, right) => contentTypeOrder(left.contentType) - contentTypeOrder(right.contentType));
  return INTERACTION_FOCUS.test(question)
    ? ordered.sort((left, right) => Number(right.contentType === "interaction_concern") - Number(left.contentType === "interaction_concern"))
    : ordered;
}

function isIncompleteStatement(value: string) {
  if (/\.\.\.|…/.test(value)) return true;
  if (/\b(?:a|an|the|and|or|that|which|because|with|without|from|to|of|for|by|based on|consistent with|due to|including|following|frequent|initial|early|later|higher|lower)\s*[,:;-]*$/i.test(value)) return true;
  return /^(?:the\s+)?(?:first|second|third)\s+concern\s+is\s+that\b/i.test(value) && !/[.!?]$/.test(value);
}

function isTruncatedCandidate(
  excerpt: string,
  index: number,
  candidates: string[],
  evidence: EvidenceItem,
) {
  if (index === 0 && evidence.contextBefore.trim()) {
    const prior = evidence.contextBefore.trimEnd();
    if (!/[.!?]["')\]]?$/.test(prior) && /^[a-z]/.test(excerpt)) return true;
  }
  if (index !== candidates.length - 1 || /[.!?)]$/.test(excerpt)) return false;
  return evidence.contextAfter.trim().length > 0;
}

export function factsByCategory(facts: GroundedFact[], ...categories: GroundedFactCategory[]) {
  return facts.filter((fact) => categories.includes(fact.category));
}

export function isIncompletePrimaryAnswer(value: string) {
  return /\b(?:do not|does not|did not|cannot|can't|could not|fail(?:s|ed)? to)\s+(?:fully\s+)?(?:establish|provide|support|produce|answer)\b.{0,80}\b(?:complete|reliable|definitive|overall)?\s*answer\b|\b(?:not enough|insufficient)\b.{0,60}\b(?:evidence|information)\b.{0,60}\banswer\b/i.test(value);
}

export function buildBestSupportedAnswer(question: string, facts: GroundedFact[]) {
  const coverage = assessPrimaryAnswerEvidence(question, facts);
  if (new Set(facts.map((fact) => fact.documentId)).size <= 1) {
    return buildSingleDocumentAnswer(question, coverage);
  }
  if (coverage.requestedParts.length >= 3) {
    return buildEvidenceLimitedAnswer(coverage);
  }
  if (coverage.evidenceLimited) {
    return buildEvidenceLimitedAnswer(coverage);
  }

  const answerFacts = coverage.eligibleFacts;
  const interactions = answerFacts.filter((fact) => fact.contentType === "interaction_concern");
  const efficacy = answerFacts.filter((fact) =>
    (fact.contentType === "finding" || fact.contentType === "longitudinal_change") &&
    (fact.category === "efficacy" || fact.category === "statistical"),
  );
  const safety = answerFacts.filter((fact) =>
    fact.contentType === "safety_observation" ||
    (fact.contentType === "longitudinal_change" && fact.category === "safety"),
  );
  const decisions = answerFacts.filter((fact) =>
    fact.contentType === "recommendation" && isClinicallyMaterialRecommendation(fact.text),
  );
  const context = answerFacts.filter((fact) =>
    (fact.contentType === "finding" || fact.contentType === "evidence_excerpt") &&
    (fact.category === "context" || fact.category === "study-design"),
  );
  const uncertainties = answerFacts.filter((fact) =>
    fact.contentType === "limitation" ||
    fact.contentType === "discrepancy" ||
    fact.contentType === "unresolved_question" ||
    isClinicallyImportantUncertainty(fact.text),
  );

  return buildDirectAnswer({
    question,
    interactions,
    efficacy,
    safety,
    decisions,
    context,
    uncertainties,
  });
}

export type PrimaryAnswerPart =
  | "diagnosis"
  | "treatment"
  | "disposition"
  | "disagreement"
  | "tradeoff"
  | "remaining-evidence"
  | "efficacy"
  | "safety"
  | "limitations"
  | "durability"
  | "generalizability"
  | "interactions"
  | "monitoring"
  | "laboratory"
  | "regulatory"
  | "conclusion";

export interface PrimaryAnswerEvidenceAssessment {
  requestedParts: PrimaryAnswerPart[];
  supportedParts: PrimaryAnswerPart[];
  unsupportedParts: PrimaryAnswerPart[];
  evidenceLimited: boolean;
  eligibleFacts: GroundedFact[];
  factsByPart: Partial<Record<PrimaryAnswerPart, GroundedFact[]>>;
  partStatus: Record<PrimaryAnswerPart, "ANSWERED" | "PARTIALLY_ANSWERED" | "INSUFFICIENT_EVIDENCE">;
}

export function assessPrimaryAnswerEvidence(
  question: string,
  facts: GroundedFact[],
): PrimaryAnswerEvidenceAssessment {
  const requestedParts = requestedPrimaryAnswerParts(question);
  const eligibleFacts = facts
    .map(sanitizePrimaryAnswerFact)
    .filter((fact): fact is GroundedFact => Boolean(fact))
    .filter(isPrimaryAnswerFact);
  const factsByPart = Object.fromEntries(
    requestedParts.map((part) => [
      part,
      rankFactsForQuestion(
        eligibleFacts.filter((fact) => factSupportsAnswerPart(fact, part)),
        question,
      ),
    ]),
  ) as Partial<Record<PrimaryAnswerPart, GroundedFact[]>>;
  const supportedParts = requestedParts.filter((part) => {
    const partFacts = factsByPart[part] ?? [];
    if (part !== "disagreement") return partFacts.length > 0;
    return partFacts.some((left, index) =>
      partFacts.slice(index + 1).some((right) =>
        left.documentId !== right.documentId &&
        recommendationsMateriallyConflict(left.text, right.text)
      )
    );
  });
  const unsupportedParts = requestedParts.filter((part) => !supportedParts.includes(part));
  const minimumContext = Math.max(2, requestedParts.length);
  const partStatus = Object.fromEntries(requestedParts.map((part) => {
    const partFacts = factsByPart[part] ?? [];
    if (supportedParts.includes(part)) {
      const qualified = partFacts.some((fact) =>
        ["limitation", "discrepancy", "unresolved_question"].includes(fact.contentType) ||
        isClinicallyImportantUncertainty(fact.text)
      );
      return [part, qualified ? "PARTIALLY_ANSWERED" : "ANSWERED"];
    }
    return [part, "INSUFFICIENT_EVIDENCE"];
  })) as PrimaryAnswerEvidenceAssessment["partStatus"];

  return {
    requestedParts,
    supportedParts,
    unsupportedParts,
    evidenceLimited:
      eligibleFacts.length < minimumContext ||
      unsupportedParts.length > 0,
    eligibleFacts,
    factsByPart,
    partStatus,
  };
}

export function requestedPrimaryAnswerParts(question: string): PrimaryAnswerPart[] {
  const requested: PrimaryAnswerPart[] = [];
  const add = (part: PrimaryAnswerPart, pattern: RegExp) => {
    if (pattern.test(question) && !requested.includes(part)) requested.push(part);
  };

  add("diagnosis", /\b(?:diagnos|etiology|cause|most likely|leading interpretation|drivers?)\w*\b|\bwhat\s+(?:is|was)\s+driving\b/i);
  add(
    "treatment",
    /\b(?:management|treatment priority|therapy priority|recommend|proceed|begin|start|continue|reduce|decrease|increase|intensify|defer|delay|hold|stop)\w*\b|\b(?:what|which|how)\b.{0,50}\b(?:treat|therap|manage)\w*\b|\bhow\s+(?:aggressively|intensively|rapidly|frequently|strongly)\b/i,
  );
  add("disposition", /\b(?:discharge|disposition|ready to leave|ready for (?:release|transfer)|hospital release|admission readiness|transfer readiness)\w*\b/i);
  add("disagreement", /\b(?:disagree|disagreement|conflict|differ(?:ence|ing)?|specialists? genuinely disagree)\w*\b/i);
  add("tradeoff", /\b(?:tradeoff|trade-off|balance|benefit versus risk|competing choice|constraint)\w*\b/i);
  add("remaining-evidence", /\b(?:remaining|missing|unresolved|uncertain|additional evidence|evidence (?:is )?still needed|what evidence.{0,30}needed|open questions?)\w*\b/i);
  add("efficacy", /\b(?:efficacy|effective|response|benefit|outcomes?|improvement)\w*\b/i);
  add("safety", /\b(?:safety|adverse|toxicity|harm|risk|tolerability)\w*\b/i);
  add("limitations", /\b(?:limitations?|caveats?|weaknesses?|evidence gaps?)\w*\b/i);
  add("durability", /\b(?:durability|long[- ]term|follow-up|sustained|persistent)\w*\b/i);
  add("generalizability", /\b(?:generali[sz]ability|population applicability|external validity)\w*\b/i);
  add("interactions", /\b(?:drug|medication)\s+interactions?\b|\bcontraindications?\b/i);
  add("monitoring", /\b(?:monitor|surveillance|follow-up testing|repeat testing)\w*\b/i);
  add("laboratory", /\b(?:laborator|biomarker|serolog|blood test|urine test)\w*\b/i);
  add("regulatory", /\b(?:regulatory|approval|authorization|label readiness)\w*\b/i);

  return requested.length > 0 ? requested : ["conclusion"];
}

export function decomposeResearchQuestion(question: string) {
  return requestedPrimaryAnswerParts(question).map((intent) => ({
    intent,
    subject: questionSubjectForIntent(question, intent),
  }));
}

export function primaryAnswerCoverageIssues(
  answer: string,
  question: string,
  facts: GroundedFact[],
) {
  const coverage = assessPrimaryAnswerEvidence(question, facts);
  return coverage.requestedParts.filter((part) =>
    !answerAddressesPart(answer, part, coverage.supportedParts.includes(part))
  ).map((part) => `missing-${part}`);
}

export function primaryAnswerConsistencyIssues(
  answer: string,
  question: string,
  facts: GroundedFact[],
) {
  const coverage = assessPrimaryAnswerEvidence(question, facts);
  const issues: string[] = [];
  if (
    coverage.supportedParts.includes("diagnosis") &&
    /\b(?:diagnosis|cause|etiology)\b.{0,50}\b(?:cannot be determined|cannot be established|is unknown|is unclear|insufficient evidence)\b/i.test(answer)
  ) {
    issues.push("supported-diagnosis-denied");
  }
  if (
    coverage.supportedParts.includes("disposition") &&
    /\b(?:discharge|disposition|readiness)\b.{0,50}\b(?:cannot be determined|cannot be established|is unknown|is unclear|insufficient evidence)\b/i.test(answer)
  ) {
    issues.push("supported-disposition-denied");
  }
  if (
    coverage.supportedParts.includes("disagreement") &&
    (/\b(?:no|cannot determine|cannot be determined|no evidence of)\b.{0,50}\b(?:disagreement|conflict|difference)\b/i.test(answer) ||
      /\b(?:disagreement|conflict|difference)\b.{0,50}\b(?:cannot be determined|cannot be established|is unknown|is unclear|insufficient evidence)\b/i.test(answer))
  ) {
    issues.push("supported-disagreement-denied");
  }
  if (
    coverage.supportedParts.includes("remaining-evidence") &&
    (/\b(?:no|without)\b.{0,45}\b(?:additional|missing|pending|unresolved)\s+evidence\b/i.test(answer) ||
      /\b(?:additional|missing|pending|unresolved)\s+evidence\b.{0,45}\b(?:is not needed|cannot be identified|is unavailable)\b/i.test(answer))
  ) {
    issues.push("supported-evidence-gap-denied");
  }
  return issues;
}

function isPrimaryAnswerFact(fact: GroundedFact) {
  const text = normalizeDisplayStatement(cleanSourcePassage(fact.text));
  if (
    !text ||
    isSourceNoise(text) ||
    isStructuralNoise(text) ||
    isIncompleteStatement(text) ||
    !isCompleteClinicalProposition(text)
  ) {
    return false;
  }
  if (
    /^(?:purpose|document purpose|document type|source|filename|file name|table|row|column|field|page|section|prepared for|prepared by|reviewed by|mrn|medical record number)\s*[:\-]/i.test(text) ||
    /^(?:this|the)\s+(?:document|report|record|summary|table)\s+(?:provides|contains|summarizes|describes|was (?:created|prepared)|is intended)\b/i.test(text)
  ) {
    return false;
  }
  return true;
}

function sanitizePrimaryAnswerFact(fact: GroundedFact) {
  const text = paraphrasePrimaryAnswerEvidence(fact.text);
  const excerpt = text || paraphrasePrimaryAnswerEvidence(fact.excerpt);
  const answerText = text || excerpt;
  if (!answerText || containsPrimaryAnswerSourceLeakage(answerText)) return null;
  return {
    ...fact,
    text: answerText,
    excerpt: answerText,
  };
}

function factSupportsAnswerPart(fact: GroundedFact, part: PrimaryAnswerPart) {
  const text = `${fact.text} ${fact.excerpt}`;
  switch (part) {
    case "diagnosis":
      return isDiagnosticFact(fact);
    case "treatment":
      return fact.contentType === "recommendation" && isClinicallyMaterialRecommendation(fact.text);
    case "disposition":
      return isDispositionFact(fact);
    case "disagreement":
      return fact.contentType === "recommendation" && isClinicallyMaterialRecommendation(fact.text);
    case "tradeoff":
      return ["interaction_concern", "safety_observation", "discrepancy"].includes(fact.contentType) ||
        isMaterialTradeoff(text);
    case "remaining-evidence":
    case "limitations":
      return ["limitation", "discrepancy", "unresolved_question"].includes(fact.contentType) ||
        (
          fact.contentType !== "recommendation"
            ? isClinicallyImportantUncertainty(text)
            : /\b(?:additional|another|repeat|further)\b.{0,100}\b(?:measurement|test|result|laborator|imaging|assessment)\w*\b.{0,100}\b(?:before|until|pending)\b|\b(?:before|until|pending)\b.{0,100}\b(?:additional|another|repeat|further)\b/i.test(text)
        );
    case "efficacy":
      return ["efficacy", "statistical"].includes(fact.category) ||
        /\b(?:efficacy|effective|response|responded|improv|benefit|remission|survival|outcome)\w*\b/i.test(text);
    case "safety":
      return fact.contentType === "safety_observation" ||
        fact.category === "safety" ||
        /\b(?:adverse|toxicity|harm|safety|tolerab|complication|worsen)\w*\b/i.test(text);
    case "durability":
      return fact.contentType === "longitudinal_change" ||
        /\b(?:follow-up|sustained|persist|durab|long[- ]term|months?|years?)\w*\b/i.test(text);
    case "generalizability":
      return ["study-design", "exclusion"].includes(fact.category) ||
        /\b(?:population|eligib|excluded|represented|generali[sz]|external validity|subgroup)\w*\b/i.test(text);
    case "interactions":
      return fact.contentType === "interaction_concern";
    case "monitoring":
      return MONITORING_SIGNAL.test(text);
    case "laboratory":
      return /\b(?:laborator|biomarker|serolog|antibod|complement|creatinine|proteinuria|hematuria|culture)\w*\b/i.test(text) ||
        CLINICAL_MEASUREMENT.test(text);
    case "regulatory":
      return /\b(?:regulatory|approv|authori[sz]|label|indication)\w*\b/i.test(text);
    case "conclusion":
      return !["unresolved_question", "evidence_excerpt"].includes(fact.contentType);
  }
}

function buildEvidenceLimitedAnswer(coverage: PrimaryAnswerEvidenceAssessment) {
  const disagreement = coverage.requestedParts.includes("disagreement")
    ? findRecommendationDisagreement(coverage.factsByPart.disagreement ?? [])
    : "";
  const supportedSentences = coverage.supportedParts.flatMap((part) => {
    const facts = coverage.factsByPart[part] ?? [];
    if (facts.length === 0) return [];
    const primary = facts[0];

    if (part === "diagnosis") return [synthesizeConclusion(facts.slice(0, 4))];
    if (part === "treatment") {
      const treatmentFacts = disagreement
        ? facts.filter((fact) => !disagreement.factIds.includes(fact.id))
        : facts;
      return treatmentFacts.length > 0
        ? [synthesizeTreatmentPriority(treatmentFacts.slice(0, 3), true)]
        : [];
    }
    if (part === "disposition") return [synthesizeDisposition(facts)];
    if (part === "disagreement") {
      return disagreement ? [disagreement.sentence] : [];
    }
    if (part === "tradeoff") {
      const risk = facts.find((fact) => isMaterialTradeoff(`${fact.text} ${fact.excerpt}`));
      return risk ? [synthesizeTradeoff(undefined, risk, "tradeoff")] : [];
    }
    if (part === "remaining-evidence") {
      return [synthesizeRemainingEvidence(facts, "remaining evidence")];
    }
    if (part === "limitations") return [evidenceLimitedFactSentence(primary.text)];
    return [evidenceLimitedFactSentence(primary.text)];
  }).filter(Boolean);
  if (coverage.requestedParts.includes("diagnosis")) {
    const objective = coverage.eligibleFacts.find((fact) =>
      !["recommendation", "limitation", "discrepancy", "unresolved_question"].includes(fact.contentType) &&
      !isHistoricalContext(`${fact.documentName} ${fact.text} ${fact.excerpt}`) &&
      (isObjectiveFact(fact) || CLINICAL_MEASUREMENT.test(fact.text))
    );
    if (objective) supportedSentences.splice(1, 0, ensureClinicalSentence(objective.text));
    const trajectory = coverage.eligibleFacts.find((fact) =>
      fact.contentType === "longitudinal_change" &&
      /\b(?:increas|decreas|improv|worsen|rose|fell|from\s+\d+.*to\s+\d+)\w*\b/i.test(fact.text)
    );
    if (trajectory && trajectory.id !== objective?.id) {
      supportedSentences.splice(objective ? 2 : 1, 0, ensureClinicalSentence(trajectory.text));
    }
  }
  const uniqueSupported = Array.from(new Set(supportedSentences));
  const unsupported = coverage.unsupportedParts.map(primaryAnswerPartLabel);

  if (uniqueSupported.length === 0) {
    return normalizeEvidenceLimitedProse(
      `${naturalList(coverage.requestedParts.map(primaryAnswerPartLabel), true)} cannot be determined from the uploaded evidence because no complete, relevant clinical finding supports those parts of the question.`,
    );
  }

  const limitation = unsupported.length > 0
    ? `${naturalList(unsupported, true)} cannot be determined from the uploaded evidence.`
    : "";
  return normalizeEvidenceLimitedProse([...uniqueSupported, limitation].filter(Boolean).join(" "));
}

function buildSingleDocumentAnswer(
  question: string,
  coverage: PrimaryAnswerEvidenceAssessment,
) {
  const scopedFacts = uniqueFacts(coverage.supportedParts.flatMap(
    (part) => coverage.factsByPart[part] ?? [],
  ));
  const clinicalFindings = rankFactsForQuestion(scopedFacts.filter((fact) =>
    !["limitation", "discrepancy", "unresolved_question", "recommendation"].includes(fact.contentType)
  ), question);
  const recommendations = rankFactsForQuestion(scopedFacts.filter((fact) =>
    fact.contentType === "recommendation"
  ), question);
  const limitations = rankFactsForQuestion(scopedFacts.filter((fact) =>
    ["limitation", "discrepancy", "unresolved_question"].includes(fact.contentType)
  ), question);
  const established = clinicalFindings[0] ?? recommendations[0];
  const implication = recommendations.find((fact) => fact.id !== established?.id)
    ?? clinicalFindings.find((fact) => fact.id !== established?.id);
  const sentences: string[] = [];

  if (established) {
    sentences.push(singleDocumentEstablishedSentence(established.text));
  } else {
    sentences.push(
      "The uploaded document does not contain a complete clinical finding that directly establishes the requested conclusion.",
    );
  }

  if (implication) {
    sentences.push(singleDocumentImplicationSentence(implication));
  } else {
    sentences.push(
      "A separate safety or efficacy implication cannot be supported from the available evidence.",
    );
  }

  const unsupported = coverage.unsupportedParts.map(primaryAnswerPartLabel);
  if (unsupported.length > 0) {
    sentences.push(
      `${naturalList(unsupported, true)} cannot be determined from the available evidence.`,
    );
  } else {
    const unresolved = limitations.find((fact) =>
      /\b(?:cannot determine|uncertain|unknown|not established|not supported|unresolved)\b/i.test(fact.text)
    );
    sentences.push(unresolved
      ? evidenceLimitedFactSentence(unresolved.text)
      : "The document alone does not establish conclusions beyond these directly supported points.");
  }

  const followUp = limitations.find((fact) =>
    fact.id !== established?.id &&
    fact.id !== implication?.id &&
    /\b(?:additional|further|pending|needed|requires?|follow-up|study data|results?|testing)\b/i.test(fact.text)
  ) ?? limitations.find((fact) =>
    fact.id !== established?.id &&
    fact.id !== implication?.id &&
    coverage.requestedParts.includes("limitations")
  );
  if (followUp) sentences.push(evidenceLimitedFactSentence(followUp.text));

  return normalizeEvidenceLimitedProse(uniqueStrings(sentences).slice(0, 4).join(" "));
}

function singleDocumentEstablishedSentence(value: string) {
  const supportedSentence = evidenceLimitedFactSentence(value);
  if (/^The available evidence shows\b/i.test(supportedSentence)) {
    return supportedSentence;
  }
  const sentence = supportedSentence
    .replace(/^The available evidence shows that\s+/i, "")
    .replace(/^The available evidence shows\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  if (!sentence) {
    return "The uploaded document does not contain a complete clinical finding that directly establishes the requested conclusion.";
  }
  return `The document establishes that ${lowercaseFirst(sentence)}.`;
}

function singleDocumentImplicationSentence(fact: GroundedFact) {
  const sentence = evidenceLimitedFactSentence(fact.text)
    .replace(/^The available evidence shows that\s+/i, "")
    .replace(/^The available evidence shows\s+/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
  const dimension = fact.contentType === "safety_observation" || fact.category === "safety"
    ? "safety"
    : "efficacy";
  return sentence
    ? `The most important ${dimension} implication is that ${lowercaseFirst(sentence)}.`
    : `A separate ${dimension} implication cannot be supported from the available evidence.`;
}

function primaryAnswerPartLabel(part: PrimaryAnswerPart) {
  return ({
    diagnosis: "the diagnosis or cause",
    treatment: "a treatment priority",
    disposition: "discharge or disposition readiness",
    disagreement: "the specialist disagreement",
    tradeoff: "the requested management tradeoff",
    "remaining-evidence": "which additional evidence is required",
    efficacy: "treatment efficacy",
    safety: "the safety profile",
    limitations: "the important evidence limitations",
    durability: "durability of the observed outcome",
    generalizability: "generalizability to the requested population",
    interactions: "clinically meaningful drug interactions",
    monitoring: "a monitoring plan",
    laboratory: "the interpretation of the requested laboratory evidence",
    regulatory: "regulatory readiness",
    conclusion: "the broader research question",
  } satisfies Record<PrimaryAnswerPart, string>)[part];
}

function evidenceLimitedFactSentence(value: string) {
  const text = paraphrasePrimaryAnswerEvidence(value)
    .replace(/^[\s>*#`_-]*(?:\d+[.)]\s*)?/, "")
    .trim();
  if (!text) return "";
  if (
    /^The available evidence shows\b/i.test(text) ||
    /\b(?:cannot determine|remains? uncertain|is uncertain|are uncertain)\b/i.test(text)
  ) {
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }
  const completePredicate = /\b(?:is|are|was|were|has|have|had|may|might|can|could|should|will|would|remains?|appears?|suggests?|supports?|indicates?|shows?|confirms?|requires?|recommends?|documents?|identifies?|raises?|increases?|decreases?|improved|worsened|persisted|resolved|grew|tested|received|underwent|developed)\b/i.test(text);
  const statement = completePredicate
    ? `The available evidence shows that ${lowercaseFirst(text.replace(/[.!?]+$/, ""))}`
    : `The available evidence shows ${lowercaseFirst(text.replace(/[.!?]+$/, ""))}`;
  return /[.!?]$/.test(statement) ? statement : `${statement}.`;
}

function normalizeEvidenceLimitedProse(value: string) {
  const normalized = value
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function lowercaseFirst(value: string) {
  if (!value || /^[A-Z]{2,}\b/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function buildGroundedReport({
  question,
  facts,
  evidence,
  executiveSummaryOverride,
}: {
  question: string;
  facts: GroundedFact[];
  evidence: EvidenceItem[];
  executiveSummaryOverride?: string;
}): ReportOutput {
  const interactions = facts.filter((fact) => fact.contentType === "interaction_concern");
  const efficacy = facts.filter((fact) =>
    (fact.contentType === "finding" || fact.contentType === "longitudinal_change") &&
    (fact.category === "efficacy" || fact.category === "statistical"),
  );
  const safety = facts.filter((fact) =>
    fact.contentType === "safety_observation" ||
    (fact.contentType === "longitudinal_change" && fact.category === "safety"),
  );
  const decisions = facts.filter((fact) =>
    fact.contentType === "recommendation" && isClinicallyMaterialRecommendation(fact.text),
  );
  const context = facts.filter((fact) => fact.contentType === "finding" && fact.category === "study-design");
  const uncertainties = facts.filter((fact) =>
    fact.contentType === "limitation" || fact.contentType === "discrepancy",
  );
  const interactionFocused = INTERACTION_FOCUS.test(question);
  const keyFindings = uniqueFacts(interactionFocused
    ? [...interactions.slice(0, 6), ...efficacy.slice(0, 2)]
    : [...efficacy.slice(0, 6), ...interactions.slice(0, 3), ...decisions.slice(0, 2)]).slice(0, 8);
  const safetyFindings = uniqueFacts(safety).slice(0, 4);
  const contextFindings = uniqueFacts(context).slice(0, 3);
  const uncertaintyFindings = uniqueFacts(uncertainties).slice(0, 4);
  const executiveSummary = executiveSummaryOverride ?? buildBestSupportedAnswer(question, facts);
  const missingEvidence = buildMissingEvidence(facts, interactionFocused);
  const followUpQuestions = buildFollowUpQuestions(question, facts);
  const reportFacts = uniqueFacts([
    ...keyFindings,
    ...safetyFindings,
    ...contextFindings,
    ...uncertaintyFindings,
  ]);
  const markdownReport = buildMarkdownReport({
    question,
    executiveSummary,
    keyFindings,
    safety: safetyFindings,
    context: contextFindings,
    uncertainties: uncertaintyFindings,
    missingEvidence,
    followUpQuestions,
    facts: reportFacts,
  });
  const confidence = assessEvidenceConfidence({
    facts: reportFacts,
    evidence,
    missingEvidenceCount: missingEvidence.length,
  }).level;

  return {
    agentName: "Report Generation Agent",
    summary: `Assembled ${reportFacts.length} non-duplicated source-grounded findings into a traceable answer.`,
    confidence,
    limitations: missingEvidence,
    warnings: [RESEARCH_DISCLAIMER],
    evidence: evidence.slice(0, 12),
    executiveSummary,
    keyFindings: keyFindings.map((fact) => fact.text),
    evidenceTable: reportFacts.map((fact) => ({
      topic: labelForContentType(fact.contentType, fact.category),
      finding: fact.text,
      supportingSource: `${fact.documentName}${fact.page ? `, page ${fact.page}` : ""}`,
      confidence: "Source-extracted",
    })),
    risksAndUncertainties: missingEvidence,
    recommendedFollowUpQuestions: followUpQuestions,
    researchDisclaimer: RESEARCH_DISCLAIMER,
    physicianBriefing: "",
    patientFriendlySummary: "",
    markdownReport,
  };
}

export function isConcreteReport(report: ReportOutput, facts: GroundedFact[], question = "") {
  if (facts.length === 0 || report.evidence.length === 0 || report.keyFindings.length === 0) {
    return false;
  }

  const sourceText = facts.map((fact) => `${fact.text} ${fact.excerpt}`).join(" ").toLowerCase();
  const reportText = [report.executiveSummary, ...report.keyFindings].join(" ");
  const numericTokens = reportText.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  const numbersGrounded = numericTokens.every((token) => sourceText.includes(token.toLowerCase()));
  const topical = !INTERACTION_FOCUS.test(question) || /interaction|medication|drug|exposure|coadministration/i.test(reportText);
  const uniqueFindings = new Set(report.keyFindings.map((finding) => normalizeForDeduplication(finding)));
  return numbersGrounded && topical && uniqueFindings.size === report.keyFindings.length;
}

function splitSourceStatements(text: string) {
  const blocks = text
    .replace(/\s*\u2022\s*/g, "\n\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks
    .flatMap((block) => reflowSourceLines(groupLikelyTableRows(
      block.split(/\n+/).map((line) => line.trim()).filter(Boolean),
    )))
    .flatMap((statement) => statement.split(/(?<=[.!?])\s+(?=[A-Z0-9(])/))
    .map((statement) => statement.trim())
    .filter((statement) => statement.length >= 10 && /^[A-Z0-9(]/.test(statement));
}

function reflowSourceLines(lines: string[]) {
  const statements: string[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer.trim()) statements.push(buffer.replace(/\s+/g, " ").trim());
    buffer = "";
  };

  for (const line of lines) {
    const structural = TABLE_HEADER.test(
      line.replace(/[:|/\-]+/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (structural) {
      flush();
      statements.push(line);
      continue;
    }
    if (buffer && LEADING_LABEL.test(line)) flush();
    buffer = buffer ? `${buffer} ${line}` : line;
    if (/[.!?]["')\]]?$/.test(line)) flush();
  }
  flush();
  return statements;
}

function groupLikelyTableRows(lines: string[]) {
  const grouped: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const medicationRow = /^[A-Z][A-Za-z-]+\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|mL)\b/i.test(line);
    if (!medicationRow) {
      grouped.push(line);
      continue;
    }

    const parts = [line];
    const next = lines[index + 1] ?? "";
    const following = lines[index + 2] ?? "";
    if (/^(?:active|inactive|current|historical)$/i.test(next)) {
      parts.push(next);
      index += 1;
      if (/^(?:can|may|could|should)\b/i.test(following)) {
        parts.push(following);
        index += 1;
      }
    } else if (/^(?:can|may|could|should)\b/i.test(next)) {
      parts.push(next);
      index += 1;
    }
    grouped.push(parts.join(" "));
  }
  return grouped;
}

export function classifyContentType(text: string): ResearchContentType {
  const value = text.replace(/\s+/g, " ").trim();
  if (isQuestion(value)) return "unresolved_question";
  if (isNeutralPositionStatement(value)) {
    return /\b(?:risk|safety|interaction|toxicity|adverse|monitor)\w*\b/i.test(value)
      ? "safety_observation"
      : "evidence_excerpt";
  }
  if (isRecommendation(value)) return "recommendation";
  if (isLongitudinalChange(value)) return "longitudinal_change";
  if (/\b(?:contradiction|discrepancy|inconsisten(?:t|cy)|conflicting|conflict between|differs? between|documentation differs|reported differently)\b|\b(?:document|record|note|history)\b.{0,80}\b(?:whereas|but|versus|vs\.?|differs?)\b/i.test(value)) {
    return "discrepancy";
  }
  if (isPotentialInteractionStatement(value)) {
    return "interaction_concern";
  }
  if (/limitation|uncertain|does not prove|not establish|unresolved|missing evidence|not formally exclude|small subgroup|limited (?:to|follow-up)|confidence intervals overlap|remain(?:s|ed)? unknown|insufficient evidence|cannot determine|excluded|not represented|\bpending\b|\bawaited\b|not yet (?:performed|completed|obtained|measured|quantified|reported|available)|has not (?:yet )?(?:been )?(?:performed|completed|obtained|measured|quantified|reported)/i.test(value)) {
    return "limitation";
  }
  if (/randomi[sz]ed|double-blind|placebo-controlled|participants?|subjects?|primary endpoint|secondary endpoint|received .*placebo/i.test(value)) {
    return "finding";
  }
  if (/\b(?:adverse|harm|complication|toxicity|intoleran|worsen|deteriorat|safety signal|serious event|risk|concern|hazard|contraindicat|unsafe|feasibility|technically difficult)\b/i.test(value)) {
    return "safety_observation";
  }
  return CONCRETE_SIGNAL.test(value) ? "finding" : "evidence_excerpt";
}

export function normalizeDisplayStatement(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(LEADING_LABEL, "")
    .replace(/^(?:(?:medication|drug)\s+(?:combination|pair)\s+(?:concern|priority|finding|rationale)\s*)+/i, "")
    .replace(/^(?:critical|high|moderate|low)(?:[- ]to[- ](?:high|moderate|low))?\s+priority\s*[:\-]?\s*/i, "")
    .replace(/\s+((?:critical|high|moderate|low)(?:[- ]to[- ](?:high|moderate|low))? concern)\s+/i, ": $1. ")
    .replace(/\.\s+\.$/, ".")
    .trim();
}

function isQuestion(value: string) {
  return /\?$/.test(value) || /^(?:whether|what|when|where|why|how|which|who|has|have|had|is|are|was|were|could|would|should|did|does|do|can)\b/i.test(value);
}

function isRecommendation(value: string) {
  return /^(?:recommend(?:ed|ation)?|plan(?:ned)?|proceed(?:ed|ing)?|beg(?:in|an|un)|approv(?:e|ed|ing)|discharg(?:e|ed|ing)?|admit(?:ted|ting)?|transfer(?:red|ring)?|prefer(?:red|ring)?|monitor(?:ed|ing)?|repeat(?:ed|ing)?|obtain(?:ed|ing)?|consider(?:ed|ing)?|continu(?:e|ed|ing)|reduc(?:e|ed|ing)|decreas(?:e|ed|ing)|increas(?:e|ed|ing)|intensif(?:y|ied|ying)|escalat(?:e|ed|ing)|de-escalat(?:e|ed|ing)|discontinu(?:e|ed|ing)|start(?:ed|ing)?|stop(?:ped|ping)?|hold|held|delay(?:ed|ing)?|defer(?:red|ring)?|withhold|withheld|switch(?:ed|ing)?|titrat(?:e|ed|ing)|avoid(?:ed|ing)?|favor(?:ed|ing)?|prioriti[sz](?:e|ed|ing)|administer(?:ed|ing)?|review(?:ed|ing)?|evaluat(?:e|ed|ing)|assess(?:ed|ing)?|recheck(?:ed|ing)?|schedul(?:e|ed|ing)|refer(?:red|ring)?|confirm(?:ed|ing)?|verify|verified)\b|\b(?:is|are|was|were) (?:recommended|needed)\b|\b(?:should|needs? to)\s+(?:be\s+)?(?:proceed(?:ed)?|begun|begin|continued|reduced|decreased|increased|intensified|escalated|de-escalated|discontinued|initiated|discharged|admitted|transferred|monitored|repeated|obtained|considered|reviewed|evaluated|confirmed|verified|stopped|started|held|delayed|deferred|withheld|avoided|administered|performed)\b|\b(?:recommend(?:s|ed)?|advis(?:es|ed)?|favor(?:s|ed)?|prefer(?:s|red)?)\b.{0,100}\b(?:proceed|begin|start|continue|reduce|decrease|increase|intensify|escalate|hold|delay|defer|stop|switch|monitor|discharge|admission|transfer|treatment|therapy|medication|drug|dose|dosing|regimen|indication|follow-up|testing|restricted|measurement)\b|\b(?:discharge|transfer|admission)\b.{0,70}\b(?:reasonable|appropriate|acceptable|possible|supported|preferred)\b/i.test(value);
}

function isPotentialInteractionStatement(value: string) {
  return /\s(?:\+|plus)\s|combined with|drug interaction|medication-related|coadmin|concomitant.{0,40}(?:medication|therapy|drug)|exposure.{0,40}(?:medication|therapy|dose)|interaction concern/i.test(value) ||
    /^[A-Z][a-z][A-Za-z-]{3,}\b.{0,100}\b(?:may|can|could)\s+(?:increase|decrease|reduce|worsen|contribute|prolong|interfere|inhibit|induce|delay|blunt)\b/i.test(value);
}

export function isClinicallyMaterialRecommendation(value: string) {
  const researchOnly = /\b(?:larger|additional|future|further)\b.{0,50}\b(?:study|studies|trial|trials|research|evidence)\b|\bmore research is needed\b/i.test(value);
  return !isNeutralPositionStatement(value) && isRecommendation(value) && !researchOnly && (
    CLINICAL_DECISION.test(value) ||
    MONITORING_SIGNAL.test(value) ||
    /\b(?:treatment|therapy|medication|drug|dose|dosing|regimen|procedure|surgery|biopsy|imaging|laborator|ecg|follow-up|referral|indication|approval|intervention|management|support|resuscitation|source control|discharge|admission|transfer|inpatient|outpatient)\b/i.test(value)
  );
}

function isLongitudinalChange(value: string) {
  const direction = /\b(?:improved|decreased|declined|increased|rose|fell|normalized|reduced|worsened|persisted|remained)\b/i.test(value);
  const pairedValues = /\bfrom\s+[-+]?\d+(?:\.\d+)?(?:\s*[A-Za-z%]+(?:\/[A-Za-z]+)?)?\s+(?:to|→)\s+[-+]?\d+(?:\.\d+)?(?:\s*[A-Za-z%]+(?:\/[A-Za-z]+)?)?/i.test(value);
  const temporal = /\b(?:baseline|initial|earlier|later|follow-up|subsequent|previous|after|over time)\b/i.test(value);
  const compactPair = /^[A-Za-z][A-Za-z /_-]{1,30}\s+[-+]?\d+(?:\.\d+)?\s+(?:(?:to|→|->)\s+)?[-+]?\d+(?:\.\d+)?(?:\s*\w+)?$/i.test(value);
  const clinicalChange = /\b(?:progressed|resolved|recurred|enlarged|shrank|stabilized|new lesion|interval change)\b/i.test(value);
  const treatmentChange = CLINICAL_DECISION.test(value) && temporal;
  return pairedValues || compactPair || (direction && temporal) || (clinicalChange && temporal) || treatmentChange || /\b(?:reduced|improved|decreased|increased)\b.{0,50}\bbut (?:still )?(?:persisted|remained)\b/i.test(value);
}

function isStructuralNoise(value: string) {
  const withoutPunctuation = value.replace(/[:|/\-]+/g, " ").replace(/\s+/g, " ").trim();
  return TABLE_HEADER.test(withoutPunctuation) || /^(?:table|figure|appendix)\s+\d+\b/i.test(value);
}

function legacyCategoryFor(contentType: ResearchContentType, text: string): GroundedFactCategory {
  if (contentType === "interaction_concern") return "interaction";
  if (contentType === "safety_observation") return "safety";
  if (contentType === "limitation" || contentType === "discrepancy" || contentType === "unresolved_question") {
    return /excluded|not represented|population/i.test(text) ? "exclusion" : "limitation";
  }
  if (contentType === "longitudinal_change" && /adverse|toxicity|safety|harm|complication|worsen|deteriorat|risk|concern/i.test(text)) {
    return "safety";
  }
  if (/randomi[sz]ed|double-blind|placebo-controlled|participants?|subjects?|primary endpoint|secondary endpoint|received .*placebo|follow-up date|collection date/i.test(text)) {
    return "study-design";
  }
  if (/\bp\s*[=<]|confidence interval|statistical|significant/i.test(text)) return "statistical";
  if (/\b(?:endpoint|response|responded|improved|benefit|effective|remission|resolution|reduced|decreased|increased|progression[- ]free|survival)\b/i.test(text)) {
    return "efficacy";
  }
  return "context";
}

function buildDirectAnswer({
  question,
  interactions,
  efficacy,
  safety,
  decisions,
  context,
  uncertainties,
}: {
  question: string;
  interactions: GroundedFact[];
  efficacy: GroundedFact[];
  safety: GroundedFact[];
  decisions: GroundedFact[];
  context: GroundedFact[];
  uncertainties: GroundedFact[];
}) {
  const ranked = rankFactsForQuestion(
    uniqueFacts(interactionFocusedQuestion(question)
      ? [...interactions, ...safety, ...decisions, ...efficacy, ...context, ...uncertainties]
      : [...decisions, ...context, ...efficacy, ...safety, ...interactions, ...uncertainties])
      .filter((fact) => isCompleteClinicalProposition(fact.text)),
    question,
  );
  if (ranked.length === 0) {
    return "The uploaded documents do not contain enough complete, directly extractable evidence to answer the research question reliably.";
  }

  const asksForDecision = /\b(?:should|whether|proceed|begin|start|continue|stop|hold|delay|defer|approve|eligible|appropriate)\b/i.test(question);
  const diagnostic = ranked.find(isDiagnosticFact);
  const primary = diagnostic ?? ranked.find((fact) =>
    !["recommendation", "limitation", "discrepancy", "unresolved_question"].includes(fact.contentType),
  );
  const objective = ranked.find((fact) =>
    fact.id !== primary?.id &&
    isObjectiveFact(fact) &&
    !["recommendation", "limitation", "discrepancy"].includes(fact.contentType),
  );
  const rankedDecisions = uniqueFacts(
    rankDecisionsForAnswer(decisions, question, primary, [...interactions, ...safety]),
  ).slice(0, 5);
  const tradeoffs = selectSynthesisFacts(
    rankFactsForQuestion(
      [...interactions, ...safety, ...uncertainties.filter((fact) => isMaterialTradeoff(fact.text))],
      question,
    ),
    1,
  );
  const remaining = uniqueFacts(
    rankFactsForQuestion(
      uncertainties.filter((fact) =>
        fact.id !== primary?.id &&
        fact.id !== objective?.id &&
        !tradeoffs.some((tradeoff) => tradeoff.id === fact.id)
      ),
      question,
    ),
  ).slice(0, 3);
  const tradeoffContext = tradeoffs.length > 0
    ? ranked.find((fact) =>
        !tradeoffs.some((tradeoff) => tradeoff.id === fact.id) &&
        !rankedDecisions.some((decision) => decision.id === fact.id) &&
        isPotentialBenefit(fact.text) &&
        factsShareMeaningfulTerms(fact, tradeoffs[0]),
      )
    : undefined;
  const usedIds = new Set([
    primary?.id,
    objective?.id,
    tradeoffContext?.id,
    ...rankedDecisions.map((fact) => fact.id),
    ...tradeoffs.map((fact) => fact.id),
    ...remaining.map((fact) => fact.id),
  ].filter(Boolean));
  const supporting = selectSynthesisFacts(
    ranked.filter((fact) => !usedIds.has(fact.id)),
    primary ? 0 : 2,
  );
  const conclusion = [primary, objective, ...supporting].filter(Boolean) as GroundedFact[];
  const answerParts = [
    synthesizeConclusion(conclusion),
    synthesizeTreatmentPriority(rankedDecisions, asksForDecision),
    synthesizeTradeoff(tradeoffContext, tradeoffs[0], question),
    synthesizeRemainingEvidence(remaining, question),
  ].filter(Boolean);

  return polishPrimaryAnswerFluency(answerParts.join(" "));
}

function rankFactsForQuestion(facts: GroundedFact[], question: string) {
  const questionTerms = meaningfulTerms(question);
  return [...facts].sort((left, right) => {
    const score = (fact: GroundedFact) => {
      const text = `${fact.text} ${fact.excerpt}`.toLowerCase();
      const overlap = questionTerms.filter((term) => text.includes(term)).length;
      const decisionWeight = fact.contentType === "recommendation" ? 5 : 0;
      const diagnosticWeight = isDiagnosticFact(fact) ? 6 : 0;
      const objectiveWeight = /\b(?:laborator|biomarker|imaging|patholog|biopsy|culture|antibod|protein|creatinine|complement)\w*\b/i.test(text) || CLINICAL_MEASUREMENT.test(text)
        ? 4
        : 0;
      const uncertaintyWeight = ["limitation", "discrepancy"].includes(fact.contentType) ? 1 : 0;
      const broadConclusionWeight = /\b(?:likely multifactorial|overall cause|leading (?:cause|diagnosis)|most likely|predominantly)\b/i.test(text) ? 12 : 0;
      const decisionEvidenceWeight = /\b(?:relative contribution|additional|another|repeat|further)\b.{0,100}\b(?:measurement|test|result|evidence|creatinine|function|trajectory)\w*\b/i.test(text) ? 5 : 0;
      const historicalPenalty = isHistoricalContext(`${fact.documentName} ${text}`) ? 12 : 0;
      const neutralPenalty = classifyStatementRole(text) === "neutral" ? 10 : 0;
      return overlap * 3 + decisionWeight + diagnosticWeight + objectiveWeight + uncertaintyWeight + broadConclusionWeight + decisionEvidenceWeight - historicalPenalty - neutralPenalty;
    };
    return score(right) - score(left);
  });
}

function rankDecisionsForAnswer(
  decisions: GroundedFact[],
  question: string,
  primary?: GroundedFact,
  constraints: GroundedFact[] = [],
) {
  const questionTerms = meaningfulTerms(question);
  const primaryTerms = meaningfulTerms(`${primary?.text ?? ""} ${primary?.excerpt ?? ""}`);
  return [...decisions].sort((left, right) => {
    const score = (fact: GroundedFact) => {
      const text = `${fact.text} ${fact.excerpt}`.toLowerCase();
      const questionOverlap = questionTerms.filter((term) => text.includes(term)).length;
      const primaryOverlap = primaryTerms.filter((term) => text.includes(term)).length;
      const sameDocument = primary && fact.documentId === primary.documentId ? 6 : 0;
      const addressesConstraint = constraints.some((constraint) => constraint.documentId === fact.documentId) ? 5 : 0;
      const urgency = /\b(?:immediately|urgent|emergent|early|promptly|without delay|priority)\b/i.test(text) ? 4 : 0;
      return questionOverlap * 2 + primaryOverlap * 4 + sameDocument + addressesConstraint + urgency;
    };
    return score(right) - score(left);
  });
}

function isDiagnosticFact(fact: GroundedFact) {
  return /\b(?:diagnos(?:is|ed)|etiology|cause|strongly support\w*|consistent with|most consistent with|likely (?:multifactorial|due to|caused by|related to|represents?)|(?:volume depletion|dehydration|infection|exposure|medication-related injury)\b.{0,60}\b(?:suspected|important|possible)|may have worsened\b.{0,60}\b(?:perfusion|function|injury)|supports? (?:a|an|the)?\s*.{0,50}\bcomponent|raises? concern for\b.{0,80}\b(?:injury|disease|process|syndrome|condition)|favou?rs?\b.{0,80}\b(?:cause|etiology|process|injury|syndrome|disease|condition)|meets? (?:the )?criteria|leading (?:diagnosis|interpretation)|confirmed|cannot (?:definitively )?distinguish|remain(?:s|ed)? plausible|cannot exclude)\b/i.test(
    `${fact.text} ${fact.excerpt}`,
  );
}

function isDispositionFact(fact: GroundedFact) {
  const text = `${fact.text} ${fact.excerpt}`;
  return /\b(?:discharg|disposition|admission|admit|transfer|inpatient|outpatient|ready to leave|release home)\w*\b/i.test(text) &&
    (fact.contentType === "recommendation" || /\b(?:reasonable|appropriate|acceptable|possible|ready|prefer|remain|stay|wait)\w*\b/i.test(text));
}

function isObjectiveFact(fact: GroundedFact) {
  const text = `${fact.text} ${fact.excerpt}`;
  return /\b(?:laborator|biomarker|imaging|patholog|biopsy|culture|antibod|serolog|protein|creatinine|complement|positive|negative|elevated|decreased|increased)\w*\b/i.test(text) ||
    CLINICAL_MEASUREMENT.test(text);
}

function isMaterialTradeoff(text: string) {
  return /\b(?:risk|harm|hazard|contraindicat|unsafe|complication|worsen|deteriorat|overload|edema|toxicity|bleed|arrhythmia|adverse event|feasibility|technically difficult|constraint)\w*\b/i.test(text);
}

function isPotentialBenefit(text: string) {
  return /\b(?:benefit|improv|stabili|support|restore|reduce|prevent|control|effective|response)\w*\b/i.test(text);
}

function factsShareMeaningfulTerms(left: GroundedFact, right: GroundedFact) {
  const leftTerms = meaningfulTerms(`${left.text} ${left.excerpt}`);
  const rightTerms = meaningfulTerms(`${right.text} ${right.excerpt}`);
  return leftTerms.filter((term) => rightTerms.includes(term)).length >= 1;
}

function synthesizeConclusion(facts: GroundedFact[]) {
  const [primary, objective] = facts.filter((fact) =>
    fact.contentType === "recommendation" ||
    !/^(?:support|suggest|indicate|demonstrate|show|identify|document|report)\b/i.test(fact.text.trim())
  );
  if (!primary) return "";
  return uniqueSentences([primary.text, objective?.text ?? ""]).join(" ");
}

function synthesizeTreatmentPriority(decisions: GroundedFact[], requested: boolean) {
  const reviewable = decisions.filter((fact) =>
    isClinicallyMaterialRecommendation(fact.text) &&
    classifyStatementRole(fact.text) !== "neutral"
  );
  const disagreement = findRecommendationDisagreement(reviewable);
  if (disagreement) {
    const compatibleActions = reviewable
      .filter((fact) => !disagreement.factIds.includes(fact.id))
      .slice(0, 2)
      .map(attributedFactSentence);
    return uniqueSentences([...compatibleActions, disagreement.sentence]).join(" ");
  }
  if (reviewable.length > 0) return uniqueSentences(reviewable.slice(0, 2).map(attributedFactSentence)).join(" ");
  return requested
    ? "The available evidence does not support a specific treatment action."
    : "";
}

function synthesizeDisposition(facts: GroundedFact[]) {
  const decisions = facts.filter((fact) => isDispositionFact(fact));
  const disagreement = findRecommendationDisagreement(decisions);
  if (disagreement) return disagreement.sentence;
  if (decisions.length > 0) return uniqueSentences(decisions.slice(0, 2).map(attributedFactSentence)).join(" ");
  return "The available evidence does not establish discharge or disposition readiness.";
}

function findRecommendationDisagreement(decisions: GroundedFact[]) {
  for (let leftIndex = 0; leftIndex < decisions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < decisions.length; rightIndex += 1) {
      const left = decisions[leftIndex];
      const right = decisions[rightIndex];
      if (left.documentId === right.documentId || !recommendationsMateriallyConflict(left.text, right.text)) {
        continue;
      }
      return {
        sentence: `${attributedFactSentence(left)} In contrast, ${attributedFactSentence(right)}`,
        factIds: [left.id, right.id],
      };
    }
  }
  return "";
}

function synthesizeTradeoff(
  benefit: GroundedFact | undefined,
  risk: GroundedFact | undefined,
  question: string,
) {
  if (!risk) {
    return /\b(?:tradeoff|trade-off|risk|benefit|harm|constraint)\b/i.test(question)
      ? "No material competing management choice or treatment-related risk is established."
      : "";
  }
  return uniqueSentences([benefit?.text ?? "", risk.text]).join(" ");
}

function synthesizeRemainingEvidence(gaps: GroundedFact[], question: string) {
  const unresolved = [...gaps]
    .sort((left, right) => unresolvedEvidencePriority(right.text) - unresolvedEvidencePriority(left.text))
    .filter((fact) => isClinicallyImportantUncertainty(fact.text) || fact.contentType === "unresolved_question")
    .map((fact) => fact.contentType === "unresolved_question" ? openQuestionAsUnresolvedStatement(fact.text) : fact.text);
  if (unresolved.length > 0) return uniqueSentences(unresolved.slice(0, 3)).join(" ");
  return /\b(?:remaining|missing|unresolved|uncertain|evidence still needed|what evidence)\b/i.test(question)
    ? "No specific pending result is identified as necessary to resolve the current question."
    : "";
}

function unresolvedEvidencePriority(text: string) {
  if (/\b(?:additional|another|repeat|further)\b.{0,100}\b(?:measurement|test|result|laborator|imaging|assessment|function|trajectory)\w*\b/i.test(text)) return 5;
  if (/\brelative contribution\b/i.test(text)) return 4;
  if (/\b(?:has not returned|not yet returned|remains above|remains below)\b.{0,80}\bbaseline\b/i.test(text)) return 3;
  if (/\b(?:pending|awaiting|not yet available|not yet performed)\b/i.test(text)) return 3;
  if (/\b(?:uncertain|unknown|unresolved|possible|cannot exclude|not exclude)\b/i.test(text)) return 2;
  return 0;
}

function attributedFactSentence(fact: GroundedFact) {
  const sentence = ensureClinicalSentence(fact.text);
  const source = fact.sourceSection && /\b(?:position|addendum)\b/i.test(fact.sourceSection)
    ? fact.sourceSection
    : humanSourceLabel(fact.documentName);
  if (!source || new RegExp(`^${escapeRegExp(source)}\\b`, "i").test(sentence)) return sentence;
  const negativeImperative = sentence.match(/^Do not\s+([A-Za-z-]+)\s+(.+)$/i);
  if (negativeImperative) {
    return `${source} recommends not ${toGerund(negativeImperative[1])} ${lowercaseFirst(negativeImperative[2])}`;
  }
  const imperative = sentence.match(/^(Continue|Start|Begin|Initiate|Administer|Hold|Withhold|Defer|Delay|Stop|Avoid|Monitor|Obtain|Repeat|Reduce|Decrease|Increase|Intensify|Escalate|De-escalate|Taper|Target|Reassess)\s+(.+)$/i);
  if (imperative) {
    return `${source} recommends ${toGerund(imperative[1])} ${normalizeCoordinatedRecommendation(imperative[2])}`;
  }
  return `${source} states that ${lowercaseFirst(sentence)}`;
}

function toGerund(value: string) {
  return ({
    continue: "continuing",
    start: "starting",
    begin: "beginning",
    initiate: "initiating",
    administer: "administering",
    hold: "holding",
    withhold: "withholding",
    defer: "deferring",
    delay: "delaying",
    stop: "stopping",
    avoid: "avoiding",
    monitor: "monitoring",
    obtain: "obtaining",
    repeat: "repeating",
    reduce: "reducing",
    decrease: "decreasing",
    increase: "increasing",
    intensify: "intensifying",
    escalate: "escalating",
    "de-escalate": "de-escalating",
    taper: "tapering",
    target: "targeting",
    reassess: "reassessing",
    coordinate: "coordinating",
    discharge: "discharging",
  } as Record<string, string>)[value.toLowerCase()] ?? `${value.toLowerCase()}ing`;
}

function normalizeCoordinatedRecommendation(value: string) {
  return lowercaseFirst(value)
    .replace(/\band\s+(coordinate|monitor|reassess|repeat|obtain|continue|reduce|increase)\b/gi, (_, action: string) =>
      `and ${toGerund(action)}`
    );
}

function humanSourceLabel(documentName: string) {
  const value = documentName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d+[ _-]*/, "")
    .replace(/[ _-]+/g, " ")
    .replace(/\b(?:consultation|consult|note|report|results?|document|record|progress)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return "The specialist source";
  return value.split(" ").map((word) =>
    /^[A-Z]{2,}$/.test(word) ? word : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
  ).join(" ");
}

function openQuestionAsUnresolvedStatement(value: string) {
  const question = value.replace(/[?]+$/, "").trim();
  return `The uploaded evidence does not yet answer whether ${lowercaseFirst(question.replace(/^(?:whether|what|when|where|why|how|which|who|is|are|does|do|did|has|have|can|could|would)\s+/i, ""))}.`;
}

function uniqueSentences(values: string[]) {
  const accepted: string[] = [];
  for (const value of values) {
    const sentence = ensureClinicalSentence(value);
    if (!sentence || accepted.some((item) => areEquivalentStatements(item, sentence))) continue;
    accepted.push(sentence);
  }
  return accepted;
}

function ensureClinicalSentence(value: string) {
  const sentence = polishPrimaryAnswerFluency(value).trim();
  if (!sentence) return "";
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function naturalList(values: string[], capitalize = false) {
  const items = values.map((value) => value.trim()).filter(Boolean);
  const result = items.length <= 1
    ? items[0] ?? ""
    : items.length === 2
      ? `${items[0]} and ${items[1]}`
      : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
  return capitalize && result
    ? `${result.charAt(0).toUpperCase()}${result.slice(1)}`
    : result;
}

function selectSynthesisFacts(facts: GroundedFact[], limit: number) {
  if (limit <= 0) return [];
  const selected: GroundedFact[] = [];
  for (const fact of facts) {
    if (selected.some((candidate) => areEquivalentStatements(candidate.text, fact.text))) continue;
    const family = synthesisFamily(fact);
    if (selected.some((candidate) => synthesisFamily(candidate) === family)) continue;
    selected.push(fact);
    if (selected.length >= limit) break;
  }
  return selected;
}

function synthesisFamily(fact: GroundedFact) {
  const terms = meaningfulTerms(`${fact.text} ${fact.excerpt}`).slice(0, 4).sort();
  return `${fact.contentType}:${terms.join("-")}`;
}

function meaningfulTerms(text: string) {
  const stop = new Set([
    "about", "after", "before", "clinical", "current", "document", "documents", "evidence",
    "finding", "findings", "patient", "patients", "question", "report", "reported", "source",
    "study", "that", "their", "these", "this", "treatment", "uploaded", "which", "with",
  ]);
  return Array.from(new Set(
    text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)?.filter((term) => !stop.has(term)) ?? [],
  ));
}

function questionSubjectForIntent(question: string, intent: PrimaryAnswerPart) {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (intent === "disposition") return "discharge or disposition readiness";
  if (intent === "disagreement") return "source-specific recommendations";
  if (intent === "remaining-evidence") return "decision-relevant unresolved evidence";
  const subject = normalized.match(/\b(?:cause|diagnosis|etiology|management|treatment|safety|efficacy|interaction)\b(?:\s+of)?\s+([^,?]{3,100})/i)?.[1];
  return subject?.trim() || primaryAnswerPartLabel(intent);
}

function answerAddressesPart(answer: string, part: PrimaryAnswerPart, supported: boolean) {
  const scopedInsufficiency = {
    diagnosis: /\b(?:diagnosis|cause|etiology)\b.{0,60}\b(?:cannot be determined|cannot be established|insufficient evidence|remains unknown)\b/i,
    treatment: /\b(?:treatment|management|therapy)\b.{0,60}\b(?:cannot be determined|cannot be established|insufficient evidence|no specific action)\b/i,
    disposition: /\b(?:discharge|disposition|readiness)\b.{0,60}\b(?:cannot be determined|cannot be established|insufficient evidence|not established)\b/i,
    disagreement: /\b(?:disagreement|conflict|difference)\b.{0,60}\b(?:cannot be determined|not identified|insufficient evidence|no genuine)\b/i,
    "remaining-evidence": /\b(?:additional|missing|remaining|unresolved)\s+evidence\b.{0,80}\b(?:cannot be determined|not identified|insufficient evidence|none specified)\b/i,
  }[part as "diagnosis" | "treatment" | "disposition" | "disagreement" | "remaining-evidence"];
  if (!supported && scopedInsufficiency?.test(answer)) return true;

  return ({
    diagnosis: /\b(?:diagnos|cause|etiology|most likely|leading|multifactorial|consistent with|favou?rs?|plausible|cannot (?:definitively )?distinguish)\w*\b/i,
    treatment: /\b(?:manage|treat|therap|recommend|continue|hold|avoid|stop|start|begin|monitor|reassess)\w*\b/i,
    disposition: /\b(?:discharg|disposition|admission|inpatient|outpatient|ready|release|transfer)\w*\b/i,
    disagreement: /\b(?:disagree|conflict|in contrast|whereas|different recommendations?|prefers?)\b/i,
    tradeoff: /\b(?:tradeoff|balance|risk|benefit|constraint)\w*\b/i,
    "remaining-evidence": /\b(?:pending|missing|remaining|unresolved|unknown|trajectory|repeat|subsequent|additional measurement|follow-up)\w*\b/i,
    efficacy: /\b(?:efficacy|response|benefit|outcome|improv)\w*\b/i,
    safety: /\b(?:safety|adverse|toxicity|harm|risk)\w*\b/i,
    limitations: /\b(?:limitation|uncertain|missing|unresolved|caveat|gap)\w*\b/i,
    durability: /\b(?:durab|sustain|long-term|follow-up|persist)\w*\b/i,
    generalizability: /\b(?:generali[sz]|population|external validity|excluded)\w*\b/i,
    interactions: /\b(?:interaction|contraindication|coadmin|medication-related|drug-related|cumulative .{0,30}risk)\w*\b/i,
    monitoring: /\b(?:monitor|surveillance|repeat|follow-up)\w*\b/i,
    laboratory: /\b(?:laborator|biomarker|serolog|blood|urine|measurement)\w*\b/i,
    regulatory: /\b(?:regulatory|approval|authorization|label)\w*\b/i,
    conclusion: /[A-Za-z]{4,}/,
  } satisfies Record<PrimaryAnswerPart, RegExp>)[part].test(answer);
}

function interactionFocusedQuestion(question: string) {
  return /\b(?:interaction|medication|drug|coadmin|contraindication|harmful combination)\b/i.test(question);
}

function relevanceFor(contentType: ResearchContentType, category: GroundedFactCategory) {
  const byContentType: Partial<Record<ResearchContentType, string>> = {
    interaction_concern: "Supports the medication-interaction assessment.",
    safety_observation: "Supports the source-reported safety assessment.",
    recommendation: "Records a recommended action separately from observed findings.",
    unresolved_question: "Identifies a question the uploaded evidence does not resolve.",
    discrepancy: "Identifies a meaningful difference between source records.",
    longitudinal_change: "Records a change across time or repeated observations.",
    limitation: "Identifies a boundary or gap in the available evidence.",
    evidence_excerpt: "Preserves relevant source context without promoting it to a conclusion.",
  };
  return byContentType[contentType] ?? {
    efficacy: "Documents a treatment outcome or response used in the evidence review.",
    "study-design": "Establishes the source and clinical context.",
    statistical: "Documents the quantitative result used in the selected conclusion.",
    interaction: "Supports the medication-interaction assessment.",
    safety: "Supports the source-reported safety assessment.",
    limitation: "Identifies a boundary in the available evidence.",
    exclusion: "Identifies a population not represented by the evidence.",
    context: "Preserves relevant source context without overstating its implication.",
  }[category] ?? "Preserves relevant source context.";
}

function labelForContentType(contentType: ResearchContentType, category: GroundedFactCategory) {
  return {
    finding: category === "study-design" ? "Source context" : category === "statistical" ? "Statistical result" : "Finding",
    interaction_concern: "Medication interaction",
    safety_observation: "Safety observation",
    recommendation: "Recommendation",
    unresolved_question: "Open question",
    discrepancy: "Documentation discrepancy",
    longitudinal_change: "Longitudinal change",
    limitation: "Limitation",
    evidence_excerpt: "Evidence excerpt",
  }[contentType];
}

function contentTypeOrder(contentType: ResearchContentType) {
  return ["interaction_concern", "finding", "safety_observation", "longitudinal_change", "discrepancy", "limitation", "unresolved_question", "recommendation", "evidence_excerpt"].indexOf(contentType);
}

function buildMissingEvidence(facts: GroundedFact[], interactionFocused: boolean) {
  const uncertainties = facts
    .filter((fact) => fact.contentType === "limitation" || fact.contentType === "discrepancy")
    .map((fact) => fact.text)
    .slice(0, 4);
  void interactionFocused;
  if (uncertainties.length === 0) {
    uncertainties.push("The answer is limited to the uploaded documents and was not checked against external clinical literature.");
  }
  return uniqueStrings(uncertainties);
}

function buildFollowUpQuestions(question: string, facts: GroundedFact[]) {
  void question;
  const extractedQuestions = facts
    .filter((fact) => fact.contentType === "unresolved_question")
    .flatMap((fact) => openQuestionsFromGap(fact.text));

  const evidenceGaps = facts
    .filter((fact) =>
      isClinicallyImportantUncertainty(fact.text) ||
      fact.contentType === "limitation" ||
      fact.contentType === "discrepancy" ||
      (fact.contentType === "recommendation" && /\b(?:until|pending|unless|after)\b/i.test(fact.text)),
    )
    .flatMap((fact) => openQuestionsFromGap(fact.text));

  return uniqueStrings([...extractedQuestions, ...evidenceGaps]).slice(0, 6);
}

function isCompleteClinicalProposition(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (CLINICAL_DECISION.test(text) || MONITORING_SIGNAL.test(text)) return true;
  if (text.split(/\s+/).length >= 3 && /\b(?:risk|benefit|concern|constraint|contraindication|complication|feasibility|uncertainty)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:adverse events?|serious adverse events?|safety events?|complications?)\b/i.test(text) && (CLINICAL_MEASUREMENT.test(text) || /\b(?:occurred|reported|observed|included|included:|were|was)\b/i.test(text))) {
    return true;
  }
  if (CLINICAL_MEASUREMENT.test(text) && /\b(?:was|were|is|are|measured|increased|decreased|remained|improved|worsened|reached)\b/i.test(text)) {
    return true;
  }
  return /\b(?:is|are|was|were|has|have|had|show(?:s|ed)?|report(?:s|ed)?|recommend(?:s|ed)?|indicat(?:e|es|ed)|support(?:s|ed)?|suggest(?:s|ed)?|increase(?:s|d)?|decrease(?:s|d)?|improve(?:s|d)?|worsen(?:s|ed)?|remain(?:s|ed)?|persist(?:s|ed)?|limit(?:s|ed)?|exclude(?:s|d)?|may|might|can|could|should|would|will)\b/i.test(text);
}

function buildMarkdownReport({
  question,
  executiveSummary,
  keyFindings,
  safety,
  context,
  uncertainties,
  missingEvidence,
  followUpQuestions,
  facts,
}: {
  question: string;
  executiveSummary: string;
  keyFindings: GroundedFact[];
  safety: GroundedFact[];
  context: GroundedFact[];
  uncertainties: GroundedFact[];
  missingEvidence: string[];
  followUpQuestions: string[];
  facts: GroundedFact[];
}) {
  const sourceIndex = new Map(facts.map((fact, index) => [fact.id, index + 1]));
  const lines = (items: GroundedFact[]) => items.length > 0
    ? items.map((fact) => `- ${fact.text} [E${sourceIndex.get(fact.id)}]`).join("\n")
    : "- The uploaded sources did not provide a concrete finding for this category.";

  return `# Aetheris Evidence Brief

**Research question:** ${question}

## Direct Answer
${executiveSummary}

## Findings That Answer the Question
${lines(keyFindings)}

## Safety Findings
${lines(safety)}

## What the Documents Describe
${lines(context)}

## What Remains Uncertain
${lines(uncertainties)}
${missingEvidence.map((item) => `- ${item}`).join("\n")}

## Follow-Up Questions
${followUpQuestions.map((item) => `- ${item}`).join("\n")}

## Evidence Appendix
${facts.map((fact, index) => `- [E${index + 1}] ${fact.documentName}${fact.page ? `, page ${fact.page}` : ""}: \"${fact.excerpt}\"`).join("\n")}

## Research-Use Disclaimer
${RESEARCH_DISCLAIMER}`;
}

export function normalizeForDeduplication(value: string) {
  return normalizeDisplayStatement(value)
    .toLowerCase()
    .replace(/[^a-z0-9.%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function areEquivalentStatements(left: string, right: string) {
  const first = normalizeForDeduplication(left);
  const second = normalizeForDeduplication(right);
  if (!first || !second) return false;
  if (first === second) return true;

  const firstNumbers = extractMaterialNumbers(first);
  const secondNumbers = extractMaterialNumbers(second);
  if (!sameValues(firstNumbers, secondNumbers)) return false;

  const firstTokens = new Set(first.split(" ").filter(Boolean));
  const secondTokens = new Set(second.split(" ").filter(Boolean));
  const intersection = Array.from(firstTokens).filter((token) => secondTokens.has(token)).length;
  const smaller = Math.min(firstTokens.size, secondTokens.size);
  const larger = Math.max(firstTokens.size, secondTokens.size);
  const containment = smaller === 0 ? 0 : intersection / smaller;
  const jaccard = larger === 0 ? 0 : intersection / (firstTokens.size + secondTokens.size - intersection);

  return (containment >= 0.82 && larger / Math.max(1, smaller) <= 2.2) || jaccard >= 0.76;
}

function uniqueFacts(values: Array<GroundedFact | undefined>) {
  const seen: string[] = [];
  return values.filter((value): value is GroundedFact => {
    if (!value) return false;
    const normalized = normalizeForDeduplication(value.text);
    if (seen.some((existing) => areEquivalentStatements(existing, normalized))) return false;
    seen.push(normalized);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractMaterialNumbers(value: string) {
  return value.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
}

function sameValues(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return true;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
