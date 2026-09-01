import { describe, expect, it } from "vitest";
import {
  buildCashflowBreakdown,
  buildLiquidityForecast,
  buildSpendingDrivers,
  type ExpenseBucket,
} from "./insights";
import type { DateRange } from "./period";

const currentRange: DateRange = { from: "2026-08-01", to: "2026-08-17" };
const previousRange: DateRange = { from: "2026-07-15", to: "2026-07-31" };

describe("buildLiquidityForecast", () => {
  it("projects pending, recurring income, fixed costs and saving over 30 days", () => {
    const forecast = buildLiquidityForecast({
      today: "2026-08-17",
      openingBalanceCents: 100_000n,
      dailyVariableCents: 0n,
      pending: [
        {
          date: "2026-08-18",
          name: "Flug",
          amountCents: -65_200n,
          fingerprint: "flug",
        },
      ],
      recurring: [
        {
          date: "2026-08-25",
          name: "Gehalt",
          amountCents: 250_000n,
          fingerprint: "gehalt",
          cadence: "monthly",
        },
        {
          date: "2026-09-01",
          name: "Miete",
          amountCents: -90_000n,
          fingerprint: "miete",
          cadence: "monthly",
        },
        {
          date: "2026-09-03",
          name: "Sparplan",
          amountCents: -20_000n,
          fingerprint: "sparplan",
          cadence: "monthly",
        },
      ],
    });

    const balanceOn = (date: string) =>
      forecast.points.find((point) => point.date === date)?.balanceCents;

    expect(forecast.points).toHaveLength(31);
    expect(balanceOn("2026-08-17")).toBe(100_000n);
    expect(balanceOn("2026-08-18")).toBe(34_800n);
    expect(balanceOn("2026-08-25")).toBe(284_800n);
    expect(balanceOn("2026-09-01")).toBe(194_800n);
    expect(balanceOn("2026-09-03")).toBe(174_800n);
    expect(forecast.lowestBalanceCents).toBe(34_800n);
    expect(forecast.lowestDate).toBe("2026-08-18");
    expect(forecast.endBalanceCents).toBe(174_800n);
  });

  it("replaces one matching recurring forecast with its bank pending transaction", () => {
    const forecast = buildLiquidityForecast({
      today: "2026-08-17",
      openingBalanceCents: 100_000n,
      dailyVariableCents: 0n,
      pending: [
        {
          date: "2026-08-18",
          name: "Netflix vorgemerkt",
          amountCents: -1_000n,
          fingerprint: "netflix",
        },
      ],
      recurring: [
        {
          date: "2026-08-20",
          name: "Netflix Prognose",
          amountCents: -1_050n,
          fingerprint: "netflix",
          cadence: "monthly",
        },
        {
          date: "2026-08-20",
          name: "Netflix anderer Betrag",
          amountCents: -1_500n,
          fingerprint: "netflix",
          cadence: "monthly",
        },
      ],
    });

    expect(forecast.events).toEqual([
      expect.objectContaining({ kind: "pending", amountCents: -1_000n }),
      expect.objectContaining({ kind: "recurring", amountCents: -1_500n }),
    ]);
    expect(forecast.endBalanceCents).toBe(97_500n);
  });

  it("includes the horizon boundary, excludes later events and applies variable spend after today", () => {
    const forecast = buildLiquidityForecast({
      today: "2026-08-17",
      openingBalanceCents: 100_000n,
      dailyVariableCents: -100n,
      horizonDays: 30,
      pending: [
        {
          date: "2026-09-16",
          name: "Am Horizont",
          amountCents: -2_000n,
          fingerprint: "boundary",
        },
        {
          date: "2026-09-17",
          name: "Nach Horizont",
          amountCents: -9_000n,
          fingerprint: "outside",
        },
      ],
      recurring: [],
    });

    expect(forecast.events.map((event) => event.name)).toEqual(["Am Horizont"]);
    expect(forecast.points[0].variableDeltaCents).toBe(0n);
    expect(forecast.points.at(-1)?.date).toBe("2026-09-16");
    expect(forecast.endBalanceCents).toBe(95_000n); // 30 × 1 € plus 20 € boundary event
    expect(forecast.typicalDailySpendCents).toBe(100n);
  });

  it("does not let a pending credit replace an expected debit", () => {
    const forecast = buildLiquidityForecast({
      today: "2026-08-17",
      openingBalanceCents: 100_000n,
      dailyVariableCents: 0n,
      pending: [
        {
          date: "2026-08-19",
          name: "Erstattung",
          amountCents: 65_000n,
          fingerprint: "airline",
        },
      ],
      recurring: [
        {
          date: "2026-08-20",
          name: "Flugabbuchung",
          amountCents: -65_000n,
          fingerprint: "airline",
          cadence: "monthly",
        },
      ],
    });

    expect(forecast.events).toHaveLength(2);
    expect(forecast.events).toContainEqual(
      expect.objectContaining({ kind: "pending", amountCents: 65_000n }),
    );
    expect(forecast.events).toContainEqual(
      expect.objectContaining({ kind: "recurring", amountCents: -65_000n }),
    );
    expect(forecast.endBalanceCents).toBe(100_000n);
  });

  it("projects a 14-day detector cycle without turning it into a 7-day cadence", () => {
    const forecast = buildLiquidityForecast({
      today: "2026-08-17",
      openingBalanceCents: 100_000n,
      dailyVariableCents: 0n,
      pending: [],
      recurring: [
        {
          date: "2026-08-18",
          name: "Vierzehntäglich",
          amountCents: -1_000n,
          fingerprint: "biweekly",
          cadence: "weekly",
          cycleDays: 14,
        },
      ],
    });

    expect(forecast.events.map((event) => event.date)).toEqual([
      "2026-08-18",
      "2026-09-01",
      "2026-09-15",
    ]);
    expect(forecast.endBalanceCents).toBe(97_000n);
  });
});

