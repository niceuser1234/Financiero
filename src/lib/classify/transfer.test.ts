import { describe, expect, it } from "vitest";
import { matchTransfers, type TransferCandidate } from "./transfer";

const c = (id: string, accountId: string, bookingDate: string, amountCents: bigint): TransferCandidate => ({
  id,
  accountId,
  bookingDate,
  amountCents,
  currency: "EUR",
});

describe("matchTransfers", () => {
  it("pairs opposite amounts across accounts within 3 days", () => {
    const pairs = matchTransfers([
      c("1", "A", "2026-07-01", -5000n),
      c("2", "B", "2026-07-02", 5000n),
    ]);
    expect(pairs).toEqual([["1", "2"]]);
  });

  it("does not pair within the same account", () => {
    expect(matchTransfers([c("1", "A", "2026-07-01", -5000n), c("2", "A", "2026-07-01", 5000n)])).toEqual([]);
  });

  it("does not pair beyond the date window", () => {
    expect(matchTransfers([c("1", "A", "2026-07-01", -5000n), c("2", "B", "2026-07-05", 5000n)])).toEqual([]);
  });

  it("does not pair different currencies", () => {
    const pairs = matchTransfers([
      { ...c("1", "A", "2026-07-01", -5000n), currency: "EUR" },
      { ...c("2", "B", "2026-07-01", 5000n), currency: "USD" },
    ]);
    expect(pairs).toEqual([]);
  });

  it("uses each candidate at most once, greedy by smallest date diff", () => {
    const pairs = matchTransfers([
      c("1", "A", "2026-07-01", -5000n),
      c("2", "B", "2026-07-03", 5000n), // diff 2
      c("3", "B", "2026-07-01", 5000n), // diff 0 -> preferred
    ]);
    expect(pairs).toEqual([["1", "3"]]);
  });
});
