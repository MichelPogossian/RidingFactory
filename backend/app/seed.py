"""Données de démonstration : 2 écoles, 5 activités, tarifs, règles de marée, planning
sur ~3 mois (historique + à venir), clients, réservations, ventes boutique, bons et cartes."""

from __future__ import annotations

import random
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.security import hash_password
from app.models import (
    Activity,
    Booking,
    BookingStatus,
    Customer,
    DocumentKind,
    DocumentStatus,
    GroupPreference,
    Instructor,
    Level,
    Offer,
    OfferKind,
    PaymentMethod,
    Product,
    Sale,
    SaleLine,
    Session,
    SessionStatus,
    Site,
    TidePhase,
    TideRule,
    User,
)
from app.schemas import DocumentIn, DocumentLineIn
from app.services import billing, booking, conditions, tides, weather
from app.services.booking import gen_code, sale_reference, vat_part

PARIS = ZoneInfo("Europe/Paris")
FIRST = ["Léa", "Hugo", "Manon", "Lucas", "Chloé", "Nathan", "Emma", "Louis", "Jade", "Gabriel", "Inès", "Tom", "Zoé", "Arthur", "Camille", "Jules", "Sarah", "Adam", "Lina", "Raphaël", "Anna", "Paul", "Louise", "Maël", "Alice"]
LAST = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier"]


