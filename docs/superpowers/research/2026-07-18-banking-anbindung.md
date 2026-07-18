# Recherche: Banking-Anbindung & Orchestrierung (Stand: 18.07.2026)

Fragestellung: Wie bindet eine selbstgebaute Personal-Finance-App (Finanzguru-Klon, Single-User)
DKB, PayPal und Revolut technisch an — kostenlos, legal, wartbar? Und wie sollte die App
orchestriert werden (Sync, Klassifizierung, Hosting)?

## Kernergebnisse

### 1. GoCardless Bank Account Data ist raus

Der jahrelange Standardweg der Selfhosted-Community (Firefly III, Actual Budget) war
GoCardless Bank Account Data (ehem. Nordigen): kostenlos, 2.300+ Banken, PSD2-AIS.
**Seit Juli 2025 nimmt GoCardless keine neuen Bank-Account-Data-Accounts mehr an** —
Bestandskunden laufen weiter, Neuregistrierung ist zu. Damit für dieses Projekt unbrauchbar.

### 2. Enable Banking ist der Nachfolger für Personal Use → **gewählt**

[Enable Banking](https://enablebanking.com) (Finnland, lizenzierter PSD2-AISP, reguliert durch
die finnische FSA) bietet:

- **„Restricted Production" kostenlos**: Self-Service-Registrierung im Control Panel, Zugriff
  auf **eigene, selbst verknüpfte Konten** in Produktion — exakt der Personal-Use-Fall.
  Bezahlpflicht erst, wenn man fremde Nutzer anbinden will.
