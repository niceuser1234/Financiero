import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { runTransferMatching } from "./transfer";
import { applyRules } from "./rules";
import { classifyUnknownFingerprints } from "./llm";
import { runRecurringDetection } from "@/lib/recurring/apply";

/**
 * Quellenunabhängige Nachverarbeitung nach jedem Sync/Import (Spec §4):
 * unwrap (in fingerprintOf eingebettet) → transfer-match → rules → synchrone LLM-Klassifizierung (Fehler geloggt, brechen nicht ab) → recurring-detection.
 */
export async function runPipeline(insertedTxIds: string[]): Promise<void> {
  const since = await earliestBookingDate(insertedTxIds);
  await runTransferMatching(since);
  await applyRules();
  try {
    await classifyUnknownFingerprints();
  } catch (e) {
    // Klassifizierung darf den Import nicht abbrechen — aber Fehler sichtbar loggen.
    console.error("Klassifizierung fehlgeschlagen:", (e as Error).message);
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
