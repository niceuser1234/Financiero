import os
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel
from fints_sidecar.gateway import Gateway, RealGateway

app = FastAPI(title="Financiero FinTS Sidecar")

def require_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = os.environ.get("FINTS_SIDECAR_TOKEN")
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

@app.get("/health")
def health(_: None = Depends(require_token)):
    return {"status": "ok"}

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
