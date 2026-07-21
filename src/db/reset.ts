import { sql } from "drizzle-orm";
import { db } from "./index";
import { categories } from "./schema";

/**
 * Löscht alle Finanzdaten (Transaktionen, Konten, Verbindungen, Merchants,
 * Regeln, Läufe) — behält Kategorien-Taxonomie und Auth/User.
 * Schutz: läuft nur gegen eine lokale DATABASE_URL, außer mit --force.
 */
const TABLES = [
  "transactions",
  "recurring_items",
  "merchants",
  "category_rules",
  "sync_runs",
  "llm_runs",
  "bank_accounts",
  "connections",
] as const;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const force = process.argv.includes("--force");
  if (!isLocal && !force) {
    console.error(`DATABASE_URL ist nicht lokal (${url}). Abbruch. Mit --force überschreiben.`);
    process.exit(1);
  }

  for (const t of TABLES) {
    const res = await db.execute(sql.raw(`DELETE FROM ${t}`));
    console.log(`  ${t}: ${res.count ?? 0} gelöscht`);
  }

  const count = (await db.select().from(categories)).length;
  console.log(`Reset fertig. Kategorien erhalten: ${count}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
