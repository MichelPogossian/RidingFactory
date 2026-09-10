# Riding Factory – Gestion, réservation & pilotage

Logiciel de gestion pour les écoles de surf **Riding Factory** (La Pège & Les Demoiselles,
Saint-Hilaire-de-Riez). Multi-activités (surf, paddle, skate, natation, location),
multi-sites, réservation en ligne pilotée par les marées et la météo, caisse, bons cadeaux,
cartes multi-séances, devis / factures, analyses de rentabilité et assistant IA.

## Architecture

```
RidingFactory/
├─ docker-compose.yml       # PostgreSQL 16 (+ profil "full" : backend & frontend conteneurisés)
├─ backend/                 # FastAPI · SQLAlchemy 2 · Pydantic v2 · PostgreSQL
│  └─ app/
│     ├─ main.py            # application, CORS, création du schéma + seed démo au démarrage
│     ├─ models.py          # modèle de données (sites, activités, créneaux, réservations, ventes…)
│     ├─ schemas.py         # contrats d'API
│     ├─ api/               # routeurs : auth, catalog, public, planning, bookings, pos, documents, insights, conditions
│     ├─ services/
│     │  ├─ tides.py        # marées (modèle harmonique, WorldTides en option), règle des douzièmes
│     │  ├─ weather.py      # Open-Meteo (marine + prévisions), repli synthétique
│     │  ├─ conditions.py   # moteur de règles marnage / phase / houle / vent par site·activité·niveau
│     │  ├─ availability.py # créneaux réellement disponibles + recommandation de site
│     │  ├─ planning.py     # génération des créneaux d'une semaine sous contrainte de conditions
│     │  ├─ booking.py      # réservation (paiement, bons, cartes, ventes), vente bons & cartes
│     │  ├─ billing.py      # devis / factures / avoirs, numérotation continue, rendu HTML
│     │  ├─ analytics.py    # CA, remplissage, meilleurs créneaux, rentabilité
│     │  └─ assistant.py    # assistant IA (moteur d'intentions FR + LLM optionnel), groupes, matériel
│     └─ seed.py            # jeu de données de démonstration (une saison complète)
└─ frontend/                # React 18 · Vite · TypeScript · Tailwind · TanStack Query · Recharts
   └─ src/
      ├─ pages/public/      # site vitrine + parcours de réservation, bons cadeaux, cartes
      └─ pages/admin/       # back-office : dashboard, planning, réservations, clients, caisse,
                            # produits, bons, cartes, devis/factures, analyses, marées & météo,
                            # assistant IA, catalogue (sites / activités / tarifs / moniteurs)
```

## Démarrage rapide

