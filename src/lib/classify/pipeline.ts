import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { runTransferMatching } from "./transfer";
import { applyRules } from "./rules";
import { classifyUnknownFingerprints } from "./llm";
import { runRecurringDetection } from "@/lib/recurring/apply";

/**
 * Quellenunabhängige Nachverarbeitung nach jedem Sync/Import (Spec §4):
 * unwrap (in fingerprintOf eingebettet) → transfer-match → rules → llm-batch.
 * Recurring-Detection wird in Phase 6 ergänzt.
 * Ergebnisse eines LLM-Batches werden asynchron beim nächsten Cron-Poll angewandt.
 */
export async function runPipeline(insertedTxIds: string[]): Promise<void> {
  const since = await earliestBookingDate(insertedTxIds);
  await runTransferMatching(since);
  await applyRules();
  try {
    await classifyUnknownFingerprints();
  } catch {
    // Kein API-Key / API-Fehler soll den Sync nicht abbrechen.
  }
  await runRecurringDetection();
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
