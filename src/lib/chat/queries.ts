import { and, eq, gte, lte, lt, sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, merchants, recurringItems, transactions } from "@/db/schema";
import { formatCents } from "@/lib/money";

function notTransfer() {
  return eq(transactions.isTransfer, false);
}

export async function querySpending(opts: {
  from: string;
  to: string;
  groupBy: "category" | "merchant";
  filter?: string;
}): Promise<{ label: string; amountFmt: string; amountCents: number; count: number }[]> {
  const range = and(
    gte(transactions.bookingDate, opts.from),
    lte(transactions.bookingDate, opts.to),
    notTransfer(),
    lt(transactions.amountCents, 0n),
  );

  if (opts.groupBy === "category") {
    const rows = await db
      .select({
        name: sql<string>`coalesce(${categories.name}, 'Nicht kategorisiert')`,
        slug: sql<string>`coalesce(${categories.slug}, 'none')`,
        sum: sql<string>`sum(${transactions.amountCents})`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          range,
          opts.filter
            ? sql`(
                lower(coalesce(${categories.name}, '')) like ${"%" + opts.filter.toLowerCase() + "%"}
                or lower(coalesce(${categories.slug}, '')) like ${"%" + opts.filter.toLowerCase() + "%"}
              )`
            : undefined,
        ),
      )
      .groupBy(sql`coalesce(${categories.name}, 'Nicht kategorisiert')`, sql`coalesce(${categories.slug}, 'none')`)
      .orderBy(sql`sum(${transactions.amountCents}) asc`)
      .limit(25);

    return rows.map((r) => ({
      label: r.name,
      amountCents: Number(r.sum),
      amountFmt: formatCents(BigInt(r.sum)),
      count: r.count,
    }));
  }

  const rows = await db
    .select({
      name: sql<string>`coalesce(${merchants.nameClean}, ${transactions.counterpartyName}, 'Unbekannt')`,
      sum: sql<string>`sum(${transactions.amountCents})`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(
      and(
        range,
        opts.filter
          ? sql`lower(coalesce(${merchants.nameClean}, ${transactions.counterpartyName}, '')) like ${"%" + opts.filter.toLowerCase() + "%"}`
          : undefined,
      ),
    )
    .groupBy(sql`coalesce(${merchants.nameClean}, ${transactions.counterpartyName}, 'Unbekannt')`)
    .orderBy(sql`sum(${transactions.amountCents}) asc`)
    .limit(25);

  return rows.map((r) => ({
    label: r.name,
    amountCents: Number(r.sum),
    amountFmt: formatCents(BigInt(r.sum)),
    count: r.count,
  }));
}

export async function listActiveRecurring() {
  const rows = await db
    .select({
      name: merchants.nameClean,
      kind: recurringItems.kind,
      cadence: recurringItems.cadence,
      monthly: recurringItems.monthlyEquivCents,
      next: recurringItems.nextExpectedDate,
      status: recurringItems.status,
      last: recurringItems.amountLastCents,
    })
    .from(recurringItems)
    .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id))
    .where(sql`${recurringItems.status} <> 'ended'`)
    .orderBy(sql`${recurringItems.monthlyEquivCents} asc`);

  return rows.map((r) => ({
    name: r.name,
    kind: r.kind,
    cadence: r.cadence,
    status: r.status,
    monthlyFmt: formatCents(r.monthly),
    monthlyCents: Number(r.monthly),
    lastFmt: formatCents(r.last),
    nextExpected: r.next,
  }));
}

export async function listBalances() {
  const accounts = await db.select().from(bankAccounts);
  const total = accounts.reduce((s, a) => s + (a.balanceCents ?? 0n), 0n);
  return {
    totalFmt: formatCents(total),
    totalCents: Number(total),
    accounts: accounts.map((a) => ({
      name: a.name,
      type: a.type,
      balanceFmt: formatCents(a.balanceCents ?? 0n),
      balanceCents: Number(a.balanceCents ?? 0n),
    })),
  };
}

/**
 * Schätzt verfügbares Geld für die nächsten `days` Tage:
 * Saldo − anstehende Verträge − durchschnittliche variable Tagesausgaben × Tage.
 */
