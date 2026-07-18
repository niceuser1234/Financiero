# Financiero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Spec: [`docs/superpowers/specs/2026-07-18-financiero-design.md`](../specs/2026-07-18-financiero-design.md) — bei Detailfragen gilt die Spec.
> Konvention dieses Plans: Kernlogik (Schema, Parser, Matcher, Detector, API-Clients) steht hier als vollständiger Code mit TDD-Steps. UI-Tasks definieren exakte Routen/Komponenten + Akzeptanzkriterien; vor jeder UI-Phase die Skills `frontend-design` und (für Charts) `dataviz` laden.

**Goal:** Persönlicher Finanzguru-Klon: DKB/Revolut via Enable Banking, PayPal via CSV+Unwrapping, LLM-Kategorisierung, Abo-Erkennung, Dashboard, PWA.

**Architecture:** Next.js-15-Monolith (App Router) + Postgres/Drizzle; ein idempotenter Sync-Pfad (fetch → normalize → dedupe → unwrap → transfer-match → rules → LLM-batch → recurring); Vercel Cron.

**Tech Stack:** TypeScript, Next.js 15, React 19, Tailwind v4, shadcn/ui, Recharts, Drizzle ORM, PostgreSQL 16, better-auth, Zod, Vitest, `@anthropic-ai/sdk`, papaparse, date-fns.

## Global Constraints

- Beträge immer `bigint` Cents, niemals Float. Anzeige via `Intl.NumberFormat("de-DE", {style:"currency", currency})`.
- Alle Secrets nur serverseitig (`server-only`-Import in lib-Modulen, die Keys anfassen).
- Jede Kernlogik-Datei in `src/lib/**` ist UI-frei und hat eine Vitest-Datei.
- Klassifizierungsmodell: `process.env.CLASSIFY_MODEL ?? "claude-opus-4-8"`. Kein `temperature`, kein Prefill (400 auf Opus 4.8). Structured Output via `output_config.format` (strict, `additionalProperties: false`).
- Enable-Banking-Feldnamen beim Implementieren gegen https://enablebanking.com/docs/ verifizieren (Struktur unten ist Vertragsgrundlage, exakte Keys können abweichen).
- Commits: Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`), nach jedem grünen Task.
- Sprache der UI: Deutsch. Code/Identifier: Englisch.

**Env-Vars (`.env.example` in Task 0.1 anlegen):**

```
DATABASE_URL=postgres://financiero:financiero@localhost:5432/financiero
BETTER_AUTH_SECRET=            # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000
ENABLE_BANKING_APP_ID=         # Enable Banking Control Panel
ENABLE_BANKING_PRIVATE_KEY=    # PEM, base64-encoded (eine Zeile)
ANTHROPIC_API_KEY=
CLASSIFY_MODEL=claude-opus-4-8
ENCRYPTION_KEY=                # openssl rand -hex 32 (AES-256-GCM)
CRON_SECRET=                   # openssl rand -hex 32
APP_BASE_URL=http://localhost:3000
```

---

## Phase 0 — Scaffold

### Task 0.1: Projekt aufsetzen

**Files:** Create: gesamtes Scaffold, `docker-compose.yml`, `.env.example`, `vitest.config.ts`, `drizzle.config.ts`

- [ ] **Step 1:** Scaffold + Dependencies:

```bash
cd /Users/admin/Desktop/Financiero
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack
npm i drizzle-orm postgres better-auth @anthropic-ai/sdk zod papaparse date-fns server-only
npm i -D drizzle-kit vitest @vitest/coverage-v8 @types/papaparse tsx
npx shadcn@latest init -d
npx shadcn@latest add button card input table badge sheet dialog select tabs sonner skeleton dropdown-menu
```

- [ ] **Step 2:** `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: financiero
      POSTGRES_PASSWORD: financiero
      POSTGRES_DB: financiero
    ports: ["5432:5432"]
    volumes: [dbdata:/var/lib/postgresql/data]
volumes:
  dbdata:
```

- [ ] **Step 3:** `drizzle.config.ts` (`schema: "./src/db/schema.ts"`, `out: "./drizzle"`, dialect postgresql, url aus env), `vitest.config.ts` (`environment: "node"`, include `src/**/*.test.ts`), `.env.example` (siehe Global Constraints), `.env` lokal befüllen.
- [ ] **Step 4:** `docker compose up -d && npm run dev` → Startseite lädt. `npx vitest run` → „no tests" ok.
- [ ] **Step 5:** Commit `chore: scaffold next.js app with drizzle, better-auth deps, docker postgres`

### Task 0.2: Auth + App-Shell

**Files:** Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(app)/layout.tsx` (Sidebar/Bottom-Tabs-Shell mit Platzhalter-Routen dashboard/transactions/contracts/analysis/settings)

**Interfaces — Produces:** `auth` (better-auth Server-Instanz mit drizzleAdapter), `requireSession()` Helper für Server Components/Actions.

- [ ] **Step 1:** better-auth mit `emailAndPassword: { enabled: true }` + Drizzle-Adapter konfigurieren; Auth-Schema via `npx @better-auth/cli generate` in `src/db/auth-schema.ts` erzeugen.
- [ ] **Step 2:** Signup-Sperre: in `auth.ts` `databaseHooks.user.create.before` → wirft, wenn bereits ein User existiert.
- [ ] **Step 3:** `src/middleware.ts`: alles außer `/login`, `/api/auth/*`, `/api/cron/*`, `/api/banking/callback` erfordert Session-Cookie, sonst Redirect `/login`.
- [ ] **Step 4:** Shell-Layout: Desktop-Sidebar (5 Nav-Punkte, lucide-Icons), Mobile `fixed bottom-0` Tab-Bar; aktive Route markiert. Akzeptanz: Login → Redirect `/dashboard`; ohne Session → `/login`.
- [ ] **Step 5:** Commit `feat: auth with single-user signup lock and app shell`

