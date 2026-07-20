"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { requireSession } from "@/lib/session";

export interface FintsConnectInput {
  blz: string; user: string; pin: string; endpoint: string; productId: string;
}
export interface FintsConnectResult {
  status: "connected" | "need_tan"; connectionId: string; challenge?: string;
}
interface SidecarAccount { iban: string; name: string; currency: string; type: string }
interface SidecarResult {
  status: "connected" | "need_tan"; client_state?: string;
  pending_state?: string; challenge?: string; accounts?: SidecarAccount[];
}

let fetchOverride: typeof fetch | undefined;
/** Nur für Tests: injiziert ein fetch. */
export async function __setFetch(f: typeof fetch | undefined) { fetchOverride = f; }

async function sidecarPost(path: string, body: unknown): Promise<SidecarResult> {
  const f = fetchOverride ?? fetch;
  const baseUrl = process.env.FINTS_SIDECAR_URL ?? "http://127.0.0.1:8790";
  const token = process.env.FINTS_SIDECAR_TOKEN ?? "";
  const res = await f(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`FinTS-Sidecar ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as SidecarResult;
}

async function saveAccounts(connectionId: string, accts: SidecarAccount[]): Promise<void> {
  for (const a of accts) {
    const existing = await db.select().from(bankAccounts).where(eq(bankAccounts.ebAccountUid, a.iban));
    if (existing.length === 0) {
      await db.insert(bankAccounts).values({
        connectionId, ebAccountUid: a.iban, name: a.name, currency: a.currency, type: "checking",
      });
    }
  }
}

export async function startFintsConnect(input: FintsConnectInput): Promise<FintsConnectResult> {
  await requireSession();
  const r = await sidecarPost("/connect", {
    blz: input.blz, user: input.user, pin: input.pin,
    endpoint: input.endpoint, product_id: input.productId,
  });
  const [conn] = await db.insert(connections).values({
    provider: "fints", aspspName: "DKB", aspspCountry: "DE",
    status: r.status === "connected" ? "active" : "expired",
    blz: input.blz, fintsUserId: input.user, fintsEndpoint: input.endpoint,
    fintsProductId: input.productId, pinEnc: encrypt(input.pin),
    fintsStateEnc: encrypt(r.status === "connected" ? (r.client_state ?? "") : (r.pending_state ?? "")),
    tanMechanism: "decoupled",
  }).returning();

  if (r.status === "connected") {
    await saveAccounts(conn.id, r.accounts ?? []);
    return { status: "connected", connectionId: conn.id };
  }
  return { status: "need_tan", connectionId: conn.id, challenge: r.challenge };
}

export async function confirmFintsTan(connectionId: string): Promise<FintsConnectResult> {
  await requireSession();
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!conn) throw new Error("Verbindung nicht gefunden");
  const pendingState = conn.fintsStateEnc ? decrypt(conn.fintsStateEnc) : "";

  const r = await sidecarPost("/connect/confirm", { pending_state: pendingState, tan: "" });
  if (r.status === "connected") {
    await db.update(connections).set({
      status: "active", fintsStateEnc: encrypt(r.client_state ?? ""),
    }).where(eq(connections.id, connectionId));
    await saveAccounts(connectionId, r.accounts ?? []);
    return { status: "connected", connectionId };
  }
  // Noch nicht in der App bestätigt — Pending-State aktualisieren, weiter pollen.
  if (r.pending_state) {
    await db.update(connections).set({ fintsStateEnc: encrypt(r.pending_state) }).where(eq(connections.id, connectionId));
  }
  return { status: "need_tan", connectionId, challenge: r.challenge };
}
