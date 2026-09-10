"""Marées, météo, règles de faisabilité."""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import CurrentUser, Db, ManagerUser
from app.models import Level, Site, TideRule
from app.schemas import ConditionsCheck, ConditionsSnapshot, TideEventOut, TideRuleBase, TideRuleOut, WeatherOut
from app.services import conditions, tides, weather

router = APIRouter(prefix="/api/conditions", tags=["conditions"])


def _site(db, site_id: int) -> Site:
    s = db.get(Site, site_id)
    if not s:
        raise HTTPException(404, "Site introuvable")
    return s


@router.get("/tides", response_model=list[TideEventOut])
def list_tides(db: Db, site_id: int, date_from: date | None = None, date_to: date | None = None):
    d_from = date_from or date.today()
    d_to = date_to or d_from + timedelta(days=7)
    events = tides.get_events(db, site_id, d_from, d_to)
    if not events:
        tides.sync_tides(db, _site(db, site_id), d_from, d_to)
        events = tides.get_events(db, site_id, d_from, d_to)
    return events


@router.get("/weather", response_model=list[WeatherOut])
def list_weather(db: Db, site_id: int, date_from: date | None = None, date_to: date | None = None):
    d_from = date_from or date.today()
    d_to = date_to or d_from + timedelta(days=7)
    rows = weather.forecasts_range(db, site_id, d_from, d_to)
    if not rows:
        weather.sync_weather(db, _site(db, site_id), d_from, d_to)
        rows = weather.forecasts_range(db, site_id, d_from, d_to)
    return rows


@router.post("/sync")
def sync_all(db: Db, _: CurrentUser, days: int = 10, site_id: int | None = None):
    """Rafraîchit marées + prévisions pour tous les sites (ou un site) sur N jours."""
    today = date.today()
    sites = [_site(db, site_id)] if site_id else list(db.scalars(select(Site).where(Site.is_active.is_(True))))
    result = []
    for s in sites:
        t = tides.sync_tides(db, s, today - timedelta(days=1), today + timedelta(days=days))
        w = weather.sync_weather(db, s, today, today + timedelta(days=days))
        result.append({"site": s.name, "tides_added": t, "weather_added": w})
    return result


@router.get("/snapshot", response_model=ConditionsSnapshot)
def get_snapshot(db: Db, site_id: int, at: datetime):
    _site(db, site_id)
    return conditions.snapshot(db, site_id, at)


@router.get("/check", response_model=ConditionsCheck)
def check(db: Db, site_id: int, at: datetime, activity_id: int | None = None, level: Level | None = None):
    _site(db, site_id)
    return conditions.check(db, site_id, at, activity_id, level)


@router.get("/rules", response_model=list[TideRuleOut])
def list_rules(db: Db, _: CurrentUser, site_id: int | None = None):
    stmt = select(TideRule).order_by(TideRule.site_id, TideRule.name)
    if site_id:
        stmt = stmt.where(TideRule.site_id == site_id)
    return list(db.scalars(stmt))


@router.post("/rules", response_model=TideRuleOut, status_code=201)
def create_rule(data: TideRuleBase, db: Db, _: ManagerUser):
    r = TideRule(**data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/rules/{rule_id}", response_model=TideRuleOut)
def update_rule(rule_id: int, data: TideRuleBase, db: Db, _: ManagerUser):
    r = db.get(TideRule, rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Db, _: ManagerUser):
    r = db.get(TideRule, rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    db.delete(r)
    db.commit()
