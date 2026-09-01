import { and, eq, gte, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccounts,
  categories,
  merchants,
  pendingTransactions,
  recurringItems,
  transactions,
  type Category,
} from "@/db/schema";
import { brandKeyOf, brandNameOf, fingerprintOf, unwrapPaypal } from "@/lib/classify/normalize";
import { analysisWindows, dateKeyDE, type AnalysisPeriod, type DateRange } from "./period";

const DAY_MS = 24 * 3600 * 1000;
const FORECAST_DAYS = 30;
const VARIABLE_HISTORY_DAYS = 90;
const PENDING_AMOUNT_TOLERANCE = 0.15;
const PENDING_DATE_TOLERANCE_DAYS = 5;

export interface ForecastPendingInput {
  date: string;
  name: string;
  amountCents: bigint;
  fingerprint: string;
}

export interface ForecastRecurringInput {
  date: string;
  name: string;
  amountCents: bigint;
  fingerprint: string;
  cadence: "weekly" | "bimonthly" | "monthly" | "quarterly" | "yearly";
  /** Weekly cadence may originate from a 7- or 14-day detector bucket. */
  cycleDays?: 7 | 14;
}

export interface ForecastEvent {
  date: string;
  name: string;
  amountCents: bigint;
  kind: "pending" | "recurring";
}

export interface LiquidityPoint {
  date: string;
  balanceCents: bigint;
  knownDeltaCents: bigint;
  variableDeltaCents: bigint;
}

export interface LiquidityForecast {
  openingBalanceCents: bigint;
  endBalanceCents: bigint;
  lowestBalanceCents: bigint;
  lowestDate: string;
  typicalDailySpendCents: bigint;
  points: LiquidityPoint[];
  events: ForecastEvent[];
}

export interface ExpenseBucket {
  key: string;
  name: string;
  amountCents: bigint;
  count: number;
  dimension?: "category" | "merchant";
}

export interface ExpenseDriver {
  key: string;
  name: string;
  currentCents: bigint;
  previousCents: bigint;
  deltaCents: bigint;
  deltaPct: number | null;
  currentCount: number;
  previousCount: number;
  dimension: "category" | "merchant";
  direction: "up" | "down" | "new" | "gone" | "flat";
  cause: "frequency" | "average" | "new" | "gone" | "mixed";
}

export interface SpendingDrivers {
  currentTotalCents: bigint;
  previousTotalCents: bigint;
  deltaCents: bigint;
  deltaPct: number | null;
  comparisonComplete: boolean;
  drivers: ExpenseDriver[];
  merchantDrivers: ExpenseDriver[];
  currentRange: DateRange;
  previousRange: DateRange;
}

export interface CashflowBuckets {
  incomeCents: bigint;
  fixedCents: bigint;
  flexibleCents: bigint;
  savingCents: bigint;
}

export interface CashflowBreakdown extends CashflowBuckets {
  freeCents: bigint;
  savingRate: number | null;
  fixedRate: number | null;
  annualPotentialCents: bigint | null;
  annualBasisDays: number;
}

export interface AnalysisInsights {
  forecast: LiquidityForecast;
  spending: SpendingDrivers;
  cashflow: CashflowBreakdown;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function isoUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return isoUtc(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS));
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function addMonthsClamped(iso: string, months: number): string {
  const source = new Date(`${iso}T00:00:00Z`);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return isoUtc(target);
}

function nextCadenceDate(
  date: string,
  cadence: ForecastRecurringInput["cadence"],
  cycleDays?: ForecastRecurringInput["cycleDays"],
): string {
  if (cadence === "weekly") return addDays(date, cycleDays ?? 7);
  if (cadence === "bimonthly") return addMonthsClamped(date, 2);
  if (cadence === "quarterly") return addMonthsClamped(date, 3);
  if (cadence === "yearly") return addMonthsClamped(date, 12);
  return addMonthsClamped(date, 1);
}

