"""Abstraction du prestataire de paiement en ligne.

En production : Stripe (PaymentIntent). Sans clé configurée, un fournisseur simulé
accepte tout paiement, ce qui permet de tester le parcours de bout en bout.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from app.core.config import get_settings


@dataclass
class PaymentResult:
    ok: bool
    provider: str
    reference: str
    message: str


def charge(amount_cents: int, token: str | None, description: str) -> PaymentResult:
    settings = get_settings()
    if amount_cents <= 0:
        return PaymentResult(True, "none", "no-charge", "Aucun montant à encaisser")
    if settings.stripe_secret_key:
        try:
            import httpx

            resp = httpx.post(
                "https://api.stripe.com/v1/payment_intents",
                auth=(settings.stripe_secret_key, ""),
                data={
                    "amount": amount_cents,
                    "currency": "eur",
                    "description": description,
                    "payment_method": token or "",
                    "confirm": "true",
                    "automatic_payment_methods[enabled]": "true",
                    "automatic_payment_methods[allow_redirects]": "never",
                },
                timeout=20,
            )
            data = resp.json()
            if resp.status_code < 300 and data.get("status") in {"succeeded", "processing", "requires_capture"}:
                return PaymentResult(True, "stripe", data["id"], "Paiement Stripe accepté")
            return PaymentResult(False, "stripe", data.get("id", ""), data.get("error", {}).get("message", "Refusé"))
        except Exception as exc:  # noqa: BLE001
            return PaymentResult(False, "stripe", "", f"Erreur Stripe : {exc}")
    return PaymentResult(True, "simulated", f"sim_{secrets.token_hex(6)}", "Paiement simulé accepté (mode démo)")
