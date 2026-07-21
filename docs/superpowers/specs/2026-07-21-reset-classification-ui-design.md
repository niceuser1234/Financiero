# Design: Data reset, OpenRouter classification & dashboard/contracts changes

Date: 2026-07-21
Status: Approved (brainstorming) — ready for implementation plan

## Goal

Reset the app to a clean slate, re-import two real DKB CSV exports (Girokonto +
Visa Kreditkarte), and get working transaction classification via OpenRouter.
Plus three UI/logic refinements: time-independent "next 2" upcoming debits,
contracts grouped by cadence, and a visible "Sparen" subcategory for the user's
own outgoing savings (ETF Sparplan / broker deposits).

## Context (current state)

- Classification already exists: `src/lib/classify/` runs rules → LLM after every
  import (`pipeline.ts`). The LLM step uses the **Anthropic Batches API** and is
  wrapped in a silent `try/catch`, so with no API key it does nothing and data
  stays uncategorized.
- Categories are seeded (`src/db/seed.ts`, ~16 top-level). `sparen-investieren`
  exists as a top-level category with `kind='excluded'` (hidden from charts).
- "Anstehende Abbuchungen" is computed in `analytics/queries.ts` with a hard
  `today … today+14d` window.
- Contracts view (`contracts/contracts-view.tsx`) has Aktiv/Einnahmen/Beendet
  tabs; active items are not grouped by cadence.
- Import supports CSV via `lib/import/` (papaparse). Existing profiles: `dkb`
  (Girokonto), `revolut`, `paypal`. **No Visa credit-card profile.**

## Decisions (from brainstorming)

1. Reset wipes **financial data only** — keep category taxonomy + auth/user.
2. Classification moves to **OpenRouter**, model **`google/gemini-2.5-flash`**,
   **synchronous** calls (drop the batch/poll/cron machinery).
3. Failures are **visible + retryable** (no silent swallow).
4. Upcoming debits: **time-independent, next 2** debits only.
5. Contracts: three cadence **sections within the Aktiv tab**
   (Monatlich / Vierteljährlich / Jährlich; weekly folds into Monatlich).
6. Sparen: new subcategory under "Sparen & Investieren", **visible** as its own
   slice/KPI, tracked separately from expenses.

---

## 1. Data reset

New script `src/db/reset.ts` + `npm run db:reset`. Deletes in FK-safe order:

```
transactions → recurring_items → merchants → category_rules
→ sync_runs → llm_runs → bank_accounts → connections
```

Keeps `categories` and all auth tables. Idempotent; prints deleted counts.
Guarded so it refuses to run against a non-local `DATABASE_URL` unless
`--force` is passed (avoid accidental prod wipe).

## 2. Classification → OpenRouter + Gemini 2.5 Flash (synchronous)

### Env

`.env` / `.env.example`:
- Remove `ANTHROPIC_API_KEY`.
- Add `OPENROUTER_API_KEY=`.
- Add `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`.
- Set `CLASSIFY_MODEL=google/gemini-2.5-flash`.

### llm.ts rewrite

- Replace the Anthropic Batches client with an OpenRouter **chat-completions**
  call via `fetch` (no new dependency; drop `@anthropic-ai/sdk` usage in this
  file). Endpoint `POST {OPENROUTER_BASE_URL}/chat/completions`, bearer
  `OPENROUTER_API_KEY`.
- Request per chunk: `model`, `messages` (system = `buildSystemPrompt`, user =
  `buildUserContent`), and `response_format: { type: "json_schema", json_schema:
  { name, strict: true, schema: classificationSchema } }`.
- Keep chunking (`CHUNK_SIZE` of unique fingerprints), `buildSystemPrompt`,
  `buildUserContent`, `classificationSchema`, `normalizeClassification`.
- New flow `classifyUnknownFingerprints()`:
  1. collect unique unknown fingerprints (unchanged query),
  2. for each chunk, call OpenRouter synchronously,
  3. parse `choices[0].message.content` as JSON, apply merchants + transactions
     **immediately** (merge the old `pollAndApplyBatches` apply-logic here).