function sameExpectedPayment(pending: ForecastPendingInput, recurring: ForecastRecurringInput): boolean {
  if (!pending.fingerprint || pending.fingerprint !== recurring.fingerprint) return false;
  if ((pending.amountCents < 0n) !== (recurring.amountCents < 0n)) return false;
  if (Math.abs(diffDays(pending.date, recurring.date)) > PENDING_DATE_TOLERANCE_DAYS) return false;
  const recurringAmount = abs(recurring.amountCents);
  if (recurringAmount === 0n) return false;
  return Number(abs(abs(pending.amountCents) - recurringAmount)) / Number(recurringAmount) <= PENDING_AMOUNT_TOLERANCE;
}

/** Pure 30-Tage-Prognose; Datenzugriff erfolgt separat in getLiquidityForecast. */
export function buildLiquidityForecast(input: {
  today: string;
  openingBalanceCents: bigint;
  pending: ForecastPendingInput[];
  recurring: ForecastRecurringInput[];
  dailyVariableCents: bigint;
  horizonDays?: number;
}): LiquidityForecast {
  const horizonDays = input.horizonDays ?? FORECAST_DAYS;
  const end = addDays(input.today, horizonDays);
  const pending = input.pending
    .filter((event) => event.date <= end)
    .map((event) => ({ ...event, date: event.date < input.today ? input.today : event.date }));

  const recurringEvents: ForecastRecurringInput[] = [];
  for (const recurring of input.recurring) {
    let date = recurring.date;
    let guard = 0;
    while (date < input.today && guard++ < 100) {
      date = nextCadenceDate(date, recurring.cadence, recurring.cycleDays);
    }
    while (date <= end && guard++ < 100) {
      recurringEvents.push({ ...recurring, date });
      date = nextCadenceDate(date, recurring.cadence, recurring.cycleDays);
    }
  }

  // Ein Pending darf genau einen passenden prognostizierten Termin ersetzen.
  const usedPending = new Set<number>();
  const dedupedRecurring = recurringEvents.filter((recurring) => {
    const match = pending.findIndex(
      (candidate, index) => !usedPending.has(index) && sameExpectedPayment(candidate, recurring),
    );
    if (match < 0) return true;
    usedPending.add(match);
    return false;
  });

  const events: ForecastEvent[] = [
    ...pending.map((event) => ({
      date: event.date,
      name: event.name,
      amountCents: event.amountCents,
      kind: "pending" as const,
    })),
    ...dedupedRecurring.map((event) => ({
      date: event.date,
      name: event.name,
      amountCents: event.amountCents,
      kind: "recurring" as const,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || Number(a.amountCents - b.amountCents));

  const eventsByDate = new Map<string, bigint>();
  for (const event of events) {
    eventsByDate.set(event.date, (eventsByDate.get(event.date) ?? 0n) + event.amountCents);
  }

  let balance = input.openingBalanceCents;
  let lowestBalance = balance;
  let lowestDate = input.today;
  const points: LiquidityPoint[] = [];
  for (let offset = 0; offset <= horizonDays; offset++) {
    const date = addDays(input.today, offset);
    const knownDelta = eventsByDate.get(date) ?? 0n;
    const variableDelta = offset === 0 ? 0n : input.dailyVariableCents;
    balance += knownDelta + variableDelta;
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestDate = date;
    }
    points.push({ date, balanceCents: balance, knownDeltaCents: knownDelta, variableDeltaCents: variableDelta });
  }

  return {
    openingBalanceCents: input.openingBalanceCents,
    endBalanceCents: balance,
    lowestBalanceCents: lowestBalance,
    lowestDate,
    typicalDailySpendCents: abs(input.dailyVariableCents),
    points,
    events,
  };
}

function driverCause(
  currentCents: bigint,
  previousCents: bigint,
  currentCount: number,
  previousCount: number,
): ExpenseDriver["cause"] {
  if (previousCents === 0n && currentCents > 0n) return "new";
  if (currentCents === 0n && previousCents > 0n) return "gone";
  if (currentCount === 0 || previousCount === 0) return "mixed";
  const currentAverage = Number(currentCents) / currentCount;
  const previousAverage = Number(previousCents) / previousCount;
  const frequencyEffect = (currentCount - previousCount) * previousAverage;
  const averageEffect = currentCount * (currentAverage - previousAverage);
  return Math.abs(frequencyEffect) >= Math.abs(averageEffect) ? "frequency" : "average";
}

export function buildSpendingDrivers(
  current: ExpenseBucket[],
  previous: ExpenseBucket[],
  ranges: { current: DateRange; previous: DateRange },
  comparisonComplete = true,
): SpendingDrivers {
  const mapKey = (bucket: ExpenseBucket) => `${bucket.dimension ?? "category"}:${bucket.key}`;
  const currentByKey = new Map(current.map((bucket) => [mapKey(bucket), bucket]));
  const previousByKey = new Map(previous.map((bucket) => [mapKey(bucket), bucket]));
  const keys = new Set([...currentByKey.keys(), ...previousByKey.keys()]);
  const drivers: ExpenseDriver[] = [];

  for (const key of keys) {
    const currentBucket = currentByKey.get(key);
    const previousBucket = previousByKey.get(key);
    const currentCents = currentBucket?.amountCents ?? 0n;
    const previousCents = previousBucket?.amountCents ?? 0n;
    const deltaCents = currentCents - previousCents;
    const currentCount = currentBucket?.count ?? 0;
    const previousCount = previousBucket?.count ?? 0;
    const direction: ExpenseDriver["direction"] =
      previousCents === 0n && currentCents > 0n
        ? "new"
        : currentCents === 0n && previousCents > 0n
          ? "gone"
          : deltaCents > 0n
            ? "up"
            : deltaCents < 0n
              ? "down"
              : "flat";
    drivers.push({
      key,
      name: currentBucket?.name ?? previousBucket?.name ?? "Sonstiges",
      currentCents,
      previousCents,
      deltaCents,
      deltaPct: previousCents > 0n ? (Number(deltaCents) / Number(previousCents)) * 100 : null,
      currentCount,
      previousCount,
      dimension: currentBucket?.dimension ?? previousBucket?.dimension ?? "category",
      direction,
      cause: driverCause(currentCents, previousCents, currentCount, previousCount),
    });
  }

  drivers.sort((a, b) => Number(abs(b.deltaCents) - abs(a.deltaCents)));
  const currentTotalCents = current
    .filter((bucket) => (bucket.dimension ?? "category") === "category")
    .reduce((sum, bucket) => sum + bucket.amountCents, 0n);
  const previousTotalCents = previous
    .filter((bucket) => (bucket.dimension ?? "category") === "category")
    .reduce((sum, bucket) => sum + bucket.amountCents, 0n);
  const deltaCents = currentTotalCents - previousTotalCents;
  return {
    currentTotalCents,
    previousTotalCents,
    deltaCents,
    deltaPct: previousTotalCents > 0n ? (Number(deltaCents) / Number(previousTotalCents)) * 100 : null,
    comparisonComplete,
    drivers: drivers
      .filter((driver) => driver.dimension === "category" && driver.deltaCents !== 0n)
      .slice(0, 5),
    merchantDrivers: drivers
      .filter((driver) => driver.dimension === "merchant" && driver.deltaCents !== 0n)
      .slice(0, 3),
    currentRange: ranges.current,
    previousRange: ranges.previous,
  };
}

export function buildCashflowBreakdown(
  selected: CashflowBuckets,
  annualBasis: CashflowBuckets,
  annualBasisDays: number,
): CashflowBreakdown {
  const freeCents = selected.incomeCents - selected.fixedCents - selected.flexibleCents - selected.savingCents;
  const annualSavingBaseRaw =
    annualBasis.incomeCents - annualBasis.fixedCents - annualBasis.flexibleCents;
  const annualSavingBase = annualSavingBaseRaw > 0n ? annualSavingBaseRaw : 0n;
  const annualPotentialCents =
    annualBasisDays >= 45
      ? BigInt(Math.round((Number(annualSavingBase) / annualBasisDays) * 365))
      : null;
  return {
    ...selected,
    freeCents,
    savingRate: selected.incomeCents > 0n ? (Number(selected.savingCents) / Number(selected.incomeCents)) * 100 : null,
    fixedRate: selected.incomeCents > 0n ? (Number(selected.fixedCents) / Number(selected.incomeCents)) * 100 : null,
    annualPotentialCents,
    annualBasisDays,
  };
}

function cleanPendingName(name: string | null, purpose: string | null): string {
  return (
    unwrapPaypal(name, purpose)?.merchant ??
    brandNameOf(name, purpose) ??
    name ??
    purpose ??
    "Vorgemerkte Zahlung"
  );
}

async function getLiquidityForecast(today: Date): Promise<LiquidityForecast> {
  const todayIso = dateKeyDE(today);
  const historyFrom = addDays(todayIso, -(VARIABLE_HISTORY_DAYS - 1));
  const ordinaryExpense = sql`coalesce(${categories.kind}, 'expense') not in ('saving','excluded','transfer')`;
  const [[balance], pendingRows, recurringRows, [variable], [firstHistory]] = await Promise.all([
    db.select({ sum: sql<string>`coalesce(sum(${bankAccounts.balanceCents}), 0)` }).from(bankAccounts),
    db
      .select({
        date: pendingTransactions.bookingDate,
        name: pendingTransactions.counterpartyName,
        purpose: pendingTransactions.purpose,
        amount: pendingTransactions.amountCents,
      })
      .from(pendingTransactions),
    db
      .select({
        date: recurringItems.nextExpectedDate,
        name: merchants.nameClean,
        amount: recurringItems.amountLastCents,
        amountMedian: recurringItems.amountMedianCents,
        monthlyEquiv: recurringItems.monthlyEquivCents,
        fingerprint: merchants.fingerprint,
        cadence: recurringItems.cadence,
      })
      .from(recurringItems)
      .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id))
      .where(and(eq(recurringItems.status, "active"), isNotNull(recurringItems.nextExpectedDate))),
    db
      .select({ sum: sql<string>`coalesce(sum(${transactions.amountCents}), 0)` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          gte(transactions.bookingDate, historyFrom),
          lte(transactions.bookingDate, todayIso),
          lt(transactions.amountCents, 0n),
          eq(transactions.isTransfer, false),
          isNull(transactions.recurringItemId),
          ordinaryExpense,
        ),
      ),
    db
      .select({ min: sql<string | null>`min(${transactions.bookingDate})` })
      .from(transactions)
      .where(
        and(
          gte(transactions.bookingDate, historyFrom),
          lte(transactions.bookingDate, todayIso),
          eq(transactions.isTransfer, false),
        ),
      ),
  ]);

  const historyDays = firstHistory?.min ? Math.max(1, diffDays(firstHistory.min, todayIso) + 1) : 1;
  const variableTotal = BigInt(variable?.sum ?? "0");
  const dailyVariableCents = BigInt(Math.round(Number(variableTotal) / historyDays));

  return buildLiquidityForecast({
    today: todayIso,
    openingBalanceCents: BigInt(balance?.sum ?? "0"),
    dailyVariableCents,
    pending: pendingRows.map((row) => ({
      date: row.date,
      name: cleanPendingName(row.name, row.purpose),
      amountCents: row.amount,
      fingerprint: brandKeyOf(fingerprintOf(row.name, row.purpose)),
    })),
    recurring: recurringRows
      .filter((row): row is typeof row & { date: string } => row.date !== null)
      .map((row) => ({
        date: row.date,
        name: row.name,
        amountCents: row.amount,
        fingerprint: brandKeyOf(row.fingerprint),
        cadence: row.cadence,
        cycleDays:
          row.cadence === "weekly"
            ? Number(abs(row.monthlyEquiv)) / Math.max(Number(abs(row.amountMedian)), 1) < 3
              ? 14
              : 7
            : undefined,
      })),
  });
}

