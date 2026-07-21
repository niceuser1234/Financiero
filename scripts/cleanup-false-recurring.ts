import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { merchants, recurringItems, transactions } from "../src/db/schema";
import { isNonRecurringBrand } from "../src/lib/classify/normalize";
import { runRecurringDetection } from "../src/lib/recurring/apply";

/** Entfernt bereits gespeicherte Fehlalarme und baut die Erkennung danach neu auf. */
async function main() {
  const rows = await db
    .select({ id: recurringItems.id, name: merchants.nameClean })
    .from(recurringItems)
    .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id));

  let deleted = 0;
  for (const row of rows) {
    if (!isNonRecurringBrand(row.name)) continue;

    await db
      .update(transactions)
      .set({ recurringItemId: null })
      .where(eq(transactions.recurringItemId, row.id));
    await db.delete(recurringItems).where(eq(recurringItems.id, row.id));
    deleted += 1;
  }

  console.log(`Deleted ${deleted} false recurring items.`);
  const result = await runRecurringDetection();
  console.log(`Re-detected ${result.items} recurring items.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
