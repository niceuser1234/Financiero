import { describe, expect, it } from "vitest";
import { clusterByAmount, detectRecurring, type FingerprintGroup } from "./detect";

const mk = (dates: string[], cents: bigint | bigint[], hint = true, label?: string): FingerprintGroup => ({
  merchantId: "m1",
  isSubscriptionHint: hint,
  label,
  txs: dates.map((d, i) => ({
    id: String(i),
    bookingDate: d,
    amountCents: Array.isArray(cents) ? cents[i]! : cents,
    currency: "EUR",
  })),
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

  it("requires 3 occurrences for monthly without hint", () => {
    expect(detectRecurring([mk(["2026-05-15", "2026-06-15"], -999n, false)], "2026-07-01")).toHaveLength(0);
  });

  it("accepts 2 occurrences for monthly with subscription hint", () => {
    const [r] = detectRecurring([mk(["2026-06-16", "2026-07-16"], -2142n, true)], "2026-07-21");
    expect(r.cadence).toBe("monthly");
    expect(r.status).toBe("active");
  });

  it("rejects unstable amounts without subscription hint when single cluster can't form", () => {
    // Extremely divergent amounts → separate clusters with too few members
    const g = mk(["2026-04-02", "2026-05-03", "2026-06-02"], [-4312n, -9807n, -1200n], false);
    expect(detectRecurring([g], "2026-07-01")).toHaveLength(0);
  });

  it("detects recurring income as kind income", () => {
    const [r] = detectRecurring([mk(["2026-04-30", "2026-05-31", "2026-06-30"], 250000n)], "2026-07-05");
    expect(r.kind).toBe("income");
    expect(r.monthlyEquivCents).toBe(250000n);
  });

  it("detects rent despite one-off nebenkosten via amount clustering", () => {
    const g = mk(
      ["2026-01-02", "2026-01-05", "2026-02-02", "2026-03-02", "2026-03-31", "2026-04-30", "2026-06-01", "2026-06-30"],
      [-26749n, -11005n, -26749n, -26749n, -26749n, -26749n, -26749n, -26749n],
      false,
      "Dimitri Telesch miete",
    );
    const res = detectRecurring([g], "2026-07-21");
    expect(res).toHaveLength(1);
    expect(res[0].cadence).toBe("monthly");
    expect(res[0].kind).toBe("contract");
    expect(res[0].amountMedianCents).toBe(-26749n);
    expect(res[0].status).toBe("active");
  });

  it("detects bimonthly spotify-like payments", () => {
    const g = mk(
      ["2026-01-21", "2026-03-23", "2026-05-21", "2026-07-21"],
      [-699n, -699n, -699n, -86n],
      true,
      "Spotify",
    );
    const res = detectRecurring([g], "2026-07-21");
    expect(res.length).toBeGreaterThanOrEqual(1);
    const main = res[0];
    expect(main.cadence).toBe("bimonthly");
    expect(main.amountLastCents).toBe(-699n);
    expect(main.amountMedianCents).toBe(-699n);
    // monthly equiv ~ half
    expect(main.monthlyEquivCents).toBe(-349n);
  });

  it("marks large non-hint recurring as contract", () => {
    const [r] = detectRecurring(
      [mk(["2026-04-01", "2026-05-01", "2026-06-01"], -12000n, false, "Someone")],
      "2026-07-01",
    );
    expect(r.kind).toBe("contract");
  });

  it("infers saving kind from category", () => {
    const today = "2026-07-21";
    const mk = (d: string): { id: string; bookingDate: string; amountCents: bigint; currency: string } => ({
      id: d, bookingDate: d, amountCents: -10000n, currency: "EUR",
    });
    const res = detectRecurring(
      [{
        merchantId: "tr", isSubscriptionHint: false, label: "Sparplan",
        categoryKind: "saving",
        txs: [mk("2026-05-05"), mk("2026-06-05"), mk("2026-07-05")],
      }],
      today,
    );
    expect(res[0]?.kind).toBe("saving");
  });
});

describe("clusterByAmount", () => {
  it("splits rent and nebenkosten", () => {
    const txs = [
      { id: "1", bookingDate: "2026-01-02", amountCents: -26749n, currency: "EUR" },
      { id: "2", bookingDate: "2026-01-05", amountCents: -11005n, currency: "EUR" },
      { id: "3", bookingDate: "2026-02-02", amountCents: -26749n, currency: "EUR" },
    ];
    const clusters = clusterByAmount(txs);
    expect(clusters[0]).toHaveLength(2);
    expect(clusters[1]).toHaveLength(1);
  });
});
