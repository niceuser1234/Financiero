import { and, eq, gte, lte, ilike, or, lt, sql, desc, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { transactions, categories, merchants } from "@/db/schema";

export interface TxFilter {
  q?: string;
  accountIds?: string[];
  categoryIds?: string[];
  from?: string;
  to?: string;
  minCents?: bigint;
  maxCents?: bigint;
  direction?: "in" | "out";
  includeTransfers?: boolean;
  /** Nur unsichere KI-Zuordnungen (confidence < 0.7). */
  needsReview?: boolean;
  /** Sortierung: "date" (Standard, neueste zuerst) oder "amount" (größter Betrag zuerst). */
  sort?: "date" | "amount";
  cursor?: string;
  limit?: number;
}

export interface TxListItem {
  id: string;
  bookingDate: string;
  amountCents: bigint;
  currency: string;
  counterpartyName: string | null;
  purpose: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  merchantName: string | null;
  categorizationSource: string;
  confidence: number | null;
  isTransfer: boolean;
  recurringItemId: string | null;
}

export interface TxListResult {
  items: TxListItem[];
  nextCursor: string | null;
  sumCents: bigint;
  count: number;
}

const DEFAULT_LIMIT = 50;

function buildWhere(f: TxFilter): SQL | undefined {
  const conds: (SQL | undefined)[] = [];

  if (f.q && f.q.trim()) {
    const like = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(transactions.counterpartyName, like),
        ilike(transactions.purpose, like),
        ilike(merchants.nameClean, like),
      ),
    );
  }
  if (f.accountIds?.length) conds.push(inArray(transactions.accountId, f.accountIds));
  if (f.categoryIds?.length) conds.push(inArray(transactions.categoryId, f.categoryIds));
  if (f.from) conds.push(gte(transactions.bookingDate, f.from));
  if (f.to) conds.push(lte(transactions.bookingDate, f.to));
  if (f.minCents !== undefined) conds.push(gte(transactions.amountCents, f.minCents));
  if (f.maxCents !== undefined) conds.push(lte(transactions.amountCents, f.maxCents));
  if (f.direction === "in") conds.push(gte(transactions.amountCents, 0n));
  if (f.direction === "out") conds.push(lt(transactions.amountCents, 0n));
  if (!f.includeTransfers) conds.push(eq(transactions.isTransfer, false));
  if (f.needsReview) {
    conds.push(eq(transactions.categorizationSource, "llm"));
    conds.push(lt(transactions.confidence, 0.7));
  }

  return and(...conds.filter((c): c is SQL => c !== undefined));
}

/** Transaktionsliste mit Filtern, Keyset-Pagination und Summe/Anzahl der Auswahl. */
export async function listTransactions(f: TxFilter): Promise<TxListResult> {
  const limit = f.limit ?? DEFAULT_LIMIT;
  const baseWhere = buildWhere(f);
  const sort = f.sort ?? "date";
  const absAmount = sql<bigint>`abs(${transactions.amountCents})`;

  // Aggregate über die gesamte gefilterte Menge (ohne Cursor).
  const [agg] = await db
    .select({
      sum: sql<string>`coalesce(sum(${transactions.amountCents}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(baseWhere);

  // Keyset-Cursor. Bei "date": "bookingDate|id"; bei "amount": "absBetrag|id".
  // Jeweils absteigend, damit "Mehr laden" stabil weiterblättert.
  let pageWhere = baseWhere;
  if (f.cursor) {
    const [ck, cid] = f.cursor.split("|");
    const keyset =
      sort === "amount"
        ? or(lt(absAmount, BigInt(ck)), and(eq(absAmount, BigInt(ck)), lt(transactions.id, cid)))
        : or(
            lt(transactions.bookingDate, ck),
            and(eq(transactions.bookingDate, ck), lt(transactions.id, cid)),
          );
    pageWhere = baseWhere ? and(baseWhere, keyset) : keyset;
  }

  const orderBy =
    sort === "amount"
      ? [desc(absAmount), desc(transactions.id)]
      : [desc(transactions.bookingDate), desc(transactions.id)];

  const rows = await db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      counterpartyName: transactions.counterpartyName,
      purpose: transactions.purpose,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      merchantName: merchants.nameClean,
      categorizationSource: transactions.categorizationSource,
      confidence: transactions.confidence,
      isTransfer: transactions.isTransfer,
      recurringItemId: transactions.recurringItemId,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(pageWhere)
    .orderBy(...orderBy)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = hasMore && last
    ? sort === "amount"
      ? `${last.amountCents < 0n ? -last.amountCents : last.amountCents}|${last.id}`
      : `${last.bookingDate}|${last.id}`
    : null;

  return {
    items,
    nextCursor,
    sumCents: BigInt(agg?.sum ?? "0"),
    count: agg?.count ?? 0,
  };
}
