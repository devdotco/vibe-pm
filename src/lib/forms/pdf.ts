import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { FormDefinition, FormQuestion } from "./definition";
import { answerText, isAnswered, type Answers } from "./answers";

/**
 * The customer-facing report for one submission ("Grease Trap Follow-Up
 * Report | Alameda County"), built with pdf-lib: pure JavaScript, fonts
 * compiled in, nothing for the standalone build to fail to trace.
 *
 * Standard PDF fonts are WinAnsi: Spanish accents and ñ are fine, but a
 * character outside it (an emoji a tech typed, a ≥) would throw — `winAnsi`
 * swaps those for "?" instead of failing the whole report.
 */
export interface PdfFile { id: string; bytes: Uint8Array; contentType: string }
export interface PdfInput {
  title: string;
  organizationName: string | null;
  companyName: string | null;
  personName: string | null;
  submittedAt: Date | null;
  submittedByName: string | null;
  taskTitle: string | null;
  definition: FormDefinition;
  answers: Answers;
  files: Map<string, PdfFile>;
  timeZone?: string;
}

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.86, 0.87, 0.89);
const ACCENT = rgb(0.18, 0.49, 0.2);

export function winAnsi(text: string): string {
  // Normalise the punctuation phones insert, then drop anything WinAnsi cannot encode.
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7E -ÿ€]/g, "?");
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of winAnsi(text).split("\n")) {
    const words = para.split(/ +/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) out.push(line);
      // A single word wider than the line (a URL) is hard-broken.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

class Layout {
  page!: PDFPage;
  y = 0;
  constructor(private readonly doc: PDFDocument, private readonly footer: string, private readonly font: PDFFont) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    this.page.drawText(winAnsi(this.footer), { x: MARGIN, y: 24, size: 8, font: this.font, color: MUTED });
  }
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }
  text(lines: string[], opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; gap?: number; indent?: number }) {
    const lh = opts.size * 1.3;
    for (const line of lines) {
      this.ensure(lh);
      this.y -= lh;
      this.page.drawText(line, { x: MARGIN + (opts.indent ?? 0), y: this.y + opts.size * 0.25, size: opts.size, font: opts.font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 0;
  }
  rule(gap = 8) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness: 0.75, color: RULE });
    this.y -= gap;
  }
  image(img: PDFImage, maxW: number, maxH: number, x: number) {
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
    return { w, h };
  }
}

async function embed(doc: PDFDocument, file: PdfFile | undefined): Promise<PDFImage | null> {
  if (!file) return null;
  try {
    if (file.contentType === "image/png") return await doc.embedPng(file.bytes);
    if (file.contentType === "image/jpeg" || file.contentType === "image/jpg") return await doc.embedJpg(file.bytes);
  } catch { /* unreadable image: fall through to the placeholder */ }
  return null;
}

function formatDate(d: Date, timeZone: string): string {
  return d.toLocaleString("en-US", { timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function renderSubmissionPdf(input: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(input.title));
  doc.setProducer("erp.io Projects");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const tz = input.timeZone ?? "America/Los_Angeles";

  const layout = new Layout(doc, `${input.organizationName ? `${input.organizationName} · ` : ""}${input.title}`, regular);

  if (input.organizationName) layout.text([winAnsi(input.organizationName.toUpperCase())], { font: bold, size: 9, color: ACCENT, gap: 2 });
  layout.text(wrapText(input.title, bold, 18, CONTENT_W), { font: bold, size: 18, gap: 6 });

  const meta: Array<[string, string | null]> = [
    ["Customer", input.companyName],
    ["Contact", input.personName],
    ["Job", input.taskTitle],
    ["Completed", input.submittedAt ? formatDate(input.submittedAt, tz) : "Not yet submitted"],
    ["Technician", input.submittedByName],
  ];
  for (const [k, v] of meta) {
    if (!v) continue;
    layout.ensure(14);
    layout.y -= 14;
    layout.page.drawText(`${k}`, { x: MARGIN, y: layout.y + 3, size: 9, font: bold, color: MUTED });
    const lines = wrapText(v, regular, 10, CONTENT_W - 80);
    layout.page.drawText(lines[0] ?? "", { x: MARGIN + 80, y: layout.y + 3, size: 10, font: regular, color: INK });
    if (lines.length > 1) layout.text(lines.slice(1), { font: regular, size: 10, indent: 80 });
  }
  layout.rule(10);

  for (const section of input.definition.sections) {
    layout.ensure(40);
    layout.text(wrapText(section.title, bold, 12.5, CONTENT_W), { font: bold, size: 12.5, gap: 4 });
    for (const q of section.questions) await renderQuestion(doc, layout, q, input, regular, bold);
    layout.rule(8);
  }

  return doc.save();
}

async function renderQuestion(doc: PDFDocument, layout: Layout, q: FormQuestion, input: PdfInput, regular: PDFFont, bold: PDFFont) {
  const value = input.answers[q.id];
  layout.ensure(30);
  layout.y -= 4;
  layout.text(wrapText(q.label, bold, 9.5, CONTENT_W), { font: bold, size: 9.5, color: MUTED, gap: 1 });

  if (!isAnswered(q, value)) {
    layout.text(["—"], { font: regular, size: 10.5, color: MUTED, gap: 6 });
    return;
  }

  if (q.type === "checkboxes") {
    // Show every option with its state, as the technician saw it — "not done" is information too.
    const picked = new Set(value as string[]);
    for (const o of q.options ?? []) {
      const mark = picked.has(o.id) ? "[x]" : "[  ]";
      layout.text(wrapText(`${mark}  ${o.label}`, picked.has(o.id) ? regular : regular, 10, CONTENT_W - 8), {
        font: regular, size: 10, color: picked.has(o.id) ? INK : MUTED, indent: 4,
      });
    }
    layout.y -= 6;
    return;
  }

  if (q.type === "images" || q.type === "signature") {
    const ids = Array.isArray(value) ? value : [String(value)];
    const isSig = q.type === "signature";
    const cols = isSig ? 1 : 2;
    const gap = 10;
    const cellW = isSig ? 220 : (CONTENT_W - gap) / cols;
    const cellH = isSig ? 90 : 200;
    for (let i = 0; i < ids.length; i += cols) {
      layout.ensure(cellH + gap);
      let rowH = 0;
      for (let c = 0; c < cols && i + c < ids.length; c++) {
        const img = await embed(doc, input.files.get(ids[i + c]!));
        const x = MARGIN + c * (cellW + gap);
        if (img) {
          rowH = Math.max(rowH, layout.image(img, cellW, cellH, x).h);
        } else {
          layout.page.drawText("(image unavailable)", { x, y: layout.y - 12, size: 9, font: regular, color: MUTED });
          rowH = Math.max(rowH, 16);
        }
      }
      layout.y -= rowH + gap;
    }
    return;
  }

  layout.text(wrapText(answerText(q, value), regular, 10.5, CONTENT_W), { font: regular, size: 10.5, gap: 6 });
}
