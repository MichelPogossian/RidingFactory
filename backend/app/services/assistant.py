"""Assistant d'aide à la décision.

Architecture en deux couches :
1. un moteur d'intentions (règles + mots-clés FR) qui interroge directement les données
   → fonctionne sans aucun service externe, réponses chiffrées et vérifiables ;
2. optionnellement, un LLM (OpenAI) qui reformule la réponse à partir des données extraites
   si `OPENAI_API_KEY` est configurée. Les données restent la source de vérité.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.core.config import get_settings
from app.models import Activity, Booking, BookingStatus, Offer, OfferKind, Session, SessionStatus, Site
from app.schemas import AssistantOut
from app.services import analytics

MONTHS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
    "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}
WEEKDAYS = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6}

SUGGESTIONS = [
    "Quels sont mes créneaux les plus rentables ?",
    "Quelle école fonctionne le mieux en septembre ?",
    "Où ai-je le plus de places disponibles mercredi ?",
    "Quels sont mes stages qui se remplissent le moins ?",
    "Quels créneaux devrais-je ouvrir la semaine prochaine ?",
    "Quel est mon chiffre d'affaires du mois ?",
]


PARIS = ZoneInfo("Europe/Paris")


def _local(dt: datetime) -> datetime:
    return dt.astimezone(PARIS)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _eur(cents: int) -> str:
    return f"{cents / 100:,.0f} €".replace(",", " ")


def _period_from_question(q: str) -> tuple[date, date, str]:
    today = date.today()
    for name, m in MONTHS.items():
        if name in q:
            year = today.year if m <= today.month + 1 else today.year - 1
            start = date(year, m, 1)
            end = (start.replace(month=m % 12 + 1, year=year + (m == 12)) - timedelta(days=1))
            return start, end, f"en {name}"
    if "aujourd" in q or "jour" in q and "semaine" not in q:
        return today, today, "aujourd'hui"
    if "semaine" in q:
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6), "cette semaine"
    if "annee" in q or "an " in q:
        return date(today.year, 1, 1), today, "cette année"
    if "saison" in q:
        s, e = analytics.season_bounds(today)
        return s, e, "cette saison"
    return today.replace(day=1), today, "ce mois-ci"


def _next_weekday(q: str) -> date | None:
    today = date.today()
    for name, wd in WEEKDAYS.items():
        if name in q:
            delta = (wd - today.weekday()) % 7
            return today + timedelta(days=delta)
    if "demain" in q:
        return today + timedelta(days=1)
    return None


def answer(db: DbSession, question: str, site_id: int | None = None) -> AssistantOut:
    q = _norm(question)
    intent, text, data = _rules(db, q, site_id)
    engine = "rules"
    settings = get_settings()
    if settings.openai_api_key:
        llm = _llm_rephrase(question, text, data)
        if llm:
            text, engine = llm, "llm"
    return AssistantOut(answer=text, data=data, intent=intent, engine=engine, suggestions=SUGGESTIONS)


def _rules(db: DbSession, q: str, site_id: int | None) -> tuple[str, str, dict | list | None]:
    # 1. Créneaux rentables
    if "rentab" in q or "marge" in q:
        dim = "slot" if "creneau" in q or "horaire" in q else ("site" if "ecole" in q or "site" in q else "activity")
        d_from, d_to, label = _period_from_question(q) if any(m in q for m in MONTHS) else (*analytics.season_bounds(date.today()), "cette saison")
        rows = analytics.profitability(db, d_from, d_to, dim)[:5]
        if not rows:
            return "profitability", f"Aucune donnée de rentabilité {label}.", []
        dim_label = {"slot": "créneaux", "site": "écoles", "activity": "activités"}[dim]
        lines = [
            f"• {r.label} : marge {_eur(r.margin_cents)} ({r.margin_rate:g} %), CA {_eur(r.revenue_cents)}, remplissage {r.fill_rate:g} %"
            for r in rows
        ]
        return "profitability", f"Vos {dim_label} les plus rentables {label} :\n" + "\n".join(lines), [r.model_dump() for r in rows]

    # 2. Quelle école fonctionne le mieux
    if ("ecole" in q or "site" in q) and ("mieux" in q or "meilleur" in q or "fonctionne" in q or "performe" in q):
        d_from, d_to, label = _period_from_question(q)
        bd = analytics.revenue_breakdown(db, d_from, d_to, "month")
        by_site = [r for r in bd.by_site if r["id"] is not None]
        if not by_site:
            return "best_site", f"Aucune vente enregistrée {label}.", []
        best = by_site[0]
        fills = {s.id: analytics.fill_rate(db, d_from, d_to, s.id) for s in db.scalars(select(Site))}
        lines = [f"• {r['label']} : {_eur(r['total_cents'])} (remplissage {fills.get(r['id'], 0):g} %)" for r in by_site]
        return (
            "best_site",
            f"{label.capitalize()}, l'école qui fonctionne le mieux est **{best['label']}** avec {_eur(best['total_cents'])} de CA.\n"
            + "\n".join(lines),
            {"by_site": by_site, "fill_rates": fills},
        )

    # 3. Places disponibles un jour donné
    if "place" in q or "disponible" in q or "dispo" in q:
        day = _next_weekday(q) or date.today()
        start = datetime.combine(day, datetime.min.time(), tzinfo=PARIS)
        end = start + timedelta(days=1)
        stmt = (
            select(Session, func.coalesce(func.sum(Booking.participants), 0))
            .outerjoin(Booking, (Booking.session_id == Session.id) & (Booking.status == BookingStatus.confirmed))
            .where(Session.start_at >= start, Session.start_at < end, Session.status == SessionStatus.scheduled)
            .group_by(Session.id)
            .order_by(Session.start_at)
        )
        if site_id:
            stmt = stmt.where(Session.site_id == site_id)
        rows = [(s, s.capacity - int(b)) for s, b in db.execute(stmt)]
        if not rows:
            return "availability", f"Aucun créneau programmé le {day:%A %d/%m}.", []
        by_site: dict[str, int] = {}
        for s, rem in rows:
            by_site[s.site.name] = by_site.get(s.site.name, 0) + rem
        best_site = max(by_site, key=by_site.get)
        lines = [f"• {_local(s.start_at):%H:%M} – {s.site.name} – {s.activity.name} : {rem} place(s)" for s, rem in rows if rem > 0]
        return (
            "availability",
            f"Le {day:%d/%m}, c'est à **{best_site}** que vous avez le plus de places ({by_site[best_site]} au total).\n" + "\n".join(lines),
            [{"session_id": s.id, "start_at": s.start_at.isoformat(), "site": s.site.name, "activity": s.activity.name, "remaining": rem} for s, rem in rows],
        )

    # 4. Stages qui se remplissent le moins
    if "stage" in q and ("moins" in q or "remplis" in q or "vide" in q):
        now = datetime.now(UTC)
        stmt = (
            select(Session, func.coalesce(func.sum(Booking.participants), 0))
            .join(Offer, Offer.id == Session.offer_id)
            .outerjoin(Booking, (Booking.session_id == Session.id) & (Booking.status == BookingStatus.confirmed))
            .where(Offer.kind == OfferKind.course, Session.start_at >= now, Session.status == SessionStatus.scheduled)
            .group_by(Session.id)
        )
        rows = sorted(((s, int(b)) for s, b in db.execute(stmt)), key=lambda r: r[1] / max(r[0].capacity, 1))[:6]
        if not rows:
            return "low_fill_courses", "Aucun stage à venir n'est programmé.", []
        lines = [f"• {s.title or s.activity.name} – {s.site.name} – {_local(s.start_at):%d/%m %H:%M} : {b}/{s.capacity}" for s, b in rows]
        return "low_fill_courses", "Stages à venir les moins remplis :\n" + "\n".join(lines), [
            {"session_id": s.id, "title": s.title, "site": s.site.name, "start_at": s.start_at.isoformat(), "booked": b, "capacity": s.capacity}
            for s, b in rows
        ]

    # 5. Quels créneaux ouvrir la semaine prochaine → s'appuie sur l'historique de remplissage par heure
    if "ouvrir" in q or "programmer" in q or "ajouter" in q:
        today = date.today()
        hist_from = today - timedelta(days=60)
        rows = analytics.top_slots(db, hist_from, today, 6, site_id)
        rows = [r for r in rows if r["participants"] > 0]
        if not rows:
            return "open_slots", "Pas encore assez d'historique pour recommander des créneaux.", []
        lines = [
            f"• {r['site']} – {r['activity']} à {r['hour']} : {r['participants']} participants sur {r['sessions']} séances ({_eur(r['revenue_cents'])})"
            for r in rows
        ]
        return (
            "open_slots",
            "Sur les 60 derniers jours, les créneaux qui ont le mieux fonctionné (à privilégier la semaine prochaine) :\n" + "\n".join(lines),
            rows,
        )

    # 6. Chiffre d'affaires
    if "chiffre" in q or " ca " in f" {q} " or "vente" in q or "recette" in q:
        d_from, d_to, label = _period_from_question(q)
        bd = analytics.revenue_breakdown(db, d_from, d_to, "day", site_id)
        parts = [f"CA {label} : **{_eur(bd.total_cents)}**."]
        if bd.by_activity:
            parts.append("Par activité : " + ", ".join(f"{r['label']} {_eur(r['total_cents'])}" for r in bd.by_activity[:5]))
        if bd.by_site:
            parts.append("Par école : " + ", ".join(f"{r['label']} {_eur(r['total_cents'])}" for r in bd.by_site))
        return "revenue", "\n".join(parts), bd.model_dump(mode="json")

    # 7. Remplissage
    if "remplissage" in q or "taux" in q:
        d_from, d_to, label = _period_from_question(q)
        rate = analytics.fill_rate(db, d_from, d_to, site_id)
        per_site = {s.name: analytics.fill_rate(db, d_from, d_to, s.id) for s in db.scalars(select(Site))}
        return (
            "fill_rate",
            f"Taux de remplissage {label} : **{rate:g} %**.\n" + "\n".join(f"• {k} : {v:g} %" for k, v in per_site.items()),
            {"global": rate, "per_site": per_site},
        )

    # 8. Actions commerciales : créneaux sous-remplis à venir
    if "promo" in q or "commercial" in q or "vide" in q or "relance" in q:
        rows = analytics.upcoming_low_fill(db, 7, 0.5, site_id)
        if not rows:
            return "commercial", "Tous vos créneaux des 7 prochains jours sont remplis à plus de 50 %.", []
        lines = [f"• {_local(datetime.fromisoformat(r['start_at'])):%d/%m %H:%M} – {r['site']} – {r['activity']} : {r['remaining']} places" for r in rows[:8]]
        return (
            "commercial",
            "Créneaux à pousser (moins de 50 % remplis dans les 7 jours) — idéal pour une offre flash ou une relance e-mail :\n" + "\n".join(lines),
            rows,
        )

    # 9. Aide / défaut
    kp = analytics.kpis(db, site_id)
    return (
        "overview",
        f"Vue d'ensemble : CA du jour {_eur(kp.revenue_today_cents)}, du mois {_eur(kp.revenue_month_cents)}, "
        f"de la saison {_eur(kp.revenue_season_cents)}. Remplissage du mois : {kp.fill_rate_month:g} %. "
        f"{len(kp.upcoming_low_fill)} créneau(x) peu remplis dans les 7 jours.\n\n"
        "Je peux répondre sur : rentabilité, CA, remplissage, places disponibles, stages peu remplis, créneaux à ouvrir.",
        kp.model_dump(mode="json"),
    )


def _llm_rephrase(question: str, facts: str, data) -> str | None:
    s = get_settings()
    try:
        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {s.openai_api_key}"},
            json={
                "model": s.openai_model,
                "temperature": 0.2,
                "messages": [
                    {
                        "role": "system",
                        "content": "Tu es l'assistant de pilotage de Riding Factory (écoles de surf en Vendée). "
                        "Réponds en français, de façon concise et actionnable, UNIQUEMENT à partir des faits fournis. "
                        "N'invente aucun chiffre.",
                    },
                    {"role": "user", "content": f"Question : {question}\n\nFaits extraits de la base :\n{facts}"},
                ],
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------------------
# Constitution intelligente des groupes
# ---------------------------------------------------------------------------
def propose_groups(db: DbSession, session: Session, group_size: int = 4) -> dict:
    """Répartit les participants d'un créneau en groupes homogènes en tenant compte
    du niveau, de l'âge et des souhaits (famille / amis / parent-enfants restent ensemble)."""
    from app.models import LEVEL_RANK, GroupPreference

    bookings = [b for b in session.bookings if b.status == BookingStatus.confirmed]
    if not bookings:
        return {"session_id": session.id, "groups": [], "rationale": "Aucune réservation confirmée."}

    units = []  # une unité = une réservation (les participants d'une même réservation restent ensemble)
    today = date.today()
    for b in bookings:
        c = b.customer
        age = (today - c.birth_date).days // 365 if c.birth_date else None
        units.append(
            {
                "booking_id": b.id,
                "reference": b.reference,
                "customer": f"{c.first_name} {c.last_name}",
                "level": c.level.value,
                "level_rank": LEVEL_RANK[c.level],
                "age": age,
                "participants": b.participants,
                "preference": b.group_preference.value,
                "wetsuit": c.wetsuit_size or suggest_wetsuit(c.height_cm, c.weight_kg),
                "board": suggest_board(c.level, c.weight_kg, c.height_cm),
            }
        )

    # Tri : niveau puis âge → les voisins se ressemblent
    units.sort(key=lambda u: (u["level_rank"], u["age"] or 30))
    groups: list[dict] = []
    current: dict | None = None
    for u in units:
        fits = (
            current is not None
            and current["size"] + u["participants"] <= group_size
            and abs(current["level_rank"] - u["level_rank"]) <= 1
            and (u["preference"] != GroupPreference.homogeneous.value or current["level_rank"] == u["level_rank"])
        )
        if not fits:
            current = {"label": f"Groupe {chr(65 + len(groups))}", "size": 0, "level_rank": u["level_rank"], "members": []}
            groups.append(current)
        current["members"].append(u)
        current["size"] += u["participants"]
    for g in groups:
        g.pop("level_rank", None)
    rationale = (
        f"{len(units)} réservation(s), {sum(u['participants'] for u in units)} participant(s) répartis en {len(groups)} groupe(s) "
        f"de {group_size} max. Regroupement par niveau (écart ≤ 1) puis par âge ; les réservations groupées restent ensemble."
    )
    return {"session_id": session.id, "groups": groups, "rationale": rationale}


