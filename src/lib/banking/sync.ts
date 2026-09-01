import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections, pendingTransactions, syncRuns, transactions } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { importHash } from "@/lib/import/hash";
import { isEnableBankingEnabled } from "@/lib/local-mode";
import { enableBankingFromEnv } from "./enable-banking";
import { FintsProvider } from "./fints";
import { getFintsProductId, getFintsProductVersion } from "./fints-config";
import { NeedTanError, type ProviderTransaction, type ReadProvider } from "./types";

export interface SyncStats {
  newTx: number;
  pendingTx: number;
  accounts: number;
  errors: string[];
}

export interface SyncOptions {
  /** Injizierbarer Provider für Tests; sonst aus Env gebaut. */
  provider?: ReadProvider;
  /** Nachverarbeitung (unwrap/match/rules/recurring) — wird in späteren Phasen gefüllt. */
  postProcess?: (insertedTxIds: string[]) => Promise<void>;
  today?: Date;
  /** Begrenzung für isolierte Tests; reguläre Syncs lassen dies leer. */
  connectionIds?: string[];
}

const DAYS = 24 * 3600 * 1000;
const CURSOR_OVERLAP_DAYS = 7;
const DEFAULT_LOOKBACK_DAYS = 90;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Cursor je Konto: letztes Buchungsdatum minus Überlappung; Dedupe fängt Doppelte. */
async function cursorFor(accountId: string, today: Date): Promise<string> {
  const [row] = await db
    .select({ max: sql<string | null>`max(${transactions.bookingDate})` })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));
  if (row?.max) {
    return iso(new Date(new Date(row.max).getTime() - CURSOR_OVERLAP_DAYS * DAYS));
  }
  return iso(new Date(today.getTime() - DEFAULT_LOOKBACK_DAYS * DAYS));
}

function toRow(accountId: string, t: ProviderTransaction) {
  const hash = importHash({
    accountId,
    bookingDate: t.bookingDate,
    amountCents: t.amountCents,
    currency: t.currency,
    counterparty: t.counterpartyName,
    purpose: t.purpose,
  });
  return {
    accountId,
    bookingDate: t.bookingDate,
    valueDate: t.valueDate,
    amountCents: t.amountCents,
    currency: t.currency,
    counterpartyName: t.counterpartyName,
    counterpartyIban: t.counterpartyIban,
    purpose: t.purpose,
    ebEntryRef: t.entryRef,
    importHash: hash,
    raw: t.raw as object,
  };
}

function toPendingRow(accountId: string, t: ProviderTransaction, observedAt: Date) {
  const hash = importHash({
    accountId,
    bookingDate: t.bookingDate,
    amountCents: t.amountCents,
    currency: t.currency,
    counterparty: t.counterpartyName,
    purpose: t.purpose,
  });
  return {
    accountId,
    bookingDate: t.bookingDate,
    amountCents: t.amountCents,
    currency: t.currency,
    counterpartyName: t.counterpartyName,
    counterpartyIban: t.counterpartyIban,
    purpose: t.purpose,
    importHash: hash,
    raw: t.raw as object,
    observedAt,
  };
}

async function replacePendingTransactions(
  accountId: string,
  pending: ProviderTransaction[],
  observedAt: Date,
): Promise<void> {
  const seen = new Set<string>();
  const rows = pending
    .map((transaction) => toPendingRow(accountId, transaction, observedAt))
    .filter((row) => {
      if (seen.has(row.importHash)) return false;
      seen.add(row.importHash);
      return true;
    });

  await db.transaction(async (tx) => {
    await tx.delete(pendingTransactions).where(eq(pendingTransactions.accountId, accountId));
    if (rows.length > 0) await tx.insert(pendingTransactions).values(rows).onConflictDoNothing();
  });
}

function buildProvider(conn: typeof connections.$inferSelect): { provider: ReadProvider; sessionId: string } {
  if (conn.provider === "fints") {
    const baseUrl = process.env.FINTS_SIDECAR_URL ?? "http://127.0.0.1:8790";
    const token = process.env.FINTS_SIDECAR_TOKEN ?? "";
    return {
      provider: new FintsProvider({
        baseUrl, token,
        blz: conn.blz ?? "", user: conn.fintsUserId ?? "",
        pin: conn.pinEnc ? decrypt(conn.pinEnc) : "",
        endpoint: conn.fintsEndpoint ?? "",
        productId: getFintsProductId(conn.fintsProductId),
        productVersion: getFintsProductVersion(),
        clientState: conn.fintsStateEnc ? decrypt(conn.fintsStateEnc) : "",
      }),
      sessionId: "",
    };
  }
  if (!isEnableBankingEnabled()) {
    throw new Error("Enable Banking ist im lokalen Sicherheitsmodus deaktiviert");
  }
  return {
    provider: enableBankingFromEnv(),
    sessionId: conn.sessionIdEnc ? decrypt(conn.sessionIdEnc) : "",
  };
}

