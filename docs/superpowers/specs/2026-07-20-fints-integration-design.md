# FinTS-Integration für Financiero — Design-Spec

**Datum:** 2026-07-20
**Status:** Freigegeben (Design)
**Scope:** FinTS-Anbindung (DKB) lokal auf dem Dev-Mac — lauffähig & getestet. Pi-/Tailscale-Deployment ist ein **separates, späteres Spec**.

## Ziel & Kontext

Financiero soll deutsche Bank-Umsätze (zunächst **DKB**) kostenlos live synchronisieren — via **FinTS/HBCI** (offizieller Bankstandard) statt des kostenpflichtigen Enable Banking.

**Zentraler Befund:** Die App besitzt bereits eine Provider-Abstraktion, die fast perfekt passt:
- [`BankProvider`](../../../src/lib/banking/types.ts) — Interface über Banking-Anbieter (Enable Banking = eine Impl, FinTS = zweite).
- [`runSync()`](../../../src/lib/banking/sync.ts) — anbieter-neutrale Sync-Schleife: Cursor pro Konto, Dedupe über `importHash`, `ON CONFLICT DO NOTHING`.
- `connections.status = "expired"` + Reconnect-Flow — genau das Muster für die 90-Tage-TAN-Re-Auth.
- [`crypto.ts`](../../../src/lib/crypto.ts) — AES-256-GCM encrypt/decrypt existiert bereits (für PIN + State).
- Dedupe läuft über `importHash`, **nicht** über eine Entry-Ref — wichtig, weil FinTS/MT940 oft keine stabile Transaktions-ID liefert.

Es ist also **kein Neubau, sondern ein Provider-Tausch**: Klassifizierung (Regeln + Claude-LLM), Wiederkehrer-Erkennung, UI und PWA bleiben unangetastet.

## Getroffene Entscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Python-Anbindung | **Python-Sidecar (FastAPI, localhost)** | python-fints ist die reifste Lib (DKB-Risiko); TS-App bleibt sauber; DB bleibt Single-Writer. Alternativen (lib-fints in TS / Python-schreibt-DB) verworfen wegen Reife-Risiko bzw. Logik-Duplizierung. |
| TAN-Verfahren | **decoupled DKB-App (Tap)** als Primär, chipTAN als Fallback | Nutzer verwendet DKB-App-Freigabe. Sidecar erkennt Verfahren dynamisch bei `/connect` → beide ohne Umbau möglich. |
| Sync-Frequenz | **1×/Tag** (Cron) | Umsätze der letzten ~90 Tage brauchen im Normalfall keine TAN; öfter bringt nichts. |
| Datenbank | **Bestehende Postgres/Drizzle-DB** | Schema modelliert bereits alles. Sidecar schreibt nicht in die DB. |
| PIN-Speicherung | **AES-256-GCM via `crypto.ts`** | Verschlüsselt in `connections`; nur über localhost an Sidecar. |
| Enable-Banking-Code | **Bleibt dormant** | Abstraktion trägt beide Provider; Löschen wäre verschwendete Arbeit. |

## Architektur & Datenfluss

```
┌─ Next.js (TS) ─────────────────────┐        ┌─ Python-Sidecar ─────────┐
│                                     │ HTTP   │  FastAPI @ 127.0.0.1     │
│  Settings-UI → FinTS-Setup-Action ──┼───────▶│  /connect  /connect/confirm
│  runSync("cron"/"manual")           │ (local │  /sync                   │
│    └─ FintsProvider ────────────────┼───────▶│   └─ python-fints ──────┐│
│         schreibt →  Postgres (Drizzle)        │      DKB fints.dkb.de ◀─┘│
│  Classify-Pipeline (Claude) ← unverändert     └──────────────────────────┘
└─────────────────────────────────────┘
```

Node bleibt **einziger DB-Writer**. Der Sidecar ist **zustandslos**: bekommt bei jedem Call die entschlüsselten Credentials + serialisierten FinTS-Client-State, gibt neuen State + Daten zurück.

## Komponenten

### 1. Python-Sidecar (`fints-sidecar/`)

Kleiner FastAPI-Dienst, kapselt `python-fints`. Bindet nur an `127.0.0.1`, verlangt Shared-Secret-Header `X-Internal-Token`. **Read-only** — keinerlei SEPA-Transfer-Code.

**Endpoints:**

| Endpoint | Input | Output |
|---|---|---|
| `POST /connect` | `blz, user, pin, endpoint, product_id` | `{accounts, client_state}` **oder** `{status:"need_tan", decoupled, challenge, pending_state}` |
| `POST /connect/confirm` | `pending_state` (+ `tan` bei Code-Verfahren) | pollt `send_tan(resp, "")` → `{accounts, client_state}` oder erneut `need_tan` |
| `POST /sync` | `client_state, credentials, accounts:[{iban, since}]` | `{balances, transactions, client_state}` **oder** `{status:"need_tan"}` |

