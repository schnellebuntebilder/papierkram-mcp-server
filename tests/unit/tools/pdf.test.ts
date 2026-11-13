import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockServer } from "../../helpers/mock-server.js";
import { createMockClient, type MockClient } from "../../helpers/mock-client.js";
import { SAMPLE_PDF_BASE64 } from "../../helpers/pdf-fixture.js";

let mockClient: MockClient;
vi.mock("../../../src/api/client.js", () => ({ getClient: () => mockClient }));
import { registerEstimateTools } from "../../../src/core/tools/estimates.js";
import { registerInvoiceTools } from "../../../src/core/tools/invoices.js";

describe("PDF tools", () => {
  let server: ReturnType<typeof createMockServer>;
  let dir: string;

  beforeEach(async () => {
    server = createMockServer();
    mockClient = createMockClient();
    mockClient.getPdf.mockResolvedValue({ base64: SAMPLE_PDF_BASE64, contentType: "application/pdf" });
    mockClient.get.mockResolvedValue({ id: 784, estimate_no: "A-00154-3", invoice_no: "3492507" });
    registerEstimateTools(server as never);
    registerInvoiceTools(server as never);
    dir = await mkdtemp(join(tmpdir(), "pk-pdf-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("get_estimate_text liefert den Text aller Seiten inkl. Zahlungsbedingungen", async () => {
    const result = JSON.parse(await server.getTool("get_estimate_text")!.execute({ id: 784 }));
    expect(mockClient.getPdf).toHaveBeenCalledWith("/income/estimates/784/pdf");
    expect(result.page_count).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1]).toContain("40 % Abschlag");
    expect(result.text).toContain("Projektmanagement");
  });

  it("get_invoice_text nutzt den Rechnungs-Pfad", async () => {
    await server.getTool("get_invoice_text")!.execute({ id: 300 });
    expect(mockClient.getPdf).toHaveBeenCalledWith("/income/invoices/300/pdf");
  });

  it("download_estimate_pdf mit save_to-Ordner speichert unter der Angebotsnummer", async () => {
    const result = JSON.parse(
      await server.getTool("download_estimate_pdf")!.execute({ id: 784, save_to: dir + "/" }),
    );
    expect(result.path).toBe(join(dir, "A-00154-3.pdf"));
    expect(result).not.toHaveProperty("base64");
    const written = await readFile(result.path);
    expect(written.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("download_invoice_pdf mit save_to-Datei ergänzt .pdf", async () => {
    const result = JSON.parse(
      await server.getTool("download_invoice_pdf")!.execute({ id: 300, save_to: join(dir, "sub", "rechnung") }),
    );
    expect(result.path).toBe(join(dir, "sub", "rechnung.pdf"));
  });
});
