from typing import Protocol
import base64
import json
from datetime import date
from fints.client import FinTS3PinTanClient, NeedTANResponse, NeedRetryResponse
from fints.exceptions import (
    FinTSClientPINError,
    FinTSClientTemporaryAuthError,
    FinTSConnectionError,
    FinTSDialogInitError,
)
from fints.segments.statement import HKKAZ5, HKKAZ6, HKKAZ7
from fints.utils import mt940_to_array
from .mapping import map_transaction, to_cents

MAX_PENDING_STATE_BYTES = 2_000_000


class GatewayError(RuntimeError):
    """Sicherer, strukturierter Fehler für erwartbare Bank-/FinTS-Probleme."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class Gateway(Protocol):
    def connect(self, blz, user, pin, endpoint, product_id, product_version) -> dict: ...
    def confirm(self, creds, pending_state, tan) -> dict: ...
    def balances(self, creds, client_state, ibans) -> list[dict]: ...
    def transactions(self, creds, client_state, iban, since) -> dict: ...


class _TrackedFinTS3PinTanClient(FinTS3PinTanClient):
    """Merkt sich ausschließlich Bank-Rückgabecodes, niemals Bankdaten."""

    def __init__(self, *args, **kwargs):
        self.bank_response_codes: list[str] = []
        super().__init__(*args, **kwargs)

    def _process_response(self, dialog, segment, response):
        code = getattr(response, "code", None)
        if isinstance(code, str) and code not in self.bank_response_codes:
            self.bank_response_codes.append(code)
        return super()._process_response(dialog, segment, response)

    @staticmethod
    def _split_mt940_responses(responses):
        booked = "".join(
            segment.statement_booked.decode("iso-8859-1")
            for segment in responses
        )
        pending = "".join(
            segment.statement_pending.decode("iso-8859-1")
            for segment in responses
            if segment.statement_pending
        )
        return (
            list(mt940_to_array(booked)) if booked else [],
            list(mt940_to_array(pending)) if pending else [],
        )

    def get_transactions_split(self, account, start_date):
        """Ruft gebuchte und vorgemerkte MT940-Umsätze in einem Bankabruf ab."""
        with self._get_dialog() as dialog:
            hkkaz = self._find_highest_supported_command(HKKAZ5, HKKAZ6, HKKAZ7)
            return self._fetch_with_touchdowns(
                dialog,
                lambda touchdown: hkkaz(
                    account=hkkaz._fields["account"].type.from_sepa_account(account),
                    all_accounts=False,
                    date_start=start_date,
                    date_end=None,
                    touchdown_point=touchdown,
                ),
                self._split_mt940_responses,
                "HIKAZ",
            )


def _client(blz, user, pin, endpoint, product_id, product_version, from_data=None):
    return _TrackedFinTS3PinTanClient(
        blz, user, pin, endpoint,
        product_id=product_id,
        product_version=product_version,
        from_data=base64.b64decode(from_data) if from_data else None,
    )

def _b64encode(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")

def _b64decode(value: str) -> bytes:
    return base64.b64decode(value, validate=True)

def _pack_pending(resp: NeedTANResponse, client, dialog_state: bytes) -> str:
    """Bündelt die drei python-fints-Zustände in einen versionierten, opaken Wert.

    Der Dialogzustand enthält Pickle-Daten und darf ausschließlich aus diesem
    serverseitig erzeugten, verschlüsselt gespeicherten Wert stammen.
    """
    payload = {
        "v": 1,
        "client_state": _b64encode(client.deconstruct(including_private=True)),
        "retry_state": _b64encode(resp.get_data()),
        "dialog_state": _b64encode(dialog_state),
        # python-fints 5.0 serialisiert dieses Flag nicht im Retry-State.
        "decoupled": bool(getattr(resp, "decoupled", False)),
    }
    return _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))

def _unpack_pending(pending_state: str) -> dict:
    if not pending_state or len(pending_state) > MAX_PENDING_STATE_BYTES:
        raise ValueError("Ungültiger FinTS-Zustand")
    try:
        raw = _b64decode(pending_state)
        if len(raw) > MAX_PENDING_STATE_BYTES:
            raise ValueError
        payload = json.loads(raw)
        if (
            not isinstance(payload, dict)
            or payload.get("v") != 1
            or set(payload) != {
                "v", "client_state", "retry_state", "dialog_state", "decoupled"
            }
            or not isinstance(payload["decoupled"], bool)
        ):
            raise ValueError
        return {
            "client_state": _b64decode(payload["client_state"]),
            "retry_state": _b64decode(payload["retry_state"]),
            "dialog_state": _b64decode(payload["dialog_state"]),
            "decoupled": payload["decoupled"],
        }
    except (TypeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("Ungültiger FinTS-Zustand") from exc

def _map_accounts(accounts) -> list[dict]:
    return [
        {
            "iban": a.iban,
            "name": getattr(a, "accountnumber", a.iban),
            "currency": "EUR",
            "type": "checking",
        }
        for a in accounts
    ]


def _request_accounts(client) -> tuple[NeedTANResponse | None, list[dict]]:
    """Konten abrufen und eine dabei entstehende SCA-Challenge weiterreichen."""
    result = client.get_sepa_accounts()
    if isinstance(result, NeedTANResponse):
        return result, []
    return None, _map_accounts(result)


def _exception_chain(exc: BaseException):
    current = exc
    seen = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def _raise_gateway_error(exc: BaseException, client) -> None:
    """Übersetzt erwartbare Fehler, ohne PIN, Benutzerkennung oder Bankdaten offenzulegen."""
    chain = tuple(_exception_chain(exc))
    codes = set(getattr(client, "bank_response_codes", []))

    if "9078" in codes:
        raise GatewayError(
            503,
            "product_registration_pending",
            "Die DKB kennt die FinTS-Produkt-ID noch nicht (Bankcode 9078). "
            "Die Registrierung ist vermutlich noch nicht freigeschaltet.",
        ) from exc
    if any(isinstance(item, FinTSClientTemporaryAuthError) for item in chain):
        raise GatewayError(
            423,
            "bank_access_locked",
            "Der DKB-Zugang ist vorübergehend gesperrt. Bitte den Zugang zuerst direkt bei der DKB entsperren.",
        ) from exc
    if any(isinstance(item, FinTSClientPINError) for item in chain):
        raise GatewayError(
            422,
            "invalid_credentials",
            "Die DKB hat Anmeldenamen oder Banking-PIN abgelehnt.",
        ) from exc
    if "9010" in codes:
        raise GatewayError(
            502,
            "bank_endpoint_rejected",
            "Die DKB hat den FinTS-Dialog am angegebenen Endpoint abgelehnt (Bankcode 9010).",
        ) from exc
    if any(isinstance(item, FinTSConnectionError) for item in chain):
        raise GatewayError(
            502,
            "bank_unreachable",
            "Der DKB-FinTS-Server ist derzeit nicht erreichbar oder hat keine gültige FinTS-Antwort geliefert.",
        ) from exc
    if any(isinstance(item, FinTSDialogInitError) for item in chain):
        suffix = f" (Bankcode {sorted(codes)[-1]})" if codes else ""
        raise GatewayError(
            502,
            "dialog_rejected",
            f"Die DKB hat den FinTS-Dialog abgelehnt{suffix}.",
        ) from exc

    raise exc

def _poll_settings(resp: NeedTANResponse, client) -> dict:
    if not bool(getattr(resp, "decoupled", False)):
        return {}
    try:
        mechanism = client.get_tan_mechanisms().get(
            client.get_current_tan_mechanism()
        )
    except (AttributeError, KeyError, TypeError):
        mechanism = None
    if mechanism is None:
        return {}

    def positive_int(name):
        value = getattr(mechanism, name, None)
        try:
            return max(1, int(value)) if value is not None else None
        except (TypeError, ValueError):
            return None

    settings = {
        "poll_after_seconds": positive_int("wait_before_first_poll"),
        "poll_interval_seconds": positive_int("wait_before_next_poll"),
        "max_poll_attempts": positive_int("decoupled_max_poll_number"),
    }
    automated = getattr(mechanism, "automated_polling_allowed", None)
    if automated is not None:
        settings["automated_polling_allowed"] = bool(automated)
    return {key: value for key, value in settings.items() if value is not None}

def _need_tan(resp: NeedTANResponse, client, dialog_state: bytes) -> dict:
    poll_settings = _poll_settings(resp, client)
    pending_state = _pack_pending(resp, client, dialog_state)
    result = {
        "status": "need_tan",
        "decoupled": bool(getattr(resp, "decoupled", False)),
        "challenge": getattr(resp, "challenge", "") or "",
        "pending_state": pending_state,
    }
    result.update(poll_settings)
    return result

class RealGateway:
    def connect(self, blz, user, pin, endpoint, product_id, product_version) -> dict:
        client = _client(blz, user, pin, endpoint, product_id, product_version)
        pending = None
        dialog_state = None
        accounts = []
        try:
            with client:
                if isinstance(client.init_tan_response, NeedTANResponse):
                    pending = client.init_tan_response
                    dialog_state = client.pause_dialog()
                else:
                    pending, accounts = _request_accounts(client)
                    if pending is not None:
                        dialog_state = client.pause_dialog()
        except Exception as exc:
            _raise_gateway_error(exc, client)

        if pending is not None and dialog_state is not None:
            return _need_tan(pending, client, dialog_state)
        state = _b64encode(client.deconstruct(including_private=True))
        return {"status": "connected", "client_state": state, "accounts": accounts}

    def confirm(self, creds, pending_state, tan) -> dict:
        state = _unpack_pending(pending_state)
        resp = NeedRetryResponse.from_data(state["retry_state"])
        if not isinstance(resp, NeedTANResponse):
            raise ValueError("Ungültiger FinTS-TAN-Zustand")
        # python-fints 5.0 verliert das Flag bei get_data()/from_data().
        resp.decoupled = state["decoupled"]

        client = _client(**creds, from_data=_b64encode(state["client_state"]))
        pending = None
        dialog_state = None
        accounts = []
        try:
            with client.resume_dialog(state["dialog_state"]):
                result = client.send_tan(resp, tan or "")
                if isinstance(result, NeedTANResponse):
                    pending = result
                    dialog_state = client.pause_dialog()
                elif resp.resume_method == "_get_sepa_accounts":
                    # Das Ergebnis der bestätigten Kontenabfrage ist bereits
                    # die Kontenliste; kein zweiter Bankabruf und keine zweite
                    # unnötige TAN-Anforderung.
                    accounts = _map_accounts(result)
                else:
                    # Nach einer SCA bei der Dialoginitialisierung beginnt erst
                    # jetzt der fachliche Kontenabruf. Auch dieser darf seinerseits
                    # eine weitere DKB-App-Freigabe verlangen.
                    pending, accounts = _request_accounts(client)
                    if pending is not None:
                        dialog_state = client.pause_dialog()
        except Exception as exc:
            _raise_gateway_error(exc, client)

        if pending is not None and dialog_state is not None:
            return _need_tan(pending, client, dialog_state)
        client_state = _b64encode(client.deconstruct(including_private=True))
        return {"status": "connected", "client_state": client_state, "accounts": accounts}

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
            result = client.get_transactions_split(acc, start_date=date.fromisoformat(since))
            if isinstance(result, NeedTANResponse):
                return {"status": "need_tan"}
            booked, pending = result
            return {
                "status": "ok",
                "transactions": [
                    *[map_transaction(t.data) for t in booked],
                    *[
                        map_transaction(t.data, pending=True, fallback_date=date.today())
                        for t in pending
                    ],
                ],
            }
