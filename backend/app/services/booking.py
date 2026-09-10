"""Logique de réservation : contrôle des places, application des bons cadeaux et cartes
multi-séances, encaissement et écriture de la vente (source du chiffre d'affaires)."""

from __future__ import annotations

import secrets
import string
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import (
    Activity,
    Booking,
    BookingStatus,
    Customer,
    GiftVoucher,
    GroupPreference,
    Offer,
    OfferKind,
    PassCard,
    PaymentMethod,
    Sale,
    SaleLine,
    Session,
    SessionStatus,
    Site,
    VoucherStatus,
)
from app.schemas import CustomerBase
from app.services import payments
from app.services.availability import booked_counts, level_fits

_ALPHABET = string.ascii_uppercase + string.digits


def gen_code(prefix: str, length: int = 8) -> str:
    return f"{prefix}-{''.join(secrets.choice(_ALPHABET) for _ in range(length))}"


def sale_reference() -> str:
    return f"V{datetime.now(UTC):%y%m%d}-{secrets.token_hex(2).upper()}"


def vat_part(total_cents: int, rate: float) -> int:
    return round(total_cents - total_cents / (1 + rate / 100))


def upsert_customer(db: DbSession, data: CustomerBase) -> Customer:
    """Retrouve un client par e-mail (insensible à la casse) ou le crée ; met à jour le questionnaire."""
    cust = db.scalars(select(Customer).where(Customer.email.ilike(data.email))).first()
    if cust:
        for k, v in data.model_dump(exclude_unset=True).items():
            if v is not None:
                setattr(cust, k, v)
    else:
        cust = Customer(**data.model_dump())
        db.add(cust)
    db.flush()
    return cust


def get_voucher(db: DbSession, code: str) -> GiftVoucher:
    v = db.scalars(select(GiftVoucher).where(GiftVoucher.code == code.strip().upper())).first()
    if not v:
        raise HTTPException(404, "Bon cadeau introuvable")
    if v.status != VoucherStatus.active or v.remaining_cents <= 0:
        raise HTTPException(400, "Bon cadeau déjà utilisé ou annulé")
    if v.expires_at < date.today():
        v.status = VoucherStatus.expired
        raise HTTPException(400, "Bon cadeau expiré")
    return v


def get_pass_card(db: DbSession, code: str) -> PassCard:
    p = db.scalars(select(PassCard).where(PassCard.code == code.strip().upper())).first()
    if not p:
        raise HTTPException(404, "Carte multi-séances introuvable")
    if p.remaining_sessions <= 0:
        raise HTTPException(400, "Plus aucune séance disponible sur cette carte")
    if p.expires_at and p.expires_at < date.today():
        raise HTTPException(400, "Carte expirée")
    return p


