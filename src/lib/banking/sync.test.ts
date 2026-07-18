import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections, syncRuns, transactions } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { runSync } from "./sync";
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
      if (ids.length) await db.delete(transactions).where(inArray(transactions.accountId, ids));
      await db.delete(bankAccounts).where(eq(bankAccounts.connectionId, c.id));
      await db.delete(connections).where(eq(connections.id, c.id));
    }
    await db.delete(syncRuns).where(eq(syncRuns.status, "ok"));
    await db.delete(syncRuns).where(eq(syncRuns.status, "error"));
  });

  it("inserts new transactions and is idempotent on a second run", async () => {
    const uid = `u-${crypto.randomUUID()}`;
    await seedConnection([uid]);
    const provider = makeProvider({ [uid]: [tx(uid, "a", "2026-07-01", -1000n), tx(uid, "b", "2026-07-02", -2000n)] });

    const first = await runSync("manual", { provider, today: new Date("2026-07-10") });
    expect(first.newTx).toBe(2);
    expect(first.errors).toEqual([]);

    const second = await runSync("manual", { provider, today: new Date("2026-07-10") });
    expect(second.newTx).toBe(0);
  });

  it("isolates a failing account from a healthy one", async () => {
    const good = `g-${crypto.randomUUID()}`;
    const bad = `b-${crypto.randomUUID()}`;
    await seedConnection([good, bad]);
    const provider = makeProvider({ [good]: [tx(good, "x", "2026-07-01", -500n)] }, { throwForUid: bad });

    const stats = await runSync("manual", { provider, today: new Date("2026-07-10") });
    expect(stats.newTx).toBe(1);
    expect(stats.errors.some((e) => e.includes("boom"))).toBe(true);
  });

  it("records a sync_runs row", async () => {
    const uid = `r-${crypto.randomUUID()}`;
    await seedConnection([uid]);
    const provider = makeProvider({ [uid]: [tx(uid, "a", "2026-07-01", -1000n)] });
    await runSync("cron", { provider, today: new Date("2026-07-10") });
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.trigger, "cron"));
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.at(-1)?.status).toBe("ok");
  });

  it("runs postProcess with inserted ids", async () => {
    const uid = `p-${crypto.randomUUID()}`;
    await seedConnection([uid]);
    const provider = makeProvider({ [uid]: [tx(uid, "a", "2026-07-01", -1000n)] });
    let received: string[] = [];
    await runSync("manual", { provider, today: new Date("2026-07-10"), postProcess: async (ids) => { received = ids; } });
    expect(received).toHaveLength(1);
  });
});
