import base64
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fints.client import NeedRetryResponse, NeedTANResponse
from fints.segments.accounts import HKSPA1
from fints.segments.auth import HITAN7

from fints_sidecar import gateway


def challenge(
    text="Approve",
    decoupled=True,
    command=None,
    resume_method="_continue_dialog_initialization",
):
    return NeedTANResponse(
        command,
        HITAN7(tan_process="2", task_reference="abc", challenge=text),
        resume_method,
        False,
        decoupled,
    )


class FakeClient:
    def __init__(
        self,
        *,
        init_response=None,
        send_result=None,
        accounts_result=None,
        mechanism=None,
        transactions_result=None,
    ):
        self.init_tan_response = init_response
        self.send_result = send_result
        self.accounts_result = accounts_result
        self.mechanism = mechanism
        self.transactions_result = transactions_result
        self.events = []
        self.active = False
        self.resume_blob = None
        self.received_decoupled = None

    def __enter__(self):
        self.active = True
        self.events.append("enter")
        return self

    def __exit__(self, *_):
        self.events.append("exit")
        self.active = False

    @contextmanager
    def resume_dialog(self, dialog_state):
        self.resume_blob = dialog_state
        self.active = True
        self.events.append("resume")
        try:
            yield self
        finally:
            self.events.append("resume-exit")
            self.active = False

    def pause_dialog(self):
        assert self.active
        self.events.append("pause")
        return b"dialog-next"

    def deconstruct(self, including_private=False):
        assert including_private is True
        assert not self.active
        self.events.append("deconstruct")
        return b"client-next"

    def send_tan(self, restored, tan):
        assert self.active
        self.received_decoupled = restored.decoupled
        self.events.append("send-tan")
        return self.send_result

    def get_sepa_accounts(self):
        assert self.active
        self.events.append("accounts")
        if self.accounts_result is not None:
            return self.accounts_result
        return [SimpleNamespace(iban="DE1", accountnumber="Giro")]

    def get_current_tan_mechanism(self):
        return "900"

    def get_tan_mechanisms(self):
        return {"900": self.mechanism} if self.mechanism else {}

    def get_transactions_split(self, account, start_date):
        assert self.active
        self.events.append("transactions")
        return self.transactions_result or ([], [])


CREDS = {
    "blz": "12030000",
    "user": "u",
    "pin": "p",
    "endpoint": "https://fints.dkb.de/fints",
    "product_id": "PRODUCT",
    "product_version": "0.1.0",
}


def pending_for(restored_challenge):
    payload = {
        "v": 1,
        "client_state": gateway._b64encode(b"client-old"),
        "retry_state": gateway._b64encode(restored_challenge.get_data()),
        "dialog_state": gateway._b64encode(b"dialog-old"),
        "decoupled": True,
    }
    import json

    return gateway._b64encode(json.dumps(payload, separators=(",", ":")).encode())


def account_challenge(text="Approve account"):
    return challenge(
        text,
        command=HKSPA1(),
        resume_method="_get_sepa_accounts",
    )


def test_connect_pauses_and_bundles_all_required_state(monkeypatch):
    fake = FakeClient(init_response=challenge())
    monkeypatch.setattr(gateway, "_client", lambda *args, **kwargs: fake)

    result = gateway.RealGateway().connect(**CREDS)
    unpacked = gateway._unpack_pending(result["pending_state"])
    restored = NeedRetryResponse.from_data(unpacked["retry_state"])

    assert result["status"] == "need_tan"
    assert result["decoupled"] is True
    assert unpacked["client_state"] == b"client-next"
    assert unpacked["dialog_state"] == b"dialog-next"
    assert isinstance(restored, NeedTANResponse)
    assert unpacked["decoupled"] is True
    assert fake.events == ["enter", "pause", "exit", "deconstruct"]


def test_connect_handles_tan_requested_by_account_lookup(monkeypatch):
    fake = FakeClient(accounts_result=account_challenge())
    monkeypatch.setattr(gateway, "_client", lambda *args, **kwargs: fake)

    result = gateway.RealGateway().connect(**CREDS)
    unpacked = gateway._unpack_pending(result["pending_state"])
    restored = NeedRetryResponse.from_data(unpacked["retry_state"])

    assert result["status"] == "need_tan"
    assert result["challenge"] == "Approve account"
    assert isinstance(restored, NeedTANResponse)
    assert restored.resume_method == "_get_sepa_accounts"
    assert fake.events == ["enter", "accounts", "pause", "exit", "deconstruct"]


def test_connect_returns_bank_polling_limits(monkeypatch):
    mechanism = SimpleNamespace(
        wait_before_first_poll=7,
        wait_before_next_poll=11,
        decoupled_max_poll_number=9,
        automated_polling_allowed=True,
    )
    fake = FakeClient(init_response=challenge(), mechanism=mechanism)
    monkeypatch.setattr(gateway, "_client", lambda *args, **kwargs: fake)

    result = gateway.RealGateway().connect(**CREDS)

    assert result["poll_after_seconds"] == 7
    assert result["poll_interval_seconds"] == 11
    assert result["max_poll_attempts"] == 9
    assert result["automated_polling_allowed"] is True


