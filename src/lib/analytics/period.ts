const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Current calendar month: 1st → today, plus the month's last day. Local-date based. */
export function currentMonthWindow(today = new Date()): {
  from: string;
  to: string;
  monthEnd: string;
} {
  const y = today.getFullYear();
  const m = today.getMonth();
  const from = iso(new Date(y, m, 1));
  const to = iso(today);
  const monthEnd = iso(new Date(y, m + 1, 0));
  return { from, to, monthEnd };
}

export function monthLabelDE(today = new Date()): string {
  return `${MONTHS_DE[today.getMonth()]} ${today.getFullYear()}`;
}
