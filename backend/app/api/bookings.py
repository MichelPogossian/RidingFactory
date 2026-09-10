"""Réservations & clients (back-office)."""

from datetime import date, datetime, timedelta, UTC

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, Db
from app.models import Booking, BookingStatus, Customer, Sale, Session
from app.schemas import BookingOut, BookingUpdate, CounterBookingIn, CustomerBase, CustomerOut, PublicBookingOut
from app.services import booking as booking_service
from app.services.assistant import suggest_board, suggest_wetsuit

router = APIRouter(prefix="/api", tags=["réservations & clients"])


def _booking_out(b: Booking) -> BookingOut:
    out = BookingOut.model_validate(b)
    out.customer_name = f"{b.customer.first_name} {b.customer.last_name}"
    out.customer_level = b.customer.level
    out.session_start = b.session.start_at
    out.site_name = b.session.site.name
    out.activity_name = b.session.activity.name
    return out


@router.get("/bookings", response_model=list[BookingOut])
def list_bookings(
    db: Db,
    _: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    session_id: int | None = None,
    customer_id: int | None = None,
    site_id: int | None = None,
    status: BookingStatus | None = None,
    limit: int = 200,
):
    stmt = (
        select(Booking)
        .join(Session, Session.id == Booking.session_id)
        .options(
            selectinload(Booking.customer),
            selectinload(Booking.session).selectinload(Session.site),
            selectinload(Booking.session).selectinload(Session.activity),
        )
        .order_by(Session.start_at.desc())
        .limit(limit)
    )
    if date_from:
        stmt = stmt.where(Session.start_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
    if date_to:
        stmt = stmt.where(Session.start_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))
    if session_id:
        stmt = stmt.where(Booking.session_id == session_id)
    if customer_id:
        stmt = stmt.where(Booking.customer_id == customer_id)
    if site_id:
        stmt = stmt.where(Session.site_id == site_id)
    if status:
        stmt = stmt.where(Booking.status == status)
    return [_booking_out(b) for b in db.scalars(stmt)]


@router.post("/bookings", response_model=PublicBookingOut, status_code=201)
def counter_booking(data: CounterBookingIn, db: Db, _: CurrentUser):
    """Réservation prise à l'accueil (dernière minute, téléphone…)."""
    if data.customer_id:
        customer = db.get(Customer, data.customer_id)
        if not customer:
            raise HTTPException(404, "Client introuvable")
    elif data.customer:
        customer = booking_service.upsert_customer(db, data.customer)
    else:
        raise HTTPException(400, "Client requis")
    bookings, sale, total, status = booking_service.create_bookings(
        db,
        customer=customer,
        session_ids=[data.session_id],
        participants=data.participants,
        payment_method=data.payment_method,
        source="counter",
        group_preference=data.group_preference,
        voucher_code=data.voucher_code,
        pass_card_code=data.pass_card_code,
        notes=data.notes,
        check_level=False,
    )
    return PublicBookingOut(
        references=[b.reference for b in bookings],
        customer_id=customer.id,
        sale_reference=sale.reference if sale else None,
        total_cents=total,
        paid_cents=sale.total_cents if sale else 0,
        payment_status=status,
        message="Réservation enregistrée",
    )


@router.patch("/bookings/{booking_id}", response_model=BookingOut)
def update_booking(booking_id: int, data: BookingUpdate, db: Db, _: CurrentUser):
    b = db.scalars(
        select(Booking)
        .options(selectinload(Booking.customer), selectinload(Booking.session).selectinload(Session.site), selectinload(Booking.session).selectinload(Session.activity))
        .where(Booking.id == booking_id)
    ).first()
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    payload = data.model_dump(exclude_unset=True)
    if payload.get("status") == BookingStatus.cancelled and b.status != BookingStatus.cancelled:
        # Re-crédit automatique d'une carte multi-séances
        if b.pass_card_id:
            from app.models import PassCard

            card = db.get(PassCard, b.pass_card_id)
            if card:
                card.remaining_sessions += b.participants
    for k, v in payload.items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return _booking_out(b)


# --- Clients ------------------------------------------------------------------
def _customer_out(db, c: Customer) -> CustomerOut:
    out = CustomerOut.model_validate(c)
    if c.birth_date:
        out.age = (date.today() - c.birth_date).days // 365
    out.suggested_wetsuit = c.wetsuit_size or suggest_wetsuit(c.height_cm, c.weight_kg)
    out.suggested_board = suggest_board(c.level, c.weight_kg, c.height_cm)
    out.bookings_count = int(db.scalar(select(func.count(Booking.id)).where(Booking.customer_id == c.id, Booking.status == BookingStatus.confirmed)) or 0)
    out.total_spent_cents = int(db.scalar(select(func.coalesce(func.sum(Sale.total_cents), 0)).where(Sale.customer_id == c.id, Sale.status == "paid")) or 0)
    return out


@router.get("/customers", response_model=list[CustomerOut])
def list_customers(db: Db, _: CurrentUser, q: str | None = None, limit: int = 100):
    stmt = select(Customer).order_by(Customer.created_at.desc()).limit(limit)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.first_name.ilike(like), Customer.last_name.ilike(like), Customer.email.ilike(like), Customer.phone.ilike(like)))
    return [_customer_out(db, c) for c in db.scalars(stmt)]


@router.get("/customers/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Db, _: CurrentUser):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Client introuvable")
    return _customer_out(db, c)


@router.post("/customers", response_model=CustomerOut, status_code=201)
def create_customer(data: CustomerBase, db: Db, _: CurrentUser):
    c = booking_service.upsert_customer(db, data)
    db.commit()
    return _customer_out(db, c)


@router.put("/customers/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, data: CustomerBase, db: Db, _: CurrentUser):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Client introuvable")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return _customer_out(db, c)


@router.get("/sessions/{session_id}/roster")
def session_roster(session_id: int, db: Db, _: CurrentUser):
    """Feuille de séance : participants, niveau, gabarit, combinaison / planche suggérées, groupe."""
    s = db.scalars(select(Session).options(selectinload(Session.bookings).selectinload(Booking.customer)).where(Session.id == session_id)).first()
    if not s:
        raise HTTPException(404, "Créneau introuvable")
    rows = []
    for b in s.bookings:
        if b.status == BookingStatus.cancelled:
            continue
        c = b.customer
        rows.append(
            {
                "booking_id": b.id,
                "reference": b.reference,
                "customer_id": c.id,
                "name": f"{c.first_name} {c.last_name}",
                "phone": c.phone,
                "participants": b.participants,
                "level": c.level.value,
                "age": (date.today() - c.birth_date).days // 365 if c.birth_date else None,
                "height_cm": c.height_cm,
                "weight_kg": c.weight_kg,
                "wetsuit": c.wetsuit_size or suggest_wetsuit(c.height_cm, c.weight_kg),
                "board": suggest_board(c.level, c.weight_kg, c.height_cm),
                "usual_board": c.board_type,
                "group_preference": b.group_preference.value,
                "group_label": b.group_label,
                "status": b.status.value,
                "paid_cents": b.paid_cents,
                "notes": b.notes,
            }
        )
    return {"session_id": s.id, "start_at": s.start_at, "capacity": s.capacity, "participants": rows}
