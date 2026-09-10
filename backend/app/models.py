"""Modèle de données Riding Factory.

Les montants sont stockés en centimes (int) pour éviter les erreurs d'arrondi.
Les taux de TVA sont exprimés en pourcentage (ex: 20.0).
"""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


# ---------------------------------------------------------------------------
# Enumérations métier
# ---------------------------------------------------------------------------
class Level(str, enum.Enum):
    """Niveau du pratiquant, du plus débutant au plus expérimenté (ordre = rang)."""

    beginner = "beginner"  # débutant complet
    once = "once"  # a déjà surfé une fois
    several = "several"  # a déjà surfé plusieurs fois
    intermediate = "intermediate"
    advanced = "advanced"  # confirmé / expert


LEVEL_RANK: dict[Level, int] = {lvl: i for i, lvl in enumerate(Level)}
LEVEL_LABELS: dict[Level, str] = {
    Level.beginner: "Débutant complet",
    Level.once: "A déjà pratiqué une fois",
    Level.several: "A déjà pratiqué plusieurs fois",
    Level.intermediate: "Intermédiaire",
    Level.advanced: "Confirmé / expert",
}


class OfferKind(str, enum.Enum):
    single = "single"  # séance unique
    course = "course"  # stage / formule multi-séances (dates fixées)
    pass_card = "pass_card"  # carte multi-séances (réservation libre)
    rental = "rental"  # location de matériel


class SessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    cancelled = "cancelled"
    done = "done"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    no_show = "no_show"


class PaymentMethod(str, enum.Enum):
    card_online = "card_online"
    card_terminal = "card_terminal"
    cash = "cash"
    transfer = "transfer"
    voucher = "voucher"
    pass_card = "pass_card"
    check = "check"


class GroupPreference(str, enum.Enum):
    none = "none"
    homogeneous = "homogeneous"  # homogène en niveau
    heterogeneous = "heterogeneous"
    same_age = "same_age"
    family = "family"
    friends = "friends"
    parent_children = "parent_children"


class DocumentKind(str, enum.Enum):
    quote = "quote"
    invoice = "invoice"
    credit_note = "credit_note"


class DocumentStatus(str, enum.Enum):
    draft = "draft"
    sent = "sent"
    accepted = "accepted"
    paid = "paid"
    cancelled = "cancelled"


class VoucherStatus(str, enum.Enum):
    active = "active"
    used = "used"
    expired = "expired"
    cancelled = "cancelled"


class TidePhase(str, enum.Enum):
    any = "any"
    low = "low"  # autour de la basse mer
    high = "high"  # autour de la pleine mer
    rising = "rising"  # marée montante
    falling = "falling"  # marée descendante


# ---------------------------------------------------------------------------
# Utilisateurs (back-office)
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="staff")  # admin | manager | staff
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------------------
# Référentiel : sites, activités, offres, moniteurs
# ---------------------------------------------------------------------------
class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    city: Mapped[str] = mapped_column(String(120))
    address: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    description: Mapped[str | None] = mapped_column(Text)
    # Profil du spot : 0 = très facile / débutant, 10 = engagé / experts
    exposure_score: Mapped[int] = mapped_column(Integer, default=5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # SEO
    seo_title: Mapped[str | None] = mapped_column(String(255))
    seo_description: Mapped[str | None] = mapped_column(Text)
    seo_keywords: Mapped[list | None] = mapped_column(JSON)

    sessions: Mapped[list[Session]] = relationship(back_populates="site")
    tide_rules: Mapped[list[TideRule]] = relationship(back_populates="site", cascade="all, delete-orphan")


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(64))  # surf, paddle, skate, natation, location
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(16), default="#0ea5e9")
    default_duration_minutes: Mapped[int] = mapped_column(Integer, default=90)
    default_capacity: Mapped[int] = mapped_column(Integer, default=8)
    requires_conditions: Mapped[bool] = mapped_column(Boolean, default=False)  # dépend marée/météo
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    seo_title: Mapped[str | None] = mapped_column(String(255))
    seo_description: Mapped[str | None] = mapped_column(Text)
    seo_keywords: Mapped[list | None] = mapped_column(JSON)

    offers: Mapped[list[Offer]] = relationship(back_populates="activity", cascade="all, delete-orphan")


class Offer(Base):
    """Tarif / formule vendable pour une activité (séance, stage, carte, location)."""

    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True)  # None = tous sites
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[OfferKind] = mapped_column(Enum(OfferKind), default=OfferKind.single)
    sessions_count: Mapped[int] = mapped_column(Integer, default=1)
    price_cents: Mapped[int] = mapped_column(Integer)
    vat_rate: Mapped[float] = mapped_column(Float, default=20.0)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    level_min: Mapped[Level | None] = mapped_column(Enum(Level), nullable=True)
    level_max: Mapped[Level | None] = mapped_column(Enum(Level), nullable=True)
    min_age: Mapped[int | None] = mapped_column(Integer)
    validity_days: Mapped[int | None] = mapped_column(Integer)  # pour les cartes
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    activity: Mapped[Activity] = relationship(back_populates="offers")


