# Nouri

A personalised AI meal planner for plant-based eaters. Set your diet, goals, and preferences — the app generates a 7-day meal plan, lets you review and approve it, schedule it on a calendar, track your pantry, and produce a shopping list for what's missing. Save any AI-generated meal you love with one click; future plans get smarter every time you interact.

---

## Features

| Area | What you can do |
|---|---|
| **Auth** | Sign in with Google via Firebase |
| **Preferences** | Diet type, calorie target, excluded ingredients, free-text notes |
| **Meal plan generator** | 7-day plan via Claude Sonnet — weekly grid, day tabs, per-day nutrition, extras (morning juice, snacks, evening tea), juicing mode |
| **Plan lifecycle** | Save to history, review meals (accept / edit / swap), approve all or one-by-one, clone approved plans, print / PDF export |
| **Calendar** | Schedule any saved plan to a week; click meals for an in-page recipe preview (Firestore sync) |
| **My Recipes** | Bookmark AI meals, semantic search, import from text or photo, expand to full recipe |
| **Pantry + shopping** | Maintain pantry items; generate a shopping list from plan ingredients + bookmarked recipes |
| **Personalisation** | Behaviour signals feed a taste profile injected into every generation prompt |

---

## Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, TanStack Query v5, Firebase Auth |
| **Backend** | FastAPI, Pydantic v2, SQLAlchemy 2.0 async (asyncpg), Alembic |
| **AI — Generation** | Anthropic Claude Sonnet (structured JSON meal plans, vivid descriptions) |
| **AI — Embeddings** | Gemini text-embedding-004 → pgvector (recipe semantic search) |
| **AI — Import** | Gemini (extract recipe from text/image) |
| **Database** | PostgreSQL 16 + pgvector |
| **Cache** | Upstash Redis (rate limiting; optional locally) |
| **Realtime** | Firestore (calendar week assignments) |
| **Auth** | Firebase Authentication (Google OAuth) |
| **Infra (target)** | Google Cloud Run (API), Firebase Hosting (frontend), Cloud SQL, Secret Manager |

Context for generation is loaded from PostgreSQL (user recipes, taste profile, pantry, preferences) and injected directly into the Claude prompt — no separate retrieval layer.

---

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker + Docker Compose
- A Firebase project with Google OAuth and Firestore enabled
- Firebase service account JSON (Project Settings → Service Accounts)

---

## Local Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd mealplanner
```

### 2. Backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` — minimum for local dev:

```bash
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'   # single-line JSON

DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/mealplanner

ENVIRONMENT=development
CORS_ORIGINS=["http://localhost:3000"]
INTERNAL_SECRET=any-random-string-for-local-dev
```

`UPSTASH_REDIS_URL` is optional locally — rate limiting is skipped when unset.

Alternatively, place the service account file on disk and set `FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json` if your local config supports it.

### 3. Frontend environment

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### 4. Start the database

```bash
docker compose up db -d
```

PostgreSQL 16 with pgvector on `localhost:5432`.

### 5. Backend — install dependencies & run migrations

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

alembic upgrade head
```

Core tables:

| Table | Purpose |
|---|---|
| `users` | Created on first Firebase login |
| `user_preferences` | Diet type, calorie target, exclusions |
| `meal_plans` | Full 7-day plan JSON + status, name, scheduled week |
| `generated_meals` | Individual meals flattened from each plan (review, bookmark) |
| `user_recipes` | Saved recipes — bookmarked AI meals (+ pgvector embedding) |
| `pantry_items` | User's pantry |
| `shopping_lists` | Auto-generated "what's missing" lists |
| `user_signals` | Append-only behaviour event log |
| `user_taste_profiles` | Materialised taste profile for Claude prompts |

### 6. Frontend — install dependencies

```bash
cd frontend
npm install
```

---

## Running Locally

**Option A — separate processes (recommended for development)**

```bash
# Terminal 1 — API
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

**Option B — Docker Compose (API + DB)**

```bash
docker compose up
```

Then open:

