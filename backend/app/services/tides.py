"""Récupération et modélisation des marées.

Deux fournisseurs :
- `worldtides` (API externe, clé requise) ;
- `synthetic` : modèle harmonique semi-diurne (période 12h25) calé sur la côte vendéenne,
  utilisé en démonstration et en secours hors-ligne.

Le système stocke uniquement les pleines/basses mers, puis interpole la hauteur
à un instant donné avec la « règle des douzièmes » (approximation sinusoïdale).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import get_settings
from app.models import Site, TideEvent

SEMI_DIURNAL_PERIOD_H = 12.42  # heures entre deux pleines mers
SPRING_NEAP_PERIOD_D = 14.77  # cycle vives-eaux / mortes-eaux


@dataclass
class TideState:
    height_m: float | None
    range_m: float | None
    phase: str | None  # rising | falling
    hours_to_low: float | None
    hours_to_high: float | None
    coefficient: int | None
    prev_event: TideEvent | None = None
    next_event: TideEvent | None = None


def _synthetic_events(site: Site, day_from: date, day_to: date) -> list[dict]:
    """Génère PM/BM synthétiques réalistes (marnage 2 m à 5,5 m selon le cycle lunaire)."""
    events: list[dict] = []
    # Phase de référence : une pleine mer arbitraire, décalée légèrement selon le site
    ref = datetime(2026, 1, 1, 4, 30, tzinfo=UTC) + timedelta(minutes=int(site.longitude * -20) % 40)
    start = datetime.combine(day_from, datetime.min.time(), tzinfo=UTC) - timedelta(hours=13)
    end = datetime.combine(day_to, datetime.max.time(), tzinfo=UTC) + timedelta(hours=13)

    n = math.floor((start - ref).total_seconds() / 3600 / (SEMI_DIURNAL_PERIOD_H / 2))
    t = ref + timedelta(hours=n * SEMI_DIURNAL_PERIOD_H / 2)
    while t <= end:
        # Modulation vives-eaux / mortes-eaux
        lunar = (t - ref).total_seconds() / 86400 / SPRING_NEAP_PERIOD_D * 2 * math.pi
        half_range = 1.0 + 0.9 * (0.5 + 0.5 * math.cos(lunar))  # 1.0 → 1.9 m
        mean_level = 3.2
        is_high = (n % 2) == 0
        height = mean_level + half_range if is_high else mean_level - half_range
        coefficient = int(45 + 75 * (0.5 + 0.5 * math.cos(lunar)))  # 45 → 120
        events.append(
            {
                "at": t,
                "kind": "high" if is_high else "low",
                "height_m": round(height, 2),
                "coefficient": coefficient,
                "source": "synthetic",
            }
        )
        n += 1
        t = ref + timedelta(hours=n * SEMI_DIURNAL_PERIOD_H / 2)
    return events


def _worldtides_events(site: Site, day_from: date, day_to: date, api_key: str) -> list[dict]:
    days = (day_to - day_from).days + 2
    start_ts = int(datetime.combine(day_from, datetime.min.time(), tzinfo=UTC).timestamp())
    resp = httpx.get(
        "https://www.worldtides.info/api/v3",
        params={
            "extremes": "",
            "lat": site.latitude,
            "lon": site.longitude,
            "start": start_ts,
            "length": days * 86400,
            "key": api_key,
            "datum": "CD",
        },
        timeout=15,
    )
    resp.raise_for_status()
    payload = resp.json()
    out = []
    for ex in payload.get("extremes", []):
        out.append(
            {
                "at": datetime.fromtimestamp(ex["dt"], tz=UTC),
                "kind": "high" if ex["type"].lower().startswith("high") else "low",
                "height_m": float(ex["height"]),
                "coefficient": None,
                "source": "worldtides",
            }
        )
    return out


def sync_tides(db: DbSession, site: Site, day_from: date, day_to: date) -> int:
    """Récupère et stocke les marées pour un site sur une plage de dates. Retourne le nb d'événements ajoutés."""
    settings = get_settings()
    events: list[dict] = []
    if settings.worldtides_api_key:
        try:
            events = _worldtides_events(site, day_from, day_to, settings.worldtides_api_key)
        except Exception:  # noqa: BLE001 – repli hors-ligne
            events = []
    if not events:
        events = _synthetic_events(site, day_from, day_to)

    existing = {
        row.at
        for row in db.scalars(
            select(TideEvent).where(
                TideEvent.site_id == site.id,
                TideEvent.at >= events[0]["at"] - timedelta(minutes=1),
                TideEvent.at <= events[-1]["at"] + timedelta(minutes=1),
            )
        )
    }
    added = 0
    for ev in events:
        if ev["at"] in existing:
            continue
        db.add(TideEvent(site_id=site.id, **ev))
        added += 1
    db.commit()
    return added


def get_events(db: DbSession, site_id: int, day_from: date, day_to: date) -> list[TideEvent]:
    start = datetime.combine(day_from, datetime.min.time(), tzinfo=UTC)
    end = datetime.combine(day_to, datetime.max.time(), tzinfo=UTC)
    return list(
        db.scalars(
            select(TideEvent)
            .where(TideEvent.site_id == site_id, TideEvent.at >= start, TideEvent.at <= end)
            .order_by(TideEvent.at)
        )
    )


def tide_state_at(db: DbSession, site_id: int, at: datetime) -> TideState:
    """Interpole l'état de marée à un instant : hauteur, marnage, phase, délais vers BM/PM."""
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    prev_ev = db.scalars(
        select(TideEvent)
        .where(TideEvent.site_id == site_id, TideEvent.at <= at)
        .order_by(TideEvent.at.desc())
        .limit(1)
    ).first()
    next_ev = db.scalars(
        select(TideEvent).where(TideEvent.site_id == site_id, TideEvent.at > at).order_by(TideEvent.at).limit(1)
    ).first()
    if not prev_ev or not next_ev:
        return TideState(None, None, None, None, None, None)

    total = (next_ev.at - prev_ev.at).total_seconds()
    elapsed = (at - prev_ev.at).total_seconds()
    frac = max(0.0, min(1.0, elapsed / total)) if total else 0.0
    # Interpolation sinusoïdale (règle des douzièmes)
    h = prev_ev.height_m + (next_ev.height_m - prev_ev.height_m) * (1 - math.cos(math.pi * frac)) / 2
    rng = abs(next_ev.height_m - prev_ev.height_m)
    rising = next_ev.kind == "high"
    hours_to_next = (next_ev.at - at).total_seconds() / 3600
    hours_since_prev = elapsed / 3600
    if rising:
        hours_to_high = hours_to_next
        hours_to_low = -hours_since_prev  # négatif = passée
    else:
        hours_to_low = hours_to_next
        hours_to_high = -hours_since_prev
    coeff = prev_ev.coefficient or next_ev.coefficient
    return TideState(
        height_m=round(h, 2),
        range_m=round(rng, 2),
        phase="rising" if rising else "falling",
        hours_to_low=round(hours_to_low, 2),
        hours_to_high=round(hours_to_high, 2),
        coefficient=coeff,
        prev_event=prev_ev,
        next_event=next_ev,
    )
