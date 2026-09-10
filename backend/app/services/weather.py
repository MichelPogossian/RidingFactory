"""Prévisions météo et conditions de surf.

Fournisseur principal : Open-Meteo (gratuit, sans clé) – API « marine » pour la houle
et API « forecast » pour le vent / température / précipitations.
Repli : génération synthétique cohérente pour la démonstration hors-ligne.
"""

from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.models import Site, WeatherForecast


def _summary(wave: float | None, wind: float | None, precip: float | None) -> str:
    if precip and precip > 1.0:
        return "Pluie"
    if wind and wind > 40:
        return "Très venteux"
    if wave is not None and wave > 2.5:
        return "Grosse houle"
    if wave is not None and wave < 0.4:
        return "Mer plate"
    return "Bonnes conditions"


def _open_meteo(site: Site, day_from: date, day_to: date) -> list[dict]:
    marine = httpx.get(
        "https://marine-api.open-meteo.com/v1/marine",
        params={
            "latitude": site.latitude,
            "longitude": site.longitude,
            "hourly": "wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature",
            "start_date": day_from.isoformat(),
            "end_date": day_to.isoformat(),
            "timezone": "UTC",
        },
        timeout=15,
    )
    marine.raise_for_status()
    forecast = httpx.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": site.latitude,
            "longitude": site.longitude,
            "hourly": "temperature_2m,wind_speed_10m,wind_direction_10m,precipitation",
            "start_date": day_from.isoformat(),
            "end_date": day_to.isoformat(),
            "timezone": "UTC",
        },
        timeout=15,
    )
    forecast.raise_for_status()
    m = marine.json()["hourly"]
    f = forecast.json()["hourly"]
    fmap = {t: i for i, t in enumerate(f["time"])}
    out = []
    for i, t in enumerate(m["time"]):
        j = fmap.get(t)
        wave = m["wave_height"][i]
        wind = f["wind_speed_10m"][j] if j is not None else None
        precip = f["precipitation"][j] if j is not None else None
        out.append(
            {
                "at": datetime.fromisoformat(t).replace(tzinfo=UTC),
                "wave_height_m": wave,
                "swell_height_m": m["swell_wave_height"][i],
                "swell_period_s": m["swell_wave_period"][i],
                "swell_direction_deg": m["swell_wave_direction"][i],
                "water_temp_c": m.get("sea_surface_temperature", [None] * len(m["time"]))[i],
                "wind_speed_kmh": wind,
                "wind_direction_deg": f["wind_direction_10m"][j] if j is not None else None,
                "air_temp_c": f["temperature_2m"][j] if j is not None else None,
                "precipitation_mm": precip,
                "summary": _summary(wave, wind, precip),
                "source": "open-meteo",
            }
        )
    return out


def _synthetic(site: Site, day_from: date, day_to: date) -> list[dict]:
    out = []
    t = datetime.combine(day_from, datetime.min.time(), tzinfo=UTC)
    end = datetime.combine(day_to, datetime.max.time(), tzinfo=UTC)
    seed = site.id * 13.7
    while t <= end:
        h = (t - datetime(2026, 1, 1, tzinfo=UTC)).total_seconds() / 3600
        swell = 0.9 + 0.6 * math.sin(h / 37 + seed) + 0.3 * math.sin(h / 9 + seed * 2)
        exposure = 0.7 + site.exposure_score / 10  # spot exposé = houle plus grosse
        wave = max(0.3, round(swell * exposure, 2))
        wind = max(3, round(14 + 10 * math.sin(h / 17 + seed) + 6 * math.sin(h / 5), 1))
        wind_dir = (250 + 60 * math.sin(h / 41 + seed)) % 360
        precip = max(0.0, round(1.2 * math.sin(h / 53 + seed * 3) - 0.6, 2))
        air = round(18 + 6 * math.sin((t.hour - 8) / 24 * 2 * math.pi) + 2 * math.sin(h / 200), 1)
        out.append(
            {
                "at": t,
                "wave_height_m": wave,
                "swell_height_m": round(wave * 0.8, 2),
                "swell_period_s": round(8 + 4 * (0.5 + 0.5 * math.sin(h / 61 + seed)), 1),
                "swell_direction_deg": round((270 + 25 * math.sin(h / 80)) % 360, 0),
                "wind_speed_kmh": wind,
                "wind_direction_deg": round(wind_dir, 0),
                "air_temp_c": air,
                "water_temp_c": 17.5,
                "precipitation_mm": precip,
                "summary": _summary(wave, wind, precip),
                "source": "synthetic",
            }
        )
        t += timedelta(hours=1)
    return out


OPEN_METEO_PAST_DAYS = 90
OPEN_METEO_FORECAST_DAYS = 15


def sync_weather(db: DbSession, site: Site, day_from: date, day_to: date) -> int:
    """Prévisions réelles (Open-Meteo) sur la fenêtre supportée par l'API, complétées
    par le modèle synthétique au-delà (démo / historique lointain / hors-ligne)."""
    today = date.today()
    real_from = max(day_from, today - timedelta(days=OPEN_METEO_PAST_DAYS))
    real_to = min(day_to, today + timedelta(days=OPEN_METEO_FORECAST_DAYS))
    rows: list[dict] = []
    if real_from <= real_to:
        try:
            rows = _open_meteo(site, real_from, real_to)
        except Exception:  # noqa: BLE001 – repli hors-ligne
            rows = []
    covered = {r["at"] for r in rows}
    rows += [r for r in _synthetic(site, day_from, day_to) if r["at"] not in covered]
    rows.sort(key=lambda r: r["at"])

    start = rows[0]["at"]
    end = rows[-1]["at"]
    existing = {
        r.at: r
        for r in db.scalars(
            select(WeatherForecast).where(
                WeatherForecast.site_id == site.id, WeatherForecast.at >= start, WeatherForecast.at <= end
            )
        )
    }
    added = 0
    for row in rows:
        if row["at"] in existing:
            rec = existing[row["at"]]
            for k, v in row.items():
                setattr(rec, k, v)
        else:
            db.add(WeatherForecast(site_id=site.id, **row))
            added += 1
    db.commit()
    return added


def forecast_at(db: DbSession, site_id: int, at: datetime) -> WeatherForecast | None:
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    return db.scalars(
        select(WeatherForecast)
        .where(
            WeatherForecast.site_id == site_id,
            WeatherForecast.at >= at - timedelta(minutes=31),
            WeatherForecast.at <= at + timedelta(minutes=31),
        )
        .order_by(WeatherForecast.at)
        .limit(1)
    ).first()


def forecasts_range(db: DbSession, site_id: int, day_from: date, day_to: date) -> list[WeatherForecast]:
    start = datetime.combine(day_from, datetime.min.time(), tzinfo=UTC)
    end = datetime.combine(day_to, datetime.max.time(), tzinfo=UTC)
    return list(
        db.scalars(
            select(WeatherForecast)
            .where(WeatherForecast.site_id == site_id, WeatherForecast.at >= start, WeatherForecast.at <= end)
            .order_by(WeatherForecast.at)
        )
    )
