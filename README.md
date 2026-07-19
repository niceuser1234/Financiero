# Financiero

Persönlicher Finanz-Aggregator (Finanzguru-inspiriert): alle Konten (DKB, Revolut via
Enable Banking, PayPal via CSV) an einem Ort, automatische LLM-Kategorisierung, Abo-/
Vertragserkennung, Analyse-Dashboard, installierbar als PWA. Single-User, EU-gehostet.

- **Spec:** [`docs/superpowers/specs/2026-07-18-financiero-design.md`](docs/superpowers/specs/2026-07-18-financiero-design.md)
- **Umsetzungsplan:** [`docs/superpowers/plans/2026-07-18-financiero-implementation.md`](docs/superpowers/plans/2026-07-18-financiero-implementation.md)
- **Recherche (Banking-Anbindung):** [`docs/superpowers/research/2026-07-18-banking-anbindung.md`](docs/superpowers/research/2026-07-18-banking-anbindung.md)

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Recharts · Drizzle ORM ·
PostgreSQL 16 · better-auth · Anthropic Message Batches API · Vitest.

## Lokale Entwicklung

```bash
# 1. Postgres (Docker ODER Homebrew)
docker compose up -d
#   – oder ohne Docker: brew install postgresql@16 && brew services start postgresql@16
#     createuser -s financiero; createdb -O financiero financiero
#     psql -d financiero -c "ALTER ROLE financiero WITH PASSWORD 'financiero';"

# 2. Env & Secrets
cp .env.example .env
#   APP_SIGNING_SECRET / ENCRYPTION_KEY / CRON_SECRET je: openssl rand -hex 32
#   ENABLE_BANKING_APP_ID + ENABLE_BANKING_PRIVATE_KEY (base64-PEM) aus dem Enable-Banking-Control-Panel
#   ANTHROPIC_API_KEY für die Klassifizierung

# 3. Schema & Seed
npm install
npm run db:push
npm run db:seed          # 58 Kategorien

# 4. Starten
npm run dev              # http://localhost:3000  → öffnet direkt (kein Login, Single-User)
```

Tests & Checks:

```bash
npm test                 # Vitest (braucht laufende Postgres)
npx tsc --noEmit         # Typecheck
npm run build            # Production-Build
```

## Konten anbinden

- **DKB / Revolut:** Einstellungen → Bankverbindungen → Bank wählen → bei der Bank
  autorisieren (DKB: **App-Redirect-Flow** wählen). Consent gilt ~90 Tage, danach zeigt das
  Dashboard ein „neu verbinden"-Banner.
- **PayPal:** kein PSD2-Zugang für Privatkonten → Einstellungen → CSV-Import (Aktivitäten-
  Export). PayPal-Zahlungen, die als DKB-Lastschrift erscheinen, werden automatisch auf den
  echten Händler „entpackt".
- **Historischer Backfill:** CSV-Export der Bank importieren; Dubletten werden per `import_hash`
  automatisch übersprungen.

## Klassifizierung

Deterministische Regeln zuerst (0 Kosten), dann Claude-Batch für unbekannte Händler
(`CLASSIFY_MODEL`, Default `claude-opus-4-8`; `claude-haiku-4-5` als günstigere Option).
Es werden nur unbekannte Händler-Fingerprints klassifiziert (je einmal, gelernt) — nicht jede
Buchung. Ergebnisse eines Batches werden beim nächsten Cron-Lauf eingespielt. Manuelle
Korrekturen erzeugen dauerhafte Regeln; unsichere Zuordnungen landen in der Review-Queue.

## Deployment (Vercel + Neon, EU)

1. **Neon** (Region *AWS eu-central-1 / Frankfurt*): Projekt anlegen → Connection-String als
   `DATABASE_URL`.
2. **Vercel:** Repo importieren, Region auf `fra1` setzen (`vercel.json` fixiert die Cron-Zeiten).
   Environment-Variablen setzen (alle aus `.env.example`; `APP_BASE_URL`/`BETTER_AUTH_URL` =
   Produktions-URL). Der Enable-Banking-Redirect zeigt auf `<APP_BASE_URL>/api/banking/callback`
   — diese URL im Enable-Banking-Control-Panel als erlaubte Redirect-URL hinterlegen.
3. **Schema:** `DATABASE_URL=<neon> npm run db:push && npm run db:seed`.
4. **Cron:** `vercel.json` triggert `/api/cron/sync` um 04:30 und 16:30 UTC (≈ 06:30/18:30
   Berlin), geschützt per `CRON_SECRET`.
5. **PWA:** über HTTPS „Zum Startbildschirm hinzufügen" (iOS/Android) → installierbar.

**Selfhost-Alternative:** identischer Code via `docker compose` (App + Postgres); statt Vercel
Cron ein System-Cron/`node-cron`, der `GET /api/cron/sync` mit `Authorization: Bearer $CRON_SECRET`
aufruft.

## Sicherheit

Secrets nur serverseitig; Enable-Banking-Session AES-256-GCM-verschlüsselt in der DB; an die
Anthropic-API gehen ausschließlich pseudonyme Händler-Strings (keine IBANs, Salden oder Namen).

**Kein Login (Single-User-App).** Die App hat keine Authentifizierung — wer die URL erreicht,
sieht die Daten. Lokal ist das unkritisch. **Bei einem öffentlichen Deployment musst du den
Zugang auf Netzwerkebene schützen**, z.B. Vercel Password Protection / Vercel Authentication,
einen Reverse-Proxy mit Basic-Auth oder eine IP-Allowlist. Der Cron-Endpoint (`/api/cron/sync`)
und der Banking-Callback bleiben unabhängig davon per `CRON_SECRET` bzw. signiertem
State-Token geschützt.
