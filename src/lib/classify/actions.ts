"use server";

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireSession } from "@/lib/session";

/** Anzahl nicht kategorisierter Ausgaben (kein Transfer, keine Kategorie). */
export async function getUnclassifiedCount(): Promise<number> {
  await requireSession();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(isNull(transactions.categoryId), eq(transactions.isTransfer, false), lt(transactions.amountCents, 0n)));
  return row?.n ?? 0;
}