async function getExpenseBuckets(range: DateRange, categoryRows: Category[]): Promise<ExpenseBucket[]> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      merchantId: transactions.merchantId,
      merchantName: merchants.nameClean,
      sum: sql<string>`sum(${transactions.amountCents})`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(
      and(
        gte(transactions.bookingDate, range.from),
        lte(transactions.bookingDate, range.to),
        lt(transactions.amountCents, 0n),
        eq(transactions.isTransfer, false),
      ),
    )
    .groupBy(transactions.categoryId, transactions.merchantId, merchants.nameClean);

  const byId = new Map(categoryRows.map((category) => [category.id, category]));
  const buckets = new Map<string, ExpenseBucket>();
  for (const row of rows) {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined;
    if (category && ["saving", "excluded", "transfer"].includes(category.kind)) continue;
    const key = category ? category.parentId ?? category.id : "__uncat__";
    const top = category ? byId.get(key) ?? category : undefined;
    const current = buckets.get(key) ?? {
      key,
      name: top?.name ?? "Nicht kategorisiert",
      amountCents: 0n,
      count: 0,
    };
    current.amountCents += abs(BigInt(row.sum));
    current.count += row.count;
    buckets.set(key, current);

    if (row.merchantId && row.merchantName) {
      const merchantKey = `merchant:${row.merchantId}`;
      const merchant = buckets.get(merchantKey) ?? {
        key: merchantKey,
        name: row.merchantName,
        amountCents: 0n,
        count: 0,
        dimension: "merchant" as const,
      };
      merchant.amountCents += abs(BigInt(row.sum));
      merchant.count += row.count;
      buckets.set(merchantKey, merchant);
    }
  }
  return [...buckets.values()];
}

