import { FastMCP } from "fastmcp";
import { z } from "zod";
import { getClient } from "../../api/client.js";
import { toToolJson } from "../../api/format.js";
import { extractPdfText, pdfFileName, savePdf } from "../../api/pdf.js";
import { READ_ONLY, idParam } from "./_shared.js";

interface PdfDocKind {
  /** API collection, e.g. "estimates" */
  collection: "estimates" | "invoices";
  /** singular tool noun, e.g. "estimate" */
  noun: "estimate" | "invoice";
  /** German name used in descriptions */
  de: string;
  /** field holding the document number */
  numberField: "estimate_no" | "invoice_no";
  /** file name prefix when the document has no number yet (draft) */
  prefix: string;
}

export const ESTIMATE_PDF: PdfDocKind = {
  collection: "estimates",
  noun: "estimate",
  de: "Angebot",
  numberField: "estimate_no",
  prefix: "Angebot",
};

export const INVOICE_PDF: PdfDocKind = {
  collection: "invoices",
  noun: "invoice",
  de: "Rechnung",
  numberField: "invoice_no",
  prefix: "Rechnung",
};

async function fileNameFor(kind: PdfDocKind, id: number): Promise<string> {
  try {
    const doc = await getClient().get<Record<string, unknown>>(`/income/${kind.collection}/${id}`);
    return pdfFileName(kind.prefix, doc?.[kind.numberField], id);
  } catch {
    return pdfFileName(kind.prefix, undefined, id);
  }
}

export function registerPdfTools(server: FastMCP, kind: PdfDocKind) {
  const pdfPath = (id: number) => `/income/${kind.collection}/${id}/pdf`;

  server.addTool({
    name: `download_${kind.noun}_pdf`,
    description:
      `Download an ${kind.noun} (${kind.de}) as PDF. ` +
      `With save_to the PDF is written to that path on this machine and only the path is returned (preferred — keeps base64 out of the conversation). ` +
      `Without save_to, returns base64-encoded PDF data (content_type, base64_length, base64). ` +
      `To read the PDF's text (Einleitung, Schlusstext, Zahlungsbedingungen), use get_${kind.noun}_text instead.`,
    annotations: { title: `Download ${kind.noun} PDF`, ...READ_ONLY },
    parameters: z.object({
      id: idParam.describe(`${kind.noun[0].toUpperCase()}${kind.noun.slice(1)} ID`),
      save_to: z
        .string()
        .optional()
        .describe(
          "Optional file or folder path to write the PDF to. Relative paths resolve against PAPIERKRAM_PDF_DIR or the server's working directory; a path ending in / or \\ is a folder and gets the document number as file name.",
        ),
    }),
    execute: async (params) => {
      const result = await getClient().getPdf(pdfPath(params.id));

      if (params.save_to) {
        const path = await savePdf(result.base64, params.save_to, await fileNameFor(kind, params.id));
        return JSON.stringify({
          message: `PDF for ${kind.noun} ${params.id} saved.`,
          path,
          content_type: result.contentType,
          bytes: Buffer.from(result.base64, "base64").length,
        });
      }

      // NOTE: base64 is the deliverable and must NOT be routed through toToolJson
      // (truncation would corrupt it). fastmcp 1.27.7 has no embedded-resource content type.
      return JSON.stringify({
        message: `PDF for ${kind.noun} ${params.id} downloaded successfully.`,
        content_type: result.contentType,
        base64_length: result.base64.length,
        base64: result.base64,
      });
    },
  });

  server.addTool({
    name: `get_${kind.noun}_text`,
    description:
      `Extract the full text of an ${kind.noun} (${kind.de}) from its rendered PDF, page by page. ` +
      `Use this for content the JSON record does not contain: Einleitungstext, Schlusstext, Zahlungsbedingungen, Abschlags-/Zahlungsplan, Hinweise, Fußzeile.`,
    annotations: { title: `Get ${kind.noun} text`, ...READ_ONLY },
    parameters: z.object({
      id: idParam.describe(`${kind.noun[0].toUpperCase()}${kind.noun.slice(1)} ID`),
    }),
    execute: async (params) => {
      const result = await getClient().getPdf(pdfPath(params.id));
      const extracted = await extractPdfText(result.base64);
      return toToolJson({ id: params.id, ...extracted });
    },
  });
}
