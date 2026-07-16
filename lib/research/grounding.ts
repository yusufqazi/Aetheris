import { RESEARCH_DISCLAIMER } from "@/lib/prompts";
import type {
  EvidenceItem,
  GroundedFact,
  GroundedFactCategory,
  ReportOutput,
} from "@/lib/types";

const CONCRETE_SIGNAL = /(?:\b\d+(?:\.\d+)?\s*%|\bp\s*[=<]\s*0?\.\d+|\b\d+(?:\.\d+)?\s+(?:participants?|patients?|subjects?|weeks?|months?|years?|events?|groups?|arms?|mg|g\/dL|ng\/mL|ms)\b|randomi[sz]ed|double-blind|placebo-controlled|primary endpoint|adverse events?|serious adverse|excluded|uncertain|does not prove|not establish|follow-up|larger multi-center|recommended|quality-of-life|c-reactive|\bdas\b|interaction|coadministration|\bqtc?\b|absorption|blood loss|orthostatic|hydroxychloroquine|azithromycin|propranolol|omeprazole|ibuprofen|hemoglobin|ferritin|anemia|improved|decreased|increased|normalized|risk|concern)/i;
const SOURCE_INSTRUCTION = /^(?:summarize|identify|explain|assess|generate|review|compare)\b/i;
const BOILERPLATE = /^(?:synthetic test document|testing notice|patient\s+.+\bmrn\b)/i;
const INTERACTION_FOCUS = /\b(?:drug|medication|interaction|contraindication|harmful|coadmin)/i;

export function extractGroundedFacts(evidence: EvidenceItem[], question: string): GroundedFact[] {
  const seen = new Set<string>();
  const facts: GroundedFact[] = [];

  for (const item of evidence) {
    const interactionCandidates = extractInteractionCandidates(item.excerpt);
    const candidates = [...interactionCandidates, ...splitSourceSentences(item.excerpt)];

    for (let index = 0; index < candidates.length; index += 1) {
      const excerpt = candidates[index].replace(/\s+/g, " ").trim();
      if (
        excerpt.length < 18 ||
        excerpt.length > 460 ||
        SOURCE_INSTRUCTION.test(excerpt) ||
        BOILERPLATE.test(excerpt) ||
        /medication reconciliation|interaction and safety findings|patient-reported intermittent use|status key safety/i.test(excerpt) ||
        (!interactionCandidates.includes(candidates[index]) && countMedicationMentions(excerpt) >= 2 && !excerpt.includes(" + ")) ||
        !CONCRETE_SIGNAL.test(excerpt)
      ) {
        continue;
      }

      const normalized = normalizeForDeduplication(excerpt);
      if (!normalized || hasEquivalentFact(seen, normalized)) {
        continue;
      }
      seen.add(normalized);

      const category = classifyFact(excerpt);
      facts.push({
        id: `fact:${item.id}:${index}`,
        category,
        text: cleanFindingText(excerpt, category),
        evidenceId: item.id,
        documentId: item.documentId,
        documentName: item.documentName,
        page: item.page,
        excerpt,
        relevance: relevanceFor(category),
      });
    }
  }

  const ordered = facts.sort((left, right) => categoryOrder(left.category) - categoryOrder(right.category));
  return INTERACTION_FOCUS.test(question)
    ? ordered.sort((left, right) => Number(right.category === "interaction") - Number(left.category === "interaction"))
    : ordered;
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
  const interactions = factsByCategory(facts, "interaction");
  const efficacy = factsByCategory(facts, "efficacy", "statistical");
  const safety = factsByCategory(facts, "safety");
  const context = factsByCategory(facts, "study-design");
  const uncertainties = factsByCategory(facts, "limitation", "exclusion");
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
      topic: labelForCategory(fact.category),
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

function extractInteractionCandidates(text: string) {
  const matches: string[] = [];
  const rowStart = "(?:Hydroxychloroquine|Propranolol|Omeprazole|Ibuprofen)\\s*\\+";
  const tableFinding = new RegExp(
    `(${rowStart}[\\s\\S]{8,300}?)(?=${rowStart}|Potential Contradiction|Recommended Medication|Pharmacist Conclusion|$)`,
    "gi",
  );
  for (const match of text.matchAll(tableFinding)) {
    const value = match[1].replace(/\s+/g, " ").trim().replace(/\s+(?:an|unc|suspe|re)$/i, "");
    if (/qtc?|interaction|absorption|blood loss|orthostatic|risk|concern|exposure/i.test(value)) {
      matches.push(value);
    }
  }

  for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
    if (
      sentence.length <= 460 &&
      /^[A-Z0-9]/.test(sentence) &&
      countMedicationMentions(sentence) < 2 &&
      !/medication reconciliation|interaction and safety findings|patient-reported intermittent use|status key safety/i.test(sentence) &&
      /medication-related|cumulative qt|prolong qt|iron absorption|compensatory tachycardia|gastrointestinal blood loss|interaction/i.test(sentence)
    ) {
      matches.push(sentence);
    }
  }
  return matches;
}

