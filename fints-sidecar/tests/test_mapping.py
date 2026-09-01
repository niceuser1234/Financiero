from decimal import Decimal
from datetime import date
from fints_sidecar.mapping import map_transaction, split_applicant, to_cents

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


def test_splits_iban_prefixed_dkb_applicant_name():
    name, iban = split_applicant("DE63120300000001999333DKB", None)
    assert name == "DKB"
    assert iban == "DE63120300000001999333"


def test_splits_iban_prefixed_paypal_applicant_name():
    name, iban = split_applicant(
        "LU89751000135104200EPayPal Europe S.a.r.l. et Cie S.C.A", None
    )
    assert name == "PayPal Europe S.a.r.l. et Cie S.C.A"
    assert iban == "LU89751000135104200E"


def test_keeps_separate_applicant_fields_unchanged():
    name, iban = split_applicant("Netflix", "DE111")
    assert name == "Netflix"
    assert iban == "DE111"

def test_pending_transaction_uses_fallback_date_and_is_marked():
    fallback = date(2026, 8, 17)
    data = {
        "amount": FakeAmount(Decimal("-652.00")),
        "applicant_name": "Airline",
        "purpose": "Flugbuchung",
    }

    row = map_transaction(data, pending=True, fallback_date=fallback)

    assert row["booking_date"] == "2026-08-17"
    assert row["amount_cents"] == -65200
    assert row["pending"] is True
