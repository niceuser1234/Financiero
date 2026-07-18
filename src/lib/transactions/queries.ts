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

  return and(...conds.filter((c): c is SQL => c !== undefined));
}

/** Transaktionsliste mit Filtern, Keyset-Pagination und Summe/Anzahl der Auswahl. */
export async function listTransactions(f: TxFilter): Promise<TxListResult> {
  const limit = f.limit ?? DEFAULT_LIMIT;
  const baseWhere = buildWhere(f);

  // Aggregate über die gesamte gefilterte Menge (ohne Cursor).
  const [agg] = await db
    .select({
      sum: sql<string>`coalesce(sum(${transactions.amountCents}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(baseWhere);

  // Keyset-Cursor "bookingDate|id" (absteigend).
  let pageWhere = baseWhere;
  if (f.cursor) {
    const [cd, cid] = f.cursor.split("|");
    const keyset = or(
      lt(transactions.bookingDate, cd),
      and(eq(transactions.bookingDate, cd), lt(transactions.id, cid)),
    );
    pageWhere = baseWhere ? and(baseWhere, keyset) : keyset;
  }

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
    .orderBy(desc(transactions.bookingDate), desc(transactions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor = hasMore && last ? `${last.bookingDate}|${last.id}` : null;

  return {
    items,
    nextCursor,
    sumCents: BigInt(agg?.sum ?? "0"),
    count: agg?.count ?? 0,
  };
}
