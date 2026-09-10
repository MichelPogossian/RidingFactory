"""Schémas Pydantic (entrées / sorties API)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    BookingStatus,
    DocumentKind,
    DocumentStatus,
    GroupPreference,
    Level,
    OfferKind,
    PaymentMethod,
    SessionStatus,
    TidePhase,
    VoucherStatus,
)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth -------------------------------------------------------------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str


# --- Référentiel ------------------------------------------------------------
class SiteBase(BaseModel):
    name: str
    slug: str
    city: str
    address: str | None = None
    latitude: float
    longitude: float
    description: str | None = None
    exposure_score: int = 5
    is_active: bool = True
    seo_title: str | None = None
    seo_description: str | None = None
    seo_keywords: list[str] | None = None


class SiteOut(SiteBase, ORM):
    id: int


class ActivityBase(BaseModel):
    name: str
    slug: str
    category: str
    description: str | None = None
    color: str = "#0ea5e9"
    default_duration_minutes: int = 90
    default_capacity: int = 8
    requires_conditions: bool = False
    is_active: bool = True
    seo_title: str | None = None
    seo_description: str | None = None
    seo_keywords: list[str] | None = None


class ActivityOut(ActivityBase, ORM):
    id: int


class OfferBase(BaseModel):
    activity_id: int
    site_id: int | None = None
    name: str
    kind: OfferKind = OfferKind.single
    sessions_count: int = 1
    price_cents: int
    vat_rate: float = 20.0
    duration_minutes: int | None = None
    level_min: Level | None = None
    level_max: Level | None = None
    min_age: int | None = None
    validity_days: int | None = None
    description: str | None = None
    is_active: bool = True


class OfferOut(OfferBase, ORM):
    id: int


class InstructorBase(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    home_site_id: int | None = None
    activity_slugs: list[str] = Field(default_factory=list)
    hourly_cost_cents: int = 2500
    is_active: bool = True


class InstructorOut(InstructorBase, ORM):
    id: int


# --- Conditions -------------------------------------------------------------
class TideEventOut(ORM):
    id: int
    site_id: int
    at: datetime
    kind: str
    height_m: float
    coefficient: int | None
    source: str


class WeatherOut(ORM):
    id: int
    site_id: int
    at: datetime
    wave_height_m: float | None
    swell_height_m: float | None
    swell_period_s: float | None
    swell_direction_deg: float | None
    wind_speed_kmh: float | None
    wind_direction_deg: float | None
    air_temp_c: float | None
    water_temp_c: float | None
    precipitation_mm: float | None
    summary: str | None
    source: str


class TideRuleBase(BaseModel):
    site_id: int
    activity_id: int | None = None
    level_min: Level | None = None
    level_max: Level | None = None
    name: str
    min_range_m: float | None = None
    max_range_m: float | None = None
    phase: TidePhase = TidePhase.any
    phase_window_hours: float = 2.0
    max_wave_height_m: float | None = None
    min_wave_height_m: float | None = None
    max_wind_kmh: float | None = None
    is_active: bool = True


class TideRuleOut(TideRuleBase, ORM):
    id: int


class ConditionsSnapshot(BaseModel):
    """Conditions estimées à un instant donné sur un site."""

    at: datetime
    tide_height_m: float | None = None
    tide_range_m: float | None = None
    tide_phase: str | None = None
    hours_to_low: float | None = None
    hours_to_high: float | None = None
    coefficient: int | None = None
    wave_height_m: float | None = None
    swell_period_s: float | None = None
    wind_speed_kmh: float | None = None
    wind_direction_deg: float | None = None
    air_temp_c: float | None = None
    water_temp_c: float | None = None
    summary: str | None = None


class ConditionsCheck(BaseModel):
    ok: bool
    reasons: list[str]
    matched_rules: list[str]
    snapshot: ConditionsSnapshot


# --- Planning ---------------------------------------------------------------
class SessionBase(BaseModel):
    site_id: int
    activity_id: int
    instructor_id: int | None = None
    offer_id: int | None = None
    start_at: datetime
    end_at: datetime
    capacity: int = 8
    price_cents: int = 4500
    level_min: Level = Level.beginner
    level_max: Level = Level.advanced
    status: SessionStatus = SessionStatus.scheduled
    title: str | None = None
    notes: str | None = None


class SessionUpdate(BaseModel):
    instructor_id: int | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    capacity: int | None = None
    price_cents: int | None = None
    level_min: Level | None = None
    level_max: Level | None = None
    status: SessionStatus | None = None
    title: str | None = None
    notes: str | None = None


class SessionOut(SessionBase, ORM):
    id: int
    conditions_ok: bool | None
    conditions_note: str | None
    booked: int = 0
    remaining: int = 0
    site_name: str | None = None
    activity_name: str | None = None
    activity_color: str | None = None
    instructor_name: str | None = None


class GenerateSessionsIn(BaseModel):
    site_id: int
    activity_id: int
    offer_id: int | None = None
    instructor_id: int | None = None
    date_from: date
    date_to: date
    start_times: list[str] = Field(default_factory=lambda: ["09:00", "11:00", "14:00", "16:30"])
    weekdays: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4, 5, 6])  # 0 = lundi
    duration_minutes: int | None = None
    capacity: int | None = None
    price_cents: int | None = None
    level_min: Level = Level.beginner
    level_max: Level = Level.advanced
    only_if_conditions_ok: bool = True


class GenerateSessionsOut(BaseModel):
    created: int
    skipped: int
    details: list[dict]


class PlanningCell(BaseModel):
    session_id: int
    day: date
    time: str
    site: str
    site_id: int
    activity: str
    activity_id: int
    color: str
    capacity: int
    booked: int
    remaining: int
    level_min: Level
    level_max: Level
    status: SessionStatus
    conditions_ok: bool | None
    instructor: str | None


# --- Clients ----------------------------------------------------------------
class CustomerBase(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    birth_date: date | None = None
    weight_kg: float | None = None
    height_cm: float | None = None
    level: Level = Level.beginner
    board_type: str | None = None
    board_size: str | None = None
    practice_frequency: str | None = None
    wetsuit_size: str | None = None
    notes: str | None = None
    marketing_consent: bool = False


class CustomerOut(CustomerBase, ORM):
    id: int
    created_at: datetime
    age: int | None = None
    suggested_wetsuit: str | None = None
    suggested_board: str | None = None
    bookings_count: int = 0
    total_spent_cents: int = 0


# --- Réservations -----------------------------------------------------------
class BookingOut(ORM):
    id: int
    reference: str
    customer_id: int
    session_id: int
    participants: int
    status: BookingStatus
    price_cents: int
    paid_cents: int
    payment_method: PaymentMethod | None
    group_preference: GroupPreference
    group_label: str | None
    source: str
    voucher_id: int | None
    pass_card_id: int | None
    sale_id: int | None
    notes: str | None
    created_at: datetime
    customer_name: str | None = None
    customer_level: Level | None = None
    session_start: datetime | None = None
    site_name: str | None = None
    activity_name: str | None = None


class BookingUpdate(BaseModel):
    status: BookingStatus | None = None
    group_label: str | None = None
    notes: str | None = None
    participants: int | None = None


class CounterBookingIn(BaseModel):
    """Réservation créée par l'équipe à l'accueil."""

    customer_id: int | None = None
    customer: CustomerBase | None = None
    session_id: int
    participants: int = 1
    payment_method: PaymentMethod = PaymentMethod.card_terminal
    group_preference: GroupPreference = GroupPreference.none
    voucher_code: str | None = None
    pass_card_code: str | None = None
    notes: str | None = None


# --- Parcours client public -------------------------------------------------
class AvailabilityQuery(BaseModel):
    activity_slug: str
    level: Level = Level.beginner
    participants: int = 1
    site_id: int | None = None
    date_from: date | None = None
    date_to: date | None = None
    age: int | None = None


class AvailableSlot(BaseModel):
    session_id: int
    start_at: datetime
    end_at: datetime
    site_id: int
    site_name: str
    activity_name: str
    remaining: int
    price_cents: int
    level_min: Level
    level_max: Level
    conditions_ok: bool | None
    conditions_note: str | None
    score: float  # pertinence pour ce client (0–100)
    recommended: bool


class SiteRecommendation(BaseModel):
    site_id: int
    site_name: str
    score: float
    reasons: list[str]
    recommended: bool


class RecommendationOut(BaseModel):
    sites: list[SiteRecommendation]
    slots: list[AvailableSlot]


class PublicBookingIn(BaseModel):
    customer: CustomerBase
    session_ids: list[int] = Field(min_length=1)
    participants: int = 1
    offer_id: int | None = None
    group_preference: GroupPreference = GroupPreference.none
    voucher_code: str | None = None
    pass_card_code: str | None = None
    payment_method: PaymentMethod = PaymentMethod.card_online
    payment_token: str | None = None  # jeton fourni par le prestataire de paiement (Stripe…)


class PublicBookingOut(BaseModel):
    references: list[str]
    customer_id: int
    sale_reference: str | None
    total_cents: int
    paid_cents: int
    payment_status: str
    message: str


# --- Caisse -----------------------------------------------------------------
class ProductBase(BaseModel):
    name: str
    sku: str | None = None
    category: str
    price_cents: int
    cost_cents: int | None = None
    vat_rate: float = 20.0
    stock: int | None = None
    supplier: str | None = None
    site_id: int | None = None
    activity_id: int | None = None
    is_active: bool = True


class ProductOut(ProductBase, ORM):
    id: int


class SaleLineIn(BaseModel):
    product_id: int | None = None
    offer_id: int | None = None
    label: str | None = None
    quantity: int = 1
    unit_price_cents: int | None = None
    vat_rate: float | None = None


class SaleIn(BaseModel):
    site_id: int | None = None
    customer_id: int | None = None
    payment_method: PaymentMethod = PaymentMethod.card_terminal
    lines: list[SaleLineIn] = Field(min_length=1)
    voucher_code: str | None = None


class SaleLineOut(ORM):
    id: int
    label: str
    kind: str
    category: str | None
    product_id: int | None
    offer_id: int | None
    activity_id: int | None
    site_id: int | None
    quantity: int
    unit_price_cents: int
    vat_rate: float
    total_cents: int


class SaleOut(ORM):
    id: int
    reference: str
    site_id: int | None
    customer_id: int | None
    channel: str
    payment_method: PaymentMethod
    total_cents: int
    total_vat_cents: int
    status: str
    created_at: datetime
    lines: list[SaleLineOut]


# --- Bons cadeaux -----------------------------------------------------------
class VoucherPurchaseIn(BaseModel):
    value_cents: int | None = None
    offer_id: int | None = None
    buyer_name: str
    buyer_email: EmailStr
    recipient_name: str | None = None
    recipient_email: EmailStr | None = None
    message: str | None = None
    payment_method: PaymentMethod = PaymentMethod.card_online
    validity_months: int = 12


class VoucherOut(ORM):
    id: int
    code: str
    value_cents: int
    remaining_cents: int
    offer_id: int | None
    buyer_name: str
    buyer_email: str
    recipient_name: str | None
    recipient_email: str | None
    message: str | None
    status: VoucherStatus
    issued_at: datetime
    expires_at: date


# --- Cartes multi-séances ---------------------------------------------------
class PassCardPurchaseIn(BaseModel):
    customer_id: int | None = None
    customer: CustomerBase | None = None
    offer_id: int
    payment_method: PaymentMethod = PaymentMethod.card_online


class PassCardOut(ORM):
    id: int
    code: str
    customer_id: int
    offer_id: int
    activity_id: int
    total_sessions: int
    remaining_sessions: int
    price_cents: int
    purchased_at: datetime
    expires_at: date | None
    customer_name: str | None = None
    activity_name: str | None = None


# --- Documents (devis / factures / avoirs) ----------------------------------
class DocumentLineIn(BaseModel):
    label: str
    quantity: float = 1
    unit_price_cents: int
    vat_rate: float = 20.0


class DocumentIn(BaseModel):
    kind: DocumentKind
    customer_id: int | None = None
    customer_name: str
    customer_address: str | None = None
    customer_email: str | None = None
    sale_id: int | None = None
    parent_id: int | None = None
    issued_at: date | None = None
    due_at: date | None = None
    lines: list[DocumentLineIn] = Field(min_length=1)
    notes: str | None = None


class DocumentOut(ORM):
    id: int
    number: str
    kind: DocumentKind
    status: DocumentStatus
    customer_id: int | None
    customer_name: str
    customer_address: str | None
    customer_email: str | None
    sale_id: int | None
    parent_id: int | None
    issued_at: date
    due_at: date | None
    lines: list[dict]
    total_ht_cents: int
    total_vat_cents: int
    total_ttc_cents: int
    notes: str | None
    created_at: datetime


# --- Analytics --------------------------------------------------------------
class KPI(BaseModel):
    revenue_today_cents: int
    revenue_month_cents: int
    revenue_season_cents: int
    revenue_year_cents: int
    customers_count: int
    bookings_month: int
    fill_rate_month: float
    average_basket_cents: int
    revenue_by_site: list[dict]
    revenue_by_activity: list[dict]
    top_products: list[dict]
    top_slots: list[dict]
    upcoming_low_fill: list[dict]


class RevenueBreakdown(BaseModel):
    granularity: str
    date_from: date
    date_to: date
    total_cents: int
    series: list[dict]  # [{period, total_cents}]
    by_site: list[dict]
    by_activity: list[dict]
    by_category: list[dict]


class ProfitabilityRow(BaseModel):
    key: str
    label: str
    revenue_cents: int
    sessions: int
    customers: int
    capacity: int
    fill_rate: float
    avg_price_cents: int
    instructor_cost_cents: int
    product_cost_cents: int
    margin_cents: int
    margin_rate: float


# --- Assistant IA -----------------------------------------------------------
class AssistantIn(BaseModel):
    question: str
    site_id: int | None = None


class AssistantOut(BaseModel):
    answer: str
    data: dict | list | None = None
    intent: str
    engine: str  # rules | llm
    suggestions: list[str] = Field(default_factory=list)


class GroupProposalOut(BaseModel):
    session_id: int
    groups: list[dict]
    rationale: str