class Instructor(Base):
    __tablename__ = "instructors"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    home_site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    activity_slugs: Mapped[list] = mapped_column(JSON, default=list)
    hourly_cost_cents: Mapped[int] = mapped_column(Integer, default=2500)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------------------
# Conditions : marées, météo, règles
# ---------------------------------------------------------------------------
class TideEvent(Base):
    """Une pleine mer ou une basse mer à un site."""

    __tablename__ = "tide_events"
    __table_args__ = (UniqueConstraint("site_id", "at", name="uq_tide_site_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # high | low
    height_m: Mapped[float] = mapped_column(Float)
    coefficient: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(32), default="synthetic")


class WeatherForecast(Base):
    """Prévision horaire météo + conditions de surf pour un site."""

    __tablename__ = "weather_forecasts"
    __table_args__ = (UniqueConstraint("site_id", "at", name="uq_weather_site_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    wave_height_m: Mapped[float | None] = mapped_column(Float)
    swell_height_m: Mapped[float | None] = mapped_column(Float)
    swell_period_s: Mapped[float | None] = mapped_column(Float)
    swell_direction_deg: Mapped[float | None] = mapped_column(Float)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float)
    wind_direction_deg: Mapped[float | None] = mapped_column(Float)
    air_temp_c: Mapped[float | None] = mapped_column(Float)
    water_temp_c: Mapped[float | None] = mapped_column(Float)
    precipitation_mm: Mapped[float | None] = mapped_column(Float)
    summary: Mapped[str | None] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(32), default="synthetic")


class TideRule(Base):
    """Règle de faisabilité d'un créneau selon la marée (et bornes météo optionnelles)."""

    __tablename__ = "tide_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    activity_id: Mapped[int | None] = mapped_column(ForeignKey("activities.id"), nullable=True)
    level_min: Mapped[Level | None] = mapped_column(Enum(Level), nullable=True)
    level_max: Mapped[Level | None] = mapped_column(Enum(Level), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    min_range_m: Mapped[float | None] = mapped_column(Float)  # marnage mini
    max_range_m: Mapped[float | None] = mapped_column(Float)  # marnage maxi
    phase: Mapped[TidePhase] = mapped_column(Enum(TidePhase), default=TidePhase.any)
    phase_window_hours: Mapped[float] = mapped_column(Float, default=2.0)  # ± heures autour de la phase
    max_wave_height_m: Mapped[float | None] = mapped_column(Float)
    min_wave_height_m: Mapped[float | None] = mapped_column(Float)
    max_wind_kmh: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    site: Mapped[Site] = relationship(back_populates="tide_rules")


# ---------------------------------------------------------------------------
# Planning : créneaux (sessions)
# ---------------------------------------------------------------------------
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"), index=True)
    instructor_id: Mapped[int | None] = mapped_column(ForeignKey("instructors.id"))
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("offers.id"))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    capacity: Mapped[int] = mapped_column(Integer, default=8)
    price_cents: Mapped[int] = mapped_column(Integer, default=4500)
    level_min: Mapped[Level] = mapped_column(Enum(Level), default=Level.beginner)
    level_max: Mapped[Level] = mapped_column(Enum(Level), default=Level.advanced)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.scheduled)
    title: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    conditions_ok: Mapped[bool | None] = mapped_column(Boolean)  # résultat du dernier check marée/météo
    conditions_note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    site: Mapped[Site] = relationship(back_populates="sessions")
    activity: Mapped[Activity] = relationship()
    instructor: Mapped[Instructor | None] = relationship()
    bookings: Mapped[list[Booking]] = relationship(back_populates="session")


# ---------------------------------------------------------------------------
# Clients et réservations
# ---------------------------------------------------------------------------
class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    birth_date: Mapped[date | None] = mapped_column(Date)
    # Questionnaire
    weight_kg: Mapped[float | None] = mapped_column(Float)
    height_cm: Mapped[float | None] = mapped_column(Float)
    level: Mapped[Level] = mapped_column(Enum(Level), default=Level.beginner)
    board_type: Mapped[str | None] = mapped_column(String(64))  # mousse, mini-malibu, longboard, shortboard…
    board_size: Mapped[str | None] = mapped_column(String(32))
    practice_frequency: Mapped[str | None] = mapped_column(String(64))
    wetsuit_size: Mapped[str | None] = mapped_column(String(8))  # calculée / ajustée par l'équipe
    notes: Mapped[str | None] = mapped_column(Text)
    marketing_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bookings: Mapped[list[Booking]] = relationship(back_populates="customer")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    participants: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.confirmed)
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    paid_cents: Mapped[int] = mapped_column(Integer, default=0)
    payment_method: Mapped[PaymentMethod | None] = mapped_column(Enum(PaymentMethod), nullable=True)
    group_preference: Mapped[GroupPreference] = mapped_column(Enum(GroupPreference), default=GroupPreference.none)
    group_label: Mapped[str | None] = mapped_column(String(64))  # groupe affecté par l'équipe (ex: "Groupe A")
    source: Mapped[str] = mapped_column(String(32), default="online")  # online | counter | phone
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("gift_vouchers.id"))
    pass_card_id: Mapped[int | None] = mapped_column(ForeignKey("pass_cards.id"))
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped[Customer] = relationship(back_populates="bookings")
    session: Mapped[Session] = relationship(back_populates="bookings")