**State-Serialisierung:** python-fints `deconstruct(including_private=True)` / `from_data=`; Dialog via `pause_dialog()`/`resume_dialog()`; TAN via `NeedTANResponse.get_data()`/`from_data()`. Verfahrenswahl über `get_tan_mechanisms()`/`set_tan_mechanism()` bei `/connect`.

**MT940→JSON-Mapping** (Betrag-Vorzeichen, Gegenpartei, Verwendungszweck) passiert im Sidecar und liefert das Format der TS-Seite (`ProviderTransaction`).

### 2. TypeScript-Seite

- **`src/lib/banking/fints.ts` — `FintsProvider`**: implementiert `fetchBalances`/`fetchTransactions` aus `BankProvider`, ruft `/sync`. Bei `need_tan` → wirft `NeedTanError`.
- **`src/lib/banking/sync.ts` — `runSync` generalisieren**: statt Filter `provider = enable_banking` über **alle** aktiven Connections iterieren; Provider-Client nach `connection.provider` wählen. `NeedTanError` → Connection auf `expired` (bestehender `isConsentError`-Pfad erweitert).
- **`src/lib/banking/fints-actions.ts`**: Server-Actions `startFintsConnect(formData)` und `confirmFintsTan()` — rufen den Sidecar, speichern verschlüsselten State + Konten.
- **`src/app/(app)/settings/page.tsx`**: FinTS-Setup-Formular (BLZ `12030000` vorbelegt, User, PIN, Produkt-ID) + „In DKB-App bestätigen"-Polling-UI.

### 3. Schema-Änderungen (additiv, minimal)

```
providerEnum   += "fints"
connections    += blz, fintsUserId, fintsEndpoint, fintsProductId,
                  pinEnc, fintsStateEnc, tanMechanism
bankAccounts   :  ebAccountUid = IBAN (generisch weiterverwendet)
transactions   :  unverändert — Dedupe via importHash
connections.status "expired" = TAN-Re-Auth nötig (Muster wiederverwendet)
```

## Flows

### Setup (einmalig)
1. Settings-Formular: BLZ `12030000`, User, PIN, Produkt-ID → „Verbinden".
2. `/connect` → Antwort `need_tan decoupled` → UI: **„Bitte in der DKB-App bestätigen"**.
3. UI pollt `/connect/confirm` alle ~3 s → bei Tap-Bestätigung: Konten + verschlüsselter State gespeichert.

### Täglicher Sync
- Cron ruft `runSync("cron")` → `FintsProvider` → `/sync` mit gespeichertem State → letzte ~90 Tage **ohne TAN** → Node schreibt neue Transaktionen (importHash-Dedupe) → Classify-Pipeline läuft.

### Re-Auth (~alle 90 Tage)
- Cron-`/sync` liefert `need_tan` → `NeedTanError` → Connection `expired`.
- PWA zeigt Banner **„DKB-Freigabe nötig"** + Button → gleicher decoupled-Tap-Flow.

## Sicherheit

- PIN + FinTS-State: **AES-256-GCM** über `crypto.ts` (`ENCRYPTION_KEY`), verschlüsselt in `connections`.
- PIN verlässt den Prozess nur über `localhost` zum Sidecar.
- Sidecar nur lokal (127.0.0.1 + `X-Internal-Token`).
- **Read-only**: keine Überweisungs-/SEPA-Funktionen im Code.

## Testing

- **TS**: `FintsProvider` mit gemocktem Sidecar-`fetch` (analog EB-Tests); `runSync`-Test `NeedTanError` → `expired`; MT940-Mapping-Unit-Tests.
- **Python**: Mapping-/Serialisierungs-Logik als Unit-Tests; echter DKB-Dialog manuell verifiziert (TAN nicht automatisierbar).

## Bewusst nicht enthalten (YAGNI / später)

- Web-Push-Benachrichtigungen (MVP = In-App-Banner).
- SEPA-Überweisungen / Geld senden.
- Raspberry-Pi- + Tailscale-Deployment (**eigenes Spec**).
- Multi-Bank-Auswahl (Abstraktion trägt es, aber nur DKB jetzt).
- Löschen des Enable-Banking-Codes.

## Restrisiko

Der decoupled DKB-App-Flow mit python-fints war laut GitHub-Issues zeitweise zickig ([#183](https://github.com/raphaelm/python-fints/issues/183)). Fallback: chipTAN — die Sidecar-Endpoints sind so entworfen, dass beide Verfahren ohne Umbau funktionieren (Verfahren wird bei `/connect` dynamisch erkannt).

## Voraussetzungen / externe Abhängigkeiten

- **FinTS-Produkt-ID** von der Deutschen Kreditwirtschaft (beantragt 2026-07; Zuteilung ~10–15 Werktage). Entwicklung/Tests laufen parallel mit Platzhalter-ID.
- DKB-Endpoint: `https://fints.dkb.de/fints`, BLZ `12030000` (Stand nach Umstellung 25.11.2024).
