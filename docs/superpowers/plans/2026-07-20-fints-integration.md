# FinTS-Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Financiero synchronisiert DKB-Umsätze kostenlos über FinTS/HBCI, angebunden über einen lokalen Python-Sidecar (python-fints), ohne die bestehende Sync-/Classify-Pipeline zu verändern.

**Architecture:** Ein zustandsloser FastAPI-Sidecar auf `127.0.0.1` kapselt python-fints und spricht die DKB. Eine TypeScript-Klasse `FintsProvider` ruft ihn per HTTP und liefert Daten im vorhandenen `ProviderTransaction`/`ProviderBalance`-Format. `runSync` wird von Enable-Banking-only auf Multi-Provider verallgemeinert. Node bleibt einziger DB-Writer; PIN und FinTS-State liegen AES-256-GCM-verschlüsselt in `connections`.

**Tech Stack:** Next.js 16 / React 19 / Drizzle ORM / Postgres 16 / Vitest (TS-Seite) · Python 3 / FastAPI / python-fints / pytest (Sidecar).

## Global Constraints

- DKB-Endpoint: `https://fints.dkb.de/fints`, BLZ `12030000` (Stand nach DKB-Umstellung 25.11.2024).
- **Read-only**: kein SEPA-Transfer-/Überweisungscode im Sidecar oder TS.
- Sidecar bindet ausschließlich an `127.0.0.1` und verlangt Header `X-Internal-Token`.
- Geldbeträge intern immer als `bigint`/Integer-Cents — niemals Float.
- Verschlüsselung ausschließlich über bestehendes `src/lib/crypto.ts` (AES-256-GCM, `ENCRYPTION_KEY`).
- Dedupe von Transaktionen über `importHash` (FinTS/MT940 liefert oft keine stabile Entry-Ref).
- Node ist einziger DB-Writer; der Sidecar schreibt nie in die Datenbank.
- TAN-Verfahren: decoupled DKB-App (Tap) als Primärpfad, chipTAN als Fallback; Verfahren wird bei `/connect` dynamisch erkannt.
- DB-Tests laufen seriell gegen die lokale Postgres-Instanz und räumen sich per Marker-Cleanup auf.

## Sidecar-Kontrakt (verbindlich für Python und TS)

Alle Requests tragen Header `X-Internal-Token: <FINTS_SIDECAR_TOKEN>`. Cents sind JSON-Integer.

```
POST /connect
  req  { blz, user, pin, endpoint, product_id }
  resp { status: "connected", client_state: <b64>, accounts: [{iban, name, currency, type}] }
    |  { status: "need_tan", decoupled: true, challenge: <string>, pending_state: <b64> }

POST /connect/confirm
  req  { pending_state: <b64>, tan?: <string> }
  resp  (identisch zu /connect)

POST /balances
  req  { blz, user, pin, endpoint, product_id, client_state: <b64>, ibans: [<string>] }
  resp { balances: [{iban, amount_cents, currency}] }

POST /transactions
  req  { blz, user, pin, endpoint, product_id, client_state: <b64>, iban, since: "YYYY-MM-DD" }
  resp { status: "ok", transactions: [ {entry_ref, booking_date, value_date,
          amount_cents, currency, counterparty_name, counterparty_iban, purpose, raw} ] }
    |  { status: "need_tan" }
```

## File Structure

- `fints-sidecar/` — Python-Sidecar (isoliertes Unterprojekt, eigenes venv)
  - `fints_sidecar/__init__.py`
  - `fints_sidecar/mapping.py` — reine MT940→dict-Abbildung (testbar ohne Bank)
  - `fints_sidecar/gateway.py` — `FintsGateway`-Protokoll + reale python-fints-Impl
  - `fints_sidecar/app.py` — FastAPI-App, Endpoints, Token-Auth
  - `requirements.txt`, `run.sh`, `tests/test_mapping.py`, `tests/test_app.py`
- `src/lib/banking/types.ts` — **modify**: `ReadProvider`-Typ + `NeedTanError`
- `src/lib/banking/fints.ts` — **create**: `FintsProvider`
- `src/lib/banking/fints.test.ts` — **create**
- `src/lib/banking/sync.ts` — **modify**: Multi-Provider-Verallgemeinerung
- `src/lib/banking/sync.test.ts` — **modify**: FinTS-need_tan-Test
- `src/lib/banking/fints-actions.ts` — **create**: Connect/Confirm-Server-Actions
- `src/db/schema.ts` — **modify**: `provider`-Enum + `connections`-Spalten
- `src/app/(app)/settings/fints/page.tsx` + `fints-connect.tsx` — **create**: Setup-UI
- `src/app/(app)/settings/page.tsx` — **modify**: FinTS-Kachel
- `.env.example` — **modify**: Sidecar-Vars

---

### Task 1: Sidecar-Scaffold + Health-Endpoint mit Token-Auth

**Files:**
- Create: `fints-sidecar/requirements.txt`, `fints-sidecar/fints_sidecar/__init__.py`, `fints-sidecar/fints_sidecar/app.py`, `fints-sidecar/run.sh`, `fints-sidecar/tests/test_app.py`

**Interfaces:**
- Produces: FastAPI-App `fints_sidecar.app:app`; Dependency `require_token`; Env `FINTS_SIDECAR_TOKEN`.

- [ ] **Step 1: requirements.txt anlegen**

`fints-sidecar/requirements.txt`:
```
fints==5.0.0
fastapi==0.115.6
uvicorn==0.34.0
pytest==8.3.4
httpx==0.28.1
```

- [ ] **Step 2: venv + Install**

Run:
```bash
cd fints-sidecar && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
```
Expected: Installation ohne Fehler.

- [ ] **Step 3: Failing test für Health + Token schreiben**

`fints-sidecar/fints_sidecar/__init__.py`: (leer)

`fints-sidecar/tests/test_app.py`:
```python
import os
os.environ["FINTS_SIDECAR_TOKEN"] = "test-token"
from fastapi.testclient import TestClient
from fints_sidecar.app import app

client = TestClient(app)

def test_health_ok_with_token():
    r = client.get("/health", headers={"X-Internal-Token": "test-token"})
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

def test_health_rejects_missing_token():
    r = client.get("/health")
    assert r.status_code == 401
```

