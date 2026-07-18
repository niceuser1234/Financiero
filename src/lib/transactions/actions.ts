"use server";

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { categories, categoryRules, merchants, transactions } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { formatCents } from "@/lib/money";
import { fingerprintOf, unwrapPaypal } from "@/lib/classify/normalize";
import { listTransactions, type TxFilter } from "./queries";

export interface TxDTO {
  id: string;
  bookingDate: string;
  amountFmt: string;
  negative: boolean;
  currency: string;
  counterpartyName: string | null;
  purpose: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  merchantName: string | null;
  categorizationSource: string;
  confidence: number | null;
  isTransfer: boolean;
  recurringItemId: string | null;
}

export interface TxPage {
  items: TxDTO[];
  nextCursor: string | null;
  sumFmt: string;
  count: number;
}

export interface SerializableFilter extends Omit<TxFilter, "minCents" | "maxCents"> {
  minEuro?: number;
  maxEuro?: number;
}

function toQuery(f: SerializableFilter): TxFilter {
  const { minEuro, maxEuro, ...rest } = f;
  return {
    ...rest,
    minCents: minEuro !== undefined ? BigInt(Math.round(minEuro * 100)) : undefined,
    maxCents: maxEuro !== undefined ? BigInt(Math.round(maxEuro * 100)) : undefined,
  };
}

export async function fetchTransactions(filter: SerializableFilter): Promise<TxPage> {
  await requireSession();
  const res = await listTransactions(toQuery(filter));
  return {
    nextCursor: res.nextCursor,
    count: res.count,
    sumFmt: formatCents(res.sumCents),
    items: res.items.map((i) => ({
      id: i.id,
      bookingDate: i.bookingDate,
      amountFmt: formatCents(i.amountCents, i.currency),
      negative: i.amountCents < 0n,
      currency: i.currency,
      counterpartyName: i.counterpartyName,
      purpose: i.purpose,
      categoryId: i.categoryId,
      categoryName: i.categoryName,
      categoryColor: i.categoryColor,
      categoryIcon: i.categoryIcon,
      merchantName: i.merchantName,
      categorizationSource: i.categorizationSource,
      confidence: i.confidence,
      isTransfer: i.isTransfer,
      recurringItemId: i.recurringItemId,
    })),
  };
}

export interface PickerCategory {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  color: string;
  icon: string;
}

export async function getPickerCategories(): Promise<PickerCategory[]> {
  await requireSession();
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      parentId: categories.parentId,
      color: categories.color,
      icon: categories.icon,
    })
    .from(categories);
}

export interface RecategorizeInput {
  txId: string;
  categoryId: string;
  createRule?: boolean;
  applyPast?: boolean;
}

/** Manuelle Kategorisierung; optional als dauerhafte Regel und rückwirkend. */
export async function recategorize(input: RecategorizeInput): Promise<{ updated: number }> {
  await requireSession();
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, input.txId));
  if (!tx) throw new Error("Buchung nicht gefunden");

  const fp = fingerprintOf(tx.counterpartyName, tx.purpose);
  let merchantId = tx.merchantId;

  if (input.createRule && fp) {
    const cleanName =
      unwrapPaypal(tx.counterpartyName, tx.purpose)?.merchant ??
      tx.counterpartyName ??
      fp;

    const [m] = await db
      .insert(merchants)
      .values({ fingerprint: fp, nameClean: cleanName, defaultCategoryId: input.categoryId })
      .onConflictDoUpdate({
        target: merchants.fingerprint,
        set: { defaultCategoryId: input.categoryId },
      })
      .returning();
    merchantId = m.id;

    await db
      .insert(categoryRules)
      .values({
        field: "fingerprint",
        op: "equals",
        value: fp,
        categoryId: input.categoryId,
        createdFrom: "correction",
        priority: 10,
      })
      .onConflictDoNothing();
  }

  await db
    .update(transactions)
    .set({
      categoryId: input.categoryId,
      categorizationSource: "manual",
      merchantId: merchantId ?? undefined,
    })
    .where(eq(transactions.id, input.txId));

  let updated = 1;

  if (input.applyPast && fp) {
    const candidates = await db
      .select({ id: transactions.id, cp: transactions.counterpartyName, purpose: transactions.purpose })
      .from(transactions)
      .where(and(ne(transactions.categorizationSource, "manual"), ne(transactions.id, input.txId)));
    const matchIds = candidates
      .filter((c) => fingerprintOf(c.cp, c.purpose) === fp)
      .map((c) => c.id);
    for (const id of matchIds) {
      await db
        .update(transactions)
        .set({ categoryId: input.categoryId, categorizationSource: "rule", merchantId: merchantId ?? undefined })
        .where(eq(transactions.id, id));
    }
    updated += matchIds.length;
  }

  return { updated };
}