export async function runSync(
  trigger: "cron" | "manual",
  opts: SyncOptions = {},
): Promise<SyncStats> {
  const today = opts.today ?? new Date();
  const stats: SyncStats = { newTx: 0, pendingTx: 0, accounts: 0, errors: [] };
  const insertedIds: string[] = [];

  const [run] = await db.insert(syncRuns).values({ trigger, status: "running" }).returning();

  const conns = await db
    .select()
    .from(connections)
    .where(
      opts.connectionIds?.length
        ? and(eq(connections.status, "active"), inArray(connections.id, opts.connectionIds))
        : eq(connections.status, "active"),
    );

  for (const conn of conns) {
    let provider: ReadProvider;
    let sessionId: string;
    try {
      if (opts.provider) {
        provider = opts.provider;
        sessionId = conn.sessionIdEnc ? decrypt(conn.sessionIdEnc) : "";
      } else {
        ({ provider, sessionId } = buildProvider(conn));
      }
    } catch (e) {
      stats.errors.push(`${conn.aspspName}: ${(e as Error).message}`);
      continue;
    }

    const accts = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.connectionId, conn.id));

    // Salden aktualisieren (Fehler hier blockiert Transaktions-Sync nicht).
    try {
      const uids = accts.map((a) => a.ebAccountUid).filter((u): u is string => !!u);
      const balances = await provider.fetchBalances(sessionId, uids);
      for (const b of balances) {
        await db
          .update(bankAccounts)
          .set({ balanceCents: b.amountCents, balanceUpdatedAt: today })
          .where(eq(bankAccounts.ebAccountUid, b.accountUid));
      }
    } catch (e) {
      stats.errors.push(`${conn.aspspName} Salden: ${(e as Error).message}`);
      if (isConsentError(e)) {
        await db.update(connections).set({ status: "expired" }).where(eq(connections.id, conn.id));
        continue;
      }
    }

    for (const acct of accts) {
      if (!acct.ebAccountUid) continue;
      try {
        const since = await cursorFor(acct.id, today);
        const txs = await provider.fetchTransactions(sessionId, acct.ebAccountUid, since);
        const pending = txs.filter((transaction) => transaction.pending === true);
        const booked = txs.filter((transaction) => transaction.pending !== true);
        await replacePendingTransactions(acct.id, pending, today);
        stats.pendingTx += pending.length;
        stats.accounts += 1;

        // Intra-Batch-Dedupe nach importHash, dann DB-Dedupe via ON CONFLICT DO NOTHING.
        const seen = new Set<string>();
        const rows = [];
        for (const t of booked) {
          const row = toRow(acct.id, t);
          if (seen.has(row.importHash)) continue;
          seen.add(row.importHash);
          rows.push(row);
        }
        for (const row of rows) {
          const inserted = await db
            .insert(transactions)
            .values(row)
            .onConflictDoNothing()
            .returning({ id: transactions.id });
          if (inserted.length > 0) {
            stats.newTx += 1;
            insertedIds.push(inserted[0].id);
          } else if (row.ebEntryRef) {
            // FinTS-Mappings können verbessert werden (z. B. getrennte IBAN/
            // Händlernamen). Vorhandene Bankbuchungen anhand ihrer stabilen
            // Referenz aktualisieren, ohne sie als neue Umsätze zu zählen.
            await db
              .update(transactions)
              .set({
                valueDate: row.valueDate,
                counterpartyName: row.counterpartyName,
                counterpartyIban: row.counterpartyIban,
                purpose: row.purpose,
                raw: row.raw,
              })
              .where(
                and(
                  eq(transactions.accountId, row.accountId),
                  eq(transactions.ebEntryRef, row.ebEntryRef),
                ),
              );
          }
        }
      } catch (e) {
        stats.errors.push(`${conn.aspspName}/${acct.name}: ${(e as Error).message}`);
        if (isConsentError(e)) {
          await db.update(connections).set({ status: "expired" }).where(eq(connections.id, conn.id));
        }
      }
    }
  }

  if (opts.postProcess) {
    try {
      await opts.postProcess(insertedIds);
    } catch (e) {
      stats.errors.push(`Nachverarbeitung: ${(e as Error).message}`);
    }
  }

  await db
    .update(syncRuns)
    .set({
      finishedAt: new Date(),
      status: stats.errors.length > 0 ? "error" : "ok",
      stats,
      error: stats.errors.length > 0 ? stats.errors.join("; ") : null,
    })
    .where(eq(syncRuns.id, run.id));

  return stats;
}

function isConsentError(e: unknown): boolean {
  if (e instanceof NeedTanError) return true;
  const msg = (e as Error)?.message ?? "";
  return /\b(401|403)\b/.test(msg);
}
