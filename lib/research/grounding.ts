import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import type {
  EvidenceItem,
  GroundedFact,
  GroundedFactCategory,
  ResearchContentType,
  ReportOutput,
} from "@/lib/types";

const CONCRETE_SIGNAL = /(?:\b\d+(?:\.\d+)?\s*%|\bp\s*[=<]\s*0?\.\d+|\b\d+(?:\.\d+)?\s+(?:participants?|patients?|subjects?|weeks?|months?|years?|events?|groups?|arms?|mg|g\/dL|ng\/mL|mmol\/L|ms)\b|\b[A-Za-z][A-Za-z /_-]{1,30}\s+\d+(?:\.\d+)?\s+(?:(?:to|→|->)\s+)?\d+(?:\.\d+)?\b|randomi[sz]ed|double-blind|placebo-controlled|primary endpoint|adverse events?|serious adverse|excluded|uncertain|does not prove|not establish|follow-up|recommended|quality-of-life|interaction|coadministration|concomitant|\bqtc?\b|absorption|blood loss|orthostatic|hemoglobin|ferritin|anemia|palpitations?|improved|decreased|increased|normalized|persisted|risk|concern|discrepancy|contradiction)/i;
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
        statement.length < 18 ||
        statement.length > 560 ||
        isTruncatedCandidate(excerpt, index, candidates, item) ||
        isIncompleteStatement(statement) ||
        isStructuralNoise(statement) ||
        (SOURCE_INSTRUCTION.test(statement) && !CONCRETE_SIGNAL.test(statement)) ||
        BOILERPLATE.test(statement) ||
        !CONCRETE_SIGNAL.test(statement)
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
  if (/\b(?:and|or|that|which|because|with|from|to|of|frequent)\s*[,:;-]*$/i.test(value)) return true;
  return /^(?:the\s+)?(?:first|second|third)\s+concern\s+is\s+that\b/i.test(value) && !/[.!?]$/.test(value);
}

