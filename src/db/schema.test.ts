import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { bankAccounts, transactions } from "./schema";
import { importHash } from "@/lib/import/hash";

describe("schema smoke", () => {
  const marker = `test-${crypto.randomUUID()}`;

  afterAll(async () => {
    const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.name, marker));
    for (const a of accts) {
      await db.delete(transactions).where(eq(transactions.accountId, a.id));
      await db.delete(bankAccounts).where(eq(bankAccounts.id, a.id));
    }
  });

  it("inserts and reads an account + transaction with bigint cents", async () => {
    const [acct] = await db
      .insert(bankAccounts)
      .values({ name: marker, type: "checking", currency: "EUR", balanceCents: 500000n })
      .returning();
    expect(acct.balanceCents).toBe(500000n);

    const hash = importHash({
      accountId: acct.id,
      bookingDate: "2026-07-01",
      amountCents: -1299n,
      currency: "EUR",
      counterparty: "Netflix",
      purpose: "abo",
    });
    const [tx] = await db
      .insert(transactions)
      .values({
        accountId: acct.id,
        bookingDate: "2026-07-01",
        amountCents: -1299n,
        currency: "EUR",
        counterpartyName: "Netflix",
        importHash: hash,
      })
      .returning();

    expect(tx.amountCents).toBe(-1299n);
    expect(tx.categorizationSource).toBe("none");

    const read = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(read).toHaveLength(1);
    expect(read[0].amountCents).toBe(-1299n);
  });
});
