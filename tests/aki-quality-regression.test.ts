import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildInvestigationData, type InvestigationData } from "@/lib/research/investigation";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { createResearchSession } from "@/lib/research/session";
import {
  recommendationConflictKind,
  recommendationsMateriallyConflict,
} from "@/lib/research/conflict-semantics";
import {
  assessPrimaryAnswerEvidence,
  buildBestSupportedAnswer,
  primaryAnswerConsistencyIssues,
  primaryAnswerCoverageIssues,
} from "@/lib/research/grounding";
import { isOpenQuestionEvidenceCompatible } from "@/lib/research/open-questions";
import {
  claimEvidenceAlignmentIssues,
  isMetadataOnly,
} from "@/lib/research/semantic-quality";
import { AGENT_IDS, type ResearchSession, type UploadedDocument } from "@/lib/types";

const QUESTION =
  "What is the most likely cause of this patient's acute kidney injury, what management is supported now, is the patient ready for discharge, where do the clinicians genuinely disagree, and what evidence is still needed?";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;
const runLiveRegression = process.env.RUN_LIVE_AKI_REGRESSION === "1";
let completedSession: ResearchSession;
let investigation: InvestigationData;

beforeAll(async () => {
  if (!runLiveRegression) {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }
  const session = createResearchSession({
    id: "aki-quality-regression",
    question: QUESTION,
    selectedAgents: [...AGENT_IDS],
    documents: akiDocuments(),
    mode: "live",
  });
  const result = await runResearchPipeline({ session, emit: () => undefined });
  completedSession = {
    ...session,
    mode: result.mode,
    evidence: result.results.evidenceIndex ?? [],
    results: result.results,
  };
  investigation = buildInvestigationData(completedSession);
}, runLiveRegression ? 360_000 : 20_000);

afterAll(() => {
  restoreEnv("OPENAI_API_KEY", originalOpenAiKey);
  restoreEnv("GEMINI_API_KEY", originalGeminiKey);
});

