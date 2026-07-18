import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { merchants, recurringItems, transactions } from "@/db/schema";
import { detectRecurring, type FingerprintGroup } from "./detect";

/** Läuft nach jedem Sync/Import: erkennt Abos/Verträge und verknüpft Buchungen. */
export async function runRecurringDetection(today = new Date().toISOString().slice(0, 10)): Promise<{ items: number }> {
  const rows = await db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      merchantId: transactions.merchantId,
      isSubscriptionHint: merchants.isSubscriptionHint,
    })
    .from(transactions)
    .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(isNotNull(transactions.merchantId), eq(transactions.isTransfer, false)));

  const byMerchant = new Map<string, FingerprintGroup>();
  for (const r of rows) {
    const g = byMerchant.get(r.merchantId!) ?? {
      merchantId: r.merchantId!,
      isSubscriptionHint: r.isSubscriptionHint,
      txs: [],
    };
    g.txs.push({ id: r.id, bookingDate: r.bookingDate, amountCents: r.amountCents, currency: r.currency });
    byMerchant.set(r.merchantId!, g);
  }

  const results = detectRecurring([...byMerchant.values()], today);
  const activeKeys = new Set(results.map((r) => `${r.merchantId}|${r.cadence}`));

  for (const r of results) {
    const [item] = await db
      .insert(recurringItems)
      .values({
        merchantId: r.merchantId,
        cadence: r.cadence,
        kind: r.kind,
        amountLastCents: r.amountLastCents,
        amountMedianCents: r.amountMedianCents,
        monthlyEquivCents: r.monthlyEquivCents,
        currency: r.currency,
        nextExpectedDate: r.nextExpectedDate,
        status: r.status,
        priceChangedAt: r.priceChanged ? r.lastSeen : null,
        firstSeen: r.firstSeen,
        lastSeen: r.lastSeen,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [recurringItems.merchantId, recurringItems.cadence],
        set: {
          kind: r.kind,
          amountLastCents: r.amountLastCents,
          amountMedianCents: r.amountMedianCents,
          monthlyEquivCents: r.monthlyEquivCents,
          nextExpectedDate: r.nextExpectedDate,
          status: r.status,
          priceChangedAt: r.priceChanged ? r.lastSeen : null,
          lastSeen: r.lastSeen,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (r.txIds.length) {
      await db
        .update(transactions)
        .set({ recurringItemId: item.id })
        .where(inArray(transactions.id, r.txIds));
    }
  }

  // Verschwundene Items auf "ended" setzen.
  const existing = await db.select().from(recurringItems);
  for (const e of existing) {
    if (!activeKeys.has(`${e.merchantId}|${e.cadence}`) && e.status !== "ended") {
      await db.update(recurringItems).set({ status: "ended" }).where(eq(recurringItems.id, e.id));
    }
  }

  return { items: results.length };
}