- **Delete**: `pollAndApplyBatches`, the `BatchClient` interface, and the batch
  submit/retrieve/results plumbing. Remove the classification poll from the cron
  route. Keep the `llm_runs` table but write one row per run (model, itemCount,
  input/output tokens if returned, status ok/error) for observability — or drop
  it entirely if it carries no other use (decide in plan; leaning "keep, simplify").
- Client injectable for tests (default = real fetch wrapper; tests pass a fake).

### Failure handling (visible + retryable)

- `runPipeline` no longer silently swallows classification errors. On failure it
  records the error (sync_runs.stats / a run row with status='error') and leaves
  affected transactions at `categorizationSource='none'`.
- Dashboard shows a banner when uncategorized non-transfer expenses exist:
  "N Umsätze nicht klassifiziert — erneut versuchen", linking to a **retry**
  server action that re-runs `classifyUnknownFingerprints()`.

### Prompt tuning (from real data)

Extend the system prompt in `prompt.ts` with concrete guidance the sample data
demands:
- PayPal / Klarna noise → extract the real merchant from the purpose
  ("Ihr Einkauf bei X"). (Already handled by `unwrapPaypal`; reinforce in prompt.)
- Broker / savings deposits (Trade Republic, Scalable, "Sparplan", "Einzahlung"
  to own account) → `sparen-investieren-sparen`.
- Card fees ("Kartenpreis", Entgelt) → `gebuehren-zinsen`; cash
  ("Bargeldabhebung", "Cashback") → `bargeld`.
- Krankenkasse (VIACTIV) → `versicherungen-kranken`; gym (EGYM Wellpass,
  Fitness First) → `gesundheit-fitness-fitnessstudio`; AI subs (Anthropic/
  Claude, Cursor, Perplexity) → `abos-software-cloud`; Spotify →
  `abos-streaming`; Deutsche Bahn (DB Vertrieb) → `mobilitaet-oepnv-bahn`.

## 3. Anstehende Abbuchungen → time-independent, next 2

`analytics/queries.ts`, `upcoming` query:
- Drop `>= today` and `<= today+14d` bounds. Keep: active, `kind <> 'income'`,
  `nextExpectedDate` not null.
- `order by nextExpectedDate asc limit 2`.

`dashboard/page.tsx`:
- Card description "Nächste 14 Tage" → "Nächste 2 Abbuchungen".
- Empty-state message updated ("Noch keine wiederkehrenden Abbuchungen erkannt.").

## 4. Contracts grouped by cadence

`recurring/queries.ts`:
- `RecurringOverview` gains grouped active lists, e.g.
  `activeByCadence: { monthly: RecurringDTO[]; quarterly: RecurringDTO[]; yearly:
  RecurringDTO[] }` (weekly merged into monthly). Keep `income`, `ended`.

`contracts/contracts-view.tsx`:
- Keep Aktiv/Einnahmen/Beendet segmented control.
- Inside **Aktiv**, render up to three labeled sections in order Monatlich,
  Vierteljährlich, Jährlich. Hide empty sections. Card markup unchanged.

## 5. Sparen subcategory (visible, tracked separately)

### Schema

- Add `saving` to `categoryKindEnum` (migration via `drizzle-kit generate` +
  `db:push`). Enum becomes `["expense","income","transfer","excluded","saving"]`.

### Taxonomy (`seed.ts`)

- Change top-level `sparen-investieren` from `kind='excluded'` to `kind='saving'`.
- Add subcategory `sparen-investieren-sparen`, name **"Sparen"**,
  parent `sparen-investieren`, `kind='saving'`. Represents the user's *outgoing*
  savings/investment deposits (ETF Sparplan, broker like Trade Republic).
- Seed is additive/idempotent; run after reset (categories are kept, so a
  targeted update is needed for the kind change — the seed's
  `onConflictDoNothing` won't update. Add a small explicit update for the
  `sparen-investieren` kind and insert the new subcategory).

### Detection (keep simple)

- One **category rule**, seeded: purpose contains "Sparplan" →
  `sparen-investieren-sparen`. That's the only active detection for now — the
  user makes no other savings moves yet.