# ---------------------------------------------------------------------------
# Caisse, produits, ventes
# ---------------------------------------------------------------------------
class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    sku: Mapped[str | None] = mapped_column(String(64), unique=True)
    category: Mapped[str] = mapped_column(String(64))  # boutique, vetements, accessoires, creme_solaire, location…
    price_cents: Mapped[int] = mapped_column(Integer)
    cost_cents: Mapped[int | None] = mapped_column(Integer)  # coût d'achat pour la marge
    vat_rate: Mapped[float] = mapped_column(Float, default=20.0)
    stock: Mapped[int | None] = mapped_column(Integer)
    supplier: Mapped[str | None] = mapped_column(String(160))
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    activity_id: Mapped[int | None] = mapped_column(ForeignKey("activities.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Sale(Base):
    """Ticket de caisse / commande. Source unique de vérité pour le chiffre d'affaires."""

    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    channel: Mapped[str] = mapped_column(String(32), default="counter")  # online | counter
    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod), default=PaymentMethod.card_terminal)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_vat_cents: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="paid")  # paid | refunded | pending
    payment_ref: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    lines: Mapped[list[SaleLine]] = relationship(back_populates="sale", cascade="all, delete-orphan")


class SaleLine(Base):
    __tablename__ = "sale_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    label: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(32))  # session | course | pass_card | voucher | product | rental
    category: Mapped[str | None] = mapped_column(String(64))  # ex: cours, stage, location, vetements…
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("offers.id"))
    activity_id: Mapped[int | None] = mapped_column(ForeignKey("activities.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price_cents: Mapped[int] = mapped_column(Integer)
    vat_rate: Mapped[float] = mapped_column(Float, default=20.0)
    total_cents: Mapped[int] = mapped_column(Integer)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0)  # coût associé (marge)

    sale: Mapped[Sale] = relationship(back_populates="lines")


# ---------------------------------------------------------------------------
# Bons cadeaux & cartes multi-séances
# ---------------------------------------------------------------------------
class GiftVoucher(Base):
    __tablename__ = "gift_vouchers"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    value_cents: Mapped[int] = mapped_column(Integer)
    remaining_cents: Mapped[int] = mapped_column(Integer)
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("offers.id"))  # bon "prestation" si renseigné
    buyer_name: Mapped[str] = mapped_column(String(200))
    buyer_email: Mapped[str] = mapped_column(String(255))
    recipient_name: Mapped[str | None] = mapped_column(String(200))
    recipient_email: Mapped[str | None] = mapped_column(String(255))
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[VoucherStatus] = mapped_column(Enum(VoucherStatus), default=VoucherStatus.active)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[date] = mapped_column(Date)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"))


class PassCard(Base):
    __tablename__ = "pass_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id"))
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"))
    total_sessions: Mapped[int] = mapped_column(Integer)
    remaining_sessions: Mapped[int] = mapped_column(Integer)
    price_cents: Mapped[int] = mapped_column(Integer)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[date | None] = mapped_column(Date)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"))

    customer: Mapped[Customer] = relationship()


# ---------------------------------------------------------------------------
# Devis / factures / avoirs
# ---------------------------------------------------------------------------
class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # ex: F-2026-00012
    kind: Mapped[DocumentKind] = mapped_column(Enum(DocumentKind))
    status: Mapped[DocumentStatus] = mapped_column(Enum(DocumentStatus), default=DocumentStatus.draft)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    customer_name: Mapped[str] = mapped_column(String(200))
    customer_address: Mapped[str | None] = mapped_column(Text)
    customer_email: Mapped[str | None] = mapped_column(String(255))
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))  # facture d'origine d'un avoir
    issued_at: Mapped[date] = mapped_column(Date)
    due_at: Mapped[date | None] = mapped_column(Date)
    lines: Mapped[list] = mapped_column(JSON, default=list)  # [{label, quantity, unit_price_cents, vat_rate}]
    total_ht_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_vat_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_ttc_cents: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DocumentSequence(Base):
    """Numérotation continue et sans trou par type et par année (exigence légale FR)."""

    __tablename__ = "document_sequences"
    __table_args__ = (UniqueConstraint("kind", "year", name="uq_docseq_kind_year"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    year: Mapped[int] = mapped_column(Integer)
    last_value: Mapped[int] = mapped_column(Integer, default=0)
