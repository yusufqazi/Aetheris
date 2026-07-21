import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import { openQuestionFromGap } from "@/lib/research/open-questions";
import type {
  EvidenceItem,
  GroundedFact,
  GroundedFactCategory,
  ResearchContentType,
  ReportOutput,
} from "@/lib/types";

const CONCRETE_SIGNAL = /(?:\b\d+(?:\.\d+)?\s*%|\bp\s*[=<]\s*0?\.\d+|\b\d+(?:\.\d+)?\s+(?:participants?|patients?|subjects?|weeks?|months?|years?|events?|groups?|arms?|mg|mcg|mL|mmHg|bpm|ms)\b|\b[A-Za-z][A-Za-z /_-]{1,30}\s+\d+(?:\.\d+)?\s+(?:(?:to|→|->)\s+)?\d+(?:\.\d+)?\b|randomi[sz]ed|blind(?:ed)?|controlled|comparator|endpoint|adverse event|complication|excluded|uncertain|does not prove|not establish|follow-up|recommended|diagnos|disease|condition|syndrome|symptom|laborator|biomarker|imaging|procedure|treatment|therapy|medication|dose|improved|decreased|increased|normalized|persisted|progressed|resolved|risk|concern|discrepancy|contradiction)/i;
const CLINICAL_MEASUREMENT = /\b\d+(?:\.\d+)?\s*(?:%|mg(?:\/kg)?|mcg|µg|ug|g\/dL|mg\/dL|ng\/mL|pg\/mL|mmol\/L|mEq\/L|U\/L|IU\/L|mg\/L|mmHg|bpm|ms|mL\/min|cells?\/µL|copies\/mL|cm|mm|weeks?|months?|years?)\b|\bp\s*[=<]\s*0?\.\d+/i;
const CLINICAL_DECISION = /\b(?:proceed(?:ed|ing)?|begin|approve(?:d)?|initiat(?:e|ed|ing)|start(?:ed|ing)?|continu(?:e|ed|ing)|discontinu(?:e|ed|ing)|stop(?:ped|ping)?|hold|held|withhold(?:ing)?|withheld|delay(?:ed|ing)?|defer(?:red|ring)?|postpone(?:d|ment)?|switch(?:ed|ing)?|titrat(?:e|ed|ing)|escalat(?:e|ed|ing)|de-escalat(?:e|ed|ing)|favor(?:s|ed|ing)?|prioriti[sz](?:e|ed|ing)|administer(?:ed|ing)?|dose[- ]adjusted|dose (?:increased|decreased|reduced)|treatment was (?:recommended|approved|deferred|delayed))\b/i;
const MONITORING_SIGNAL = /\b(?:monitor(?:ed|ing)?|repeat(?:ed)?|recheck(?:ed)?|surveillance|follow-up (?:testing|laboratory|imaging|ecg)|serial (?:laboratory|imaging|ecg)|recommended follow-up)\b/i;
const CLINICAL_DOMAIN_SIGNAL = /\b(?:diagnos(?:is|ed)|disease|condition|syndrome|symptom|sign|biomarker|laborator(?:y|ies)|serolog(?:y|ic)|antibod(?:y|ies)|complement|assay|test(?:ing)?|result|positive|negative|elevated|decreased|low|high|abnormal|normal|patholog(?:y|ic)|biopsy|culture|quantification|measurement|protein(?:uria)?|hematuria|renal|kidney|organ|function|imaging|scan|radiograph|procedure|surgery|intervention|treatment|therapy|medication|drug|dose|specimen|lesion|mass|injury|infection)\b/i;
const SOURCE_INSTRUCTION = /^(?:summarize|identify|explain|assess|generate|review|compare)\b/i;
const BOILERPLATE = /^(?:synthetic test document|testing notice|patient\s+.+\bmrn\b)/i;
const INTERACTION_FOCUS = /\b(?:drug|medication|interaction|contraindication|harmful|coadmin)/i;
const LEADING_LABEL = /^(?:(?:key\s+)?finding|observation|question|unresolved question|recommendation|recommended action|treatment plan|plan|priority|status|safety observation|potential (?:contradiction|conflict)|discrepancy|change|limitation|evidence)\s*[:\-]\s*/i;
const TABLE_HEADER = /^(?:(?:medication|drug|combination|pair|measure|test|date|finding|observation|result|value|status|priority|concern|rationale|recommendation|reference|range|interpretation|source)(?:\s+|$)){2,}$/i;