- The structural change (the `saving` kind + "Sparen" subcategory + analytics/KPI
  wiring) still ships, so broader detection can be added later without rework.
- No extra counterparty/IBAN rule. LLM prompt still generally knows broker names,
  but we don't rely on it here.

### Analytics / UI

- `saving`-kind categories are **excluded** from the "Ausgaben / Monat" total and
  from the "Nicht kategorisiert" bucket (same treatment as `excluded` for the
  expense sum), **but included** as their own donut slice.
- New dashboard KPI **"Sparen / Monat"** = sum of `saving`-kind outgoing
  transactions in the current window. Add `savingMonthCents` to `DashboardData`
  and a `KpiCard` on the dashboard.

## 6. CSV import — the two DKB exports

### Existing `dkb` (Girokonto) — reuse

First file columns match the existing `dkb` profile
(`Buchungsdatum;Wertstellung;Status;Zahlungspflichtige*r;Zahlungsempfänger*in;
Verwendungszweck;Umsatztyp;IBAN;Betrag (€);Gläubiger-ID;Mandatsreferenz;
Kundenreferenz`). No change needed beyond verification.

### New `dkb_visa` (Visa Kreditkarte) profile

Second file columns:
`Belegdatum;Wertstellung;Status;Beschreibung;Umsatztyp;Betrag (€);Fremdwährungsbetrag`.

- Add `"dkb_visa"` to `ProfileId` and a `PROFILES.dkb_visa` entry.
- `label`: "DKB Visa Kreditkarte".
- `delimiter`: ";".
- `sliceToHeader`: slice from the line starting with `Belegdatum` (skips the
  `Karte;…`, blank, `Saldo vom…`, blank metadata lines).
- `map`: `bookingDate = parseDmy(Belegdatum)`, `valueDate = parseDmy(Wertstellung)`,
  `amountCents = parseGermanAmount(Betrag (€))`, `currency = "EUR"`,
  `counterpartyName = Beschreibung`, `counterpartyIban = null`,
  `purpose = Beschreibung` (Fremdwährungsbetrag kept in `raw`).
- Import form (`settings/import/`) gains the new profile in its picker.

### Cross-account behaviour (relies on existing transfer matcher)

- Giro "DKB … DKB BANKING" (−X) and Visa "Einzahlung" (+X) are the two sides of
  a card top-up → the transfer matcher should pair them as `isTransfer` once both
  accounts are imported, keeping them out of income/expense.
- Fallback if unmatched: card "Einzahlung" / "Ausgleich Kreditkarte" left
  uncategorized would otherwise read as income. Add category rules mapping these
  purposes to `umbuchung` (transfer kind) so they never inflate income.

### Encoding

DKB files are UTF-8 with BOM (the `ï»¿` prefix; `parse.ts` already strips it).
Header keys contain `€`/umlauts — read as UTF-8 so `r["Betrag (€)"]` resolves.
Add a fixture-based test per profile.

## Testing

- `db/reset.ts`: deletes financial rows, preserves categories + user; local-guard.
- Classify (synchronous): fake OpenRouter client → merchants + transactions
  applied in one pass; JSON-schema parse; error path leaves rows uncategorized +
  surfaces a signal.
- Analytics `upcoming`: returns ≤2, ordered, no date-window filter, excludes income.
- Analytics saving: `saving` kind excluded from expenses total, present as slice,
  `savingMonthCents` correct.
- Contracts grouping: monthly/quarterly/yearly buckets, weekly→monthly, empty
  sections hidden.
- Import `dkb_visa`: fixtures from the real Visa CSV (incl. Fremdwährung, Einzahlung,
  Kartenpreis, Trade Republic) parse to correct `ParsedRow`s.
- Sparen rule: "Sparplan" purpose → `sparen-investieren-sparen`.

## Out of scope

- Changing the taxonomy beyond adding "Sparen".
- FX conversion for foreign-currency card rows (kept 1:1 as today; amount is
  already the EUR-settled value in `Betrag (€)`).
- Reworking the FinTS/Enable Banking sync paths (classification change is shared,
  but no behavioural change intended there beyond the synchronous pipeline).
