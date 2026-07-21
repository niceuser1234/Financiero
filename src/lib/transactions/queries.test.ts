import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, transactions } from "@/db/schema";
import { importHash } from "@/lib/import/hash";
import { listTransactions } from "./queries";

const MARK = `__qtest_${crypto.randomUUID()}__`;
let accountId: string;
let foodCatId: string;

async function tx(date: string, cents: bigint, cp: string, catId?: string) {
  await db.insert(transactions).values({
    accountId,
    bookingDate: date,
    amountCents: cents,
    currency: "EUR",
    counterpartyName: cp,
    categoryId: catId,
    importHash: importHash({ accountId, bookingDate: date, amountCents: cents, currency: "EUR", counterparty: cp, purpose: null }),
  });
}

describe("listTransactions", () => {
  beforeAll(async () => {
    const [a] = await db.insert(bankAccounts).values({ name: MARK, type: "checking", currency: "EUR" }).returning();
    accountId = a.id;
    const [food] = await db.select().from(categories).where(eq(categories.slug, "lebensmittel-supermarkt"));
    foodCatId = food.id;
    await tx("2026-07-01", -1000n, "REWE", foodCatId);
    await tx("2026-07-02", -2000n, "EDEKA", foodCatId);
    await tx("2026-07-03", 250000n, "Arbeitgeber");
    await tx("2026-07-04", -500n, "Amazon");
    await tx("2026-07-05", -750n, "Netflix");
  });

  afterAll(async () => {
    await db.delete(transactions).where(eq(transactions.accountId, accountId));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
  });

  it("returns all with correct sum and count", async () => {
    const r = await listTransactions({ accountIds: [accountId] });
    expect(r.count).toBe(5);
    expect(r.sumCents).toBe(-1000n - 2000n + 250000n - 500n - 750n);
  });

  it("filters by direction out", async () => {
    const r = await listTransactions({ accountIds: [accountId], direction: "out" });
    expect(r.count).toBe(4);
    expect(r.items.every((i) => i.amountCents < 0n)).toBe(true);
  });

  it("filters by category", async () => {
    const r = await listTransactions({ accountIds: [accountId], categoryIds: [foodCatId] });
    expect(r.count).toBe(2);
    expect(r.sumCents).toBe(-3000n);
  });

  it("searches counterparty text", async () => {
    const r = await listTransactions({ accountIds: [accountId], q: "netflix" });
    expect(r.count).toBe(1);
    expect(r.items[0].counterpartyName).toBe("Netflix");
  });

  it("sorts by amount (largest absolute first)", async () => {
    const r = await listTransactions({ accountIds: [accountId], sort: "amount" });
    const abs = r.items.map((i) => (i.amountCents < 0n ? -i.amountCents : i.amountCents));
    expect(abs).toEqual([250000n, 2000n, 1000n, 750n, 500n]);
  });

  it("paginates amount-sorted results with a stable keyset (no gaps or dupes)", async () => {
    const p1 = await listTransactions({ accountIds: [accountId], sort: "amount", limit: 2 });
    const p2 = await listTransactions({ accountIds: [accountId], sort: "amount", limit: 2, cursor: p1.nextCursor! });
    const p3 = await listTransactions({ accountIds: [accountId], sort: "amount", limit: 2, cursor: p2.nextCursor! });
    const abs = [...p1.items, ...p2.items, ...p3.items].map((i) => (i.amountCents < 0n ? -i.amountCents : i.amountCents));
    expect(abs).toEqual([250000n, 2000n, 1000n, 750n, 500n]);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((i) => i.id)).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
  });

  it("paginates with a stable keyset cursor (no gaps or dupes)", async () => {
    const p1 = await listTransactions({ accountIds: [accountId], limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listTransactions({ accountIds: [accountId], limit: 2, cursor: p1.nextCursor! });
    const p3 = await listTransactions({ accountIds: [accountId], limit: 2, cursor: p2.nextCursor! });
    const ids = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
  });
});
