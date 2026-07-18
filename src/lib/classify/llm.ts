/**
 * Claude-Batch-Klassifizierung. Vollständige Implementierung in Phase 5.
 * Signaturen sind hier bereits final, damit Cron-Route und Pipeline dagegen bauen.
 */

export async function classifyUnknownFingerprints(): Promise<{ submitted: number; batchId: string | null }> {
  return { submitted: 0, batchId: null };
}

export async function pollAndApplyBatches(): Promise<{ applied: number }> {
  return { applied: 0 };
}
