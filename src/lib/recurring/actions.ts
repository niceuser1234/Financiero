"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { merchants, recurringItems, transactions } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { getRecurringPayments, type PaymentPoint } from "./queries";

export async function loadPayments(id: string): Promise<PaymentPoint[]> {
  await requireSession();
  return getRecurringPayments(id);
}

export async function updateRecurringKind(
  id: string,
  kind: "subscription" | "contract" | "income" | "other",
): Promise<void> {
  await requireSession();
  await db.update(recurringItems).set({ kind }).where(eq(recurringItems.id, id));
}

/** "Kein Abo": Item löschen und Merchant-Hint entfernen, damit es nicht neu erkannt wird. */
export async function dismissRecurring(id: string): Promise<void> {
  await requireSession();
  const [item] = await db.select().from(recurringItems).where(eq(recurringItems.id, id));
  if (!item) return;
  await db.update(transactions).set({ recurringItemId: null }).where(eq(transactions.recurringItemId, id));
  await db.update(merchants).set({ isSubscriptionHint: false }).where(eq(merchants.id, item.merchantId));
  await db.delete(recurringItems).where(eq(recurringItems.id, id));
}