async function getCashflowBuckets(range: DateRange): Promise<CashflowBuckets> {
  const ordinary = sql`coalesce(${categories.kind}, 'expense') not in ('saving','excluded','transfer')`;
  const fixed = sql`${transactions.recurringItemId} is not null and coalesce(${recurringItems.kind}::text, '') not in ('income','saving')`;
  const [row] = await db
    .select({
      income: sql<string>`coalesce(sum(case when ${transactions.amountCents} > 0 and ${ordinary} then ${transactions.amountCents} else 0 end), 0)`,
      fixed: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 and ${ordinary} and ${fixed} then -${transactions.amountCents} else 0 end), 0)`,
      flexible: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 and ${ordinary} and not (${fixed}) then -${transactions.amountCents} else 0 end), 0)`,
      saving: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 and ${categories.kind} = 'saving' then -${transactions.amountCents} else 0 end), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(recurringItems, eq(transactions.recurringItemId, recurringItems.id))
    .where(
      and(
        gte(transactions.bookingDate, range.from),
        lte(transactions.bookingDate, range.to),
        eq(transactions.isTransfer, false),
      ),
    );
  return {
    incomeCents: BigInt(row?.income ?? "0"),
    fixedCents: BigInt(row?.fixed ?? "0"),
    flexibleCents: BigInt(row?.flexible ?? "0"),
    savingCents: BigInt(row?.saving ?? "0"),
  };
}

