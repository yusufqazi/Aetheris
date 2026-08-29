import type { ResearchAnswerDimension, ResearchContentType } from "@/lib/types";
import { isHistoricalContext } from "@/lib/research/semantic-quality";

export type ClinicalFindingTitle =
  | "Clinical status"
  | "Diagnostic evidence"
  | "Imaging"
  | "Microbiology"
  | "Treatment recommendation"
  | "Specialist assessment"
  | "Safety consideration"
  | "Unresolved evidence"
  | "Historical context";

export function createClinicalFindingTitle({
  statement,
  providedTitle,
  dimension = "context",
  contentTypes = [],
}: {
  statement: string;
  providedTitle?: string | null;
  dimension?: ResearchAnswerDimension | "diagnosis";
  contentTypes?: ResearchContentType[];
}): ClinicalFindingTitle {
  const text = statement.replace(/\s+/g, " ").trim();
  const normalizedProvidedTitle = normalizeProvidedTitle(providedTitle);
  const explicitlyUnresolved = /\b(?:outstanding|pending|awaiting|not yet|missing|unresolved|uncertain|unknown|insufficient|cannot determine|not confirmed|not established|cannot exclude)\b/i.test(text);

  if (isHistoricalContext(text)) return "Historical context";
  if (
    contentTypes.includes("unresolved_question") ||
    explicitlyUnresolved ||
    ((contentTypes.includes("limitation") || dimension === "limitation") &&
      /\b(?:limitation|limited|excluded|underrepresented|incomplete|requires? confirmation)\b/i.test(text))
  ) {
    return "Unresolved evidence";
  }
  if (/\b(?:culture|microbiolog|organism|susceptibilit|bronchoalveolar lavage|\bBAL\b|viral panel|PCR)\w*\b/i.test(text)) {
    return "Microbiology";
  }
  if (/\b(?:CT|MRI|PET|radiograph|x-ray|ultrasound|imaging|ground-glass|opacity|opacities)\b/i.test(text)) {
    return "Imaging";
  }
  if (
    contentTypes.includes("interaction_concern") ||
    contentTypes.includes("safety_observation") ||
    dimension === "safety" ||
    /\b(?:safety|adverse|toxicity|interaction|risk|harm|contraindicat)\w*\b/i.test(text)
  ) {
    return "Safety consideration";
  }
  if (/\b(?:LVEF|ejection fraction|systolic function)\w*\b/i.test(text)) {
    return "Diagnostic evidence";
  }
  if (
    contentTypes.includes("recommendation") ||
    /\b(?:recommend|advise|favor|should|start|begin|initiate|continue|hold|withhold|defer|delay|stop)\w*\b/i.test(text)
  ) {
    return "Treatment recommendation";
  }
  if (/\b(?:AKI|acute kidney injury|diagnos|etiology|cause|multifactorial|pneumonitis|infection|disease|syndrome|cannot exclude|plausible)\w*\b/i.test(text)) {
    return "Diagnostic evidence";
  }
  if (/\b(?:consult|specialist|oncology|infectious disease|pulmonology|pharmacy|multidisciplinary|consensus)\b/i.test(text)) {
    return "Specialist assessment";
  }
  return normalizedProvidedTitle && normalizedProvidedTitle !== "Unresolved evidence"
    ? normalizedProvidedTitle
    : "Clinical status";
}

function normalizeProvidedTitle(value?: string | null): ClinicalFindingTitle | null {
  const title = value?.replace(/\s+/g, " ").trim().toLowerCase();
  return ({
    "clinical status": "Clinical status",
    "diagnostic evidence": "Diagnostic evidence",
    imaging: "Imaging",
    microbiology: "Microbiology",
    "treatment recommendation": "Treatment recommendation",
    "specialist assessment": "Specialist assessment",
    "safety consideration": "Safety consideration",
    "unresolved evidence": "Unresolved evidence",
    "historical context": "Historical context",
  } as Record<string, ClinicalFindingTitle>)[title ?? ""] ?? null;
}