def suggest_wetsuit(height_cm: float | None, weight_kg: float | None) -> str | None:
    if not height_cm or not weight_kg:
        return None
    if height_cm < 130:
        return "8 ans" if weight_kg < 30 else "10 ans"
    if height_cm < 150:
        return "12 ans" if weight_kg < 42 else "14 ans"
    if height_cm < 165:
        return "XS" if weight_kg < 55 else "S"
    if height_cm < 175:
        return "S" if weight_kg < 65 else "M"
    if height_cm < 185:
        return "M" if weight_kg < 78 else "L"
    return "L" if weight_kg < 90 else "XL"


def suggest_board(level, weight_kg: float | None, height_cm: float | None) -> str | None:
    from app.models import LEVEL_RANK

    if weight_kg is None:
        return None
    rank = LEVEL_RANK[level]
    if rank <= 1:
        return "Mousse 8'0" if weight_kg < 65 else ("Mousse 8'6" if weight_kg < 85 else "Mousse 9'0")
    if rank == 2:
        return "Mousse 7'6" if weight_kg < 70 else "Mousse 8'0"
    if rank == 3:
        return "Mini-malibu 7'2" if weight_kg < 75 else "Mini-malibu 7'6"
    return "Shortboard / fish 6'2" if weight_kg < 75 else "Fish 6'6"
