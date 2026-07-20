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
