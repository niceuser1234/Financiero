# Dashboard, Recurring & Assistant Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard numbers honest and time-labeled, fix Sparen/recurring-amount/false-contract bugs, and rebuild the Assistant as a modern, streaming, evidence-backed chat.

**Architecture:** Six mostly-independent phases. Phase A reframes the Dashboard KPIs (period labels + balance toggle + Fixkosten rename). Phase B adds a `saving` recurring kind so the Trade-Republic Sparplan feeds "Sparen". Phase C fixes the misleading recurring-amount display (Spotify -3,49 → real 6,99 + correct cadence). Phase D prunes and prevents false "Beendet" contracts. Phase E is a data cleanup migration. Phase F rebuilds the Assistant (UI + SSE streaming + sources).

**Tech Stack:** Next.js (custom build — **read `node_modules/next/dist/docs/` before touching routing/server code**, per AGENTS.md), React (client components), Drizzle ORM + Postgres 16 (Homebrew, no Docker), Vitest (serial), Tailwind design-system, OpenRouter chat completions.

## Global Constraints

- **Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code.** APIs differ from training data (AGENTS.md).
- DB is local Postgres 16 via Homebrew; `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"` before `psql`. `DATABASE_URL` is in `.env`.
- Tests run **serially**: `npx vitest run <file>`.
- All money is `bigint` cents; expenses are **negative**. Format only via `formatCents(cents, currency)` from `src/lib/money.ts`.
- UI copy is **German**. Amount colors: income green, expense neutral (never red for amounts) — reuse `Money` / `Money.Text` / `KpiCard`.
- Never hand-format currency in JSX; never introduce a second money formatter.
- Commit after every green task. Do not push unless asked.

---

## File Structure

**Phase A — Dashboard reframe**
- Modify `src/components/ds/kpi-card.tsx` — add optional `sublabel` prop (period line).
- Create `src/lib/analytics/period.ts` — month-window + label helpers (pure, tested).
- Modify `src/lib/analytics/queries.ts` — add `realAvailableCents`, `remainingFixedCents`; redefine saving; return period bounds.
- Modify `src/lib/analytics/actions.ts` — expose new fields + formatted period label in `AnalyticsDTO`.
- Create `src/components/dashboard/balance-kpi.tsx` — client toggle: Gesamtsaldo ↔ Real verfügbar.
- Modify `src/app/(app)/dashboard/page.tsx` — wire sublabels, rename "Abos", use `BalanceKpi`.

**Phase B — Saving recurring kind**
- Create `src/db/migrations/00XX_recurring_saving_kind.sql` — add `saving` to `recurring_kind` enum.
- Modify `src/db/schema.ts` — extend `recurringKindEnum`.
- Modify `src/lib/recurring/detect.ts` — `categoryKind` on group → `inferKind` returns `saving`.
- Modify `src/lib/recurring/apply.ts` — carry majority category kind into groups.
- Modify `src/lib/analytics/queries.ts` — subs excludes `saving`; Sparen = saving monthly-equiv + extra actual saving deposits.

**Phase C — Recurring amount display**
- Create `src/db/migrations/00XX_bimonthly_cadence.sql` — add `bimonthly` to `cadence` enum.
- Modify `src/db/schema.ts` — extend `cadenceEnum`.
- Modify `src/lib/recurring/detect.ts` — emit `bimonthly` cadence instead of folding into `monthly`.
- Modify `src/lib/recurring/queries.ts` — `CADENCE_LABEL.bimonthly`, `groupByCadence`, `perChargeFmt`.
- Modify `src/components/contracts/contracts-view.tsx` — card & sheet show per-charge as primary, monthly-equiv secondary.

**Phase D — Prune & prevent false contracts**
- Modify `src/lib/classify/normalize.ts` — never set subscription hint for blocklisted retail brands.
- Modify `src/lib/recurring/detect.ts` — blocklist is a hard block regardless of hint.
- Modify `src/lib/recurring/apply.ts` — delete (not "end") recurring items for blocklisted merchants.

**Phase E — One-off data cleanup**
- Create `scripts/cleanup-false-recurring.ts` — delete existing blocklisted recurring rows; re-run detection.

**Phase F — Assistant rebuild**
- Modify `src/lib/chat/system.ts` — instruct model to cite tools/periods; anti-truncation rule.
- Modify `src/app/api/chat/route.ts` — collect `sources`; stream the final answer as SSE (`text` + `sources` + `done` events).
- Rewrite `src/components/chat/finance-chat.tsx` — modern chat UI, stream consumer, sources footer.
- Modify `src/app/(app)/assistant/page.tsx` — full-height layout wrapper.

---

## Phase A — Dashboard reframe (Issues 1 + 3, balance toggle)

### Task A1: Period helpers

**Files:**
- Create: `src/lib/analytics/period.ts`
- Test: `src/lib/analytics/period.test.ts`

