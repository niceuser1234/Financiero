import { and, eq, inArray, isNotNull, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  categoryRules,
  merchants,
  transactions,
  type CategoryRule,
  type Merchant,
} from "@/db/schema";
import {
  brandKeyOf,
  brandNameOf,
  fingerprintOf,
  matchBrand,
  stripLeadingIban,
  unwrapPaypal,
} from "./normalize";

export interface RuleInput {
  counterpartyName: string | null;
  purpose: string | null;
  amountCents?: bigint;
}

export interface RuleMatch {
  categoryId?: string;
  merchantId?: string;
  source: "rule";
  matchedBy: string;
}

export interface BuiltinRuleMatch {
  categorySlug: string;
  isTransfer?: boolean;
  /** A sign-aware unambiguous rule may override a learned merchant default. */
  overridesMerchant?: boolean;
}

/**
 * Kleine, transparente Basisregeln für eindeutige Buchungstexte. Sie greifen
 * nur, wenn weder eine persönliche Regel noch ein gelernter Händler passt.
 */
export function matchBuiltinRule(tx: RuleInput): BuiltinRuleMatch | null {
  const counterparty = stripLeadingIban(tx.counterpartyName) ?? "";
  const purpose = tx.purpose ?? "";
  const haystack = `${counterparty} ${purpose}`;

  if (
    /\b(?:DKB|Deutsche Kreditbank Berlin)\b/i.test(counterparty) &&
    /\b(?:DKB BANKING|KREDITKARTENABRECHNUNG)\b/i.test(purpose)
  ) {
    return { categorySlug: "umbuchung", isTransfer: true, overridesMerchant: true };
  }
  if (tx.amountCents !== undefined && tx.amountCents > 0n && /\b(?:gehalt|lohn)\b/i.test(purpose)) {
    return { categorySlug: "einkommen-gehalt", overridesMerchant: true };
  }
  if (/\b(?:egym|wellpass)\b/i.test(haystack)) {
    return tx.amountCents !== undefined && tx.amountCents > 0n
      ? { categorySlug: "einkommen-erstattungen", overridesMerchant: true }
      : { categorySlug: "gesundheit-fitness-fitnessstudio", overridesMerchant: true };
  }
  if (/\bmiete\b/i.test(purpose)) return { categorySlug: "wohnen-miete" };
  if (/\b(?:privathaft|privathaftpflicht)\b/i.test(haystack)) {
    return { categorySlug: "versicherungen-haftpflicht" };
  }
  if (/\bstudentenwerk\b/i.test(counterparty) && /\b(?:mensa|cafeteria)\b/i.test(purpose)) {
    return { categorySlug: "restaurants-bars-cafe" };
  }
  if (/\bopenai\b/i.test(haystack)) return { categorySlug: "abos-software-cloud" };
  if (/\bzalando\b/i.test(haystack)) return { categorySlug: "shopping-kleidung" };
  if (/\b(?:cineplex|first cinema|greater union)\b/i.test(haystack)) {
    return { categorySlug: "freizeit-reisen-events-kultur" };
  }
  if (/\bschachvertrieb\b/i.test(haystack)) {
    return { categorySlug: "freizeit-reisen-hobby" };
  }
  if (/\bpaypal\b/i.test(counterparty)) return { categorySlug: "sonstiges" };
  return null;
}

async function ensureBuiltinMerchant(tx: RuleInput, categoryId: string): Promise<string | undefined> {
  const fingerprint = fingerprintOf(tx.counterpartyName, tx.purpose);
  if (!fingerprint) return undefined;
  const brand = matchBrand(tx.counterpartyName, tx.purpose);
  const nameClean =
    brandNameOf(tx.counterpartyName, tx.purpose) ??
    unwrapPaypal(tx.counterpartyName, tx.purpose)?.merchant ??
    stripLeadingIban(tx.counterpartyName) ??
    fingerprint;

  const [inserted] = await db
    .insert(merchants)
    .values({
      fingerprint,
      nameClean,
      defaultCategoryId: categoryId,
      isSubscriptionHint: brand?.subscription ?? false,
    })
    .onConflictDoNothing({ target: merchants.fingerprint })
    .returning({ id: merchants.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.fingerprint, fingerprint));
  return existing?.id;
}