- [ ] **Step 4: Test ausführen — muss fehlschlagen**

Run: `cd fints-sidecar && ./.venv/bin/python -m pytest tests/test_app.py -v`
Expected: FAIL (`ModuleNotFoundError: fints_sidecar.app`).

- [ ] **Step 5: app.py minimal implementieren**

`fints-sidecar/fints_sidecar/app.py`:
```python
import os
from fastapi import FastAPI, Header, HTTPException

app = FastAPI(title="Financiero FinTS Sidecar")

def require_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = os.environ.get("FINTS_SIDECAR_TOKEN")
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

@app.get("/health")
def health(_: None = __import__("fastapi").Depends(require_token)):
    return {"status": "ok"}
```

Ersetze die `_`-Zeile durch sauberes Depends:
```python
from fastapi import Depends

@app.get("/health")
def health(_: None = Depends(require_token)):
    return {"status": "ok"}
```

- [ ] **Step 6: Test ausführen — muss bestehen**

Run: `cd fints-sidecar && ./.venv/bin/python -m pytest tests/test_app.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: run.sh anlegen**

`fints-sidecar/run.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec ./.venv/bin/uvicorn fints_sidecar.app:app --host 127.0.0.1 --port 8790
```
Run: `chmod +x fints-sidecar/run.sh`

- [ ] **Step 8: .gitignore für venv**

`fints-sidecar/.gitignore`:
```
.venv/
__pycache__/
```

- [ ] **Step 9: Commit**

```bash
git add fints-sidecar
git commit -m "feat(sidecar): scaffold FastAPI sidecar with token auth and health"
```

---

### Task 2: MT940→dict-Mapping (reine Funktion)

**Files:**
- Create: `fints-sidecar/fints_sidecar/mapping.py`, `fints-sidecar/tests/test_mapping.py`

**Interfaces:**
- Produces: `map_transaction(data: dict) -> dict` — nimmt das `.data`-Dict eines mt940-Transaktionsobjekts, liefert den Sidecar-Kontrakt-`transaction`-Eintrag. `to_cents(amount) -> int`.

- [ ] **Step 1: Failing test schreiben**

`fints-sidecar/tests/test_mapping.py`:
```python
from decimal import Decimal
from datetime import date
from fints_sidecar.mapping import map_transaction, to_cents

class FakeAmount:
    def __init__(self, amount, currency="EUR"):
        self.amount = amount
        self.currency = currency

def test_to_cents_rounds_exactly():
    assert to_cents(Decimal("-12.99")) == -1299
    assert to_cents(Decimal("2500.00")) == 250000

def test_maps_debit_fields():
    data = {
        "amount": FakeAmount(Decimal("-12.99")),
        "date": date(2026, 7, 1),
        "entry_date": date(2026, 7, 2),
        "applicant_name": "Netflix",
        "applicant_iban": "DE111",
        "purpose": "ABO 12345",
        "bank_reference": "ref-1",
    }
    row = map_transaction(data)
    assert row["amount_cents"] == -1299
    assert row["currency"] == "EUR"
    assert row["booking_date"] == "2026-07-01"
    assert row["value_date"] == "2026-07-02"
    assert row["counterparty_name"] == "Netflix"
    assert row["counterparty_iban"] == "DE111"
    assert row["purpose"] == "ABO 12345"
    assert row["entry_ref"] == "ref-1"

def test_missing_optional_fields_become_null():
    data = {"amount": FakeAmount(Decimal("1.00")), "date": date(2026, 7, 5)}
    row = map_transaction(data)
    assert row["counterparty_name"] is None
    assert row["value_date"] is None
    assert row["entry_ref"] is None
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `cd fints-sidecar && ./.venv/bin/python -m pytest tests/test_mapping.py -v`
Expected: FAIL (`ModuleNotFoundError: fints_sidecar.mapping`).

- [ ] **Step 3: mapping.py implementieren**

`fints-sidecar/fints_sidecar/mapping.py`:
```python
from decimal import Decimal, ROUND_HALF_UP

def to_cents(amount: Decimal) -> int:
    return int((Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def _iso(d) -> str | None:
    return d.isoformat() if d is not None else None

def map_transaction(data: dict) -> dict:
    amt = data["amount"]
    value_date = data.get("entry_date") or data.get("guessed_entry_date")
    return {
        "entry_ref": data.get("bank_reference") or data.get("id"),
        "booking_date": _iso(data.get("date")),
        "value_date": _iso(value_date),
        "amount_cents": to_cents(amt.amount),
        "currency": getattr(amt, "currency", "EUR") or "EUR",
        "counterparty_name": data.get("applicant_name"),
        "counterparty_iban": data.get("applicant_iban"),
        "purpose": data.get("purpose"),
        "raw": {k: str(v) for k, v in data.items()},
    }
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `cd fints-sidecar && ./.venv/bin/python -m pytest tests/test_mapping.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add fints-sidecar/fints_sidecar/mapping.py fints-sidecar/tests/test_mapping.py
git commit -m "feat(sidecar): MT940 transaction mapping to contract dict"
```

---

### Task 3: FinTS-Gateway-Protokoll + Endpoints (mit Fake im Test)

**Files:**
- Create: `fints-sidecar/fints_sidecar/gateway.py`
- Modify: `fints-sidecar/fints_sidecar/app.py`
- Modify: `fints-sidecar/tests/test_app.py`

**Interfaces:**
- Consumes: `map_transaction` (Task 2), `require_token` (Task 1).
- Produces: `Gateway`-Protokoll mit `connect`, `confirm`, `balances`, `transactions`; `get_gateway()` (überschreibbar via FastAPI-`dependency_overrides`); Endpoints `/connect`, `/connect/confirm`, `/balances`, `/transactions`.

- [ ] **Step 1: Gateway-Protokoll + reale Implementierung anlegen**

`fints-sidecar/fints_sidecar/gateway.py`:
```python
from typing import Protocol
import base64
from datetime import date
from fints.client import FinTS3PinTanClient, NeedTANResponse
from .mapping import map_transaction, to_cents

class Gateway(Protocol):
    def connect(self, blz, user, pin, endpoint, product_id) -> dict: ...
    def confirm(self, pending_state, tan) -> dict: ...
    def balances(self, creds, client_state, ibans) -> list[dict]: ...
    def transactions(self, creds, client_state, iban, since) -> dict: ...

