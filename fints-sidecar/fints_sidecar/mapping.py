from decimal import Decimal, ROUND_HALF_UP

def to_cents(amount: Decimal) -> int:
    return int((Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def _iso(d) -> str | None:
    return d.isoformat() if d is not None else None

def map_transaction(data: dict) -> dict:
    amt = data["amount"]
    value_date = data.get("entry_date") or data.get("guessed_entry_date")
    return {
        "entry_ref": data.get("bank_reference") or data.get("id"),
        "booking_date": _iso(data.get("date")),
        "value_date": _iso(value_date),
        "amount_cents": to_cents(amt.amount),
        "currency": getattr(amt, "currency", "EUR") or "EUR",
        "counterparty_name": data.get("applicant_name"),
        "counterparty_iban": data.get("applicant_iban"),
        "purpose": data.get("purpose"),
        "raw": {k: str(v) for k, v in data.items()},
    }
