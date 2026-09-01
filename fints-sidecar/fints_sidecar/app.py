import os
from html import escape
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pydantic import BaseModel
from fints_sidecar.gateway import Gateway, GatewayError, RealGateway

app = FastAPI(title="Financiero FinTS Sidecar")


@app.exception_handler(GatewayError)
async def gateway_error_handler(_, exc: GatewayError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": {"code": exc.code, "message": exc.message}},
    )


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def index():
    app_url = escape(
        os.environ.get("APP_BASE_URL", "http://localhost:3000"),
        quote=True,
    )
    return HTMLResponse(f"""<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Financiero FinTS-Dienst</title>
    <style>
      :root {{
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      }}
      body {{
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #0a0a0a;
        color: #f5f5f5;
      }}
      main {{
        width: min(32rem, calc(100% - 3rem));
        padding: 2rem;
        border: 1px solid #303030;
        border-radius: 1rem;
        background: #151515;
        box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 35%);
      }}
      h1 {{ margin-top: 0; font-size: 1.5rem; }}
      p {{ color: #c8c8c8; line-height: 1.6; }}
      a {{
        display: inline-block;
        margin-top: .5rem;
        padding: .75rem 1rem;
        border-radius: .65rem;
        background: #f5f5f5;
        color: #111;
        font-weight: 700;
        text-decoration: none;
      }}
      code {{ color: #fff; }}
    </style>
  </head>
  <body>
    <main>
      <h1>FinTS-Hintergrunddienst läuft</h1>
      <p>
        Port <code>8790</code> ist nur die geschützte Bank-Schnittstelle.
        Die eigentliche Financiero-App läuft auf Port <code>3000</code>.
      </p>
      <a href="{app_url}">Financiero öffnen</a>
      <p>
        Falls dieser Dienst bereits separat läuft und die App nicht erreichbar
        ist, in einem zweiten Terminal <code>npm run dev</code> starten.
        Beim nächsten Start genügt <code>npm run dev:local</code> für beide.
      </p>
    </main>
  </body>
</html>""")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)

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
    product_version: str

class ConfirmReq(BaseModel):
    blz: str; user: str; pin: str; endpoint: str; product_id: str
    product_version: str
    pending_state: str; tan: str = ""

class BalancesReq(BaseModel):
    blz: str; user: str; pin: str; endpoint: str; product_id: str
    product_version: str
    client_state: str; ibans: list[str]

class TxReq(BaseModel):
    blz: str; user: str; pin: str; endpoint: str; product_id: str
    product_version: str
    client_state: str; iban: str; since: str

def _creds(r) -> dict:
    return {"blz": r.blz, "user": r.user, "pin": r.pin,
            "endpoint": r.endpoint, "product_id": r.product_id,
            "product_version": r.product_version}

@app.post("/connect")
def connect(r: ConnectReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    return gw.connect(**_creds(r))

@app.post("/connect/confirm")
def confirm(r: ConfirmReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    try:
        return gw.confirm(_creds(r), r.pending_state, r.tan)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid pending state")

@app.post("/balances")
def balances(r: BalancesReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    return {"balances": gw.balances(_creds(r), r.client_state, r.ibans)}

@app.post("/transactions")
def transactions(r: TxReq, _: None = Depends(require_token), gw: Gateway = Depends(get_gateway)):
    return gw.transactions(_creds(r), r.client_state, r.iban, r.since)
