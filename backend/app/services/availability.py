"""Disponibilités & recommandation : ne montre au client que les créneaux réellement
réservables, adaptés à son niveau, et les classe par pertinence (niveau × site × conditions)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.models import LEVEL_RANK, Activity, Booking, BookingStatus, Level, Session, SessionStatus, Site
from app.schemas import AvailabilityQuery, AvailableSlot, RecommendationOut, SiteRecommendation
from app.services.conditions import snapshot


def booked_counts(db: DbSession, session_ids: list[int]) -> dict[int, int]:
    if not session_ids:
        return {}
    rows = db.execute(
        select(Booking.session_id, func.coalesce(func.sum(Booking.participants), 0))
        .where(
            Booking.session_id.in_(session_ids),
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.pending]),
        )
        .group_by(Booking.session_id)
    ).all()
    return {sid: int(n) for sid, n in rows}


def level_fits(session: Session, level: Level) -> bool:
    r = LEVEL_RANK[level]
    return LEVEL_RANK[session.level_min] <= r <= LEVEL_RANK[session.level_max]


def site_score(site: Site, level: Level, wave_height: float | None, wind: float | None) -> tuple[float, list[str]]:
    """Score d'adéquation site ↔ client (0–100) avec explications."""
    reasons: list[str] = []
    rank = LEVEL_RANK[level]  # 0 (débutant) → 4 (expert)
    # Adéquation niveau / exposition du spot : débutant ↔ spot abrité, confirmé ↔ spot exposé
    ideal_exposure = 2 + rank * 2  # 2, 4, 6, 8, 10
    gap = abs(site.exposure_score - ideal_exposure)
    score = 100 - gap * 9
    if site.exposure_score <= 4 and rank <= 1:
        reasons.append("Spot abrité, idéal pour débuter")
    elif site.exposure_score >= 6 and rank >= 3:
        reasons.append("Spot exposé, vagues plus consistantes")
    elif gap >= 4:
        reasons.append("Spot moins adapté à votre niveau")

    if wave_height is not None:
        # Hauteur idéale : 0,5 m débutant → 1,8 m expert
        ideal_wave = 0.5 + rank * 0.33
        wave_gap = abs(wave_height - ideal_wave)
        score -= wave_gap * 18
        if wave_height <= 0.8 and rank <= 1:
            reasons.append(f"Vagues douces ({wave_height:.1f} m)")
        elif wave_height >= 1.2 and rank >= 3:
            reasons.append(f"Belle houle ({wave_height:.1f} m)")
        elif wave_height > 1.5 and rank <= 1:
            reasons.append(f"Vagues trop grosses pour débuter ({wave_height:.1f} m)")
    if wind is not None:
        if wind > 35:
            score -= 15
            reasons.append(f"Vent fort ({wind:.0f} km/h)")
        elif wind < 15:
            score += 5
            reasons.append("Vent faible")
    return max(0.0, min(100.0, round(score, 1))), reasons


def search(db: DbSession, q: AvailabilityQuery) -> RecommendationOut:
    activity = db.scalars(select(Activity).where(Activity.slug == q.activity_slug, Activity.is_active.is_(True))).first()
    if not activity:
        return RecommendationOut(sites=[], slots=[])

    now = datetime.now(UTC)
    d_from = q.date_from or now.date()
    d_to = q.date_to or (d_from + timedelta(days=14))
    start = max(now, datetime.combine(d_from, datetime.min.time(), tzinfo=UTC))
    end = datetime.combine(d_to, datetime.max.time(), tzinfo=UTC)

    stmt = (
        select(Session)
        .where(
            Session.activity_id == activity.id,
            Session.status == SessionStatus.scheduled,
            Session.start_at >= start,
            Session.start_at <= end,
        )
        .order_by(Session.start_at)
    )
    if q.site_id:
        stmt = stmt.where(Session.site_id == q.site_id)
    sessions = [s for s in db.scalars(stmt) if level_fits(s, q.level) and s.conditions_ok is not False]
    counts = booked_counts(db, [s.id for s in sessions])

    sites = {s.id: s for s in db.scalars(select(Site).where(Site.is_active.is_(True)))}
    # Score des sites à partir des conditions moyennes des créneaux proposés
    site_scores: dict[int, tuple[float, list[str]]] = {}
    slots: list[AvailableSlot] = []
    for s in sessions:
        remaining = s.capacity - counts.get(s.id, 0)
        if remaining < q.participants:
            continue  # créneau complet → invisible pour le client
        snap = snapshot(db, s.site_id, s.start_at)
        site = sites.get(s.site_id)
        if not site:
            continue
        sc, reasons = site_score(site, q.level, snap.wave_height_m, snap.wind_speed_kmh)
        # Bonus créneau : conditions validées, places disponibles, proximité temporelle
        slot_score = sc
        if s.conditions_ok:
            slot_score += 5
        if remaining >= 4:
            slot_score += 3
        slot_score = min(100.0, round(slot_score, 1))
        prev = site_scores.get(s.site_id)
        if not prev or sc > prev[0]:
            site_scores[s.site_id] = (sc, reasons)
        slots.append(
            AvailableSlot(
                session_id=s.id,
                start_at=s.start_at,
                end_at=s.end_at,
                site_id=s.site_id,
                site_name=site.name,
                activity_name=activity.name,
                remaining=remaining,
                price_cents=s.price_cents,
                level_min=s.level_min,
                level_max=s.level_max,
                conditions_ok=s.conditions_ok,
                conditions_note=s.conditions_note,
                score=slot_score,
                recommended=False,
            )
        )

    if not site_scores:
        # Aucun créneau : on note quand même les sites pour orienter le client
        for site in sites.values():
            site_scores[site.id] = site_score(site, q.level, None, None)

    ranked = sorted(site_scores.items(), key=lambda kv: kv[1][0], reverse=True)
    best_site = ranked[0][0] if ranked else None
    site_out = [
        SiteRecommendation(
            site_id=sid, site_name=sites[sid].name, score=sc, reasons=reasons, recommended=(sid == best_site)
        )
        for sid, (sc, reasons) in ranked
        if sid in sites
    ]
    best_score = max((sl.score for sl in slots), default=0)
    for sl in slots:
        sl.recommended = sl.site_id == best_site and sl.score >= best_score - 8
    return RecommendationOut(sites=site_out, slots=slots)
