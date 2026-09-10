"""Parcours client public : disponibilités, recommandation, réservation, bons cadeaux, cartes."""

from datetime import date

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.api.deps import Db
from app.models import Activity, Customer, Level, Offer, PassCard, Site
from app.schemas import (
    AvailabilityQuery,
    PassCardOut,
    PassCardPurchaseIn,
    PublicBookingIn,
    PublicBookingOut,
    RecommendationOut,
    VoucherOut,
    VoucherPurchaseIn,
)
from app.services import availability, booking
from app.services.booking import get_pass_card, get_voucher

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/availability", response_model=RecommendationOut)
def get_availability(
    db: Db,
    activity: str = Query(..., description="slug de l'activité"),
    level: Level = Level.beginner,
    participants: int = 1,
    site_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    age: int | None = None,
):
    """Créneaux réellement réservables (places restantes ≥ participants, niveau compatible,
    conditions non bloquantes) + recommandation de site."""
    return availability.search(
        db,
        AvailabilityQuery(
            activity_slug=activity, level=level, participants=participants, site_id=site_id,
            date_from=date_from, date_to=date_to, age=age,
        ),
    )


@router.post("/bookings", response_model=PublicBookingOut, status_code=201)
def create_public_booking(data: PublicBookingIn, db: Db):
    customer = booking.upsert_customer(db, data.customer)
    bookings, sale, total, status = booking.create_bookings(
        db,
        customer=customer,
        session_ids=data.session_ids,
        participants=data.participants,
        payment_method=data.payment_method,
        source="online",
        group_preference=data.group_preference,
        voucher_code=data.voucher_code,
        pass_card_code=data.pass_card_code,
        payment_token=data.payment_token,
        offer_id=data.offer_id,
    )
    paid = sale.total_cents if sale else 0
    return PublicBookingOut(
        references=[b.reference for b in bookings],
        customer_id=customer.id,
        sale_reference=sale.reference if sale else None,
        total_cents=total,
        paid_cents=paid,
        payment_status=status,
        message=f"Réservation confirmée pour {len(bookings)} séance(s). Un e-mail de confirmation est envoyé à {customer.email}.",
    )


@router.get("/vouchers/{code}", response_model=VoucherOut)
def check_voucher(code: str, db: Db):
    return get_voucher(db, code)


@router.post("/vouchers", response_model=VoucherOut, status_code=201)
def buy_voucher(data: VoucherPurchaseIn, db: Db):
    value = data.value_cents
    if data.offer_id:
        offer = db.get(Offer, data.offer_id)
        if not offer:
            raise HTTPException(404, "Offre introuvable")
        value = offer.price_cents
    if not value or value < 500:
        raise HTTPException(400, "Montant du bon cadeau invalide (minimum 5 €)")
    return booking.sell_voucher(
        db,
        value_cents=value,
        offer_id=data.offer_id,
        buyer_name=data.buyer_name,
        buyer_email=data.buyer_email,
        recipient_name=data.recipient_name,
        recipient_email=data.recipient_email,
        message=data.message,
        payment_method=data.payment_method,
        validity_months=data.validity_months,
        channel="online",
    )


@router.get("/pass-cards/{code}", response_model=PassCardOut)
def check_pass_card(code: str, db: Db):
    card = get_pass_card(db, code)
    out = PassCardOut.model_validate(card)
    out.customer_name = f"{card.customer.first_name} {card.customer.last_name}"
    act = db.get(Activity, card.activity_id)
    out.activity_name = act.name if act else None
    return out


@router.post("/pass-cards", response_model=PassCardOut, status_code=201)
def buy_pass_card(data: PassCardPurchaseIn, db: Db):
    if data.customer_id:
        customer = db.get(Customer, data.customer_id)
        if not customer:
            raise HTTPException(404, "Client introuvable")
    elif data.customer:
        customer = booking.upsert_customer(db, data.customer)
    else:
        raise HTTPException(400, "Client requis")
    offer = db.get(Offer, data.offer_id)
    if not offer:
        raise HTTPException(404, "Offre introuvable")
    card = booking.sell_pass_card(db, customer=customer, offer=offer, payment_method=data.payment_method, channel="online")
    out = PassCardOut.model_validate(card)
    out.customer_name = f"{customer.first_name} {customer.last_name}"
    out.activity_name = offer.activity.name
    return out


@router.get("/seo/pages")
def seo_pages(db: Db):
    """Métadonnées SEO + données structurées (schema.org) pour les pages activités / sites."""
    sites = list(db.scalars(select(Site).where(Site.is_active.is_(True))))
    activities = list(db.scalars(select(Activity).where(Activity.is_active.is_(True))))
    pages = []
    for s in sites:
        pages.append(
            {
                "path": f"/ecole/{s.slug}",
                "title": s.seo_title or f"École de surf {s.name} – {s.city} | Riding Factory",
                "description": s.seo_description or s.description,
                "keywords": s.seo_keywords or [f"école de surf {s.city}", f"cours de surf {s.city}", s.name],
                "jsonld": {
                    "@context": "https://schema.org",
                    "@type": "SportsActivityLocation",
                    "name": f"Riding Factory – {s.name}",
                    "address": {"@type": "PostalAddress", "streetAddress": s.address, "addressLocality": s.city, "addressCountry": "FR"},
                    "geo": {"@type": "GeoCoordinates", "latitude": s.latitude, "longitude": s.longitude},
                },
            }
        )
    for a in activities:
        pages.append(
            {
                "path": f"/activite/{a.slug}",
                "title": a.seo_title or f"{a.name} en Vendée – cours, stages et location | Riding Factory",
                "description": a.seo_description or a.description,
                "keywords": a.seo_keywords or [f"cours de {a.name.lower()} Saint-Hilaire-de-Riez", f"{a.name.lower()} Vendée"],
                "jsonld": {"@context": "https://schema.org", "@type": "Service", "name": a.name, "provider": {"@type": "Organization", "name": "Riding Factory"}},
            }
        )
    return pages


@router.get("/pass-cards/by-customer/{email}", response_model=list[PassCardOut])
def pass_cards_by_email(email: str, db: Db):
    cust = db.scalars(select(Customer).where(Customer.email.ilike(email))).first()
    if not cust:
        return []
    cards = list(db.scalars(select(PassCard).where(PassCard.customer_id == cust.id)))
    out = []
    for c in cards:
        o = PassCardOut.model_validate(c)
        o.customer_name = f"{cust.first_name} {cust.last_name}"
        act = db.get(Activity, c.activity_id)
        o.activity_name = act.name if act else None
        out.append(o)
    return out