export async function getAnalysisInsights(
  today = new Date(),
  period: AnalysisPeriod = "month",
): Promise<AnalysisInsights> {
  const windows = analysisWindows(today, period);
  const todayIso = dateKeyDE(today);
  const annualRange = { from: addDays(todayIso, -(VARIABLE_HISTORY_DAYS - 1)), to: todayIso };
  const ordinaryExpense = sql`coalesce(${categories.kind}, 'expense') not in ('saving','excluded','transfer')`;
  const categoryRows = await db.select().from(categories);
  const [
    forecast,
    currentBuckets,
    previousBuckets,
    selectedCashflow,
    annualCashflow,
    [annualFirst],
    [firstExpense],
  ] =
    await Promise.all([
      getLiquidityForecast(today),
      getExpenseBuckets(windows.current, categoryRows),
      getExpenseBuckets(windows.previous, categoryRows),
      getCashflowBuckets(windows.current),
      getCashflowBuckets(annualRange),
      db
        .select({ min: sql<string | null>`min(${transactions.bookingDate})` })
        .from(transactions)
        .where(
          and(
            gte(transactions.bookingDate, annualRange.from),
            lte(transactions.bookingDate, annualRange.to),
            eq(transactions.isTransfer, false),
          ),
        ),
      db
        .select({ min: sql<string | null>`min(${transactions.bookingDate})` })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            lt(transactions.amountCents, 0n),
            eq(transactions.isTransfer, false),
            ordinaryExpense,
          ),
        ),
    ]);
  const annualBasisDays = annualFirst?.min ? Math.max(1, diffDays(annualFirst.min, todayIso) + 1) : 0;
  const comparisonComplete = Boolean(firstExpense?.min && firstExpense.min <= windows.previous.from);
  return {
    forecast,
    spending: buildSpendingDrivers(currentBuckets, previousBuckets, windows, comparisonComplete),
    cashflow: buildCashflowBreakdown(selectedCashflow, annualCashflow, annualBasisDays),
  };
}