describe("buildSpendingDrivers", () => {
  it("compares equal periods, calculates changes and orders the strongest drivers", () => {
    const current: ExpenseBucket[] = [
      { key: "food", name: "Lebensmittel", amountCents: 13_000n, count: 3 },
      { key: "dining", name: "Restaurants", amountCents: 6_000n, count: 1 },
      { key: "travel", name: "Reisen", amountCents: 20_000n, count: 1 },
    ];
    const previous: ExpenseBucket[] = [
      { key: "food", name: "Lebensmittel", amountCents: 10_000n, count: 2 },
      { key: "dining", name: "Restaurants", amountCents: 10_000n, count: 2 },
    ];

    const result = buildSpendingDrivers(current, previous, {
      current: currentRange,
      previous: previousRange,
    });

    expect(result.currentTotalCents).toBe(39_000n);
    expect(result.previousTotalCents).toBe(20_000n);
    expect(result.deltaCents).toBe(19_000n);
    expect(result.deltaPct).toBeCloseTo(95);
    expect(result.currentRange).toEqual(currentRange);
    expect(result.previousRange).toEqual(previousRange);
    expect(result.drivers.map((driver) => driver.key)).toEqual([
      "category:travel",
      "category:dining",
      "category:food",
    ]);

    expect(result.drivers[0]).toMatchObject({
      deltaCents: 20_000n,
      deltaPct: null,
      direction: "new",
      cause: "new",
    });
    expect(result.drivers[1]).toMatchObject({
      deltaCents: -4_000n,
      direction: "down",
      cause: "frequency",
    });
    expect(result.drivers[1].deltaPct).toBeCloseTo(-40);
    expect(result.drivers[2]).toMatchObject({
      deltaCents: 3_000n,
      direction: "up",
      cause: "frequency",
    });
    expect(result.drivers[2].deltaPct).toBeCloseTo(30);
  });

  it("handles new, gone and zero baselines without Infinity or NaN", () => {
    const result = buildSpendingDrivers(
      [{ key: "new", name: "Neu", amountCents: 5_000n, count: 1 }],
      [{ key: "gone", name: "Entfallen", amountCents: 4_000n, count: 1 }],
      { current: currentRange, previous: previousRange },
    );

    expect(result.deltaPct).toBeCloseTo(25);
    expect(result.drivers.find((driver) => driver.key === "category:new")).toMatchObject({
      deltaPct: null,
      direction: "new",
      cause: "new",
    });
    expect(result.drivers.find((driver) => driver.key === "category:gone")).toMatchObject({
      deltaPct: -100,
      direction: "gone",
      cause: "gone",
    });

    const empty = buildSpendingDrivers([], [], {
      current: currentRange,
      previous: previousRange,
    });
    expect(empty.deltaPct).toBeNull();
    expect(empty.drivers).toEqual([]);
  });

  it("keeps category and merchant drivers separate without counting merchant subsets twice", () => {
    const result = buildSpendingDrivers(
      [
        { key: "food", name: "Lebensmittel", amountCents: 10_000n, count: 4, dimension: "category" },
        { key: "market", name: "Markt", amountCents: 6_000n, count: 3, dimension: "merchant" },
      ],
      [
        { key: "food", name: "Lebensmittel", amountCents: 8_000n, count: 3, dimension: "category" },
        { key: "market", name: "Markt", amountCents: 3_000n, count: 1, dimension: "merchant" },
      ],
      { current: currentRange, previous: previousRange },
    );

    expect(result.currentTotalCents).toBe(10_000n);
    expect(result.previousTotalCents).toBe(8_000n);
    expect(result.deltaCents).toBe(2_000n);
    expect(result.drivers).toEqual([
      expect.objectContaining({
        key: "category:food",
        dimension: "category",
        deltaCents: 2_000n,
      }),
    ]);
    expect(result.merchantDrivers).toEqual([
      expect.objectContaining({
        key: "merchant:market",
        dimension: "merchant",
        deltaCents: 3_000n,
      }),
    ]);
  });
});