---

## Phase 1 — Datenmodell

### Task 1.1: Drizzle-Schema komplett

**Files:** Create: `src/db/schema.ts`, `src/db/index.ts`, `src/db/seed.ts` · Test: `src/db/schema.test.ts` (Smoke: Insert/Select transactions)

**Interfaces — Produces:** alle Tabellen + Typen (`Transaction`, `NewTransaction`, `BankAccount`, `Category`, `Merchant`, `RecurringItem`, …) via `typeof table.$inferSelect`.

- [ ] **Step 1:** `src/db/schema.ts` — vollständig:

```ts
import { pgTable, pgEnum, text, bigint, boolean, date, timestamp, integer, real, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
export * from "./auth-schema";

export const providerEnum = pgEnum("provider", ["enable_banking", "csv"]);
export const connectionStatusEnum = pgEnum("connection_status", ["active", "expired", "revoked"]);
export const accountTypeEnum = pgEnum("account_type", ["checking", "credit_card", "emoney"]);
export const catSourceEnum = pgEnum("categorization_source", ["rule", "llm", "manual", "import", "none"]);
export const categoryKindEnum = pgEnum("category_kind", ["expense", "income", "transfer", "excluded"]);
export const ruleFieldEnum = pgEnum("rule_field", ["counterparty", "purpose", "fingerprint"]);
export const ruleOpEnum = pgEnum("rule_op", ["equals", "contains", "regex"]);
export const ruleOriginEnum = pgEnum("rule_origin", ["manual", "correction"]);
export const cadenceEnum = pgEnum("cadence", ["weekly", "monthly", "quarterly", "yearly"]);
export const recurringKindEnum = pgEnum("recurring_kind", ["subscription", "contract", "income", "other"]);
export const recurringStatusEnum = pgEnum("recurring_status", ["active", "paused", "ended"]);
export const syncTriggerEnum = pgEnum("sync_trigger", ["cron", "manual", "import"]);
export const runStatusEnum = pgEnum("run_status", ["running", "ok", "error"]);

export const connections = pgTable("connections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: providerEnum("provider").notNull(),
  aspspName: text("aspsp_name").notNull(),
  aspspCountry: text("aspsp_country").notNull().default("DE"),
  sessionIdEnc: text("session_id_enc"),
  status: connectionStatusEnum("status").notNull().default("active"),
  consentValidUntil: timestamp("consent_valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  connectionId: text("connection_id").references(() => connections.id),
  ebAccountUid: text("eb_account_uid").unique(),
  name: text("name").notNull(),
  ibanMasked: text("iban_masked"),
  type: accountTypeEnum("type").notNull().default("checking"),
  currency: text("currency").notNull().default("EUR"),
  balanceCents: bigint("balance_cents", { mode: "bigint" }),
  balanceUpdatedAt: timestamp("balance_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("circle"),
  color: text("color").notNull().default("#8884d8"),
  kind: categoryKindEnum("kind").notNull().default("expense"),
  sort: integer("sort").notNull().default(0),
});

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fingerprint: text("fingerprint").notNull().unique(),
  nameClean: text("name_clean").notNull(),
  defaultCategoryId: text("default_category_id").references(() => categories.id),
  isSubscriptionHint: boolean("is_subscription_hint").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recurringItems = pgTable("recurring_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  cadence: cadenceEnum("cadence").notNull(),
  kind: recurringKindEnum("kind").notNull().default("subscription"),
  amountLastCents: bigint("amount_last_cents", { mode: "bigint" }).notNull(),
  amountMedianCents: bigint("amount_median_cents", { mode: "bigint" }).notNull(),
  monthlyEquivCents: bigint("monthly_equiv_cents", { mode: "bigint" }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  nextExpectedDate: date("next_expected_date"),
  status: recurringStatusEnum("status").notNull().default("active"),
  priceChangedAt: date("price_changed_at"),
  firstSeen: date("first_seen").notNull(),
  lastSeen: date("last_seen").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("recurring_merchant_cadence").on(t.merchantId, t.cadence)]);

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id").notNull().references(() => bankAccounts.id),
  bookingDate: date("booking_date").notNull(),
  valueDate: date("value_date"),
  amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  counterpartyName: text("counterparty_name"),
  counterpartyIban: text("counterparty_iban"),
  purpose: text("purpose"),
  merchantId: text("merchant_id").references(() => merchants.id),
  categoryId: text("category_id").references(() => categories.id),
  categorizationSource: catSourceEnum("categorization_source").notNull().default("none"),
  confidence: real("confidence"),
  isTransfer: boolean("is_transfer").notNull().default(false),
  transferPairId: text("transfer_pair_id"),
  recurringItemId: text("recurring_item_id").references(() => recurringItems.id),
  ebEntryRef: text("eb_entry_ref"),
  importHash: text("import_hash").notNull(),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tx_import_hash").on(t.importHash),
  uniqueIndex("tx_eb_ref").on(t.accountId, t.ebEntryRef),
  index("tx_booking").on(t.bookingDate),
  index("tx_account_booking").on(t.accountId, t.bookingDate),
  index("tx_category").on(t.categoryId),
]);

export const categoryRules = pgTable("category_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  priority: integer("priority").notNull().default(100),
  field: ruleFieldEnum("field").notNull(),
  op: ruleOpEnum("op").notNull(),
  value: text("value").notNull(),
  categoryId: text("category_id").notNull().references(() => categories.id),
  createdFrom: ruleOriginEnum("created_from").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  trigger: syncTriggerEnum("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: runStatusEnum("status").notNull().default("running"),
  stats: jsonb("stats"),
  error: text("error"),
});

export const llmRuns = pgTable("llm_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  batchId: text("batch_id").notNull(),
  model: text("model").notNull(),
  itemCount: integer("item_count").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  status: runStatusEnum("status").notNull().default("running"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fxRates = pgTable("fx_rates", {
  date: date("date").notNull(),
  currency: text("currency").notNull(),
  rateToEur: real("rate_to_eur").notNull(),
}, (t) => [uniqueIndex("fx_date_ccy").on(t.date, t.currency)]);
```