function isTruncatedCandidate(
  excerpt: string,
  index: number,
  candidates: string[],
  evidence: EvidenceItem,
) {
  if (index !== candidates.length - 1 || /[.!?)]$/.test(excerpt)) return false;
  const continuation = evidence.contextAfter.trimStart();
  return continuation.length > 0 && /^[a-z]/.test(continuation);
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
  const safety = facts.filter((fact) => fact.contentType === "safety_observation");
  const context = facts.filter((fact) => fact.contentType === "finding" && fact.category === "study-design");
  const uncertainties = facts.filter((fact) =>
    fact.contentType === "limitation" || fact.contentType === "discrepancy",
  );
  const interactionFocused = INTERACTION_FOCUS.test(question);
  const keyFindings = uniqueFacts(interactionFocused
    ? [...interactions.slice(0, 6), ...efficacy.slice(0, 2)]
    : [...efficacy.slice(0, 6), ...interactions.slice(0, 3)]).slice(0, 8);
  const safetyFindings = uniqueFacts(safety).slice(0, 4);
  const contextFindings = uniqueFacts(context).slice(0, 3);
  const uncertaintyFindings = uniqueFacts(uncertainties).slice(0, 4);
  const executiveSummary = executiveSummaryOverride ?? buildDirectAnswer({
    question,
    interactions,
    efficacy,
    safety,
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
  const topical = !INTERACTION_FOCUS.test(question) || /interaction|medication|drug|qtc?|absorption|coadministration/i.test(reportText);
  const uniqueFindings = new Set(report.keyFindings.map((finding) => normalizeForDeduplication(finding)));
  return numbersGrounded && topical && uniqueFindings.size === report.keyFindings.length;
}

function splitSourceStatements(text: string) {
  const lines = text
    .replace(/\s*\u2022\s*/g, "\n")
    .split(/\n+/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  return groupLikelyTableRows(lines)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map((statement) => statement.trim())
    .filter((statement) => statement.length >= 18 && /^[A-Z0-9(]/.test(statement));
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
  if (/\s(?:\+|plus)\s|combined with|drug interaction|medication-related|cumulative qt|qt[- ]prolong|coadmin|concomitant.{0,40}(?:medication|therapy|drug)|absorption.{0,40}(?:medication|therapy|dose)|interaction concern/i.test(value)) {
    return "interaction_concern";
  }
  if (/^[A-Z][a-z][A-Za-z-]{3,}\b.{0,80}\b(?:may|can|could)\s+(?:increase|decrease|reduce|worsen|contribute|prolong|interfere|inhibit|induce)\b/i.test(value)) {
    return "interaction_concern";
  }
  if (/limitation|uncertain|does not prove|not establish|unresolved|missing evidence|not formally exclude|small subgroup|limited (?:to|follow-up)|confidence intervals overlap|remains unknown|insufficient evidence|cannot determine|excluded|not represented/i.test(value)) {
    return "limitation";
  }
  if (/randomi[sz]ed|double-blind|placebo-controlled|participants?|subjects?|primary endpoint|secondary endpoint|received .*placebo/i.test(value)) {
    return "finding";
  }
  if (/adverse|headache|nausea|fatigue|dizziness|rash|injection-site|serious event|toxicity|palpitations|syncope|bleeding|orthostatic symptoms|safety signal/i.test(value)) {
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
  return /^(?:recommend(?:ed|ation)?|plan(?:ned)?|monitor|repeat|obtain|consider|continue|discontinue|start|stop|avoid|review|evaluate|assess|recheck|schedule|refer|confirm|verify)\b|\b(?:is|are|was|were) (?:recommended|needed)\b|\b(?:should|needs? to)\s+(?:be\s+)?(?:monitored|repeated|obtained|considered|reviewed|evaluated|confirmed|verified|stopped|started|avoided)\b/i.test(value);
}

function isLongitudinalChange(value: string) {
  const direction = /\b(?:improved|decreased|declined|increased|rose|fell|normalized|reduced|worsened|persisted|remained)\b/i.test(value);
  const pairedValues = /\bfrom\s+[-+]?\d+(?:\.\d+)?(?:\s*\w+)?\s+(?:to|→)\s+[-+]?\d+(?:\.\d+)?/i.test(value);
  const temporal = /\b(?:baseline|initial|earlier|later|follow-up|subsequent|previous|after|over time)\b/i.test(value);
  const compactPair = /^[A-Za-z][A-Za-z /_-]{1,30}\s+[-+]?\d+(?:\.\d+)?\s+(?:(?:to|→|->)\s+)?[-+]?\d+(?:\.\d+)?(?:\s*\w+)?$/i.test(value);
  return pairedValues || compactPair || (direction && temporal) || /\b(?:reduced|improved|decreased|increased)\b.{0,50}\bbut (?:still )?(?:persisted|remained)\b/i.test(value);
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
  if (/randomi[sz]ed|double-blind|placebo-controlled|participants?|subjects?|primary endpoint|secondary endpoint|received .*placebo|follow-up date|collection date/i.test(text)) {
    return "study-design";
  }
  if (/\bp\s*[=<]|confidence interval|statistical|significant/i.test(text)) return "statistical";
  return "efficacy";
}

function buildDirectAnswer({
  question,
  interactions,
  efficacy,
  safety,
  uncertainties,
}: {
  question: string;
  interactions: GroundedFact[];
  efficacy: GroundedFact[];
  safety: GroundedFact[];
  uncertainties: GroundedFact[];
}) {
  if (INTERACTION_FOCUS.test(question)) {
    if (interactions.length === 0) {
      return "The retrieved documents do not establish a harmful drug interaction. They may still contain incomplete medication histories, so absence of a retrieved interaction should not be treated as proof of safety.";
    }

    const interactionText = interactions.map((fact) => fact.text).join(" ");
    if (/qtc?|qt[- ]prolong/i.test(interactionText)) {
      return "Several medication-related concerns are documented, with cumulative QT-prolongation risk as the strongest concern, but no harmful arrhythmia or medication-caused injury is proven.";
    }
    return `The sources document ${interactions.length} medication-related concern${interactions.length === 1 ? "" : "s"}. These are source-reported risk signals, not proof that a harmful medication event occurred.`;
  }

  const strongest = uniqueFacts([efficacy[0], efficacy[1], safety[0], uncertainties[0]]);
  return strongest.length > 0
    ? `The uploaded sources support ${strongest.length} central conclusions. ${strongest.map((fact) => fact.text).join(" ")}`
    : "The retrieved passages did not contain enough concrete information to answer the question reliably.";
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
    efficacy: "Supports the reported outcome assessment.",
    "study-design": "Establishes the source and clinical context.",
    statistical: "Supports the quantitative result.",
    interaction: "Supports the medication-interaction assessment.",
    safety: "Supports the source-reported safety assessment.",
    limitation: "Identifies a boundary in the available evidence.",
    exclusion: "Identifies a population not represented by the evidence.",
  }[category];
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
  const uncertainties: string[] = [];
  if (interactionFocused && facts.some((fact) => /qtc?|arrhythmia/i.test(fact.text))) {
    const sourceAlreadySaysThis = facts.some((fact) => /does not prove.*arrhythmia|not proof.*arrhythmia/i.test(fact.text));
    if (!sourceAlreadySaysThis) {
      uncertainties.push("The documents identify QT-related risk but do not prove that an arrhythmia or medication-caused injury occurred.");
    }
  }
  if (uncertainties.length === 0) {
    uncertainties.push("The answer is limited to the uploaded documents and was not checked against external clinical literature.");
  }
  return uniqueStrings(uncertainties);
}

function buildFollowUpQuestions(question: string, facts: GroundedFact[]) {
  const extractedQuestions = facts
    .filter((fact) => fact.contentType === "unresolved_question")
    .map((fact) => fact.text);
  if (extractedQuestions.length > 0) return uniqueStrings(extractedQuestions).slice(0, 4);

  const text = facts.map((fact) => fact.text).join(" ");
  const questions: string[] = [];
  if (INTERACTION_FOCUS.test(question)) {
    if (/qtc?|qt[- ]prolong/i.test(text)) questions.push("Did the QTc remain stable after the documented medication and electrolyte changes?");
    if (/absorption|acid suppress/i.test(text)) questions.push("What is the confirmed frequency and timing of the medication associated with the absorption concern?");
    if (/orthostatic/i.test(text)) questions.push("Did the orthostatic symptoms resolve after the documented medication change?");
    if (/blood loss|bleeding/i.test(text)) questions.push("Was gastrointestinal or another ongoing source of blood loss excluded?");
  }
  if (questions.length === 0) {
    questions.push(`Which additional source would most reduce uncertainty for: ${question}`);
  }
  return questions.slice(0, 4);
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
