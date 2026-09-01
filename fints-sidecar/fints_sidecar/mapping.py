from datetime import date
from decimal import Decimal, ROUND_HALF_UP


# MT940 liefert bei manchen DKB-Buchungen die Gegenkonto-IBAN direkt vor dem
# Namen im Feld ``applicant_name``. Die Längen sind je Land fest definiert.
IBAN_LENGTHS = {
    "AT": 20, "BE": 16, "CH": 21, "CZ": 24, "DE": 22, "DK": 18,
    "ES": 24, "FI": 18, "FR": 27, "GB": 22, "GR": 27, "IE": 22,
    "IT": 27, "LI": 21, "LU": 20, "NL": 18, "NO": 15, "PL": 28,
    "PT": 25, "SE": 24,
}

def to_cents(amount: Decimal) -> int:
    return int((Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def _iso(d) -> str | None:
    return d.isoformat() if d is not None else None


def split_applicant(name: str | None, iban: str | None) -> tuple[str | None, str | None]:
    """Trennt eine vorangestellte IBAN vom eigentlichen Gegenpartei-Namen."""
    if not name:
        return name, iban
    compact = name.strip()
    country = compact[:2].upper()
    expected_length = IBAN_LENGTHS.get(country)
    if iban or not expected_length or len(compact) <= expected_length:
        return compact, iban
    candidate = compact[:expected_length]
    if not (candidate[:2].isalpha() and candidate[2:4].isdigit() and candidate[4:].isalnum()):
        return compact, iban
    merchant = compact[expected_length:].strip()
    return merchant or None, candidate

def map_transaction(data: dict, *, pending=False, fallback_date=None) -> dict:
    amt = data["amount"]
    value_date = data.get("entry_date") or data.get("guessed_entry_date")
    booking_date = data.get("date") or value_date
    counterparty_name, counterparty_iban = split_applicant(
        data.get("applicant_name"), data.get("applicant_iban")
    )
    if booking_date is None and pending:
        booking_date = fallback_date or date.today()
    if booking_date is None:
        raise ValueError("Gebuchter FinTS-Umsatz hat kein Buchungsdatum")
    return {
        "entry_ref": data.get("bank_reference") or data.get("id"),
        "booking_date": _iso(booking_date),
        "value_date": _iso(value_date),
        "amount_cents": to_cents(amt.amount),
        "currency": getattr(amt, "currency", "EUR") or "EUR",
        "counterparty_name": counterparty_name,
        "counterparty_iban": counterparty_iban,
        "purpose": data.get("purpose"),
        "pending": pending,
        "raw": {k: str(v) for k, v in data.items()},
    }
