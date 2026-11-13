import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockClient, type MockClient } from "../../helpers/mock-client.js";
import { createMockServer, type MockServer } from "../../helpers/mock-server.js";
import { buildIncomeLineItems, incomeLineItemSchema } from "../../../src/core/tools/_shared.js";

let mockClient: MockClient;
vi.mock("../../../src/api/client.js", () => ({ getClient: () => mockClient }));

import { registerEstimateTools } from "../../../src/core/tools/estimates.js";
import { registerInvoiceTools } from "../../../src/core/tools/invoices.js";

const grouped = [
  { type: "group" as const, name: "Übergreifende Leistungen" },
  { name: "Projektmanagement", quantity: 1, unit: "Tag", price: 960, vat_rate: 0.19 },
  { type: "group" as const, name: "Umsetzung", description: "Phase 2" },
  { name: "Programmierung", quantity: 6, unit: "Tage", price: 960, vat_rate: "19%" },
];

const expectedBody = [
  { name: "Übergreifende Leistungen", start_new_item_group: true },
  { name: "Projektmanagement", quantity: 1, unit: "Tag", price: 960, vat_rate: 0.19 },
  { name: "Umsetzung", description: "Phase 2", start_new_item_group: true },
  { name: "Programmierung", quantity: 6, unit: "Tage", price: 960, vat_rate: 0.19 },
];

describe("Positionsgruppen", () => {
  let server: MockServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    server = createMockServer();
    registerEstimateTools(server as never);
    registerInvoiceTools(server as never);
  });

  it("buildIncomeLineItems wandelt Gruppen in start_new_item_group um und behält die Reihenfolge", () => {
    expect(buildIncomeLineItems(grouped)).toEqual(expectedBody);
  });

  it("Schema lehnt Gruppen mit Preisfeldern ab (strict)", () => {
    const bad = { type: "group", name: "X", price: 10 };
    expect(incomeLineItemSchema.safeParse(bad).success).toBe(false);
  });

  it("Schema akzeptiert normale Positionen weiterhin unverändert", () => {
    const pos = { name: "Konzept", quantity: 2, price: 960, vat_rate: 0.19 };
    expect(incomeLineItemSchema.safeParse(pos).success).toBe(true);
  });

  it("create_estimate schickt Gruppen an /income/estimates", async () => {
    await server.getTool("create_estimate")!.execute({
      name: "Test", document_date: "2026-11-13", line_items: grouped,
    });
    const [path, body] = mockClient.create.mock.calls[0];
    expect(path).toBe("/income/estimates");
    expect(body.line_items).toEqual(expectedBody);
  });

  it("update_estimate schickt Gruppen beim Ersetzen der Positionen", async () => {
    await server.getTool("update_estimate")!.execute({ id: 5, line_items: grouped });
    const [path, body] = mockClient.update.mock.calls[0];
    expect(path).toBe("/income/estimates/5");
    expect(body.line_items).toEqual(expectedBody);
  });

  it("create_invoice unterstützt Gruppen ebenso", async () => {
    await server.getTool("create_invoice")!.execute({
      name: "Test", payment_term_id: 1, line_items: grouped,
    });
    const [path, body] = mockClient.create.mock.calls[0];
    expect(path).toBe("/income/invoices");
    expect(body.line_items).toEqual(expectedBody);
  });
});
