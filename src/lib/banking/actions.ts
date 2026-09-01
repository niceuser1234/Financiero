"use server";

import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections } from "@/db/schema";
import { isEnableBankingEnabled } from "@/lib/local-mode";
import { requireSession } from "@/lib/session";
import { enableBankingFromEnv } from "./enable-banking";
import { signState } from "./state";
import { runSync, type SyncStats } from "./sync";
import { runPipeline } from "@/lib/classify/pipeline";
import type { Aspsp } from "./types";

export async function listAspsps(country = "DE"): Promise<Aspsp[]> {
  await requireSession();
  if (!isEnableBankingEnabled()) return [];
  try {
    return await enableBankingFromEnv().getAspsps(country);
  } catch {
    return [];
  }
}

export async function listConnections() {
  await requireSession();
  const conns = await db.select().from(connections).orderBy(desc(connections.createdAt));
  const accts = await db.select().from(bankAccounts);
  return conns.map((c) => ({
    ...c,
    accounts: accts.filter((a) => a.connectionId === c.id),
  }));
}

export async function startBankConnect(formData: FormData) {
  await requireSession();
  if (!isEnableBankingEnabled()) {
    throw new Error("Enable Banking ist im lokalen Sicherheitsmodus deaktiviert");
  }
  const aspspName = String(formData.get("aspsp") ?? "");
  const country = String(formData.get("country") ?? "DE");
  if (!aspspName) throw new Error("Keine Bank ausgewählt");

  const state = signState({ aspsp: aspspName, country });
  const { url } = await enableBankingFromEnv().startAuth({ name: aspspName, country }, state);
  redirect(url);
}

export async function runManualSync(): Promise<SyncStats> {
  await requireSession();
  return runSync("manual", { postProcess: (ids) => runPipeline(ids) });
}

export async function reconnect(connectionId: string) {
  await requireSession();
  if (!isEnableBankingEnabled()) {
    throw new Error("Enable Banking ist im lokalen Sicherheitsmodus deaktiviert");
  }
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!conn) throw new Error("Verbindung nicht gefunden");
  const state = signState({ aspsp: conn.aspspName, country: conn.aspspCountry, reconnect: conn.id });
  const { url } = await enableBankingFromEnv().startAuth(
    { name: conn.aspspName, country: conn.aspspCountry },
    state,
  );
  redirect(url);
}
