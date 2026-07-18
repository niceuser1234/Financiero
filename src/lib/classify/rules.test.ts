import { describe, expect, it } from "vitest";
import type { CategoryRule, Merchant } from "@/db/schema";
import { applyRulesTo } from "./rules";

function rule(p: Partial<CategoryRule>): CategoryRule {
  return {
    id: crypto.randomUUID(),
    priority: 100,
    field: "counterparty",
    op: "contains",
    value: "",
    categoryId: "cat-default",
    createdFrom: "manual",
    createdAt: new Date(),
    ...p,
  } as CategoryRule;
}

function merchant(fingerprint: string, categoryId: string): Merchant {
  return {
    id: "m-" + fingerprint,
    fingerprint,
    nameClean: fingerprint,
    defaultCategoryId: categoryId,
    isSubscriptionHint: false,
    createdAt: new Date(),
  };
}

describe("applyRulesTo", () => {
  it("returns null when nothing matches", () => {
    expect(applyRulesTo({ counterpartyName: "Foo", purpose: null }, [], new Map())).toBeNull();
  });

  it("lower priority number wins", () => {
    const rules = [
      rule({ priority: 100, op: "contains", value: "rewe", categoryId: "cat-low" }),
      rule({ priority: 10, op: "contains", value: "rewe", categoryId: "cat-high" }),
    ];
    const m = applyRulesTo({ counterpartyName: "REWE Markt", purpose: null }, rules, new Map());
    expect(m?.categoryId).toBe("cat-high");
  });

  it("contains is case-insensitive", () => {
    const rules = [rule({ op: "contains", value: "NETFLIX", categoryId: "cat-streaming" })];
    expect(applyRulesTo({ counterpartyName: "netflix intl", purpose: null }, rules, new Map())?.categoryId).toBe(
      "cat-streaming",
    );
  });

  it("skips invalid regex without crashing", () => {
    const rules = [rule({ op: "regex", value: "(", categoryId: "cat-x" })];
    expect(applyRulesTo({ counterpartyName: "anything", purpose: null }, rules, new Map())).toBeNull();
  });

  it("falls back to merchant map after rules", () => {
    const map = new Map([["rewe markt gmbh fil", merchant("rewe markt gmbh fil", "cat-food")]]);
    const m = applyRulesTo({ counterpartyName: "REWE Markt GmbH Fil. 0421", purpose: null }, [], map);
    expect(m?.categoryId).toBe("cat-food");
    expect(m?.matchedBy).toBe("merchant");
  });

  it("fingerprint field matches on computed fingerprint", () => {
    const rules = [rule({ field: "fingerprint", op: "equals", value: "netflix", categoryId: "cat-streaming" })];
    const m = applyRulesTo(
      { counterpartyName: "PayPal Europe S.a.r.l.", purpose: "PP.1.PP . NETFLIX, Ihr Einkauf bei NETFLIX" },
      rules,
      new Map(),
    );
    expect(m?.categoryId).toBe("cat-streaming");
  });
});
