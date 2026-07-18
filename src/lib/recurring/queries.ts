import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, merchants, recurringItems, transactions } from "@/db/schema";
import { formatCents } from "@/lib/money";

const CADENCE_LABEL: Record<string, string> = {
  weekly: "wöchentlich",
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  yearly: "jährlich",
};

export interface RecurringDTO {
  id: string;
  merchantName: string;
  categoryColor: string;
  cadence: string;
  cadenceLabel: string;
  kind: string;
  monthlyEquivFmt: string;
  monthlyEquivAbs: number;
  amountLastFmt: string;
  nextExpectedDate: string | null;
  nextRelative: string | null;
  status: string;
  priceChanged: boolean;
}

export interface RecurringOverview {
  subscriptions: RecurringDTO[];
  income: RecurringDTO[];
  ended: RecurringDTO[];
  totalMonthlyFmt: string;
  activeCount: number;
}

function relative(dateISO: string | null): string | null {
  if (!dateISO) return null;
  const days = Math.round((Date.parse(dateISO) - Date.now()) / (24 * 3600 * 1000));
  if (days < -1) return `vor ${Math.abs(days)} Tagen`;
  if (days === -1) return "gestern";
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}

function toDTO(row: {
  id: string;
  merchantName: string | null;
  categoryColor: string | null;
  cadence: string;
  kind: string;
  monthlyEquivCents: bigint;
  amountLastCents: bigint;
  currency: string;
  nextExpectedDate: string | null;
  status: string;
  priceChangedAt: string | null;
}): RecurringDTO {
  return {
    id: row.id,
    merchantName: row.merchantName ?? "Unbekannt",
    categoryColor: row.categoryColor ?? "#94a3b8",
    cadence: row.cadence,
    cadenceLabel: CADENCE_LABEL[row.cadence] ?? row.cadence,
    kind: row.kind,
    monthlyEquivFmt: formatCents(row.monthlyEquivCents, row.currency),
    monthlyEquivAbs: Math.abs(Number(row.monthlyEquivCents)),
    amountLastFmt: formatCents(row.amountLastCents, row.currency),
    nextExpectedDate: row.nextExpectedDate,
    nextRelative: relative(row.nextExpectedDate),
    status: row.status,
    priceChanged:
      !!row.priceChangedAt &&
      Date.parse(row.priceChangedAt) > Date.now() - 90 * 24 * 3600 * 1000,
  };
}

export async function listRecurring(): Promise<RecurringOverview> {
  const rows = await db
    .select({
      id: recurringItems.id,
      merchantName: merchants.nameClean,
      categoryColor: categories.color,
      cadence: recurringItems.cadence,
      kind: recurringItems.kind,
      monthlyEquivCents: recurringItems.monthlyEquivCents,
      amountLastCents: recurringItems.amountLastCents,
      currency: recurringItems.currency,
      nextExpectedDate: recurringItems.nextExpectedDate,
      status: recurringItems.status,
      priceChangedAt: recurringItems.priceChangedAt,
    })
    .from(recurringItems)
    .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id))
    .leftJoin(categories, eq(merchants.defaultCategoryId, categories.id))
    .orderBy(desc(recurringItems.monthlyEquivCents));

  const all = rows.map(toDTO);
  const active = all.filter((r) => r.status !== "ended");

  const subscriptions = active
    .filter((r) => r.kind !== "income")
    .sort((a, b) => b.monthlyEquivAbs - a.monthlyEquivAbs);
  const income = active.filter((r) => r.kind === "income");
  const ended = all.filter((r) => r.status === "ended");

  const totalMonthlyCents = subscriptions.reduce((sum, r) => sum - BigInt(Math.round(r.monthlyEquivAbs)), 0n);

  return {
    subscriptions,
    income,
    ended,
    totalMonthlyFmt: formatCents(totalMonthlyCents),
    activeCount: subscriptions.length,
  };
}

export interface PaymentPoint {
  date: string;
  amountCents: number;
  amountFmt: string;
}

export async function getRecurringPayments(id: string): Promise<PaymentPoint[]> {
  const rows = await db
    .select({
      bookingDate: transactions.bookingDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
    })
    .from(transactions)
    .where(eq(transactions.recurringItemId, id))
    .orderBy(transactions.bookingDate);

  return rows.map((r) => ({
    date: r.bookingDate,
    amountCents: Number(r.amountCents),
    amountFmt: formatCents(r.amountCents, r.currency),
  }));
}