- [ ] **Step 2:** `src/db/index.ts`: postgres.js-Client + `drizzle(client, { schema })`, Export `db`.
- [ ] **Step 3:** `src/db/seed.ts`: Taxonomie aus Spec §7.4 als Array `{slug, name, parent, icon, color, kind}` (16 Hauptkategorien + Subkategorien, `umbuchung` mit `kind: "transfer"`, `einkommen`-Zweig `kind: "income"`); Upsert per `onConflictDoNothing`. Script `db:seed` in package.json (`tsx src/db/seed.ts`).
- [ ] **Step 4:** `npx drizzle-kit push && npm run db:seed`; Smoke-Test schreibt+liest eine Transaktion. `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat: complete database schema with category taxonomy seed`

### Task 1.2: Geld-, Hash- und Crypto-Helfer

**Files:** Create: `src/lib/money.ts`, `src/lib/import/hash.ts`, `src/lib/crypto.ts` · Tests: gleichnamige `.test.ts`

**Interfaces — Produces:**
`formatCents(cents: bigint, currency?: string): string` ·
`parseGermanAmount(s: string): bigint` (wirft bei Unparsbarem) ·
`importHash(i: {accountId: string; bookingDate: string; amountCents: bigint; currency: string; counterparty?: string|null; purpose?: string|null}): string` ·
`encrypt(plain: string): string` / `decrypt(enc: string): string` (AES-256-GCM, Format `iv:tag:cipher` hex)

- [ ] **Step 1:** Failing Tests:

```ts
// src/lib/money.test.ts
import { describe, expect, it } from "vitest";
import { formatCents, parseGermanAmount } from "./money";
describe("money", () => {
  it("formats cents de-DE", () => expect(formatCents(-123456n)).toBe("-1.234,56 €"));
  it("parses german amounts", () => {
    expect(parseGermanAmount("-1.234,56")).toBe(-123456n);
    expect(parseGermanAmount("12,00 €")).toBe(1200n);
  });
  it("parses english csv amounts (revolut)", () => expect(parseGermanAmount("-9.99")).toBe(-999n));
});
// src/lib/import/hash.test.ts
import { importHash } from "./hash";
it("is stable and whitespace/case-insensitive", () => {
  const a = importHash({ accountId: "x", bookingDate: "2026-07-01", amountCents: -999n, currency: "EUR", counterparty: "Netflix", purpose: "ABO  123" });
  const b = importHash({ accountId: "x", bookingDate: "2026-07-01", amountCents: -999n, currency: "EUR", counterparty: "NETFLIX ", purpose: "abo 123" });
  expect(a).toBe(b);
  expect(a).toHaveLength(64);
});
```

  `parseGermanAmount`-Heuristik: enthält `,` → deutsch (Punkte = Tausender); sonst englisch (letzter Punkt = Dezimal). Währungszeichen/Spaces strippen.
- [ ] **Step 2:** `npx vitest run` → FAIL (Module fehlen).
- [ ] **Step 3:** Implementieren (`node:crypto` sha256/AES-GCM; Normalisierung im Hash: lowercase, `\s+`→` `, trim).
- [ ] **Step 4:** `npx vitest run` → PASS.
- [ ] **Step 5:** Commit `feat: money parsing, import hash, aes-gcm crypto helpers`

---

## Phase 2 — Enable Banking

### Task 2.1: Enable-Banking-Client

**Files:** Create: `src/lib/banking/types.ts`, `src/lib/banking/enable-banking.ts` · Test: `src/lib/banking/enable-banking.test.ts` (JWT-Erzeugung + URL-Bau, fetch gemockt)

**Interfaces — Produces (`types.ts`):**

```ts
export interface ProviderAccount { uid: string; name: string; ibanMasked: string | null; currency: string; type: "checking" | "credit_card" | "emoney"; }
export interface ProviderBalance { accountUid: string; amountCents: bigint; currency: string; }
export interface ProviderTransaction {
  accountUid: string; entryRef: string | null; bookingDate: string; valueDate: string | null;
  amountCents: bigint; currency: string; counterpartyName: string | null;
  counterpartyIban: string | null; purpose: string | null; raw: unknown;
}
export interface BankProvider {
  startAuth(aspsp: { name: string; country: string }, state: string): Promise<{ url: string }>;
  completeAuth(code: string): Promise<{ sessionId: string; validUntil: string | null; accounts: ProviderAccount[] }>;
  fetchBalances(sessionId: string, accountUids: string[]): Promise<ProviderBalance[]>;
  fetchTransactions(sessionId: string, accountUid: string, sinceISO: string): Promise<ProviderTransaction[]>;
}
```

