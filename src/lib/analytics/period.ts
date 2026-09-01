const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export type AnalysisPeriod = "month" | "quarter" | "year";

export interface DateRange {
  from: string;
  to: string;
}

const BERLIN_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date used by the German banking UI, independent of server timezone. */
export function dateKeyDE(value = new Date()): string {
  const parts = BERLIN_DATE.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(range: DateRange): number {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 3600 * 1000)) + 1;
}

/** Faire aktuelle und direkt vorherige Vergleichsperiode. */
export function analysisWindows(
  today = new Date(),
  period: AnalysisPeriod = "month",
): { current: DateRange; previous: DateRange; days: number } {
  const todayIso = dateKeyDE(today);
  let current: DateRange;
  if (period === "month") {
    current = {
      from: `${todayIso.slice(0, 7)}-01`,
      to: todayIso,
    };
  } else {
    const days = period === "quarter" ? 90 : 365;
    current = { from: addIsoDays(todayIso, -(days - 1)), to: todayIso };
  }

  const days = inclusiveDays(current);
  const previousTo = addIsoDays(current.from, -1);
  const previousFrom = addIsoDays(previousTo, -(days - 1));
  return {
    current,
    previous: { from: previousFrom, to: previousTo },
    days,
  };
}

/** Current calendar month: 1st → today, plus the month's last day. Local-date based. */
export function currentMonthWindow(today = new Date()): {
  from: string;
  to: string;
  monthEnd: string;
} {
  const to = dateKeyDE(today);
  const [year, month] = to.split("-").map(Number);
  const from = `${to.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to, monthEnd };
}

export function monthLabelDE(today = new Date()): string {
  const [year, month] = dateKeyDE(today).split("-").map(Number);
  return `${MONTHS_DE[month - 1]} ${year}`;
}