- Frontend → [http://localhost:3000](http://localhost:3000)
- API docs → [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check → [http://localhost:8000/health](http://localhost:8000/health)

---

## Project Structure

```
mealplanner/
├── frontend/                          # Next.js 15 App Router
│   ├── app/
│   │   ├── (auth)/login/              # Google sign-in
│   │   └── (dashboard)/               # Protected routes
│   │       ├── meal-plan/             # Generate + weekly grid
│   │       ├── meal-plan/[id]/        # Saved plan — review, approve, print
│   │       ├── history/               # Plan history — schedule, clone
│   │       ├── calendar/              # Week view + meal detail panel
│   │       ├── recipes/               # Collection + import
│   │       ├── pantry/
│   │       ├── shopping/
│   │       └── preferences/
│   ├── components/meal-plan/          # GenerateForm, WeeklyPlanGrid, ReviewMealCard, …
│   └── lib/
│       ├── firebase.ts                # Firebase Auth + Firestore
│       ├── calendar.ts                # Calendar week sync
│       ├── api/                       # TanStack Query hooks per domain
│       └── meal-plan-utils.ts         # Week dates, schedule entries, saved state
│
├── backend/                           # FastAPI
│   ├── main.py                        # App entry — CORS, routers, lifespan
│   ├── core/                          # config, auth, rate limiting
│   ├── models/                        # SQLAlchemy ORM (one file per domain)
│   ├── schemas/                       # Pydantic request/response schemas
│   ├── routers/                       # auth, preferences, meal_plans, recipes, …
│   ├── services/
│   │   ├── ai/                        # orchestrator, claude_generator, …
│   │   ├── meal_plan_service.py
│   │   ├── recipe_service.py
│   │   ├── shopping_service.py
│   │   └── signal_service.py
│   └── db/migrations/                 # Alembic versioned migrations
│
├── docs/                              # NEXT_STEPS.md, architecture notes
├── docker-compose.yml
└── README.md
```

---

## Database Migrations

```bash
cd backend
source venv/bin/activate

alembic upgrade head                              # Apply all pending
alembic revision --autogenerate -m "describe change" # New migration
alembic downgrade -1                              # Roll back one step
alembic check                                     # Detect unapplied model drift
```

---

## API Overview

All endpoints require `Authorization: Bearer {firebase_id_token}` unless noted.

```
GET  /health                              → {"status": "ok"}

GET  /auth/me                             → User profile (creates user on first call)

GET  /users/preferences                   → Current preferences
PUT  /users/preferences                   → Update preferences

POST /meal-plans/generate                 → Generate 7-day AI plan
GET  /meal-plans                          → List saved plans (?status=approved)
GET  /meal-plans/{id}                     → Single plan
POST /meal-plans/{id}/save                → Persist + sync generated_meals rows
DELETE /meal-plans/{id}                   → Delete plan
PATCH /meal-plans/{id}                    → Update name, status, scheduled_week
POST /meal-plans/{id}/approve             → Approve plan (?accept_all in body)
POST /meal-plans/{id}/clone               → Clone to a new week
PATCH /meal-plans/{id}/schedule           → Assign plan to calendar week
POST /meal-plans/{id}/regenerate-day      → Regenerate one day
GET  /meal-plans/{id}/meals               → All generated_meals for review
PATCH /meal-plans/{id}/meals/{meal_id}    → Accept or edit a meal
POST /meal-plans/{id}/meals/{meal_id}/swap → AI swap a meal slot

GET  /generated-meals                     → Cross-plan meal query (?saved=true)

GET  /recipes                             → Saved recipes (?origin_plan_id=)
GET  /recipes/search?q=                   → pgvector semantic search
POST /recipes/save-from-plan              → Bookmark a meal → user_recipes
GET  /recipes/{id}                        → Recipe detail
GET  /recipes/{id}/expand                 → Full ingredients + steps (AI expand)
DELETE /recipes/{id}                      → Soft-delete recipe
POST /recipes/import/extract              → Extract draft from text/image
POST /recipes/import/confirm              → Save imported recipe

GET  /pantry                              → List pantry items
POST /pantry                              → Add item
PUT  /pantry/{id}                         → Update item
DELETE /pantry/{id}                       → Remove item

POST /shopping/generate                   → Plan vs pantry → shopping list
GET  /shopping/{id}                       → Get list
PATCH /shopping/{id}/items/{item_idx}     → Toggle item checked
DELETE /shopping/{id}                     → Delete list

POST /internal/rebuild-profiles           → Nightly taste profile rebuild (secret/OIDC)
```

Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs) (disabled in production).

---

## Build Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation — auth, health, DB, login | ✅ Done |
| 2 | Data layer — models, migrations, preferences, pantry | ✅ Done |
| 3 | AI core — Claude generation, taste profile, signals | ✅ Done |
| 4 | Meal plan UI — generate, grid, bookmark, history | ✅ Done |
| 5 | Recipes, shopping, import, semantic search | ✅ Done |
| 6 | Production deploy — Cloud Run, Cloud SQL, Firebase Hosting | 🔄 In progress |
| 7 | Plan review & approval lifecycle | ✅ Done |
| 8 | Extras, juicing mode, per-day nutrition | ✅ Done |
| 9 | Calendar view + Firestore sync | ✅ Done |

See [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) for the active backlog and deployment checklist.

---

## License

Private project — all rights reserved.