def _client(blz, user, pin, endpoint, product_id, from_data=None):
    return FinTS3PinTanClient(
        blz, user, pin, endpoint,
        product_id=product_id,
        from_data=base64.b64decode(from_data) if from_data else None,
    )

def _accounts(client) -> list[dict]:
    out = []
    for a in client.get_sepa_accounts():
        out.append({
            "iban": a.iban,
            "name": getattr(a, "accountnumber", a.iban),
            "currency": "EUR",
            "type": "checking",
        })
    return out

def _need_tan(resp: NeedTANResponse, client) -> dict:
    return {
        "status": "need_tan",
        "decoupled": bool(getattr(resp, "decoupled", False)),
        "challenge": getattr(resp, "challenge", "") or "",
        "pending_state": base64.b64encode(resp.get_data()).decode(),
        "client_state": base64.b64encode(client.deconstruct(including_private=True)).decode(),
    }

class RealGateway:
    def connect(self, blz, user, pin, endpoint, product_id) -> dict:
        client = _client(blz, user, pin, endpoint, product_id)
        with client:
            if isinstance(client.init_tan_response, NeedTANResponse):
                return _need_tan(client.init_tan_response, client)
            state = base64.b64encode(client.deconstruct(including_private=True)).decode()
            return {"status": "connected", "client_state": state, "accounts": _accounts(client)}
    # confirm/balances/transactions folgen in Step 3
```

- [ ] **Step 2: Failing tests für die Endpoints (mit Fake-Gateway) schreiben**

An `fints-sidecar/tests/test_app.py` anhängen:
```python
from fints_sidecar.app import get_gateway

class FakeGateway:
    def connect(self, blz, user, pin, endpoint, product_id):
        return {"status": "need_tan", "decoupled": True, "challenge": "tap app",
                "pending_state": "cGVuZA==", "client_state": "c3RhdGU="}
    def confirm(self, pending_state, tan):
        return {"status": "connected", "client_state": "c3RhdGU=",
                "accounts": [{"iban": "DE1", "name": "Giro", "currency": "EUR", "type": "checking"}]}
    def balances(self, creds, client_state, ibans):
        return [{"iban": i, "amount_cents": 100000, "currency": "EUR"} for i in ibans]
    def transactions(self, creds, client_state, iban, since):
        return {"status": "ok", "transactions": [{
            "entry_ref": None, "booking_date": "2026-07-01", "value_date": None,
            "amount_cents": -1299, "currency": "EUR", "counterparty_name": "Netflix",
            "counterparty_iban": None, "purpose": "abo", "raw": {}}]}

app.dependency_overrides[get_gateway] = lambda: FakeGateway()
H = {"X-Internal-Token": "test-token"}

def test_connect_returns_need_tan():
    r = client.post("/connect", headers=H, json={
        "blz": "12030000", "user": "u", "pin": "p",
        "endpoint": "https://fints.dkb.de/fints", "product_id": "x"})
    assert r.status_code == 200
    assert r.json()["status"] == "need_tan"
    assert r.json()["decoupled"] is True

def test_confirm_returns_connected_with_accounts():
    r = client.post("/connect/confirm", headers=H, json={"pending_state": "cGVuZA==", "tan": ""})
    body = r.json()
    assert body["status"] == "connected"
    assert body["accounts"][0]["iban"] == "DE1"

def test_transactions_maps_contract():
    r = client.post("/transactions", headers=H, json={
        "blz": "12030000", "user": "u", "pin": "p", "endpoint": "e",
        "product_id": "x", "client_state": "c3RhdGU=", "iban": "DE1", "since": "2026-06-01"})
    body = r.json()
    assert body["status"] == "ok"
    assert body["transactions"][0]["amount_cents"] == -1299
```

- [ ] **Step 3: Gateway fertigstellen (confirm/balances/transactions)**

An `fints-sidecar/fints_sidecar/gateway.py` in Klasse `RealGateway` ergänzen:
```python
    def confirm(self, pending_state, tan) -> dict:
        # pending_state enthält Client- und TAN-State; hier wieder aufsetzen.
        blob = base64.b64decode(pending_state)
        resp = NeedRetryResponse.from_data(blob)
        client = _client_from_pending(resp)
        with client._get_dialog():
            result = client.send_tan(resp, tan or "")
            if isinstance(result, NeedTANResponse):
                return _need_tan(result, client)
            state = base64.b64encode(client.deconstruct(including_private=True)).decode()
            return {"status": "connected", "client_state": state, "accounts": _accounts(client)}

    def balances(self, creds, client_state, ibans) -> list[dict]:
        client = _client(**creds, from_data=client_state)
        out = []
        with client:
            by_iban = {a.iban: a for a in client.get_sepa_accounts()}
            for iban in ibans:
                acc = by_iban.get(iban)
                if not acc:
                    continue
                bal = client.get_balance(acc)
                out.append({"iban": iban, "amount_cents": to_cents(bal.amount.amount),
                            "currency": bal.amount.currency or "EUR"})
        return out

    def transactions(self, creds, client_state, iban, since) -> dict:
        client = _client(**creds, from_data=client_state)
        with client:
            acc = next((a for a in client.get_sepa_accounts() if a.iban == iban), None)
            if acc is None:
                return {"status": "ok", "transactions": []}
            result = client.get_transactions(acc, start_date=date.fromisoformat(since))
            if isinstance(result, NeedTANResponse):
                return {"status": "need_tan"}
            return {"status": "ok", "transactions": [map_transaction(t.data) for t in result]}
```
Und oben die Imports/Helper ergänzen:
```python
from fints.client import NeedRetryResponse

def _client_from_pending(resp) -> FinTS3PinTanClient:
    # python-fints rekonstruiert den Client aus dem im Pending-State gebündelten Blob.
    return resp.client  # NeedTANResponse trägt eine Referenz auf den erzeugenden Client
