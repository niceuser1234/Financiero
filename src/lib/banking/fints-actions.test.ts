import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections } from "@/db/schema";
import { startFintsConnect, confirmFintsTan, __setFetch } from "./fints-actions";

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => "" } as unknown as Response;
}

const MARKER = "DKB";

afterEach(async () => {
  const conns = await db.select().from(connections).where(eq(connections.aspspName, MARKER));
  for (const c of conns) {
    await db.delete(bankAccounts).where(eq(bankAccounts.connectionId, c.id));
    await db.delete(connections).where(eq(connections.id, c.id));
  }
  __setFetch(undefined);
});

describe("startFintsConnect", () => {
  it("persists an expired pending connection on need_tan", async () => {
    __setFetch(vi.fn().mockResolvedValue(json({
      status: "need_tan", decoupled: true, challenge: "tap", pending_state: "cGVuZA==", client_state: "c3Q=",
    })) as unknown as typeof fetch);

    const res = await startFintsConnect({
      blz: "12030000", user: "u", pin: "1234",
      endpoint: "https://fints.dkb.de/fints", productId: "x",
    });
    expect(res.status).toBe("need_tan");
    const [c] = await db.select().from(connections).where(eq(connections.id, res.connectionId));
    expect(c.status).toBe("expired");
    expect(c.pinEnc).toBeTruthy();
    expect(c.pinEnc).not.toContain("1234"); // verschlüsselt
  });
});

describe("confirmFintsTan", () => {
  it("activates the connection and stores accounts on connected", async () => {
    __setFetch(vi.fn().mockResolvedValue(json({
      status: "need_tan", decoupled: true, challenge: "tap", pending_state: "cGVuZA==", client_state: "c3Q=",
    })) as unknown as typeof fetch);
    const started = await startFintsConnect({
      blz: "12030000", user: "u", pin: "1234", endpoint: "e", productId: "x",
    });

    __setFetch(vi.fn().mockResolvedValue(json({
      status: "connected", client_state: "ZmluYWw=",
      accounts: [{ iban: "DE1", name: "Giro", currency: "EUR", type: "checking" }],
    })) as unknown as typeof fetch);
    const res = await confirmFintsTan(started.connectionId);

    expect(res.status).toBe("connected");
    const [c] = await db.select().from(connections).where(eq(connections.id, started.connectionId));
    expect(c.status).toBe("active");
    const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.connectionId, started.connectionId));
    expect(accts.map((a) => a.ebAccountUid)).toContain("DE1");
  });
});
