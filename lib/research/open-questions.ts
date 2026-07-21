import type { GroundedFact } from "@/lib/types";

const GENERIC_QUESTION = /(?:what|which) (?:additional|other|more) (?:source|evidence|information)|what evidence would|decision-changing evidence|reduce uncertainty|strengthen the conclusion|materially change the conclusion|more evidence (?:is|would be) needed/i;

export function isGenericOpenQuestion(value: string) {
  return GENERIC_QUESTION.test(value.replace(/\s+/g, " ").trim());
}

export function openQuestionFromGap(value: string) {
  const text = value
    .replace(/^(?:unresolved question|open question|limitation|uncertainty|pending)\s*[:\-]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/, "")
    .trim();
  if (!text) return "Which specific result needed for the current decision is absent?";
  if (isQuestion(text) && !isGenericOpenQuestion(text)) return ensureQuestion(text);

  const conditionalDecision = text.match(/^(.{8,160}?)\s+(?:until|pending|after)\s+(.{4,120}?)(?:,\s*(?:unless|if)\s+(.{3,100}))?$/i);
  if (conditionalDecision) {
    const condition = cleanSubject(conditionalDecision[2]);
    const exception = conditionalDecision[3] ? cleanSubject(conditionalDecision[3]) : "";
    const resolved = condition.match(/^(.+?)\s+(?:is|are)\s+resolved$/i);
    const baseQuestion = resolved
      ? `Is ${lowercaseLeading(cleanSubject(resolved[1]))} resolved, and does that change the documented decision to ${lowercaseLeading(cleanSubject(conditionalDecision[1]))}?`
      : `What does ${condition} show, and does it change the documented decision to ${lowercaseLeading(cleanSubject(conditionalDecision[1]))}?`;
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

  if (/\b(?:durability|long-term|follow-up window|beyond\s+\d+\s+(?:weeks?|months?|years?))\b/i.test(text)) {
    return `Is ${lowercaseLeading(cleanSubject(text))} sustained on follow-up?`;
  }

  const notCompleted = text.match(/^(.{3,120}?)\s+(?:has|have|had|is|are|was|were)\s+not\s+(?:yet\s+)?(?:been\s+)?(?:performed|completed|obtained|measured|quantified|reported|reviewed|available)$/i);
  if (notCompleted) {
    const subject = cleanSubject(notCompleted[1]);
    return /\b(?:trend|trajectory|change|response)\b/i.test(subject)
      ? `How does ${lowercaseLeading(subject)} change on repeat measurement?`
      : `What is the documented result for ${lowercaseLeading(subject)}?`;
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

  const notExcluded = text.match(/^(.{3,120}?)\s+(?:was|were|is|are|has|have)?\s*(?:not|never)\s+(?:formally\s+)?(?:excluded|established|confirmed|evaluated|assessed)$/i);
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

  return `Is ${lowercaseLeading(cleanSubject(text))} established by a direct result in the uploaded record?`;
}

export function evidenceNeededForOpenQuestion(question: string) {
  const subject = questionSubject(question);
  if (/^how (?:does|did)\b/i.test(question)) {
    return `At least two dated measurements establishing the direction of ${subject}.`;
  }
  if (/\b(?:pending|result|show)\b/i.test(question)) {
    return `The finalized source result for ${subject}.`;
  }
  return `A direct measurement, test result, or documented decision establishing ${subject}.`;
}

export function openQuestionImpact(question: string, relatedFacts: GroundedFact[]) {
  const conditionalDecision = relatedFacts.find((fact) =>
    fact.contentType === "recommendation" && /\b(?:until|pending|if|unless|after)\b/i.test(fact.text),
  );
  if (conditionalDecision) {
    return `The result determines whether the documented plan can proceed as written: ${ensureSentence(conditionalDecision.text)}`;
  }
  const relatedDecision = relatedFacts.find((fact) => fact.contentType === "recommendation");
  if (relatedDecision) {
    return `The result may change the documented treatment or monitoring decision: ${ensureSentence(relatedDecision.text)}`;
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
    .replace(/^(?:what do|what does|what is|what are|is|are|has|have|how does|how do)\s+/i, "")
    .replace(/\s+(?:show|confirmed|excluded|established|change on repeat measurement).*$/i, "")
    .trim();
  return lowercaseLeading(value || "the unresolved issue");
}

function cleanSubject(value: string) {
  return value
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\b(?:remains?|remained)\b.*$/i, "")
    .replace(/[,:;\-]+$/g, "")
    .trim();
}

function isQuestion(value: string) {
  return /\?$/.test(value) || /^(?:whether|what|when|where|why|how|which|who|has|have|is|are|could|would|did|does|can)\b/i.test(value);
}

function ensureQuestion(value: string) {
  const text = value.trim().replace(/[.]+$/, "");
  return `${text}${text.endsWith("?") ? "" : "?"}`;
}

function ensureSentence(value: string) {
  const text = value.trim().replace(/[.!?]+$/, "");
  return `${text}.`;
}

function lowercaseLeading(value: string) {
  if (!value || /^[A-Z]{2,}\b/.test(value)) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}
