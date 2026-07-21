"use server";

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { runRecurringDetection } from "@/lib/recurring/apply";
import { classifyUnknownFingerprints } from "./llm";
import { applyRules } from "./rules";

/** Anzahl nicht kategorisierter Ausgaben (kein Transfer, keine Kategorie). */
export async function getUnclassifiedCount(): Promise<number> {
  await requireSession();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(isNull(transactions.categoryId), eq(transactions.isTransfer, false), lt(transactions.amountCents, 0n)));
  return row?.n ?? 0;
}

/** Erneuter Klassifizierungs- + Vertragserkennungs-Lauf (Retry-Button). */
export async function retryClassification(): Promise<{ classified: number; recurring: number }> {
  await requireSession();
  await applyRules();
  const { classified } = await classifyUnknownFingerprints();
  const { items } = await runRecurringDetection();
  return { classified, recurring: items };
}