- [ ] **Step 1:** `enable-banking.ts`: Basis `https://api.enablebanking.com`; `makeJwt()` mit `node:crypto` `createSign("RSA-SHA256")`, Header `{alg:"RS256", kid: APP_ID}`, Payload `{iss:"enablebanking.com", aud:"api.enablebanking.com", iat, exp: iat+3600}`; Key aus `ENABLE_BANKING_PRIVATE_KEY` (base64→PEM). Methoden: `getAspsps(country)`, `startAuth` (`POST /auth` mit `redirect_url = APP_BASE_URL + "/api/banking/callback"`, `state`), `completeAuth` (`POST /sessions {code}`), `fetchBalances`, `fetchTransactions` (`date_from`, Schleife über `continuation_key`). Beträge → Cents via `parseGermanAmount`-Äquivalent für API-Decimal-Strings (`Math.round(Number(v)*100)` vermeiden → String-Split-Parser `decimalToCents(s: string): bigint` mit Test). Fehler: Response-Status ≠ 2xx → typed `EnableBankingError` mit Status + Body.
- [ ] **Step 2:** Tests: JWT hat 3 Segmente + korrekten Header; `decimalToCents("-12.5")===-1250n`, `decimalToCents("3")===300n`; Pagination folgt `continuation_key` (fetch-Mock 2 Seiten). FAIL → implement → PASS.
- [ ] **Step 3:** ⚠️ Live-Verifikation (manuell, einmalig): Enable-Banking-App im Control Panel anlegen, `GET /aspsps?country=DE` mit echtem Key via `npx tsx scripts/eb-smoke.ts` → DKB in Liste. Feldnamen ggf. hier korrigieren.
- [ ] **Step 4:** Commit `feat: enable banking client with jwt auth and pagination`

### Task 2.2: Connect-Flow (UI + Callback)

**Files:** Create: `src/app/(app)/settings/connections/page.tsx`, `src/lib/banking/actions.ts` (Server Actions `startBankConnect`, Liste), `src/app/api/banking/callback/route.ts`

**Interfaces — Consumes:** `BankProvider` aus Task 2.1, `encrypt` aus 1.2. **Produces:** `connections`+`bank_accounts`-Zeilen; Callback-Route.

- [ ] **Step 1:** Settings-Seite: ASPSP-Auswahl (Server Action lädt `getAspsps("DE")`, Suchfeld), Klick → `startAuth` mit `state = signiertem Token (crypto)` → Redirect auf Bank-URL. Bestehende Verbindungen als Karten: Bankname, Konten, `consentValidUntil` (Badge rot wenn < 7 Tage), Button „Neu verbinden".
- [ ] **Step 2:** Callback-Route: validiert `state`, `completeAuth(code)` → `connections` (sessionId verschlüsselt!) + `bank_accounts` upsert (match auf `ebAccountUid`) → Redirect `/settings/connections?connected=1`.
- [ ] **Step 3:** Manueller E2E-Test mit echter DKB/Revolut (App-Redirect-Flow). Akzeptanz: Konten in DB, Salden nach Task 2.3 sichtbar.
- [ ] **Step 4:** Commit `feat: bank connect flow with encrypted session storage`

### Task 2.3: Sync-Engine + Cron

**Files:** Create: `src/lib/banking/sync.ts`, `src/app/api/cron/sync/route.ts`, `vercel.json`, Server Action `runManualSync` · Test: `src/lib/banking/sync.test.ts` (Provider gemockt, In-Memory-Checks für Dedupe/Cursor)

**Interfaces — Produces:** `runSync(trigger: "cron"|"manual"): Promise<SyncStats>` mit `SyncStats = { newTx: number; accounts: number; errors: string[] }`. Ab Phase 3/5/6 hängt `runSync` die Schritte `unwrapAndMatch()`, `applyRules()`, `detectRecurring()` an (Interfaces dort).

- [ ] **Step 1:** Tests (Provider-Mock): (a) neue Transaktionen werden eingefügt, zweiter Lauf mit identischen Daten fügt 0 ein (Dedupe via `tx_eb_ref` + `importHash`, `onConflictDoNothing`); (b) Cursor = `max(bookingDate) - 7 Tage` je Konto (überlappend, Dedupe fängt Doppelte); (c) Fehler bei Konto A → Konto B wird trotzdem synct, Fehler landet in `stats.errors`; (d) `syncRuns`-Zeile mit Status `ok`/`error`.
- [ ] **Step 2:** FAIL → implementieren: je aktiver `enable_banking`-Connection `decrypt(sessionIdEnc)`, Balances updaten, Transaktionen seit Cursor holen, Batch-Insert; Consent-Fehler (401/403 der EB-API) → `connections.status = "expired"`.
- [ ] **Step 3:** Cron-Route prüft `Authorization: Bearer ${CRON_SECRET}`, ruft `runSync("cron")`. `vercel.json`:

```json
{ "crons": [ { "path": "/api/cron/sync", "schedule": "30 4 * * *" }, { "path": "/api/cron/sync", "schedule": "30 16 * * *" } ] }
```

  (UTC ≈ 06:30/18:30 Berlin; Kommentar in README). Dashboard-/Settings-Button „Jetzt synchronisieren" → `runManualSync` → Toast mit `SyncStats`.
- [ ] **Step 4:** `npx vitest run` → PASS; manueller Sync gegen echte Bank liefert Transaktionen.
- [ ] **Step 5:** Commit `feat: idempotent sync engine with cron and manual trigger`

---

## Phase 3 — CSV-Import, PayPal-Unwrap, Transfer-Matcher

### Task 3.1: CSV-Profile

**Files:** Create: `src/lib/import/profiles.ts`, `src/lib/import/parse.ts` · Test: `src/lib/import/parse.test.ts` + Fixtures `src/lib/import/__fixtures__/{dkb,revolut,paypal}.csv`

**Interfaces — Produces:** `parseCsv(profileId: "dkb"|"revolut"|"paypal", content: string): { rows: ParsedRow[]; errors: string[] }` mit `ParsedRow = Omit<ProviderTransaction, "accountUid"|"entryRef"|"raw"> & { raw: Record<string,string> }`.

