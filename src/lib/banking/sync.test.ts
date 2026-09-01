import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections, pendingTransactions, syncRuns, transactions } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { runSync } from "./sync";
import { NeedTanError } from "./types";
import type { BankProvider, ProviderBalance, ProviderTransaction } from "./types";

function makeProvider(
  txByUid: Record<string, ProviderTransaction[]>,
  opts: { throwForUid?: string } = {},
): BankProvider {
  return {
    getAspsps: async () => [],
    startAuth: async () => ({ url: "" }),
    completeAuth: async () => ({ sessionId: "", validUntil: null, accounts: [] }),
    fetchBalances: async (_s, uids): Promise<ProviderBalance[]> =>
      uids.map((uid) => ({ accountUid: uid, amountCents: 100000n, currency: "EUR" })),
    fetchTransactions: async (_s, uid): Promise<ProviderTransaction[]> => {
      if (opts.throwForUid === uid) throw new Error("EnableBankingError 500: boom");
      return txByUid[uid] ?? [];
    },
  };
}

function tx(uid: string, ref: string, date: string, cents: bigint): ProviderTransaction {
  return {
    accountUid: uid,
    entryRef: ref,
    bookingDate: date,
    valueDate: date,
    amountCents: cents,
    currency: "EUR",
    counterpartyName: "Shop " + ref,
    counterpartyIban: null,
    purpose: "purchase " + ref,
    raw: {},
  };
}

const MARKER = "__synctest__";
let existingRunIds = new Set<string>();

beforeEach(async () => {
  existingRunIds = new Set((await db.select({ id: syncRuns.id }).from(syncRuns)).map((run) => run.id));
});

async function seedConnection(uids: string[]): Promise<{ connId: string; acctIds: string[] }> {
  const [conn] = await db
    .insert(connections)
    .values({
      provider: "enable_banking",
      aspspName: MARKER,
      status: "active",
      sessionIdEnc: encrypt("sess-secret"),
    })
    .returning();
  const acctIds: string[] = [];
  for (const uid of uids) {
    const [a] = await db
      .insert(bankAccounts)
      .values({ connectionId: conn.id, ebAccountUid: uid, name: `Acc ${uid}`, currency: "EUR" })
      .returning();
    acctIds.push(a.id);
  }
  return { connId: conn.id, acctIds };
}

