import type { GroundedFact } from "@/lib/types";
import {
  classifyStatementRole,
  isNeutralPositionStatement,
} from "@/lib/research/conflict-semantics";
import {
  isMetadataOnly,
  proseQualityIssues,
} from "@/lib/research/semantic-quality";
import { isSourceNoise } from "@/lib/research/source-cleaning";

const GENERIC_QUESTION = /(?:what|which) (?:additional|other|more) (?:source|evidence|information)|what evidence would|decision-changing evidence|reduce uncertainty|strengthen the conclusion|materially change the conclusion|more evidence (?:is|would be) needed/i;

export function isGenericOpenQuestion(value: string) {
  return GENERIC_QUESTION.test(value.replace(/\s+/g, " ").trim());
}

export function isClinicallyImportantUncertainty(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const uncertainty = /\b(?:await(?:ed|ing)?|cannot exclude|could not exclude|does not yet contain|not (?:yet )?(?:been )?(?:available|confirmed|excluded|established|performed|completed|obtained|quantified|reported|resolved|ruled out)|pending|possible|requires? confirmation|remain(?:s|ed)? (?:relevant|required|needed|uncertain|unclear|unknown|unresolved)|suspected|uncertain|unclear|unknown|unresolved)\b/i.test(text);
  const clinicalSubject = /\b(?:adverse|biomarker|biopsy|bleed|bronchoscop|bronchoalveolar|BAL|culture|diagnos|discharge|disease|dose|dosing|efficacy|imaging|infection|interaction|laborator|management|medication|monitor|obstruction|organ|orthostat|oxygen|patholog|procedure|progress|pulmonary|recommendation|renal|respiratory|response|risk|safety|source[- ]control|surgery|test|therapy|toxicity|treatment|trend|trajectory|weight|workup)\w*\b/i.test(text);
  const conditionalDecision = /\b(?:defer|delay|hold|withhold|avoid|proceed|start|begin|continue|recommend)\w*\b.{0,140}\b(?:after|if|pending|unless|until)\b/i.test(text);
  return (uncertainty && clinicalSubject) || conditionalDecision;
}

export function isOpenQuestionAnswered(question: string, facts: GroundedFact[]) {
  const questionTerms = subjectTerms(question);
  if (questionTerms.length === 0) return false;
  const asksForTrend = /\b(?:change|trend|trajectory|serial|repeat|over time|progress|worsen|improv)\w*\b/i.test(question);
  const asksForFutureOutcome = /^(?:will|would)\b|\b(?:durability|sustained|long-term|longer follow-up)\b/i.test(question);

  // A current observation can describe the trajectory so far without resolving
  // whether that outcome will persist or normalize in the future.
  if (asksForFutureOutcome) return false;

  const candidates = facts.filter((fact) =>
    !["discrepancy", "evidence_excerpt", "limitation", "unresolved_question"].includes(fact.contentType) &&
    !isClinicallyImportantUncertainty(fact.text),
  );
  if (asksForTrend) {
    return candidates.some((fact) =>
      fact.contentType === "longitudinal_change" &&
      sharesQuestionSubject(questionTerms, subjectTerms(`${fact.text} ${fact.excerpt}`)),
    );
  }

  return candidates.some((fact) => {
    const text = `${fact.text} ${fact.excerpt}`;
    if (!sharesQuestionSubject(questionTerms, subjectTerms(text))) return false;
    const asksForManagement = /\b(?:begin|continue|decision|defer|delay|hold|manage|proceed|recommend|should|start|stop|treat)\w*\b/i.test(question);
    if (fact.contentType === "recommendation") {
      return asksForManagement && !isClinicallyImportantUncertainty(text);
    }
    return /\b(?:confirmed|demonstrated|diagnosed|excluded|grew|identified|measured|negative|normal|positive|reported|resolved|ruled out|showed|was|were)\b/i.test(text);
  });
}

export function openQuestionFromGap(value: string) {
  return openQuestionsFromGap(value)[0] ?? "";
}

export function openQuestionsFromGap(value: string) {
  const text = normalizedGapText(value);
  const unresolved = unresolvedEvidenceList(text);
  if (unresolved.length > 0) {
    return unresolved
      .map(questionForPendingSubject)
      .filter((question) => openQuestionQualityIssues(question).length === 0)
      .slice(0, 4);
  }
  const question = openQuestionFromSingleGap(text);
  return question && openQuestionQualityIssues(question).length === 0 ? [question] : [];
}

