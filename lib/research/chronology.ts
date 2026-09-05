import type { GroundedFact } from "@/lib/types";

type ClinicalSource = Pick<
  GroundedFact,
  "documentName" | "text" | "excerpt" | "sourceSection"
>;

type SourceOrder = {
  kind: "date" | "day" | "sequence";
  value: number;
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function compareClinicalSourceOrder(left: ClinicalSource, right: ClinicalSource) {
  const leftOrder = clinicalSourceOrder(left);
  const rightOrder = clinicalSourceOrder(right);
  if (!leftOrder || !rightOrder || leftOrder.kind !== rightOrder.kind) return 0;
  return leftOrder.value - rightOrder.value;
}

export function isLaterClinicalUpdate(later: ClinicalSource, earlier: ClinicalSource) {
  if (compareClinicalSourceOrder(later, earlier) <= 0) return false;
  if (!sameClinicalSource(later, earlier)) return false;
  const earlierText = sourceText(earlier);
  const laterText = sourceText(later);
  const earlierWasConditional = /\b(?:pending|not yet|awaiting|once|until|after|depends? on|dependent on|inpatient versus outpatient|inpatient vs\.? outpatient)\b/i.test(earlierText);
  const laterUpdatesState = /\b(?:addendum|follow-up|subsequent|later|next[- ]day|updated?|now|no objection|cleared|completed|confirmed|documented|obtained|performed|provided|scheduled|tolerated|discharge|outpatient)\b/i.test(laterText);
  return earlierWasConditional && laterUpdatesState;
}

export function sameClinicalSource(left: ClinicalSource, right: ClinicalSource) {
  const leftIdentity = sourceIdentityTerms(left);
  const rightIdentity = new Set(sourceIdentityTerms(right));
  return leftIdentity.some((term) => rightIdentity.has(term));
}

function clinicalSourceOrder(source: ClinicalSource): SourceOrder | null {
  const text = sourceText(source);
  const iso = text.match(/\b(20\d{2})[-_/](0?[1-9]|1[0-2])[-_/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    return {
      kind: "date",
      value: Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])),
    };
  }

  const numeric = text.match(/\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])(?:[/-](20\d{2}|\d{2}))?\b/);
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : null;
    return year
      ? { kind: "date", value: Date.UTC(year, Number(numeric[1]) - 1, Number(numeric[2])) }
      : { kind: "day", value: Number(numeric[1]) * 32 + Number(numeric[2]) };
  }

  const named = text.match(new RegExp(
    `\\b(${Object.keys(MONTHS).join("|")})\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\b`,
    "i",
  ));
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    return named[3]
      ? { kind: "date", value: Date.UTC(Number(named[3]), month - 1, Number(named[2])) }
      : { kind: "day", value: month * 32 + Number(named[2]) };
  }

  const sequence = source.documentName.match(/^(\d{1,3})[_\s-]/);
  return sequence ? { kind: "sequence", value: Number(sequence[1]) } : null;
}

function sourceText(source: ClinicalSource) {
  return [source.documentName, source.sourceSection, source.text, source.excerpt]
    .filter(Boolean)
    .join(" ");
}

function sourceIdentityTerms(source: ClinicalSource) {
  const value = `${source.documentName} ${source.sourceSection ?? ""}`
    .toLowerCase()
    .replace(/\.pdf\b/g, " ")
    .replace(/\b20\d{2}[-_/]\d{1,2}[-_/]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/^\s*\d{1,3}[_\s-]+/, " ")
    .replace(/[_-]+/g, " ");
  const generic = new Set([
    "addendum", "assessment", "august", "april", "clinical", "consult", "consultation",
    "daily", "december", "department", "discharge", "february", "followup", "hospital",
    "january", "july", "june", "march", "medical", "november", "note", "october",
    "patient", "progress", "recommendation", "report", "september", "service", "specialist",
    "summary", "team", "update",
  ]);
  return Array.from(new Set(
    value.match(/[a-z]{4,}/g)?.filter((term) => !generic.has(term)) ?? [],
  ));
}
