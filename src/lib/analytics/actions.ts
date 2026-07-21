"use server";

import { db } from "@/db";
import { connections } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { formatCents } from "@/lib/money";
import { getDashboardData } from "./queries";
import type { DonutSlice } from "@/components/charts/category-donut";
import type { TrendBar } from "@/components/charts/trend-bars";

export interface AnalyticsDTO {
  totalBalanceFmt: string;
  incomeFmt: string;
  expensesFmt: string;
  subsFmt: string;
  savingFmt: string;
  donut: DonutSlice[];
  trend: TrendBar[];
  topMerchants: { name: string; fmt: string; count: number }[];
  upcoming: { name: string; date: string; dateFmt: string; fmt: string }[];
}

const MONTH_LABEL = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  return MONTH_LABEL[Number(m) - 1] ?? ym;
}

export async function getAnalyticsDTO(range?: { from: string; to: string }): Promise<AnalyticsDTO> {
  await requireSession();
  const d = await getDashboardData(new Date(), range);

  return {
    totalBalanceFmt: formatCents(d.totalBalanceCents),
    incomeFmt: formatCents(d.incomeMonthCents),
    expensesFmt: formatCents(d.expensesMonthCents),
    subsFmt: formatCents(d.subsMonthlyCents),
    savingFmt: formatCents(d.savingMonthCents),
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
    })),
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
