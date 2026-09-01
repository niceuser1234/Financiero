import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const secret = process.env.CRON_SECRET;
const endpoint = process.env.AUTO_SYNC_URL ?? "http://127.0.0.1:3000/api/cron/sync";
const retryAfterMs = 60 * 60 * 1000;
const fullIntervalMs = 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setTimeout>;

async function checkForDueSync() {
  let nextCheckMs = retryAfterMs;
  if (!secret) return schedule(nextCheckMs);
  try {
    const response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(6 * 60 * 1000),
    });
    if (!response.ok) {
      console.error(`Automatischer Bankabgleich fehlgeschlagen (${response.status}).`);
    } else {
      const result = (await response.json()) as { skipped?: boolean; nextSyncAt?: string };
      if (result.skipped && result.nextSyncAt) {
        nextCheckMs = Math.max(60_000, new Date(result.nextSyncAt).getTime() - Date.now() + 5_000);
      } else {
        nextCheckMs = fullIntervalMs;
      }
    }
  } catch (error) {
    console.error("Automatischer Bankabgleich nicht erreichbar:", (error as Error).message);
  }
  schedule(nextCheckMs);
}

function schedule(delayMs: number) {
  timer = setTimeout(checkForDueSync, delayMs);
}

schedule(15_000);

function stop() {
  clearTimeout(timer);
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
