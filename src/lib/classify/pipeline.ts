/**
 * Quellenunabhängige Nachverarbeitung nach jedem Sync/Import.
 * Wird phasenweise gefüllt:
 *   Phase 3: unwrapAndMatch (PayPal-Unwrap + Transfer-Matching)
 *   Phase 5: applyRules + classifyUnknownFingerprints
 *   Phase 6: runRecurringDetection
 */
export async function runPipeline(_insertedTxIds: string[]): Promise<void> {
  // Schritte werden in den folgenden Phasen hier eingehängt.
}