```

> Hinweis für den Umsetzer: Falls `resp.client` in der installierten python-fints-Version nicht verfügbar ist, muss der Client analog zu `RealGateway.connect` aus separat gespeichertem `client_state` rekonstruiert und `client.resume_dialog(dialog_data)` genutzt werden. Diese reale Verkabelung wird in Task 11 am echten DKB-Zugang verifiziert; die Endpoints sind über den Fake bereits testgedeckt.

- [ ] **Step 4: Endpoints in app.py implementieren**

An `fints-sidecar/fints_sidecar/app.py` ergänzen:
```python
from pydantic import BaseModel
from fints_sidecar.gateway import Gateway, RealGateway

def get_gateway() -> Gateway:
    return RealGateway()

class ConnectReq(BaseModel):
    blz: str; user: str; pin: str; endpoint: str; product_id: str

class ConfirmReq(BaseModel):
    pending_state: str; tan: str = ""

class BalancesReq(BaseModel):
    blz: str; user: str; pin: str; endpoint: str; product_id: str
    client_state: str; ibans: list[str]

class TxReq(BaseModel):
    blz: str; user: str; pin: str; endpoint: str; product_id: str
    client_state: str; iban: str; since: str

def _creds(r) -> dict:
    return {"blz": r.blz, "user": r.user, "pin": r.pin,
            "endpoint": r.endpoint, "product_id": r.product_id}

