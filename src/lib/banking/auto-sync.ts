import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";

export const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const AUTO_SYNC_RETRY_MS = 60 * 60 * 1000;

export interface AutoSyncState {
  due: boolean;
  lastSuccessfulAt: Date | null;
  nextSyncAt: Date;
}

export function evaluateAutoSyncState(
  now: Date,
  lastSuccessfulAt: Date | null,
  lastAutomaticAttemptAt: Date | null,
): AutoSyncState {
  const successDueAt = lastSuccessfulAt
    ? new Date(lastSuccessfulAt.getTime() + AUTO_SYNC_INTERVAL_MS)
    : now;
  const retryDueAt = lastAutomaticAttemptAt
    ? new Date(lastAutomaticAttemptAt.getTime() + AUTO_SYNC_RETRY_MS)
    : now;
  const nextSyncAt = new Date(Math.max(successDueAt.getTime(), retryDueAt.getTime()));
  return { due: now.getTime() >= nextSyncAt.getTime(), lastSuccessfulAt, nextSyncAt };
}

export async function getAutoSyncState(now = new Date()): Promise<AutoSyncState> {
  const [[lastSuccessful], [lastAutomaticAttempt]] = await Promise.all([
    db
      .select({ finishedAt: syncRuns.finishedAt })
      .from(syncRuns)
      .where(
        and(
          inArray(syncRuns.trigger, ["cron", "manual"]),
          eq(syncRuns.status, "ok"),
        ),
      )
      .orderBy(desc(syncRuns.finishedAt))
      .limit(1),
    db
      .select({ startedAt: syncRuns.startedAt })
      .from(syncRuns)
      .where(eq(syncRuns.trigger, "cron"))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1),
  ]);

  return evaluateAutoSyncState(
    now,
    lastSuccessful?.finishedAt ?? null,
    lastAutomaticAttempt?.startedAt ?? null,
  );
}
