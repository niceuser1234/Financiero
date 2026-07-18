# Financiero — PRD & technisches Design

> Persönlicher Finanzguru-Klon: alle Konten (DKB, Revolut, PayPal) an einem Ort,
> automatische LLM-Kategorisierung, Abo-/Vertragserkennung, schöne Analyse-Oberfläche,
> mobil nutzbar (PWA). Single-User, EU-gehostet.
>
> Recherche-Grundlage: [`docs/superpowers/research/2026-07-18-banking-anbindung.md`](../research/2026-07-18-banking-anbindung.md)
> Umsetzungsplan: [`docs/superpowers/plans/2026-07-18-financiero-implementation.md`](../plans/2026-07-18-financiero-implementation.md)

---

## 1. Ziele & Nicht-Ziele

**Ziele (v1):**

1. Banking-Aggregation: DKB + Revolut via Enable Banking (kostenlose Restricted Production),
   PayPal via CSV + Unwrapping der DKB-Lastschriften. Automatischer Sync 2×/Tag + manuell.
2. Einheitliche Transaktionsliste über alle Konten: Suche, Filter (Konto, Kategorie, Zeitraum,
   Betrag, Typ), unendliches Scrollen, Detailansicht.
3. Automatische Kategorisierung: deterministische Regeln zuerst, Claude-Batch für unbekannte
   Händler, manuelle Korrekturen werden zu dauerhaften Regeln.
