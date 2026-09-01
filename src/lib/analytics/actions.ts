"use server";

import { db } from "@/db";
import { connections } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { formatCents } from "@/lib/money";
import { getDashboardData } from "./queries";
import { analysisWindows, monthLabelDE, type AnalysisPeriod } from "./period";
import { getAnalysisInsights, type ExpenseDriver } from "./insights";
import type { DonutSlice } from "@/components/charts/category-donut";
import type { TrendBar } from "@/components/charts/trend-bars";

export interface AnalyticsDTO {
  totalBalanceFmt: string;
  incomeFmt: string;
  expensesFmt: string;
  subsFmt: string;
  savingFmt: string;
  realAvailableFmt: string;
  remainingFixedFmt: string;
  pendingDebitsFmt: string;
  periodLabel: string;
  periodProgressLabel: string;
  donut: DonutSlice[];
  trend: TrendBar[];
  topMerchants: { name: string; fmt: string; count: number }[];
  upcoming: { name: string; date: string; dateFmt: string; fmt: string; kind: "pending" | "recurring" }[];
}

export interface LiquidityForecastDTO {
  openingFmt: string;
  endFmt: string;
  lowestFmt: string;
  lowestDateFmt: string;
  typicalDailySpendFmt: string;
  atRisk: boolean;
  points: {
    date: string;
    label: string;
    balance: number;
    balanceFmt: string;
    knownDeltaFmt: string | null;
  }[];
  events: {
    date: string;
    dateFmt: string;
    name: string;
    amountFmt: string;
    tone: "income" | "expense";
    kind: "pending" | "recurring";
  }[];
}

export interface SpendingDriversDTO {
  currentTotalFmt: string;
  previousTotalFmt: string;
  deltaFmt: string;
  deltaPctFmt: string | null;
  direction: "up" | "down" | "flat";
  comparisonComplete: boolean;
  summary: string;
  comparisonLabel: string;
  items: {
    name: string;
    currentFmt: string;
    deltaFmt: string;
    deltaPctFmt: string | null;
    direction: "up" | "down" | "new" | "gone" | "flat";
    explanation: string;
  }[];
  merchantItems: {
    name: string;
    currentFmt: string;
    deltaFmt: string;
    deltaPctFmt: string | null;
    direction: "up" | "down" | "new" | "gone" | "flat";
    explanation: string;
  }[];
}

export interface CashflowBreakdownDTO {
  incomeFmt: string;
  fixedFmt: string;
  flexibleFmt: string;
  savingFmt: string;
  freeFmt: string;
  annualPotentialFmt: string | null;
  savingRateFmt: string | null;
  fixedRateFmt: string | null;
  isDeficit: boolean;
  message: string;
  values: { income: number; fixed: number; flexible: number; saving: number; free: number };
}

export interface AnalysisDTO extends AnalyticsDTO {
  forecast: LiquidityForecastDTO;
  drivers: SpendingDriversDTO;
  cashflow: CashflowBreakdownDTO;
}

const MONTH_LABEL = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  return MONTH_LABEL[Number(m) - 1] ?? ym;
}

export async function getAnalyticsDTO(range?: { from: string; to: string }): Promise<AnalyticsDTO> {
  await requireSession();
  const d = await getDashboardData(new Date(), range);
  return analyticsDTO(d);
}