**Interfaces:**
- Produces: `currentMonthWindow(today: Date): { from: string; to: string; monthEnd: string }`, `monthLabelDE(today: Date): string` (e.g. `"Juli 2026"`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics/period.test.ts
import { describe, it, expect } from "vitest";
import { currentMonthWindow, monthLabelDE } from "./period";

describe("period", () => {
  it("windows the current calendar month to today", () => {
    const w = currentMonthWindow(new Date("2026-07-21T10:00:00Z"));
    expect(w.from).toBe("2026-07-01");
    expect(w.to).toBe("2026-07-21");
    expect(w.monthEnd).toBe("2026-07-31");
  });
  it("labels the month in German", () => {
    expect(monthLabelDE(new Date("2026-07-21T10:00:00Z"))).toBe("Juli 2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/analytics/period.test.ts`
Expected: FAIL ("Cannot find module './period'").

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/analytics/period.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/analytics/period.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/period.ts src/lib/analytics/period.test.ts
git commit -m "feat(analytics): current-month window + German month label helpers"
```

### Task A2: KpiCard sublabel

**Files:**
- Modify: `src/components/ds/kpi-card.tsx:37-84`

**Interfaces:**
- Produces: `KpiCard` accepts optional `sublabel?: string` rendered as a muted period line under the value.

- [ ] **Step 1: Add the prop and render**

In the props destructure (`src/components/ds/kpi-card.tsx:37-51`) add `sublabel` after `label`:

```tsx
export function KpiCard({
  label,
  value,
  sublabel,
  tone = "neutral",
  delta,
  deltaDir,
  icon: Icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: KpiTone;
  delta?: string;
  deltaDir?: "up" | "down";
  icon?: LucideIcon;
}) {
```

Immediately after the value `<div>…{value}</div>` block (currently ends at line 75), insert:

```tsx
      {sublabel && (
        <div className={cn("mt-1.5 text-[11px] font-medium", t.label)}>{sublabel}</div>
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ds/kpi-card.tsx
git commit -m "feat(ds): optional sublabel (period line) on KpiCard"
```

### Task A3: Analytics query — real-available + remaining fixed costs

**Files:**
- Modify: `src/lib/analytics/queries.ts:26-54` (DashboardData interface + window), `:76-81` (subs), `:178-189` (return)
- Test: `src/lib/analytics/queries.test.ts` (create)

**Interfaces:**
- Consumes: `currentMonthWindow` from Task A1.
- Produces: `DashboardData` gains `remainingFixedCents: bigint` (sum of active non-income recurring charges still due between today and month-end, negative) and `realAvailableCents: bigint` (= `totalBalanceCents + remainingFixedCents`). `periodFrom`/`periodTo`/`monthEnd` strings.

- [ ] **Step 1: Extend the interface**

In `DashboardData` (`src/lib/analytics/queries.ts:26-36`) add:

```ts
  remainingFixedCents: bigint;
  realAvailableCents: bigint;
  periodFrom: string;
  periodTo: string;
```

- [ ] **Step 2: Use the shared window + compute remaining fixed costs**

Replace the top of `getDashboardData` (`:49-57`) so the default window comes from the helper and expose bounds:

```ts
import { currentMonthWindow } from "./period";
// …
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
```

Then, after the `subs` query (`:77-81`), add the remaining-fixed-costs query:

```ts
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
```

- [ ] **Step 3: Return the new fields**

In the return object (`:178-189`) add:

```ts
    remainingFixedCents,
    realAvailableCents: BigInt(bal?.sum ?? "0") + remainingFixedCents,
    periodFrom: from,
    periodTo: to,
```

- [ ] **Step 4: Write a test for remaining-fixed logic**

```ts
// src/lib/analytics/queries.test.ts
import { describe, it, expect } from "vitest";
import { currentMonthWindow } from "./period";

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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/analytics/queries.test.ts src/lib/analytics/period.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/queries.ts src/lib/analytics/queries.test.ts
git commit -m "feat(analytics): real-available balance + remaining fixed costs this month"
```

### Task A4: DTO — formatted new fields + period label

**Files:**
- Modify: `src/lib/analytics/actions.ts:11-66`

**Interfaces:**
- Consumes: new `DashboardData` fields; `monthLabelDE`.
- Produces: `AnalyticsDTO` gains `realAvailableFmt: string`, `remainingFixedFmt: string`, `periodLabel: string` (e.g. `"Juli 2026"`), `periodProgressLabel: string` (e.g. `"Juli 2026 · bisher"`).

- [ ] **Step 1: Extend the DTO interface** (`:11-21`)

```ts
  realAvailableFmt: string;
  remainingFixedFmt: string;
  periodLabel: string;
  periodProgressLabel: string;
```

- [ ] **Step 2: Populate them** (in the returned object, `:34-65`)

```ts
import { monthLabelDE } from "./period";
// …inside getAnalyticsDTO, before return:
  const periodLabel = monthLabelDE(new Date());
// …in the returned object:
    realAvailableFmt: formatCents(d.realAvailableCents),
    remainingFixedFmt: formatCents(d.remainingFixedCents),
    periodLabel,
    periodProgressLabel: `${periodLabel} · bisher`,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/actions.ts
git commit -m "feat(analytics): expose real-available, remaining-fixed, period labels in DTO"
```

### Task A5: Balance toggle component

**Files:**
- Create: `src/components/dashboard/balance-kpi.tsx`

**Interfaces:**
- Consumes: `KpiCard` (with `sublabel`), `SegmentedControl` (`src/components/ds/segmented-control.tsx`).
- Produces: `<BalanceKpi total={string} real={string} remainingFixed={string} />` — a client component toggling between "Gesamt" and "Real verfügbar".

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/balance-kpi.tsx
"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { KpiCard } from "@/components/ds/kpi-card";
import { SegmentedControl } from "@/components/ds/segmented-control";

/**
 * Gesamtsaldo vs. "Real verfügbar" (Saldo minus noch nicht abgebuchte Fixkosten
 * dieses Monats). Beantwortet: "Wie viel habe ich diesen Monat wirklich noch?"
 */
export function BalanceKpi({
  total,
  real,
  remainingFixed,
}: {
  total: string;
  real: string;
  remainingFixed: string;
}) {
  const [mode, setMode] = useState<"total" | "real">("total");
  return (
    <div className="lg:col-span-2 space-y-2">
      <SegmentedControl
        options={[
          { value: "total", label: "Gesamt" },
          { value: "real", label: "Real verfügbar" },
        ]}
        value={mode}
        onChange={(v) => setMode(v as "total" | "real")}
      />
      {mode === "total" ? (
        <KpiCard label="Gesamtsaldo" value={total} tone="accent" icon={Wallet} sublabel="Aktueller Stand" />
      ) : (
        <KpiCard
          label="Real verfügbar"
          value={real}
          tone="accent"
          icon={Wallet}
          sublabel={`Nach offenen Fixkosten (${remainingFixed})`}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `SegmentedControl` prop shape**

Run: `sed -n '1,40p' src/components/ds/segmented-control.tsx`
Expected: confirms `options: {value,label}[]`, `value`, `onChange`. If `onChange` is generic-typed, drop the `as` cast.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/balance-kpi.tsx
git commit -m "feat(dashboard): balance toggle — total vs real available"
```

### Task A6: Wire Dashboard — sublabels, rename, toggle

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx:75-81`

**Interfaces:**
- Consumes: `BalanceKpi`, DTO period labels.

- [ ] **Step 1: Read the Next.js server-component guide**

Run: `ls node_modules/next/dist/docs/ && sed -n '1,80p' node_modules/next/dist/docs/*server-component* 2>/dev/null | head -80`
Expected: confirm async server components + client-island usage for this Next version before editing.

- [ ] **Step 2: Replace the KPI grid** (`:75-81`)

```tsx
import { BalanceKpi } from "@/components/dashboard/balance-kpi";
// …
      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 lg:grid-cols-6">
        <BalanceKpi
          total={dto.totalBalanceFmt}
          real={dto.realAvailableFmt}
          remainingFixed={dto.remainingFixedFmt}
        />
        <KpiCard
          label="Einnahmen"
          value={dto.incomeFmt}
          tone="income"
          sublabel={dto.periodProgressLabel}
        />
        <KpiCard
          label="Ausgaben"
          value={dto.expensesFmt}
          tone="expense"
          sublabel={dto.periodProgressLabel}
        />
        <KpiCard
          label="Sparen"
          value={dto.savingFmt}
          tone="neutral"
          icon={PiggyBank}
          sublabel={dto.periodLabel}
        />
        <KpiCard
          label="Fixkosten"
          value={dto.subsFmt}
          tone="neutral"
          icon={Repeat}
          sublabel="Ø wiederkehrend / Monat"
        />
      </div>
```

Note: `Fixkosten` replaces the incorrect `Abos / Monat` (issue 1). `BalanceKpi` spans 2 of 6 columns.

- [ ] **Step 3: Run the app and eyeball**

Run: `/run` (or `npm run dev`) and open the Dashboard.
Expected: every KPI shows a period sub-line; the balance card toggles Gesamt ↔ Real verfügbar; "Fixkosten" label present, no "Abos / Monat".

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): period sublabels, Fixkosten rename, balance toggle"
```

---

## Phase B — Saving recurring kind (Issue 2)

### Task B1: Migration + schema — `saving` recurring kind

**Files:**
- Create: `src/db/migrations/00XX_recurring_saving_kind.sql` (use the next free number — run `ls src/db/migrations` first)
- Modify: `src/db/schema.ts:27`

- [ ] **Step 1: Confirm migration tooling & numbering**

Run: `ls src/db/migrations | tail -5 && grep -rn "migrate\|drizzle-kit" package.json`
Expected: shows numbering convention and the migrate script.

- [ ] **Step 2: Write the migration**

```sql
-- src/db/migrations/00XX_recurring_saving_kind.sql
ALTER TYPE recurring_kind ADD VALUE IF NOT EXISTS 'saving';
```

- [ ] **Step 3: Extend the enum** (`src/db/schema.ts:27`)

```ts
export const recurringKindEnum = pgEnum("recurring_kind", ["subscription", "contract", "income", "saving", "other"]);
```

- [ ] **Step 4: Apply migration**

Run: `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"; <project migrate command>` (from Step 1; e.g. `npm run db:migrate`).
Expected: succeeds. Verify: `psql "$DATABASE_URL" -c "select enum_range(null::recurring_kind);"` includes `saving`.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/ src/db/schema.ts
git commit -m "feat(db): add 'saving' recurring kind"
```

### Task B2: Detection infers `saving` from category kind

**Files:**
- Modify: `src/lib/recurring/detect.ts:8-14` (`FingerprintGroup`), `:159-172` (`inferKind`), `:190-252` (`detectOneCluster`)
- Test: `src/lib/recurring/detect.test.ts`

**Interfaces:**
- Consumes: `FingerprintGroup` gains optional `categoryKind?: "expense" | "income" | "transfer" | "excluded" | "saving"`.
- Produces: `inferKind` returns `"saving"` when `categoryKind === "saving"`.

- [ ] **Step 1: Write the failing test** (append to `detect.test.ts`)

```ts
  it("infers saving kind from category", () => {
    const today = "2026-07-21";
    const mk = (d: string): { id: string; bookingDate: string; amountCents: bigint; currency: string } => ({
      id: d, bookingDate: d, amountCents: -10000n, currency: "EUR",
    });
    const res = detectRecurring(
      [{
        merchantId: "tr", isSubscriptionHint: false, label: "Sparplan",
        categoryKind: "saving",
        txs: [mk("2026-05-05"), mk("2026-06-05"), mk("2026-07-05")],
      }],
      today,
    );
    expect(res[0]?.kind).toBe("saving");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/recurring/detect.test.ts -t "infers saving"`
Expected: FAIL (kind is `contract`/`subscription`, or `categoryKind` type error).

- [ ] **Step 3: Implement**

Add to `FingerprintGroup` (`:8-14`):

```ts
  categoryKind?: "expense" | "income" | "transfer" | "excluded" | "saving";
```

Change `inferKind` signature and first checks (`:159-172`):

```ts
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
```

Thread `categoryKind` through `detectOneCluster`: add a param `categoryKind: FingerprintGroup["categoryKind"]` after `label` (`:190-196`), pass it in the `inferKind(...)` call (`:240`), and in `detectRecurring` pass `g.categoryKind` (`:270`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/recurring/detect.test.ts`
Expected: PASS (all, including new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/detect.ts src/lib/recurring/detect.test.ts
git commit -m "feat(recurring): infer 'saving' kind from category"
```

### Task B3: apply.ts carries majority category kind

**Files:**
- Modify: `src/lib/recurring/apply.ts:52-82` (`GroupEx` + `mergeBrandGroups`), `:154-191` (row select + grouping)

**Interfaces:**
- Consumes: category kind per transaction via join.
- Produces: each merged `FingerprintGroup` carries `categoryKind` = the majority category kind of its transactions.

- [ ] **Step 1: Join category kind into the detection rows** (`:154-168`)

Add to the select and join:

```ts
      categoryKind: categories.kind,
// …
    .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
```

Import `categories` at top (already imports `merchants, recurringItems, transactions` — add `categories`).

- [ ] **Step 2: Track a kind tally per group** (`:52-53`, `:170-191`)

Extend `GroupEx`:

```ts
type GroupEx = FingerprintGroup & { fingerprint: string; name: string; kindTally: Map<string, number> };
```

When building groups (`:172-191`), initialise `kindTally: new Map()` and, per row, `if (r.categoryKind) g.kindTally.set(r.categoryKind, (g.kindTally.get(r.categoryKind) ?? 0) + 1);`.

- [ ] **Step 3: Emit majority kind in `mergeBrandGroups`** (`:65-81`)

Before the `out.push`, compute the winning kind across parts:

```ts
    const tally = new Map<string, number>();
    for (const p of parts) for (const [k, n] of p.kindTally) tally.set(k, (tally.get(k) ?? 0) + n);
    let categoryKind: FingerprintGroup["categoryKind"] | undefined;
    let best = 0;
    for (const [k, n] of tally) if (n > best) { best = n; categoryKind = k as FingerprintGroup["categoryKind"]; }
```

Add `categoryKind,` to the pushed object.

- [ ] **Step 4: Typecheck + existing recurring tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/recurring`
Expected: no new type errors; recurring tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/apply.ts
git commit -m "feat(recurring): thread majority category kind into detection"
```

### Task B4: Sparen KPI = saving monthly-equiv + extra deposits; Fixkosten excludes saving

**Files:**
- Modify: `src/lib/analytics/queries.ts:64-81` (flow/subs), return (`:178-189`)

**Interfaces:**
- Produces: `subsMonthlyCents` excludes `income` **and** `saving`. `savingMonthCents` = Σ monthly-equiv of active `saving` recurring items **plus** actual saving-category transactions this month **not** linked to a saving recurring item.

- [ ] **Step 1: Exclude saving from Fixkosten** (`:77-81`)

```ts
  const [subs] = await db
    .select({ sum: sql<string>`coalesce(sum(${recurringItems.monthlyEquivCents}), 0)` })
    .from(recurringItems)
    .where(and(eq(recurringItems.status, "active"), sql`${recurringItems.kind} not in ('income','saving')`));
```

- [ ] **Step 2: Compute planned + extra saving**

After the `subs` query add:

```ts
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
```

Ensure `categories` and `inArray`/subquery imports exist (add `categories` to the drizzle import if missing; `transactions.recurringItemId` is already in schema).

- [ ] **Step 3: Return the new saving figure** (`:187`)

Replace `savingMonthCents: BigInt(flow?.saving ?? "0"),` with `savingMonthCents,`. Remove the now-unused `saving` expression from the `flow` select (`:70`).

- [ ] **Step 4: Sanity-check against DB**

Run: `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"; psql "$DATABASE_URL" -c "select kind, count(*), sum(monthly_equiv_cents) from recurring_items where status='active' group by kind;"`
Expected: after re-running detection (Phase E), a `saving` row appears; Fixkosten no longer includes it.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit`

```bash
git add src/lib/analytics/queries.ts
git commit -m "feat(analytics): Sparen = saving plan + extra deposits; Fixkosten excludes saving"
```

---

## Phase C — Recurring amount display (Issue 4: Spotify -3,49 → 6,99)

### Task C1: Migration + schema — `bimonthly` cadence

**Files:**
- Create: `src/db/migrations/00XX_bimonthly_cadence.sql`
- Modify: `src/db/schema.ts:26`

- [ ] **Step 1: Migration**

```sql
-- src/db/migrations/00XX_bimonthly_cadence.sql
ALTER TYPE cadence ADD VALUE IF NOT EXISTS 'bimonthly';
```

- [ ] **Step 2: Schema** (`:26`)

```ts
export const cadenceEnum = pgEnum("cadence", ["weekly", "bimonthly", "monthly", "quarterly", "yearly"]);
```

- [ ] **Step 3: Apply + verify**

Run: `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"; <migrate command>; psql "$DATABASE_URL" -c "select enum_range(null::cadence);"`
Expected: includes `bimonthly`.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/ src/db/schema.ts
git commit -m "feat(db): add 'bimonthly' cadence"
```

### Task C2: Detection emits `bimonthly`

**Files:**
- Modify: `src/lib/recurring/detect.ts:16` (`Cadence`), `:76-84` (`bucketCadence`), `:112-128` (`nextAfter`/`monthlyEquiv`), `:209` (bi-monthly guard)
- Test: `src/lib/recurring/detect.test.ts:83-98` (existing "bimonthly spotify-like")

**Interfaces:**
- Produces: 55–75-day rhythm → `cadence: "bimonthly"` (was `"monthly"` with `cycleMonths: 2`).

- [ ] **Step 1: Update the existing bimonthly test expectation** (`detect.test.ts:83-98`)

Change its assertion to expect the new cadence and the real per-charge amount:

```ts
    expect(res[0].cadence).toBe("bimonthly");
    expect(res[0].amountLastCents).toBe(-699n);
    expect(res[0].monthlyEquivCents).toBe(-350n); // ~699/2, rounded
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/recurring/detect.test.ts -t "bimonthly"`
Expected: FAIL (cadence currently `"monthly"`).

- [ ] **Step 3: Implement**

Add to the `Cadence` union (`:16`): `"bimonthly"`.

In `bucketCadence` (`:80`) change the 55–75 branch:

```ts
  if (medianInterval >= 55 && medianInterval <= 75) return { cadence: "bimonthly", cycleMonths: 2 };
```

In `minOccurrences` (`:90-94`) the `cycleMonths >= 2` branch already returns 2 — keep. In `nextAfter` (`:112-117`) `bucket.cycleMonths || 1` = 2 already handles it (returns +2 months). In `monthlyEquiv` (`:119-128`) add before the `monthly` branch:

```ts
  if (bucket.cadence === "bimonthly") factor = 1 / 2;
  else if (bucket.cadence === "monthly") factor = 1 / (bucket.cycleMonths || 1);
```

Update the guard at `:209` (`bucket.cycleMonths === 2 && !isSubscriptionHint`) to also match cadence:

```ts
  if (bucket.cadence === "bimonthly" && !isSubscriptionHint) return null;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/recurring/detect.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/detect.ts src/lib/recurring/detect.test.ts
git commit -m "feat(recurring): distinct bimonthly cadence"
```

### Task C3: Contracts DTO — cadence label + per-charge amount

**Files:**
- Modify: `src/lib/recurring/queries.ts:6-11` (labels), `:44-53` (`groupByCadence`), `:13-27` + `:65-95` (`RecurringDTO` + `toDTO`)

**Interfaces:**
- Produces: `CADENCE_LABEL.bimonthly = "alle 2 Monate"`; `RecurringDTO` gains `perChargeFmt: string` (= `amountLastFmt`, the real charge) and `monthlyHint: string` (e.g. `"≈ 3,50 € / Monat"`). `ActiveByCadence` gains a `bimonthly` bucket.

- [ ] **Step 1: Add the label** (`:6-11`)

```ts
const CADENCE_LABEL: Record<string, string> = {
  weekly: "wöchentlich",
  bimonthly: "alle 2 Monate",
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  yearly: "jährlich",
};
```

- [ ] **Step 2: Bucket bimonthly separately** (`:38-53`)

```ts
export interface ActiveByCadence {
  monthly: RecurringDTO[];
  bimonthly: RecurringDTO[];
  quarterly: RecurringDTO[];
  yearly: RecurringDTO[];
}

export function groupByCadence(items: RecurringDTO[]): ActiveByCadence {
  const g: ActiveByCadence = { monthly: [], bimonthly: [], quarterly: [], yearly: [] };
  for (const r of items) {
    if (r.cadence === "bimonthly") g.bimonthly.push(r);
    else if (r.cadence === "quarterly") g.quarterly.push(r);
    else if (r.cadence === "yearly") g.yearly.push(r);
    else g.monthly.push(r); // monthly + weekly
  }
  return g;
}
```

- [ ] **Step 3: Add per-charge fields to the DTO** (`:13-27` interface, `:78-94` builder)

Interface: add `perChargeFmt: string;` and `monthlyHint: string;`.
Builder: after `amountLastFmt`:

```ts
    perChargeFmt: formatCents(row.amountLastCents, row.currency),
    monthlyHint: `≈ ${formatCents(row.monthlyEquivCents, row.currency)} / Monat`,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only where `contracts-view.tsx` consumes the old `groupByCadence` shape — fixed in C4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/queries.ts
git commit -m "feat(recurring): bimonthly label + per-charge display fields"
```

### Task C4: Contracts view shows the real charge

**Files:**
- Modify: `src/components/contracts/contracts-view.tsx:23-27` (sections), `:54-59` (card amount), `:148-157` (sheet header)

**Interfaces:**
- Consumes: `perChargeFmt`, `monthlyHint`, `ActiveByCadence.bimonthly`.

- [ ] **Step 1: Add the bimonthly section** (`:23-27`)

```tsx
const CADENCE_SECTIONS: { key: "monthly" | "bimonthly" | "quarterly" | "yearly"; label: string }[] = [
  { key: "monthly", label: "Monatlich" },
  { key: "bimonthly", label: "Alle 2 Monate" },
  { key: "quarterly", label: "Vierteljährlich" },
  { key: "yearly", label: "Jährlich" },
];
```

- [ ] **Step 2: Card shows per-charge, cadence-aware** (`:54-58`)

Replace the `Money.Text` in `CardsGrid` with the real charge; append the monthly hint under the cadence line (`:49-52`):

```tsx
                <div className="mt-0.5 text-xs text-ink-400">
                  {c.cadenceLabel}
                  {c.nextRelative && c.status === "active" && ` · nächste ${c.nextRelative}`}
                  {c.cadence !== "monthly" && c.kind !== "income" && ` · ${c.monthlyHint}`}
                </div>
              </div>
              <Money.Text
                value={c.perChargeFmt}
                tone={c.kind === "income" ? "income" : "neutral"}
                className="min-w-[104px] text-right"
              />
```

- [ ] **Step 3: Sheet header shows per-charge as the big number** (`:148-157`)

```tsx
                  <Money.Text
                    value={selected.perChargeFmt}
                    tone={selected.kind === "income" ? "income" : "neutral"}
                    className="text-3xl"
                  />
                  <div className="text-sm text-ink-500">
                    {selected.cadenceLabel}
                    {selected.cadence !== "monthly" && ` · ${selected.monthlyHint}`}
                  </div>
```

- [ ] **Step 4: Run the app & verify Spotify**

Run: open Verträge. Spotify appears under **"Alle 2 Monate"**, big number **6,99 €**, sub-line **"alle 2 Monate · ≈ 3,50 € / Monat"**.
Expected: no more bare "-3,49" that reads as the price.

- [ ] **Step 5: Commit**

```bash
git add src/components/contracts/contracts-view.tsx
git commit -m "fix(contracts): show real per-charge amount + monthly hint (Spotify 6,99)"
```

---

## Phase D — Prune & prevent false contracts (Issue 5)

### Task D1: Never hint blocklisted retail as subscription

**Files:**
- Modify: `src/lib/classify/normalize.ts`
- Test: `src/lib/classify/normalize.test.ts`

**Interfaces:**
- Produces: `isNonRecurringBrand(text: string): boolean` exported from `normalize.ts`; brand matching never returns `subscription: true` for a blocklisted brand.

- [ ] **Step 1: Inspect current brand matching**

Run: `sed -n '1,200p' src/lib/classify/normalize.ts | grep -n "subscription\|matchBrand\|BRAND\|export"`
Expected: locate `matchBrand` and the brand table with `subscription` flags.

- [ ] **Step 2: Write the failing test** (append to `normalize.test.ts`)

```ts
import { isNonRecurringBrand } from "./normalize";

describe("isNonRecurringBrand", () => {
  it("flags retail/food/marketplace merchants", () => {
    for (const s of ["REWE Markt", "ALDI SUED", "Konsum Leipzig", "Deutsche Bahn", "dm-drogerie", "MC DOENER"]) {
      expect(isNonRecurringBrand(s)).toBe(true);
    }
  });
  it("does not flag real subscriptions", () => {
    expect(isNonRecurringBrand("Spotify AB")).toBe(false);
    expect(isNonRecurringBrand("Netflix")).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/classify/normalize.test.ts -t "isNonRecurringBrand"`
Expected: FAIL ("isNonRecurringBrand is not a function").

- [ ] **Step 4: Implement**

Add near the top of `normalize.ts` (mirror the regex in `detect.ts:44-45` so both agree):

```ts
/** Retail/marketplace/cashflow noise — never a subscription/contract. */
export const NON_RECURRING_BRAND =
  /\b(rewe|aldi|lidl|edeka|rossmann|\bdm\b|konsum|amazon|vinted|kleiderkreisel|paypal|deutsche bahn|db vertrieb|getkong|playtomic|nextbike|studentenwerk|mc doener|doener|einzahlung|kartenpreis|dkb)\b/i;

export function isNonRecurringBrand(text: string): boolean {
  return NON_RECURRING_BRAND.test(text ?? "");
}
```

In `matchBrand` (wherever the matched brand object is returned), force `subscription: false` when `isNonRecurringBrand(matched.name || fingerprint)` — e.g. spread `{ ...brand, subscription: brand.subscription && !isNonRecurringBrand(brand.name) }`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/classify/normalize.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/lib/classify/normalize.ts src/lib/classify/normalize.test.ts
git commit -m "feat(classify): blocklisted retail brands never get subscription hint"
```

### Task D2: Blocklist is a hard block in detection

**Files:**
- Modify: `src/lib/recurring/detect.ts:174-177` (`isBlockedRetail`)
- Test: `src/lib/recurring/detect.test.ts`

**Interfaces:**
- Produces: `isBlockedRetail` returns `true` for blocklisted labels **even when `subscriptionHint` is true**.

- [ ] **Step 1: Write the failing test** (append)

```ts
  it("suppresses blocklisted retail even with a subscription hint", () => {
    const mk = (d: string): { id: string; bookingDate: string; amountCents: bigint; currency: string } =>
      ({ id: d, bookingDate: d, amountCents: -833n, currency: "EUR" });
    const res = detectRecurring(
      [{
        merchantId: "rewe", isSubscriptionHint: true, label: "REWE",
        txs: [mk("2026-05-02"), mk("2026-06-02"), mk("2026-07-02")],
      }],
      "2026-07-21",
    );
    expect(res).toHaveLength(0);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/recurring/detect.test.ts -t "blocklisted retail even"`
Expected: FAIL (REWE currently detected because hint bypasses the block).

- [ ] **Step 3: Implement** (`:174-177`)

```ts
function isBlockedRetail(label: string | undefined): boolean {
  return NON_RECURRING_LABELS.test(label ?? "");
}
```

Update the one caller (`:197`) to `if (isBlockedRetail(label)) return null;` (drop the `isSubscriptionHint` arg).

- [ ] **Step 4: Run full detect suite**

Run: `npx vitest run src/lib/recurring/detect.test.ts`
Expected: PASS. (If any legitimate-subscription test used a blocklisted word, rename its label — blocklist now wins by design.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring/detect.ts src/lib/recurring/detect.test.ts
git commit -m "fix(recurring): retail blocklist overrides subscription hint"
```

### Task D3: Delete (not "end") blocklisted recurring rows on every run

**Files:**
- Modify: `src/lib/recurring/apply.ts:239-244` (end-of-run reconciliation)

**Interfaces:**
- Consumes: `isNonRecurringBrand` from D1, `merchants.nameClean`.
- Produces: rows whose merchant is blocklisted are **deleted** (with their tx links cleared) instead of flipped to `ended`.

- [ ] **Step 1: Replace the reconciliation loop** (`:239-244`)

```ts
import { isNonRecurringBrand } from "@/lib/classify/normalize";
// …
  const existing = await db
    .select({ id: recurringItems.id, merchantId: recurringItems.merchantId, status: recurringItems.status, name: merchants.nameClean })
    .from(recurringItems)
    .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id));

  for (const e of existing) {
    const stillActive = activeKeys.has(`${e.merchantId}|${e.cadence}`);
    if (isNonRecurringBrand(e.name)) {
      // Falsch-Positiv (Supermarkt, Bahn …): ganz entfernen, nicht als "beendet" behalten.
      await db.update(transactions).set({ recurringItemId: null }).where(eq(transactions.recurringItemId, e.id));
      await db.delete(recurringItems).where(eq(recurringItems.id, e.id));
    } else if (!stillActive && e.status !== "ended") {
      await db.update(recurringItems).set({ status: "ended" }).where(eq(recurringItems.id, e.id));
    }
  }
```

Note: add `cadence: recurringItems.cadence` to the select so `activeKeys` lookup works.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/recurring/apply.ts
git commit -m "fix(recurring): delete blocklisted false-positives instead of ending them"
```

---

## Phase E — One-off data cleanup

### Task E1: Cleanup script

**Files:**
- Create: `scripts/cleanup-false-recurring.ts`

**Interfaces:**
- Consumes: `runRecurringDetection` (`src/lib/recurring/apply.ts`), `isNonRecurringBrand`.

- [ ] **Step 1: Check how existing scripts run**

Run: `ls scripts && head -20 scripts/*.ts 2>/dev/null`
Expected: reveals the runner (e.g. `tsx`, `dotenv` bootstrap). Mirror it.

- [ ] **Step 2: Write the script**

```ts
// scripts/cleanup-false-recurring.ts
import { db } from "@/db";
import { merchants, recurringItems, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isNonRecurringBrand } from "@/lib/classify/normalize";
import { runRecurringDetection } from "@/lib/recurring/apply";

async function main() {
  const rows = await db
    .select({ id: recurringItems.id, name: merchants.nameClean })
    .from(recurringItems)
    .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id));

  let deleted = 0;
  for (const r of rows) {
    if (!isNonRecurringBrand(r.name)) continue;
    await db.update(transactions).set({ recurringItemId: null }).where(eq(transactions.recurringItemId, r.id));
    await db.delete(recurringItems).where(eq(recurringItems.id, r.id));
    deleted += 1;
  }
  console.log(`Deleted ${deleted} false recurring items.`);
  const res = await runRecurringDetection();
  console.log(`Re-detected ${res.items} recurring items.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it**

Run: `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"; <runner> scripts/cleanup-false-recurring.ts`
Expected: prints a nonzero "Deleted N" (the ~27 rows: Aldi, REWE, Konsum ×3, Deutsche Bahn ×3, dm, MC Döner, nextbike, Studentenwerk, GETKONG, Playtomic, Kartenpreis, PayPal, Amazon, DKB, Einzahlung, Vinted, EDEKA, Rossmann, Apple? — Apple/Cursor/Perplexity are real subs, keep).

- [ ] **Step 4: Verify Beendet is clean**

Run: `psql "$DATABASE_URL" -c "select m.name_clean, ri.status from recurring_items ri join merchants m on m.id=ri.merchant_id where ri.status='ended' order by 1;"`
Expected: only genuine former subscriptions remain (no supermarkets/Bahn/marketplaces).

- [ ] **Step 5: Commit**

```bash
git add scripts/cleanup-false-recurring.ts
git commit -m "chore(recurring): one-off cleanup script for false-positive contracts"
```

---

## Phase F — Assistant rebuild (Issue 6: look, evidence, reliability)

### Task F1: System prompt — cite sources, no truncation

**Files:**
- Modify: `src/lib/chat/system.ts:1-12`

- [ ] **Step 1: Extend the prompt**

Append inside the template string, before the closing backtick:

```ts
- Schließe jede Antwort mit einer Zeile "Basis: …", die knapp nennt, welche Tools/Zeiträume/Filter du benutzt hast (z.B. "Basis: query_spending, Lebensmittel, 01.–21.07.").
- Antworte immer vollständig in einem Zug; brich Sätze nicht ab.
- Nenne konkrete Zahlen mit Zeitraum ("… im Juli", "… letzte 30 Tage"), niemals ohne Bezug.
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/chat/system.ts
git commit -m "feat(chat): system prompt requires source line + full answers"
```

### Task F2: Route — collect sources, stream final answer

**Files:**
- Modify: `src/app/api/chat/route.ts:101-207`

**Interfaces:**
- Produces: response is an SSE stream (`content-type: text/event-stream`). Events: `data: {"type":"sources","sources":[{tool,args,summary}]}`, repeated `data: {"type":"delta","text":"…"}`, final `data: {"type":"done"}`. Tool rounds run non-streamed; only the final assistant turn streams.

- [ ] **Step 1: Read the Next route-handler streaming guide**

Run: `sed -n '1,120p' node_modules/next/dist/docs/*route*handler* 2>/dev/null | head -120`
Expected: confirm how this Next version returns a streaming `Response` from a route handler.

- [ ] **Step 2: Track sources while running tools** (inside the tool loop, `:173-193`)

Add above the loop: `const sources: { tool: string; args: Record<string, unknown>; summary: string }[] = [];`
After `const result = await runTool(...)` add:

```ts
        sources.push({
          tool: tc.function.name,
          args,
          summary: summarizeToolResult(tc.function.name, args, result),
        });
```

Add a helper at module scope:

```ts
function summarizeToolResult(name: string, args: Record<string, unknown>, result: unknown): string {
  if (name === "query_spending" && Array.isArray(result)) {
    const top = (result as { label: string; amountFmt: string }[]).slice(0, 3)
      .map((r) => `${r.label} ${r.amountFmt}`).join(", ");
    return `${args.from}–${args.to}${args.filter ? ` · ${args.filter}` : ""}: ${top || "keine Treffer"}`;
  }
  if (name === "estimate_available" && result && typeof result === "object") {
    const r = result as { days?: number; availableFmt?: string };
    return `verfügbar in ${r.days} Tagen: ${r.availableFmt}`;
  }
  if (name === "list_recurring" && Array.isArray(result)) return `${result.length} aktive Verträge/Abos`;
  if (name === "list_balances") return `Kontosalden`;
  return name;
}
```

- [ ] **Step 3: When the model stops calling tools, re-request with `stream:true` and pipe SSE**

Replace the non-tool branch (`:196-198`) so that instead of returning the buffered content, it makes a final streamed call and forwards deltas. Concretely, when `!msg.tool_calls?.length`, break out of the loop and run:

```ts
  // Finaler Turn als Stream. `messages` enthält bereits alle Tool-Ergebnisse.
  const encoder = new TextEncoder();
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.3, stream: true }),
  });
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json({ error: `OpenRouter ${upstream.status}: ${text}` }, { status: 502 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ type: "sources", sources });
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sawAny = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const delta = j.choices?.[0]?.delta?.content;
            if (delta) { sawAny = true; send({ type: "delta", text: delta }); }
          } catch { /* ignore keep-alive lines */ }
        }
      }
      if (!sawAny) send({ type: "delta", text: "Ich konnte dazu keine Antwort bilden. Bitte formuliere die Frage etwas konkreter." });
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" },
  });
```

The `for (let round …)` loop now only handles tool rounds: keep its tool branch, and on the non-tool branch `break;` (the streaming block above runs after the loop). If all 4 rounds are exhausted with tools every time, fall through to the same streaming block anyway (drop the old "zu viele Datenabfragen" JSON return, or send it as a single delta).

- [ ] **Step 4: Manual verify the stream**

Run: `curl -N -s -X POST localhost:3000/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"Wie viel gebe ich für Lebensmittel aus?"}]}'`
Expected: a `sources` event, then incremental `delta` events, then `done` — no truncated blob.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/chat/route.ts"
git commit -m "feat(chat): stream final answer via SSE + emit tool sources"
```

### Task F3: Rewrite the chat UI (modern, streaming consumer, sources footer)

**Files:**
- Modify: `src/components/chat/finance-chat.tsx` (full rewrite)
- Modify: `src/app/(app)/assistant/page.tsx`

**Interfaces:**
- Consumes: the SSE events from F2 (`sources`, `delta`, `done`).

- [ ] **Step 1: Rewrite the component**

```tsx
// src/components/chat/finance-chat.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Source = { tool: string; args: Record<string, unknown>; summary: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };

const SUGGESTIONS = [
  "Wie viel gebe ich für Lebensmittel aus?",
  "Was kostet Essen gehen im letzten Monat?",
  "Welche Abos laufen gerade?",
  "Wie viel bleibt mir für die nächsten 10 Tage?",
  "Wo kann ich am ehesten sparen?",
];

function Sources({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return (
    <div className="mt-2 border-t border-hairline/60 pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-ink-700"
      >
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        Basis · {sources.length} {sources.length === 1 ? "Quelle" : "Quellen"}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {sources.map((s, i) => (
            <li key={i} className="text-[11.5px] leading-snug text-ink-500">
              <span className="font-medium text-ink-700">{s.tool}</span> — {s.summary}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FinanceChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    const history: Msg[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "", sources: [] }]);
    setInput("");
    setBusy(true);

    const patchLast = (fn: (m: Msg) => Msg) =>
      setMessages((cur) => cur.map((m, i) => (i === cur.length - 1 ? fn(m) : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const ev = JSON.parse(t.slice(5).trim()) as
            | { type: "sources"; sources: Source[] }
            | { type: "delta"; text: string }
            | { type: "done" };
          if (ev.type === "sources") patchLast((m) => ({ ...m, sources: ev.sources }));
          else if (ev.type === "delta") patchLast((m) => ({ ...m, content: m.content + ev.text }));
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages((cur) => cur.slice(0, -1)); // drop the empty assistant bubble
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-2xl flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {empty && (
          <div className="mx-auto max-w-md space-y-4 pt-10 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-[var(--accent)]">
              <Sparkles className="size-6" strokeWidth={1.75} />
            </span>
            <div>
              <div className="text-base font-semibold text-ink-900">Konto-Chat</div>
              <p className="mt-1 text-sm text-ink-500">
                Frag nach Ausgaben, Abos und Sparspielraum — Antworten basieren auf deinen echten Buchungen.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-xl border border-hairline bg-surface px-4 py-2.5 text-left text-sm text-ink-700 transition-colors hover:border-[var(--accent)] hover:text-ink-900"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <span className="mt-0.5 mr-2 grid size-7 shrink-0 place-items-center self-start rounded-lg bg-accent-soft text-[var(--accent)]">
                <Sparkles className="size-3.5" strokeWidth={2} />
              </span>
            )}
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "rounded-br-md bg-primary text-primary-foreground"
                  : "rounded-bl-md bg-surface text-ink-900 ring-1 ring-hairline",
              )}
            >
              {m.content || (busy && i === messages.length - 1 ? <Loader2 className="size-4 animate-spin text-ink-400" /> : null)}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
            </div>
          </div>
        ))}

        {error && (
          <p className="rounded-xl bg-expense-soft px-4 py-2.5 text-sm text-expense-strong">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="sticky bottom-0 flex items-end gap-2 border-t border-hairline bg-background/95 py-3 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder="Frag nach deinen Ausgaben, Abos, Sparspielraum…"
          className="max-h-32 min-h-[46px] flex-1 resize-none rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <Button type="submit" size="icon" className="size-11 rounded-2xl" disabled={busy || !input.trim()} aria-label="Senden">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Give the page room** (`src/app/(app)/assistant/page.tsx`)

Keep the `PageHeader`; the chat now owns its own height. No structural change needed, but confirm no parent container constrains height oddly — if the app shell adds padding, the `h-[calc(100dvh-9rem)]` may need tuning. Verify visually in Step 3.

- [ ] **Step 3: Run & verify UX**

Run: open Assistent. Confirm: centered column, empty-state suggestion list, avatar on assistant bubbles, streaming text appears token-by-token, "Basis · N Quellen" expander reveals which tool/period produced the numbers, composer sticks to the bottom.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/finance-chat.tsx "src/app/(app)/assistant/page.tsx"
git commit -m "feat(assistant): modern streaming chat UI with sources footer"
```

---

## Final verification

- [ ] **Full test suite**

Run: `npx vitest run`
Expected: all green (period, queries, detect, normalize, rules, recurring, apply, transfer, llm).

- [ ] **Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **End-to-end eyeball**
  - Dashboard: KPIs all carry a period line; "Fixkosten" (not "Abos"); balance toggle works; Sparen shows the plan (≥ 100 €) once detection re-runs.
  - Verträge: Spotify under "Alle 2 Monate" showing 6,99 €; "Beendet" has no supermarkets/Bahn/marketplaces.
  - Assistent: streaming answer + working "Basis" sources; ask "Wie viel Geld habe ich bei Konsum im Juli ausgegeben?" and confirm a complete, non-truncated answer.

---

## Self-review notes (coverage map)

- **Issue 1** (Einnahmen logic + "Abos" wrong term): A3–A4 (real-available makes the balance honest vs recurring), A6 (Fixkosten rename + period labels). Einnahmen mismatch is *explained* by different bases (month-to-date actual vs recurring monthly-equiv) and made legible by period labels; Dashboard total ≥ Verträge holds because Dashboard counts one-off income too.
- **Issue 2** (Sparen 0 → 100): B1–B4.
- **Issue 3** (no timeframe): A1, A2, A4, A6.
- **Issue 4** (Spotify -3,49 → 6,99): C1–C4.
- **Issue 5** (false ended contracts): D1–D3 + E1 (prune existing).
- **Issue 6** (assistant look / evidence / reliability): F1–F3 (A=design, B=evidence, C=reliability via full-stream + non-empty guard).

**Open decision surfaced during planning:** Spotify's real cadence in the data is genuinely every ~60 days (only PayPal-routed charges are imported). If the user actually pays 6,99 *monthly*, some monthly charges are missing from the source data — that's an import/coverage question, not a detection bug, and is out of scope here. The display fix (per-charge 6,99 + "alle 2 Monate") is correct for the data we have.
