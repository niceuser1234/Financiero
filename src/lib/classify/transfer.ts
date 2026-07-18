import { and, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";

export interface TransferCandidate {
  id: string;
  accountId: string;
  bookingDate: string;
  amountCents: bigint;
  currency: string;
}

const DAYS = 24 * 3600 * 1000;
const MAX_DIFF_DAYS = 3;

function diffDays(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / DAYS);
}

/**
 * Paart Umbuchungen zwischen eigenen Konten: gleiche Beträge mit
 * entgegengesetztem Vorzeichen, gleiche Währung, verschiedene Konten,
 * Buchungsdatum ≤ 3 Tage auseinander. Greedy nach kleinster Datumsdifferenz.
 */
export function matchTransfers(txs: TransferCandidate[]): Array<[string, string]> {
  const candidates: Array<{ a: string; b: string; diff: number }> = [];
  for (let i = 0; i < txs.length; i++) {
    for (let j = i + 1; j < txs.length; j++) {
      const a = txs[i];
      const b = txs[j];
      if (a.currency !== b.currency) continue;
      if (a.accountId === b.accountId) continue;
      if (a.amountCents === 0n) continue;
      if (a.amountCents !== -b.amountCents) continue;
      const diff = diffDays(a.bookingDate, b.bookingDate);
      if (diff > MAX_DIFF_DAYS) continue;
      candidates.push({ a: a.id, b: b.id, diff });
    }
  }
  candidates.sort((x, y) => x.diff - y.diff);

  const used = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const c of candidates) {
    if (used.has(c.a) || used.has(c.b)) continue;
    used.add(c.a);
    used.add(c.b);
    pairs.push([c.a, c.b]);
  }
  return pairs;
}

/** DB-Wrapper: matcht neue/ungematchte Buchungen und markiert sie als Umbuchung. */
export async function runTransferMatching(sinceISO: string): Promise<number> {
  const [umbuchung] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, "umbuchung"));

  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      bookingDate: transactions.bookingDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.bookingDate, sinceISO),
        eq(transactions.isTransfer, false),
        or(isNull(transactions.categoryId), eq(transactions.categoryId, umbuchung?.id ?? "")),
      ),
    );

  const pairs = matchTransfers(rows);
  for (const [a, b] of pairs) {
    await db
      .update(transactions)
      .set({
        isTransfer: true,
        transferPairId: b,
        categoryId: umbuchung?.id,
        categorizationSource: "rule",
      })
      .where(eq(transactions.id, a));
    await db
      .update(transactions)
      .set({
        isTransfer: true,
        transferPairId: a,
        categoryId: umbuchung?.id,
        categorizationSource: "rule",
      })
      .where(eq(transactions.id, b));
  }
  return pairs.length;
}
