/**
 * PDF helpers for estimate/invoice documents.
 *
 * The Papierkram API v1 does not expose the free texts of a document
 * (Einleitungstext, Schlusstext, Zahlungsbedingungen) as JSON fields — they
 * only appear in the rendered PDF. These helpers make that content usable:
 * text extraction for the model, and saving the PDF to disk instead of
 * pushing base64 through the conversation.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { UserError } from "fastmcp";
import { extractText, getDocumentProxy } from "unpdf";

export interface PdfText {
  page_count: number;
  pages: string[];
  text: string;
}

/** Normalise whitespace per page while keeping line breaks readable. */
function tidy(page: string): string {
  return page
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfText(base64: string): Promise<PdfText> {
  const data = new Uint8Array(Buffer.from(base64, "base64"));
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map(tidy);
  return {
    page_count: totalPages,
    pages,
    text: pages.join("\n\n--- Seitenumbruch ---\n\n"),
  };
}

/**
 * Write the PDF to `target`. Relative paths resolve against PAPIERKRAM_PDF_DIR
 * (if set) or the process working directory. A directory target (ending in a
 * path separator) receives `fallbackName`.
 */
export async function savePdf(base64: string, target: string, fallbackName: string): Promise<string> {
  const trimmed = target.trim();
  if (!trimmed) throw new UserError("save_to must not be empty.");

  const base = process.env.PAPIERKRAM_PDF_DIR || process.cwd();
  let path = isAbsolute(trimmed) ? trimmed : resolve(base, trimmed);
  if (/[\\/]$/.test(trimmed)) path = resolve(path, fallbackName);
  if (!/\.pdf$/i.test(path)) path += ".pdf";

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(base64, "base64"));
  return path;
}

/** Make a document number safe for use as a file name. */
export function pdfFileName(prefix: string, number: unknown, id: number): string {
  const raw = typeof number === "string" && number.trim() ? number.trim() : `${prefix}-${id}`;
  return `${raw.replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}
