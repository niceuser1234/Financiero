import { describe, expect, it } from "vitest";
import { importHash } from "./hash";

describe("importHash", () => {
  it("is stable and whitespace/case-insensitive", () => {
    const a = importHash({
      accountId: "x",
      bookingDate: "2026-07-01",
      amountCents: -999n,
      currency: "EUR",
      counterparty: "Netflix",
      purpose: "ABO  123",
    });
    const b = importHash({
      accountId: "x",
      bookingDate: "2026-07-01",
      amountCents: -999n,
      currency: "EUR",
      counterparty: "NETFLIX ",
      purpose: "abo 123",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("differs when identity fields differ", () => {
    const base = {
      accountId: "x",
      bookingDate: "2026-07-01",
      amountCents: -999n,
      currency: "EUR",
      counterparty: "Netflix",
      purpose: "abo",
    };
    expect(importHash(base)).not.toBe(importHash({ ...base, amountCents: -1000n }));
    expect(importHash(base)).not.toBe(importHash({ ...base, accountId: "y" }));
  });
});