describe("runSync", () => {
  afterEach(async () => {
    const conns = await db.select().from(connections).where(eq(connections.aspspName, MARKER));
    for (const c of conns) {
      const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.connectionId, c.id));
      const ids = accts.map((a) => a.id);
      if (ids.length) {
        await db.delete(pendingTransactions).where(inArray(pendingTransactions.accountId, ids));
        await db.delete(transactions).where(inArray(transactions.accountId, ids));
      }
      await db.delete(bankAccounts).where(eq(bankAccounts.connectionId, c.id));
      await db.delete(connections).where(eq(connections.id, c.id));
    }
    const runs = await db.select({ id: syncRuns.id }).from(syncRuns);
    for (const run of runs) {
      if (!existingRunIds.has(run.id)) await db.delete(syncRuns).where(eq(syncRuns.id, run.id));
    }
  });

  it("inserts new transactions and is idempotent on a second run", async () => {
    const uid = `u-${crypto.randomUUID()}`;
    const { connId } = await seedConnection([uid]);
    const provider = makeProvider({ [uid]: [tx(uid, "a", "2026-07-01", -1000n), tx(uid, "b", "2026-07-02", -2000n)] });

    const first = await runSync("manual", { provider, connectionIds: [connId], today: new Date("2026-07-10") });
    expect(first.newTx).toBe(2);
    expect(first.errors).toEqual([]);

    const second = await runSync("manual", { provider, connectionIds: [connId], today: new Date("2026-07-10") });
    expect(second.newTx).toBe(0);
  });

  it("refreshes mapped bank fields for an existing entry without creating a duplicate", async () => {
    const uid = `refresh-${crypto.randomUUID()}`;
    const { connId, acctIds } = await seedConnection([uid]);
    const firstTx = tx(uid, "stable-ref", "2026-07-01", -1000n);
    firstTx.counterpartyName = "DE63120300000001999333DKB";
    const provider = makeProvider({ [uid]: [firstTx] });

    await runSync("manual", { provider, connectionIds: [connId], today: new Date("2026-07-10") });
    firstTx.counterpartyName = "DKB";
    firstTx.counterpartyIban = "DE63120300000001999333";
    const second = await runSync("manual", {
      provider,
      connectionIds: [connId],
      today: new Date("2026-07-10"),
    });

    const stored = await db.select().from(transactions).where(eq(transactions.accountId, acctIds[0]));
    expect(second.newTx).toBe(0);
    expect(stored).toHaveLength(1);
    expect(stored[0].counterpartyName).toBe("DKB");
    expect(stored[0].counterpartyIban).toBe("DE63120300000001999333");
  });

  it("isolates a failing account from a healthy one", async () => {
    const good = `g-${crypto.randomUUID()}`;
    const bad = `b-${crypto.randomUUID()}`;
    const { connId } = await seedConnection([good, bad]);
    const provider = makeProvider({ [good]: [tx(good, "x", "2026-07-01", -500n)] }, { throwForUid: bad });

    const stats = await runSync("manual", { provider, connectionIds: [connId], today: new Date("2026-07-10") });
    expect(stats.newTx).toBe(1);
    expect(stats.errors.some((e) => e.includes("boom"))).toBe(true);
  });

  it("records a sync_runs row", async () => {
    const uid = `r-${crypto.randomUUID()}`;
    const { connId } = await seedConnection([uid]);
    const provider = makeProvider({ [uid]: [tx(uid, "a", "2026-07-01", -1000n)] });
    await runSync("cron", { provider, connectionIds: [connId], today: new Date("2026-07-10") });
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.trigger, "cron"));
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.at(-1)?.status).toBe("ok");
  });

  it("runs postProcess with inserted ids", async () => {
    const uid = `p-${crypto.randomUUID()}`;
    const { connId } = await seedConnection([uid]);
    const provider = makeProvider({ [uid]: [tx(uid, "a", "2026-07-01", -1000n)] });
    let received: string[] = [];
    await runSync("manual", { provider, connectionIds: [connId], today: new Date("2026-07-10"), postProcess: async (ids) => { received = ids; } });
    expect(received).toHaveLength(1);
  });

  it("marks a fints connection expired when the provider needs a TAN", async () => {
    const iban = `DE-${crypto.randomUUID()}`;
    const [conn] = await db.insert(connections).values({
      provider: "fints", aspspName: MARKER, status: "active",
      blz: "12030000", fintsUserId: "u", fintsEndpoint: "e", fintsProductId: "x",
      pinEnc: encrypt("1234"), fintsStateEnc: encrypt("state"),
    }).returning();
    await db.insert(bankAccounts).values({ connectionId: conn.id, ebAccountUid: iban, name: "Giro", currency: "EUR" });

    const provider: BankProvider = {
      getAspsps: async () => [], startAuth: async () => ({ url: "" }),
      completeAuth: async () => ({ sessionId: "", validUntil: null, accounts: [] }),
      fetchBalances: async () => [],
      fetchTransactions: async () => { throw new NeedTanError(); },
    };
    await runSync("cron", { provider, connectionIds: [conn.id], today: new Date("2026-07-10") });
    const [after] = await db.select().from(connections).where(eq(connections.id, conn.id));
    expect(after.status).toBe("expired");
  });

  it("stores pending transactions as a replaceable account snapshot", async () => {
    const uid = `pending-${crypto.randomUUID()}`;
    const { connId, acctIds } = await seedConnection([uid]);
    const pending = { ...tx(uid, "flight", "2026-08-17", -65200n), pending: true };

    const first = await runSync("manual", {
      provider: makeProvider({ [uid]: [pending] }),
      connectionIds: [connId],
      today: new Date("2026-08-17"),
    });
    const stored = await db
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.accountId, acctIds[0]));
    const booked = await db.select().from(transactions).where(eq(transactions.accountId, acctIds[0]));

    expect(first.pendingTx).toBe(1);
    expect(first.newTx).toBe(0);
    expect(stored).toHaveLength(1);
    expect(stored[0].amountCents).toBe(-65200n);
    expect(booked).toHaveLength(0);

    const second = await runSync("manual", {
      provider: makeProvider({ [uid]: [] }),
      connectionIds: [connId],
      today: new Date("2026-08-18"),
    });
    const after = await db
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.accountId, acctIds[0]));

    expect(second.pendingTx).toBe(0);
    expect(after).toHaveLength(0);
  });
});
