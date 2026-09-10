"""Construction et contrôle du planning : génération de créneaux pilotée par la marée/météo."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Activity, Offer, Session, SessionStatus, Site
from app.schemas import GenerateSessionsIn, GenerateSessionsOut
from app.services import conditions, tides, weather

PARIS = ZoneInfo("Europe/Paris")


def ensure_conditions_data(db: DbSession, site: Site, d_from: date, d_to: date) -> None:
    """Garantit la présence de marées et prévisions sur la plage demandée."""
    if not tides.get_events(db, site.id, d_from - timedelta(days=1), d_to + timedelta(days=1)):
        tides.sync_tides(db, site, d_from - timedelta(days=1), d_to + timedelta(days=1))
    if not weather.forecasts_range(db, site.id, d_from, d_to):
        weather.sync_weather(db, site, d_from, d_to)


def refresh_session_conditions(db: DbSession, session: Session) -> None:
    activity = db.get(Activity, session.activity_id)
    if activity and not activity.requires_conditions:
        session.conditions_ok = True
        session.conditions_note = "Activité indépendante des conditions"
        return
    chk = conditions.check(db, session.site_id, session.start_at, session.activity_id, session.level_min)
    session.conditions_ok = chk.ok
    session.conditions_note = "; ".join(chk.reasons)[:255]


def generate(db: DbSession, payload: GenerateSessionsIn) -> GenerateSessionsOut:
    site = db.get(Site, payload.site_id)
    activity = db.get(Activity, payload.activity_id)
    if not site or not activity:
        raise ValueError("Site ou activité introuvable")
    offer = db.get(Offer, payload.offer_id) if payload.offer_id else None
    duration = payload.duration_minutes or (offer.duration_minutes if offer and offer.duration_minutes else None) or activity.default_duration_minutes
    capacity = payload.capacity or activity.default_capacity
    price = payload.price_cents or (offer.price_cents if offer else 4500)

    ensure_conditions_data(db, site, payload.date_from, payload.date_to)

    existing = {
        s.start_at
        for s in db.scalars(
            select(Session).where(
                Session.site_id == site.id,
                Session.activity_id == activity.id,
                Session.start_at >= datetime.combine(payload.date_from, time.min, tzinfo=UTC) - timedelta(days=1),
                Session.start_at <= datetime.combine(payload.date_to, time.max, tzinfo=UTC) + timedelta(days=1),
            )
        )
    }

    created = skipped = 0
    details: list[dict] = []
    day = payload.date_from
    while day <= payload.date_to:
        if day.weekday() in payload.weekdays:
            for hhmm in payload.start_times:
                h, m = (int(x) for x in hhmm.split(":"))
                start_local = datetime.combine(day, time(h, m), tzinfo=PARIS)
                start = start_local.astimezone(UTC)
                if start in existing:
                    skipped += 1
                    details.append({"start_at": start.isoformat(), "created": False, "reason": "existe déjà"})
                    continue
                ok, note = True, "Activité indépendante des conditions"
                if activity.requires_conditions:
                    chk = conditions.check(db, site.id, start, activity.id, payload.level_min)
                    ok, note = chk.ok, "; ".join(chk.reasons)
                if payload.only_if_conditions_ok and not ok:
                    skipped += 1
                    details.append({"start_at": start.isoformat(), "created": False, "reason": note})
                    continue
                db.add(
                    Session(
                        site_id=site.id,
                        activity_id=activity.id,
                        instructor_id=payload.instructor_id,
                        offer_id=payload.offer_id,
                        start_at=start,
                        end_at=start + timedelta(minutes=duration),
                        capacity=capacity,
                        price_cents=price,
                        level_min=payload.level_min,
                        level_max=payload.level_max,
                        status=SessionStatus.scheduled,
                        title=offer.name if offer else None,
                        conditions_ok=ok,
                        conditions_note=note[:255],
                    )
                )
                existing.add(start)
                created += 1
                details.append({"start_at": start.isoformat(), "created": True, "reason": note})
        day += timedelta(days=1)
    db.commit()
    return GenerateSessionsOut(created=created, skipped=skipped, details=details)
