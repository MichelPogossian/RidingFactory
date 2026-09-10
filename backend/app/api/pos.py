"""Caisse : produits, ventes, bons cadeaux et cartes multi-séances côté équipe."""

from datetime import date, datetime, UTC

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, Db, ManagerUser
from app.models import Activity, Customer, GiftVoucher, Offer, PassCard, PaymentMethod, Product, Sale, SaleLine, VoucherStatus
from app.schemas import (
    PassCardOut,
    PassCardPurchaseIn,
    ProductBase,
    ProductOut,
    SaleIn,
    SaleOut,
    VoucherOut,
    VoucherPurchaseIn,
)
from app.services import booking as booking_service
from app.services.booking import get_voucher, sale_reference, vat_part

router = APIRouter(prefix="/api", tags=["caisse"])


# --- Produits -----------------------------------------------------------------
@router.get("/products", response_model=list[ProductOut])
def list_products(db: Db, _: CurrentUser, category: str | None = None, include_inactive: bool = False):
    stmt = select(Product).order_by(Product.category, Product.name)
    if category:
        stmt = stmt.where(Product.category == category)
    if not include_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    return list(db.scalars(stmt))


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(data: ProductBase, db: Db, _: ManagerUser):
    p = Product(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, data: ProductBase, db: Db, _: ManagerUser):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Produit introuvable")
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


# --- Ventes -------------------------------------------------------------------
@router.get("/sales", response_model=list[SaleOut])
def list_sales(db: Db, _: CurrentUser, date_from: date | None = None, date_to: date | None = None, site_id: int | None = None, limit: int = 200):
    stmt = select(Sale).options(selectinload(Sale.lines)).order_by(Sale.created_at.desc()).limit(limit)
    if date_from:
        stmt = stmt.where(Sale.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
    if date_to:
        stmt = stmt.where(Sale.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))
    if site_id:
        stmt = stmt.where(Sale.site_id == site_id)
    return list(db.scalars(stmt))


@router.post("/sales", response_model=SaleOut, status_code=201)
def create_sale(data: SaleIn, db: Db, _: CurrentUser):
    """Ticket de caisse : produits boutique et/ou offres (cartes, bons…), décrément du stock."""
    sale = Sale(
        reference=sale_reference(),
        site_id=data.site_id,
        customer_id=data.customer_id,
        channel="counter",
        payment_method=data.payment_method,
        status="paid",
    )
    db.add(sale)
    db.flush()
    total = vat_total = 0
    for ln in data.lines:
        if ln.product_id:
            p = db.get(Product, ln.product_id)
            if not p:
                raise HTTPException(404, f"Produit {ln.product_id} introuvable")
            unit = ln.unit_price_cents if ln.unit_price_cents is not None else p.price_cents
            rate = ln.vat_rate if ln.vat_rate is not None else p.vat_rate
            line = SaleLine(
                sale_id=sale.id, label=ln.label or p.name, kind="product", category=p.category, product_id=p.id,
                activity_id=p.activity_id, site_id=p.site_id or data.site_id, quantity=ln.quantity, unit_price_cents=unit,
                vat_rate=rate, total_cents=unit * ln.quantity, cost_cents=(p.cost_cents or 0) * ln.quantity,
            )
            if p.stock is not None:
                p.stock = max(0, p.stock - ln.quantity)
        elif ln.offer_id:
            o = db.get(Offer, ln.offer_id)
            if not o:
                raise HTTPException(404, f"Offre {ln.offer_id} introuvable")
            unit = ln.unit_price_cents if ln.unit_price_cents is not None else o.price_cents
            rate = ln.vat_rate if ln.vat_rate is not None else o.vat_rate
            line = SaleLine(
                sale_id=sale.id, label=ln.label or o.name, kind=o.kind.value, category={"single": "cours", "course": "stage", "pass_card": "carte", "rental": "location"}[o.kind.value],
                offer_id=o.id, activity_id=o.activity_id, site_id=o.site_id or data.site_id, quantity=ln.quantity,
                unit_price_cents=unit, vat_rate=rate, total_cents=unit * ln.quantity,
            )
        else:
            if ln.unit_price_cents is None or not ln.label:
                raise HTTPException(400, "Ligne libre : libellé et prix requis")
            rate = ln.vat_rate if ln.vat_rate is not None else 20.0
            line = SaleLine(
                sale_id=sale.id, label=ln.label, kind="product", category="boutique", site_id=data.site_id,
                quantity=ln.quantity, unit_price_cents=ln.unit_price_cents, vat_rate=rate, total_cents=ln.unit_price_cents * ln.quantity,
            )
        total += line.total_cents
        vat_total += vat_part(line.total_cents, line.vat_rate)
        db.add(line)

    if data.voucher_code:
        v = get_voucher(db, data.voucher_code)
        used = min(v.remaining_cents, total)
        v.remaining_cents -= used
        if v.remaining_cents == 0:
            v.status = VoucherStatus.used
        if used >= total:
            sale.payment_method = PaymentMethod.voucher
    sale.total_cents = total
    sale.total_vat_cents = vat_total
    db.commit()
    db.refresh(sale)
    return sale