4. Abo-/Vertragserkennung (Finanzgurus „Verträge"): wiederkehrende Zahlungen erkennen,
   Monats-/Jahreskosten, nächste Abbuchung, Preiserhöhungs-Warnung, ausbleibende Zahlung.
5. Analyse-Dashboard: Gesamtsaldo, Einnahmen/Ausgaben je Monat, Kategorie-Donut, 6-Monats-Trend,
   Top-Händler, anstehende Abbuchungen.
6. Mobil nutzbar: responsive PWA (installierbar, Bottom-Navigation auf Mobile).
7. Sicherheit: Login (better-auth), Secrets nur serverseitig, EU-Hosting, keine PII in Logs.

**Nicht-Ziele (v1)** — bewusst Backlog: Budgets, „Frei verfügbar"-Prognose, Sparziele,
Push-Benachrichtigungen, native App (Expo), Multi-User, Depot/Wertpapiere, Vertragswechsel-Broker,
FinTS-Direktanbindung, Gemeinschaftskonten.

## 2. Nutzer & Kernszenarien

Einziger Nutzer: Jonathan (Owner). Szenarien:

- **S1 Morgens am Handy:** öffnet PWA → Dashboard zeigt aktuellen Gesamtsaldo, Ausgaben des
  Monats nach Kategorie, anstehende Abbuchungen der nächsten 14 Tage.
- **S2 „Wofür ging mein Geld drauf?":** filtert Transaktionen auf „Restaurants & Bars, letzte
  3 Monate" → Summe + Liste; erkennt eine falsch kategorisierte Buchung, korrigiert sie →
  Regel entsteht, künftige Buchungen des Händlers landen richtig.
- **S3 Abo-Check:** öffnet „Verträge" → sieht alle Abos mit €/Monat-Normalisierung sortiert
  nach Kosten, entdeckt vergessenes Abo, sieht Preiserhöhung bei Streaming-Dienst markiert.
- **S4 Verbindung erneuern:** Consent nach 90 Tagen abgelaufen → Banner auf Dashboard →
  Re-Auth-Flow bei der Bank → Sync läuft weiter.
- **S5 Backfill:** importiert DKB-/Revolut-/PayPal-CSV der letzten 2 Jahre → Dedupe verhindert
  Dubletten mit API-Daten, Klassifizierung + Abo-Erkennung laufen über den Bestand.

## 3. Funktionale Anforderungen

| # | Anforderung | Akzeptanzkriterien (Auszug) |
|---|---|---|
| F1 | Bankverbindung herstellen (Enable Banking) | ASPSP-Auswahl (DE), Redirect zur Bank, Callback speichert Session + Konten; Konten erscheinen mit Saldo; Consent-Ablaufdatum sichtbar |
| F2 | Automatischer Sync | Cron 2×/Tag; idempotent (kein Duplikat bei Doppellauf); `sync_runs`-Protokoll; Fehler eines Kontos blockiert andere nicht |
| F3 | Manueller Sync | Button „Jetzt synchronisieren"; zeigt Ergebnis (n neu, n aktualisiert) |
| F4 | CSV-Import | Profile für DKB, Revolut, PayPal; Vorschau vor Import; Dedupe via `import_hash`; Fehlerzeilen werden gemeldet, nicht verschluckt |
| F5 | Transaktionsliste | Volltextsuche (Händler/Zweck), Filter kombinierbar, Summenzeile der aktuellen Auswahl, Cursor-Pagination, < 200 ms Antwort bei 50k Zeilen |
| F6 | Kategorisierung | Pipeline Regeln→LLM; jede Transaktion trägt `categorization_source` (rule/llm/manual/import) + `confidence`; Review-Queue für confidence < 0.7; Korrektur schreibt Regel + optional rückwirkend |
| F7 | PayPal-Unwrapping | DKB-Buchungen mit PayPal-Referenz zeigen den echten Händler (`merchant_clean`), Original bleibt in `raw` erhalten |
| F8 | Umbuchungs-Erkennung | Transfers zwischen eigenen Konten werden gepaart, als „Umbuchung" markiert und aus Ausgaben/Einnahmen-Analysen ausgeschlossen |
| F9 | Abo-/Vertragserkennung | Erkennt weekly/monthly/quarterly/yearly; zeigt €/Monat-Äquivalent, nächste Abbuchung, Status (aktiv/ausgesetzt/beendet); markiert Preisänderung > 1 % und ausgebliebene Zahlung (> 5 Tage Karenz) |
| F10 | Dashboard | Kacheln: Gesamtsaldo (EUR-normalisiert), Einnahmen/Ausgaben Monat, Abo-Kosten €/Monat; Charts: Kategorie-Donut, 6-Monats-Balken, Top-5-Händler; Liste: nächste Abbuchungen 14 Tage |
| F11 | Auth | E-Mail+Passwort; Registrierung nach erstem User gesperrt; Sessions httpOnly |
| F12 | PWA | Manifest + Icons, installierbar auf iOS/Android, Bottom-Tabs mobil, Sidebar Desktop |

## 4. Architektur

**Ein Next.js-Monolith + Postgres. Kein Microservice, keine Queue** — Single-User-Datenmengen
(≈ Zehntausende Zeilen) brauchen das nicht.

```
┌────────────────────────────── Vercel (fra1) ──────────────────────────────┐
│  Next.js 15 (App Router, TS)                                              │
│  ├─ UI: React 19 + Tailwind v4 + shadcn/ui + Recharts (PWA)               │
│  ├─ Server Actions: Filter, Korrekturen, Regeln, Import                   │
│  ├─ Route Handlers:                                                       │
│  │   /api/cron/sync        ← Vercel Cron 06:30/18:30 (CRON_SECRET)        │
│  │   /api/banking/callback ← Enable-Banking-Redirect                      │
│  └─ lib/ (Kern, UI-frei & einzeln testbar):                               │
│      banking/   EnableBankingClient, provider-Interface, sync-engine      │
│      import/    CSV-Profile (DKB/Revolut/PayPal), Dedupe-Hash             │
│      classify/  normalize, paypal-unwrap, rules-engine, claude-batch      │
│      recurring/ Detector (Kadenz, Preisänderung, next_expected)           │
└──────────────┬────────────────────────────┬───────────────────────────────┘
               │ Drizzle ORM                │ HTTPS
      Neon Postgres 16 (EU)      Enable Banking API · Anthropic API
```

Selfhost-Variante: identischer Code via Docker Compose (web + postgres), `node-cron` im
Next-Server statt Vercel Cron. Entscheidung fällt bei Deployment (Phase 7), Code bleibt neutral.

**Sync-Orchestrierung** (ein idempotenter Pfad für API-Sync *und* CSV-Import):

```
fetch (EB-API oder CSV) → normalize → dedupe(import_hash) → paypal-unwrap
  → transfer-match → rules-engine → [LLM-Batch für unbekannte Fingerprints]
  → recurring-detect → sync_runs-Log + Consent-Check
```

## 5. Datenmodell (Postgres, Drizzle)

Beträge als `bigint` **Cents** (nie Float). Alle Zeiten `timestamptz`. Kerntabellen:

| Tabelle | Zweck / Schlüsselfelder |
|---|---|
| `users`, `sessions`, `accounts_auth`, `verifications` | better-auth-Standardtabellen |
| `connections` | Enable-Banking-Session je Bank: `provider` (`enable_banking`\|`csv`), `aspsp_name`, `session_id_enc` (AES-256-GCM), `status` (`active`\|`expired`\|`revoked`), `consent_valid_until` |
| `bank_accounts` | `connection_id?`, `name`, `iban_masked`, `type` (`checking`\|`credit_card`\|`emoney`), `currency`, `balance_cents`, `balance_updated_at`, `eb_account_uid?` |
| `transactions` | `account_id`, `booking_date`, `value_date?`, `amount_cents` (signiert), `currency`, `counterparty_name?`, `counterparty_iban?`, `purpose?`, `merchant_id?`, `category_id?`, `categorization_source` (`rule`\|`llm`\|`manual`\|`import`\|`none`), `confidence?`, `is_transfer`, `transfer_pair_id?`, `recurring_item_id?`, `eb_entry_ref?` (unique/Konto), `import_hash` (unique), `raw jsonb` |
| `categories` | Seed-Taxonomie (§7.4): `slug` unique, `parent_id?`, `name`, `icon`, `color`, `kind` (`expense`\|`income`\|`transfer`\|`excluded`) |
| `merchants` | gelernte Händler: `fingerprint` unique, `name_clean`, `default_category_id?`, `is_subscription_hint` |
| `category_rules` | `priority`, `field` (`counterparty`\|`purpose`\|`fingerprint`), `op` (`equals`\|`contains`\|`regex`), `value`, `category_id`, `created_from` (`manual`\|`correction`) |
| `recurring_items` | `merchant_id`, `cadence` (`weekly`\|`monthly`\|`quarterly`\|`yearly`), `kind` (`subscription`\|`contract`\|`income`\|`other`), `amount_last_cents`, `amount_median_cents`, `monthly_equiv_cents`, `next_expected_date`, `status` (`active`\|`paused`\|`ended`), `price_changed_at?`, `first_seen`, `last_seen` |
| `sync_runs` | `trigger` (`cron`\|`manual`\|`import`), `started_at`, `finished_at`, `status`, `stats jsonb`, `error?` |
| `llm_runs` | Batch-Protokoll: `batch_id`, `model`, `item_count`, `input_tokens`, `output_tokens`, `status` |
| `fx_rates` | `date`, `currency`, `rate_to_eur` (EZB, für Revolut-Fremdwährung) |

**Dedupe:** `import_hash = sha256(account_id | booking_date | amount_cents | currency |
normalize(counterparty + purpose))`. API-Quellen nutzen zusätzlich `eb_entry_ref` als primäre
Identität; der Hash fängt CSV↔API-Überschneidungen.

## 6. Banking-Anbindung

### 6.1 Enable Banking (DKB, Revolut)

- Einmalig manuell: App im [Control Panel](https://enablebanking.com) registrieren →
  `application_id` + privater RSA-Key (PEM). Restricted Production = eigene Konten, kostenlos.
- Auth je Request: selbstsigniertes JWT (RS256, `kid = application_id`, `aud = api.enablebanking.com`) als Bearer.
- Connect-Flow: `GET /aspsps?country=DE` → `POST /auth` (redirect_url = `/api/banking/callback`,
  state = CSRF-Token) → Nutzer autorisiert bei Bank (DKB: **App-Redirect-Flow** wählen, nicht
  ChipTAN/decoupled) → Callback: `POST /sessions {code}` → `session_id` + Konten-UIDs speichern.
- Sync: `GET /accounts/{uid}/balances` + `GET /accounts/{uid}/transactions?date_from=…`
  (Pagination via `continuation_key`).
- Consent ~90 Tage → `consent_valid_until` überwachen, Banner + Re-Auth-Flow (identisch zum
  Connect-Flow). Exakte Feldnamen bei Implementierung gegen https://enablebanking.com/docs/ prüfen.

### 6.2 PayPal

Kein AIS-Zugang für Privatkonten (siehe Recherche). Strategie:
1. **Unwrapping** (F7): Regex-Parser über DKB-Buchungen (`PayPal (Europe)` als Gegenpartei);
   extrahiert Händler aus Verwendungszweck-Mustern wie `PP.4051.PP . NETFLIX, Ihr Einkauf bei …`.
2. **CSV-Import**: PayPal-Aktivitätenexport als eigenes `bank_account` (type `emoney`);
   Transfer-Matcher paart PayPal-Abbuchung ↔ DKB-Lastschrift, damit nichts doppelt zählt.

### 6.3 Provider-Abstraktion

`BankProvider`-Interface (`listAccounts`, `fetchBalances`, `fetchTransactions(since)`), damit
FinTS oder ein anderer Aggregator später ein Adapter ist, kein Umbau.

## 7. LLM-Klassifizierung

### 7.1 Pipeline

1. **Normalize:** SEPA-Boilerplate strippen (`SEPA-LASTSCHRIFT`, `EREF+…`, `MREF+…`, `GLAEUBIGER-ID …`),
   PayPal-Unwrap, dann `fingerprint` = lowercase, nur `[a-z ]`, kollabierte Spaces, max. 40 Zeichen.
2. **Rules-Engine (deterministisch, 0 Kosten):** `category_rules` nach `priority`, dann
   `merchants.default_category_id`. Trifft → fertig (`source=rule`).
3. **LLM-Batch:** nur **unbekannte Fingerprints** (Repräsentant je Fingerprint, nicht jede
   Transaktion). Message Batches API, Structured Output. Ergebnis wird in `merchants`
   **gelernt** → jeder Fingerprint kostet genau einmal LLM.
4. **Review:** `confidence < 0.7` → Kategorie gesetzt, aber in Review-Queue gelistet.
   Korrektur → `category_rules` (`created_from=correction`) + `merchants.default_category_id`.

### 7.2 API-Nutzung

- Modell: **`claude-opus-4-8`** (Default). Kostenhebel: `claude-haiku-4-5` per env
  `CLASSIFY_MODEL` (Nutzer-Entscheidung; beide bei diesem Volumen < 5 €/Backfill, Cents/Monat).
- **Message Batches API** (50 % Rabatt): `client.messages.batches.create()`, Chunks à ≤ 100
  Fingerprints pro Request, `custom_id = fingerprint-hash`; Polling bis `ended`; Ergebnisse
  per `custom_id` zuordnen (Reihenfolge nicht garantiert).
- **Structured Output:** `output_config.format` mit strict JSON-Schema
  (`additionalProperties: false`); kein `temperature` (auf Opus 4.8 entfernt → 400), kein Prefill.
- Datenschutz: nur `counterparty`, bereinigter `purpose`, Betrag-Größenordnung, Konto-Typ gehen
  an die API — keine IBANs, keine Salden, keine Namen des Nutzers.

### 7.3 Prompt-Vertrag (Kern)

System: deutscher Finanz-Kategorisierer; Taxonomie als Enum der `category.slug`s; Regeln:
Händler erkennen trotz Zahlungsdienstleister-Rauschen; `is_subscription_hint` für typische
Abo-/Vertragsanbieter; unbekannt → `sonstiges` mit niedriger confidence. Output je Item:

```json
{ "id": "…", "merchant_clean": "Netflix", "category_slug": "abos-streaming",
  "is_subscription_hint": true, "confidence": 0.97 }
```

### 7.4 Kategorie-Taxonomie (Seed, 2 Ebenen)

`einkommen` (gehalt, nebeneinkommen, erstattungen, zinsen-dividenden) ·
`wohnen` (miete, energie, internet-mobilfunk, moebel-hausrat, rundfunk) ·
`lebensmittel` (supermarkt, drogerie, baeckerei) ·
`restaurants-bars` (restaurant, cafe, lieferdienst, bar-ausgehen) ·
`mobilitaet` (oepnv-bahn, auto-tanken, carsharing-taxi, fahrrad) ·
`shopping` (kleidung, elektronik, online-shopping, buecher-medien) ·
`abos` (streaming, software-cloud, gaming, news) ·
`versicherungen` (haftpflicht, hausrat-vers, kfz, kranken, bu, sonstige-vers) ·
`gesundheit-fitness` (apotheke-arzt, fitnessstudio, sport) ·
`freizeit-reisen` (urlaub, hotel, flug, events-kultur, hobby) ·
`bildung` · `sparen-investieren` · `bargeld` · `gebuehren-zinsen` ·
`umbuchung` (kind=transfer, aus Analysen ausgeschlossen) · `sonstiges`

## 8. Abo-/Vertragserkennung (deterministisch, LLM nur als Hint)

Je `merchant_fingerprint` mit ≥ 2 Ausgaben-Buchungen: Intervalle der Buchungsdaten → Median →
Kadenz-Bucket: weekly 5–9 d, monthly 26–35 d, quarterly 80–100 d, yearly 350–380 d, sonst keine.
Mindestvorkommen: monthly/weekly ≥ 3, quarterly/yearly ≥ 2. Betragsstabilität:
`|amount − median| / median ≤ 0.15` **oder** `merchants.is_subscription_hint` (Verträge wie Strom
schwanken stärker). Abgeleitet: `monthly_equiv` (weekly ×4.33, quarterly ÷3, yearly ÷12),
`next_expected = last + median_interval`, `price_changed` wenn letzter Betrag > 1 % vom Median
der Vorgänger abweicht, `status=paused` wenn `today > next_expected + 5 d`,
`ended` nach 2 ausgebliebenen Zyklen. Läuft inkrementell nach jedem Sync/Import.

## 9. UI/UX

**Navigation:** Desktop Sidebar / Mobile Bottom-Tabs: Dashboard · Transaktionen · Verträge ·
Analyse · Einstellungen. Deutsch, `de-DE`-Formatierung (`1.234,56 €`), Dark-Mode via
`prefers-color-scheme`.

**Design-Richtung:** ruhiges, präzises Fintech — kein Template-Look. Bei Umsetzung der
UI-Phasen sind die Skills `frontend-design` (Gestaltung) und `dataviz` (alle Charts) zu laden;
konkrete Palette/Typo wird dort festgelegt (Vorgabe: keine lila Gradients, keine
Standard-Inter-Ästhetik; Zahlen in Tabular Figures).

**Screens:** Dashboard (F10) · Transaktionen (F5: Suchfeld, Filter-Chips, Summenzeile,
virtualisierte Liste, Detail-Sheet mit Kategorie-Picker + „Regel erstellen") · Verträge (F9:
Karten mit Logo-Initialen, €/Monat, nächste Abbuchung; Badges „Preis ↑" / „ausgeblieben";
Detail mit Zahlungshistorie-Sparkline) · Analyse (Zeitraum-Picker, Donut, Trend, Top-Händler)
· Einstellungen (Verbindungen + Consent-Status, CSV-Import, Kategorien/Regeln, Review-Queue).

## 10. Sicherheit & Datenschutz

- Enable-Banking-Privatkey & Anthropic-Key nur als Server-Env; EB-`session_id` AES-256-GCM
  verschlüsselt in DB (`ENCRYPTION_KEY`, 32 Byte).
- Auth: better-auth, httpOnly-Cookies, Registrierung nach User #1 deaktiviert; alle Routen
  außer Login + Callback + Cron hinter Session-Middleware; Cron via `CRON_SECRET`-Header.
- Keine Transaktionsdaten in Logs; `raw jsonb` enthält Originaldaten → nie an Client geben,
  außer explizit in Detailansicht des Owners.
- Hosting/DB ausschließlich EU (Vercel fra1, Neon Frankfurt). Anthropic-API: Inputs werden
  nicht fürs Training genutzt; es gehen nur pseudonyme Händler-Strings raus (§7.2).

## 11. Entscheidungen, Annahmen, offene Punkte

**Entscheidungen** (Alternativen in der Recherche): Enable Banking statt GoCardless (Neukunden-
Stopp) / Salt Edge (90-Tage-Limit) / FinTS (kein Revolut, DK-Registrierung); Eigenbau statt
Firefly-Fork; Monolith statt Services; Cents-`bigint` statt Decimal-Float; Batches API statt
Realtime-Klassifizierung; PWA vor nativer App.

**Annahmen** (autonom getroffen, bitte beim Review bestätigen):
1. Hosting-Default Vercel + Neon (EU) — Selfhost-Compose als Alternative dokumentiert.
2. `claude-opus-4-8` als Klassifizierungs-Default, Haiku als env-Schalter.
3. DKB-SCA via App-Redirect-Flow (ChipTAN/decoupled nicht in v1).
4. Historischer Backfill primär via CSV (XS2A-Historie bankseitig begrenzt).
5. Sprache der UI: Deutsch.

**Offene Punkte** (blockieren den Start nicht): exakte Feldnamen der EB-API beim Implementieren
verifizieren; DKB-Kreditkartenkonto über EB verfügbar? (sonst CSV); Revolut-Multi-Currency →
`fx_rates` ab Phase 7 aktiv.

## 12. Roadmap

| Phase | Inhalt | Schätzung |
|---|---|---|
| 0 | Scaffold: Next.js, Tailwind, shadcn, Drizzle+Postgres, better-auth, Vitest, Shell | 0,5 d |
| 1 | Datenmodell komplett + Seeds + Dedupe-Hash | 0,5 d |
| 2 | Enable Banking: Connect-Flow, Sync-Engine, Cron, Consent-Banner | 1–1,5 d |
| 3 | CSV-Import (3 Profile), PayPal-Unwrap, Transfer-Matcher | 1 d |
| 4 | Transaktions-UI: Liste, Filter, Detail, manuelle Kategorisierung | 1 d |
| 5 | Klassifizierung: Rules-Engine, Claude-Batch, Review-Queue | 1 d |
| 6 | Abo-Erkennung + Verträge-UI | 1 d |
| 7 | Dashboard, Analyse, PWA, Deployment | 1 d |
| — | Backlog: Budgets, Forecast, Push, Expo, FinTS | später |

Gesamt: **~7 fokussierte Tage** mit Claude Code als Executor.
