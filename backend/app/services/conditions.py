"""Moteur de règles : croise marée + météo + règles du site/activité/niveau pour dire
si un créneau est praticable, et fournit un « snapshot » de conditions."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import LEVEL_RANK, Level, TidePhase, TideRule
from app.schemas import ConditionsCheck, ConditionsSnapshot
from app.services.tides import tide_state_at
from app.services.weather import forecast_at


def snapshot(db: DbSession, site_id: int, at: datetime) -> ConditionsSnapshot:
    tide = tide_state_at(db, site_id, at)
    wx = forecast_at(db, site_id, at)
    return ConditionsSnapshot(
        at=at,
        tide_height_m=tide.height_m,
        tide_range_m=tide.range_m,
        tide_phase=tide.phase,
        hours_to_low=tide.hours_to_low,
        hours_to_high=tide.hours_to_high,
        coefficient=tide.coefficient,
        wave_height_m=wx.wave_height_m if wx else None,
        swell_period_s=wx.swell_period_s if wx else None,
        wind_speed_kmh=wx.wind_speed_kmh if wx else None,
        wind_direction_deg=wx.wind_direction_deg if wx else None,
        air_temp_c=wx.air_temp_c if wx else None,
        water_temp_c=wx.water_temp_c if wx else None,
        summary=wx.summary if wx else None,
    )


def _rule_applies(rule: TideRule, activity_id: int | None, level: Level | None) -> bool:
    if rule.activity_id is not None and activity_id is not None and rule.activity_id != activity_id:
        return False
    if level is not None:
        if rule.level_min and LEVEL_RANK[level] < LEVEL_RANK[rule.level_min]:
            return False
        if rule.level_max and LEVEL_RANK[level] > LEVEL_RANK[rule.level_max]:
            return False
    return True


def _phase_ok(rule: TideRule, snap: ConditionsSnapshot) -> tuple[bool, str | None]:
    w = rule.phase_window_hours
    if rule.phase == TidePhase.any:
        return True, None
    if rule.phase == TidePhase.low:
        if snap.hours_to_low is None or abs(snap.hours_to_low) > w:
            return False, f"hors fenêtre basse mer (±{w:g} h)"
    elif rule.phase == TidePhase.high:
        if snap.hours_to_high is None or abs(snap.hours_to_high) > w:
            return False, f"hors fenêtre pleine mer (±{w:g} h)"
    elif rule.phase == TidePhase.rising and snap.tide_phase != "rising":
        return False, "marée descendante (montante requise)"
    elif rule.phase == TidePhase.falling and snap.tide_phase != "falling":
        return False, "marée montante (descendante requise)"
    return True, None


def check(
    db: DbSession,
    site_id: int,
    at: datetime,
    activity_id: int | None = None,
    level: Level | None = None,
) -> ConditionsCheck:
    """Évalue toutes les règles actives applicables. OK si au moins une règle est satisfaite
    (les règles d'un même site/activité sont des alternatives), ou s'il n'existe aucune règle."""
    snap = snapshot(db, site_id, at)
    rules = [
        r
        for r in db.scalars(select(TideRule).where(TideRule.site_id == site_id, TideRule.is_active.is_(True)))
        if _rule_applies(r, activity_id, level)
    ]
    if not rules:
        return ConditionsCheck(ok=True, reasons=["Aucune règle définie : créneau libre"], matched_rules=[], snapshot=snap)

    reasons: list[str] = []
    matched: list[str] = []
    for rule in rules:
        fails: list[str] = []
        if rule.min_range_m is not None and (snap.tide_range_m is None or snap.tide_range_m < rule.min_range_m):
            fails.append(f"marnage {snap.tide_range_m} m < {rule.min_range_m} m")
        if rule.max_range_m is not None and (snap.tide_range_m is None or snap.tide_range_m > rule.max_range_m):
            fails.append(f"marnage {snap.tide_range_m} m > {rule.max_range_m} m")
        ok_phase, why = _phase_ok(rule, snap)
        if not ok_phase and why:
            fails.append(why)
        if rule.max_wave_height_m is not None and snap.wave_height_m is not None:
            if snap.wave_height_m > rule.max_wave_height_m:
                fails.append(f"vagues {snap.wave_height_m} m > {rule.max_wave_height_m} m")
        if rule.min_wave_height_m is not None and snap.wave_height_m is not None:
            if snap.wave_height_m < rule.min_wave_height_m:
                fails.append(f"vagues {snap.wave_height_m} m < {rule.min_wave_height_m} m")
        if rule.max_wind_kmh is not None and snap.wind_speed_kmh is not None:
            if snap.wind_speed_kmh > rule.max_wind_kmh:
                fails.append(f"vent {snap.wind_speed_kmh} km/h > {rule.max_wind_kmh} km/h")
        if fails:
            reasons.append(f"« {rule.name} » : " + ", ".join(fails))
        else:
            matched.append(rule.name)

    ok = bool(matched)
    if ok:
        reasons = [f"Règle satisfaite : {', '.join(matched)}"]
    return ConditionsCheck(ok=ok, reasons=reasons, matched_rules=matched, snapshot=snap)
