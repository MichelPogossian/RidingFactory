from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, bookings, catalog, conditions, documents, insights, planning, pos, public
from app.core.config import get_settings
from app.core.db import Base, SessionLocal, engine
from app.seed import seed_if_empty

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Création du schéma (en production : migrations Alembic)
    Base.metadata.create_all(bind=engine)
    if settings.seed_on_startup:
        with SessionLocal() as db:
            seed_if_empty(db)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Réservation, planning, caisse, facturation et pilotage multi-site pour Riding Factory.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, catalog, public, planning, bookings, pos, documents, insights, conditions):
    app.include_router(r.router)


@app.get("/api/health", tags=["système"])
def health():
    return {"status": "ok", "app": settings.app_name}
