from typing import Protocol
import base64
from datetime import date
from fints.client import FinTS3PinTanClient, NeedTANResponse, NeedRetryResponse
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

def _client_from_pending(resp) -> FinTS3PinTanClient:
    # python-fints rekonstruiert den Client aus dem im Pending-State gebündelten Blob.
    return resp.client  # NeedTANResponse trägt eine Referenz auf den erzeugenden Client

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
