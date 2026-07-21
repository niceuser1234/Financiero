# Reset, OpenRouter Classification & Dashboard/Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset the app to a clean slate, re-import two real DKB CSV exports with working OpenRouter classification, and add time-independent upcoming debits, cadence-grouped contracts, and a visible "Sparen" savings category.

**Architecture:** Financiero is a Next.js 16 app (App Router, server components + server actions) with Drizzle ORM over Postgres. Transaction post-processing (`src/lib/classify/pipeline.ts`) runs after every import: transfer-match → rules → LLM → recurring-detect. This plan swaps the LLM step from the Anthropic Batches API to synchronous OpenRouter chat-completions, resets data, adds a savings category kind, and makes three UI/query refinements.

**Tech Stack:** TypeScript, Next.js 16, React 19, Drizzle ORM, Postgres 16, papaparse, Recharts, Vitest, Tailwind v4.

## Global Constraints

- **This is a modified Next.js** — read `node_modules/next/dist/docs/` before writing App-Router/framework code; heed deprecation notices (per `AGENTS.md`).
- Money is always `bigint` cents internally — never float. Use `parseGermanAmount` / `formatCents` from `src/lib/money.ts`.
- Negative currency strings use U+2212 (−), handled by `formatCents`.
- German UI copy and German code comments — match the existing style.
- Tests: Vitest, run serially against a **local** Postgres (`npm run test`). DB tests self-clean with unique markers (see `src/lib/classify/llm.test.ts` for the pattern). Postgres 16 is via Homebrew.
- New model id / provider values, verbatim: `CLASSIFY_MODEL=google/gemini-2.5-flash`, `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`.
- DRY, YAGNI, TDD, frequent commits. No new npm dependencies (use `fetch`).

---

## File Structure

- Create `src/db/reset.ts` — destructive financial-data wipe script (keeps categories + auth).
- Modify `src/db/schema.ts` — add `saving` to `categoryKindEnum`.
- Modify `src/db/seed.ts` — `saving` kind on `sparen-investieren`, add "Sparen" subcategory, seed "Sparplan" rule.
- Modify `src/lib/import/profiles.ts` — add `dkb_visa` profile + `ProfileId`.
- Create `src/lib/import/__fixtures__/dkb-visa.csv` — fixture from the real Visa export.
- Modify `src/lib/import/parse.test.ts` — `dkb_visa` parse test.
- Modify `src/lib/classify/llm.ts` — synchronous OpenRouter client + inline apply; delete batch/poll code.
- Rewrite `src/lib/classify/llm.test.ts` — fake chat client.
- Modify `src/lib/classify/prompt.ts` — prompt tuning from real data.
- Modify `src/lib/classify/pipeline.ts` — surface (log) classify failures, keep pipeline resilient.
- Create `src/lib/classify/actions.ts` — `getUnclassifiedCount`, `retryClassification` server actions.
- Create `src/components/classify/reclassify-banner.tsx` — dashboard retry banner (client).
- Modify `src/app/api/cron/sync/route.ts` — drop `pollAndApplyBatches`.
- Modify `src/lib/analytics/queries.ts` — upcoming next-2 (no window), `savingMonthCents`, exclude saving from expenses.
- Modify `src/lib/analytics/queries.test.ts` — upcoming + saving tests.
- Modify `src/lib/analytics/actions.ts` — `savingFmt` in `AnalyticsDTO`.
- Modify `src/app/(app)/dashboard/page.tsx` — Sparen KPI, upcoming copy, reclassify banner.
- Modify `src/lib/recurring/queries.ts` — `activeByCadence` grouping in `RecurringOverview`.
- Modify `src/lib/recurring/queries.test.ts` (or create) — grouping test.
- Modify `src/components/contracts/contracts-view.tsx` — cadence sections in Aktiv tab.
- Modify `.env` and `.env.example` — OpenRouter vars.

---

## Task 1: Reset script

**Files:**
- Create: `src/db/reset.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm run db:reset` — deletes financial data, keeps `categories` + auth.

- [ ] **Step 1: Write the reset script**

Create `src/db/reset.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "./index";

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

  const [{ count }] = (await db.execute(sql`SELECT count(*)::int AS count FROM categories`))
    .rows as { count: number }[];
  console.log(`Reset fertig. Kategorien erhalten: ${count}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, after `"db:seed"`, add:

```json
    "db:reset": "tsx src/db/reset.ts",
```

- [ ] **Step 3: Run it against local DB and verify output**

Run: `npm run db:reset`
Expected: prints a deleted-count line per table and `Reset fertig. Kategorien erhalten: <n>.` with n > 0. Exit 0.

- [ ] **Step 4: Verify categories + user survive, financial tables empty**

Run: `psql "$DATABASE_URL" -c "select (select count(*) from categories) as cats, (select count(*) from transactions) as tx, (select count(*) from bank_accounts) as acc;"`
Expected: `cats` > 0, `tx` = 0, `acc` = 0.

- [ ] **Step 5: Commit**

```bash
git add src/db/reset.ts package.json
git commit -m "feat(db): add db:reset script (financial data only, keeps taxonomy)"
```

---

## Task 2: Savings category kind + "Sparen" subcategory + Sparplan rule

**Files:**
- Modify: `src/db/schema.ts:22`
- Modify: `src/db/seed.ts`

**Interfaces:**
- Produces: `categoryKindEnum` includes `"saving"`; category slug `sparen-investieren-sparen` (name "Sparen", kind `saving`, parent `sparen-investieren`); a seeded `category_rules` row: purpose contains "Sparplan" → `sparen-investieren-sparen`.

- [ ] **Step 1: Add the enum value in schema**

In `src/db/schema.ts`, change line 22:

```ts
export const categoryKindEnum = pgEnum("category_kind", ["expense", "income", "transfer", "excluded", "saving"]);
```