Prérequis : Docker, Python ≥ 3.12 (via [uv](https://docs.astral.sh/uv/) recommandé), Node ≥ 20.

```bash
# 1. Base de données
docker compose up -d db                     # PostgreSQL sur localhost:5433

# 2. Backend
cd backend
cp .env.example .env
uv venv --python 3.12 && uv pip install -e .
.venv/bin/uvicorn app.main:app --reload     # http://localhost:8000  ·  docs : /docs

# 3. Frontend
cd ../frontend
npm install
npm run dev                                 # http://localhost:5173 (proxy /api → :8000)
```

Au premier démarrage, le schéma est créé et un jeu de données de démonstration est injecté
(`SEED_ON_STARTUP=true`) : deux écoles, activités, tarifs, moniteurs, règles de marée,
une saison de créneaux et de ventes, clients, bons, cartes, factures.

Tout-en-un conteneurisé : `docker compose --profile full up --build`.

### Comptes de démonstration

| Rôle       | E-mail                      | Mot de passe |
|------------|-----------------------------|--------------|
| Direction  | admin@ridingfactory.fr      | admin123     |
| Accueil    | accueil@ridingfactory.fr    | accueil123   |

Back-office : `http://localhost:5173/admin` · Site public : `http://localhost:5173`.

## Variables d'environnement (backend/.env)

| Variable              | Rôle                                                                  |
|-----------------------|-----------------------------------------------------------------------|
| `DATABASE_URL`        | `postgresql+psycopg://riding:riding@localhost:5433/ridingfactory`      |
| `SECRET_KEY`          | Signature des JWT (à changer en production)                           |
| `SEED_ON_STARTUP`     | Injecte les données démo si la base est vide                          |
| `CORS_ORIGINS`        | Origines autorisées (séparées par des virgules)                       |
| `OPENAI_API_KEY`      | Optionnel : reformulation des réponses de l'assistant IA par un LLM    |
| `STRIPE_SECRET_KEY`   | Optionnel : paiement CB réel (sinon paiement simulé)                  |
| `WORLDTIDES_API_KEY`  | Optionnel : marées officielles (sinon modèle harmonique)              |
| `COMPANY_*`           | Mentions légales des factures (raison sociale, SIRET, TVA, adresse…)  |

## Fonctionnement métier

- **Créneaux** : générés par semaine, par site et activité, à partir des horaires souhaités ;
  chaque créneau est validé contre les **règles de faisabilité** (marnage min/max, phase de marée
  ± fenêtre, houle, vent, activité, plage de niveaux). Le client ne voit que les créneaux
  réellement disponibles et adaptés à son niveau.
- **Orientation automatique** : les débutants sont orientés vers Les Demoiselles, les niveaux
  avancés vers La Pège, en tenant compte des conditions prévues (score par site).
- **Groupes** : proposition automatique de groupes homogènes (niveau, âge, préférence
  adulte / enfant / famille), suggestion de combinaison et de planche selon taille / poids / niveau.
- **Ventes** : la caisse, la réservation en ligne, les bons cadeaux et les cartes 5/10/20 séances
  alimentent une source unique (`sale_lines`, montants en centimes, TVA par ligne) utilisée par
  toutes les analyses.
- **Facturation** : devis → facture → avoir, numérotation continue par type et année
  (`D-`, `F-`, `A-AAAA-NNNNN`), mentions légales, export CSV comptable.
- **Pilotage** : CA par période / site / activité / catégorie, taux de remplissage, meilleurs
  créneaux, rentabilité (CA − coût moniteur × durée − coût produits) par activité, site ou horaire.
- **Assistant IA** : questions en français (« Quels sont mes créneaux les plus rentables ? »,
  « Quelle école fonctionne le mieux en septembre ? », « Où ai-je le plus de places mercredi ? »…)
  répondues à partir des données réelles, reformulées par un LLM si une clé OpenAI est fournie.

## Déploiement sur Render

Le fichier `render.yaml` décrit un Blueprint : PostgreSQL 16, API FastAPI, front statique.

1. Poussez `main` sur GitHub (déjà le cas si vous avez suivi le push).
2. Sur [Render](https://dashboard.render.com) : **New → Blueprint** → sélectionnez le dépôt `RidingFactory`.
3. Appliquez le Blueprint (région **Frankfurt**).
4. Attendez le premier deploy : le seed démo tourne au boot de l’API (quelques dizaines de secondes).

URLs typiques :

- Front : `https://ridingfactory-web.onrender.com`
- API / docs : `https://ridingfactory-api.onrender.com/docs`

Comptes démo inchangés : `admin@ridingfactory.fr` / `admin123`.

Si le front appelle encore `localhost` ou si le CORS bloque, dans le dashboard :

- **ridingfactory-web** → `VITE_API_URL` = `https://ridingfactory-api.onrender.com` puis **Manual Deploy → Clear build cache & deploy**
- **ridingfactory-api** → `CORS_ORIGINS` = `https://ridingfactory-web.onrender.com`

Clés optionnelles (Environment de l’API) : `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `WORLDTIDES_API_KEY`.

Le plan **free** de l’API s’endort après inactivité (~1 min au réveil). Pour une école en saison, passez le service `ridingfactory-api` en **starter**. Postgres `basic-256mb` est requis (plus de Postgres gratuit chez Render).

Domaine custom : Dashboard → service front → **Custom domains**, puis ajoutez la même origine dans `CORS_ORIGINS`.

## Vérification

```bash
cd backend && .venv/bin/python -c "import app.main"      # import & config
cd frontend && npx tsc --noEmit && npm run build          # typage & build
```

## Pistes d'évolution

Migrations Alembic, paiement Stripe en production, marées officielles (SHOM / WorldTides),
e-mails de confirmation, application mobile moniteurs, SEO avancé (pages par activité / site).
