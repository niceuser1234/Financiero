import { describe, expect, it } from "vitest";
import { detectRecurring, type FingerprintGroup } from "./detect";

const mk = (dates: string[], cents: bigint, hint = true): FingerprintGroup => ({
  merchantId: "m1",
  isSubscriptionHint: hint,
  txs: dates.map((d, i) => ({ id: String(i), bookingDate: d, amountCents: cents, currency: "EUR" })),
});

describe("detectRecurring", () => {
  it("detects monthly subscription", () => {
    const [r] = detectRecurring([mk(["2026-04-15", "2026-05-15", "2026-06-15"], -999n)], "2026-07-01");
    expect(r.cadence).toBe("monthly");
    expect(r.monthlyEquivCents).toBe(-999n);
    expect(r.nextExpectedDate).toBe("2026-07-15");
    expect(r.status).toBe("active");
  });

  it("detects yearly with 2 occurrences", () => {
    const [r] = detectRecurring([mk(["2025-03-01", "2026-03-02"], -5900n)], "2026-07-01");
    expect(r.cadence).toBe("yearly");
    expect(r.monthlyEquivCents).toBe(-492n);
  });

  it("flags price change >1%", () => {
    const g = mk(["2026-04-15", "2026-05-15", "2026-06-15"], -999n);
    g.txs[2].amountCents = -1299n;
    expect(detectRecurring([g], "2026-07-01")[0].priceChanged).toBe(true);
  });

  it("marks paused after grace period", () => {
    const [r] = detectRecurring([mk(["2026-03-10", "2026-04-10", "2026-05-10"], -999n)], "2026-06-20");
    expect(r.status).toBe("paused");
  });

  it("rejects irregular intervals", () => {
    expect(detectRecurring([mk(["2026-01-01", "2026-01-20", "2026-04-05"], -999n)], "2026-07-01")).toHaveLength(0);
  });

  it("requires 3 occurrences for monthly", () => {
    expect(detectRecurring([mk(["2026-05-15", "2026-06-15"], -999n)], "2026-07-01")).toHaveLength(0);
  });

  it("rejects unstable amounts without subscription hint", () => {
    const g = mk(["2026-04-02", "2026-05-03", "2026-06-02"], -4312n, false);
    g.txs[1].amountCents = -9807n;
    expect(detectRecurring([g], "2026-07-01")).toHaveLength(0);
  });

  it("detects recurring income as kind income", () => {
    const [r] = detectRecurring([mk(["2026-04-30", "2026-05-31", "2026-06-30"], 250000n)], "2026-07-05");
    expect(r.kind).toBe("income");
    expect(r.monthlyEquivCents).toBe(250000n);
  });
});