export function extractGroundedFacts(evidence: EvidenceItem[], question: string): GroundedFact[] {
  const seen: string[] = [];
  const facts: GroundedFact[] = [];

  for (const item of evidence) {
    const candidates = splitSourceStatements(item.excerpt);

    for (let index = 0; index < candidates.length; index += 1) {
      const excerpt = candidates[index].trim();
      const statement = excerpt.replace(/\s+/g, " ").trim();
      if (
        (statement.length < 18 && !CLINICAL_MEASUREMENT.test(statement)) ||
        statement.length > 560 ||
        isTruncatedCandidate(excerpt, index, candidates, item) ||
        isIncompleteStatement(statement) ||
        isStructuralNoise(statement) ||
        (SOURCE_INSTRUCTION.test(statement) && !CONCRETE_SIGNAL.test(statement)) ||
        BOILERPLATE.test(statement) ||
        !isCompleteClinicalProposition(statement) ||
        !(CONCRETE_SIGNAL.test(statement) || CLINICAL_MEASUREMENT.test(statement) || CLINICAL_DECISION.test(statement) || MONITORING_SIGNAL.test(statement) || CLINICAL_DOMAIN_SIGNAL.test(statement) || isRecommendation(statement) || isPotentialInteractionStatement(statement))
      ) {
        continue;
      }

      const contentType = classifyContentType(statement);
      const displayText = normalizeDisplayStatement(statement);
      const normalized = normalizeForDeduplication(displayText);
      if (!normalized || seen.some((existing) => areEquivalentStatements(existing, normalized))) {
        continue;
      }
      seen.push(normalized);

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
  const clinicalContext = facts.filter((fact) =>
    (fact.contentType === "finding" || fact.contentType === "evidence_excerpt") &&
    (fact.category === "context" || fact.category === "study-design"),
  );
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
  const executiveSummary = executiveSummaryOverride ?? buildDirectAnswer({
    question,
    interactions,
    efficacy,
    safety,
    decisions,
    context: clinicalContext,
    uncertainties,
  });
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

  return {
    agentName: "Report Generation Agent",
    summary: `Assembled ${reportFacts.length} non-duplicated source-grounded findings into a traceable answer.`,
    confidence: reportFacts.length >= 6 ? "high" : reportFacts.length >= 3 ? "medium" : "low",
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
  return /^(?:recommend(?:ed|ation)?|plan(?:ned)?|proceed|begin|approve|monitor|repeat|obtain|consider|continue|discontinue|start|stop|hold|delay|defer|withhold|switch|titrate|avoid|favor|prioriti[sz]e|administer|review|evaluate|assess|recheck|schedule|refer|confirm|verify)\b|\b(?:is|are|was|were) (?:recommended|needed)\b|\b(?:should|needs? to)\s+(?:be\s+)?(?:proceed(?:ed)?|begun|begin|continued|discontinued|initiated|monitored|repeated|obtained|considered|reviewed|evaluated|confirmed|verified|stopped|started|held|delayed|deferred|withheld|avoided|administered|performed)\b|\b(?:recommend(?:s|ed)?|advis(?:es|ed)?)\b.{0,80}\b(?:proceed|begin|start|continue|hold|delay|defer|stop|switch|monitor|treatment|therapy|medication|drug|dose|dosing|regimen|indication|follow-up|testing|restricted)\b/i.test(value);
}

function isPotentialInteractionStatement(value: string) {
  return /\s(?:\+|plus)\s|combined with|drug interaction|medication-related|coadmin|concomitant.{0,40}(?:medication|therapy|drug)|exposure.{0,40}(?:medication|therapy|dose)|interaction concern/i.test(value) ||
    /^[A-Z][a-z][A-Za-z-]{3,}\b.{0,100}\b(?:may|can|could)\s+(?:increase|decrease|reduce|worsen|contribute|prolong|interfere|inhibit|induce|delay|blunt)\b/i.test(value);
}

export function isClinicallyMaterialRecommendation(value: string) {
  const researchOnly = /\b(?:larger|additional|future|further)\b.{0,50}\b(?:study|studies|trial|trials|research|evidence)\b|\bmore research is needed\b/i.test(value);
  return isRecommendation(value) && !researchOnly && (
    CLINICAL_DECISION.test(value) ||
    MONITORING_SIGNAL.test(value) ||
    /\b(?:treatment|therapy|medication|drug|dose|dosing|regimen|procedure|surgery|biopsy|imaging|laborator|ecg|follow-up|referral|indication|approval|intervention|management|support|resuscitation|source control)\b/i.test(value)
  );
}

function isLongitudinalChange(value: string) {
  const direction = /\b(?:improved|decreased|declined|increased|rose|fell|normalized|reduced|worsened|persisted|remained)\b/i.test(value);
  const pairedValues = /\bfrom\s+[-+]?\d+(?:\.\d+)?(?:\s*\w+)?\s+(?:to|→)\s+[-+]?\d+(?:\.\d+)?/i.test(value);
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
  const selectedFacts = selectSynthesisFacts(ranked, 5);
  const selected = selectedFacts.map((fact) => ensureSentence(fact.text));
  if (asksForDecision && decisions.length > 0) {
    const rankedDecisions = selectSynthesisFacts(rankFactsForQuestion(decisions, question), 3);
    const diagnostic = ranked.find(isDiagnosticFact);
    const excludedIds = new Set([
      ...rankedDecisions.map((fact) => fact.id),
      ...(diagnostic ? [diagnostic.id] : []),
    ]);
    const supportLimit = Math.max(3, 7 - rankedDecisions.length - Number(Boolean(diagnostic)));
    const supporting = selectSynthesisFacts(
      ranked.filter((fact) => !excludedIds.has(fact.id)),
      supportLimit,
    ).map((fact) => ensureSentence(fact.text));
    const recommendations = rankedDecisions.map((fact, index) => {
      const prefix = index === 0
        ? "The documented treatment priority is"
        : "The record also supports the recommendation";
      return `${prefix} ${recommendationClause(fact.text)}.`;
    });
    return [
      ...(diagnostic ? [ensureSentence(diagnostic.text)] : []),
      ...recommendations,
      ...supporting,
    ].join(" ");
  }
  if (asksForDecision) {
    return `The uploaded evidence supports a qualified decision based on the current record: ${selected.join(" ")}`;
  }
  return `Based on the uploaded documents, ${lowercaseLeading(selected[0])}${selected.slice(1).length ? ` ${selected.slice(1).join(" ")}` : ""}`;
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
      return overlap * 3 + decisionWeight + diagnosticWeight + objectiveWeight + uncertaintyWeight;
    };
    return score(right) - score(left);
  });
}

