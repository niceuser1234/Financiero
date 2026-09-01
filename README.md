# Financiero

Persönlicher Finanz-Aggregator (Finanzguru-inspiriert): alle Konten (DKB, Revolut via
Enable Banking, PayPal via CSV) an einem Ort, automatische LLM-Kategorisierung, Abo-/
Vertragserkennung, Analyse-Dashboard, installierbar als PWA. Aktuell Single-User und
standardmäßig im strikten lokalen Modus.

- **Spec:** [`docs/superpowers/specs/2026-07-18-financiero-design.md`](docs/superpowers/specs/2026-07-18-financiero-design.md)
- **Umsetzungsplan:** [`docs/superpowers/plans/2026-07-18-financiero-implementation.md`](docs/superpowers/plans/2026-07-18-financiero-implementation.md)
- **Recherche (Banking-Anbindung):** [`docs/superpowers/research/2026-07-18-banking-anbindung.md`](docs/superpowers/research/2026-07-18-banking-anbindung.md)
- **Recherche (Local-First-Deployment):** [`docs/research/2026-07-27-local-first-deployment.md`](docs/research/2026-07-27-local-first-deployment.md)

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · Recharts · Drizzle ORM ·
PostgreSQL 16 · python-fints Sidecar · OpenAI-kompatible LLM-Schnittstelle · Vitest.

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
#   FINTS_SIDECAR_TOKEN: openssl rand -hex 32
#   FINTS_PRODUCT_ID: Registrierungsnummer der Deutschen Kreditwirtschaft

# 3. Schema & Seed
npm install
npm run db:push
npm run db:seed          # 58 Kategorien

# 4. FinTS-Sidecar und App gemeinsam starten
npm run dev:local        # App: http://localhost:3000
```

Port `8790` gehört nur zum internen FinTS-Hintergrunddienst. Wer ihn im Browser öffnet,
bekommt deshalb eine Statusseite mit einem Link zur eigentlichen App statt einer 404-Meldung.
Der Entwicklungsserver bindet bewusst nur an `127.0.0.1`, weil die aktuelle Single-User-App
noch keine Anmeldung besitzt.

Tests & Checks:

```bash
npm test                 # Vitest (braucht laufende Postgres)
npx tsc --noEmit         # Typecheck
npm run build            # Production-Build
```

## Konten anbinden

- **DKB:** Einstellungen → DKB via FinTS → Anmeldename und PIN eingeben → in der DKB-App
  bestätigen. Die Produkt-ID kommt ausschließlich aus der lokalen Server-Konfiguration.
- **Enable Banking / Revolut:** Im strikten lokalen Modus deaktiviert, da die Daten über einen
  externen Aggregator laufen würden.
- **PayPal:** kein PSD2-Zugang für Privatkonten → Einstellungen → CSV-Import (Aktivitäten-
  Export). PayPal-Zahlungen, die als DKB-Lastschrift erscheinen, werden automatisch auf den
  echten Händler „entpackt".
- **Historischer Backfill:** CSV-Export der Bank importieren; Dubletten werden per `import_hash`
  automatisch übersprungen.

## Assistent

Unter **Assistent** kannst du in natürlicher Sprache Fragen zu deinen Konten stellen
(Ausgaben nach Kategorie, Abos,  geschätzter Spielraum für die nächsten Tage).
Der LLM-Pfad ist im strikten lokalen Modus zunächst deaktiviert. Für Ollama kann später
`OPENROUTER_BASE_URL=http://127.0.0.1:11434/v1` gesetzt und `LLM_ENABLED=true` aktiviert
werden. Nicht-lokale LLM-URLs werden bei `STRICT_LOCAL_MODE=true` abgewiesen.

## Klassifizierung

Deterministische Regeln laufen immer lokal. Die optionale LLM-Klassifizierung für unbekannte
Händler verwendet denselben lokalen OpenAI-kompatiblen Endpunkt wie der Assistent. Manuelle
Korrekturen erzeugen dauerhafte Regeln.

## Deployment

Empfohlen ist ein dedizierter Host im eigenen Netz mit WireGuard, HTTPS-Reverse-Proxy,
internem PostgreSQL, lokalem FinTS-Sidecar und lokalem Ollama/llama.cpp. Die bestehende
`docker-compose.yml` ist nur für die Entwicklung geeignet und noch kein Produktions-Stack.
Architektur, Hardware-Abwägung, Local-LLM-Konfiguration, Mehrbenutzergrenzen und Rollout stehen
in der [Local-First-Recherche](docs/research/2026-07-27-local-first-deployment.md).

## Sicherheit

Secrets nur serverseitig; FinTS-PIN, Dialog- und Client-Zustand liegen AES-256-GCM-verschlüsselt
in PostgreSQL. Cloud-LLM, Enable Banking, externe Händlerlogos, Google-Fonts und Next-Telemetrie
sind im lokalen Standardmodus deaktiviert.

**Kein Login (Single-User-App).** Die App hat keine Authentifizierung — wer die URL erreicht,
sieht die Daten. Sie darf deshalb nicht öffentlich erreichbar sein. Für den eigenen Betrieb nur
über ein privates VPN zugänglich machen. Für Freunde ist vorab echte Authentifizierung und
vollständige Tenant-Isolation nötig; die aktuelle App ist dafür nicht freigabefähig.