export function openQuestionsFromMissingEvidence(value: string) {
  const subject = value
    .replace(/\s+/g, " ")
    .replace(/^evidence\s+(?:confirming|of|for)\s+/i, "")
    .replace(/^a\s+(?:unified|reconciled)\s+/i, "reconciled ")
    .replace(/[.]+$/, "")
    .trim();
  if (!subject) return [];
  const question = questionForPendingSubject(subject);
  return openQuestionQualityIssues(question).length === 0 ? [question] : [];
}

function openQuestionFromSingleGap(value: string) {
  const text = value
    .replace(/^(?:unresolved question|open question|limitation|uncertainty|pending)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();
  if (!text) return "";
  if (isNeutralPositionStatement(text)) return "";
  const role = classifyStatementRole(text);
  if (
    ["recommendation_for", "recommendation_against"].includes(role) &&
    !/\b(?:pending|await|not yet|unknown|uncertain|unclear|unresolved|until|unless|if obtained|if performed)\b/i.test(text)
  ) {
    return "";
  }
  if (/^whether\b/i.test(text)) {
    const subject = cleanSubject(text.replace(/^whether\s+/i, ""));
    const question = `Does the available evidence establish whether ${lowercaseLeading(subject)}?`;
    return openQuestionQualityIssues(question).length === 0 ? question : "";
  }
  if (isQuestion(text) && !isGenericOpenQuestion(text)) {
    const question = ensureQuestion(text);
    return openQuestionQualityIssues(question).length === 0 ? question : "";
  }
  const conditionalDecision = text.match(/^(.{8,160}?)\s+(?:until|pending|after)\s+(.{4,120}?)(?:,\s*(?:unless|if)\s+(.{3,100}))?$/i);
  if (conditionalDecision) {
    const condition = cleanSubject(conditionalDecision[2]);
    const decisionSubject = cleanDecisionSubject(conditionalDecision[1]);
    const exception = conditionalDecision[3] ? cleanSubject(conditionalDecision[3]) : "";
    const resolved = condition.match(
      /^(.+?)\s+(?:is|are)\s+(resolved|established|confirmed|available|completed)$/i,
    );
    const baseQuestion = resolved
      ? questionForResolvedCondition(resolved[1], resolved[2], decisionSubject)
      : `What does ${condition} show?`;
    return exception
      ? baseQuestion.replace(/\?$/, `, particularly if ${lowercaseLeading(exception)}?`)
      : baseQuestion;
  }

  const pending = text.match(/^(.{3,120}?)\s+(?:remain(?:s|ed)?|is|are|was|were)?\s*(?:still\s+)?(?:pending|awaited|not yet available|unavailable)$/i);
  if (pending) {
    const subject = lowercaseLeading(cleanSubject(pending[1]));
    return /\b(?:results|cultures|studies|findings|tests)\b/i.test(subject)
      ? `What do the pending ${subject} show?`
      : `What does the pending ${subject} show?`;
  }

  const notEstablished = text.match(/^(.{3,120}?)\s+(?:has|have|had|is|are|was|were)\s+not\s+(?:yet\s+)?(?:been\s+)?established$/i);
  if (notEstablished) {
    return `Is ${lowercaseLeading(cleanSubject(notEstablished[1]))} established on longer follow-up?`;
  }

  if (/\b(?:durability|long-term|follow-up window|beyond\s+\d+\s+(?:weeks?|months?|years?))\b/i.test(text)) {
    return `Is ${lowercaseLeading(cleanSubject(text))} sustained on follow-up?`;
  }

  const excludedPopulation = text.match(/^(.{3,160}?)\s+(?:was|were)\s+(?:excluded|underrepresented)\s+from\s+(.{3,100})$/i);
  if (excludedPopulation) {
    return `What evidence is available for ${lowercaseLeading(cleanSubject(excludedPopulation[1]))}, who were ${/\bwere\b/i.test(text) ? "excluded" : "underrepresented"} in ${lowercaseLeading(cleanSubject(excludedPopulation[2]))}?`;
  }

  const notCompleted = text.match(/^(.{3,120}?)\s+(?:has|have|had|is|are|was|were)\s+not\s+(?:yet\s+)?(?:been\s+)?(?:performed|completed|obtained|measured|quantified|reported|reviewed|available)$/i);
  if (notCompleted) {
    const subject = cleanSubject(notCompleted[1]);
    return /\b(?:trend|trajectory|change|response)\b/i.test(subject)
      ? `How does ${lowercaseLeading(subject)} change on repeat measurement?`
      : `If ${lowercaseLeading(subject)} is performed, what does it show?`;
  }

  const contrastUncertainty = text.match(/\b(?:but|although|however)\s+(?:the\s+)?(.{3,120}?)\s+(?:remain(?:s|ed)?|is|are|was|were)\s+(?:unknown|uncertain|unclear|unresolved)$/i);
  if (contrastUncertainty) {
    return `What does the available workup establish about ${lowercaseLeading(cleanSubject(contrastUncertainty[1]))}?`;
  }

  const unknownTrend = text.match(/^(.{3,120}?\b(?:trend|trajectory|change|response)s?)\s+(?:remain(?:s|ed)?|is|are|was|were)\s+(?:unknown|uncertain|unclear|unresolved)$/i);
  if (unknownTrend) {
    const subject = lowercaseLeading(cleanSubject(unknownTrend[1]));
    return `How ${/s$/i.test(subject) ? "do" : "does"} ${subject} change on repeat measurement?`;
  }

  const unconfirmed = text.match(/^(.{3,120}?)\s+(?:remain(?:s|ed)?|is|are|was|were)?\s*(?:possible|suspected|unconfirmed|not confirmed|not excluded|unclear|unknown|uncertain)$/i);
  if (unconfirmed) {
    return `Is ${lowercaseLeading(cleanSubject(unconfirmed[1]))} confirmed, excluded, or still unresolved?`;
  }

  const notExcluded = text.match(/^(.{3,120}?)\s+(?:was|were|is|are|has|have)?\s*(?:not|never)\s+(?:yet\s+)?(?:been\s+)?(?:formally\s+)?(?:excluded|established|confirmed|evaluated|assessed)\b/i);
  if (notExcluded) {
    return `Is ${lowercaseLeading(cleanSubject(notExcluded[1]))} confirmed or excluded by the available record?`;
  }

  const unresolvedAttribute = text.match(/^(.{3,120}?)\s+(?:remain(?:s|ed)?|is|are|was|were)\s+(?:unknown|uncertain|unclear|unresolved)$/i);
  if (unresolvedAttribute) {
    return `What is the documented ${lowercaseLeading(cleanSubject(unresolvedAttribute[1]))}?`;
  }

  if (/\b(?:trend|trajectory|over time|serial|repeat)\b/i.test(text)) {
    return `How does ${lowercaseLeading(cleanSubject(text))} change on repeat measurement?`;
  }

  return "";
}

function normalizedGapText(value: string) {
  return value
    .replace(/^(?:unresolved question|open question|limitation|uncertainty|pending)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();
}

function unresolvedEvidenceList(text: string) {
  const prefixed = text.match(/^(?:unresolved|pending|missing|outstanding)\s+.{1,50}?\s+(?:evidence|information|results?|data)\s*[:—-]?\s*(.+?)\s+(?:remain(?:s)?|are)\s+(?:relevant|required|needed|unresolved|pending)\b/i);
  const absent = text.match(/^(?:the\s+)?(?:record|chart|documents?|evidence)\s+(?:does|do)\s+not\s+yet\s+(?:contain|include|provide|document)\s+(.+)$/i);
  const decisionList = text.match(/^(.+?,\s*.+?)\s+remain(?:s)?\s+(?:relevant|required|needed|unresolved|pending)\s+(?:to|for|before)\s+(?:the\s+)?(?:discharge|management|treatment|clinical)?\s*decision\b/i);
  const explicitlyNeeded = text.match(/\b(?:chart|record|documents?|evidence)\s+(?:still\s+)?(?:needs?|requires?)\s*:\s*(.+)$/i);
  return splitEvidenceList(
    prefixed?.[1] ?? absent?.[1] ?? decisionList?.[1] ?? explicitlyNeeded?.[1] ?? "",
  );
}

function splitEvidenceList(value: string) {
  return value
    .replace(/\s+(?:before|for)\s+(?:the\s+)?(?:decision|discharge|management).*/i, "")
    .replace(/,\s+(?:and|or)\s+/gi, ", ")
    .split(/\s*,\s*/)
    .map((item) => item.replace(/^(?:a|an|the)\s+/i, "").trim())
    .filter((item) => item.length >= 4);
}

function questionForPendingSubject(value: string) {
  const subject = cleanSubject(value);
  const confirmationThat = subject.match(/^confirmation\s+that\s+(.+)$/i);
  if (confirmationThat) {
    return `Has it been confirmed that ${lowercaseLeading(cleanSubject(confirmationThat[1]))}?`;
  }
  const confirmation = subject.match(/^confirmation\s+of\s+(.+)$/i);
  if (confirmation) {
    const confirmedSubject = cleanSubject(confirmation[1]);
    if (/^that\s+/i.test(confirmedSubject)) {
      return `Has it been confirmed ${lowercaseLeading(confirmedSubject)}?`;
    }
    const stability = confirmedSubject.match(/^stability\s+(on|of|with)\s+(.+)$/i);
    return stability
      ? stability[1].toLowerCase() === "of"
        ? `Is ${lowercaseLeading(cleanSubject(stability[2]))} stable?`
        : `Is the response to ${lowercaseLeading(cleanSubject(stability[2]))} stable?`
      : `Is ${lowercaseLeading(confirmedSubject)} confirmed?`;
  }
  const evidenceOf = subject.match(/^evidence\s+of\s+(.+)$/i);
  if (evidenceOf) return questionForPendingSubject(evidenceOf[1]);
  const documentation = subject.match(/^documentation\s+of\s+(.+)$/i);
  if (documentation) return `What ${lowercaseLeading(cleanSubject(documentation[1]))} is documented?`;
  const ambulatorySaturation = subject.match(/^(?:documented\s+)?oxygen\s+saturation\s+during\s+(.+?)(?:\s+if\s+(.+))?$/i);
  if (ambulatorySaturation) {
    const condition = ambulatorySaturation[2]
      ? ` when ${lowercaseLeading(cleanSubject(ambulatorySaturation[2]))}`
      : "";
    return `What oxygen saturation is documented during ${lowercaseLeading(cleanSubject(ambulatorySaturation[1]))}${condition}?`;
  }
  const saturation = subject.match(/^(?:documented\s+)?(.+?\bsaturation)$/i);
  if (saturation) {
    return `What is the documented ${lowercaseLeading(cleanSubject(saturation[1]))}?`;
  }
  const response = subject.match(/^(?:the\s+)?(?:patient'?s\s+)?response\s+to\s+(.+)$/i);
  if (response) return `What is the documented response to ${lowercaseLeading(cleanSubject(response[1]))}?`;
  const stability = subject.match(/^stability\s+of\s+(.+)$/i);
  if (stability) return `Is ${lowercaseLeading(cleanSubject(stability[1]))} stable?`;
  const resolution = subject.match(/^(?:the\s+)?resolution\s+of\s+(.+)$/i);
  if (resolution) {
    const resolvedSubject = cleanSubject(resolution[1]);
    return `${subjectIsPlural(resolvedSubject) ? "Have" : "Has"} ${lowercaseLeading(resolvedSubject)} resolved?`;
  }
  const recurrence = subject.match(/^(?:recurrence\s+or\s+absence\s+of|recurrence\s+of)\s+(.+)$/i);
  if (recurrence) {
    const recurrenceSubject = cleanSubject(recurrence[1]);
    return `${subjectIsPlural(recurrenceSubject) ? "Do" : "Does"} ${lowercaseLeading(recurrenceSubject)} recur?`;
  }
  const directionalFunction = subject.match(/^(?:stable\s+or\s+improving|improving\s+or\s+stable)\s+(.+?)(?:\s*\(([^)]+)\))?$/i);
  if (directionalFunction) {
    return `Is ${lowercaseLeading(cleanSubject(directionalFunction[1]))} stable or improving on repeat measurement?`;
  }
  if (/\b(?:weight|dose|measurement|value)\b/i.test(subject) && /\b(?:final|next|repeat|standing|morning)\b/i.test(subject)) {
    return `What is the documented ${lowercaseLeading(subject)}?`;
  }
  if (/\b(?:next|repeat|morning|follow-up)\b/i.test(subject) && /\b(?:function|status|assessment|finding)\b/i.test(subject)) {
    return `What is the documented ${lowercaseLeading(subject)}?`;
  }
  if (/\b(?:function|laborator|culture|result|status|assessment|finding|trajectory)\b/i.test(subject)) {
    return `What does the pending ${lowercaseLeading(subject)} show?`;
  }
  if (/\b(?:plan|strategy|decision|recommendation)\b/i.test(subject)) {
    return `What ${lowercaseLeading(subject)} has been documented?`;
  }
  return `What does the missing evidence establish about ${lowercaseLeading(subject)}?`;
}

function subjectIsPlural(value: string) {
  const subject = value.toLowerCase().replace(/\([^)]*\)/g, "").trim();
  return /(?:symptoms|findings|results|cultures|measurements|values|observations|events|levels)$/.test(subject) &&
    !/(?:status|analysis|diagnosis)$/.test(subject);
}

function questionForResolvedCondition(
  subjectValue: string,
  stateValue: string,
  decisionSubject: string,
) {
  const subject = lowercaseLeading(cleanSubject(subjectValue));
  const state = stateValue.toLowerCase();
  if (state === "resolved") {
    return decisionSubject
      ? `Is ${subject} resolved sufficiently to revisit ${lowercaseLeading(decisionSubject)}?`
      : `Is ${subject} resolved?`;
  }
  if (state === "established") return `Has ${subject} been established?`;
  if (state === "confirmed") return `Has ${subject} been confirmed?`;
  if (state === "available") return `Is ${subject} available?`;
  return `Has ${subject} been completed?`;
}

export function openQuestionQualityIssues(value: string) {
  const question = value.replace(/\s+/g, " ").trim();
  const issues = proseQualityIssues(question);
  if (!question.endsWith("?")) issues.push("missing-question-mark");
  if (!/^(?:if\b.{1,100},\s*)?(?:whether|what|when|where|why|how|which|who|has|have|is|are|could|would|will|did|do|does|can)\b/i.test(question)) {
    issues.push("not-grammatical-question");
  }
  if (/^(?:do not|start|begin|initiate|continue|hold|withhold|defer|delay|stop|recommend)\b/i.test(question)) {
    issues.push("recommendation-fragment");
  }
  if (/^(?:would|should|will|can|could|may)\s+not\s+(?:arrange|commit|prescribe|proceed|start|begin|initiate|continue|use|administer)\b/i.test(question)) {
    issues.push("recommendation-fragment");
  }
  if (/^(?:is|are)\s+(?:start|begin|initiate|continue|hold|withhold|defer|delay|stop)\w*\b/i.test(question)) {
    issues.push("malformed-interrogative");
  }
  if (/^whether\b/i.test(question)) issues.push("whether-fragment");
  if (/^what (?:do|does)\b.{1,160}\b(?:is|are|was|were)\b.{0,80}\bshow\?/i.test(question)) {
    issues.push("auxiliary-collision");
  }
  if (/^how (?:do|does)\b.{1,160}\b(?:is|are|was|were)\b.{0,100}\b(?:change|show)\b/i.test(question)) {
    issues.push("auxiliary-collision");
  }
  if (/^(?:is|are)\s+.{1,160}\b(?:is|are|was|were)\s+(?:suspected|possible|confirmed|excluded|established|available)\b/i.test(question)) {
    issues.push("auxiliary-collision");
  }
  if (/^what (?:do|does)\s+(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:days?|weeks?|months?|years?)\b/i.test(question)) {
    issues.push("temporal-fragment");
  }
  if (question.includes(";")) issues.push("compound-fragment");
  if (
    /\b(?:the )?(?:disease|condition|finding|result|treatment)\b/i.test(question) &&
    subjectTerms(question).length === 0
  ) {
    issues.push("generic-subject");
  }
  if (isGenericOpenQuestion(question)) issues.push("generic");
  return Array.from(new Set(issues));
}

export function isOpenQuestionEvidenceCompatible(
  question: string,
  fact: GroundedFact,
) {
  const source = `${fact.text} ${fact.excerpt}`.replace(/\s+/g, " ").trim();
  if (!source || isSourceNoise(source) || isMetadataOnly(source)) return false;
  const questionTerms = subjectTerms(question);
  const factTerms = subjectTerms(source);
  if (questionTerms.length === 0) return false;
  if (sharesQuestionSubject(questionTerms, factTerms)) return true;

  const factSet = new Set(factTerms);
  return questionTerms.some((term) =>
    factSet.has(term) && term.length >= 6 && !GENERIC_SUBJECT_TERMS.has(term),
  );
}

export function evidenceNeededForOpenQuestion(question: string) {
  const subject = questionSubject(question);
  if (/^how (?:does|did)\b/i.test(question)) {
    return `At least two dated measurements establishing the direction of ${subject}.`;
  }
  if (/\b(?:culture|microbiolog|BAL|bronchoalveolar lavage)\b/i.test(question)) {
    return `The finalized microbiologic or procedural findings for ${subject}.`;
  }
  if (/\b(?:pending|result|show)\b/i.test(question)) {
    return `The finalized source result for ${subject}.`;
  }
  return `A direct measurement, test result, or documented decision establishing ${subject}.`;
}

export function openQuestionImpact(question: string, relatedFacts: GroundedFact[]) {
  const conditionalDecision = relatedFacts.find((fact) =>
    fact.contentType === "recommendation" &&
    !isNeutralPositionStatement(fact.text) &&
    /\b(?:until|pending|if|unless|after)\b/i.test(fact.text),
  );
  if (conditionalDecision) {
    return "The result may change the timing or direction of the documented management decision.";
  }
  const relatedDecision = relatedFacts.find((fact) => fact.contentType === "recommendation");
  if (relatedDecision) {
    return "The result may change the documented treatment or monitoring decision.";
  }
  if (/\b(?:diagnos|confirm|exclude)\b/i.test(question)) {
    return "The result determines whether the leading interpretation remains supported or should be revised.";
  }
  if (/\b(?:trend|repeat|change|worsen|improv)\b/i.test(question)) {
    return "The direction of change determines whether the current finding is stable, improving, or progressing.";
  }
  return "The missing result determines how confidently the current evidence can be classified and acted on.";
}

function questionSubject(question: string) {
  const value = question
    .replace(/[?]+$/, "")
    .replace(/^what does (?:the )?missing evidence establish about\s+/i, "")
    .replace(/^(?:what do|what does|what is|what are|is|are|has|have|how does|how do)\s+/i, "")
    .replace(/\s+(?:show|confirmed|excluded|established|change on repeat measurement).*$/i, "")
    .trim();
  return lowercaseLeading(value || "the unresolved issue");
}

function cleanSubject(value: string) {
  return value
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\b(?:remains?|remained)\b.*$/i, "")
    .replace(/\b(?:is|are|was|were|has|have|had|will|would|could|should)\s*$/i, "")
    .replace(/[,:;\-]+$/g, "")
    .trim();
}

function cleanDecisionSubject(value: string) {
  return value
    .replace(/^.*?\b(?:recommend(?:s|ed)?|advise(?:s|d)?|favor(?:s|ed)?|prefer(?:s|red)?|should|must|needs? to|start|begin|initiate|continue|hold|withhold|defer|delay|stop|avoid)\b\s*/i, "")
    .replace(/^(?:that\s+)?(?:the\s+)?(?:patient\s+)?(?:be\s+)?/i, "")
    .replace(/[,:;\-]+$/g, "")
    .trim()
    .slice(0, 100);
}

function isQuestion(value: string) {
  return /\?$/.test(value) || /^(?:whether|what|when|where|why|how|which|who|has|have|is|are|could|would|did|does|can)\b/i.test(value);
}

function ensureQuestion(value: string) {
  const text = value.trim().replace(/[.]+$/, "");
  return `${text}${text.endsWith("?") ? "" : "?"}`;
}

function lowercaseLeading(value: string) {
  if (!value || /^[A-Z]{2,}\b/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function subjectTerms(value: string) {
  const stop = new Set([
    "about", "answer", "available", "change", "confirmed", "current", "direct", "documented",
    "does", "evidence", "excluded", "final", "finding", "findings", "pending", "question",
    "record", "repeat", "result", "results", "show", "shows", "still", "uploaded", "what",
  ]);
  return Array.from(new Set(
    value.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)
      ?.map(canonicalClinicalTerm)
      .filter((term) => !stop.has(term)) ?? [],
  ));
}

function canonicalClinicalTerm(term: string) {
  if (/^(?:kidney|renal|creatinine|egfr)$/.test(term)) return "renal-function";
  if (/^cultures?$/.test(term)) return "culture";
  if (/^(?:pathology|histology|biopsy)$/.test(term)) return "tissue-result";
  if (/^(?:medication|drug|therapy|treatment)$/.test(term)) return "treatment";
  return term.replace(/(?:ed|ing|s)$/, "");
}

function sharesQuestionSubject(questionTerms: string[], factTerms: string[]) {
  const factSet = new Set(factTerms);
  const shared = questionTerms.filter((term) => factSet.has(term));
  return shared.length >= Math.min(2, questionTerms.length);
}

const GENERIC_SUBJECT_TERMS = new Set([
  "clinical", "context", "follow-up", "management", "outcome", "patient", "response",
  "status", "treatment", "therapy",
]);