def test_confirm_restores_decoupled_flag_and_completes(monkeypatch):
    fake = FakeClient(send_result=object())
    received = {}

    def make_client(*args, **kwargs):
        received["from_data"] = base64.b64decode(kwargs["from_data"])
        return fake

    monkeypatch.setattr(gateway, "_client", make_client)
    result = gateway.RealGateway().confirm(CREDS, pending_for(challenge()), "")

    assert result["status"] == "connected"
    assert result["accounts"][0]["iban"] == "DE1"
    assert received["from_data"] == b"client-old"
    assert fake.resume_blob == b"dialog-old"
    assert fake.received_decoupled is True
    assert fake.events == ["resume", "send-tan", "accounts", "resume-exit", "deconstruct"]


def test_confirm_uses_accounts_returned_by_tan_without_second_lookup(monkeypatch):
    returned_accounts = [SimpleNamespace(iban="DE2", accountnumber="Tagesgeld")]
    fake = FakeClient(send_result=returned_accounts)
    monkeypatch.setattr(gateway, "_client", lambda *args, **kwargs: fake)

    result = gateway.RealGateway().confirm(
        CREDS,
        pending_for(account_challenge()),
        "",
    )

    assert result["status"] == "connected"
    assert result["accounts"][0]["iban"] == "DE2"
    assert fake.events == ["resume", "send-tan", "resume-exit", "deconstruct"]


def test_confirm_can_return_second_challenge_for_account_lookup(monkeypatch):
    fake = FakeClient(
        send_result=object(),
        accounts_result=account_challenge("Approve accounts next"),
    )
    monkeypatch.setattr(gateway, "_client", lambda *args, **kwargs: fake)

    result = gateway.RealGateway().confirm(
        CREDS,
        pending_for(challenge()),
        "",
    )
    unpacked = gateway._unpack_pending(result["pending_state"])
    restored = NeedRetryResponse.from_data(unpacked["retry_state"])

    assert result["status"] == "need_tan"
    assert result["challenge"] == "Approve accounts next"
    assert restored.resume_method == "_get_sepa_accounts"
    assert fake.events == [
        "resume", "send-tan", "accounts", "pause", "resume-exit", "deconstruct",
    ]


def test_confirm_repauses_when_decoupled_approval_is_pending(monkeypatch):
    fake = FakeClient(send_result=challenge("Still waiting"))
    monkeypatch.setattr(gateway, "_client", lambda *args, **kwargs: fake)

    result = gateway.RealGateway().confirm(CREDS, pending_for(challenge()), "")
    unpacked = gateway._unpack_pending(result["pending_state"])

    assert result["status"] == "need_tan"
    assert result["challenge"] == "Still waiting"
    assert unpacked["client_state"] == b"client-next"
    assert unpacked["dialog_state"] == b"dialog-next"
    assert unpacked["decoupled"] is True
    assert fake.received_decoupled is True
    assert fake.events == ["resume", "send-tan", "pause", "resume-exit", "deconstruct"]


def test_confirm_rejects_malformed_state_before_restoring_dialog(monkeypatch):
    monkeypatch.setattr(
        gateway,
        "_client",
        lambda *args, **kwargs: pytest.fail("client must not be constructed"),
    )
    with pytest.raises(ValueError, match="Ungültiger FinTS-Zustand"):
        gateway.RealGateway().confirm(CREDS, "not-base64!", "")


def test_product_registration_rejection_gets_actionable_error():
    client = SimpleNamespace(bank_response_codes=["9050", "9078"])

    with pytest.raises(gateway.GatewayError) as raised:
        gateway._raise_gateway_error(ValueError("Could not find system_id"), client)

    assert raised.value.status_code == 503
    assert raised.value.code == "product_registration_pending"
    assert "9078" in raised.value.message


def test_transactions_marks_booked_and_pending_separately(monkeypatch):
    from datetime import date
    from decimal import Decimal

    amount = lambda value: SimpleNamespace(amount=Decimal(value), currency="EUR")
    booked = SimpleNamespace(data={
        "amount": amount("-12.00"),
        "date": date(2026, 8, 16),
        "applicant_name": "Booked Shop",
    })
    pending = SimpleNamespace(data={
        "amount": amount("-652.00"),
        "date": date(2026, 8, 17),
        "applicant_name": "Airline",
    })
    fake = FakeClient(
        accounts_result=[SimpleNamespace(iban="DE1", accountnumber="Giro")],
        transactions_result=([booked], [pending]),
    )
    monkeypatch.setattr(gateway, "_client", lambda *args, **kwargs: fake)

    result = gateway.RealGateway().transactions(CREDS, "", "DE1", "2026-08-01")

    assert result["status"] == "ok"
    assert [row["pending"] for row in result["transactions"]] == [False, True]
    assert result["transactions"][1]["amount_cents"] == -65200