- [ ] **Step 1:** Fixtures anlegen (je 5 Zeilen, echte Formate):
  - **DKB** (ab Zeile 5, `;`-getrennt, latin1→utf8): Spalten `Buchungsdatum;Wertstellung;Status;Zahlungspflichtige*r;Zahlungsempfänger*in;Verwendungszweck;Umsatztyp;IBAN;Betrag (€);…`, Datum `dd.MM.yy`, Betrag `-9,99`.
  - **Revolut**: `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`, ISO-Datetime, Betrag `-9.99`; nur `State=COMPLETED`; Fee ≠ 0 → separate Gebühren-Zeile.
  - **PayPal**: `"Datum","Uhrzeit","Zeitzone","Name","Typ","Status","Währung","Brutto",…`, `dd.MM.yyyy`, deutsch formatierte Beträge; nur Status `Abgeschlossen`.
- [ ] **Step 2:** Tests: je Profil → korrekte Zeilenanzahl, Datum ISO, Cents-Beträge, Skip-Regeln greifen, kaputte Zeile landet in `errors` statt Exception. FAIL → implementieren (papaparse, Header-Erkennung; DKB: führende Metazeilen bis Header-Zeile überspringen). PASS.
- [ ] **Step 3:** Commit `feat: csv import profiles for dkb, revolut, paypal`

### Task 3.2: Import-UI

**Files:** Create: `src/app/(app)/settings/import/page.tsx`, Server Action `importCsv` in `src/lib/import/actions.ts`

