import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockClient, type MockClient } from "../../helpers/mock-client.js";
import { createMockServer, type MockServer } from "../../helpers/mock-server.js";
import { toDocumentHtml } from "../../../src/core/tools/_shared.js";

let mockClient: MockClient;
vi.mock("../../../src/api/client.js", () => ({ getClient: () => mockClient }));

import { registerEstimateTools } from "../../../src/core/tools/estimates.js";

const line = { name: "Konzept", quantity: 1, price: 960, vat_rate: 0.19 };

describe("Angebotstexte (Einleitung / Schlusstext)", () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    server = createMockServer();
    registerEstimateTools(server as never);
  });

  it("toDocumentHtml macht aus Leerzeilen Absätze und aus Zeilenumbrüchen <br>", () => {
    expect(toDocumentHtml("Sehr geehrte Damen und Herren,\nvielen Dank.\n\nZweiter Absatz.")).toBe(
      "<p>Sehr geehrte Damen und Herren,<br>vielen Dank.</p><p>Zweiter Absatz.</p>",
    );
  });

  it("toDocumentHtml maskiert Sonderzeichen in reinem Text", () => {
    expect(toDocumentHtml("Preis < 1.000 € & mehr")).toBe("<p>Preis &lt; 1.000 € &amp; mehr</p>");
  });

  it("toDocumentHtml lässt HTML unverändert", () => {
    const html = "<p>Annahmen:</p><ul><li>Kein CMS</li></ul>";
    expect(toDocumentHtml(html)).toBe(html);
  });

  it("toDocumentHtml gibt für leeren Text einen leeren String zurück (Text löschen)", () => {
    expect(toDocumentHtml("   ")).toBe("");
  });

  it("create_estimate schickt greetings_text und thanks_text als HTML", async () => {
    await server.getTool("create_estimate")!.execute({
      name: "Test",
      document_date: "2026-11-13",
      line_items: [line],
      greetings_text: "Hallo,\n\nAbsatz zwei.",
      thanks_text: "Mit freundlichen Grüßen",
    });
    const [path, body] = mockClient.create.mock.calls[0];
    expect(path).toBe("/income/estimates");
    expect(body.greetings_text).toBe("<p>Hallo,</p><p>Absatz zwei.</p>");
    expect(body.thanks_text).toBe("<p>Mit freundlichen Grüßen</p>");
  });

  it("create_estimate ohne Texte schickt keine Textfelder", async () => {
    await server.getTool("create_estimate")!.execute({
      name: "Test", document_date: "2026-11-13", line_items: [line],
    });
    const [, body] = mockClient.create.mock.calls[0];
    expect(body).not.toHaveProperty("greetings_text");
    expect(body).not.toHaveProperty("thanks_text");
  });

  it("update_estimate kann nur den Schlusstext ändern", async () => {
    await server.getTool("update_estimate")!.execute({ id: 7, thanks_text: "Neu" });
    const [path, body] = mockClient.update.mock.calls[0];
    expect(path).toBe("/income/estimates/7");
    expect(body).toEqual({ thanks_text: "<p>Neu</p>" });
  });
});