describe("AKI cross-domain reasoning quality regression", () => {
  it("uses the configured Gemini path during the opt-in live regression", () => {
    if (runLiveRegression) expect(completedSession.mode).toBe("live");
  });

  it("reconstructs wrapped source clauses and rejects document metadata", () => {
    const facts = completedSession.results?.groundedFacts ?? [];
    const text = facts.map((fact) => fact.text).join(" ");

    expect(text).toMatch(/recent NSAID exposure plus ACE-inhibitor use may have worsened renal perfusion/i);
    expect(text).toMatch(/granular casts raise concern for superimposed acute tubular injury/i);
    expect(text).toMatch(/does not determine whether the patient's AKI is purely prerenal or whether acute tubular injury is present/i);
    expect(text).not.toMatch(/Consult: 08:15|Planning discussion: 09:00|renal recovery is\./i);
    expect(facts.some((fact) => isMetadataOnly(fact.text))).toBe(false);
  });

  it("preserves a broad supported cause while keeping the narrower mechanism uncertain", () => {
    const facts = completedSession.results?.groundedFacts ?? [];
    const answer = buildBestSupportedAnswer(QUESTION, facts);
    const coverage = assessPrimaryAnswerEvidence(QUESTION, facts);

    expect(coverage.supportedParts).toEqual(expect.arrayContaining([
      "diagnosis",
      "treatment",
      "disposition",
      "disagreement",
      "remaining-evidence",
    ]));
    expect(answer).toMatch(/multifactorial/i);
    expect(answer).toMatch(/volume depletion|dehydration/i);
    expect(answer).toMatch(/NSAID|ACE-inhibitor|tubular injury/i);
    expect(answer).toMatch(/uncertain|remain possible|does not.*exclude/i);
    expect(answer).not.toMatch(/cause of (?:the )?AKI cannot be determined|no cause can be established/i);
    expect(primaryAnswerCoverageIssues(answer, QUESTION, facts)).toEqual([]);
    expect(primaryAnswerConsistencyIssues(answer, QUESTION, facts)).toEqual([]);
  });

  it("detects the genuine discharge-timing disagreement and keeps shared care compatible", () => {
    const hospitalist =
      "Discharge later today is reasonable if oral intake remains adequate, with repeat basic metabolic panel within 48–72 hours.";
    const nephrology =
      "Nephrology prefers one additional inpatient creatinine measurement before discharge.";

    expect(recommendationsMateriallyConflict(hospitalist, nephrology)).toBe(true);
    expect(recommendationConflictKind(hospitalist, nephrology)).toBe("timing-or-threshold");
    expect(investigation.conflicts).toHaveLength(1);
    expect(investigation.conflicts[0].statement).toMatch(/discharge|inpatient creatinine/i);
    expect(investigation.conflicts[0].positions.map((position) => position.statement).join(" ")).toMatch(
      /later today.*additional inpatient creatinine/i,
    );
  });

  it("calibrates overall support from answer coverage and unresolved conflict", () => {
    expect(investigation.support).not.toBe("Strongly supported");
    expect(investigation.directAnswer).toMatch(/multifactorial/i);
    expect(investigation.directAnswer).toMatch(/discharg|inpatient/i);
    expect(investigation.directAnswer).toMatch(/uncertain|baseline|creatinine|follow-up/i);
  });

  it("requires claim-level citation entailment and preserves negated historical scope", () => {
    expect(claimEvidenceAlignmentIssues(
      "Acute kidney injury is present.",
      "No urgent kidney biopsy is recommended at present.",
    ).length).toBeGreaterThan(0);
    expect(claimEvidenceAlignmentIssues(
      "The historical cardiology note establishes the current cause of the acute kidney injury.",
      "This historical note does not determine the cause or current severity of the 2026 acute kidney injury.",
    )).toEqual(expect.arrayContaining([
      "negated-source-promoted-to-support",
    ]));
    expect(investigation.findings[0]?.citationIds.length).toBeGreaterThan(0);
    expect(investigation.findings.some((finding) => /preserved left-ventricular|cardiovascular status/i.test(finding.statement))).toBe(false);
  });

  it("keeps open questions specific, grammatical, and linked to relevant clinical evidence", () => {
    expect(investigation.openQuestions.length).toBeGreaterThan(0);
    const text = investigation.openQuestions.map((item) => `${item.question} ${item.known}`).join(" ");
    expect(text).toMatch(/creatinine|kidney function|renal function|tubular|prerenal/i);
    expect(text).not.toMatch(/Consult:|Update:|Planning discussion:|what additional evidence|what evidence would/i);
    expect(investigation.openQuestions.every((item) => /\?$/.test(item.question))).toBe(true);

    const firstFact = completedSession.results?.groundedFacts?.[0];
    expect(firstFact).toBeDefined();
    if (!firstFact) throw new Error("AKI regression fixture produced no grounded facts.");
    const metadataFact = {
      ...firstFact,
      text: "Consult: 08:15.",
      excerpt: "Consult: 08:15.",
    };
    expect(isOpenQuestionEvidenceCompatible(
      "How does kidney function change on repeat measurement?",
      metadataFact,
    )).toBe(false);
  });
});

function restoreEnv(name: "OPENAI_API_KEY" | "GEMINI_API_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function akiDocuments(): UploadedDocument[] {
  const records = [
    ["01_admission_note.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Hospital Admission Note
Patient: Daniel Ortiz (synthetic) | Encounter: 2026-08-22
Presentation
Five days of diarrhea and poor oral intake followed by weakness and reduced urine output. BP 94/58 on arrival, HR 104.
History includes hypertension and chronic kidney disease stage 3a.
Home medications
• Lisinopril 20 mg daily.
• Ibuprofen 600 mg three times daily for back pain during the preceding week.
• No recent contrast exposure documented.
Initial assessment
Acute kidney injury is present. Volume depletion is suspected, but medication-related kidney injury and intrinsic renal
disease remain possible.`],
    ["02_laboratory_trends.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Laboratory Trend Report
Collection interval: 2026-08-22 to 2026-08-23
Renal trend
• Baseline creatinine three months earlier: 1.3 mg/dL.
• Admission creatinine: 3.4 mg/dL.
• After initial IV fluids: 3.0 mg/dL.
• BUN: 61 mg/dL on admission, 55 mg/dL after fluids.
Other results
• Potassium 5.2 mmol/L initially, then 4.8 mmol/L.
• Bicarbonate 19 mmol/L.
• Creatine kinase 122 U/L.
Interpretive limitation
Improvement after fluids supports a hemodynamic component but does not by itself exclude acute tubular injury or
another intrinsic process.`],
    ["03_urinalysis_microscopy.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Urinalysis and Urine Microscopy
Specimen: 2026-08-22
Urinalysis
• Specific gravity 1.018.
• Protein 1+.
• Blood trace.
• Leukocyte esterase negative.
• Nitrite negative.
Microscopy
• 3–5 RBC/hpf.
• 1–2 WBC/hpf.
• Several granular casts reported.
• No RBC casts identified.
Interpretation
Granular casts can be seen with tubular injury. The urine sediment does not establish glomerulonephritis.`],
    ["04_nephrology_consult.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Nephrology Consultation
Consult: 2026-08-23 08:15
Assessment
The AKI is likely multifactorial. Volume depletion from gastrointestinal losses is important, and recent NSAID exposure
plus ACE-inhibitor use may have worsened renal perfusion. Granular casts raise concern for superimposed acute tubular
injury.
Recommendation
• Continue cautious isotonic fluid replacement while reassessing volume status.
• Hold lisinopril and all NSAIDs.
• Trend creatinine and urine output.
• No urgent kidney biopsy is recommended at present.
• Dialysis is not currently indicated.
Uncertainty
The relative contribution of reversible prerenal physiology versus established tubular injury remains uncertain.`],
    ["05_hospitalist_progress_note.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Hospitalist Progress Note
Progress note: 2026-08-23 11:40
Clinical course
Blood pressure improved to 112/68 after fluids. Urine output increased. Patient reports less dizziness. Lungs remain
clear.
Assessment
Rapid hemodynamic improvement favors predominantly prerenal AKI from dehydration.
Plan
• Continue IV fluids today.
• Continue holding lisinopril.
• Avoid NSAIDs.
• If creatinine continues to fall, discharge may be possible tomorrow with outpatient laboratory follow-up.`],
    ["06_pharmacy_review.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Clinical Pharmacy Review
Medication review: 2026-08-23
Medication safety
• Concurrent ACE-inhibitor use, dehydration, and high-dose NSAID exposure can increase AKI risk.
• Ibuprofen should be discontinued during the current kidney injury.
Scope statement
This review identifies medication-related risk factors. It does not determine whether the patient's AKI is purely prerenal or
whether acute tubular injury is present.
Discharge consideration
Medication reconciliation should include explicit avoidance of non-prescribed NSAID use until renal recovery is
established.`],
    ["07_renal_ultrasound.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Renal Ultrasound
Study: 2026-08-23
Findings
• Right kidney 10.8 cm; left kidney 10.6 cm.
• No hydronephrosis.
• No obstructing calculus identified.
• Mildly increased cortical echogenicity bilaterally, compatible with chronic medical renal disease.
Impression
No sonographic evidence of urinary obstruction. Chronic parenchymal changes are present.`],
    ["08_followup_labs_and_status.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Follow-up Laboratory and Clinical Status
Update: 2026-08-24 06:30
Laboratory trend
• Creatinine: 2.7 mg/dL.
• BUN: 47 mg/dL.
• Potassium: 4.6 mmol/L.
• Bicarbonate: 21 mmol/L.
Clinical status
• Urine output adequate overnight.
• Blood pressure 118/72.
• No dyspnea or peripheral edema.
Unresolved point
Kidney function is improving but has not returned to the documented baseline creatinine of 1.3 mg/dL.`],
    ["09_discharge_planning_note.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Discharge Planning Note
Planning discussion: 2026-08-24 09:00
Hospitalist position
Discharge later today is reasonable if oral intake remains adequate, with repeat basic metabolic panel within 48–72
hours and close primary-care follow-up.
Nephrology addendum
Because creatinine remains more than twice the prior baseline and granular casts suggest possible tubular injury,
nephrology prefers one additional inpatient creatinine measurement before discharge. If the value continues to improve
and urine output remains adequate, discharge with close follow-up is acceptable.
Shared plan
• Continue to hold lisinopril at discharge unless renal function and blood pressure are reassessed.
• Avoid NSAIDs.
• Provide return precautions for reduced urine output, vomiting, weakness, or dyspnea.`],
    ["10_old_cardiology_note.pdf", `SYNTHETIC CLINICAL TEST DOCUMENT — NOT FOR PATIENT CARE
Historical Cardiology Follow-up
Historical note: 2025-10-14
History
Hypertension controlled on lisinopril. Echocardiogram showed preserved left-ventricular ejection fraction.
Plan
Continue antihypertensive therapy and routine follow-up.
Relevance limitation
This historical note documents prior cardiovascular status and medication use. It does not determine the cause or current
severity of the 2026 acute kidney injury.`],
  ] as const;

  return records.map(([name, text], index) => ({
    id: `aki-document-${index + 1}`,
    name,
    size: text.length,
    pageCount: 1,
    uploadedAt: "2026-08-25T19:59:26.000Z",
    preview: text.slice(0, 280),
    text,
    pages: [{ number: 1, text, startOffset: 0, endOffset: text.length }],
  }));
}
