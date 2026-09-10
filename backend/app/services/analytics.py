"""Analyse du chiffre d'affaires, du remplissage et de la rentabilité."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import Integer, case, cast, func, select
from sqlalchemy.orm import Session as DbSession

from app.models import (
    Activity,
    Booking,
    BookingStatus,
    Customer,
    Instructor,
    Product,
    Sale,
    SaleLine,
    Session,
    SessionStatus,
    Site,
)
from app.schemas import KPI, ProfitabilityRow, RevenueBreakdown

CATEGORY_LABELS = {
    "cours": "Cours",
    "stage": "Stages",
    "carte": "Cartes multi-séances",
    "bon_cadeau": "Bons cadeaux",
    "location": "Locations",
    "vetements": "Vêtements",
    "accessoires": "Accessoires",
    "creme_solaire": "Crème solaire",
    "boutique": "Boutique",
}


def _local_hour():
    """Heure de début exprimée en heure locale (Europe/Paris) pour les regroupements par créneau."""
    return cast(func.extract("hour", func.timezone("Europe/Paris", Session.start_at)), Integer)


def _dt(d: date, end: bool = False) -> datetime:
    return datetime.combine(d, datetime.max.time() if end else datetime.min.time(), tzinfo=UTC)


def season_bounds(today: date) -> tuple[date, date]:
    """Saison = 1er avril → 31 octobre (ajustable)."""
    year = today.year if today.month >= 4 else today.year - 1
    return date(year, 4, 1), date(year, 10, 31)


def revenue_between(db: DbSession, d_from: date, d_to: date, site_id: int | None = None) -> int:
    stmt = select(func.coalesce(func.sum(SaleLine.total_cents), 0)).join(Sale).where(
        Sale.created_at >= _dt(d_from), Sale.created_at <= _dt(d_to, True), Sale.status == "paid"
    )
    if site_id:
        stmt = stmt.where(SaleLine.site_id == site_id)
    return int(db.scalar(stmt) or 0)


def _grouped(db: DbSession, d_from: date, d_to: date, key_col, label_col, join_model=None, site_id=None):
    stmt = (
        select(key_col, label_col, func.sum(SaleLine.total_cents))
        .select_from(SaleLine)
        .join(Sale, Sale.id == SaleLine.sale_id)
        .where(Sale.created_at >= _dt(d_from), Sale.created_at <= _dt(d_to, True), Sale.status == "paid")
    )
    if join_model is not None:
        stmt = stmt.outerjoin(join_model, key_col == join_model.id)
    if site_id:
        stmt = stmt.where(SaleLine.site_id == site_id)
    stmt = stmt.group_by(key_col, label_col).order_by(func.sum(SaleLine.total_cents).desc())
    return [{"id": k, "label": lbl or "Non affecté", "total_cents": int(t)} for k, lbl, t in db.execute(stmt)]


def revenue_breakdown(
    db: DbSession, d_from: date, d_to: date, granularity: str = "day", site_id: int | None = None
) -> RevenueBreakdown:
    trunc = {"day": "day", "week": "week", "month": "month", "year": "year"}.get(granularity, "day")
    period = func.date_trunc(trunc, Sale.created_at)
    stmt = (
        select(period, func.sum(SaleLine.total_cents))
        .select_from(SaleLine)
        .join(Sale, Sale.id == SaleLine.sale_id)
        .where(Sale.created_at >= _dt(d_from), Sale.created_at <= _dt(d_to, True), Sale.status == "paid")
    )
    if site_id:
        stmt = stmt.where(SaleLine.site_id == site_id)
    stmt = stmt.group_by(period).order_by(period)
    series = [{"period": p.date().isoformat(), "total_cents": int(t)} for p, t in db.execute(stmt)]
    by_site = _grouped(db, d_from, d_to, SaleLine.site_id, Site.name, Site, site_id)
    by_activity = _grouped(db, d_from, d_to, SaleLine.activity_id, Activity.name, Activity, site_id)
    by_cat_raw = _grouped(db, d_from, d_to, SaleLine.category, SaleLine.category, None, site_id)
    by_category = [
        {"id": r["id"], "label": CATEGORY_LABELS.get(r["id"] or "", r["label"]), "total_cents": r["total_cents"]}
        for r in by_cat_raw
    ]
    return RevenueBreakdown(
        granularity=granularity,
        date_from=d_from,
        date_to=d_to,
        total_cents=sum(s["total_cents"] for s in series),
        series=series,
        by_site=by_site,
        by_activity=by_activity,
        by_category=by_category,
    )


def fill_rate(db: DbSession, d_from: date, d_to: date, site_id: int | None = None) -> float:
    booked = func.coalesce(
        func.sum(case((Booking.status.in_([BookingStatus.confirmed, BookingStatus.no_show]), Booking.participants), else_=0)),
        0,
    )
    stmt = (
        select(booked)
        .select_from(Session)
        .outerjoin(Booking, Booking.session_id == Session.id)
        .where(Session.start_at >= _dt(d_from), Session.start_at <= _dt(d_to, True), Session.status != SessionStatus.cancelled)
    )
    if site_id:
        stmt = stmt.where(Session.site_id == site_id)
    bk = db.scalar(stmt)
    cap_stmt = select(func.coalesce(func.sum(Session.capacity), 0)).where(
        Session.start_at >= _dt(d_from), Session.start_at <= _dt(d_to, True), Session.status != SessionStatus.cancelled
    )
    if site_id:
        cap_stmt = cap_stmt.where(Session.site_id == site_id)
    capacity = int(db.scalar(cap_stmt) or 0)
    return round(100 * int(bk or 0) / capacity, 1) if capacity else 0.0


def top_slots(db: DbSession, d_from: date, d_to: date, limit: int = 5, site_id: int | None = None) -> list[dict]:
    """Créneaux (site × heure de début) qui génèrent le plus de CA et le meilleur remplissage."""
    hour = _local_hour()
    booked = func.coalesce(func.sum(Booking.participants), 0)
    stmt = (
        select(Site.name, Activity.name, hour, func.count(func.distinct(Session.id)), booked, func.coalesce(func.sum(Booking.paid_cents), 0))
        .select_from(Session)
        .join(Site, Site.id == Session.site_id)
        .join(Activity, Activity.id == Session.activity_id)
        .outerjoin(Booking, (Booking.session_id == Session.id) & (Booking.status == BookingStatus.confirmed))
        .where(Session.start_at >= _dt(d_from), Session.start_at <= _dt(d_to, True))
    )
    if site_id:
        stmt = stmt.where(Session.site_id == site_id)
    stmt = stmt.group_by(Site.name, Activity.name, hour).order_by(func.coalesce(func.sum(Booking.paid_cents), 0).desc()).limit(limit)
    return [
        {"site": s, "activity": a, "hour": f"{h:02d}h", "sessions": n, "participants": int(p), "revenue_cents": int(r)}
        for s, a, h, n, p, r in db.execute(stmt)
    ]


def upcoming_low_fill(db: DbSession, days: int = 7, threshold: float = 0.4, site_id: int | None = None) -> list[dict]:
    now = datetime.now(UTC)
    stmt = (
        select(Session, func.coalesce(func.sum(Booking.participants), 0))
        .outerjoin(Booking, (Booking.session_id == Session.id) & (Booking.status == BookingStatus.confirmed))
        .where(Session.start_at >= now, Session.start_at <= now + timedelta(days=days), Session.status == SessionStatus.scheduled)
        .group_by(Session.id)
        .order_by(Session.start_at)
    )
    if site_id:
        stmt = stmt.where(Session.site_id == site_id)
    out = []
    for s, booked in db.execute(stmt):
        if s.capacity and booked / s.capacity <= threshold:
            out.append(
                {
                    "session_id": s.id,
                    "start_at": s.start_at.isoformat(),
                    "site": s.site.name,
                    "activity": s.activity.name,
                    "booked": int(booked),
                    "capacity": s.capacity,
                    "remaining": s.capacity - int(booked),
                }
            )
    return out[:12]


def kpis(db: DbSession, site_id: int | None = None) -> KPI:
    today = date.today()
    month_start = today.replace(day=1)
    s_from, s_to = season_bounds(today)
    year_start = date(today.year, 1, 1)
    month_sales = db.scalar(
        select(func.count(Sale.id)).where(Sale.created_at >= _dt(month_start), Sale.status == "paid")
        if not site_id
        else select(func.count(Sale.id)).where(Sale.created_at >= _dt(month_start), Sale.status == "paid", Sale.site_id == site_id)
    ) or 0
    rev_month = revenue_between(db, month_start, today, site_id)
    bookings_month = db.scalar(
        select(func.count(Booking.id))
        .join(Session)
        .where(Session.start_at >= _dt(month_start), Session.start_at <= _dt(today + timedelta(days=31), True), Booking.status == BookingStatus.confirmed)
        .where(Session.site_id == site_id if site_id else True)
    ) or 0
    top_products = [
        {"label": lbl, "quantity": int(q), "total_cents": int(t)}
        for lbl, q, t in db.execute(
            select(SaleLine.label, func.sum(SaleLine.quantity), func.sum(SaleLine.total_cents))
            .join(Sale)
            .where(Sale.created_at >= _dt(s_from), Sale.status == "paid", SaleLine.kind == "product")
            .group_by(SaleLine.label)
            .order_by(func.sum(SaleLine.total_cents).desc())
            .limit(6)
        )
    ]
    return KPI(
        revenue_today_cents=revenue_between(db, today, today, site_id),
        revenue_month_cents=rev_month,
        revenue_season_cents=revenue_between(db, s_from, s_to, site_id),
        revenue_year_cents=revenue_between(db, year_start, today, site_id),
        customers_count=int(db.scalar(select(func.count(Customer.id))) or 0),
        bookings_month=int(bookings_month),
        fill_rate_month=fill_rate(db, month_start, today, site_id),
        average_basket_cents=int(rev_month / month_sales) if month_sales else 0,
        revenue_by_site=_grouped(db, s_from, s_to, SaleLine.site_id, Site.name, Site),
        revenue_by_activity=_grouped(db, s_from, s_to, SaleLine.activity_id, Activity.name, Activity, site_id),
        top_products=top_products,
        top_slots=top_slots(db, s_from, s_to, 5, site_id),
        upcoming_low_fill=upcoming_low_fill(db, 7, 0.4, site_id),
    )


def profitability(db: DbSession, d_from: date, d_to: date, dimension: str = "activity") -> list[ProfitabilityRow]:
    """Rentabilité par activité / site / créneau horaire : CA – coût moniteurs – coût produits."""
    hour = _local_hour()
    if dimension == "site":
        key, label = Session.site_id, Site.name
    elif dimension == "slot":
        key, label = hour, hour
    else:
        key, label = Session.activity_id, Activity.name

    duration_h = func.extract("epoch", Session.end_at - Session.start_at) / 3600.0
    instructor_cost = func.coalesce(Instructor.hourly_cost_cents, 2500) * duration_h
    sess_stmt = (
        select(
            key,
            label,
            func.count(Session.id),
            func.coalesce(func.sum(Session.capacity), 0),
            func.coalesce(func.sum(instructor_cost), 0),
        )
        .select_from(Session)
        .join(Site, Site.id == Session.site_id)
        .join(Activity, Activity.id == Session.activity_id)
        .outerjoin(Instructor, Instructor.id == Session.instructor_id)
        .where(Session.start_at >= _dt(d_from), Session.start_at <= _dt(d_to, True), Session.status != SessionStatus.cancelled)
        .group_by(key, label)
    )
    sessions_by_key = {k: (lbl, n, cap, cost) for k, lbl, n, cap, cost in db.execute(sess_stmt)}

    book_stmt = (
        select(key, func.coalesce(func.sum(Booking.participants), 0), func.coalesce(func.sum(Booking.paid_cents), 0))
        .select_from(Booking)
        .join(Session, Session.id == Booking.session_id)
        .where(Session.start_at >= _dt(d_from), Session.start_at <= _dt(d_to, True), Booking.status == BookingStatus.confirmed)
        .group_by(key)
    )
    bookings_by_key = {k: (int(p), int(r)) for k, p, r in db.execute(book_stmt)}

    # Coût produits (marge boutique) – uniquement pertinent par site/activité
    product_cost_by_key: dict = {}
    if dimension in ("site", "activity"):
        col = SaleLine.site_id if dimension == "site" else SaleLine.activity_id
        for k, c, r in db.execute(
            select(col, func.coalesce(func.sum(Product.cost_cents * SaleLine.quantity), 0), func.coalesce(func.sum(SaleLine.total_cents), 0))
            .select_from(SaleLine)
            .join(Sale, Sale.id == SaleLine.sale_id)
            .join(Product, Product.id == SaleLine.product_id)
            .where(Sale.created_at >= _dt(d_from), Sale.created_at <= _dt(d_to, True), Sale.status == "paid")
            .group_by(col)
        ):
            product_cost_by_key[k] = (int(c), int(r))

    rows: list[ProfitabilityRow] = []
    for k, (lbl, n, cap, cost) in sessions_by_key.items():
        participants, revenue = bookings_by_key.get(k, (0, 0))
        pcost, prev = product_cost_by_key.get(k, (0, 0))
        revenue_total = revenue + prev
        margin = revenue_total - int(cost) - pcost
        rows.append(
            ProfitabilityRow(
                key=str(k),
                label=(f"{int(lbl):02d}h" if dimension == "slot" else str(lbl)),
                revenue_cents=revenue_total,
                sessions=int(n),
                customers=participants,
                capacity=int(cap),
                fill_rate=round(100 * participants / cap, 1) if cap else 0.0,
                avg_price_cents=int(revenue / participants) if participants else 0,
                instructor_cost_cents=int(cost),
                product_cost_cents=pcost,
                margin_cents=margin,
                margin_rate=round(100 * margin / revenue_total, 1) if revenue_total else 0.0,
            )
        )
    rows.sort(key=lambda r: r.margin_cents, reverse=True)
    return rows
