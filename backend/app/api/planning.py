"""Planning back-office : créneaux, génération pilotée par les conditions, vue semaine."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, Db, ManagerUser
from app.models import Booking, BookingStatus, Session, SessionStatus, Site
from app.schemas import (
    GenerateSessionsIn,
    GenerateSessionsOut,
    GroupProposalOut,
    PlanningCell,
    SessionBase,
    SessionOut,
    SessionUpdate,
)
from app.services import assistant, planning
from app.services.availability import booked_counts

router = APIRouter(prefix="/api/planning", tags=["planning"])
PARIS = ZoneInfo("Europe/Paris")


def _to_out(s: Session, booked: int) -> SessionOut:
    out = SessionOut.model_validate(s)
    out.booked = booked
    out.remaining = max(0, s.capacity - booked)
    out.site_name = s.site.name
    out.activity_name = s.activity.name
    out.activity_color = s.activity.color
    out.instructor_name = s.instructor.full_name if s.instructor else None
    return out


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    db: Db,
    _: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    site_id: int | None = None,
    activity_id: int | None = None,
    include_cancelled: bool = False,
):
    d_from = date_from or date.today()
    d_to = date_to or d_from + timedelta(days=7)
    stmt = (
        select(Session)
        .options(selectinload(Session.site), selectinload(Session.activity), selectinload(Session.instructor))
        .where(
            Session.start_at >= datetime.combine(d_from, datetime.min.time(), tzinfo=PARIS),
            Session.start_at <= datetime.combine(d_to, datetime.max.time(), tzinfo=PARIS),
        )
        .order_by(Session.start_at)
    )
    if site_id:
        stmt = stmt.where(Session.site_id == site_id)
    if activity_id:
        stmt = stmt.where(Session.activity_id == activity_id)
    if not include_cancelled:
        stmt = stmt.where(Session.status != SessionStatus.cancelled)
    sessions = list(db.scalars(stmt))
    counts = booked_counts(db, [s.id for s in sessions])
    return [_to_out(s, counts.get(s.id, 0)) for s in sessions]


@router.get("/week", response_model=list[PlanningCell])
def week_view(db: Db, _: CurrentUser, start: date | None = None, site_id: int | None = None, activity_id: int | None = None):
    """Vue semaine : jour × horaire × site × activité × places disponibles."""
    monday = (start or date.today()) - timedelta(days=(start or date.today()).weekday())
    rows = list_sessions(db, _, monday, monday + timedelta(days=6), site_id, activity_id)
    cells = []
    for r in rows:
        local = r.start_at.astimezone(PARIS)
        cells.append(
            PlanningCell(
                session_id=r.id, day=local.date(), time=local.strftime("%H:%M"), site=r.site_name or "", site_id=r.site_id,
                activity=r.activity_name or "", activity_id=r.activity_id, color=r.activity_color or "#0ea5e9",
                capacity=r.capacity, booked=r.booked, remaining=r.remaining, level_min=r.level_min, level_max=r.level_max,
                status=r.status, conditions_ok=r.conditions_ok, instructor=r.instructor_name,
            )
        )
    return cells


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: Db, _: CurrentUser):
    s = db.scalars(
        select(Session)
        .options(selectinload(Session.site), selectinload(Session.activity), selectinload(Session.instructor))
        .where(Session.id == session_id)
    ).first()
    if not s:
        raise HTTPException(404, "Créneau introuvable")
    return _to_out(s, booked_counts(db, [s.id]).get(s.id, 0))


@router.post("/sessions", response_model=SessionOut, status_code=201)
def create_session(data: SessionBase, db: Db, _: ManagerUser):
    s = Session(**data.model_dump())
    site = db.get(Site, s.site_id)
    if not site:
        raise HTTPException(404, "Site introuvable")
    planning.ensure_conditions_data(db, site, s.start_at.date(), s.start_at.date())
    db.add(s)
    db.flush()
    planning.refresh_session_conditions(db, s)
    db.commit()
    db.refresh(s)
    return _to_out(s, 0)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def update_session(session_id: int, data: SessionUpdate, db: Db, _: ManagerUser):
    s = db.get(Session, session_id)
    if not s:
        raise HTTPException(404, "Créneau introuvable")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    planning.refresh_session_conditions(db, s)
    db.commit()
    db.refresh(s)
    return _to_out(s, booked_counts(db, [s.id]).get(s.id, 0))


@router.delete("/sessions/{session_id}", status_code=204)
def cancel_session(session_id: int, db: Db, _: ManagerUser):
    s = db.get(Session, session_id)
    if not s:
        raise HTTPException(404, "Créneau introuvable")
    s.status = SessionStatus.cancelled
    for b in s.bookings:
        if b.status == BookingStatus.confirmed:
            b.status = BookingStatus.cancelled
    db.commit()


@router.post("/generate", response_model=GenerateSessionsOut)
def generate_sessions(data: GenerateSessionsIn, db: Db, _: ManagerUser):
    """Génère les créneaux d'une plage de dates en ne conservant que ceux dont la marée/météo
    respectent les règles du site (option `only_if_conditions_ok`)."""
    try:
        return planning.generate(db, data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/sessions/{session_id}/refresh-conditions", response_model=SessionOut)
def refresh_conditions(session_id: int, db: Db, _: CurrentUser):
    s = db.get(Session, session_id)
    if not s:
        raise HTTPException(404, "Créneau introuvable")
    planning.ensure_conditions_data(db, s.site, s.start_at.date(), s.start_at.date())
    planning.refresh_session_conditions(db, s)
    db.commit()
    db.refresh(s)
    return _to_out(s, booked_counts(db, [s.id]).get(s.id, 0))


@router.get("/sessions/{session_id}/groups", response_model=GroupProposalOut)
def propose_groups(session_id: int, db: Db, _: CurrentUser, group_size: int = 4):
    s = db.scalars(
        select(Session).options(selectinload(Session.bookings).selectinload(Booking.customer)).where(Session.id == session_id)
    ).first()
    if not s:
        raise HTTPException(404, "Créneau introuvable")
    return assistant.propose_groups(db, s, group_size)


@router.post("/sessions/{session_id}/groups/apply")
def apply_groups(session_id: int, groups: list[dict], db: Db, _: CurrentUser):
    """Enregistre l'affectation des groupes proposée (ou modifiée) par l'équipe."""
    for g in groups:
        for m in g.get("members", []):
            b = db.get(Booking, m["booking_id"])
            if b and b.session_id == session_id:
                b.group_label = g["label"]
    db.commit()
    return {"ok": True}
