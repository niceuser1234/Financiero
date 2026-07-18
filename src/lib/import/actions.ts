"use server";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, syncRuns, transactions } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { formatCents } from "@/lib/money";
import { runPipeline } from "@/lib/classify/pipeline";
import { importHash } from "./hash";
import { parseCsv } from "./parse";
import { PROFILES, type ProfileId } from "./profiles";

export interface PreviewRow {
  bookingDate: string;
  amount: string;
  counterparty: string;
  purpose: string;
}

export interface PreviewResult {
  rows: PreviewRow[];
  total: number;
  errors: string[];
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function listImportAccounts() {
  await requireSession();
  return db
    .select({
      id: bankAccounts.id,
      name: bankAccounts.name,
      type: bankAccounts.type,
      currency: bankAccounts.currency,
    })
    .from(bankAccounts)
    .orderBy(asc(bankAccounts.name));
}

export async function previewCsv(profileId: ProfileId, content: string): Promise<PreviewResult> {
  await requireSession();
  const { rows, errors } = parseCsv(profileId, content);
  return {
    total: rows.length,
    errors,
    rows: rows.slice(0, 10).map((r) => ({
      bookingDate: r.bookingDate,
      amount: formatCents(r.amountCents, r.currency),
      counterparty: r.counterpartyName ?? "–",
      purpose: r.purpose ?? "",
    })),
  };
}

export async function importCsv(
  profileId: ProfileId,
  accountId: string,
  content: string,
  newAccount?: { name: string; type: "checking" | "credit_card" | "emoney" },
): Promise<ImportResult> {
  await requireSession();
  if (!PROFILES[profileId]) throw new Error("Unbekanntes Profil");

  let targetAccountId = accountId;
  if (accountId === "__new__") {
    if (!newAccount?.name) throw new Error("Name für neues Konto fehlt");
    const [acct] = await db
      .insert(bankAccounts)
      .values({ name: newAccount.name, type: newAccount.type, currency: "EUR" })
      .returning();
    targetAccountId = acct.id;
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ trigger: "import", status: "running" })
    .returning();

  const { rows, errors } = parseCsv(profileId, content);
  const insertedIds: string[] = [];
  let skipped = 0;

  const seen = new Set<string>();
  for (const r of rows) {
    const hash = importHash({
      accountId: targetAccountId,
      bookingDate: r.bookingDate,
      amountCents: r.amountCents,
      currency: r.currency,
      counterparty: r.counterpartyName,
      purpose: r.purpose,
    });
    if (seen.has(hash)) {
      skipped += 1;
      continue;
    }
    seen.add(hash);

    const inserted = await db
      .insert(transactions)
      .values({
        accountId: targetAccountId,
        bookingDate: r.bookingDate,
        valueDate: r.valueDate,
        amountCents: r.amountCents,
        currency: r.currency,
        counterpartyName: r.counterpartyName,
        counterpartyIban: r.counterpartyIban,
        purpose: r.purpose,
        categorizationSource: "none",
        importHash: hash,
        raw: r.raw,
      })
      .onConflictDoNothing()
      .returning({ id: transactions.id });
    if (inserted.length > 0) insertedIds.push(inserted[0].id);
    else skipped += 1;
  }

  await runPipeline(insertedIds).catch((e) => errors.push(`Nachverarbeitung: ${(e as Error).message}`));

  await db
    .update(syncRuns)
    .set({
      finishedAt: new Date(),
      status: errors.length > 0 ? "error" : "ok",
      stats: { inserted: insertedIds.length, skipped, errors: errors.length },
      error: errors.length > 0 ? errors.join("; ") : null,
    })
    .where(eq(syncRuns.id, run.id));

  return { inserted: insertedIds.length, skipped, errors };
}