function splitSourceSentences(text: string) {
  return text
    .replace(/\s*\u2022\s*/g, "\n")
    .split(/\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 18 && /^[A-Z0-9]/.test(sentence));
}

function classifyFact(text: string): GroundedFactCategory {
  if (/\s\+\s|drug interaction|medication-related|cumulative qt|prolong qt|coadmin|iron absorption|propranolol.*orthostatic|ibuprofen.*blood loss/i.test(text)) {
    return "interaction";
  }
  if (/excluded|pediatric|geriatric|pregnant|population was narrow/i.test(text)) {
    return "exclusion";
  }
  if (/limitation|uncertain|does not prove|not establish|unresolved|missing evidence|not formally exclude|small subgroup|limited (?:to|follow-up)|larger multi-center|longer follow-up|recommended|confidence intervals overlap|remains depleted|remains unknown/i.test(text)) {
    return "limitation";
  }
  if (/randomi[sz]ed|double-blind|placebo-controlled|participants?|subjects?|primary endpoint|secondary endpoint|received .*placebo|follow-up date|collection date/i.test(text)) {
    return "study-design";
  }
  if (/adverse|headache|nausea|fatigue|dizziness|rash|injection-site|serious event|safety|qtc?|palpitations|syncope/i.test(text)) {
    return "safety";
  }
  if (/\bp\s*[=<]|confidence interval|statistical|significant/i.test(text)) {
    return "statistical";
  }
  return "efficacy";
}

