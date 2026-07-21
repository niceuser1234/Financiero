import { eq, inArray, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categoryRules, merchants, transactions, type CategoryRule, type Merchant } from "@/db/schema";
import { brandKeyOf, fingerprintOf } from "./normalize";

export interface RuleInput {
  counterpartyName: string | null;
  purpose: string | null;
}

export interface RuleMatch {
  categoryId?: string;
  merchantId?: string;
  source: "rule";
  matchedBy: string;
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
    if (match) {
      const patch: {
        categoryId?: string;
        categorizationSource?: "rule";
        merchantId?: string;
      } = {};
      if (match.merchantId) patch.merchantId = match.merchantId;
      if (match.categoryId) {
        patch.categoryId = match.categoryId;
        patch.categorizationSource = "rule";
      }
      if (Object.keys(patch).length === 0) continue;
      await db.update(transactions).set(patch).where(eq(transactions.id, r.id));
      if (match.categoryId) categorized += 1;
    }
  }
  return { categorized };
}
