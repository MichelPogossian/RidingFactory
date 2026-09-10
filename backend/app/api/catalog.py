"""Référentiel : sites, activités, offres/tarifs, moniteurs. Lecture publique, écriture réservée."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import Db, ManagerUser
from app.models import Activity, Instructor, Offer, Site
from app.schemas import (
    ActivityBase,
    ActivityOut,
    InstructorBase,
    InstructorOut,
    OfferBase,
    OfferOut,
    SiteBase,
    SiteOut,
)

router = APIRouter(prefix="/api", tags=["catalogue"])


def _get_or_404(db, model, obj_id: int):
    obj = db.get(model, obj_id)
    if not obj:
        raise HTTPException(404, f"{model.__name__} {obj_id} introuvable")
    return obj


def _apply(obj, data):
    for k, v in data.model_dump().items():
        setattr(obj, k, v)


# --- Sites --------------------------------------------------------------------
@router.get("/sites", response_model=list[SiteOut])
def list_sites(db: Db, include_inactive: bool = False):
    stmt = select(Site).order_by(Site.name)
    if not include_inactive:
        stmt = stmt.where(Site.is_active.is_(True))
    return list(db.scalars(stmt))


@router.post("/sites", response_model=SiteOut, status_code=201)
def create_site(data: SiteBase, db: Db, _: ManagerUser):
    obj = Site(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/sites/{site_id}", response_model=SiteOut)
def update_site(site_id: int, data: SiteBase, db: Db, _: ManagerUser):
    obj = _get_or_404(db, Site, site_id)
    _apply(obj, data)
    db.commit()
    db.refresh(obj)
    return obj


# --- Activités ----------------------------------------------------------------
@router.get("/activities", response_model=list[ActivityOut])
def list_activities(db: Db, include_inactive: bool = False):
    stmt = select(Activity).order_by(Activity.name)
    if not include_inactive:
        stmt = stmt.where(Activity.is_active.is_(True))
    return list(db.scalars(stmt))


@router.post("/activities", response_model=ActivityOut, status_code=201)
def create_activity(data: ActivityBase, db: Db, _: ManagerUser):
    obj = Activity(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/activities/{activity_id}", response_model=ActivityOut)
def update_activity(activity_id: int, data: ActivityBase, db: Db, _: ManagerUser):
    obj = _get_or_404(db, Activity, activity_id)
    _apply(obj, data)
    db.commit()
    db.refresh(obj)
    return obj


# --- Offres / tarifs ----------------------------------------------------------
@router.get("/offers", response_model=list[OfferOut])
def list_offers(db: Db, activity_id: int | None = None, kind: str | None = None, include_inactive: bool = False):
    stmt = select(Offer).order_by(Offer.activity_id, Offer.kind, Offer.price_cents)
    if activity_id:
        stmt = stmt.where(Offer.activity_id == activity_id)
    if kind:
        stmt = stmt.where(Offer.kind == kind)
    if not include_inactive:
        stmt = stmt.where(Offer.is_active.is_(True))
    return list(db.scalars(stmt))


@router.post("/offers", response_model=OfferOut, status_code=201)
def create_offer(data: OfferBase, db: Db, _: ManagerUser):
    obj = Offer(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/offers/{offer_id}", response_model=OfferOut)
def update_offer(offer_id: int, data: OfferBase, db: Db, _: ManagerUser):
    obj = _get_or_404(db, Offer, offer_id)
    _apply(obj, data)
    db.commit()
    db.refresh(obj)
    return obj


# --- Moniteurs ----------------------------------------------------------------
@router.get("/instructors", response_model=list[InstructorOut])
def list_instructors(db: Db, _: ManagerUser):
    return list(db.scalars(select(Instructor).order_by(Instructor.full_name)))


@router.post("/instructors", response_model=InstructorOut, status_code=201)
def create_instructor(data: InstructorBase, db: Db, _: ManagerUser):
    obj = Instructor(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/instructors/{instructor_id}", response_model=InstructorOut)
def update_instructor(instructor_id: int, data: InstructorBase, db: Db, _: ManagerUser):
    obj = _get_or_404(db, Instructor, instructor_id)
    _apply(obj, data)
    db.commit()
    db.refresh(obj)
    return obj