- [ ] **Step 2: Push the enum change to the DB**

Run: `npm run db:push`
Expected: drizzle-kit applies `ALTER TYPE "category_kind" ADD VALUE 'saving'`; completes without error.

- [ ] **Step 3: Update the taxonomy + seed the rule in seed.ts**

In `src/db/seed.ts`, change the `sparen-investieren` line (currently line 78) to kind `saving` and add the subcategory right after it:

```ts
  { slug: "sparen-investieren", name: "Sparen & Investieren", icon: "piggy-bank", color: "#84cc16", kind: "saving" },
  { slug: "sparen-investieren-sparen", name: "Sparen", parent: "sparen-investieren", kind: "saving" },
```

Then, because categories are kept across resets and the existing insert uses
`onConflictDoNothing` (won't update the kind), add an explicit reconcile +
rule seed. Replace the final count block (currently lines 126–128) with:

```ts
  // Idempotenter Abgleich: kind von sparen-investieren aktualisieren (onConflict oben updated nicht).
  const { eq } = await import("drizzle-orm");
  await db.update(categories).set({ kind: "saving" }).where(eq(categories.slug, "sparen-investieren"));

  // Sparplan-Regel seeden: Verwendungszweck enthält "Sparplan" -> Sparen.
  const { categoryRules } = await import("./schema");
  const sparenId = bySlug.get("sparen-investieren-sparen");
  if (sparenId) {
    const existing = await db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.value, "Sparplan"));
    if (existing.length === 0) {
      await db.insert(categoryRules).values({
        field: "purpose",
        op: "contains",
        value: "Sparplan",
        categoryId: sparenId,
        createdFrom: "manual",
        priority: 10,
      });
    }
  }

  const count = (await db.select().from(categories)).length;
  console.log(`Seed fertig: ${count} Kategorien.`);
  process.exit(0);
```

Note: `bySlug` is repopulated from the DB at lines 107–108, so it already
contains `sparen-investieren-sparen` after the sub-category insert loop.

- [ ] **Step 4: Run the seed and verify**

Run: `npm run db:seed`
Expected: `Seed fertig: <n> Kategorien.` (n increased by 1 vs. before).

- [ ] **Step 5: Verify kind + rule in DB**

Run: `psql "$DATABASE_URL" -c "select slug,kind from categories where slug like 'sparen-investieren%'; select field,op,value from category_rules where value='Sparplan';"`
Expected: both `sparen-investieren` and `sparen-investieren-sparen` have `kind = saving`; one rule row `purpose | contains | Sparplan`.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/seed.ts
git commit -m "feat(db): add saving kind, Sparen subcategory and Sparplan rule"
```

---

## Task 3: DKB Visa Kreditkarte import profile

**Files:**
- Modify: `src/lib/import/profiles.ts`
- Create: `src/lib/import/__fixtures__/dkb-visa.csv`
- Modify: `src/lib/import/parse.test.ts`

**Interfaces:**
- Consumes: `parseGermanAmount`, `parseDmy` from existing code; `ParsedRow`, `CsvProfile`.
- Produces: `ProfileId` gains `"dkb_visa"`; `PROFILES.dkb_visa` maps the Visa CSV.

- [ ] **Step 1: Add the fixture**

Create `src/lib/import/__fixtures__/dkb-visa.csv` (UTF-8; a representative slice of the real export incl. metadata header, foreign currency, Einzahlung, Kartenpreis, Trade Republic):

```
"Karte";"Visa Kreditkarte";"4930 •••• •••• 3435"
""
"Saldo vom 21.07.2026:";"--32,04 EUR"
""
"Belegdatum";"Wertstellung";"Status";"Beschreibung";"Umsatztyp";"Betrag (€)";"Fremdwährungsbetrag"
"18.07.26";"20.07.26";"Gebucht";"KONSUM LEIPZIG EG";"Im Geschäft";"-10,05";""
"17.07.26";"16.07.26";"Gebucht";"Einzahlung";"Unbekannt";"200";""
"16.07.26";"17.07.26";"Gebucht";"ANTHROPIC* CLAUDE SUB";"Onlinezahlung";"-21,42";""
"05.07.26";"06.07.26";"Gebucht";"ROEDBY PUTTGARDEN CAT";"Im Geschäft";"-4,95";"-37,00 DKK"
"22.06.26";"22.06.26";"Gebucht";"Kartenpreis";"Entgelt";"-2,49";""
"05.02.26";"06.02.26";"Gebucht";"Trade Republic";"Onlinezahlung";"-303";""
```

- [ ] **Step 2: Write the failing parse test**

In `src/lib/import/parse.test.ts`, add (import `readFileSync`/`join` if not present — follow the file's existing fixture-loading pattern):

```ts
it("parst DKB Visa Kreditkarte inkl. Metazeilen und Beträge", () => {
  const content = readFileSync(join(__dirname, "__fixtures__/dkb-visa.csv"), "utf8");
  const { rows, errors } = parseCsv("dkb_visa", content);
  expect(errors).toHaveLength(0);
  expect(rows).toHaveLength(6);

  const konsum = rows[0];
  expect(konsum.bookingDate).toBe("2026-07-18");
  expect(konsum.valueDate).toBe("2026-07-20");
  expect(konsum.amountCents).toBe(-1005n);
  expect(konsum.counterpartyName).toBe("KONSUM LEIPZIG EG");
  expect(konsum.currency).toBe("EUR");

  const einzahlung = rows[1];
  expect(einzahlung.amountCents).toBe(20000n);
  expect(einzahlung.counterpartyName).toBe("Einzahlung");

  const tr = rows.find((r) => r.counterpartyName === "Trade Republic")!;
  expect(tr.amountCents).toBe(-30300n);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test -- src/lib/import/parse.test.ts`
Expected: FAIL — `dkb_visa` not assignable to `ProfileId` / `PROFILES[profileId]` undefined.

- [ ] **Step 4: Add the profile**

In `src/lib/import/profiles.ts`, change the `ProfileId` type (line 14):

```ts
export type ProfileId = "dkb" | "dkb_visa" | "revolut" | "paypal";
```

And add this entry to `PROFILES` (after the `dkb` entry):

```ts
  dkb_visa: {
    id: "dkb_visa",
    label: "DKB Visa Kreditkarte",
    delimiter: ";",
    sliceToHeader: (lines) => {
      const idx = lines.findIndex((l) => l.replace(/"/g, "").startsWith("Belegdatum"));
      return idx >= 0 ? lines.slice(idx) : lines;
    },
    map: (r) => {
      const desc = r["Beschreibung"] || null;
      return {
        bookingDate: parseDmy(r["Belegdatum"]),
        valueDate: r["Wertstellung"] ? parseDmy(r["Wertstellung"]) : null,
        amountCents: parseGermanAmount(r["Betrag (€)"] ?? r["Betrag"] ?? ""),
        currency: "EUR",
        counterpartyName: desc,
        counterpartyIban: null,
        purpose: desc,
        raw: r,
      };
    },
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/lib/import/parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Expose the profile in the import form**

In `src/app/(app)/settings/import/import-form.tsx`, find where profiles are
listed for the picker (it renders from `PROFILES` or a hardcoded list). If
hardcoded, add `{ id: "dkb_visa", label: "DKB Visa Kreditkarte" }` alongside the
existing `dkb` option. If it maps over `PROFILES`, no change is needed — verify
by loading `/settings/import` and confirming "DKB Visa Kreditkarte" appears.

- [ ] **Step 7: Commit**

```bash
git add src/lib/import/profiles.ts src/lib/import/__fixtures__/dkb-visa.csv src/lib/import/parse.test.ts src/app/(app)/settings/import/import-form.tsx
git commit -m "feat(import): add DKB Visa Kreditkarte CSV profile"
```

---

## Task 4: Synchronous OpenRouter classification

**Files:**
- Modify: `.env`, `.env.example`
- Modify: `src/lib/classify/llm.ts`
- Rewrite: `src/lib/classify/llm.test.ts`
- Modify: `src/lib/classify/prompt.ts`

**Interfaces:**
- Consumes: `buildSystemPrompt`, `buildUserContent`, `classificationSchema`, `normalizeClassification`, `type ClassificationItem`, `type FingerprintItem` from `prompt.ts`; `fingerprintOf` from `normalize.ts`.
- Produces:
  - `export interface ChatClient { chat(body: { model: string; system: string; user: string }): Promise<{ text: string; inputTokens: number; outputTokens: number }> }`
  - `export function chunk<T>(arr: T[], size: number): T[][]`
  - `export async function classifyUnknownFingerprints(client?: ChatClient): Promise<{ classified: number }>` — classifies **and applies** in one pass.
  - `pollAndApplyBatches` and `buildBatchRequests` are **removed**.

- [ ] **Step 1: Update env files**

In `.env.example`, replace lines 5–6:

```
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
CLASSIFY_MODEL=google/gemini-2.5-flash
```

In `.env`, set the same three keys (put the real `OPENROUTER_API_KEY` value; keep `OPENROUTER_BASE_URL` and `CLASSIFY_MODEL` as above). Remove `ANTHROPIC_API_KEY`.

- [ ] **Step 2: Rewrite the classify test with a fake chat client**

Replace `src/lib/classify/llm.test.ts` entirely:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, llmRuns, merchants, transactions } from "@/db/schema";
import { importHash } from "@/lib/import/hash";
import { fingerprintOf } from "./normalize";
import { chunk, classifyUnknownFingerprints, type ChatClient } from "./llm";

/** Fake-Client: liefert für jede angefragte id eine feste Klassifikation. */
function fakeClient(map: Record<string, { slug: string; name: string }>): ChatClient {
  return {
    chat: async ({ user }) => {
      const payload = JSON.parse(user.slice(user.indexOf("["))) as { id: string }[];
      const items = payload.map((p) => ({
        id: p.id,
        merchant_clean: map[p.id]?.name ?? "Unknown",
        category_slug: map[p.id]?.slug ?? "not_a_real_slug",
        is_subscription_hint: false,
        confidence: 0.95,
      }));
      return { text: JSON.stringify({ items }), inputTokens: 100, outputTokens: 20 };
    },
  };
}

const MARK = `__llmtest_${crypto.randomUUID()}__`;
let accountId: string;

async function ensureAccount() {
  if (accountId) return;
  const [a] = await db.insert(bankAccounts).values({ name: MARK, type: "checking", currency: "EUR" }).returning();
  accountId = a.id;
}

async function seedTx(cp: string, cents: bigint) {
  await db.insert(transactions).values({
    accountId,
    bookingDate: "2026-07-01",
    amountCents: cents,
    currency: "EUR",
    counterpartyName: cp,
    categorizationSource: "none",
    importHash: importHash({ accountId, bookingDate: "2026-07-01", amountCents: cents, currency: "EUR", counterparty: cp, purpose: null }),
  });
}

describe("chunking", () => {
  it("splits 250 items into 3 chunks of 100/100/50", () => {
    expect(chunk(Array.from({ length: 250 }), 100)).toHaveLength(3);
  });
});

describe("classifyUnknownFingerprints (synchronous)", () => {
  afterEach(async () => {
    if (accountId) await db.delete(transactions).where(eq(transactions.accountId, accountId));
    await db.delete(merchants).where(inArray(merchants.fingerprint, [fingerprintOf("GLSHOP", null), fingerprintOf("WEIRDCO", null)]));
    await db.delete(llmRuns).where(eq(llmRuns.model, "google/gemini-2.5-flash"));
    if (accountId) {
      await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
      accountId = "";
    }
  });

  it("applies results in one pass, learns merchants, caps invalid slug to sonstiges", async () => {
    await ensureAccount();
    await seedTx("GLSHOP", -1500n);
    await seedTx("GLSHOP", -1600n); // same fp -> one representative, both tx updated
    await seedTx("WEIRDCO", -4200n);

    const client = fakeClient({
      [fingerprintOf("GLSHOP", null)]: { slug: "lebensmittel-supermarkt", name: "GL Shop" },
      [fingerprintOf("WEIRDCO", null)]: { slug: "not_a_real_slug", name: "Weird Co" },
    });

    const out = await classifyUnknownFingerprints(client);
    expect(out.classified).toBe(3);

    const rows = await db.select().from(transactions).where(eq(transactions.accountId, accountId));
    const gl = rows.filter((r) => r.counterpartyName === "GLSHOP");
    const weird = rows.find((r) => r.counterpartyName === "WEIRDCO")!;
    expect(gl.every((r) => r.categorizationSource === "llm")).toBe(true);
    expect(gl[0].confidence).toBeCloseTo(0.95);
    expect(weird.confidence!).toBeLessThanOrEqual(0.3); // invalid slug capped
    expect(weird.merchantId).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- src/lib/classify/llm.test.ts`
Expected: FAIL — `ChatClient` / new signature not exported.

- [ ] **Step 4: Rewrite llm.ts (synchronous OpenRouter + inline apply)**

Replace `src/lib/classify/llm.ts` entirely:

```ts
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, llmRuns, merchants, transactions } from "@/db/schema";
import { fingerprintOf } from "./normalize";
import {
  buildSystemPrompt,
  buildUserContent,
  classificationSchema,
  normalizeClassification,
  type ClassificationItem,
  type FingerprintItem,
} from "./prompt";

const MODEL = process.env.CLASSIFY_MODEL ?? "google/gemini-2.5-flash";
const CHUNK_SIZE = 100;

/** Ein synchroner Chat-Aufruf. Real: OpenRouter; Tests: Fake. */
export interface ChatClient {
  chat(body: { model: string; system: string; user: string }): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}

/** Default: OpenRouter Chat Completions (OpenAI-kompatibel) via fetch. */
function defaultClient(): ChatClient {
  const base = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const key = process.env.OPENROUTER_API_KEY;
  return {
    async chat({ model, system, user }) {
      if (!key) throw new Error("OPENROUTER_API_KEY fehlt");
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "classification", strict: true, schema: classificationSchema },
          },
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: json.choices[0]?.message?.content ?? "{}",
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      };
    },
  };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function magnitude(cents: bigint): string {
  const eur = Math.abs(Number(cents)) / 100;
  return `~${Math.round(eur)} EUR`;
}

/**
 * Klassifiziert alle unbekannten Händler-Fingerprints synchron und wendet die
 * Ergebnisse direkt an (Merchants anlegen/aktualisieren + Transaktionen setzen).
 * Gibt die Anzahl aktualisierter Transaktionen zurück.
 */
export async function classifyUnknownFingerprints(
  client: ChatClient = defaultClient(),
): Promise<{ classified: number }> {
  const knownMerchants = new Set((await db.select({ fp: merchants.fingerprint }).from(merchants)).map((m) => m.fp));

  const rows = await db
    .select({
      id: transactions.id,
      counterpartyName: transactions.counterpartyName,
      purpose: transactions.purpose,
      amountCents: transactions.amountCents,
      accountType: bankAccounts.type,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(transactions.accountId, bankAccounts.id))
    .where(
      and(
        eq(transactions.isTransfer, false),
        isNull(transactions.merchantId),
        or(eq(transactions.categorizationSource, "none"), eq(transactions.categorizationSource, "import")),
      ),
    );

  // Ein Repräsentant + alle Tx-IDs je Fingerprint.
  const byFp = new Map<string, FingerprintItem>();
  const fpToTxIds = new Map<string, string[]>();
  for (const r of rows) {
    const fp = fingerprintOf(r.counterpartyName, r.purpose);
    if (!fp || knownMerchants.has(fp)) continue;
    if (!byFp.has(fp)) {
      byFp.set(fp, {
        id: fp,
        counterparty: r.counterpartyName,
        purpose: r.purpose,
        amountMagnitude: magnitude(r.amountCents),
        accountType: r.accountType,
      });
    }
    (fpToTxIds.get(fp) ?? fpToTxIds.set(fp, []).get(fp)!).push(r.id);
  }

  const items = [...byFp.values()];
  if (items.length === 0) return { classified: 0 };

  const cats = await db.select().from(categories);
  const slugToId = new Map(cats.map((c) => [c.slug, c.id]));
  const validSlugs = new Set(cats.map((c) => c.slug));
  const sonstigesId = slugToId.get("sonstiges")!;
  const system = buildSystemPrompt(cats.map((c) => ({ slug: c.slug, name: c.name })));

  let classified = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const batchId = crypto.randomUUID();
  await db.insert(llmRuns).values({ batchId, model: MODEL, itemCount: items.length, status: "running" });

  try {
    for (const group of chunk(items, CHUNK_SIZE)) {
      const { text, inputTokens: it, outputTokens: ot } = await client.chat({
        model: MODEL,
        system,
        user: buildUserContent(group),
      });
      inputTokens += it;
      outputTokens += ot;

      let parsed: { items?: ClassificationItem[] };
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }

      for (const item of parsed.items ?? []) {
        const norm = normalizeClassification(item, validSlugs);
        const categoryId = slugToId.get(norm.categorySlug) ?? sonstigesId;

        const [m] = await db
          .insert(merchants)
          .values({
            fingerprint: item.id,
            nameClean: norm.merchantClean,
            defaultCategoryId: categoryId,
            isSubscriptionHint: norm.isSubscription,
          })
          .onConflictDoUpdate({
            target: merchants.fingerprint,
            set: { nameClean: norm.merchantClean, defaultCategoryId: categoryId, isSubscriptionHint: norm.isSubscription },
          })
          .returning();

        const txIds = fpToTxIds.get(item.id) ?? [];
        if (txIds.length) {
          await db
            .update(transactions)
            .set({ categoryId, merchantId: m.id, categorizationSource: "llm", confidence: norm.confidence })
            .where(inArray(transactions.id, txIds));
          classified += txIds.length;
        }
      }
    }

    await db.update(llmRuns).set({ status: "ok", inputTokens, outputTokens }).where(eq(llmRuns.batchId, batchId));
  } catch (e) {
    await db.update(llmRuns).set({ status: "error", inputTokens, outputTokens }).where(eq(llmRuns.batchId, batchId));
    throw e;
  }

  return { classified };
}
```

- [ ] **Step 5: Run the classify test to verify it passes**

Run: `npm run test -- src/lib/classify/llm.test.ts`
Expected: PASS.

- [ ] **Step 6: Tune the system prompt from real data**

In `src/lib/classify/prompt.ts`, extend the `Regeln:` block in `buildSystemPrompt` (after the existing `is_subscription_hint` rule) with these lines:

```ts
- Sparpläne und Broker-Einzahlungen (z.B. "Trade Republic", "Scalable", Verwendungszweck "Sparplan"/"Einzahlung" an ein eigenes Depot) gehören zu "sparen-investieren-sparen".
- Kartengebühren ("Kartenpreis", Entgelt) -> "gebuehren-zinsen". Bargeld ("Bargeldabhebung", "Cashback") -> "bargeld".
- Krankenkasse (z.B. VIACTIV) -> "versicherungen-kranken". Fitness (EGYM Wellpass, Fitness First) -> "gesundheit-fitness-fitnessstudio". KI-/Software-Abos (Anthropic, Claude, Cursor, Perplexity) -> "abos-software-cloud". Spotify -> "abos-streaming". Deutsche Bahn (DB Vertrieb) -> "mobilitaet-oepnv-bahn".
```

(Insert them into the backtick template string as additional bullet lines.)

- [ ] **Step 7: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors (confirms nothing else imported `pollAndApplyBatches`/`buildBatchRequests` except the cron route, fixed in Task 5).
Note: if `tsc` reports the cron route error, that is expected and resolved in Task 5.

- [ ] **Step 8: Commit**

```bash
git add .env.example src/lib/classify/llm.ts src/lib/classify/llm.test.ts src/lib/classify/prompt.ts
git commit -m "feat(classify): synchronous OpenRouter classification (Gemini 2.5 Flash)"
```

---

## Task 5: Pipeline resilience + cron cleanup

**Files:**
- Modify: `src/lib/classify/pipeline.ts:15-25`
- Modify: `src/app/api/cron/sync/route.ts`

**Interfaces:**
- Consumes: `classifyUnknownFingerprints` (new signature) from `llm.ts`.
- Produces: `runPipeline` no longer references batch polling; cron route no longer imports `pollAndApplyBatches`.

- [ ] **Step 1: Make pipeline log (not silently swallow) classify errors**

In `src/lib/classify/pipeline.ts`, replace the try/catch block (lines 19–23):

```ts
  try {
    await classifyUnknownFingerprints();
  } catch (e) {
    // Klassifizierung darf den Import nicht abbrechen — aber Fehler sichtbar loggen.
    console.error("Klassifizierung fehlgeschlagen:", (e as Error).message);
  }
```

(The import at line 6 stays: `import { classifyUnknownFingerprints } from "./llm";`.)

- [ ] **Step 2: Remove batch polling from the cron route**

Replace `src/app/api/cron/sync/route.ts` entirely:

```ts
import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/banking/sync";
import { runPipeline } from "@/lib/classify/pipeline";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Klassifizierung läuft jetzt synchron innerhalb der Pipeline — kein Batch-Poll mehr.
  const stats = await runSync("cron", { postProcess: (ids) => runPipeline(ids) });

  return NextResponse.json({ ok: true, stats });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full classify + import test suites**

Run: `npm run test -- src/lib/classify src/lib/import`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/classify/pipeline.ts src/app/api/cron/sync/route.ts
git commit -m "refactor(classify): drop batch polling; log classify failures"
```

---

## Task 6: Reclassify banner + retry action

**Files:**
- Create: `src/lib/classify/actions.ts`
- Create: `src/components/classify/reclassify-banner.tsx`

**Interfaces:**
- Consumes: `classifyUnknownFingerprints` from `llm.ts`; `requireSession` from `@/lib/session`.
- Produces:
  - `export async function getUnclassifiedCount(): Promise<number>`
  - `export async function retryClassification(): Promise<{ classified: number }>`
  - `<ReclassifyBanner count={number} />` client component.

- [ ] **Step 1: Write the actions**

Create `src/lib/classify/actions.ts`:

```ts
"use server";

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { classifyUnknownFingerprints } from "./llm";

/** Anzahl nicht kategorisierter Ausgaben (kein Transfer, keine Kategorie). */
export async function getUnclassifiedCount(): Promise<number> {
  await requireSession();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(isNull(transactions.categoryId), eq(transactions.isTransfer, false), lt(transactions.amountCents, 0n)));
  return row?.n ?? 0;
}

/** Erneuter Klassifizierungslauf (Retry-Button). */
export async function retryClassification(): Promise<{ classified: number }> {
  await requireSession();
  return classifyUnknownFingerprints();
}
```

- [ ] **Step 2: Write the banner component**

Create `src/components/classify/reclassify-banner.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryClassification } from "@/lib/classify/actions";

export function ReclassifyBanner({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (count === 0) return null;

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-review-soft px-4 py-3 text-sm text-review">
      <span>
        {count} Umsatz{count === 1 ? "" : "e"} nicht klassifiziert.
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { classified } = await retryClassification();
            toast.success(`${classified} Umsätze klassifiziert`);
            router.refresh();
          })
        }
      >
        {pending ? "Läuft…" : "Erneut versuchen"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/classify/actions.ts src/components/classify/reclassify-banner.tsx
git commit -m "feat(classify): reclassify banner + retry server action"
```

(The banner is wired into the dashboard in Task 8.)

---

## Task 7: Analytics — upcoming next-2 + savings

**Files:**
- Modify: `src/lib/analytics/queries.ts`
- Modify: `src/lib/analytics/queries.test.ts`
- Modify: `src/lib/analytics/actions.ts`

**Interfaces:**
- Produces:
  - `DashboardData` gains `savingMonthCents: bigint`.
  - `upcoming` returns ≤2 items, ordered by `nextExpectedDate` asc, no date-window filter, income excluded.
  - `expensesMonthCents` excludes `saving`/`excluded`/`transfer`-kind categories.
  - `AnalyticsDTO` gains `savingFmt: string`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/analytics/queries.test.ts`, add two tests (follow the file's existing setup/marker pattern for seeding a `bankAccount`, `categories`, `recurringItems`, and `transactions`; reuse its helpers):

```ts
it("upcoming: gibt die nächsten 2 Abbuchungen zeitunabhängig zurück", async () => {
  // Arrange: 3 aktive recurring items mit nextExpectedDate weit in der Zukunft.
  // (weiter als 14 Tage — früher hätte das Fenster sie herausgefiltert)
  // ...seed helper aus dieser Datei nutzen...
  const d = await getDashboardData(new Date("2026-07-21"));
  expect(d.upcoming).toHaveLength(2);
  expect(Date.parse(d.upcoming[0].date)).toBeLessThanOrEqual(Date.parse(d.upcoming[1].date));
});

it("saving: Sparen zählt nicht als Ausgabe, aber in savingMonthCents", async () => {
  // Arrange: eine Transaktion in Kategorie kind='saving' (-100€) und eine echte Ausgabe (-20€) im laufenden Monat.
  const d = await getDashboardData(new Date("2026-07-21"), { from: "2026-07-01", to: "2026-07-31" });
  expect(d.savingMonthCents).toBe(-10000n);
  // Ausgaben enthalten NICHT die Sparen-Buchung:
  expect(d.expensesMonthCents).toBe(-2000n);
});
```

(Fill the arrange sections using the existing seeding helpers in this test file — insert the rows with concrete ids and dates as the other tests here do.)

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- src/lib/analytics/queries.test.ts`
Expected: FAIL — `savingMonthCents` undefined; `upcoming` returns windowed set / expenses include saving.

- [ ] **Step 3: Update the queries**

In `src/lib/analytics/queries.ts`:

(a) Add to the `DashboardData` interface: `savingMonthCents: bigint;`

(b) Replace the `flow` query (currently lines 68–74) so income/expense exclude
saving/excluded/transfer categories, and compute the saving sum. Insert after
the existing category load is not available yet, so use a join to `categories`:

```ts
  // Einnahmen / Ausgaben im Zeitraum — Spar-/ausgeschlossene/Transfer-Kategorien zählen nicht als Ausgabe.
  const excludedKinds = sql`coalesce(${categories.kind}, 'expense') in ('saving','excluded','transfer')`;
  const [flow] = await db
    .select({
      income: sql<string>`coalesce(sum(case when ${transactions.amountCents} > 0 and not (${excludedKinds}) then ${transactions.amountCents} else 0 end), 0)`,
      expense: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 and not (${excludedKinds}) then ${transactions.amountCents} else 0 end), 0)`,
      saving: sql<string>`coalesce(sum(case when ${transactions.amountCents} < 0 and coalesce(${categories.kind}, 'expense') = 'saving' then ${transactions.amountCents} else 0 end), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(inRange);
```

(c) In the returned object, add: `savingMonthCents: BigInt(flow?.saving ?? "0"),`

(d) Replace the `upcoming` query (currently lines 157–176) to drop the window
and limit to 2:

```ts
  // Anstehende Abbuchungen — zeitunabhängig, nur die nächsten 2.
  const upcoming = (
    await db
      .select({
        name: merchants.nameClean,
        date: recurringItems.nextExpectedDate,
        amount: recurringItems.amountLastCents,
      })
      .from(recurringItems)
      .innerJoin(merchants, eq(recurringItems.merchantId, merchants.id))
      .where(
        and(
          eq(recurringItems.status, "active"),
          sql`${recurringItems.kind} <> 'income'`,
          isNotNull(recurringItems.nextExpectedDate),
        ),
      )
      .orderBy(recurringItems.nextExpectedDate)
      .limit(2)
  ).map((r) => ({ name: r.name, date: r.date!, amountCents: r.amount }));
```

(e) Remove the now-unused `addDaysISO` helper (lines 47–49) and the `gte`/`lte`
imports if no longer referenced elsewhere in the file (keep `gte`/`lte` if the
trend/`inRange` code still uses them — it does, so leave the imports).

- [ ] **Step 4: Add savingFmt to the DTO**

In `src/lib/analytics/actions.ts`:

(a) Add to `AnalyticsDTO`: `savingFmt: string;`

(b) In the returned object of `getAnalyticsDTO`, add: `savingFmt: formatCents(d.savingMonthCents),`

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- src/lib/analytics/queries.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/queries.ts src/lib/analytics/queries.test.ts src/lib/analytics/actions.ts
git commit -m "feat(analytics): next-2 time-independent upcoming + savings sum"
```

---

## Task 8: Dashboard — Sparen KPI, upcoming copy, reclassify banner

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `AnalyticsDTO.savingFmt`, `getUnclassifiedCount`, `<ReclassifyBanner />`.

- [ ] **Step 1: Wire in the banner + Sparen KPI + copy**

In `src/app/(app)/dashboard/page.tsx`:

(a) Add imports:

```tsx
import { PiggyBank } from "lucide-react";
import { ReclassifyBanner } from "@/components/classify/reclassify-banner";
import { getUnclassifiedCount } from "@/lib/classify/actions";
```

(b) Add `getUnclassifiedCount()` to the `Promise.all` destructure:

```tsx
  const [dto, warnings, accounts, review, recent, unclassified] = await Promise.all([
    getAnalyticsDTO(),
    getConsentWarnings(),
    db.select().from(bankAccounts).orderBy(asc(bankAccounts.name)),
    fetchTransactions({ needsReview: true, limit: 1 }),
    fetchTransactions({ from, includeTransfers: false, limit: 5 }),
    getUnclassifiedCount(),
  ]);
```

(c) Render the banner directly below the consent `warnings.map(...)` block:

```tsx
      <ReclassifyBanner count={unclassified} />
```

(d) In the KPI grid, change the wrapper to 5 columns and add the Sparen card.
Replace the grid `div` (currently lines 70–75):

```tsx
      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Gesamtsaldo" value={dto.totalBalanceFmt} tone="accent" icon={Wallet} />
        <KpiCard label="Einnahmen / Monat" value={dto.incomeFmt} tone="income" />
        <KpiCard label="Ausgaben / Monat" value={dto.expensesFmt} tone="expense" />
        <KpiCard label="Sparen / Monat" value={dto.savingFmt} tone="neutral" icon={PiggyBank} />
        <KpiCard label="Abos / Monat" value={dto.subsFmt} tone="neutral" icon={Repeat} />
      </div>
```

(e) Change the upcoming card copy (currently line 170): `<CardDescription>Nächste 14 Tage</CardDescription>` → `<CardDescription>Nächste 2 Abbuchungen</CardDescription>`, and the empty-state message (line 178) → `message="Noch keine wiederkehrenden Abbuchungen erkannt."`.

- [ ] **Step 2: Typecheck + run the app**

Run: `npx tsc --noEmit`
Expected: no errors.

Then run: `npm run dev`, open `/dashboard`. Expected: 5 KPI cards including "Sparen / Monat"; upcoming card says "Nächste 2 Abbuchungen"; if uncategorized expenses exist, the reclassify banner shows with a working "Erneut versuchen" button.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/dashboard/page.tsx
git commit -m "feat(dashboard): Sparen KPI, next-2 copy, reclassify banner"
```

---

## Task 9: Contracts grouped by cadence

**Files:**
- Modify: `src/lib/recurring/queries.ts`
- Modify: `src/lib/recurring/queries.test.ts` (create if absent)
- Modify: `src/components/contracts/contracts-view.tsx`

**Interfaces:**
- Produces: `RecurringOverview` gains `activeByCadence: { monthly: RecurringDTO[]; quarterly: RecurringDTO[]; yearly: RecurringDTO[] }` (weekly merged into monthly). Existing fields (`subscriptions`, `income`, `ended`, `totalMonthlyFmt`, `activeCount`) unchanged.

- [ ] **Step 1: Write the failing test**

Create/append `src/lib/recurring/queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupByCadence } from "./queries";
import type { RecurringDTO } from "./queries";

function dto(cadence: string): RecurringDTO {
  return {
    id: cadence, merchantName: "X", categoryColor: "#000", cadence,
    cadenceLabel: cadence, kind: "subscription", monthlyEquivFmt: "0", monthlyEquivAbs: 0,
    amountLastFmt: "0", nextExpectedDate: null, nextRelative: null, status: "active", priceChanged: false,
  };
}

describe("groupByCadence", () => {
  it("bucketet monthly/quarterly/yearly und faltet weekly in monthly", () => {
    const g = groupByCadence([dto("monthly"), dto("weekly"), dto("quarterly"), dto("yearly")]);
    expect(g.monthly).toHaveLength(2); // monthly + weekly
    expect(g.quarterly).toHaveLength(1);
    expect(g.yearly).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- src/lib/recurring/queries.test.ts`
Expected: FAIL — `groupByCadence` not exported.

- [ ] **Step 3: Add grouping to queries.ts**

In `src/lib/recurring/queries.ts`:

(a) Export the helper (add near the top-level functions):

```ts
export interface ActiveByCadence {
  monthly: RecurringDTO[];
  quarterly: RecurringDTO[];
  yearly: RecurringDTO[];
}

/** Bucketet aktive Verträge nach Kadenz; weekly wird zu monthly gefaltet. */
export function groupByCadence(items: RecurringDTO[]): ActiveByCadence {
  const g: ActiveByCadence = { monthly: [], quarterly: [], yearly: [] };
  for (const r of items) {
    if (r.cadence === "quarterly") g.quarterly.push(r);
    else if (r.cadence === "yearly") g.yearly.push(r);
    else g.monthly.push(r); // monthly + weekly
  }
  return g;
}
```

(b) Add `activeByCadence: ActiveByCadence;` to the `RecurringOverview` interface.

(c) In `listRecurring`, before the `return`, compute it and include it:

```ts
  const activeByCadence = groupByCadence(subscriptions);
```

Add `activeByCadence,` to the returned object.

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- src/lib/recurring/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Render cadence sections in the Aktiv tab**

In `src/components/contracts/contracts-view.tsx`:

(a) The `overview` prop already carries `activeByCadence`. Replace the single
active list render with grouped sections. Change the `current` handling: keep
`einnahmen`/`beendet` as flat lists, but for `aktiv` render three labeled
sections. Replace the block from `const current = lists[status];` and the
`{current.length === 0 ? ... : (...)}` render with:

```tsx
  const flat = { einnahmen: overview.income, beendet: overview.ended };

  const CADENCE_SECTIONS: { key: "monthly" | "quarterly" | "yearly"; label: string }[] = [
    { key: "monthly", label: "Monatlich" },
    { key: "quarterly", label: "Vierteljährlich" },
    { key: "yearly", label: "Jährlich" },
  ];

  function CardsGrid({ items }: { items: RecurringDTO[] }) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((c) => (
          <button key={c.id} type="button" onClick={() => open(c)} className="text-left">
            <Card size="sm" className="transition-colors hover:border-[var(--accent)]">
              <CardContent className="flex items-center gap-3.5">
                <MerchantAvatar name={c.merchantName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink-900">{c.merchantName}</span>
                    <Repeat className="size-3.5 shrink-0 text-ink-400" strokeWidth={2} />
                    {c.priceChanged && (
                      <Badge variant="destructive" className="gap-1">
                        <TrendingUp className="size-3" />
                        Preis
                      </Badge>
                    )}
                    {c.status === "paused" && <Badge variant="review">ausgeblieben</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {c.cadenceLabel}
                    {c.nextRelative && c.status === "active" && ` · nächste ${c.nextRelative}`}
                  </div>
                </div>
                <Money.Text
                  value={c.monthlyEquivFmt}
                  tone={c.kind === "income" ? "income" : "neutral"}
                  className="min-w-[104px] text-right"
                />
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    );
  }
```

(b) Replace the conditional render body with:

```tsx
      {status === "aktiv" ? (
        overview.subscriptions.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Noch keine Verträge erkannt"
            message="Sobald wiederkehrende Buchungen auftauchen, findest du sie hier."
          />
        ) : (
          <div className="space-y-6">
            {CADENCE_SECTIONS.map(({ key, label }) =>
              overview.activeByCadence[key].length === 0 ? null : (
                <section key={key} className="space-y-3">
                  <h3 className="text-[11px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
                    {label}
                  </h3>
                  <CardsGrid items={overview.activeByCadence[key]} />
                </section>
              ),
            )}
          </div>
        )
      ) : flat[status].length === 0 ? (
        <EmptyState icon={Repeat} title="Nichts hier" message="Keine Verträge in dieser Ansicht." />
      ) : (
        <CardsGrid items={flat[status]} />
      )}
```

(Remove the now-unused `lists`/`current` variables. Keep the `Sheet` block and
everything else unchanged. The `status === "beendet"` "Beendet" badge in the old
inline card is dropped for simplicity — acceptable, the tab already labels it.)

- [ ] **Step 6: Typecheck + run the app**

Run: `npx tsc --noEmit`
Expected: no errors.

Then `npm run dev`, open `/contracts`, Aktiv tab. Expected: contracts grouped under Monatlich / Vierteljährlich / Jährlich headers; empty cadences hidden; Einnahmen/Beendet tabs still flat lists.

- [ ] **Step 7: Commit**

```bash
git add src/lib/recurring/queries.ts src/lib/recurring/queries.test.ts src/components/contracts/contracts-view.tsx
git commit -m "feat(contracts): group active contracts by cadence in Aktiv tab"
```

---

## Task 10: End-to-end verification with the real CSVs

**Files:** none (manual verification).

- [ ] **Step 1: Reset + reseed**

Run: `npm run db:reset && npm run db:seed`
Expected: financial tables empty, taxonomy present incl. `sparen-investieren-sparen`.

- [ ] **Step 2: Import both CSVs**

Start `npm run dev`. At `/settings/import`: import the Girokonto file with profile "DKB Girokonto" (new account, type checking), then the Visa file with profile "DKB Visa Kreditkarte" (new account, type credit_card). Ensure `OPENROUTER_API_KEY` is set so classification runs.

- [ ] **Step 3: Verify classification + savings**

Open `/transactions` and `/dashboard`. Expected:
- Most expenses categorized (KONSUM/ALDI/REWE → Lebensmittel, DB Vertrieb → Mobilität, Anthropic/Cursor → Abos, VIACTIV → Versicherungen, EGYM → Fitness).
- "Sparplan" giro rows (−100 to `Jonathan Lars Haberstroh`) land in **Sparen**; "Sparen / Monat" KPI is non-zero; Trade Republic card rows in Sparen (via LLM).
- Giro "DKB … DKB BANKING" ↔ card "Einzahlung" pairs marked as transfers (not counted as income/expense).

- [ ] **Step 4: Verify upcoming + contracts**

- `/dashboard` upcoming card shows at most 2 items ("Nächste 2 Abbuchungen").
- `/contracts` Aktiv tab shows Monatlich (VIACTIV, EGYM, Spotify, Claude, Cursor, Miete, Apple, Amazon Prime …), Jährlich (Adam Riese Privathaftpflicht) sections.

- [ ] **Step 5: Full test suite + lint**

Run: `npm run test && npm run lint && npx tsc --noEmit`
Expected: all green.

---

## Self-Review Notes

- **Spec coverage:** Reset (T1), OpenRouter+Gemini synchronous (T4), visible/retryable failures (T5+T6), upcoming next-2 (T7), contracts by cadence (T9), Sparen kind+subcategory+rule+KPI (T2+T7+T8), dkb_visa profile (T3), E2E with real data (T10). All spec sections mapped.
- **`llm_runs`:** kept, one row per synchronous run (simplified) — matches spec's "keep, simplify" lean.
- **Sparen detection:** Sparplan rule only (T2), per user's "keep it simple"; structural change shipped for future expansion.
- **Type consistency:** `classifyUnknownFingerprints` returns `{ classified }` everywhere (T4/T6); `ChatClient.chat` signature identical in fake (T4 test) and default; `activeByCadence` shape identical in `groupByCadence`, `RecurringOverview`, and the view (T9).