def seed_if_empty(db: DbSession) -> bool:
    if db.scalar(select(User.id).limit(1)):
        return False
    rnd = random.Random(42)

    # --- Utilisateurs
    db.add_all(
        [
            User(email="admin@ridingfactory.fr", full_name="Direction Riding Factory", hashed_password=hash_password("admin123"), role="admin"),
            User(email="accueil@ridingfactory.fr", full_name="Accueil La Pège", hashed_password=hash_password("accueil123"), role="staff"),
        ]
    )

    # --- Sites
    pege = Site(
        name="La Pège", slug="la-pege", city="Saint-Hilaire-de-Riez", address="Plage de la Pège, 85270 Saint-Hilaire-de-Riez",
        latitude=46.7395, longitude=-1.9960, exposure_score=7,
        description="Spot exposé aux houles d'ouest : vagues consistantes, idéal dès le niveau intermédiaire.",
        seo_keywords=["école de surf La Pège", "cours de surf Saint-Hilaire-de-Riez", "surf Vendée"],
    )
    demo = Site(
        name="Les Demoiselles", slug="les-demoiselles", city="Saint-Hilaire-de-Riez", address="Plage des Demoiselles, 85270 Saint-Hilaire-de-Riez",
        latitude=46.7080, longitude=-1.9600, exposure_score=3,
        description="Plage abritée aux vagues douces et régulières : parfaite pour débuter et pour les enfants.",
        seo_keywords=["école de surf Les Demoiselles", "cours de surf débutant Vendée", "surf enfants Saint-Hilaire"],
    )
    db.add_all([pege, demo])
    db.flush()

    # --- Activités
    surf = Activity(name="Surf", slug="surf", category="surf", color="#0ea5e9", default_duration_minutes=90, default_capacity=8, requires_conditions=True, description="Cours collectifs et stages de surf, du débutant au confirmé.")
    paddle = Activity(name="Paddle", slug="paddle", category="paddle", color="#10b981", default_duration_minutes=90, default_capacity=10, requires_conditions=True, description="Balades et initiation stand-up paddle.")
    skate = Activity(name="Skate", slug="skate", category="skate", color="#f59e0b", default_duration_minutes=60, default_capacity=10, requires_conditions=False, description="Skate et surfskate au skatepark.")
    natation = Activity(name="Natation", slug="natation", category="natation", color="#8b5cf6", default_duration_minutes=45, default_capacity=6, requires_conditions=False, description="Cours de natation et aisance aquatique.")
    location = Activity(name="Location de matériel", slug="location", category="location", color="#64748b", default_duration_minutes=120, default_capacity=30, requires_conditions=False, description="Planches, combinaisons, paddles à la demi-journée ou journée.")
    db.add_all([surf, paddle, skate, natation, location])
    db.flush()

    # --- Offres / tarifs
    offers = [
        Offer(activity_id=surf.id, name="Cours de surf – séance 1h30", kind=OfferKind.single, sessions_count=1, price_cents=4500, duration_minutes=90),
        Offer(activity_id=surf.id, name="Stage surf 5 séances", kind=OfferKind.course, sessions_count=5, price_cents=19500, duration_minutes=90, description="5 séances du lundi au vendredi"),
        Offer(activity_id=surf.id, name="Stage surf 3 séances", kind=OfferKind.course, sessions_count=3, price_cents=12500, duration_minutes=90),
        Offer(activity_id=surf.id, name="Carte 5 séances surf", kind=OfferKind.pass_card, sessions_count=5, price_cents=20000, validity_days=365),
        Offer(activity_id=surf.id, name="Carte 10 séances surf", kind=OfferKind.pass_card, sessions_count=10, price_cents=37000, validity_days=365),
        Offer(activity_id=surf.id, name="Carte 20 séances surf", kind=OfferKind.pass_card, sessions_count=20, price_cents=68000, validity_days=540),
        Offer(activity_id=paddle.id, name="Balade paddle 1h30", kind=OfferKind.single, sessions_count=1, price_cents=3500, duration_minutes=90),
        Offer(activity_id=skate.id, name="Cours de skate 1h", kind=OfferKind.single, sessions_count=1, price_cents=2500, duration_minutes=60, min_age=6),
        Offer(activity_id=skate.id, name="Carte 10 séances skate", kind=OfferKind.pass_card, sessions_count=10, price_cents=20000, validity_days=365),
        Offer(activity_id=natation.id, name="Cours de natation 45 min", kind=OfferKind.single, sessions_count=1, price_cents=3000, duration_minutes=45),
        Offer(activity_id=location.id, name="Location planche + combi – 2h", kind=OfferKind.rental, sessions_count=1, price_cents=2500, duration_minutes=120),
        Offer(activity_id=location.id, name="Location paddle – 1h", kind=OfferKind.rental, sessions_count=1, price_cents=1500, duration_minutes=60),
    ]
    db.add_all(offers)
    db.flush()
    single_surf, stage5, stage3, card5, card10 = offers[0], offers[1], offers[2], offers[3], offers[4]

    # --- Moniteurs
    instructors = [
        Instructor(full_name="Maxime Guérin", home_site_id=pege.id, activity_slugs=["surf", "paddle"], hourly_cost_cents=2800),
        Instructor(full_name="Julie Renaud", home_site_id=demo.id, activity_slugs=["surf", "natation"], hourly_cost_cents=2600),
        Instructor(full_name="Théo Blanchard", home_site_id=demo.id, activity_slugs=["surf", "skate"], hourly_cost_cents=2400),
        Instructor(full_name="Clara Morel", home_site_id=pege.id, activity_slugs=["surf", "paddle"], hourly_cost_cents=2700),
    ]
    db.add_all(instructors)
    db.flush()

    # --- Règles de marée / conditions
    db.add_all(
        [
            TideRule(site_id=demo.id, activity_id=surf.id, name="Demoiselles – débutants : marnage 2–4 m, autour de la mi-marée", min_range_m=2.0, max_range_m=4.0, phase=TidePhase.any, max_wave_height_m=1.4, max_wind_kmh=40, level_max=Level.several),
            TideRule(site_id=demo.id, activity_id=surf.id, name="Demoiselles – intermédiaires+ : marnage 2–5 m", min_range_m=2.0, max_range_m=5.0, max_wave_height_m=2.0, max_wind_kmh=45, level_min=Level.intermediate),
            TideRule(site_id=pege.id, activity_id=surf.id, name="La Pège – surf : marnage 3–5,5 m, ±3 h autour de la basse mer", min_range_m=3.0, max_range_m=5.5, phase=TidePhase.low, phase_window_hours=3.0, min_wave_height_m=0.6, max_wave_height_m=2.5, max_wind_kmh=45),
            TideRule(site_id=pege.id, activity_id=surf.id, name="La Pège – surf : marée montante", min_range_m=2.5, phase=TidePhase.rising, min_wave_height_m=0.5, max_wave_height_m=2.5, max_wind_kmh=45),
            TideRule(site_id=pege.id, activity_id=paddle.id, name="La Pège – paddle : mer calme", max_wave_height_m=0.9, max_wind_kmh=25),
            TideRule(site_id=demo.id, activity_id=paddle.id, name="Demoiselles – paddle : mer calme", max_wave_height_m=1.0, max_wind_kmh=28),
        ]
    )
    db.flush()

    # --- Marées & météo sur toute la période
    today = date.today()
    d_from, d_to = today - timedelta(days=75), today + timedelta(days=21)
    for site in (pege, demo):
        tides.sync_tides(db, site, d_from, d_to)
        weather.sync_weather(db, site, d_from, d_to)

    # --- Clients
    customers: list[Customer] = []
    for i in range(60):
        fn, ln = rnd.choice(FIRST), rnd.choice(LAST)
        lvl = rnd.choices(list(Level), weights=[35, 20, 20, 17, 8])[0]
        age = rnd.randint(8, 58)
        height = rnd.randint(125, 190) if age > 12 else rnd.randint(120, 160)
        weight = round(height * 0.42 - 20 + rnd.uniform(-8, 12), 1)
        customers.append(
            Customer(
                first_name=fn, last_name=ln, email=f"{fn.lower()}.{ln.lower()}{i}@example.com".replace("é", "e").replace("ë", "e").replace("ï", "i"),
                phone=f"06{rnd.randint(10000000, 99999999)}", birth_date=today - timedelta(days=age * 365 + rnd.randint(0, 364)),
                weight_kg=weight, height_cm=height, level=lvl,
                board_type=rnd.choice([None, "Mousse", "Mini-malibu", "Longboard", "Shortboard"]) if lvl != Level.beginner else None,
                practice_frequency=rnd.choice(["Jamais", "Vacances", "Quelques fois par an", "Chaque mois", "Chaque semaine"]),
                marketing_consent=rnd.random() < 0.6,
                created_at=datetime.now(UTC) - timedelta(days=rnd.randint(0, 120)),
            )
        )
    db.add_all(customers)
    db.flush()

    # --- Planning : créneaux passés (historique) et à venir
    sessions: list[Session] = []
    surf_times = ["09:00", "10:30", "14:00", "15:30", "17:00"]
    day = d_from
    idx = 0
    while day <= d_to:
        wd = day.weekday()
        is_summer = day.month in (7, 8)
        for site in (pege, demo):
            for hhmm in surf_times:
                if not is_summer and hhmm in ("10:30", "15:30") and wd < 5:
                    continue  # hors été : moins de créneaux en semaine
                h, m = (int(x) for x in hhmm.split(":"))
                start = datetime.combine(day, time(h, m), tzinfo=PARIS).astimezone(UTC)
                lvl_min, lvl_max = (Level.beginner, Level.several) if site is demo else (Level.several, Level.advanced)
                if hhmm == "17:00":
                    lvl_min, lvl_max = Level.beginner, Level.advanced
                chk = conditions.check(db, site.id, start, surf.id, lvl_min)
                if not chk.ok and rnd.random() < 0.85:
                    continue  # la marée/météo ne permet pas ce créneau
                is_stage = hhmm == "09:00" and wd == 0 and rnd.random() < 0.5
                s = Session(
                    site_id=site.id, activity_id=surf.id, instructor_id=instructors[idx % 4].id, offer_id=(stage5.id if is_stage else single_surf.id),
                    start_at=start, end_at=start + timedelta(minutes=90), capacity=8, price_cents=4500, level_min=lvl_min, level_max=lvl_max,
                    status=SessionStatus.done if start < datetime.now(UTC) else SessionStatus.scheduled,
                    title="Stage surf 5 séances" if is_stage else None, conditions_ok=chk.ok, conditions_note="; ".join(chk.reasons)[:255],
                )
                sessions.append(s)
                idx += 1
            # Paddle le matin, 3 jours / semaine
            if wd in (1, 3, 5):
                start = datetime.combine(day, time(10, 0), tzinfo=PARIS).astimezone(UTC)
                chk = conditions.check(db, site.id, start, paddle.id, None)
                if chk.ok or rnd.random() < 0.2:
                    sessions.append(Session(site_id=site.id, activity_id=paddle.id, instructor_id=instructors[0 if site is pege else 3].id, offer_id=offers[6].id, start_at=start, end_at=start + timedelta(minutes=90), capacity=10, price_cents=3500, level_min=Level.beginner, level_max=Level.advanced, status=SessionStatus.done if start < datetime.now(UTC) else SessionStatus.scheduled, conditions_ok=chk.ok, conditions_note="; ".join(chk.reasons)[:255]))
        # Skate (Demoiselles) mercredi & samedi, natation (Demoiselles) mardi & jeudi
        if wd in (2, 5):
            start = datetime.combine(day, time(11, 0), tzinfo=PARIS).astimezone(UTC)
            sessions.append(Session(site_id=demo.id, activity_id=skate.id, instructor_id=instructors[2].id, offer_id=offers[7].id, start_at=start, end_at=start + timedelta(minutes=60), capacity=10, price_cents=2500, level_min=Level.beginner, level_max=Level.advanced, status=SessionStatus.done if start < datetime.now(UTC) else SessionStatus.scheduled, conditions_ok=True, conditions_note="Activité indépendante des conditions"))
        if wd in (1, 3):
            start = datetime.combine(day, time(18, 0), tzinfo=PARIS).astimezone(UTC)
            sessions.append(Session(site_id=demo.id, activity_id=natation.id, instructor_id=instructors[1].id, offer_id=offers[9].id, start_at=start, end_at=start + timedelta(minutes=45), capacity=6, price_cents=3000, level_min=Level.beginner, level_max=Level.advanced, status=SessionStatus.done if start < datetime.now(UTC) else SessionStatus.scheduled, conditions_ok=True, conditions_note="Activité indépendante des conditions"))
        day += timedelta(days=1)
    db.add_all(sessions)
    db.flush()

    # --- Réservations + ventes (historique dense, futur partiel)
    now = datetime.now(UTC)
    for s in sessions:
        past = s.start_at < now
        # taux de remplissage cible : forte affluence l'été et les week-ends, plus faible en semaine hors saison
        base = 0.75 if s.start_at.month in (7, 8) else 0.45
        if s.start_at.weekday() >= 5:
            base += 0.15
        if s.start_at.astimezone(PARIS).hour in (10, 14):
            base += 0.1
        target = base if past else base * 0.45
        seats = s.capacity
        booked = 0
        while booked < seats and rnd.random() < target:
            c = rnd.choice(customers)
            n = rnd.choices([1, 2, 3, 4], weights=[60, 25, 10, 5])[0]
            n = min(n, seats - booked)
            price = s.price_cents * n
            method = rnd.choices([PaymentMethod.card_online, PaymentMethod.card_terminal, PaymentMethod.cash], weights=[65, 25, 10])[0]
            if s.start_at > now:  # réservation à venir : vendue au cours des dernières semaines
                created = now - timedelta(days=rnd.randint(0, 25), hours=rnd.randint(1, 12))
            else:
                created = s.start_at - timedelta(days=rnd.randint(0, 20), hours=rnd.randint(0, 12))
            sale = Sale(reference=sale_reference() + f"{rnd.randint(100, 999)}", site_id=s.site_id, customer_id=c.id, channel="online" if method == PaymentMethod.card_online else "counter", payment_method=method, total_cents=price, total_vat_cents=vat_part(price, 20.0), status="paid", created_at=created)
            db.add(sale)
            db.flush()
            db.add(SaleLine(sale_id=sale.id, label=f"{s.activity.name if s.activity else 'Cours'} – {s.start_at:%d/%m %H:%M}", kind="course" if s.title else "session", category="stage" if s.title else "cours", offer_id=s.offer_id, activity_id=s.activity_id, site_id=s.site_id, quantity=n, unit_price_cents=s.price_cents, vat_rate=20.0, total_cents=price))
            db.add(
                Booking(
                    reference=gen_code("RF", 6), customer_id=c.id, session_id=s.id, participants=n,
                    status=BookingStatus.confirmed if (not past or rnd.random() > 0.04) else BookingStatus.no_show,
                    price_cents=price, paid_cents=price, payment_method=method,
                    group_preference=rnd.choices(list(GroupPreference), weights=[50, 15, 5, 10, 10, 5, 5])[0],
                    source=sale.channel, sale_id=sale.id, created_at=created,
                )
            )
            booked += n
    db.flush()

    # --- Produits boutique
    products = [
        Product(name="Crème solaire SPF50 – 100 ml", sku="CS-50", category="creme_solaire", price_cents=1490, cost_cents=700, vat_rate=20, stock=48, supplier="EQ Love"),
        Product(name="Stick solaire SPF50", sku="CS-STICK", category="creme_solaire", price_cents=990, cost_cents=450, vat_rate=20, stock=60, supplier="EQ Love"),
        Product(name="Sweatshirt Riding Factory", sku="TX-SWEAT", category="vetements", price_cents=5500, cost_cents=2200, vat_rate=20, stock=25, supplier="Stanley/Stella"),
        Product(name="T-shirt Riding Factory", sku="TX-TEE", category="vetements", price_cents=2500, cost_cents=900, vat_rate=20, stock=40, supplier="Stanley/Stella"),
        Product(name="Casquette", sku="TX-CAP", category="vetements", price_cents=2200, cost_cents=800, vat_rate=20, stock=30),
        Product(name="Wax tropicale", sku="AC-WAX", category="accessoires", price_cents=350, cost_cents=150, vat_rate=20, stock=100),
        Product(name="Leash 8'", sku="AC-LEASH", category="accessoires", price_cents=2900, cost_cents=1400, vat_rate=20, stock=12),
        Product(name="Poncho", sku="AC-PONCHO", category="accessoires", price_cents=3900, cost_cents=1800, vat_rate=20, stock=15),
        Product(name="Gourde isotherme", sku="BQ-GOURDE", category="boutique", price_cents=1900, cost_cents=800, vat_rate=20, stock=20),
    ]
    db.add_all(products)
    db.flush()
    # Ventes boutique historiques
    for _ in range(140):
        p = rnd.choice(products)
        n = rnd.choices([1, 2, 3], weights=[75, 20, 5])[0]
        site = rnd.choice([pege, demo])
        created = now - timedelta(days=rnd.randint(0, 74), hours=rnd.randint(1, 10))
        total = p.price_cents * n
        sale = Sale(reference=sale_reference() + f"{rnd.randint(100, 999)}", site_id=site.id, channel="counter", payment_method=rnd.choice([PaymentMethod.card_terminal, PaymentMethod.cash]), total_cents=total, total_vat_cents=vat_part(total, p.vat_rate), status="paid", created_at=created)
        db.add(sale)
        db.flush()
        db.add(SaleLine(sale_id=sale.id, label=p.name, kind="product", category=p.category, product_id=p.id, site_id=site.id, quantity=n, unit_price_cents=p.price_cents, vat_rate=p.vat_rate, total_cents=total, cost_cents=(p.cost_cents or 0) * n))
    db.flush()

    # --- Bons cadeaux & cartes
    for i in range(6):
        c = rnd.choice(customers)
        booking.sell_voucher(db, value_cents=rnd.choice([4500, 9000, 12500, 19500]), offer_id=None, buyer_name=f"{c.first_name} {c.last_name}", buyer_email=c.email, recipient_name=rnd.choice(FIRST), recipient_email=None, message="Joyeux anniversaire !", payment_method=PaymentMethod.card_terminal, validity_months=12, channel="online" if i % 2 else "counter", site_id=None)
    for c in rnd.sample(customers, 5):
        card = booking.sell_pass_card(db, customer=c, offer=rnd.choice([card5, card10]), payment_method=PaymentMethod.card_terminal, channel="counter")
        card.remaining_sessions -= rnd.randint(0, 3)

    # --- Documents : un devis groupe + une facture
    grp = rnd.choice(customers)
    billing.create_document(db, DocumentIn(kind=DocumentKind.quote, customer_id=grp.id, customer_name="Comité d'entreprise Océanis", customer_address="12 rue des Sables\n85800 Saint-Gilles-Croix-de-Vie", customer_email="ce@oceanis.example", lines=[DocumentLineIn(label="Initiation surf – groupe 16 personnes", quantity=16, unit_price_cents=3750, vat_rate=20), DocumentLineIn(label="Location combinaisons", quantity=16, unit_price_cents=500, vat_rate=20)], notes="Séance de team-building, date à convenir en septembre."))
    inv = billing.create_document(db, DocumentIn(kind=DocumentKind.invoice, customer_id=None, customer_name="Camping Les Dunes", customer_address="Route de la plage\n85270 Saint-Hilaire-de-Riez", customer_email="contact@lesdunes.example", lines=[DocumentLineIn(label="Stage surf 5 séances – partenariat camping", quantity=6, unit_price_cents=16250, vat_rate=20)]))
    inv.status = DocumentStatus.sent

    db.commit()
    return True
