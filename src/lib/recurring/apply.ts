import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, merchants, recurringItems, transactions } from "@/db/schema";
import { brandKeyOf, fingerprintOf, isNonRecurringBrand, matchBrand } from "@/lib/classify/normalize";
import { detectRecurring, type FingerprintGroup } from "./detect";

/**
 * Verknüpft Buchungen ohne merchant_id mit bekannten Händlern (per Fingerprint).
 * Wichtig nach Brand-Alias-Updates und wenn Regeln nur die Kategorie setzten.
 */
export async function linkKnownMerchants(): Promise<{ linked: number }> {
  const merchantRows = await db.select().from(merchants);
  const byFp = new Map(merchantRows.map((m) => [m.fingerprint, m]));
  const byBrand = new Map<string, (typeof merchantRows)[number]>();
  for (const m of merchantRows) {
    const key = brandKeyOf(m.fingerprint);
    if (!byBrand.has(key)) byBrand.set(key, m);
  }

  const rows = await db
    .select({
      id: transactions.id,
      counterpartyName: transactions.counterpartyName,
      purpose: transactions.purpose,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(isNull(transactions.merchantId), eq(transactions.isTransfer, false)));

  let linked = 0;
  for (const r of rows) {
    const fp = fingerprintOf(r.counterpartyName, r.purpose);
    if (!fp) continue;
    const m = byFp.get(fp) ?? byBrand.get(brandKeyOf(fp));
    if (!m) continue;
    await db
      .update(transactions)
      .set({
        merchantId: m.id,
        ...(r.categoryId
          ? {}
          : m.defaultCategoryId
            ? { categoryId: m.defaultCategoryId, categorizationSource: "rule" as const }
            : {}),
      })
      .where(eq(transactions.id, r.id));
    linked += 1;
  }
  return { linked };
}

type GroupEx = FingerprintGroup & { fingerprint: string; name: string; kindTally: Map<string, number> };

/**
 * Konsolidiert Händler-Gruppen nach Brand-Key (z.B. claude.ai + anthropic claude sub).
 * Wählt den Händler mit den meisten Buchungen als kanonische ID.
 */
function mergeBrandGroups(groups: GroupEx[]): FingerprintGroup[] {
  const buckets = new Map<string, GroupEx[]>();
  for (const g of groups) {
    const key = brandKeyOf(g.fingerprint);
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(g);
  }

  const out: FingerprintGroup[] = [];
  for (const [, parts] of buckets) {
    const sorted = [...parts].sort((a, b) => {
      if (b.txs.length !== a.txs.length) return b.txs.length - a.txs.length;
      if (a.isSubscriptionHint !== b.isSubscriptionHint) return a.isSubscriptionHint ? -1 : 1;
      return a.merchantId.localeCompare(b.merchantId);
    });
    const primary = sorted[0];
    const brand = matchBrand(primary.fingerprint, primary.name);

    const tally = new Map<string, number>();
    for (const p of parts) for (const [k, n] of p.kindTally) tally.set(k, (tally.get(k) ?? 0) + n);
    let categoryKind: FingerprintGroup["categoryKind"] | undefined;
    let best = 0;
    for (const [k, n] of tally) if (n > best) { best = n; categoryKind = k as FingerprintGroup["categoryKind"]; }

    out.push({
      merchantId: primary.merchantId,
      isSubscriptionHint: parts.some((p) => p.isSubscriptionHint) || !!brand?.subscription,
      label: brand?.name ?? primary.name,
      txs: parts.flatMap((p) => p.txs),
      categoryKind,
    });
  }
  return out;
}

async function moveRecurringToMerchant(fromMerchantId: string, toMerchantId: string): Promise<void> {
  const dupItems = await db.select().from(recurringItems).where(eq(recurringItems.merchantId, fromMerchantId));
  for (const di of dupItems) {
    const [existing] = await db
      .select()
      .from(recurringItems)
      .where(and(eq(recurringItems.merchantId, toMerchantId), eq(recurringItems.cadence, di.cadence)));
    if (existing) {
      await db
        .update(transactions)
        .set({ recurringItemId: existing.id })
        .where(eq(transactions.recurringItemId, di.id));
      await db.delete(recurringItems).where(eq(recurringItems.id, di.id));
    } else {
      await db.update(recurringItems).set({ merchantId: toMerchantId }).where(eq(recurringItems.id, di.id));
    }
  }
}

/**
 * Schreibt Fingerprints bekannter Marken auf den kanonischen Wert und
 * merged Doppel-Merchants (z.B. claude ai subscription → anthropic claude).
 */
async function harmonizeMerchantFingerprints(): Promise<void> {
  const all = await db.select().from(merchants);

  for (const m of all) {
    const brand = matchBrand(m.fingerprint, m.nameClean);
    if (!brand) continue;

    const needsFp = m.fingerprint !== brand.fingerprint;
    const needsName = m.nameClean !== brand.name;
    const needsHint = brand.subscription && !m.isSubscriptionHint;
    if (!needsFp && !needsName && !needsHint) continue;

    if (needsFp) {
      const [conflict] = await db.select().from(merchants).where(eq(merchants.fingerprint, brand.fingerprint));
      if (conflict && conflict.id !== m.id) {
        await db.update(transactions).set({ merchantId: conflict.id }).where(eq(transactions.merchantId, m.id));
        await moveRecurringToMerchant(m.id, conflict.id);
        await db
          .update(merchants)
          .set({
            nameClean: brand.name,
            isSubscriptionHint: conflict.isSubscriptionHint || brand.subscription,
          })
          .where(eq(merchants.id, conflict.id));
        await db.delete(merchants).where(eq(merchants.id, m.id));
        continue;
      }
    }

    await db
      .update(merchants)
      .set({
        fingerprint: brand.fingerprint,
        nameClean: brand.name,
        isSubscriptionHint: m.isSubscriptionHint || brand.subscription,
      })
      .where(eq(merchants.id, m.id));
  }
}

/** Läuft nach jedem Sync/Import: verknüpft Händler, erkennt Abos/Verträge. */
export async function runRecurringDetection(
  today = new Date().toISOString().slice(0, 10),
): Promise<{ items: number }> {
  await linkKnownMerchants();
  await harmonizeMerchantFingerprints();

  const rows = await db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      merchantId: transactions.merchantId,
      isSubscriptionHint: merchants.isSubscriptionHint,
      fingerprint: merchants.fingerprint,
      nameClean: merchants.nameClean,
      purpose: transactions.purpose,
      categoryKind: categories.kind,
    })
    .from(transactions)
    .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(isNotNull(transactions.merchantId), eq(transactions.isTransfer, false)));

  const byMerchant = new Map<string, GroupEx>();
  for (const r of rows) {
    let g = byMerchant.get(r.merchantId!);
    if (!g) {
      g = {
        merchantId: r.merchantId!,
        isSubscriptionHint: r.isSubscriptionHint,
        fingerprint: r.fingerprint,
        name: r.nameClean,
        label: r.nameClean,
        txs: [],
        kindTally: new Map(),
      };
      byMerchant.set(r.merchantId!, g);
    }
    if (r.purpose && /miete/i.test(r.purpose)) g.label = `${g.name} miete`;
    if (r.categoryKind) g.kindTally.set(r.categoryKind, (g.kindTally.get(r.categoryKind) ?? 0) + 1);
    g.txs.push({
      id: r.id,
      bookingDate: r.bookingDate,
      amountCents: r.amountCents,
      currency: r.currency,
    });
  }

  const merged = mergeBrandGroups([...byMerchant.values()]);
  const results = detectRecurring(merged, today);
  const activeKeys = new Set(results.map((r) => `${r.merchantId}|${r.cadence}`));

  for (const r of results) {
    const [item] = await db
      .insert(recurringItems)
      .values({
        merchantId: r.merchantId,
        cadence: r.cadence,
        kind: r.kind,
        amountLastCents: r.amountLastCents,
        amountMedianCents: r.amountMedianCents,
        monthlyEquivCents: r.monthlyEquivCents,
        currency: r.currency,
        nextExpectedDate: r.nextExpectedDate,
        status: r.status,
        priceChangedAt: r.priceChanged ? r.lastSeen : null,
        firstSeen: r.firstSeen,
        lastSeen: r.lastSeen,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [recurringItems.merchantId, recurringItems.cadence],
        set: {
          kind: r.kind,
          amountLastCents: r.amountLastCents,
          amountMedianCents: r.amountMedianCents,
          monthlyEquivCents: r.monthlyEquivCents,
          nextExpectedDate: r.nextExpectedDate,
          status: r.status,
          priceChangedAt: r.priceChanged ? r.lastSeen : null,
          lastSeen: r.lastSeen,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (r.txIds.length) {
      await db
        .update(transactions)
        .set({ recurringItemId: item.id })
        .where(inArray(transactions.id, r.txIds));
    }
  }

  const existing = await db
    .select({
      id: recurringItems.id,
      merchantId: recurringItems.merchantId,
      cadence: recurringItems.cadence,
      status: recurringItems.status,
      name: merchants.nameClean,
    })
    .from(recurringItems)
    .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id));

  for (const e of existing) {
    const stillActive = activeKeys.has(`${e.merchantId}|${e.cadence}`);
    if (isNonRecurringBrand(e.name)) {
      // Falsch-Positiv (Supermarkt, Bahn …): ganz entfernen, nicht als "beendet" behalten.
      await db.update(transactions).set({ recurringItemId: null }).where(eq(transactions.recurringItemId, e.id));
      await db.delete(recurringItems).where(eq(recurringItems.id, e.id));
    } else if (!stillActive && e.status !== "ended") {
      await db.update(recurringItems).set({ status: "ended" }).where(eq(recurringItems.id, e.id));
    }
  }

  return { items: results.length };
}