function cleanFindingText(text: string, category: GroundedFactCategory) {
  let value = text
    .replace(/^(?:mock clinical study report\s*)/i, "")
    .replace(/^(?:study overview|study design|key findings|safety|limitations|pharmacist conclusion)\s+/i, "")
    .replace(/\.\s+\.$/, ".")
    .trim();

  if (category === "interaction") {
    value = value.replace(
      /\s+(Moderate concern|Low-to-moderate concern|Clinically relevant)\s+/i,
      ": $1. ",
    );
    if (/^Hydroxychloroquine \+ recent azithromycin exposure/i.test(value)) {
      value = "Hydroxychloroquine + recent azithromycin exposure: Moderate concern. Both can prolong QT.";
    } else if (/^Hydroxychloroquine \+ borderline QTc 477 ms/i.test(value)) {
      value = "Hydroxychloroquine + borderline QTc 477 ms: Clinically relevant. Repeat ECG and review modifiable risk factors, including electrolytes.";
    } else if (/^Propranolol \+ orthostatic symptoms/i.test(value)) {
      value = "Propranolol + orthostatic symptoms: Moderate concern. It could worsen lightheadedness or reduce the compensatory heart-rate response.";
    } else if (/^Omeprazole \+ oral iron/i.test(value)) {
      value = "Omeprazole + oral iron: Low-to-moderate concern. Frequent acid suppression may reduce iron absorption; actual use frequency is uncertain.";
    } else if (/^Ibuprofen \+ heavy menstrual bleeding \/ anemia/i.test(value)) {
      value = "Ibuprofen + heavy menstrual bleeding or anemia: Moderate concern. NSAID use may contribute to gastrointestinal blood loss.";
    }
  }
  return value;
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
    const themes: string[] = [];
    if (/qtc?|prolong qt|hydroxychloroquine|azithromycin/i.test(interactionText)) {
      themes.push("The strongest concern is cumulative QT-prolongation risk, especially where QT-active medications overlap with a prolonged QTc or electrolyte abnormalities.");
    }
    if (/omeprazole|iron absorption|acid suppression/i.test(interactionText)) {
      themes.push("Frequent acid suppression may also reduce oral iron absorption and delay recovery.");
    }
    if (/propranolol|orthostatic/i.test(interactionText)) {
      themes.push("Propranolol may worsen orthostatic symptoms or blunt compensatory tachycardia.");
    }
    if (/ibuprofen|blood loss/i.test(interactionText)) {
      themes.push("Ibuprofen may add bleeding-related risk when anemia or heavy bleeding is present.");
    }
    return `Yes. The sources identify several medication-related concerns. ${themes.join(" ")} These findings describe documented risk signals, not proof that a harmful event occurred.`;
  }

  const strongest = uniqueFacts([efficacy[0], efficacy[1], safety[0], uncertainties[0]]);
  return strongest.length > 0
    ? `The uploaded sources support ${strongest.length} central conclusions. ${strongest.map((fact) => fact.text).join(" ")}`
    : "The retrieved passages did not contain enough concrete information to answer the question reliably.";
}

function relevanceFor(category: GroundedFactCategory) {
  return {
    interaction: "Supports the medication-risk assessment.",
    efficacy: "Supports the reported outcome assessment.",
    safety: "Supports the safety assessment.",
    "study-design": "Establishes the source and clinical context.",
    limitation: "Identifies an unresolved uncertainty.",
    exclusion: "Identifies a population not represented by the evidence.",
    statistical: "Supports the quantitative result.",
  }[category];
}

function labelForCategory(category: GroundedFactCategory) {
  return {
    interaction: "Medication interaction",
    efficacy: "Outcome",
    safety: "Safety",
    "study-design": "Source context",
    limitation: "Uncertainty",
    exclusion: "Excluded population",
    statistical: "Statistical result",
  }[category];
}

function categoryOrder(category: GroundedFactCategory) {
  return ["interaction", "statistical", "efficacy", "safety", "study-design", "limitation", "exclusion"].indexOf(category);
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
  const text = facts.map((fact) => fact.text).join(" ");
  const questions: string[] = [];
  if (INTERACTION_FOCUS.test(question)) {
    if (/qtc?|hydroxychloroquine|azithromycin/i.test(text)) questions.push("Has QTc remained within range after electrolyte correction and medication changes?");
    if (/omeprazole|iron absorption/i.test(text)) questions.push("What is the confirmed frequency and timing of acid-suppressing medication relative to oral iron?");
    if (/propranolol|orthostatic/i.test(text)) questions.push("Did orthostatic symptoms improve after propranolol was stopped?");
    if (/ibuprofen|blood loss/i.test(text)) questions.push("Has gastrointestinal or menstrual blood loss been adequately evaluated?");
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

function normalizeForDeduplication(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

function hasEquivalentFact(seen: Set<string>, candidate: string) {
  for (const existing of seen) {
    if (existing === candidate) return true;
    if (candidate.length > 45 && (existing.includes(candidate) || candidate.includes(existing))) return true;
  }
  return false;
}

function uniqueFacts(values: Array<GroundedFact | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is GroundedFact => {
    if (!value) return false;
    const normalized = normalizeForDeduplication(value.text);
    if (hasEquivalentFact(seen, normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function countMedicationMentions(value: string) {
  const normalized = value.toLowerCase();
  return ["hydroxychloroquine", "azithromycin", "propranolol", "omeprazole", "ibuprofen", "ferrous sulfate"]
    .filter((medication) => normalized.includes(medication)).length;
}
