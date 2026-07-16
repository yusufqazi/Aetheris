import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export interface PdfReportSectionInput {
  title: string;
  items: Array<{ text: string; citations: string[] }>;
}

export interface PdfReportCitationInput {
  label: string;
  documentName: string;
  page?: number | null;
  excerpt: string;
}

export interface PdfReportInput {
  question: string;
  directAnswer: string;
  supportLabel: string;
  supportDescription: string;
  primaryUncertainty: string;
  mode: "live" | "demo";
  createdAt: string;
  documents: string[];
  citedDocumentCount: number;
  sections: PdfReportSectionInput[];
  citations: PdfReportCitationInput[];
  disclaimer: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const colors = {
  background: rgb(0.008, 0.027, 0.063),
  panel: rgb(0.027, 0.071, 0.13),
  panelSoft: rgb(0.037, 0.09, 0.16),
  cyan: rgb(0.36, 0.79, 1),
  blue: rgb(0.14, 0.38, 0.92),
  white: rgb(0.94, 0.97, 1),
  slate: rgb(0.56, 0.64, 0.75),
  muted: rgb(0.35, 0.43, 0.54),
  border: rgb(0.12, 0.24, 0.38),
};

export async function createAetherisReportPdf(input: PdfReportInput) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const mono = await document.embedFont(StandardFonts.Courier);
  const pages: PDFPage[] = [];
  let page = addPage(document, pages);
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    page = addPage(document, pages);
    y = PAGE_HEIGHT - 76;
    drawPageHeader(page, mono);
  };

  const ensureSpace = (height: number) => {
    if (y - height < 58) newPage();
  };

  const paragraph = (
    value: string,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; lineHeight?: number; indent?: number } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? 15;
    const indent = options.indent ?? 0;
    const lines = wrapText(cleanPdfText(value), font, size, CONTENT_WIDTH - indent);
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font,
        color: options.color ?? colors.slate,
      });
      y -= lineHeight;
    }
  };

  drawPageHeader(page, mono);
  page.drawText("CLINICAL EVIDENCE BRIEF", {
    x: MARGIN,
    y: PAGE_HEIGHT - 104,
    size: 8,
    font: mono,
    color: colors.cyan,
  });
  y = PAGE_HEIGHT - 142;
  paragraph("A direct answer, with every material finding attached to its source.", {
    font: bold,
    size: 25,
    lineHeight: 30,
    color: colors.white,
  });
  y -= 13;

  const questionLines = wrapText(cleanPdfText(input.question), bold, 13, CONTENT_WIDTH - 32);
  const questionHeight = 52 + questionLines.length * 18;
  page.drawRectangle({
    x: MARGIN,
    y: y - questionHeight,
    width: CONTENT_WIDTH,
    height: questionHeight,
    color: colors.panel,
    borderColor: colors.border,
    borderWidth: 0.8,
  });
  page.drawText("RESEARCH QUESTION", {
    x: MARGIN + 16,
    y: y - 22,
    size: 7,
    font: mono,
    color: colors.cyan,
  });
  let questionY = y - 46;
  for (const line of questionLines) {
    page.drawText(line, { x: MARGIN + 16, y: questionY, size: 13, font: bold, color: colors.white });
    questionY -= 18;
  }
  y -= questionHeight + 25;

  drawMeta(page, mono, input, y);
  y -= 48;
  sectionLabel(page, mono, "PRIMARY ANSWER", y);
  y -= 24;
  paragraph(input.directAnswer, { font: bold, size: 14, lineHeight: 21, color: colors.white });
  y -= 16;
  paragraph(`${input.supportLabel}. ${input.supportDescription}`, { size: 9, lineHeight: 14, color: colors.cyan });
  y -= 12;
  sectionLabel(page, mono, "MAIN UNCERTAINTY", y);
  y -= 22;
  paragraph(input.primaryUncertainty, { size: 9.5, lineHeight: 15, color: colors.slate });
  y -= 24;

  for (const section of input.sections) {
    if (section.items.length === 0) continue;
    ensureSpace(78);
    sectionLabel(page, mono, section.title.toUpperCase(), y);
    y -= 24;
    for (const item of section.items) {
      ensureSpace(40);
      page.drawCircle({ x: MARGIN + 4, y: y + 3, size: 2, color: colors.cyan });
      paragraph(item.text, { size: 10, lineHeight: 15, color: colors.slate, indent: 15 });
      if (item.citations.length > 0) {
        paragraph(item.citations.join("  "), { font: mono, size: 7, lineHeight: 11, color: colors.cyan, indent: 15 });
      }
      y -= 8;
    }
    y -= 14;
  }

  if (input.citations.length > 0) {
    ensureSpace(90);
    sectionLabel(page, mono, "SOURCE PASSAGES", y);
    y -= 24;
    paragraph("These excerpts are included for verification. They are not additional conclusions.", {
      size: 9,
      lineHeight: 14,
      color: colors.muted,
    });
    y -= 10;
    for (const citation of input.citations) {
      ensureSpace(56);
      paragraph(`${citation.label}  ${citation.documentName}${citation.page ? `, page ${citation.page}` : ""}`, {
        font: bold,
        size: 9,
        lineHeight: 14,
        color: colors.white,
      });
      paragraph(citation.excerpt, { size: 8.5, lineHeight: 13, color: colors.slate, indent: 10 });
      y -= 12;
    }
  }

  if (y - 76 >= 58) {
    y -= 8;
    sectionLabel(page, mono, "RESEARCH-USE NOTE", y);
    y -= 22;
    paragraph(input.disclaimer, { size: 8.5, lineHeight: 13, color: colors.muted });
  }

  for (let index = 0; index < pages.length; index += 1) {
    drawFooter(pages[index], mono, index + 1, pages.length);
  }

  document.setTitle("Aetheris Clinical Evidence Brief");
  document.setSubject(input.question);
  document.setCreator("Aetheris");
  return document.save();
}

