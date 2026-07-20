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