def create_bookings(
    db: DbSession,
    *,
    customer: Customer,
    session_ids: list[int],
    participants: int,
    payment_method: PaymentMethod,
    source: str,
    group_preference: GroupPreference = GroupPreference.none,
    voucher_code: str | None = None,
    pass_card_code: str | None = None,
    payment_token: str | None = None,
    offer_id: int | None = None,
    notes: str | None = None,
    check_level: bool = True,
) -> tuple[list[Booking], Sale | None, int, str]:
    """Crée une réservation par créneau. Retourne (réservations, vente, montant payé, statut)."""
    if participants < 1:
        raise HTTPException(400, "Nombre de participants invalide")

    sessions = list(db.scalars(select(Session).where(Session.id.in_(session_ids))))
    if len(sessions) != len(set(session_ids)):
        raise HTTPException(404, "Un des créneaux n'existe pas")
    counts = booked_counts(db, session_ids)
    now = datetime.now(UTC)
    for s in sessions:
        if s.status != SessionStatus.scheduled:
            raise HTTPException(400, f"Créneau {s.id} annulé ou terminé")
        if s.start_at < now:
            raise HTTPException(400, f"Créneau {s.id} déjà passé")
        if s.capacity - counts.get(s.id, 0) < participants:
            raise HTTPException(409, f"Plus assez de places sur le créneau du {s.start_at:%d/%m %H:%M}")
        if check_level and source == "online" and not level_fits(s, customer.level):
            raise HTTPException(400, f"Créneau du {s.start_at:%d/%m %H:%M} non adapté au niveau déclaré")

    # Tarification : offre (stage / formule) ou prix des créneaux
    offer: Offer | None = db.get(Offer, offer_id) if offer_id else None
    if offer and offer.kind == OfferKind.course and offer.sessions_count == len(sessions):
        total = offer.price_cents * participants
        unit_label = offer.name
    else:
        total = sum(s.price_cents for s in sessions) * participants
        unit_label = None

    # Carte multi-séances : décompte, puis rien à encaisser pour les séances couvertes
    pass_card: PassCard | None = None
    covered_by_pass = 0
    if pass_card_code:
        pass_card = get_pass_card(db, pass_card_code)
        needed = len(sessions) * participants
        if pass_card.customer_id != customer.id:
            raise HTTPException(403, "Cette carte appartient à un autre client")
        if any(s.activity_id != pass_card.activity_id for s in sessions):
            raise HTTPException(400, "Cette carte ne couvre pas cette activité")
        if pass_card.remaining_sessions < needed:
            raise HTTPException(400, f"Carte insuffisante : {pass_card.remaining_sessions} séance(s) restante(s)")
        pass_card.remaining_sessions -= needed
        covered_by_pass = needed
        total = 0

    # Bon cadeau : déduit la valeur
    voucher: GiftVoucher | None = None
    voucher_used = 0
    if voucher_code and total > 0:
        voucher = get_voucher(db, voucher_code)
        voucher_used = min(voucher.remaining_cents, total)
        voucher.remaining_cents -= voucher_used
        if voucher.remaining_cents == 0:
            voucher.status = VoucherStatus.used
        total_due = total - voucher_used
    else:
        total_due = total

    # Encaissement du reste
    payment_ref = None
    status = "paid"
    if total_due > 0:
        if payment_method == PaymentMethod.card_online:
            result = payments.charge(total_due, payment_token, f"Réservation {customer.email}")
            if not result.ok:
                db.rollback()
                raise HTTPException(402, f"Paiement refusé : {result.message}")
            payment_ref = result.reference
        # Autres moyens (CB TPE, espèces…) : encaissés à l'accueil, on enregistre directement

    # Vente (CA) — une ligne par créneau, imputée au site et à l'activité du créneau
    sale: Sale | None = None
    if total > 0 or voucher_used or covered_by_pass:
        effective_method = payment_method
        if covered_by_pass:
            effective_method = PaymentMethod.pass_card
        elif voucher_used and total_due == 0:
            effective_method = PaymentMethod.voucher
        sale = Sale(
            reference=sale_reference(),
            site_id=sessions[0].site_id,
            customer_id=customer.id,
            channel=source if source in ("online", "counter") else "counter",
            payment_method=effective_method,
            total_cents=total,
            total_vat_cents=0,
            status=status,
            payment_ref=payment_ref,
        )
        db.add(sale)
        db.flush()
        vat_total = 0
        for s in sessions:
            act = db.get(Activity, s.activity_id)
            site = db.get(Site, s.site_id)
            unit = 0 if covered_by_pass else (offer.price_cents // len(sessions) if unit_label else s.price_cents)
            line_total = unit * participants
            vat_rate = offer.vat_rate if offer else 20.0
            vat_total += vat_part(line_total, vat_rate)
            db.add(
                SaleLine(
                    sale_id=sale.id,
                    label=f"{unit_label or act.name} – {site.name} – {s.start_at:%d/%m %H:%M}",
                    kind="course" if unit_label else "session",
                    category="stage" if unit_label else "cours",
                    offer_id=offer.id if offer else s.offer_id,
                    activity_id=s.activity_id,
                    site_id=s.site_id,
                    quantity=participants,
                    unit_price_cents=unit,
                    vat_rate=vat_rate,
                    total_cents=line_total,
                )
            )
        sale.total_vat_cents = vat_total

    bookings: list[Booking] = []
    per_session_paid = (total // len(sessions)) if sessions else 0
    for s in sessions:
        b = Booking(
            reference=gen_code("RF", 6),
            customer_id=customer.id,
            session_id=s.id,
            participants=participants,
            status=BookingStatus.confirmed,
            price_cents=(0 if covered_by_pass else s.price_cents * participants),
            paid_cents=per_session_paid,
            payment_method=sale.payment_method if sale else payment_method,
            group_preference=group_preference,
            source=source,
            voucher_id=voucher.id if voucher else None,
            pass_card_id=pass_card.id if pass_card else None,
            sale_id=sale.id if sale else None,
            notes=notes,
        )
        db.add(b)
        bookings.append(b)
    db.commit()
    for b in bookings:
        db.refresh(b)
    return bookings, sale, total, status


def sell_voucher(
    db: DbSession,
    *,
    value_cents: int,
    offer_id: int | None,
    buyer_name: str,
    buyer_email: str,
    recipient_name: str | None,
    recipient_email: str | None,
    message: str | None,
    payment_method: PaymentMethod,
    validity_months: int,
    channel: str,
    site_id: int | None = None,
) -> GiftVoucher:
    if payment_method == PaymentMethod.card_online:
        result = payments.charge(value_cents, None, f"Bon cadeau {buyer_email}")
        if not result.ok:
            raise HTTPException(402, f"Paiement refusé : {result.message}")
    sale = Sale(
        reference=sale_reference(),
        site_id=site_id,
        channel=channel,
        payment_method=payment_method,
        total_cents=value_cents,
        total_vat_cents=0,  # bon multi-usage : TVA constatée à l'utilisation (régime FR)
        status="paid",
    )
    db.add(sale)
    db.flush()
    offer = db.get(Offer, offer_id) if offer_id else None
    db.add(
        SaleLine(
            sale_id=sale.id,
            label=f"Bon cadeau {offer.name if offer else ''}".strip(),
            kind="voucher",
            category="bon_cadeau",
            offer_id=offer_id,
            activity_id=offer.activity_id if offer else None,
            site_id=site_id,
            quantity=1,
            unit_price_cents=value_cents,
            vat_rate=0.0,
            total_cents=value_cents,
        )
    )
    voucher = GiftVoucher(
        code=gen_code("BC"),
        value_cents=value_cents,
        remaining_cents=value_cents,
        offer_id=offer_id,
        buyer_name=buyer_name,
        buyer_email=buyer_email,
        recipient_name=recipient_name,
        recipient_email=recipient_email,
        message=message,
        expires_at=date.today() + timedelta(days=30 * validity_months),
        sale_id=sale.id,
    )
    db.add(voucher)
    db.commit()
    db.refresh(voucher)
    return voucher


def sell_pass_card(
    db: DbSession, *, customer: Customer, offer: Offer, payment_method: PaymentMethod, channel: str
) -> PassCard:
    if offer.kind != OfferKind.pass_card:
        raise HTTPException(400, "Cette offre n'est pas une carte multi-séances")
    if payment_method == PaymentMethod.card_online:
        result = payments.charge(offer.price_cents, None, f"Carte {offer.name} {customer.email}")
        if not result.ok:
            raise HTTPException(402, f"Paiement refusé : {result.message}")
    sale = Sale(
        reference=sale_reference(),
        site_id=offer.site_id,
        customer_id=customer.id,
        channel=channel,
        payment_method=payment_method,
        total_cents=offer.price_cents,
        total_vat_cents=vat_part(offer.price_cents, offer.vat_rate),
        status="paid",
    )
    db.add(sale)
    db.flush()
    db.add(
        SaleLine(
            sale_id=sale.id,
            label=offer.name,
            kind="pass_card",
            category="carte",
            offer_id=offer.id,
            activity_id=offer.activity_id,
            site_id=offer.site_id,
            quantity=1,
            unit_price_cents=offer.price_cents,
            vat_rate=offer.vat_rate,
            total_cents=offer.price_cents,
        )
    )
    card = PassCard(
        code=gen_code("CM"),
        customer_id=customer.id,
        offer_id=offer.id,
        activity_id=offer.activity_id,
        total_sessions=offer.sessions_count,
        remaining_sessions=offer.sessions_count,
        price_cents=offer.price_cents,
        expires_at=(date.today() + timedelta(days=offer.validity_days)) if offer.validity_days else None,
        sale_id=sale.id,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card