function addPage(document: PDFDocument, pages: PDFPage[]) {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: colors.background });
  page.drawCircle({ x: PAGE_WIDTH - 54, y: PAGE_HEIGHT - 40, size: 145, color: colors.blue, opacity: 0.08 });
  page.drawCircle({ x: PAGE_WIDTH - 16, y: PAGE_HEIGHT - 12, size: 82, color: colors.cyan, opacity: 0.035 });
  pages.push(page);
  return page;
}

function drawPageHeader(page: PDFPage, mono: PDFFont) {
  page.drawText("AETHERIS", { x: MARGIN, y: PAGE_HEIGHT - 42, size: 9, font: mono, color: colors.white });
  page.drawText("EVIDENCE-FIRST CLINICAL RESEARCH", { x: PAGE_WIDTH - MARGIN - 190, y: PAGE_HEIGHT - 42, size: 7, font: mono, color: colors.muted });
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 54 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 54 }, thickness: 0.6, color: colors.border });
}

function drawMeta(page: PDFPage, mono: PDFFont, input: PdfReportInput, y: number) {
  const mode = input.mode === "live" ? "MODEL-ASSISTED" : "LOCAL EXTRACTION";
  const values = [
    `${input.documents.length} SOURCE${input.documents.length === 1 ? "" : "S"}`,
    `${input.citedDocumentCount} CITED SOURCE${input.citedDocumentCount === 1 ? "" : "S"}`,
    mode,
    new Date(input.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).toUpperCase(),
  ];
  values.forEach((value, index) => {
    page.drawText(value, { x: MARGIN + index * 124, y, size: 6.8, font: mono, color: colors.muted });
  });
}

function sectionLabel(page: PDFPage, mono: PDFFont, value: string, y: number) {
  page.drawText(value, { x: MARGIN, y, size: 7.5, font: mono, color: colors.cyan });
  page.drawLine({ start: { x: MARGIN + 132, y: y + 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 2 }, thickness: 0.45, color: colors.border });
}

function drawFooter(page: PDFPage, mono: PDFFont, index: number, total: number) {
  page.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: PAGE_WIDTH - MARGIN, y: 40 }, thickness: 0.45, color: colors.border });
  page.drawText("RESEARCH SUPPORT ONLY - INDEPENDENT REVIEW REQUIRED", { x: MARGIN, y: 25, size: 6.5, font: mono, color: colors.muted });
  page.drawText(`${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, { x: PAGE_WIDTH - MARGIN - 36, y: 25, size: 6.5, font: mono, color: colors.cyan });
}

function wrapText(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function cleanPdfText(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