@app.post("/connect")
def connect(r: ConnectReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    return gw.connect(r.blz, r.user, r.pin, r.endpoint, r.product_id)

@app.post("/connect/confirm")
def confirm(r: ConfirmReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    return gw.confirm(r.pending_state, r.tan)

@app.post("/balances")
def balances(r: BalancesReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    return {"balances": gw.balances(_creds(r), r.client_state, r.ibans)}

@app.post("/transactions")
def transactions(r: TxReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    return gw.transactions(_creds(r), r.client_state, r.iban, r.since)
```

- [ ] **Step 5: Tests ausführen — müssen bestehen**

Run: `cd fints-sidecar && ./.venv/bin/python -m pytest -v`
Expected: PASS (alle, inkl. 3 neue Endpoint-Tests).

- [ ] **Step 6: Commit**

```bash
git add fints-sidecar
git commit -m "feat(sidecar): gateway protocol + connect/confirm/balances/transactions endpoints"
```

---

### Task 4: Schema — `fints`-Provider + `connections`-Spalten

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/schema.fints.test.ts`

**Interfaces:**
- Produces: `providerEnum` mit `"fints"`; `connections`-Spalten `blz`, `fintsUserId`, `fintsEndpoint`, `fintsProductId`, `pinEnc`, `fintsStateEnc`, `tanMechanism` (alle `text`, nullable).

- [ ] **Step 1: Failing test schreiben**

`src/db/schema.fints.test.ts`:
```typescript
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { connections } from "./schema";
import { encrypt } from "@/lib/crypto";

describe("fints connection columns", () => {
  const marker = `fints-${crypto.randomUUID()}`;
  afterAll(async () => {
    await db.delete(connections).where(eq(connections.aspspName, marker));
  });

  it("stores a fints connection with encrypted pin and state", async () => {
    const [c] = await db
      .insert(connections)
      .values({
        provider: "fints",
        aspspName: marker,
        blz: "12030000",
        fintsUserId: "user1",
        fintsEndpoint: "https://fints.dkb.de/fints",
        fintsProductId: "PRODID",
        pinEnc: encrypt("1234"),
        fintsStateEnc: encrypt("state-blob"),
        tanMechanism: "decoupled",
      })
      .returning();
    expect(c.provider).toBe("fints");
    expect(c.blz).toBe("12030000");
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm run test -- src/db/schema.fints.test.ts`
Expected: FAIL (Spalten existieren nicht / Enum-Wert unbekannt).

- [ ] **Step 3: schema.ts anpassen**

In `src/db/schema.ts`, `providerEnum` erweitern:
```typescript
export const providerEnum = pgEnum("provider", ["enable_banking", "csv", "fints"]);
```
Im `connections`-`pgTable`, nach `sessionIdEnc`, ergänzen:
```typescript
  blz: text("blz"),
  fintsUserId: text("fints_user_id"),
  fintsEndpoint: text("fints_endpoint"),
  fintsProductId: text("fints_product_id"),
  pinEnc: text("pin_enc"),
  fintsStateEnc: text("fints_state_enc"),
  tanMechanism: text("tan_mechanism"),
```

- [ ] **Step 4: Schema in die DB pushen**

Run: `npm run db:push`
Expected: Drizzle wendet Enum- und Spaltenänderungen an (bei Prompt „add column" bestätigen).

- [ ] **Step 5: Test ausführen — muss bestehen**

Run: `npm run test -- src/db/schema.fints.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/schema.fints.test.ts
git commit -m "feat(db): add fints provider enum value and connection columns"
```

---

### Task 5: `ReadProvider`-Typ + `NeedTanError`

**Files:**
- Modify: `src/lib/banking/types.ts`

**Interfaces:**
- Produces: `export type ReadProvider = Pick<BankProvider, "fetchBalances" | "fetchTransactions">;` und `export class NeedTanError extends Error`.

- [ ] **Step 1: Typen ergänzen**

Am Ende von `src/lib/banking/types.ts` anhängen:
```typescript
/** Schmales Interface, das runSync tatsächlich braucht — beide Provider erfüllen es. */
export type ReadProvider = Pick<BankProvider, "fetchBalances" | "fetchTransactions">;

/** Signalisiert, dass die Bank eine (erneute) TAN-Freigabe verlangt. */
export class NeedTanError extends Error {
  constructor(message = "TAN-Freigabe erforderlich") {
    super(message);
    this.name = "NeedTanError";
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/banking/types.ts
git commit -m "feat(banking): add ReadProvider type and NeedTanError"
```

---

### Task 6: `FintsProvider` (TS-Client für den Sidecar)

**Files:**
- Create: `src/lib/banking/fints.ts`, `src/lib/banking/fints.test.ts`

**Interfaces:**
- Consumes: `ReadProvider`, `NeedTanError`, `ProviderBalance`, `ProviderTransaction` (types.ts).
- Produces: `class FintsProvider implements ReadProvider` mit Konstruktor `(cfg: FintsProviderConfig)`; Interface `FintsProviderConfig { baseUrl; token; blz; user; pin; endpoint; productId; clientState; fetchImpl? }`; `fintsProviderFromConn(conn, fetchImpl?)`.

- [ ] **Step 1: Failing test schreiben**

`src/lib/banking/fints.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";
import { FintsProvider, type FintsProviderConfig } from "./fints";
import { NeedTanError } from "./types";

function json(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

function cfg(fetchImpl: typeof fetch): FintsProviderConfig {
  return {
    baseUrl: "http://127.0.0.1:8790", token: "tok", blz: "12030000", user: "u",
    pin: "p", endpoint: "https://fints.dkb.de/fints", productId: "x",
    clientState: "c3RhdGU=", fetchImpl,
  };
}

describe("FintsProvider.fetchBalances", () => {
  it("maps balances to cents bigint", async () => {
    const f = vi.fn().mockResolvedValue(json({ balances: [{ iban: "DE1", amount_cents: 100000, currency: "EUR" }] }));
    const p = new FintsProvider(cfg(f as unknown as typeof fetch));
    const res = await p.fetchBalances("", ["DE1"]);
    expect(res[0].amountCents).toBe(100000n);
    expect(res[0].accountUid).toBe("DE1");
    expect((f.mock.calls[0][0] as string)).toContain("/balances");
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "X-Internal-Token": "tok" });
  });
});

describe("FintsProvider.fetchTransactions", () => {
  it("maps transactions and preserves sign", async () => {
    const f = vi.fn().mockResolvedValue(json({ status: "ok", transactions: [{
      entry_ref: null, booking_date: "2026-07-01", value_date: null, amount_cents: -1299,
      currency: "EUR", counterparty_name: "Netflix", counterparty_iban: null, purpose: "abo", raw: {} }] }));
    const p = new FintsProvider(cfg(f as unknown as typeof fetch));
    const res = await p.fetchTransactions("", "DE1", "2026-06-01");
    expect(res[0].amountCents).toBe(-1299n);
    expect(res[0].counterpartyName).toBe("Netflix");
    expect(res[0].bookingDate).toBe("2026-07-01");
  });

  it("throws NeedTanError on need_tan", async () => {
    const f = vi.fn().mockResolvedValue(json({ status: "need_tan" }));
    const p = new FintsProvider(cfg(f as unknown as typeof fetch));
    await expect(p.fetchTransactions("", "DE1", "2026-06-01")).rejects.toBeInstanceOf(NeedTanError);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm run test -- src/lib/banking/fints.test.ts`
Expected: FAIL (`FintsProvider` nicht gefunden).

- [ ] **Step 3: fints.ts implementieren**

`src/lib/banking/fints.ts`:
```typescript
import { NeedTanError, type ProviderBalance, type ProviderTransaction, type ReadProvider } from "./types";

export interface FintsProviderConfig {
  baseUrl: string;
  token: string;
  blz: string;
  user: string;
  pin: string;
  endpoint: string;
  productId: string;
  clientState: string;
  fetchImpl?: typeof fetch;
}

interface RawTx {
  entry_ref: string | null;
  booking_date: string;
  value_date: string | null;
  amount_cents: number;
  currency: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  purpose: string | null;
  raw: unknown;
}

export class FintsProvider implements ReadProvider {
  private fetchImpl: typeof fetch;
  constructor(private cfg: FintsProviderConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private creds() {
    return {
      blz: this.cfg.blz, user: this.cfg.user, pin: this.cfg.pin,
      endpoint: this.cfg.endpoint, product_id: this.cfg.productId,
      client_state: this.cfg.clientState,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": this.cfg.token },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`FinTS-Sidecar ${res.status}: ${await res.text().catch(() => "")}`);
    return (await res.json()) as T;
  }

  async fetchBalances(_sessionId: string, accountUids: string[]): Promise<ProviderBalance[]> {
    const data = await this.post<{ balances: Array<{ iban: string; amount_cents: number; currency: string }> }>(
      "/balances", { ...this.creds(), ibans: accountUids },
    );
    return data.balances.map((b) => ({
      accountUid: b.iban, amountCents: BigInt(b.amount_cents), currency: b.currency,
    }));
  }

  async fetchTransactions(_sessionId: string, accountUid: string, sinceISO: string): Promise<ProviderTransaction[]> {
    const data = await this.post<{ status: string; transactions?: RawTx[] }>(
      "/transactions", { ...this.creds(), iban: accountUid, since: sinceISO },
    );
    if (data.status === "need_tan") throw new NeedTanError();
    return (data.transactions ?? []).map((t) => ({
      accountUid, entryRef: t.entry_ref, bookingDate: t.booking_date, valueDate: t.value_date,
      amountCents: BigInt(t.amount_cents), currency: t.currency,
      counterpartyName: t.counterparty_name, counterpartyIban: t.counterparty_iban,
      purpose: t.purpose, raw: t.raw,
    }));
  }
}
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npm run test -- src/lib/banking/fints.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/banking/fints.ts src/lib/banking/fints.test.ts
git commit -m "feat(banking): FintsProvider calling the sidecar"
```

---

### Task 7: `runSync` auf Multi-Provider verallgemeinern

**Files:**
- Modify: `src/lib/banking/sync.ts`
- Modify: `src/lib/banking/sync.test.ts`

**Interfaces:**
- Consumes: `FintsProvider` (Task 6), `NeedTanError` (Task 5), `ReadProvider` (Task 5).
- Produces: `runSync` iteriert über **alle** aktiven Connections; `SyncOptions.provider` ist `ReadProvider`; `NeedTanError` und Consent-Fehler setzen Connection auf `expired`.

- [ ] **Step 1: Failing test ergänzen**

In `src/lib/banking/sync.test.ts` den Import erweitern und einen Test anhängen:
```typescript
// oben ergänzen:
import { NeedTanError } from "./types";

// innerhalb describe("runSync", ...), nach dem letzten it():
it("marks a fints connection expired when the provider needs a TAN", async () => {
  const iban = `DE-${crypto.randomUUID()}`;
  const [conn] = await db.insert(connections).values({
    provider: "fints", aspspName: MARKER, status: "active",
    blz: "12030000", fintsUserId: "u", fintsEndpoint: "e", fintsProductId: "x",
    pinEnc: encrypt("1234"), fintsStateEnc: encrypt("state"),
  }).returning();
  await db.insert(bankAccounts).values({ connectionId: conn.id, ebAccountUid: iban, name: "Giro", currency: "EUR" });

  const provider: BankProvider = {
    getAspsps: async () => [], startAuth: async () => ({ url: "" }),
    completeAuth: async () => ({ sessionId: "", validUntil: null, accounts: [] }),
    fetchBalances: async () => [],
    fetchTransactions: async () => { throw new NeedTanError(); },
  };
  await runSync("cron", { provider, today: new Date("2026-07-10") });
  const [after] = await db.select().from(connections).where(eq(connections.id, conn.id));
  expect(after.status).toBe("expired");
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm run test -- src/lib/banking/sync.test.ts`
Expected: FAIL (Connection bleibt `active`, weil FinTS-Provider nicht gebaut/`NeedTanError` nicht behandelt wird bzw. `provider`-Filter greift).

- [ ] **Step 3: sync.ts anpassen**

In `src/lib/banking/sync.ts` die Imports erweitern:
```typescript
import { FintsProvider } from "./fints";
import { NeedTanError, type BankProvider, type ProviderTransaction, type ReadProvider } from "./types";
```
`SyncOptions.provider` umtypen:
```typescript
  provider?: ReadProvider;
```
Den Connections-Query entschärfen (alle aktiven, egal welcher Provider):
```typescript
  const conns = await db
    .select()
    .from(connections)
    .where(eq(connections.status, "active"));
```
Eine Provider-Bauhilfe oberhalb `runSync` einfügen:
```typescript
function buildProvider(conn: typeof connections.$inferSelect): { provider: ReadProvider; sessionId: string } {
  if (conn.provider === "fints") {
    const baseUrl = process.env.FINTS_SIDECAR_URL ?? "http://127.0.0.1:8790";
    const token = process.env.FINTS_SIDECAR_TOKEN ?? "";
    return {
      provider: new FintsProvider({
        baseUrl, token,
        blz: conn.blz ?? "", user: conn.fintsUserId ?? "",
        pin: conn.pinEnc ? decrypt(conn.pinEnc) : "",
        endpoint: conn.fintsEndpoint ?? "", productId: conn.fintsProductId ?? "",
        clientState: conn.fintsStateEnc ? decrypt(conn.fintsStateEnc) : "",
      }),
      sessionId: "",
    };
  }
  return {
    provider: enableBankingFromEnv(),
    sessionId: conn.sessionIdEnc ? decrypt(conn.sessionIdEnc) : "",
  };
}
```
Im `for (const conn of conns)`-Block den bisherigen Provider-Aufbau ersetzen:
```typescript
    let provider: ReadProvider;
    let sessionId: string;
    try {
      if (opts.provider) {
        provider = opts.provider;
        sessionId = conn.sessionIdEnc ? decrypt(conn.sessionIdEnc) : "";
      } else {
        ({ provider, sessionId } = buildProvider(conn));
      }
    } catch (e) {
      stats.errors.push(`${conn.aspspName}: ${(e as Error).message}`);
      continue;
    }
```
`isConsentError` erweitern, sodass `NeedTanError` ebenfalls „expired" auslöst:
```typescript
function isConsentError(e: unknown): boolean {
  if (e instanceof NeedTanError) return true;
  const msg = (e as Error)?.message ?? "";
  return /\b(401|403)\b/.test(msg);
}
```

- [ ] **Step 4: Tests ausführen — alle müssen bestehen**

Run: `npm run test -- src/lib/banking/sync.test.ts`
Expected: PASS (bestehende EB-Tests + neuer FinTS-Test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/banking/sync.ts src/lib/banking/sync.test.ts
git commit -m "feat(banking): generalize runSync to multi-provider with NeedTan->expired"
```

---

### Task 8: Connect/Confirm-Server-Actions

**Files:**
- Create: `src/lib/banking/fints-actions.ts`, `src/lib/banking/fints-actions.test.ts`

**Interfaces:**
- Consumes: `db`, `connections`, `bankAccounts` (schema), `encrypt`/`decrypt` (crypto).
- Produces: `startFintsConnect(input: FintsConnectInput): Promise<FintsConnectResult>` und `confirmFintsTan(connectionId: string): Promise<FintsConnectResult>`, mit `FintsConnectResult = { status: "connected" | "need_tan"; connectionId: string; challenge?: string }`. Beide über `sidecarPost` (injizierbar für Tests via `__setFetch`).

- [ ] **Step 1: Failing test schreiben**

`src/lib/banking/fints-actions.test.ts`:
```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections } from "@/db/schema";
import { startFintsConnect, confirmFintsTan, __setFetch } from "./fints-actions";

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => "" } as unknown as Response;
}

const MARKER = "DKB";

afterEach(async () => {
  const conns = await db.select().from(connections).where(eq(connections.aspspName, MARKER));
  for (const c of conns) {
    await db.delete(bankAccounts).where(eq(bankAccounts.connectionId, c.id));
    await db.delete(connections).where(eq(connections.id, c.id));
  }
  __setFetch(undefined);
});

describe("startFintsConnect", () => {
  it("persists an expired pending connection on need_tan", async () => {
    __setFetch(vi.fn().mockResolvedValue(json({
      status: "need_tan", decoupled: true, challenge: "tap", pending_state: "cGVuZA==", client_state: "c3Q=",
    })) as unknown as typeof fetch);

    const res = await startFintsConnect({
      blz: "12030000", user: "u", pin: "1234",
      endpoint: "https://fints.dkb.de/fints", productId: "x",
    });
    expect(res.status).toBe("need_tan");
    const [c] = await db.select().from(connections).where(eq(connections.id, res.connectionId));
    expect(c.status).toBe("expired");
    expect(c.pinEnc).toBeTruthy();
    expect(c.pinEnc).not.toContain("1234"); // verschlüsselt
  });
});

describe("confirmFintsTan", () => {
  it("activates the connection and stores accounts on connected", async () => {
    __setFetch(vi.fn().mockResolvedValue(json({
      status: "need_tan", decoupled: true, challenge: "tap", pending_state: "cGVuZA==", client_state: "c3Q=",
    })) as unknown as typeof fetch);
    const started = await startFintsConnect({
      blz: "12030000", user: "u", pin: "1234", endpoint: "e", productId: "x",
    });

    __setFetch(vi.fn().mockResolvedValue(json({
      status: "connected", client_state: "ZmluYWw=",
      accounts: [{ iban: "DE1", name: "Giro", currency: "EUR", type: "checking" }],
    })) as unknown as typeof fetch);
    const res = await confirmFintsTan(started.connectionId);

    expect(res.status).toBe("connected");
    const [c] = await db.select().from(connections).where(eq(connections.id, started.connectionId));
    expect(c.status).toBe("active");
    const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.connectionId, started.connectionId));
    expect(accts.map((a) => a.ebAccountUid)).toContain("DE1");
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm run test -- src/lib/banking/fints-actions.test.ts`
Expected: FAIL (`fints-actions` nicht gefunden).

- [ ] **Step 3: fints-actions.ts implementieren**

`src/lib/banking/fints-actions.ts`:
```typescript
"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, connections } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { requireSession } from "@/lib/session";

export interface FintsConnectInput {
  blz: string; user: string; pin: string; endpoint: string; productId: string;
}
export interface FintsConnectResult {
  status: "connected" | "need_tan"; connectionId: string; challenge?: string;
}
interface SidecarAccount { iban: string; name: string; currency: string; type: string }
interface SidecarResult {
  status: "connected" | "need_tan"; client_state?: string;
  pending_state?: string; challenge?: string; accounts?: SidecarAccount[];
}

let fetchOverride: typeof fetch | undefined;
/** Nur für Tests: injiziert ein fetch. */
export function __setFetch(f: typeof fetch | undefined) { fetchOverride = f; }

async function sidecarPost(path: string, body: unknown): Promise<SidecarResult> {
  const f = fetchOverride ?? fetch;
  const baseUrl = process.env.FINTS_SIDECAR_URL ?? "http://127.0.0.1:8790";
  const token = process.env.FINTS_SIDECAR_TOKEN ?? "";
  const res = await f(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`FinTS-Sidecar ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as SidecarResult;
}

async function saveAccounts(connectionId: string, accts: SidecarAccount[]): Promise<void> {
  for (const a of accts) {
    const existing = await db.select().from(bankAccounts).where(eq(bankAccounts.ebAccountUid, a.iban));
    if (existing.length === 0) {
      await db.insert(bankAccounts).values({
        connectionId, ebAccountUid: a.iban, name: a.name, currency: a.currency, type: "checking",
      });
    }
  }
}

export async function startFintsConnect(input: FintsConnectInput): Promise<FintsConnectResult> {
  await requireSession();
  const r = await sidecarPost("/connect", {
    blz: input.blz, user: input.user, pin: input.pin,
    endpoint: input.endpoint, product_id: input.productId,
  });
  const [conn] = await db.insert(connections).values({
    provider: "fints", aspspName: "DKB", aspspCountry: "DE",
    status: r.status === "connected" ? "active" : "expired",
    blz: input.blz, fintsUserId: input.user, fintsEndpoint: input.endpoint,
    fintsProductId: input.productId, pinEnc: encrypt(input.pin),
    fintsStateEnc: encrypt(r.status === "connected" ? (r.client_state ?? "") : (r.pending_state ?? "")),
    tanMechanism: "decoupled",
  }).returning();

  if (r.status === "connected") {
    await saveAccounts(conn.id, r.accounts ?? []);
    return { status: "connected", connectionId: conn.id };
  }
  return { status: "need_tan", connectionId: conn.id, challenge: r.challenge };
}

export async function confirmFintsTan(connectionId: string): Promise<FintsConnectResult> {
  await requireSession();
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!conn) throw new Error("Verbindung nicht gefunden");
  const pendingState = conn.fintsStateEnc ? decrypt(conn.fintsStateEnc) : "";

  const r = await sidecarPost("/connect/confirm", { pending_state: pendingState, tan: "" });
  if (r.status === "connected") {
    await db.update(connections).set({
      status: "active", fintsStateEnc: encrypt(r.client_state ?? ""),
    }).where(eq(connections.id, connectionId));
    await saveAccounts(connectionId, r.accounts ?? []);
    return { status: "connected", connectionId };
  }
  // Noch nicht in der App bestätigt — Pending-State aktualisieren, weiter pollen.
  if (r.pending_state) {
    await db.update(connections).set({ fintsStateEnc: encrypt(r.pending_state) }).where(eq(connections.id, connectionId));
  }
  return { status: "need_tan", connectionId, challenge: r.challenge };
}
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npm run test -- src/lib/banking/fints-actions.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/banking/fints-actions.ts src/lib/banking/fints-actions.test.ts
git commit -m "feat(banking): fints connect/confirm server actions"
```

---

### Task 9: Setup-UI unter `/settings/fints`

**Files:**
- Create: `src/app/(app)/settings/fints/page.tsx`, `src/app/(app)/settings/fints/fints-connect.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `startFintsConnect`, `confirmFintsTan` (Task 8).
- Produces: Route `/settings/fints` mit Client-Formular + Decoupled-Polling.

- [ ] **Step 1: Client-Komponente anlegen**

`src/app/(app)/settings/fints/fints-connect.tsx`:
```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startFintsConnect, confirmFintsTan } from "@/lib/banking/fints-actions";

export function FintsConnect() {
  const [phase, setPhase] = useState<"form" | "waiting" | "done">("form");
  const [challenge, setChallenge] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await startFintsConnect({
        blz: String(fd.get("blz")), user: String(fd.get("user")),
        pin: String(fd.get("pin")), endpoint: String(fd.get("endpoint")),
        productId: String(fd.get("productId")),
      });
      if (res.status === "connected") { setPhase("done"); toast.success("DKB verbunden"); return; }
      setChallenge(res.challenge ?? "Bitte in der DKB-App bestätigen");
      setPhase("waiting");
      poll(res.connectionId);
    } catch (err) {
      toast.error("Verbindung fehlgeschlagen", { description: (err as Error).message });
    }
  }

  async function poll(connectionId: string) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await confirmFintsTan(connectionId);
        if (res.status === "connected") { setPhase("done"); toast.success("DKB verbunden"); return; }
      } catch (err) {
        toast.error("Freigabe fehlgeschlagen", { description: (err as Error).message });
        setPhase("form"); return;
      }
    }
    toast.error("Zeitüberschreitung — bitte erneut versuchen");
    setPhase("form");
  }

  if (phase === "done") return <p className="text-sm text-green-600">DKB ist verbunden. Zurück zu den Bankverbindungen.</p>;
  if (phase === "waiting")
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Bitte in der DKB-App bestätigen…</p>
        <p className="text-sm text-muted-foreground">{challenge}</p>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      <div><Label htmlFor="blz">BLZ</Label><Input id="blz" name="blz" defaultValue="12030000" /></div>
      <div><Label htmlFor="user">Anmeldename</Label><Input id="user" name="user" required /></div>
      <div><Label htmlFor="pin">Banking-PIN</Label><Input id="pin" name="pin" type="password" required /></div>
      <div><Label htmlFor="endpoint">FinTS-Endpoint</Label><Input id="endpoint" name="endpoint" defaultValue="https://fints.dkb.de/fints" /></div>
      <div><Label htmlFor="productId">Produkt-ID</Label><Input id="productId" name="productId" required /></div>
      <Button type="submit">Verbinden</Button>
    </form>
  );
}
```

- [ ] **Step 2: Server-Page anlegen**

`src/app/(app)/settings/fints/page.tsx`:
```tsx
import { PageHeader } from "@/components/page-header";
import { FintsConnect } from "./fints-connect";