- ~2.700 Banken in 30 Ländern, einheitliches REST-API (JWT/RS256-Auth).
- **DKB: unterstützt** (inkl. Sandbox). SCA-Methoden laut [DE-Marktdoku](https://enablebanking.com/docs/markets/de/):
  DKB-App (Redirect-Flow, empfohlen) oder ChipTAN (Decoupled-Flow).
  ⚠️ Bekanntes Issue im Sure-Projekt (Maybe-Fork): der Decoupled-Flow („separate device
  authentication") ist dort nicht implementiert → wir setzen auf den **App-Redirect-Flow**.
- **Revolut: unterstützt** (auch für DE-Kunden; Revolut Bank UAB).
- Die Selfhosted-Community bestätigt den Weg: Firefly III Data Importer unterstützt Enable
  Banking, Sure (Maybe-Fork) nutzt es für Bank-Sync, und es gibt einen offenen Firefly-Issue,
  Enable Banking als GoCardless-Alternative auszubauen.

Konsequenzen: PSD2-Consent läuft ~90 Tage (bankabhängig, teils 180), danach Re-Auth bei der
Bank → die App braucht einen sichtbaren „Verbindung erneuern"-Flow. Transaktionshistorie via
XS2A ist bankabhängig begrenzt (oft 90 Tage ohne starke Authentifizierung, mehr direkt nach
SCA) → **CSV-Import für den historischen Backfill einplanen**.

### 3. PayPal: keine AIS-Anbindung für Privatnutzer → CSV + Unwrapping

- Enable Banking listet **kein PayPal** als ASPSP. PayPals PSD2-Schnittstelle ist faktisch nur
  für lizenzierte TPPs zugänglich (Finanzguru löst das über finAPI als lizenzierten Provider).
- PayPals eigene Transaction-Search-API erfordert einen **Business-Account** → für Privat unbrauchbar.
- **Lösung (zweigleisig):**
  1. **PayPal-Unwrapping-Parser**: Fast jede PayPal-Zahlung erscheint als SEPA-Lastschrift auf
     dem DKB-Konto mit dem echten Händler im Verwendungszweck
     (`PP.5678.PP . NETFLIX, Ihr Einkauf bei NETFLIX`). Ein Parser extrahiert den Händler →
     die Ausgabe wird korrekt kategorisiert, ohne PayPal überhaupt anzubinden. Deckt ~90 % ab.
  2. **PayPal-CSV-Import** (Aktivitäten-Export) für Guthaben-Zahlungen, P2P und Vollständigkeit.

### 4. FinTS/HBCI: lebt bei der DKB, aber nur als Plan B

DKB unterstützt FinTS weiterhin (neue FinTS-URL seit Nov 2024, TAN2Go abgeschaltet →
pushTAN/ChipTAN; Kreditkartenkonten sogar nur noch via HBCI PIN/TAN abrufbar). Aber:

- FinTS-Clients brauchen seit PSD2 eine **Produktregistrierung bei der Deutschen
  Kreditwirtschaft** (kostenlos, PDF-Formular, **bis zu 2 Wochen Wartezeit**).
- Beste Library ist `python-fints` → hieße einen Python-Sidecar neben dem TS-Stack.
- Revolut/PayPal können kein FinTS.

→ Nicht im MVP. Die Provider-Abstraktion (`BankProvider`-Interface) hält die Tür offen.

### 5. Verworfene Alternativen

| Option | Warum verworfen |
|---|---|
| GoCardless BAD | Neuregistrierung seit 07/2025 geschlossen |
| Salt Edge | Test-Status: 100 Connections, aber **nur 90 Tage gültig** → nicht nachhaltig |
| finAPI / Tink / Yapily | Kommerziell, B2B-Verträge, für Privatprojekt überdimensioniert |
| PayPal Transaction Search API | Nur Business-Accounts |
| FinTS direkt (MVP) | DK-Registrierung + Python-Sidecar; deckt Revolut/PayPal nicht ab |
| Fork von Firefly III / Actual | UI/Datenmodell nicht auf Verträge+LLM ausgelegt; eigener Stack ist bei diesem Funktionsumfang schneller als ein Fork verbiegen |

## Orchestrierung (Ergebnis)

**Monolith mit Cron statt Microservices.** Für Single-User gibt es keinen Grund für Queues,
Worker-Fleets oder Event-Bus:

```
Vercel Cron (06:30 & 18:30 Europe/Berlin)
  └─> /api/cron/sync (CRON_SECRET-geschützt)
        1. Enable Banking: Balances + neue Transaktionen je Konto (Cursor: letztes booking_date)
        2. Normalisierung + Dedupe (import_hash) + PayPal-Unwrapping
        3. Transfer-Matcher (eigene Konten → „Umbuchung", aus Ausgaben raus)
        4. Rules-Engine (User-Regeln > gelernte Merchant-Zuordnung)
        5. LLM-Queue: unbekannte Händler → Claude-Batch (Structured Output)
        6. Recurring-Detector inkrementell → Abos/Verträge, next_expected, Preisänderungen
        7. sync_runs-Protokoll + Consent-Ablauf-Check (Banner „neu verbinden")
```

Ein einziger idempotenter Sync-Pfad, der von Cron, manuellem Button und CSV-Import
gleichermaßen durchlaufen wird (Schritte 2–6 sind quellenunabhängig).

**Hosting:** Vercel (Region `fra1`) + Neon Postgres (EU Frankfurt) = schnellster Weg zu
„auf dem Handy nutzbar" (PWA über HTTPS). Docker-Compose-Selfhost bleibt als dokumentierte
Option (gleicher Code, `node-cron` statt Vercel Cron).

**LLM:** Anthropic Message Batches API (50 % Rabatt, Batch < 1 h) mit Structured Outputs.
Default-Modell `claude-opus-4-8` ($5/$25 pro MTok); `claude-haiku-4-5` ($1/$5) als
Kostenhebel-Option. Da nur unbekannte Händler-Fingerprints (nicht jede Transaktion!)
klassifiziert werden, kostet der komplette Backfill selbst mit Opus nur wenige Euro,
der laufende Betrieb Cent-Beträge pro Monat.

## Quellen

- [GoCardless Bank Account Data — Übersicht](https://developer.gocardless.com/bank-account-data/overview) (Neukunden-Stopp seit Juli 2025)
- [Actual Budget: GoCardless Setup](https://actualbudget.org/docs/advanced/bank-sync/gocardless/)
- [Free & Indie Open Banking APIs 2026 (openbankingtracker)](https://www.openbankingtracker.com/guides/free-open-banking-apis) — Enable Banking „Restricted Production"
- [Enable Banking Docs](https://enablebanking.com/docs/) · [DE-Marktspezifika inkl. DKB-SCA](https://enablebanking.com/docs/markets/de/) · [Accounts API](https://enablebanking.com/accounts-api/)
- [Firefly III: Enable-Banking-Import](https://docs.firefly-iii.org/tutorials/data-importer/eb/) · [Issue #10753: Enable Banking als GoCardless-Alternative](https://github.com/firefly-iii/firefly-iii/issues/10753)
- [Sure (Maybe-Fork) Issue #2481: DKB-Decoupled-Flow](https://github.com/we-promise/sure/issues/2481)
- [python-fints Quickstart: DK-Produktregistrierung](https://python-fints.readthedocs.io/en/latest/quickstart.html) · [FinTS-Produktregistrierung FAQ](https://www.fints.org/de/hersteller/faq-produktregistrierung)
- [Buhl-FAQ: DKB FinTS-Umstellung, TAN2Go-Abschaltung](https://www.buhl.de/shop/faqs?article=2826) · [StarMoney: DKB-Kreditkarten nur via HBCI PIN/TAN](https://hilfe.starmoney.de/hc/de/articles/22212913675932)
- [Finanzguru-Funktionsreferenz](https://finanzguru.de/finanzwissen/finanzguru-app) (Feature-Vorbild: Vertragserkennung, Analysen, Kategorien)