export async function estimateAvailable(days: number, today = new Date()) {
  const d = Math.max(1, Math.min(90, Math.round(days)));
  const todayIso = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + d);
  const endIso = end.toISOString().slice(0, 10);

  const balances = await listBalances();

  // Anstehende wiederkehrende Lasten im Fenster
  const upcoming = await db
    .select({
      name: merchants.nameClean,
      date: recurringItems.nextExpectedDate,
      amount: recurringItems.amountLastCents,
      monthly: recurringItems.monthlyEquivCents,
      kind: recurringItems.kind,
    })
    .from(recurringItems)
    .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id))
    .where(
      and(
        eq(recurringItems.status, "active"),
        sql`${recurringItems.kind} <> 'income'`,
        sql`${recurringItems.nextExpectedDate} is not null`,
        sql`${recurringItems.nextExpectedDate} >= ${todayIso}`,
        sql`${recurringItems.nextExpectedDate} <= ${endIso}`,
      ),
    );

  const upcomingSum = upcoming.reduce((s, u) => s + Number(u.amount), 0);

  // Variable Ausgaben: 90-Tage-Schnitt der Nicht-Abo-Ausgaben
  const from90 = new Date(today);
  from90.setUTCDate(from90.getUTCDate() - 90);
  const from90Iso = from90.toISOString().slice(0, 10);

  const [flow] = await db
    .select({
      expense: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 then ${transactions.amountCents} else 0 end), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.bookingDate, from90Iso),
        lte(transactions.bookingDate, todayIso),
        notTransfer(),
        isNull(transactions.recurringItemId),
        sql`coalesce(${categories.kind}, 'expense') not in ('saving','excluded','transfer')`,
      ),
    );

  const expense90 = Number(flow?.expense ?? "0"); // negative
  const dailyVariable = expense90 / 90; // negative cents/day
  const variableProjected = Math.round(dailyVariable * d);

  // Monatliche Abos anteilig fürs Fenster (falls nextExpected außerhalb, trotzdem Pauschale)
  const [subs] = await db
    .select({ sum: sql<string>`coalesce(sum(${recurringItems.monthlyEquivCents}), 0)` })
    .from(recurringItems)
    .where(and(eq(recurringItems.status, "active"), sql`${recurringItems.kind} <> 'income'`));
  const monthlySubs = Number(subs?.sum ?? "0"); // negative
  const subsProRata = Math.round((monthlySubs * d) / 30);

  // Nutze max(|upcoming|, |subsProRata|) um Doppelzählung zu vermeiden → take upcoming known + residual portion
  // Einfach und konservativ: usend upcoming concrete + variable projected (Abos stecken oft in upcoming
  // oder werden über pro-rata abgedeckt wenn Fenster größer).
  const fixed = Math.min(upcomingSum, 0) !== 0 ? upcomingSum : subsProRata;
  const available = balances.totalCents + fixed + variableProjected;

  return {
    days: d,
    balanceFmt: balances.totalFmt,
    upcoming: upcoming.map((u) => ({
      name: u.name,
      date: u.date,
      amountFmt: formatCents(u.amount),
    })),
    upcomingSumFmt: formatCents(BigInt(upcomingSum)),
    variableProjectedFmt: formatCents(BigInt(variableProjected)),
    dailyVariableFmt: formatCents(BigInt(Math.round(dailyVariable))),
    availableFmt: formatCents(BigInt(available)),
    availableCents: available,
    note:
      "Schätzung: aktueller Saldo minus bekannte Vertragsabbuchungen im Zeitraum minus durchschnittliche variable Tagesausgaben (90-Tage-Schnitt, ohne erkannte Abos).",
  };
}

export async function snapshotForPrompt(today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10);
  const monthStart = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const from30 = new Date(today);
  from30.setUTCDate(from30.getUTCDate() - 30);
  const from30Iso = from30.toISOString().slice(0, 10);

  const [balances, recurring, catsMonth, cats30, topMerchants, available] = await Promise.all([
    listBalances(),
    listActiveRecurring(),
    querySpending({ from: monthStart, to: todayIso, groupBy: "category" }),
    querySpending({ from: from30Iso, to: todayIso, groupBy: "category" }),
    querySpending({ from: from30Iso, to: todayIso, groupBy: "merchant" }),
    estimateAvailable(14, today),
  ]);

  return {
    today: todayIso,
    balances,
    recurring,
    spendingThisMonth: catsMonth,
    spendingLast30Days: cats30,
    topMerchantsLast30Days: topMerchants.slice(0, 10),
    availableNext14Days: available,
  };
}