describe("buildCashflowBreakdown", () => {
  it("allocates income and calculates rates, free cashflow and annual potential", () => {
    const result = buildCashflowBreakdown(
      {
        incomeCents: 300_000n,
        fixedCents: 100_000n,
        flexibleCents: 50_000n,
        savingCents: 40_000n,
      },
      {
        incomeCents: 900_000n,
        fixedCents: 300_000n,
        flexibleCents: 150_000n,
        savingCents: 120_000n,
      },
      90,
    );

    expect(result.freeCents).toBe(110_000n);
    expect(result.savingRate).toBeCloseTo(13.333333, 5);
    expect(result.fixedRate).toBeCloseTo(33.333333, 5);
    expect(result.annualPotentialCents).toBe(1_825_000n);
    expect(result.annualBasisDays).toBe(90);
  });

  it("returns no rates without income and no annual projection for a short history", () => {
    const result = buildCashflowBreakdown(
      {
        incomeCents: 0n,
        fixedCents: 10_000n,
        flexibleCents: 5_000n,
        savingCents: 0n,
      },
      {
        incomeCents: 0n,
        fixedCents: 10_000n,
        flexibleCents: 5_000n,
        savingCents: 0n,
      },
      44,
    );

    expect(result.freeCents).toBe(-15_000n);
    expect(result.savingRate).toBeNull();
    expect(result.fixedRate).toBeNull();
    expect(result.annualPotentialCents).toBeNull();
  });

  it("clamps annual saving potential to zero when ordinary cashflow is negative", () => {
    const result = buildCashflowBreakdown(
      {
        incomeCents: 100_000n,
        fixedCents: 80_000n,
        flexibleCents: 40_000n,
        savingCents: 10_000n,
      },
      {
        incomeCents: 300_000n,
        fixedCents: 250_000n,
        flexibleCents: 100_000n,
        savingCents: 60_000n,
      },
      90,
    );

    expect(result.freeCents).toBe(-30_000n);
    expect(result.annualPotentialCents).toBe(0n);
  });
});
