"""Pilotage : tableau de bord, analyse CA, rentabilité, assistant IA."""

from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import CurrentUser, Db
from app.schemas import KPI, AssistantIn, AssistantOut, ProfitabilityRow, RevenueBreakdown
from app.services import analytics, assistant

router = APIRouter(prefix="/api", tags=["pilotage"])


@router.get("/dashboard", response_model=KPI)
def dashboard(db: Db, _: CurrentUser, site_id: int | None = None):
    return analytics.kpis(db, site_id)


@router.get("/analytics/revenue", response_model=RevenueBreakdown)
def revenue(
    db: Db,
    _: CurrentUser,
    date_from: date | None = None,
    date_to: date | None = None,
    granularity: str = "day",
    site_id: int | None = None,
):
    d_to = date_to or date.today()
    d_from = date_from or (d_to - timedelta(days=30))
    return analytics.revenue_breakdown(db, d_from, d_to, granularity, site_id)


@router.get("/analytics/profitability", response_model=list[ProfitabilityRow])
def profitability(db: Db, _: CurrentUser, date_from: date | None = None, date_to: date | None = None, dimension: str = "activity"):
    d_to = date_to or date.today()
    d_from = date_from or (d_to - timedelta(days=90))
    return analytics.profitability(db, d_from, d_to, dimension)


@router.get("/analytics/fill-rate")
def fill_rate(db: Db, _: CurrentUser, date_from: date | None = None, date_to: date | None = None, site_id: int | None = None):
    d_to = date_to or date.today()
    d_from = date_from or (d_to - timedelta(days=30))
    return {"fill_rate": analytics.fill_rate(db, d_from, d_to, site_id), "date_from": d_from, "date_to": d_to}


@router.post("/assistant", response_model=AssistantOut)
def ask(data: AssistantIn, db: Db, _: CurrentUser):
    return assistant.answer(db, data.question, data.site_id)


@router.get("/assistant/suggestions")
def suggestions(_: CurrentUser):
    return assistant.SUGGESTIONS