export default function FintsPage() {
  return (
    <>
      <PageHeader title="DKB verbinden (FinTS)" />
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        BLZ, Anmeldename, PIN und deine FinTS-Produkt-ID eingeben. Anschließend die
        Verbindung einmalig in der DKB-App per Tap bestätigen.
      </p>
      <FintsConnect />
    </>
  );
}
```

- [ ] **Step 3: FinTS-Kachel in die Settings-Übersicht einfügen**

In `src/app/(app)/settings/page.tsx`, innerhalb des `<div className="grid ...">`, nach dem Bankverbindungen-`<Link>`, ergänzen:
```tsx
        <Link href="/settings/fints">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle className="text-base">DKB via FinTS</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Kostenlose Live-Synchronisation der DKB über FinTS/HBCI.
            </CardContent>
          </Card>
        </Link>
```

- [ ] **Step 4: Build/Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Manuelle Sichtprüfung**

Run: `npm run dev` und `/settings/fints` öffnen.
Expected: Formular rendert, BLZ `12030000` und Endpoint vorbefüllt.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/settings/fints" "src/app/(app)/settings/page.tsx"
git commit -m "feat(ui): FinTS setup page with decoupled TAN polling"
```

---

### Task 10: Env-Dokumentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Sidecar-Vars ergänzen**

