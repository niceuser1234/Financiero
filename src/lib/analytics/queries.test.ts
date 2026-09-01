import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccounts,
  categories,
  merchants,
  pendingTransactions,
  recurringItems,
  transactions,
} from "@/db/schema";
import { importHash } from "@/lib/import/hash";
import { fingerprintOf } from "@/lib/classify/normalize";
import { getDashboardData } from "./queries";
import { currentMonthWindow } from "./period";

const MARK = `__antest_${crypto.randomUUID()}__`;
let accountId = "";
let foodId = "";
let baseDashboard: Awaited<ReturnType<typeof getDashboardData>>;

async function tx(date: string, cents: bigint, catId?: string, transfer = false) {
  await db.insert(transactions).values({
    accountId,
    bookingDate: date,
    amountCents: cents,
    currency: "EUR",
    counterpartyName: MARK,
    categoryId: catId,
    isTransfer: transfer,
    importHash: importHash({ accountId, bookingDate: date, amountCents: cents, currency: "EUR", counterparty: MARK, purpose: date + cents }),
  });
}

describe("getDashboardData", () => {
  beforeAll(async () => {
    baseDashboard = await getDashboardData(new Date("2026-07-25"));
    const [a] = await db.insert(bankAccounts).values({ name: MARK, type: "checking", currency: "EUR", balanceCents: 123456n }).returning();
    accountId = a.id;
    const [food] = await db.select().from(categories).where(eq(categories.slug, "lebensmittel-supermarkt"));
    foodId = food.id;
    await tx("2026-07-05", -3000n, foodId);
    await tx("2026-07-10", -2000n, foodId);
    await tx("2026-07-12", -1500n); // unkategorisierte Ausgabe
    await tx("2026-07-15", 250000n);
    await tx("2026-07-20", -100000n, undefined, true); // Umbuchung -> ausgeschlossen
  });

  afterAll(async () => {
    await db.delete(transactions).where(eq(transactions.accountId, accountId));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
  });

  it("computes month income and expenses excluding transfers", async () => {
    const d = await getDashboardData(new Date("2026-07-25"));
    expect(d.incomeMonthCents - baseDashboard.incomeMonthCents).toBe(250000n);
    expect(d.expensesMonthCents - baseDashboard.expensesMonthCents).toBe(-6500n); // Umbuchung -100000 nicht enthalten
  });

  it("rolls expenses up to the top-level category", async () => {
    const d = await getDashboardData(new Date("2026-07-25"));
    const food = d.byCategory.find((c) => c.name === "Lebensmittel");
    const baseFood = baseDashboard.byCategory.find((c) => c.name === "Lebensmittel")?.sumCents ?? 0n;
    expect((food?.sumCents ?? 0n) - baseFood).toBe(-5000n);
  });

  it("adds an uncategorized-expenses slice, excluding transfers", async () => {
    const d = await getDashboardData(new Date("2026-07-25"));
    const uncat = d.byCategory.find((c) => c.name === "Nicht kategorisiert");
    const baseUncat = baseDashboard.byCategory.find((c) => c.name === "Nicht kategorisiert")?.sumCents ?? 0n;
    expect((uncat?.sumCents ?? 0n) - baseUncat).toBe(-1500n); // nur die -1500 Ausgabe, nicht die Umbuchung
  });

  it("returns a 6-month trend ending in the current month", async () => {
    const d = await getDashboardData(new Date("2026-07-25"));
    expect(d.trend).toHaveLength(6);
    expect(d.trend[5].month).toBe("2026-07");
    const baseJuly = baseDashboard.trend.find((point) => point.month === "2026-07")?.incomeCents ?? 0n;
    expect(d.trend[5].incomeCents - baseJuly).toBe(250000n);
  });
});

