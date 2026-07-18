export interface RecurringTx {
  id: string;
  bookingDate: string;
  amountCents: bigint;
  currency: string;
}

export interface FingerprintGroup {
  merchantId: string;
  isSubscriptionHint: boolean;
  txs: RecurringTx[];
}

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringResult {
  merchantId: string;
  cadence: Cadence;
  kind: "subscription" | "contract" | "income" | "other";
  amountLastCents: bigint;
  amountMedianCents: bigint;
  monthlyEquivCents: bigint;
  currency: string;
  nextExpectedDate: string;
  status: "active" | "paused" | "ended";
  priceChanged: boolean;
  firstSeen: string;
  lastSeen: string;
  txIds: string[];
}

const DAY = 24 * 3600 * 1000;
const GRACE_DAYS = 5;
const AMOUNT_TOLERANCE = 0.15;
const PRICE_CHANGE_THRESHOLD = 0.01;

function diffDays(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / DAY;
}

function medianNum(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medianBig(nums: bigint[]): bigint {
  const s = [...nums].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2n;
}

function bucketCadence(medianInterval: number): Cadence | null {
  if (medianInterval >= 5 && medianInterval <= 9) return "weekly";
  if (medianInterval >= 26 && medianInterval <= 35) return "monthly";
  if (medianInterval >= 80 && medianInterval <= 100) return "quarterly";
  if (medianInterval >= 350 && medianInterval <= 380) return "yearly";
  return null;
}

function minOccurrences(cadence: Cadence): number {
  return cadence === "monthly" || cadence === "weekly" ? 3 : 2;
}

function addCadence(iso: string, cadence: Cadence, n = 1): string {
  const d = new Date(iso + "T00:00:00Z");
  if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (cadence === "monthly") d.setUTCMonth(d.getUTCMonth() + n);
  else if (cadence === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3 * n);
  else d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);
}

function monthlyEquiv(medianAmount: bigint, cadence: Cadence): bigint {
  const v = Number(medianAmount);
  const factor = cadence === "weekly" ? 13 / 3 : cadence === "monthly" ? 1 : cadence === "quarterly" ? 1 / 3 : 1 / 12;
  return BigInt(Math.round(v * factor));
}

/**
 * Erkennt wiederkehrende Zahlungen je Händler-Gruppe. Rein & deterministisch.
 * Regeln: Spec §8.
 */
export function detectRecurring(groups: FingerprintGroup[], today: string): RecurringResult[] {
  const out: RecurringResult[] = [];

  for (const g of groups) {
    if (g.txs.length < 2) continue;
    const txs = [...g.txs].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));

    const intervals: number[] = [];
    for (let i = 1; i < txs.length; i++) intervals.push(diffDays(txs[i - 1].bookingDate, txs[i].bookingDate));
    const medInterval = medianNum(intervals);

    const cadence = bucketCadence(medInterval);
    if (!cadence) continue;
    if (txs.length < minOccurrences(cadence)) continue;

    const amounts = txs.map((t) => t.amountCents);
    const medAmount = medianBig(amounts);
    const medAbs = Math.abs(Number(medAmount)) || 1;
    const stable = amounts.every((a) => Math.abs(Number(a - medAmount)) / medAbs <= AMOUNT_TOLERANCE);
    if (!stable && !g.isSubscriptionHint) continue;

    const first = txs[0];
    const last = txs[txs.length - 1];
    const prevAmounts = amounts.slice(0, -1);
    const medPrev = medianBig(prevAmounts);
    const medPrevAbs = Math.abs(Number(medPrev)) || 1;
    const priceChanged = Math.abs(Number(last.amountCents - medPrev)) / medPrevAbs > PRICE_CHANGE_THRESHOLD;

    const nextExpected = addCadence(last.bookingDate, cadence);
    const graceEnd = addDays(nextExpected, GRACE_DAYS);
    const endedThreshold = addCadence(nextExpected, cadence);

    let status: RecurringResult["status"] = "active";
    if (today > endedThreshold) status = "ended";
    else if (today > graceEnd) status = "paused";

    const kind = medAmount > 0n ? "income" : "subscription";

    out.push({
      merchantId: g.merchantId,
      cadence,
      kind,
      amountLastCents: last.amountCents,
      amountMedianCents: medAmount,
      monthlyEquivCents: monthlyEquiv(medAmount, cadence),
      currency: last.currency,
      nextExpectedDate: nextExpected,
      status,
      priceChanged,
      firstSeen: first.bookingDate,
      lastSeen: last.bookingDate,
      txIds: txs.map((t) => t.id),
    });
  }

  return out;
}
