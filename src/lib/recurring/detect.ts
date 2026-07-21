export interface RecurringTx {
  id: string;
  bookingDate: string;
  amountCents: bigint;
  currency: string;
}

export interface FingerprintGroup {
  merchantId: string;
  isSubscriptionHint: boolean;
  /** Optional display name / fingerprint for brand and kind logic. */
  label?: string;
  categoryKind?: "expense" | "income" | "transfer" | "excluded" | "saving";
  txs: RecurringTx[];
}

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringResult {
  merchantId: string;
  cadence: Cadence;
  kind: "subscription" | "contract" | "income" | "saving" | "other";
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
/** From this abs amount without subscription hint -> contract (rent, insurance...). */
const CONTRACT_AMOUNT_FLOOR = 5000n; // 50 EUR

/**
 * Retail/marketplace/cashflow noise: no recurring detection without subscription hint.
 */
const NON_RECURRING_LABELS =
  /\b(rewe|aldi|lidl|edeka|rossmann|\bdm\b|konsum|amazon|vinted|kleiderkreisel|paypal|deutsche bahn|db vertrieb|getkong|playtomic|mc doener|doener|einzahlung|kartenpreis|dkb)\b/i;

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

type Bucket = {
  cadence: Cadence;
  /** Months per cycle (2 = every two months). */
  cycleMonths: number;
  /** Days per cycle when not calendar-month based (7/14). */
  cycleDays?: number;
};

/**
 * Interval -> cadence.
 * Monthly 25-40 days (month-end/holidays),
 * plus 2-month rhythm 55-75 only with subscription hint.
 */
function bucketCadence(medianInterval: number): Bucket | null {
  if (medianInterval >= 5 && medianInterval <= 9) return { cadence: "weekly", cycleMonths: 0, cycleDays: 7 };
  if (medianInterval >= 12 && medianInterval <= 16) return { cadence: "weekly", cycleMonths: 0, cycleDays: 14 };
  if (medianInterval >= 25 && medianInterval <= 40) return { cadence: "monthly", cycleMonths: 1 };
  if (medianInterval >= 55 && medianInterval <= 75) return { cadence: "monthly", cycleMonths: 2 };
  if (medianInterval >= 80 && medianInterval <= 110) return { cadence: "quarterly", cycleMonths: 3 };
  if (medianInterval >= 340 && medianInterval <= 390) return { cadence: "yearly", cycleMonths: 12 };
  return null;
}

function sameBucket(a: Bucket, b: Bucket): boolean {
  return a.cadence === b.cadence && a.cycleMonths === b.cycleMonths && a.cycleDays === b.cycleDays;
}

function minOccurrences(bucket: Bucket, subscriptionHint: boolean): number {
  if (subscriptionHint) return 2;
  if (bucket.cycleMonths >= 2 || bucket.cadence === "yearly" || bucket.cadence === "quarterly") return 2;
  return 3;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function nextAfter(iso: string, bucket: Bucket): string {
  if (bucket.cycleDays) return addDays(iso, bucket.cycleDays);
  if (bucket.cadence === "yearly") return addYears(iso, 1);
  if (bucket.cadence === "quarterly") return addMonths(iso, 3);
  return addMonths(iso, bucket.cycleMonths || 1);
}

function monthlyEquiv(medianAmount: bigint, bucket: Bucket): bigint {
  const v = Number(medianAmount);
  let factor: number;
  if (bucket.cycleDays === 7) factor = 13 / 3;
  else if (bucket.cycleDays === 14) factor = 26 / 12;
  else if (bucket.cadence === "monthly") factor = 1 / (bucket.cycleMonths || 1);
  else if (bucket.cadence === "quarterly") factor = 1 / 3;
  else factor = 1 / 12;
  return BigInt(Math.round(v * factor));
}

/** Groups bookings by similar amount (relative tolerance around cluster median). */
export function clusterByAmount(txs: RecurringTx[], tolerance = AMOUNT_TOLERANCE): RecurringTx[][] {
  if (txs.length === 0) return [];
  const sorted = [...txs].sort((a, b) => {
    const d = absBig(a.amountCents) - absBig(b.amountCents);
    return d < 0n ? -1 : d > 0n ? 1 : a.bookingDate.localeCompare(b.bookingDate);
  });

  const clusters: RecurringTx[][] = [];
  for (const tx of sorted) {
    let placed = false;
    for (const c of clusters) {
      const med = medianBig(c.map((t) => t.amountCents));
      const medAbs = Math.abs(Number(med)) || 1;
      if (Math.abs(Number(tx.amountCents - med)) / medAbs <= tolerance) {
        c.push(tx);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([tx]);
  }
  return clusters.sort((a, b) => b.length - a.length);
}

function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}

function inferKind(
  medAmount: bigint,
  isSubscriptionHint: boolean,
  label?: string,
  categoryKind?: FingerprintGroup["categoryKind"],
): RecurringResult["kind"] {
  if (categoryKind === "saving") return "saving";
  if (medAmount > 0n) return "income";
  const text = (label ?? "").toLowerCase();
  if (/\b(miete|nebenkosten|rent|versicherung|strom|gas|telefon|handy|internet|kaltmiete)\b/i.test(text)) {
    return "contract";
  }
  if (isSubscriptionHint) return "subscription";
  if (absBig(medAmount) >= CONTRACT_AMOUNT_FLOOR) return "contract";
  return "subscription";
}

function isBlockedRetail(label: string | undefined, subscriptionHint: boolean): boolean {
  if (subscriptionHint) return false;
  return NON_RECURRING_LABELS.test(label ?? "");
}

/** Without subscription hint: at least 80% of intervals must fall into the same cadence bucket. */
function intervalsConsistent(intervals: number[], bag: Bucket, subscriptionHint: boolean): boolean {
  if (subscriptionHint) return true;
  if (intervals.length === 0) return false;
  const ok = intervals.filter((i) => {
    const b = bucketCadence(i);
    return b !== null && sameBucket(b, bag);
  });
  return ok.length / intervals.length >= 0.8;
}

function detectOneCluster(
  merchantId: string,
  isSubscriptionHint: boolean,
  label: string | undefined,
  categoryKind: FingerprintGroup["categoryKind"],
  txsIn: RecurringTx[],
  today: string,
): RecurringResult | null {
  if (isBlockedRetail(label, isSubscriptionHint)) return null;
  if (txsIn.length < 2) return null;
  const txs = [...txsIn].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));

  const intervals: number[] = [];
  for (let i = 1; i < txs.length; i++) intervals.push(diffDays(txs[i - 1].bookingDate, txs[i].bookingDate));
  const medInterval = medianNum(intervals);

  const bucket = bucketCadence(medInterval);
  if (!bucket) return null;

  // Bi-monthly rhythm only with subscription hint
  if (bucket.cycleMonths === 2 && !isSubscriptionHint) return null;
  // Weekly without hint is almost always noise
  if (bucket.cycleDays && !isSubscriptionHint) return null;

  if (txs.length < minOccurrences(bucket, isSubscriptionHint)) return null;
  if (!intervalsConsistent(intervals, bucket, isSubscriptionHint)) return null;

  const amounts = txs.map((t) => t.amountCents);
  const medAmount = medianBig(amounts);
  const medAbs = Math.abs(Number(medAmount)) || 1;
  const stable = amounts.every((a) => Math.abs(Number(a - medAmount)) / medAbs <= AMOUNT_TOLERANCE);
  if (!stable && !isSubscriptionHint) return null;

  const first = txs[0];
  const last = txs[txs.length - 1];
  const prevAmounts = amounts.slice(0, -1);
  const medPrev = prevAmounts.length ? medianBig(prevAmounts) : medAmount;
  const medPrevAbs = Math.abs(Number(medPrev)) || 1;
  const priceChanged = Math.abs(Number(last.amountCents - medPrev)) / medPrevAbs > PRICE_CHANGE_THRESHOLD;

  const nextExpected = nextAfter(last.bookingDate, bucket);
  const graceEnd = addDays(nextExpected, GRACE_DAYS);
  const endedThreshold = nextAfter(nextExpected, bucket);

  let status: RecurringResult["status"] = "active";
  if (today > endedThreshold) status = "ended";
  else if (today > graceEnd) status = "paused";

  return {
    merchantId,
    cadence: bucket.cadence,
    kind: inferKind(medAmount, isSubscriptionHint, label, categoryKind),
    amountLastCents: last.amountCents,
    amountMedianCents: medAmount,
    monthlyEquivCents: monthlyEquiv(medAmount, bucket),
    currency: last.currency,
    nextExpectedDate: nextExpected,
    status,
    priceChanged,
    firstSeen: first.bookingDate,
    lastSeen: last.bookingDate,
    txIds: txs.map((t) => t.id),
  };
}

/**
 * Detects recurring payments per merchant group. Pure & deterministic.
 * - Amount clusters: side bills next to rent no longer break the contract.
 * - Wider intervals: 25-40 day month, 55-75 day bi-monthly (hint only).
 * - Subscription hints only need 2 hits.
 * - Retail without hint is suppressed.
 */
export function detectRecurring(groups: FingerprintGroup[], today: string): RecurringResult[] {
  const out: RecurringResult[] = [];

  for (const g of groups) {
    const tol = g.isSubscriptionHint ? 0.4 : AMOUNT_TOLERANCE;
    const clusters = clusterByAmount(g.txs, tol);
    const seenCadences = new Set<Cadence>();

    for (const cluster of clusters) {
      const r = detectOneCluster(g.merchantId, g.isSubscriptionHint, g.label, g.categoryKind, cluster, today);
      if (!r) continue;
      if (seenCadences.has(r.cadence)) continue;
      seenCadences.add(r.cadence);
      out.push(r);
    }
  }

  return out;
}

