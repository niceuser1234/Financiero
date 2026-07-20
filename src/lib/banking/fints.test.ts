import { describe, expect, it, vi } from "vitest";
import { FintsProvider, type FintsProviderConfig } from "./fints";
import { NeedTanError } from "./types";

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function cfg(fetchImpl: typeof fetch): FintsProviderConfig {
  return {
    baseUrl: "http://127.0.0.1:8790", token: "tok", blz: "12030000", user: "u",
    pin: "p", endpoint: "https://fints.dkb.de/fints", productId: "x",
    clientState: "c3RhdGU=", fetchImpl,
  };
}

describe("FintsProvider.fetchBalances", () => {
  it("maps balances to cents bigint", async () => {
    const f = vi.fn().mockResolvedValue(json({ balances: [{ iban: "DE1", amount_cents: 100000, currency: "EUR" }] }));
    const p = new FintsProvider(cfg(f as unknown as typeof fetch));
    const res = await p.fetchBalances("", ["DE1"]);
    expect(res[0].amountCents).toBe(100000n);
    expect(res[0].accountUid).toBe("DE1");
    expect((f.mock.calls[0][0] as string)).toContain("/balances");
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "X-Internal-Token": "tok" });
  });
});

describe("FintsProvider.fetchTransactions", () => {
  it("maps transactions and preserves sign", async () => {
    const f = vi.fn().mockResolvedValue(json({ status: "ok", transactions: [{
      entry_ref: null, booking_date: "2026-07-01", value_date: null, amount_cents: -1299,
      currency: "EUR", counterparty_name: "Netflix", counterparty_iban: null, purpose: "abo", raw: {} }] }));
    const p = new FintsProvider(cfg(f as unknown as typeof fetch));
    const res = await p.fetchTransactions("", "DE1", "2026-06-01");
    expect(res[0].amountCents).toBe(-1299n);
    expect(res[0].counterpartyName).toBe("Netflix");
    expect(res[0].bookingDate).toBe("2026-07-01");
  });

  it("throws NeedTanError on need_tan", async () => {
    const f = vi.fn().mockResolvedValue(json({ status: "need_tan" }));
    const p = new FintsProvider(cfg(f as unknown as typeof fetch));
    await expect(p.fetchTransactions("", "DE1", "2026-06-01")).rejects.toBeInstanceOf(NeedTanError);
  });
});