describe("getDashboardData: upcoming (zeitunabhängig, nächste 2)", () => {
  const MARK2 = `__antest_upcoming_${crypto.randomUUID()}__`;
  let merchantId = "";
  let itemIds: string[] = [];

  beforeAll(async () => {
    const [m] = await db
      .insert(merchants)
      .values({ fingerprint: MARK2, nameClean: MARK2 })
      .returning();
    merchantId = m.id;

    const seeds = [
      { nextExpectedDate: "2026-01-20", cadence: "monthly" as const },
      { nextExpectedDate: "2026-02-05", cadence: "quarterly" as const },
      { nextExpectedDate: "2026-03-01", cadence: "yearly" as const },
    ];
    const rows = await db
      .insert(recurringItems)
      .values(
        seeds.map(({ nextExpectedDate, cadence }) => ({
          merchantId,
          cadence,
          kind: "subscription" as const,
          amountLastCents: -999n,
          amountMedianCents: -999n,
          monthlyEquivCents: -999n,
          currency: "EUR",
          nextExpectedDate,
          status: "active" as const,
          firstSeen: "2026-01-01",
          lastSeen: "2026-07-01",
        })),
      )
      .returning();
    itemIds = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await db.delete(recurringItems).where(eq(recurringItems.merchantId, merchantId));
    await db.delete(merchants).where(eq(merchants.id, merchantId));
  });

  it("gibt die nächsten 2 Abbuchungen zeitunabhängig zurück, sortiert aufsteigend", async () => {
    expect(itemIds).toHaveLength(3);
    const d = await getDashboardData(new Date("2026-07-21"));
    const matching = d.upcoming.filter((item) => item.kind === "recurring" && item.name === MARK2);
    expect(matching).toHaveLength(2);
    expect(Date.parse(matching[0].date)).toBeLessThanOrEqual(Date.parse(matching[1].date));
    expect(matching[0].date).toBe("2026-01-20");
    expect(matching[1].date).toBe("2026-02-05");
  });
});

describe("getDashboardData: Sparen zählt nicht als Ausgabe", () => {
  const MARK3 = `__antest_saving_${crypto.randomUUID()}__`;
  let accountId3 = "";
  let savingCatId = "";
  let foodCatId = "";
  // Die lokale DB enthält reale Sparen-/Ausgaben-Buchungen (kein isoliertes Test-Schema) — daher
  // per Delta statt absoluter Summe prüfen, damit der Test robust gegen Fremddaten ist.
  let baseline: Awaited<ReturnType<typeof getDashboardData>>;

  async function tx3(date: string, cents: bigint, catId: string) {
    await db.insert(transactions).values({
      accountId: accountId3,
      bookingDate: date,
      amountCents: cents,
      currency: "EUR",
      counterpartyName: MARK3,
      categoryId: catId,
      isTransfer: false,
      importHash: importHash({
        accountId: accountId3,
        bookingDate: date,
        amountCents: cents,
        currency: "EUR",
        counterparty: MARK3,
        purpose: date + cents,
      }),
    });
  }

  beforeAll(async () => {
    baseline = await getDashboardData(new Date("2026-07-21"), { from: "2026-07-01", to: "2026-07-31" });

    const [a] = await db
      .insert(bankAccounts)
      .values({ name: MARK3, type: "checking", currency: "EUR", balanceCents: 0n })
      .returning();
    accountId3 = a.id;

    const [saving] = await db.select().from(categories).where(eq(categories.slug, "sparen-investieren-sparen"));
    const [food] = await db.select().from(categories).where(eq(categories.slug, "lebensmittel-supermarkt"));
    savingCatId = saving.id;
    foodCatId = food.id;

    await tx3("2026-07-10", -10000n, savingCatId);
    await tx3("2026-07-11", -2000n, foodCatId);
  });

  afterAll(async () => {
    await db.delete(transactions).where(eq(transactions.accountId, accountId3));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId3));
  });

  it("savingMonthCents erfasst Sparen, expensesMonthCents schließt es aus", async () => {
    const d = await getDashboardData(new Date("2026-07-21"), { from: "2026-07-01", to: "2026-07-31" });
    expect(d.savingMonthCents - baseline.savingMonthCents).toBe(-10000n);
    expect(d.expensesMonthCents - baseline.expensesMonthCents).toBe(-2000n);
  });

  it("byCategory (Donut) enthält keinen Slice für Sparen, wohl aber für Lebensmittel", async () => {
    const d = await getDashboardData(new Date("2026-07-21"), { from: "2026-07-01", to: "2026-07-31" });
    expect(d.byCategory.find((c) => c.name === "Sparen & Investieren")).toBeUndefined();
    const baselineFood = baseline.byCategory.find((c) => c.name === "Lebensmittel")?.sumCents ?? 0n;
    const food = d.byCategory.find((c) => c.name === "Lebensmittel")?.sumCents ?? 0n;
    expect(food - baselineFood).toBe(-2000n);
  });

  it("Trend des aktuellen Monats schließt Sparen aus", async () => {
    const d = await getDashboardData(new Date("2026-07-21"), { from: "2026-07-01", to: "2026-07-31" });
    const current = d.trend.find((t) => t.month === "2026-07")?.expenseCents ?? 0n;
    const baselineCurrent = baseline.trend.find((t) => t.month === "2026-07")?.expenseCents ?? 0n;
    expect(current - baselineCurrent).toBe(-2000n); // nur Lebensmittel, nicht die -10000 Sparen-Buchung
  });
});

