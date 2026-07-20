import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections } from "@/db/schema";
import { reconnectFints, __setFetch, startFintsConnect, confirmFintsTan } from "./fints-actions";
import { encrypt } from "@/lib/crypto";

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

describe("reconnectFints", () => {
  it("re-drives an existing expired connection and reactivates it without duplicating accounts", async () => {
    // seed an expired fints connection with stored creds + one linked account
    const [conn] = await db.insert(connections).values({
      provider: "fints", aspspName: "DKB", aspspCountry: "DE", status: "expired",
      blz: "12030000", fintsUserId: "u", fintsEndpoint: "https://fints.dkb.de/fints",
      fintsProductId: "x", pinEnc: encrypt("1234"), fintsStateEnc: encrypt("old"), tanMechanism: "decoupled",
    }).returning();
    await db.insert(bankAccounts).values({
      connectionId: conn.id, ebAccountUid: "DE-RC-1", name: "Giro", currency: "EUR", type: "checking",
    });

    __setFetch(vi.fn().mockResolvedValue(json({
      status: "connected", client_state: "ZnJlc2g=",
      accounts: [{ iban: "DE-RC-1", name: "Giro", currency: "EUR", type: "checking" }],
    })) as unknown as typeof fetch);

    const res = await reconnectFints(conn.id);
    expect(res.status).toBe("connected");
    expect(res.connectionId).toBe(conn.id);

    const [after] = await db.select().from(connections).where(eq(connections.id, conn.id));
    expect(after.status).toBe("active");

    const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.ebAccountUid, "DE-RC-1"));
    expect(accts).toHaveLength(1);              // no duplicate row
    expect(accts[0].connectionId).toBe(conn.id); // still linked to this connection
  });

  it("reassigns an IBAN to the reconnecting connection when it was linked elsewhere", async () => {
    const [oldConn] = await db.insert(connections).values({
      provider: "fints", aspspName: "DKB", status: "expired",
      blz: "12030000", fintsUserId: "u", fintsEndpoint: "e", fintsProductId: "x",
      pinEnc: encrypt("1234"), fintsStateEnc: encrypt("old"),
    }).returning();
    await db.insert(bankAccounts).values({
      connectionId: oldConn.id, ebAccountUid: "DE-RC-2", name: "Giro", currency: "EUR", type: "checking",
    });
    const [newConn] = await db.insert(connections).values({
      provider: "fints", aspspName: "DKB", status: "expired",
      blz: "12030000", fintsUserId: "u", fintsEndpoint: "e", fintsProductId: "x",
      pinEnc: encrypt("1234"), fintsStateEnc: encrypt("pending"),
    }).returning();

    __setFetch(vi.fn().mockResolvedValue(json({
      status: "connected", client_state: "ZnJlc2g=",
      accounts: [{ iban: "DE-RC-2", name: "Giro", currency: "EUR", type: "checking" }],
    })) as unknown as typeof fetch);

    await reconnectFints(newConn.id);

    const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.ebAccountUid, "DE-RC-2"));
    expect(accts).toHaveLength(1);                  // still exactly one row (unique IBAN)
    expect(accts[0].connectionId).toBe(newConn.id); // reassigned to the reconnecting connection
  });

  it("keeps the connection expired and stores pending_state when a TAN is still needed", async () => {
    const [conn] = await db.insert(connections).values({
      provider: "fints", aspspName: "DKB", status: "expired",
      blz: "12030000", fintsUserId: "u", fintsEndpoint: "e", fintsProductId: "x",
      pinEnc: encrypt("1234"), fintsStateEnc: encrypt("old"),
    }).returning();

    __setFetch(vi.fn().mockResolvedValue(json({
      status: "need_tan", decoupled: true, challenge: "tap", pending_state: "cGVuZA==",
    })) as unknown as typeof fetch);

    const res = await reconnectFints(conn.id);
    expect(res.status).toBe("need_tan");
    const [after] = await db.select().from(connections).where(eq(connections.id, conn.id));
    expect(after.status).toBe("expired");
  });
});