- [ ] **Step 1:** UI: Profil-Select, Konto-Select (oder „Neues Konto anlegen" für PayPal/CSV-only), File-Upload, Vorschau-Tabelle (erste 10 geparste Zeilen + Fehlerliste), Button „Importieren".
- [ ] **Step 2:** Action: `parseCsv` → Zeilen → `importHash` → Insert `onConflictDoNothing` → danach gleiche Nachverarbeitung wie Sync (unwrap/match/rules/recurring, sobald vorhanden) → Ergebnis `{inserted, skipped, errors}` als Toast. `syncRuns`-Eintrag mit `trigger: "import"`.
- [ ] **Step 3:** Manueller Test mit echten Exporten; zweiter Import derselben Datei → 0 inserted. Commit `feat: csv import ui with preview and dedupe`

### Task 3.3: Normalize + PayPal-Unwrapping

**Files:** Create: `src/lib/classify/normalize.ts` · Test: `src/lib/classify/normalize.test.ts`

**Interfaces — Produces:** `normalizePurpose(s: string|null): string` · `fingerprintOf(counterparty: string|null, purpose: string|null): string` · `unwrapPaypal(counterparty: string|null, purpose: string|null): { merchant: string } | null`

- [ ] **Step 1:** Failing Tests:

```ts
import { fingerprintOf, normalizePurpose, unwrapPaypal } from "./normalize";
it("strips sepa boilerplate", () => {
  expect(normalizePurpose("NETFLIX ABO EREF+X123 MREF+M9 CRED+DE98ZZZ09999999999 IBAN: DE12..."))
    .toBe("NETFLIX ABO");
});
it("unwraps paypal merchants", () => {
  expect(unwrapPaypal("PayPal (Europe) S.a.r.l. et Cie, S.C.A.", "PP.4051.PP . NETFLIX, Ihr Einkauf bei NETFLIX")).toEqual({ merchant: "NETFLIX" });
  expect(unwrapPaypal("PayPal Europe S.a.r.l.", "1039284756273 PP .SPOTIFY, Ihr Einkauf bei SPOTIFY")).toEqual({ merchant: "SPOTIFY" });
  expect(unwrapPaypal("REWE Markt GmbH", "Einkauf")).toBeNull();
});
it("builds stable fingerprints", () => {
  expect(fingerprintOf("REWE Markt GmbH Fil. 0421", null)).toBe("rewe markt gmbh fil");
  expect(fingerprintOf(null, "AMAZON.DE 302-99 RETOURE")).toBe(fingerprintOf(null, "amazon.de 305-11 retoure"));
});
```

- [ ] **Step 2:** FAIL → implementieren: Boilerplate-Regexes (`\b(EREF|MREF|KREF|CRED|SVWZ|DATUM|TAN)\+?\S*`, `IBAN:?\s*\S+`, `SEPA-?(LASTSCHRIFT|UEBERWEISUNG|GUTSCHRIFT)`, Kartennummern `\d{4}\*+\d+`); Unwrap: Counterparty matcht `/paypal/i` **und** Purpose matcht `/(?:ihr einkauf bei|\. )([A-Z0-9 ._-]{2,40})/i` → letzte Gruppe, getrimmt; Fingerprint: lowercase, Ziffern raus, `[^a-z ]`→` `, Spaces kollabieren, trim, max 40. PASS.
- [ ] **Step 3:** Commit `feat: purpose normalization, fingerprints, paypal unwrapping`

### Task 3.4: Transfer-Matcher

**Files:** Create: `src/lib/classify/transfer.ts` · Test: `src/lib/classify/transfer.test.ts`

**Interfaces — Produces:** `matchTransfers(txs: TransferCandidate[]): Array<[string, string]>` (Paare von tx-IDs) mit `TransferCandidate = { id: string; accountId: string; bookingDate: string; amountCents: bigint; currency: string }`; DB-Wrapper `runTransferMatching()` setzt `isTransfer`, `transferPairId`, `categoryId = umbuchung` für beide Seiten.

- [ ] **Step 1:** Tests: (a) −50,00 € Konto A am 01.07. + +50,00 € Konto B am 02.07. → Paar; (b) gleiche Konten → kein Paar; (c) Datumsdiff 4 Tage → kein Paar (Limit ≤ 3); (d) ein Kandidat kann nur einmal gepaart werden (greedy nach kleinster Datumsdiff); (e) verschiedene Währungen → kein Paar.
- [ ] **Step 2:** FAIL → implementieren (Gruppierung nach `|amountCents|`+currency, dann Cross-Match sign-invers, sortiert nach Datumsdiff). PASS.
- [ ] **Step 3:** In `runSync`/`importCsv` nach Insert einhängen (nur unkategorisierte/nicht-gematchte der letzten 30 Tage betrachten). Commit `feat: internal transfer matching excludes own-account moves from spend`

---

## Phase 4 — Transaktions-UI

> Vor Phase 4/6/7-UI: Skills `frontend-design` (+ `dataviz` bei Charts) laden.

### Task 4.1: Query-Layer

**Files:** Create: `src/lib/transactions/queries.ts` · Test: `src/lib/transactions/queries.test.ts` (gegen lokale DB)

**Interfaces — Produces:** `listTransactions(f: TxFilter): Promise<{ items: TxListItem[]; nextCursor: string|null; sumCents: bigint; count: number }>` mit `TxFilter = { q?: string; accountIds?: string[]; categoryIds?: string[]; from?: string; to?: string; minCents?: bigint; maxCents?: bigint; direction?: "in"|"out"; includeTransfers?: boolean; cursor?: string; limit?: number }`. Cursor = `bookingDate|id` (keyset), `q` via `ilike` auf counterparty/purpose/merchant.nameClean.

- [ ] **Step 1:** Tests für Filterkombination, Summenzeile, Cursor-Stabilität (keine Dubletten/Lücken über Seitengrenze). FAIL → implement → PASS.
- [ ] **Step 2:** Commit `feat: transaction query layer with keyset pagination and aggregates`

### Task 4.2: Transaktionsseite

**Files:** Create: `src/app/(app)/transactions/page.tsx`, `src/components/transactions/{tx-list.tsx,tx-filters.tsx,tx-detail-sheet.tsx,category-picker.tsx}`, Server Actions `recategorize` in `src/lib/transactions/actions.ts`

**Interfaces — Consumes:** `listTransactions`, `categories`. **Produces:** `recategorize({txId, categoryId, createRule, applyPast}): Promise<{updated: number}>`.

- [ ] **Step 1:** Seite: Suchfeld (debounced, URL-State via searchParams), Filter-Chips (Konto, Kategorie, Zeitraum-Presets, Richtung), Summenzeile „n Buchungen · Σ −1.234,56 €", Liste gruppiert nach Datum (Kategorie-Icon+Farbe, merchant_clean bzw. counterparty, Betrag rot/grün, Abo-Badge), „Mehr laden"-Cursor.
- [ ] **Step 2:** Detail-Sheet: alle Felder inkl. Quelle+confidence; Kategorie-Picker (2-Ebenen, Suche); Checkboxen „Regel für diesen Händler anlegen" + „auf vergangene anwenden". `recategorize`: setzt Kategorie (`source=manual`), optional `category_rules`-Insert (field=fingerprint, op=equals, `created_from=correction`) + `merchants.defaultCategoryId`, optional Bulk-Update gleicher Fingerprint.
- [ ] **Step 3:** Akzeptanz: S2 aus Spec komplett durchspielbar; mobile Darstellung einspaltig sauber. Commit `feat: transaction list with filters, detail sheet, manual recategorization`

---

## Phase 5 — LLM-Klassifizierung

### Task 5.1: Rules-Engine

**Files:** Create: `src/lib/classify/rules.ts` · Test: `src/lib/classify/rules.test.ts`

**Interfaces — Produces:** `applyRulesTo(tx: RuleInput, rules: Rule[], merchantMap: Map<string, Merchant>): { categoryId: string; source: "rule"; matchedBy: string } | null`; DB-Wrapper `applyRules(txIds?: string[])` (ohne Args: alle mit `source in (none)`), setzt zusätzlich `merchantId`.

- [ ] **Step 1:** Tests: priority gewinnt; `contains` case-insensitiv; `regex` mit ungültigem Pattern wird übersprungen (kein Crash); Merchant-Fallback greift nach Rules. FAIL → implement → PASS.
- [ ] **Step 2:** Commit `feat: deterministic rules engine`

### Task 5.2: Claude-Batch-Klassifizierung

**Files:** Create: `src/lib/classify/llm.ts`, `src/lib/classify/prompt.ts` · Test: `src/lib/classify/llm.test.ts` (SDK gemockt: Chunking, Schema, Ergebnis-Zuordnung)

**Interfaces — Produces:** `classifyUnknownFingerprints(): Promise<{ submitted: number; batchId: string|null }>` (sammelt Fingerprints ohne `merchants`-Eintrag, je Fingerprint 1 Repräsentant) · `pollAndApplyBatches(): Promise<{ applied: number }>` (offene `llm_runs` pollen, Ergebnisse → `merchants` upsert + Transaktionen updaten `source=llm`).

- [ ] **Step 1:** `prompt.ts`: System-Prompt (deutsch, Taxonomie-Slugs als Liste mit 1-Zeilen-Beschreibung, Regeln aus Spec §7.3); pro Request ≤ 100 Items als JSON im User-Turn. Output-Schema:

```ts
export const classificationSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["id", "merchant_clean", "category_slug", "is_subscription_hint", "confidence"],
    properties: {
      id: { type: "string" }, merchant_clean: { type: "string" },
      category_slug: { type: "string" }, // Validierung gegen echte Slugs erfolgt client-seitig
      is_subscription_hint: { type: "boolean" },
      confidence: { type: "number" } } } } },
} as const;
```

- [ ] **Step 2:** `llm.ts`: `client.messages.batches.create({ requests })` — je Request `custom_id = "chunk-" + n`, `params = { model: CLASSIFY_MODEL, max_tokens: 16000, output_config: { format: { type: "json_schema", schema: classificationSchema } }, messages: [...] }`. **Kein `temperature`.** `pollAndApplyBatches`: `batches.retrieve` bis `processing_status === "ended"`, dann `batches.results` iterieren, per `custom_id` zuordnen (Reihenfolge nicht garantiert), `JSON.parse` des Text-Blocks, ungültige `category_slug` → `sonstiges` + confidence 0.3; Token-Usage in `llm_runs`.
- [ ] **Step 3:** Tests (Mock): Chunking 250 Items → 3 Requests; errored-Result eines Chunks lässt andere unangetastet; Slug-Validierung. FAIL → implement → PASS.
- [ ] **Step 4:** Einbau: `runSync`/Import rufen `applyRules()` dann `classifyUnknownFingerprints()`; Cron-Route ruft zu Beginn `pollAndApplyBatches()` (Batch vom Vormittag wird abends eingesammelt); manueller Sync ebenfalls. Review-Queue: Settings-Seite listet `confidence < 0.7` (nutzt Task-4.2-Komponenten).
- [ ] **Step 5:** Live-Test mit ~50 echten Fingerprints; Stichprobe prüfen. Commit `feat: claude batch classification with structured outputs and learned merchants`

---

## Phase 6 — Abo-Erkennung

### Task 6.1: Recurring-Detector

**Files:** Create: `src/lib/recurring/detect.ts` · Test: `src/lib/recurring/detect.test.ts`

**Interfaces — Produces:** reine Funktion `detectRecurring(groups: FingerprintGroup[], today: string): RecurringResult[]` mit

```ts
type FingerprintGroup = { merchantId: string; isSubscriptionHint: boolean; txs: { id: string; bookingDate: string; amountCents: bigint; currency: string }[] };
type RecurringResult = { merchantId: string; cadence: "weekly"|"monthly"|"quarterly"|"yearly"; kind: "subscription"|"contract"|"income"|"other";
  amountLastCents: bigint; amountMedianCents: bigint; monthlyEquivCents: bigint; currency: string;
  nextExpectedDate: string; status: "active"|"paused"|"ended"; priceChanged: boolean; firstSeen: string; lastSeen: string; txIds: string[] };
```

DB-Wrapper `runRecurringDetection()`: Gruppen laden (Ausgaben + Einkommen getrennt betrachten, `kind=income` bei positiven Beträgen), Ergebnisse upserten (`recurring_merchant_cadence`), `transactions.recurringItemId` setzen, verschwundene Items auf `ended`.

- [ ] **Step 1:** Failing Tests (Kernfälle):

```ts
const mk = (dates: string[], cents: bigint) => ({ merchantId: "m1", isSubscriptionHint: true,
  txs: dates.map((d, i) => ({ id: String(i), bookingDate: d, amountCents: cents, currency: "EUR" })) });
it("detects monthly subscription", () => {
  const [r] = detectRecurring([mk(["2026-04-15","2026-05-15","2026-06-15"], -999n)], "2026-07-01");
  expect(r.cadence).toBe("monthly");
  expect(r.monthlyEquivCents).toBe(-999n);
  expect(r.nextExpectedDate).toBe("2026-07-15");
  expect(r.status).toBe("active");
});
it("detects yearly with 2 occurrences", () => {
  const [r] = detectRecurring([mk(["2025-03-01","2026-03-02"], -5900n)], "2026-07-01");
  expect(r.cadence).toBe("yearly");
  expect(r.monthlyEquivCents).toBe(-492n); // -5900/12 gerundet
});
it("flags price change >1%", () => {
  const g = mk(["2026-04-15","2026-05-15","2026-06-15"], -999n);
  g.txs[2].amountCents = -1299n;
  expect(detectRecurring([g], "2026-07-01")[0].priceChanged).toBe(true);
});
it("marks paused after grace period", () => {
  const [r] = detectRecurring([mk(["2026-03-10","2026-04-10","2026-05-10"], -999n)], "2026-06-20");
  expect(r.status).toBe("paused"); // erwartet 10.06. + 5 Tage Karenz überschritten
});
it("rejects irregular intervals", () => {
  expect(detectRecurring([mk(["2026-01-01","2026-01-20","2026-04-05"], -999n)], "2026-07-01")).toHaveLength(0);
});
it("requires 3 occurrences for monthly", () => {
  expect(detectRecurring([mk(["2026-05-15","2026-06-15"], -999n)], "2026-07-01")).toHaveLength(0);
});
it("rejects unstable amounts without subscription hint", () => {
  const g = { ...mk(["2026-04-02","2026-05-03","2026-06-02"], -4312n), isSubscriptionHint: false };
  g.txs[1].amountCents = -9807n;
  expect(detectRecurring([g], "2026-07-01")).toHaveLength(0);
});
```

- [ ] **Step 2:** FAIL → implementieren nach Spec §8 (Median-Intervall; Buckets weekly 5–9 / monthly 26–35 / quarterly 80–100 / yearly 350–380; Stabilität ≤ 15 % Abweichung vom Median oder Hint; monthlyEquiv weekly×4.33 / quarterly÷3 / yearly÷12, kaufmännisch runden; ended = heute > next + 2 Zyklen). PASS.
- [ ] **Step 3:** `runRecurringDetection()` als letzten Sync-Schritt einhängen. Commit `feat: recurring payment detection with price-change and missed-payment flags`

### Task 6.2: Verträge-UI

**Files:** Create: `src/app/(app)/contracts/page.tsx`, `src/components/contracts/{contract-card.tsx,contract-detail.tsx}`, Query `listRecurring()` in `src/lib/recurring/queries.ts`

- [ ] **Step 1:** Kopfzeile: Σ €/Monat aller aktiven Abos + Anzahl. Karten sortiert nach `monthlyEquivCents` desc: Initialen-Avatar (Farbe aus Kategorie), Name, Kadenz-Label, €/Monat groß, nächste Abbuchung relativ („in 4 Tagen"); Badges: „Preis ↑" (rot) bei `priceChangedAt` < 90 Tage, „ausgeblieben" (amber) bei `paused`. Tabs aktiv/beendet; Sektion „Einnahmen" (Gehalt) getrennt.
- [ ] **Step 2:** Detail-Sheet: Zahlungshistorie (Datum+Betrag, Sparkline via Recharts), Link „alle Buchungen" → Transaktionsseite mit Filter, Aktionen: Kadenz/kind manuell überschreiben, „kein Abo" (Item löschen + Merchant-Hint false).
- [ ] **Step 3:** Akzeptanz: S3 aus Spec durchspielbar. Commit `feat: contracts view with monthly cost normalization and alerts`

---

## Phase 7 — Dashboard, Analyse, PWA, Deployment

### Task 7.1: Analytics-Queries

**Files:** Create: `src/lib/analytics/queries.ts` · Test: `src/lib/analytics/queries.test.ts`

**Interfaces — Produces:** `getDashboardData(): Promise<{ totalBalanceCents: bigint; incomeMonthCents: bigint; expensesMonthCents: bigint; subsMonthlyCents: bigint; byCategory: {categoryId,name,color,sumCents}[]; trend: {month,incomeCents,expenseCents}[]; topMerchants: {name,sumCents,count}[]; upcoming: {name,date,amountCents}[] }>` — überall `kind in (expense,income)` und `isTransfer = false`; Fremdwährung via `fx_rates` (Fallback 1:1 + Hinweis-Flag).

- [ ] **Step 1:** Tests gegen Seed-Daten (Transfer zählt nicht in Ausgaben; Monatsgrenzen Europe/Berlin). FAIL → implement → PASS. Commit `feat: analytics query layer`

### Task 7.2: Dashboard + Analyse-Seite

**Files:** Create: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/analysis/page.tsx`, `src/components/charts/{category-donut.tsx,trend-bars.tsx}`

- [ ] **Step 1:** (Skills `frontend-design` + `dataviz` laden.) Dashboard: 3 Stat-Kacheln, Konten-Liste mit Salden + Sync-Zeitpunkt + Sync-Button, Consent-Warnbanner (aus `connections`), Kategorie-Donut (aktueller Monat, Legende mit Beträgen), anstehende Abbuchungen (14 Tage), Review-Queue-Hinweis wenn > 0.
- [ ] **Step 2:** Analyse: Zeitraum-Picker (Monat/Quartal/Jahr/benutzerdefiniert), Donut + Kategorie-Tabelle (Drilldown → Transaktionsfilter), 6-Monats-Trend (Einnahmen vs. Ausgaben), Top-10-Händler.
- [ ] **Step 3:** Akzeptanz: S1 durchspielbar; Charts theme-fähig (light/dark). Commit `feat: dashboard and analysis with charts`

### Task 7.3: PWA + Deployment

**Files:** Create: `src/app/manifest.ts`, Icons (`icon-192.png`, `icon-512.png`, maskable), `README`-Deploy-Abschnitt

- [ ] **Step 1:** `manifest.ts`: name „Financiero", `display: "standalone"`, `theme_color`/`background_color` aus Design, Icons; `viewport`-Export mit `themeColor`. iOS-Meta (`apple-mobile-web-app-capable`).
- [ ] **Step 2:** Lighthouse-PWA-Check installierbar; Bottom-Tabs mit `env(safe-area-inset-bottom)`.
- [ ] **Step 3:** Deployment: Vercel-Projekt (Region fra1) + Neon (Frankfurt); Env-Vars setzen; `drizzle-kit push` gegen Neon; Cron aktiv; Smoke-Test am Handy (installieren, Sync, S1–S3).
- [ ] **Step 4:** Commit `feat: pwa manifest and production deployment` — **v1 fertig.**

---

## Backlog (nicht planen, nur festgehalten)

Budgets je Kategorie · „Frei verfügbar"-Prognose (Fixkosten aus `recurring_items` minus Monatsbudget) · Web-Push (Preis ↑, Consent läuft ab) · Expo-App · FinTS-Adapter (DK-Produktregistrierung früh beantragen, dauert ~2 Wochen) · Depot/Wertpapiere · CSV-Auto-Mapping per LLM.

## Self-Review (durchgeführt)

- Spec-Abdeckung: F1→2.2, F2→2.3, F3→2.3, F4→3.1/3.2, F5→4.1/4.2, F6→5.1/5.2/4.2, F7→3.3, F8→3.4, F9→6.1/6.2, F10→7.1/7.2, F11→0.2, F12→0.2/7.3. ✓
- Typkonsistenz: `ProviderTransaction` (2.1) ↔ Sync (2.3) ↔ `ParsedRow` (3.1); `FingerprintGroup`/`RecurringResult` (6.1) ↔ Queries (6.2). ✓
- Platzhalter: keine TBD/TODO; UI-Tasks bewusst als Akzeptanzkriterien spezifiziert (Plan-Konvention im Header). ✓
