import { and, eq, gte, lte, lt, sql, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, merchants, recurringItems, transactions } from "@/db/schema";
import { currentMonthWindow } from "./period";

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string;
  sumCents: bigint;
}
export interface TrendPoint {
  month: string;
  incomeCents: bigint;
  expenseCents: bigint;
}
export interface MerchantSlice {
  name: string;
  sumCents: bigint;
  count: number;
}
export interface UpcomingItem {
  name: string;
  date: string;
  amountCents: bigint;
}
export interface DashboardData {
  totalBalanceCents: bigint;
  incomeMonthCents: bigint;
  expensesMonthCents: bigint;
  subsMonthlyCents: bigint;
  byCategory: CategorySlice[];
  trend: TrendPoint[];
  topMerchants: MerchantSlice[];
  upcoming: UpcomingItem[];
  savingMonthCents: bigint;
  remainingFixedCents: bigint;
  realAvailableCents: bigint;
  periodFrom: string;
  periodTo: string;
}

function monthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
/** "YYYY-MM" rein arithmetisch (kein toISOString -> keine TZ-Verschiebung). */
function ymKey(year: number, monthIndex: number): string {
  const total = year * 12 + monthIndex;
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
/** Aggregierte Kennzahlen fürs Dashboard. `from`/`to` optional (Default: laufender Monat). */
export async function getDashboardData(
  today = new Date(),
  range?: { from: string; to: string },
): Promise<DashboardData> {
  const win = currentMonthWindow(today);
  const from = range?.from ?? win.from;
  const to = range?.to ?? win.to;
  const monthEnd = win.monthEnd;

  const notTransfer = eq(transactions.isTransfer, false);
  const inRange = and(gte(transactions.bookingDate, from), lte(transactions.bookingDate, to), notTransfer);

  // Gesamtsaldo (EUR; Fremdwährung 1:1 als Fallback bis fx_rates befüllt ist).
  const [bal] = await db
    .select({ sum: sql<string>`coalesce(sum(${bankAccounts.balanceCents}), 0)` })
    .from(bankAccounts);

  // Einnahmen / Ausgaben im Zeitraum — Spar-/ausgeschlossene/Transfer-Kategorien zählen nicht als Ausgabe.
  const excludedKinds = sql`coalesce(${categories.kind}, 'expense') in ('saving','excluded','transfer')`;
  const [flow] = await db
    .select({
      income: sql<string>`coalesce(sum(case when ${transactions.amountCents} > 0 and not (${excludedKinds}) then ${transactions.amountCents} else 0 end), 0)`,
      expense: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 and not (${excludedKinds}) then ${transactions.amountCents} else 0 end), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(inRange);

  // Monatliche Abo-Last (aktive, nicht Einkommen, nicht Sparen).
  const [subs] = await db
    .select({ sum: sql<string>`coalesce(sum(${recurringItems.monthlyEquivCents}), 0)` })
    .from(recurringItems)
    .where(and(eq(recurringItems.status, "active"), sql`${recurringItems.kind} not in ('income','saving')`));

  // Geplantes Sparen: monatliche Sparraten (z.B. Trade-Republic-Sparplan).
  const [savingPlan] = await db
    .select({ sum: sql<string>`coalesce(sum(${recurringItems.monthlyEquivCents}), 0)` })
    .from(recurringItems)
    .where(and(eq(recurringItems.status, "active"), sql`${recurringItems.kind} = 'saving'`));

  // Extra-Einzahlungen: Spar-Buchungen diesen Monat, die NICHT zu einem Spar-Item gehören
  // (z.B. zusätzlicher Trade-Republic-Einwurf für Aktienkäufe außerhalb des Sparplans).
  const savingItemIds = db
    .select({ id: recurringItems.id })
    .from(recurringItems)
    .where(sql`${recurringItems.kind} = 'saving'`);
  const [savingExtra] = await db
    .select({ sum: sql<string>`coalesce(sum(${transactions.amountCents}), 0)` })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        inRange,
        sql`coalesce(${categories.kind}, 'expense') = 'saving'`,
        sql`(${transactions.recurringItemId} is null or ${transactions.recurringItemId} not in ${savingItemIds})`,
      ),
    );
  const savingMonthCents = BigInt(savingPlan?.sum ?? "0") + BigInt(savingExtra?.sum ?? "0");

  // Fixkosten, die diesen Monat noch NICHT abgebucht wurden (heute < fällig ≤ Monatsende).
  const [remaining] = await db
    .select({
      sum: sql<string>`coalesce(sum(${recurringItems.amountLastCents}), 0)`,
    })
    .from(recurringItems)
    .where(
      and(
        eq(recurringItems.status, "active"),
        sql`${recurringItems.kind} <> 'income'`,
        sql`${recurringItems.nextExpectedDate} > ${to}`,
        sql`${recurringItems.nextExpectedDate} <= ${monthEnd}`,
      ),
    );
  const remainingFixedCents = BigInt(remaining?.sum ?? "0"); // negativ

  // Ausgaben nach Kategorie (auf Top-Level gerollt).
  const catRows = await db
    .select({ categoryId: transactions.categoryId, sum: sql<string>`sum(${transactions.amountCents})` })
    .from(transactions)
    .where(and(inRange, lt(transactions.amountCents, 0n), isNotNull(transactions.categoryId)))
    .groupBy(transactions.categoryId);

  const cats = await db.select().from(categories);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const rollup = new Map<string, bigint>();
  for (const r of catRows) {
    if (!r.categoryId) continue;
    const c = catById.get(r.categoryId);
    if (!c || c.kind === "transfer" || c.kind === "excluded" || c.kind === "saving") continue;
    const topId = c.parentId ?? c.id;
    rollup.set(topId, (rollup.get(topId) ?? 0n) + BigInt(r.sum));
  }
  const byCategory: CategorySlice[] = [...rollup.entries()].map(([categoryId, sumCents]) => {
    const c = catById.get(categoryId);
    return { categoryId, name: c?.name ?? "Sonstiges", color: c?.color ?? "#94a3b8", sumCents };
  });

  // Unkategorisierte Ausgaben als eigener Sammel-Slice, damit der Donut auch vor
  // der Kategorisierung etwas zeigt und sichtbar macht, was noch offen ist.
  const [uncat] = await db
    .select({ sum: sql<string>`coalesce(sum(${transactions.amountCents}), 0)` })
    .from(transactions)
    .where(and(inRange, lt(transactions.amountCents, 0n), isNull(transactions.categoryId), eq(transactions.isTransfer, false)));
  const uncatCents = BigInt(uncat?.sum ?? "0");
  if (uncatCents < 0n) {
    byCategory.push({ categoryId: "__uncat__", name: "Nicht kategorisiert", color: "var(--uncat)", sumCents: uncatCents });
  }

  byCategory.sort((a, b) => Number(a.sumCents - b.sumCents)); // negativ -> größte Ausgabe zuerst

  // 6-Monats-Trend.
  const trendFrom = `${ymKey(today.getFullYear(), today.getMonth() - 5)}-01`;
  const trendRows = await db
    .select({
      month: sql<string>`to_char(${transactions.bookingDate}::date, 'YYYY-MM')`,
      income: sql<string>`coalesce(sum(case when ${transactions.amountCents} > 0 and not (${excludedKinds}) then ${transactions.amountCents} else 0 end), 0)`,
      expense: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 and not (${excludedKinds}) then ${transactions.amountCents} else 0 end), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.bookingDate, trendFrom), notTransfer))
    .groupBy(sql`to_char(${transactions.bookingDate}::date, 'YYYY-MM')`);
  const trendMap = new Map(trendRows.map((r) => [r.month, r]));
  const trend: TrendPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const key = ymKey(today.getFullYear(), today.getMonth() - i);
    const r = trendMap.get(key);
    trend.push({
      month: key,
      incomeCents: BigInt(r?.income ?? "0"),
      expenseCents: BigInt(r?.expense ?? "0"),
    });
  }

  // Top-Händler (Ausgaben im Zeitraum).
  const topMerchants = (
    await db
      .select({
        name: sql<string>`coalesce(${merchants.nameClean}, ${transactions.counterpartyName}, 'Unbekannt')`,
        sum: sql<string>`sum(${transactions.amountCents})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(and(inRange, lt(transactions.amountCents, 0n)))
      .groupBy(sql`coalesce(${merchants.nameClean}, ${transactions.counterpartyName}, 'Unbekannt')`)
      .orderBy(sql`sum(${transactions.amountCents}) asc`)
      .limit(5)
  ).map((r) => ({ name: r.name, sumCents: BigInt(r.sum), count: r.count }));

  // Anstehende Abbuchungen — zeitunabhängig, nur die nächsten 2.
  const upcoming = (
    await db
      .select({
        name: merchants.nameClean,
        date: recurringItems.nextExpectedDate,
        amount: recurringItems.amountLastCents,
      })
      .from(recurringItems)
      .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id))
      .where(
        and(
          eq(recurringItems.status, "active"),
          sql`${recurringItems.kind} <> 'income'`,
          isNotNull(recurringItems.nextExpectedDate),
        ),
      )
      .orderBy(recurringItems.nextExpectedDate)
      .limit(2)
  ).map((r) => ({ name: r.name, date: r.date!, amountCents: r.amount }));

  return {
    totalBalanceCents: BigInt(bal?.sum ?? "0"),
    incomeMonthCents: BigInt(flow?.income ?? "0"),
    expensesMonthCents: BigInt(flow?.expense ?? "0"),
    subsMonthlyCents: BigInt(subs?.sum ?? "0"),
    byCategory,
    trend,
    topMerchants,
    upcoming,
    savingMonthCents,
    remainingFixedCents,
    realAvailableCents: BigInt(bal?.sum ?? "0") + remainingFixedCents,
    periodFrom: from,
    periodTo: to,
  };
}