An `.env.example` anhängen:
```
FINTS_SIDECAR_URL=http://127.0.0.1:8790
FINTS_SIDECAR_TOKEN=           # openssl rand -hex 32 (muss dem Sidecar-Env entsprechen)
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document FinTS sidecar env vars"
```

---

### Task 11: End-to-End-Verifikation gegen echte DKB (manuell)

**Files:** keine (Verifikationsschritt)

> Voraussetzung: FinTS-Produkt-ID ist zugeteilt, `FINTS_SIDECAR_TOKEN` in `.env` und im Sidecar-Env gesetzt, Postgres läuft.

- [ ] **Step 1: Sidecar starten**

Run: `FINTS_SIDECAR_TOKEN=<token> ./fints-sidecar/run.sh`
Expected: `Uvicorn running on http://127.0.0.1:8790`.

- [ ] **Step 2: Next.js starten & verbinden**

Run: `npm run dev`, dann `/settings/fints` → Formular mit echten DKB-Daten + Produkt-ID absenden.
Expected: „Bitte in der DKB-App bestätigen" → nach Tap in der DKB-App wechselt die Seite auf „DKB ist verbunden".

> Falls der decoupled-Flow hier hakt (bekanntes python-fints/DKB-Risiko): auf chipTAN ausweichen — der Sidecar erkennt das Verfahren dynamisch; die UI müsste dann ein TAN-Eingabefeld ergänzen (Folge-Task, nur bei Bedarf).

