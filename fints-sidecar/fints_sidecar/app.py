import os
from fastapi import FastAPI, Header, HTTPException, Depends

app = FastAPI(title="Financiero FinTS Sidecar")

def require_token(x_internal_token: str | None = Header(default=None)) -> None:
    expected = os.environ.get("FINTS_SIDECAR_TOKEN")
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="unauthorized")

@app.get("/health")
def health(_: None = Depends(require_token)):
    return {"status": "ok"}