function analyticsDTO(d: Awaited<ReturnType<typeof getDashboardData>>): AnalyticsDTO {
  const periodLabel = monthLabelDE(new Date());

  return {
    totalBalanceFmt: formatCents(d.totalBalanceCents),
    incomeFmt: formatCents(d.incomeMonthCents),
    expensesFmt: formatCents(d.expensesMonthCents),
    subsFmt: formatCents(d.subsMonthlyCents),
    savingFmt: formatCents(d.savingMonthCents),
    realAvailableFmt: formatCents(d.realAvailableCents),
    remainingFixedFmt: formatCents(d.remainingFixedCents),
    pendingDebitsFmt: formatCents(d.pendingDebitsCents),
    periodLabel,
    periodProgressLabel: `${periodLabel} · bisher`,
    donut: d.byCategory.map<DonutSlice>((c) => ({
      name: c.name,
      color: c.color,
      value: Math.abs(Number(c.sumCents)) / 100,
      fmt: formatCents(c.sumCents),
    })),
    trend: d.trend.map<TrendBar>((t) => ({
      month: t.month,
      label: monthLabel(t.month),
      income: Number(t.incomeCents) / 100,
      expense: Math.abs(Number(t.expenseCents)) / 100,
      incomeFmt: formatCents(t.incomeCents),
      expenseFmt: formatCents(t.expenseCents),
    })),
    topMerchants: d.topMerchants.map((m) => ({
      name: m.name,
      fmt: formatCents(m.sumCents),
      count: m.count,
    })),
    upcoming: d.upcoming.map((u) => ({
      name: u.name,
      date: u.date,
      dateFmt: new Date(u.date).toLocaleDateString("de-DE", { day: "2-digit", month: "short" }),
      fmt: formatCents(u.amountCents),
      kind: u.kind,
    })),
  };
}

function signedCents(value: bigint): string {
  return value > 0n ? `+${formatCents(value)}` : formatCents(value);
}

function percentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${rounded} %`;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}

function comparisonLabel(from: string, to: string): string {
  return `${shortDate(from)}–${shortDate(to)}`;
}

function driverExplanation(driver: ExpenseDriver): string {
  if (driver.cause === "new") return "Neu in diesem Zeitraum";
  if (driver.cause === "gone") return "In diesem Zeitraum weggefallen";
  const countDelta = driver.currentCount - driver.previousCount;
  if (driver.cause === "frequency" && countDelta !== 0) {
    return `${Math.abs(countDelta)} Buchung${Math.abs(countDelta) === 1 ? "" : "en"} ${countDelta > 0 ? "mehr" : "weniger"}`;
  }
  if (driver.cause === "average") {
    return `Ø pro Buchung ${driver.deltaCents > 0n ? "gestiegen" : "gesunken"}`;
  }
  return "Betrag gegenüber zuvor verändert";
}

export async function getAnalysisDTO(period: AnalysisPeriod = "month"): Promise<AnalysisDTO> {
  await requireSession();
  const today = new Date();
  const windows = analysisWindows(today, period);
  const [dashboard, insights] = await Promise.all([
    getDashboardData(today, windows.current),
    getAnalysisInsights(today, period),
  ]);

  const spendingDirection: SpendingDriversDTO["direction"] =
    !insights.spending.comparisonComplete
      ? "flat"
      : insights.spending.deltaCents > 0n
        ? "up"
        : insights.spending.deltaCents < 0n
          ? "down"
          : "flat";
  const deltaAbs = insights.spending.deltaCents < 0n ? -insights.spending.deltaCents : insights.spending.deltaCents;
  const spendingSummary =
    !insights.spending.comparisonComplete
      ? "Für einen belastbaren Vergleich fehlen noch historische Daten."
      : spendingDirection === "up"
      ? `Deine Ausgaben sind um ${formatCents(deltaAbs)} gestiegen.`
      : spendingDirection === "down"
        ? `Deine Ausgaben sind um ${formatCents(deltaAbs)} gesunken.`
        : "Deine Ausgaben sind gegenüber dem Vergleichszeitraum unverändert.";
  const free = insights.cashflow.freeCents;
  const freeAbs = free < 0n ? -free : free;

  return {
    ...analyticsDTO(dashboard),
    forecast: {
      openingFmt: formatCents(insights.forecast.openingBalanceCents),
      endFmt: formatCents(insights.forecast.endBalanceCents),
      lowestFmt: formatCents(insights.forecast.lowestBalanceCents),
      lowestDateFmt: shortDate(insights.forecast.lowestDate),
      typicalDailySpendFmt: formatCents(insights.forecast.typicalDailySpendCents),
      atRisk: insights.forecast.lowestBalanceCents < 0n,
      points: insights.forecast.points.map((point) => ({
        date: point.date,
        label: shortDate(point.date),
        balance: Number(point.balanceCents) / 100,
        balanceFmt: formatCents(point.balanceCents),
        knownDeltaFmt: point.knownDeltaCents === 0n ? null : signedCents(point.knownDeltaCents),
      })),
      events: insights.forecast.events.map((event) => ({
        date: event.date,
        dateFmt: shortDate(event.date),
        name: event.name,
        amountFmt: formatCents(event.amountCents),
        tone: event.amountCents > 0n ? "income" : "expense",
        kind: event.kind,
      })),
    },
    drivers: {
      currentTotalFmt: formatCents(insights.spending.currentTotalCents),
      previousTotalFmt: formatCents(insights.spending.previousTotalCents),
      deltaFmt: signedCents(insights.spending.deltaCents),
      deltaPctFmt: percentage(insights.spending.deltaPct),
      direction: spendingDirection,
      comparisonComplete: insights.spending.comparisonComplete,
      summary: spendingSummary,
      comparisonLabel: `Vergleich: ${comparisonLabel(
        insights.spending.previousRange.from,
        insights.spending.previousRange.to,
      )}${insights.spending.comparisonComplete ? "" : " · Daten unvollständig"}`,
      items: (insights.spending.comparisonComplete ? insights.spending.drivers : []).map((driver) => ({
        name: driver.name,
        currentFmt: formatCents(driver.currentCents),
        deltaFmt: signedCents(driver.deltaCents),
        deltaPctFmt: percentage(driver.deltaPct),
        direction: driver.direction,
        explanation: driverExplanation(driver),
      })),
      merchantItems: (
        insights.spending.comparisonComplete ? insights.spending.merchantDrivers : []
      ).map((driver) => ({
        name: driver.name,
        currentFmt: formatCents(driver.currentCents),
        deltaFmt: signedCents(driver.deltaCents),
        deltaPctFmt: percentage(driver.deltaPct),
        direction: driver.direction,
        explanation: driverExplanation(driver),
      })),
    },
    cashflow: {
      incomeFmt: formatCents(insights.cashflow.incomeCents),
      fixedFmt: formatCents(insights.cashflow.fixedCents),
      flexibleFmt: formatCents(insights.cashflow.flexibleCents),
      savingFmt: formatCents(insights.cashflow.savingCents),
      freeFmt: formatCents(free),
      annualPotentialFmt:
        insights.cashflow.annualPotentialCents === null
          ? null
          : formatCents(insights.cashflow.annualPotentialCents),
      savingRateFmt: percentage(insights.cashflow.savingRate)?.replace(/^\+/, "") ?? null,
      fixedRateFmt: percentage(insights.cashflow.fixedRate)?.replace(/^\+/, "") ?? null,
      isDeficit: free < 0n,
      message:
        free < 0n
          ? `Die Mittelabflüsse übersteigen die Einnahmen um ${formatCents(freeAbs)}.`
          : free > 0n
            ? `Davon könntest du bis zu ${formatCents(free)} zusätzlich zurücklegen.`
            : "Einnahmen und Mittelabflüsse sind in diesem Zeitraum ausgeglichen.",
      values: {
        income: Number(insights.cashflow.incomeCents) / 100,
        fixed: Number(insights.cashflow.fixedCents) / 100,
        flexible: Number(insights.cashflow.flexibleCents) / 100,
        saving: Number(insights.cashflow.savingCents) / 100,
        free: Number(free) / 100,
      },
    },
  };
}

export interface ConsentWarning {
  aspspName: string;
  status: string;
  daysLeft: number | null;
}

export async function getConsentWarnings(): Promise<ConsentWarning[]> {
  await requireSession();
  const conns = await db.select().from(connections);
  const warnings: ConsentWarning[] = [];
  for (const c of conns) {
    if (c.provider !== "enable_banking") continue;
    const daysLeft = c.consentValidUntil
      ? Math.ceil((c.consentValidUntil.getTime() - Date.now()) / (24 * 3600 * 1000))
      : null;
    if (c.status === "expired" || (daysLeft !== null && daysLeft <= 7)) {
      warnings.push({ aspspName: c.aspspName, status: c.status, daysLeft });
    }
  }
  return warnings;
}