- [ ] **Step 3: Manuellen Sync auslösen**

Auf dem Dashboard „Jetzt synchronisieren" klicken (bestehender `SyncButton` → `runManualSync` → jetzt Multi-Provider).
Expected: Toast „Sync fertig: N neu"; echte DKB-Umsätze erscheinen in der Transaktionsliste, kategorisiert durch die bestehende Pipeline.

- [ ] **Step 4: Idempotenz prüfen**

Erneut „Jetzt synchronisieren".
Expected: „Sync fertig: 0 neu" (importHash-Dedupe greift).

- [ ] **Step 5: Abschluss-Commit (Doku/Notizen, falls entstanden)**

```bash
git add -A
git commit -m "test: manual E2E verification against DKB FinTS" --allow-empty
```

---

## Self-Review

- **Spec-Coverage:** Sidecar (Task 1–3) ✓ · TS-Provider (Task 6) ✓ · runSync-Multi-Provider (Task 7) ✓ · Schema (Task 4) ✓ · PIN/State-Verschlüsselung (Task 4/8, `crypto.ts`) ✓ · Setup- & Decoupled-Flow (Task 8/9) ✓ · 90-Tage-Re-Auth über `expired` (Task 7, `NeedTanError`) ✓ · read-only (kein Transfer-Code) ✓ · Testing TS+Python ✓ · Restrisiko/chipTAN-Fallback dokumentiert (Task 11) ✓. Bewusst out of scope: Web-Push, Pi-Deployment, Multi-Bank — nicht eingeplant, korrekt.
- **Typ-Konsistenz:** `ReadProvider` (Task 5) wird in `FintsProvider` (6) und `runSync` (7) identisch verwendet; `NeedTanError` in 5/6/7 gleich; Sidecar-JSON-Keys (`amount_cents`, `client_state`, `pending_state`) in Python (3) und TS (6/8) identisch.
- **Platzhalter:** Der einzige nicht vollständig verkabelte Punkt ist `_client_from_pending` in Task 3 (python-fints-Versionsdetail) — explizit als am echten Zugang zu verifizierender Punkt markiert und über den Fake-Gateway testgedeckt, kein stiller Platzhalter.