/** Verknüpft auch bereits kategorisierte Basisregel-Buchungen nach einem Upgrade. */
async function linkBuiltinMerchants(): Promise<void> {
  const rows = await db
    .select({
      id: transactions.id,
      counterpartyName: transactions.counterpartyName,
      purpose: transactions.purpose,
      amountCents: transactions.amountCents,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(isNull(transactions.merchantId), isNotNull(transactions.categoryId)));

  for (const row of rows) {
    if (!row.categoryId || !matchBuiltinRule(row)) continue;
    const merchantId = await ensureBuiltinMerchant(row, row.categoryId);
    if (merchantId) {
      await db.update(transactions).set({ merchantId }).where(eq(transactions.id, row.id));
    }
  }
}

function testRule(rule: CategoryRule, tx: RuleInput, fp: string): boolean {
  const haystack =
    rule.field === "counterparty"
      ? tx.counterpartyName ?? ""
      : rule.field === "purpose"
        ? tx.purpose ?? ""
        : fp;

  switch (rule.op) {
    case "equals":
      return haystack.toLowerCase() === rule.value.toLowerCase();
    case "contains":
      return haystack.toLowerCase().includes(rule.value.toLowerCase());
    case "regex":
      try {
        return new RegExp(rule.value, "i").test(haystack);
      } catch {
        return false; // ungültiges Pattern überspringen, kein Crash
      }
  }
}

function lookupMerchant(fp: string, merchantMap: Map<string, Merchant>): Merchant | undefined {
  return merchantMap.get(fp) ?? merchantMap.get(brandKeyOf(fp));
}

/**
 * Deterministische Kategorisierung: Regeln nach priority (aufsteigend = zuerst),
 * dann gelernte Merchant-Zuordnung. Gibt null zurück, wenn nichts greift.
 */
export function applyRulesTo(
  tx: RuleInput,
  rules: CategoryRule[],
  merchantMap: Map<string, Merchant>,
): RuleMatch | null {
  const fp = fingerprintOf(tx.counterpartyName, tx.purpose);
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const merchant = fp ? lookupMerchant(fp, merchantMap) : undefined;

  for (const rule of sorted) {
    if (testRule(rule, tx, fp)) {
      return {
        categoryId: rule.categoryId,
        merchantId: merchant?.id,
        source: "rule",
        matchedBy: `rule:${rule.field}`,
      };
    }
  }

  if (merchant?.defaultCategoryId) {
    return {
      categoryId: merchant.defaultCategoryId,
      merchantId: merchant.id,
      source: "rule",
      matchedBy: "merchant",
    };
  }

  // Händler bekannt, aber noch ohne Default-Kategorie — trotzdem verknüpfen.
  if (merchant) {
    return {
      merchantId: merchant.id,
      source: "rule",
      matchedBy: "merchant-link",
    };
  }
  return null;
}

/** DB-Wrapper: kategorisiert offene Buchungen per Regeln/Merchants. */
export async function applyRules(txIds?: string[]): Promise<{ categorized: number }> {
  const rules = await db.select().from(categoryRules);
  const merchantRows = await db.select().from(merchants);
  const categoryRows = await db.select().from(categories);
  const categoryBySlug = new Map(categoryRows.map((category) => [category.slug, category]));
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const merchantMap = new Map<string, Merchant>();
  for (const m of merchantRows) {
    merchantMap.set(m.fingerprint, m);
    const bk = brandKeyOf(m.fingerprint);
    if (!merchantMap.has(bk)) merchantMap.set(bk, m);
  }

  const rows = await db
    .select({
      id: transactions.id,
      counterpartyName: transactions.counterpartyName,
      purpose: transactions.purpose,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      txIds?.length
        ? inArray(transactions.id, txIds)
        : or(eq(transactions.categorizationSource, "none"), isNull(transactions.categoryId)),
    );

  let categorized = 0;
  for (const r of rows) {
    const match = applyRulesTo(r, rules, merchantMap);
    const builtinCandidate = matchBuiltinRule(r);
    const builtin =
      builtinCandidate &&
      (!match?.categoryId || (builtinCandidate.overridesMerchant && match.matchedBy === "merchant"))
        ? builtinCandidate
        : null;
    const categoryId = builtin
      ? categoryBySlug.get(builtin.categorySlug)?.id
      : match?.categoryId;
    const category = categoryId ? categoryById.get(categoryId) : undefined;
    if (match) {
      const patch: {
        categoryId?: string;
        categorizationSource?: "rule";
        merchantId?: string;
        isTransfer?: boolean;
        confidence?: null;
      } = {};
      if (match.merchantId) patch.merchantId = match.merchantId;
      else if (builtin && categoryId) patch.merchantId = await ensureBuiltinMerchant(r, categoryId);
      if (categoryId) {
        patch.categoryId = categoryId;
        patch.categorizationSource = "rule";
        patch.confidence = null;
        if (builtin?.isTransfer || category?.kind === "transfer") patch.isTransfer = true;
      }
      if (Object.keys(patch).length === 0) continue;
      await db.update(transactions).set(patch).where(eq(transactions.id, r.id));
      if (categoryId) categorized += 1;
      continue;
    }

    if (categoryId) {
      const merchantId = builtin ? await ensureBuiltinMerchant(r, categoryId) : undefined;
      await db
        .update(transactions)
        .set({
          categoryId,
          categorizationSource: "rule",
          confidence: null,
          merchantId,
          isTransfer: builtin?.isTransfer || category?.kind === "transfer" ? true : undefined,
        })
        .where(eq(transactions.id, r.id));
      categorized += 1;
    }
  }
  await linkBuiltinMerchants();
  return { categorized };
}
