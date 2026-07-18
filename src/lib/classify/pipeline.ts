import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { runTransferMatching } from "./transfer";

/**
 * Quellenunabhängige Nachverarbeitung nach jedem Sync/Import.
 * Reihenfolge (Spec §4): unwrap (in fingerprintOf eingebettet) → transfer-match
 * → rules → llm → recurring. Rules/LLM/Recurring werden in Phase 5/6 ergänzt.
 */
export async function runPipeline(insertedTxIds: string[]): Promise<void> {
  const since = await earliestBookingDate(insertedTxIds);
  await runTransferMatching(since);
}

/** Frühestes Buchungsdatum der neuen Buchungen; Fallback 30 Tage zurück. */
async function earliestBookingDate(ids: string[]): Promise<string> {
  const fallback = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (ids.length === 0) return fallback;
  const [row] = await db
    .select({ min: sql<string | null>`min(${transactions.bookingDate})` })
    .from(transactions)
    .where(inArray(transactions.id, ids));
  return row?.min ?? fallback;
}
