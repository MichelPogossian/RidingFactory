export type Level = "beginner" | "once" | "several" | "intermediate" | "advanced";
export type OfferKind = "single" | "course" | "pass_card" | "rental";
export type SessionStatus = "scheduled" | "cancelled" | "done";
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "no_show";
export type PaymentMethod = "card_online" | "card_terminal" | "cash" | "transfer" | "voucher" | "pass_card" | "check";
export type GroupPreference = "none" | "homogeneous" | "heterogeneous" | "same_age" | "family" | "friends" | "parent_children";
export type DocumentKind = "quote" | "invoice" | "credit_note";
export type DocumentStatus = "draft" | "sent" | "accepted" | "paid" | "cancelled";

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Débutant complet",
  once: "A déjà pratiqué une fois",
  several: "A déjà pratiqué plusieurs fois",
  intermediate: "Intermédiaire",
  advanced: "Confirmé / expert",
};
export const LEVEL_SHORT: Record<Level, string> = {
  beginner: "Débutant",
  once: "1 séance",
  several: "Quelques séances",
  intermediate: "Intermédiaire",
  advanced: "Confirmé",
};
export const GROUP_LABELS: Record<GroupPreference, string> = {
  none: "Pas de préférence",
  homogeneous: "Groupe homogène en niveau",
  heterogeneous: "Groupe hétérogène",
  same_age: "Groupe du même âge",
  family: "Groupe familial",
  friends: "Je réserve avec des amis",
  parent_children: "Parent + enfants",
};
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  card_online: "CB en ligne",
  card_terminal: "CB (TPE)",
  cash: "Espèces",
  transfer: "Virement",
  voucher: "Bon cadeau",
  pass_card: "Carte multi-séances",
  check: "Chèque",
};
export const KIND_LABELS: Record<OfferKind, string> = {
  single: "Séance",
  course: "Stage / formule",
  pass_card: "Carte multi-séances",
  rental: "Location",
};

export interface Site {
  id: number;
  name: string;
  slug: string;
  city: string;
  address: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  exposure_score: number;
  is_active: boolean;
}
export interface Activity {
  id: number;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  color: string;
  default_duration_minutes: number;
  default_capacity: number;
  requires_conditions: boolean;
  is_active: boolean;
}
export interface Offer {
  id: number;
  activity_id: number;
  site_id: number | null;
  name: string;
  kind: OfferKind;
  sessions_count: number;
  price_cents: number;
  vat_rate: number;
  duration_minutes: number | null;
  level_min: Level | null;
  level_max: Level | null;
  min_age: number | null;
  validity_days: number | null;
  description: string | null;
  is_active: boolean;
}
export interface Instructor {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  home_site_id: number | null;
  activity_slugs: string[];
  hourly_cost_cents: number;
  is_active: boolean;
}

export interface AvailableSlot {
  session_id: number;
  start_at: string;
  end_at: string;
  site_id: number;
  site_name: string;
  activity_name: string;
  remaining: number;
  price_cents: number;
  level_min: Level;
  level_max: Level;
  conditions_ok: boolean | null;
  conditions_note: string | null;
  score: number;
  recommended: boolean;
}
export interface SiteRecommendation {
  site_id: number;
  site_name: string;
  score: number;
  reasons: string[];
  recommended: boolean;
}
export interface Recommendation {
  sites: SiteRecommendation[];
  slots: AvailableSlot[];
}

export interface CustomerInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  birth_date?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  level: Level;
  board_type?: string | null;
  board_size?: string | null;
  practice_frequency?: string | null;
  wetsuit_size?: string | null;
  notes?: string | null;
  marketing_consent?: boolean;
}
export interface Customer extends CustomerInput {
  id: number;
  created_at: string;
  age: number | null;
  suggested_wetsuit: string | null;
  suggested_board: string | null;
  bookings_count: number;
  total_spent_cents: number;
}

export interface PublicBookingOut {
  references: string[];
  customer_id: number;
  sale_reference: string | null;
  total_cents: number;
  paid_cents: number;
  payment_status: string;
  message: string;
}

export interface SessionOut {
  id: number;
  site_id: number;
  activity_id: number;
  instructor_id: number | null;
  offer_id: number | null;
  start_at: string;
  end_at: string;
  capacity: number;
  price_cents: number;
  level_min: Level;
  level_max: Level;
  status: SessionStatus;
  title: string | null;
  notes: string | null;
  conditions_ok: boolean | null;
  conditions_note: string | null;
  booked: number;
  remaining: number;
  site_name: string | null;
  activity_name: string | null;
  activity_color: string | null;
  instructor_name: string | null;
}
export interface PlanningCell {
  session_id: number;
  day: string;
  time: string;
  site: string;
  site_id: number;
  activity: string;
  activity_id: number;
  color: string;
  capacity: number;
  booked: number;
  remaining: number;
  level_min: Level;
  level_max: Level;
  status: SessionStatus;
  conditions_ok: boolean | null;
  instructor: string | null;
}

export interface Booking {
  id: number;
  reference: string;
  customer_id: number;
  session_id: number;
  participants: number;
  status: BookingStatus;
  price_cents: number;
  paid_cents: number;
  payment_method: PaymentMethod | null;
  group_preference: GroupPreference;
  group_label: string | null;
  source: string;
  voucher_id: number | null;
  pass_card_id: number | null;
  sale_id: number | null;
  notes: string | null;
  created_at: string;
  customer_name: string | null;
  customer_level: Level | null;
  session_start: string | null;
  site_name: string | null;
  activity_name: string | null;
}