// Pure guard: remaining window is (to, monthEnd]. A charge due today is already counted
// in the balance, one due after month-end belongs to next month.
describe("remaining-fixed window", () => {
  it("only includes charges strictly after today, up to month end", () => {
    const w = currentMonthWindow(new Date("2026-07-21T00:00:00Z"));
    const due = "2026-07-25";
    expect(due > w.to && due <= w.monthEnd).toBe(true);
    expect("2026-07-21" > w.to).toBe(false); // today excluded
    expect("2026-08-01" <= w.monthEnd).toBe(false); // next month excluded
  });
});

describe("getDashboardData: remainingFixedCents / realAvailableCents", () => {
  const MARK4 = `__antest_remaining_${crypto.randomUUID()}__`;
  let accountId4 = "";
  let merchantId4 = "";
  // Die lokale DB enthält reale Fixkosten-Termine (kein isoliertes Test-Schema) — daher
  // per Delta statt absoluter Summe prüfen, damit der Test robust gegen Fremddaten ist.
  let baseline: Awaited<ReturnType<typeof getDashboardData>>;

  beforeAll(async () => {
    baseline = await getDashboardData(new Date("2026-07-21"));

    const [a] = await db
      .insert(bankAccounts)
      .values({ name: MARK4, type: "checking", currency: "EUR", balanceCents: 100000n })
      .returning();
    accountId4 = a.id;

    const [m] = await db.insert(merchants).values({ fingerprint: MARK4, nameClean: MARK4 }).returning();
    merchantId4 = m.id;

    await db.insert(recurringItems).values([
      {
        merchantId: merchantId4,
        cadence: "monthly",
        kind: "subscription",
        amountLastCents: -1500n,
        amountMedianCents: -1500n,
        monthlyEquivCents: -1500n,
        currency: "EUR",
        nextExpectedDate: "2026-07-25", // strictly after "to" (2026-07-21), before month end -> included
        status: "active",
        firstSeen: "2026-01-01",
        lastSeen: "2026-06-01",
      },
      {
        merchantId: merchantId4,
        cadence: "quarterly",
        kind: "subscription",
        amountLastCents: -2500n,
        amountMedianCents: -2500n,
        monthlyEquivCents: -2500n,
        currency: "EUR",
        nextExpectedDate: "2026-07-21", // == "to" -> excluded (already accounted for in balance)
        status: "active",
        firstSeen: "2026-01-01",
        lastSeen: "2026-06-01",
      },
      {
        merchantId: merchantId4,
        cadence: "yearly",
        kind: "subscription",
        amountLastCents: -5000n,
        amountMedianCents: -5000n,
        monthlyEquivCents: -5000n,
        currency: "EUR",
        nextExpectedDate: "2026-08-01", // next month -> excluded
        status: "active",
        firstSeen: "2026-01-01",
        lastSeen: "2026-06-01",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(recurringItems).where(eq(recurringItems.merchantId, merchantId4));
    await db.delete(merchants).where(eq(merchants.id, merchantId4));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId4));
  });

  it("sums only recurring charges strictly after today up to month end", async () => {
    const d = await getDashboardData(new Date("2026-07-21"));
    // Nur der Termin am 07-25 (strikt nach "to", vor Monatsende) schlägt zu Buche;
    // 07-21 (== to) und 08-01 (nächster Monat) bleiben außen vor.
    expect(d.remainingFixedCents - baseline.remainingFixedCents).toBe(-1500n);
  });

  it("realAvailableCents = totalBalanceCents + pendingDebitsCents + remainingFixedCents", async () => {
    const d = await getDashboardData(new Date("2026-07-21"));
    expect(d.realAvailableCents).toBe(
      d.totalBalanceCents + d.pendingDebitsCents + d.remainingFixedCents,
    );
  });

  it("exposes periodFrom/periodTo matching the default window", async () => {
    const d = await getDashboardData(new Date("2026-07-21"));
    expect(d.periodFrom).toBe("2026-07-01");
    expect(d.periodTo).toBe("2026-07-21");
  });
});

describe("getDashboardData: vorgemerkte Belastungen", () => {
  const MARK5 = `__antest_pending_${crypto.randomUUID()}__`;
  let accountId5 = "";
  let merchantId5 = "";
  let baseline: Awaited<ReturnType<typeof getDashboardData>>;

  beforeAll(async () => {
    baseline = await getDashboardData(new Date("2026-08-17"));
    const [account] = await db
      .insert(bankAccounts)
      .values({ name: MARK5, type: "checking", currency: "EUR", balanceCents: 100000n })
      .returning();
    accountId5 = account.id;
    const [merchant] = await db
      .insert(merchants)
      .values({ fingerprint: fingerprintOf(MARK5, null), nameClean: MARK5 })
      .returning();
    merchantId5 = merchant.id;

    await db.insert(pendingTransactions).values({
      accountId: accountId5,
      bookingDate: "2026-08-17",
      amountCents: -65200n,
      currency: "EUR",
      counterpartyName: MARK5,
      purpose: "Flugbuchung",
      importHash: `pending-${crypto.randomUUID()}`,
    });
    await db.insert(recurringItems).values({
      merchantId: merchantId5,
      cadence: "monthly",
      kind: "contract",
      amountLastCents: -65200n,
      amountMedianCents: -65200n,
      monthlyEquivCents: -65200n,
      currency: "EUR",
      nextExpectedDate: "2026-08-20",
      status: "active",
      firstSeen: "2026-05-20",
      lastSeen: "2026-07-20",
    });
  });

  afterAll(async () => {
    await db.delete(pendingTransactions).where(eq(pendingTransactions.accountId, accountId5));
    await db.delete(recurringItems).where(eq(recurringItems.merchantId, merchantId5));
    await db.delete(merchants).where(eq(merchants.id, merchantId5));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId5));
  });

  it("reduziert den real verfügbaren Betrag, ohne die passende Fixkostenprognose doppelt zu zählen", async () => {
    const d = await getDashboardData(new Date("2026-08-17"));

    expect(d.pendingDebitsCents - baseline.pendingDebitsCents).toBe(-65200n);
    expect(d.remainingFixedCents - baseline.remainingFixedCents).toBe(0n);
    expect(d.realAvailableCents - baseline.realAvailableCents).toBe(34800n);
  });

  it("zeigt die Bankvormerkung statt einer doppelten Prognose in den anstehenden Abbuchungen", async () => {
    const d = await getDashboardData(new Date("2026-08-17"));
    const matching = d.upcoming.filter((item) => item.name === MARK5);

    expect(matching).toHaveLength(1);
    expect(matching[0].kind).toBe("pending");
    expect(matching[0].amountCents).toBe(-65200n);
  });
});