function isDiagnosticFact(fact: GroundedFact) {
  return /\b(?:diagnos(?:is|ed)|strongly support\w*|consistent with|meets? (?:the )?criteria|leading (?:diagnosis|interpretation)|confirmed)\b/i.test(
    `${fact.text} ${fact.excerpt}`,
  );
}

function selectSynthesisFacts(facts: GroundedFact[], limit: number) {
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
    .map((fact) => openQuestionFromGap(fact.text));

  const evidenceGaps = facts
    .filter((fact) =>
      fact.contentType === "limitation" ||
      fact.contentType === "discrepancy" ||
      (fact.contentType === "recommendation" && /\b(?:until|pending|unless|after)\b/i.test(fact.text)),
    )
    .map((fact) => openQuestionFromGap(fact.text));

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

function recommendationClause(value: string) {
  const text = stripTerminalPunctuation(value.replace(/\s+/g, " ").trim());
  const negativeImperative = text.match(/^do not\s+(.+)$/i);
  if (negativeImperative) return `not to ${lowercaseLeading(negativeImperative[1])}`;
  const imperative = text.match(/^(proceed|begin|start|continue|stop|hold|delay|defer|withhold|switch|monitor|repeat|obtain|consider|avoid|favor|prioritize|prioritise|administer|review|evaluate|confirm|verify)\b(.*)$/i);
  if (imperative) return `to ${imperative[1].toLowerCase()}${imperative[2]}`;
  return `that ${lowercaseLeading(text)}`;
}

function ensureSentence(value: string) {
  const text = stripTerminalPunctuation(value.replace(/\s+/g, " ").trim());
  return `${text}.`;
}

function stripTerminalPunctuation(value: string) {
  return value.replace(/[.!?]+$/, "");
}

function lowercaseLeading(value: string) {
  if (!value || /^[A-Z]{2,}\b/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
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

  return (containment >= 0.9 && larger / Math.max(1, smaller) <= 1.55) || jaccard >= 0.84;
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
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