export interface RosterRow {
  booking_id: number;
  reference: string;
  customer_id: number;
  name: string;
  phone: string | null;
  participants: number;
  level: Level;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  wetsuit: string | null;
  board: string | null;
  usual_board: string | null;
  group_preference: GroupPreference;
  group_label: string | null;
  status: BookingStatus;
  paid_cents: number;
  notes: string | null;
}
export interface Roster {
  session_id: number;
  start_at: string;
  capacity: number;
  participants: RosterRow[];
}
export interface GroupProposal {
  session_id: number;
  groups: { label: string; size: number; members: { booking_id: number; customer: string; level: Level; age: number | null; participants: number; preference: GroupPreference; wetsuit: string | null; board: string | null }[] }[];
  rationale: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  category: string;
  price_cents: number;
  cost_cents: number | null;
  vat_rate: number;
  stock: number | null;
  supplier: string | null;
  site_id: number | null;
  activity_id: number | null;
  is_active: boolean;
}
export interface SaleLine {
  id: number;
  label: string;
  kind: string;
  category: string | null;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
  total_cents: number;
}
export interface Sale {
  id: number;
  reference: string;
  site_id: number | null;
  customer_id: number | null;
  channel: string;
  payment_method: PaymentMethod;
  total_cents: number;
  total_vat_cents: number;
  status: string;
  created_at: string;
  lines: SaleLine[];
}

export interface Voucher {
  id: number;
  code: string;
  value_cents: number;
  remaining_cents: number;
  offer_id: number | null;
  buyer_name: string;
  buyer_email: string;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  status: "active" | "used" | "expired" | "cancelled";
  issued_at: string;
  expires_at: string;
}
export interface PassCard {
  id: number;
  code: string;
  customer_id: number;
  offer_id: number;
  activity_id: number;
  total_sessions: number;
  remaining_sessions: number;
  price_cents: number;
  purchased_at: string;
  expires_at: string | null;
  customer_name: string | null;
  activity_name: string | null;
}

export interface DocumentLine {
  label: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: number;
}
export interface Doc {
  id: number;
  number: string;
  kind: DocumentKind;
  status: DocumentStatus;
  customer_id: number | null;
  customer_name: string;
  customer_address: string | null;
  customer_email: string | null;
  sale_id: number | null;
  parent_id: number | null;
  issued_at: string;
  due_at: string | null;
  lines: DocumentLine[];
  total_ht_cents: number;
  total_vat_cents: number;
  total_ttc_cents: number;
  notes: string | null;
}

export interface KPI {
  revenue_today_cents: number;
  revenue_month_cents: number;
  revenue_season_cents: number;
  revenue_year_cents: number;
  customers_count: number;
  bookings_month: number;
  fill_rate_month: number;
  average_basket_cents: number;
  revenue_by_site: { id: number | null; label: string; total_cents: number }[];
  revenue_by_activity: { id: number | null; label: string; total_cents: number }[];
  top_products: { label: string; quantity: number; total_cents: number }[];
  top_slots: { site: string; activity: string; hour: string; sessions: number; participants: number; revenue_cents: number }[];
  upcoming_low_fill: { session_id: number; start_at: string; site: string; activity: string; booked: number; capacity: number; remaining: number }[];
}
export interface RevenueBreakdown {
  granularity: string;
  date_from: string;
  date_to: string;
  total_cents: number;
  series: { period: string; total_cents: number }[];
  by_site: { id: number | null; label: string; total_cents: number }[];
  by_activity: { id: number | null; label: string; total_cents: number }[];
  by_category: { id: string | null; label: string; total_cents: number }[];
}
export interface ProfitabilityRow {
  key: string;
  label: string;
  revenue_cents: number;
  sessions: number;
  customers: number;
  capacity: number;
  fill_rate: number;
  avg_price_cents: number;
  instructor_cost_cents: number;
  product_cost_cents: number;
  margin_cents: number;
  margin_rate: number;
}
export interface AssistantOut {
  answer: string;
  data: unknown;
  intent: string;
  engine: string;
  suggestions: string[];
}

export interface TideEvent {
  id: number;
  site_id: number;
  at: string;
  kind: "high" | "low";
  height_m: number;
  coefficient: number | null;
  source: string;
}
export interface Weather {
  id: number;
  site_id: number;
  at: string;
  wave_height_m: number | null;
  swell_period_s: number | null;
  wind_speed_kmh: number | null;
  wind_direction_deg: number | null;
  air_temp_c: number | null;
  water_temp_c: number | null;
  precipitation_mm: number | null;
  summary: string | null;
  source: string;
}
export interface TideRule {
  id: number;
  site_id: number;
  activity_id: number | null;
  level_min: Level | null;
  level_max: Level | null;
  name: string;
  min_range_m: number | null;
  max_range_m: number | null;
  phase: "any" | "low" | "high" | "rising" | "falling";
  phase_window_hours: number;
  max_wave_height_m: number | null;
  min_wave_height_m: number | null;
  max_wind_kmh: number | null;
  is_active: boolean;
}
export interface ConditionsCheck {
  ok: boolean;
  reasons: string[];
  matched_rules: string[];
  snapshot: {
    at: string;
    tide_height_m: number | null;
    tide_range_m: number | null;
    tide_phase: string | null;
    hours_to_low: number | null;
    hours_to_high: number | null;
    coefficient: number | null;
    wave_height_m: number | null;
    swell_period_s: number | null;
    wind_speed_kmh: number | null;
    wind_direction_deg: number | null;
    air_temp_c: number | null;
    water_temp_c: number | null;
    summary: string | null;
  };
}