@router.post("/sales/{sale_id}/refund", response_model=SaleOut)
def refund_sale(sale_id: int, db: Db, _: ManagerUser):
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Vente introuvable")
    sale.status = "refunded"
    for ln in sale.lines:
        if ln.product_id:
            p = db.get(Product, ln.product_id)
            if p and p.stock is not None:
                p.stock += ln.quantity
    db.commit()
    db.refresh(sale)
    return sale


# --- Bons cadeaux -------------------------------------------------------------
@router.get("/vouchers", response_model=list[VoucherOut])
def list_vouchers(db: Db, _: CurrentUser, status: VoucherStatus | None = None):
    stmt = select(GiftVoucher).order_by(GiftVoucher.issued_at.desc())
    if status:
        stmt = stmt.where(GiftVoucher.status == status)
    rows = list(db.scalars(stmt))
    today = date.today()
    for v in rows:  # expiration paresseuse
        if v.status == VoucherStatus.active and v.expires_at < today:
            v.status = VoucherStatus.expired
    db.commit()
    return rows


@router.post("/vouchers", response_model=VoucherOut, status_code=201)
def sell_voucher_counter(data: VoucherPurchaseIn, db: Db, _: CurrentUser, site_id: int | None = None):
    value = data.value_cents
    if data.offer_id:
        offer = db.get(Offer, data.offer_id)
        if not offer:
            raise HTTPException(404, "Offre introuvable")
        value = offer.price_cents
    if not value or value < 500:
        raise HTTPException(400, "Montant invalide")
    method = data.payment_method if data.payment_method != PaymentMethod.card_online else PaymentMethod.card_terminal
    return booking_service.sell_voucher(
        db, value_cents=value, offer_id=data.offer_id, buyer_name=data.buyer_name, buyer_email=data.buyer_email,
        recipient_name=data.recipient_name, recipient_email=data.recipient_email, message=data.message,
        payment_method=method, validity_months=data.validity_months, channel="counter", site_id=site_id,
    )


@router.post("/vouchers/{voucher_id}/cancel", response_model=VoucherOut)
def cancel_voucher(voucher_id: int, db: Db, _: ManagerUser):
    v = db.get(GiftVoucher, voucher_id)
    if not v:
        raise HTTPException(404, "Bon introuvable")
    v.status = VoucherStatus.cancelled
    db.commit()
    db.refresh(v)
    return v


# --- Cartes multi-séances -----------------------------------------------------
def _card_out(db, c: PassCard) -> PassCardOut:
    out = PassCardOut.model_validate(c)
    out.customer_name = f"{c.customer.first_name} {c.customer.last_name}"
    act = db.get(Activity, c.activity_id)
    out.activity_name = act.name if act else None
    return out


@router.get("/pass-cards", response_model=list[PassCardOut])
def list_pass_cards(db: Db, _: CurrentUser, customer_id: int | None = None, active_only: bool = False):
    stmt = select(PassCard).options(selectinload(PassCard.customer)).order_by(PassCard.purchased_at.desc())
    if customer_id:
        stmt = stmt.where(PassCard.customer_id == customer_id)
    if active_only:
        stmt = stmt.where(PassCard.remaining_sessions > 0)
    return [_card_out(db, c) for c in db.scalars(stmt)]


@router.post("/pass-cards", response_model=PassCardOut, status_code=201)
def sell_pass_card_counter(data: PassCardPurchaseIn, db: Db, _: CurrentUser):
    if data.customer_id:
        customer = db.get(Customer, data.customer_id)
        if not customer:
            raise HTTPException(404, "Client introuvable")
    elif data.customer:
        customer = booking_service.upsert_customer(db, data.customer)
    else:
        raise HTTPException(400, "Client requis")
    offer = db.get(Offer, data.offer_id)
    if not offer:
        raise HTTPException(404, "Offre introuvable")
    method = data.payment_method if data.payment_method != PaymentMethod.card_online else PaymentMethod.card_terminal
    card = booking_service.sell_pass_card(db, customer=customer, offer=offer, payment_method=method, channel="counter")
    return _card_out(db, card)
