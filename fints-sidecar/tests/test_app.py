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
