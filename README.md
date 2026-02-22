# PatriEats

A personalised AI meal planner for plant-based eaters. Set your diet, goals, and preferences — the app generates a 7-day meal plan, tracks your pantry, and produces a shopping list for what's missing. Save any AI-generated meal you love with one click; future plans get smarter every time you do.

---

## MVP Features

| # | Feature | Description |
|---|---|---|
| 1 | **Auth** | Sign in with Google via Firebase |
| 2 | **Preferences** | Diet type, calorie target, excluded ingredients, free-text notes |
| 3 | **Meal Plan Generator** | 7-day plan via Claude Sonnet, tabbed day view with nutrition strip |
| 4 | **My Recipes** | Save any AI-generated meal with one click into your personal collection |
| 5 | **Pantry + Shopping List** | Maintain pantry items; get a "what's missing" list on plan generation |
| 6 | **Personalisation** | Behaviour signals feed a taste profile injected into every generation prompt |

---

## Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 (App Router), TypeScript strict, Tailwind CSS v4, ShadCN/UI, TanStack Query v5, Firebase Auth, React Hook Form + Zod |
| **Backend** | FastAPI, Pydantic v2, SQLAlchemy 2.0 async (asyncpg), Alembic |
| **AI — Generation** | Anthropic Claude Sonnet (vivid descriptions, strict JSON output) |
| **AI — Retrieval** | Gemini 2.0 Flash File Search (global + per-user recipe corpora) |
| **AI — Embeddings** | Gemini text-embedding-004 → pgvector (recipe semantic search only) |
| **Database** | PostgreSQL 16 + pgvector extension |
| **Cache** | Redis via Upstash (rate limiting) |
| **Auth** | Firebase Authentication (Google OAuth) |
| **Infra** | Google Cloud Run (API), Firebase Hosting (frontend), Cloud SQL, GCS, Secret Manager |

---

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker + Docker Compose
- A Firebase project with Google OAuth enabled
- A Firebase service account JSON (download from Firebase console → Project Settings → Service Accounts)

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

Edit `backend/.env` and fill in your values:

```bash
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/mealplanner
REDIS_URL=rediss://...          # Upstash TLS URL

ENVIRONMENT=development
CORS_ORIGINS=["http://localhost:3000"]
```

Place your Firebase service account file at `backend/firebase-service-account.json` (git-ignored).

### 3. Frontend environment

```bash
cp frontend/.env.local.example frontend/.env.local   # if example exists, otherwise create it
```

Edit `frontend/.env.local`:

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

This starts PostgreSQL 16 with the pgvector extension available on `localhost:5432`.

### 5. Backend — install dependencies & run migrations

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

alembic upgrade head
```

This creates all 9 tables and enables the `vector` extension:

| Table | Purpose |
|---|---|
| `users` | Created on first Firebase login |
| `user_preferences` | Diet type, calorie target, exclusions |
| `meal_plans` | Full 7-day plan JSON blobs |
| `generated_meals` | Individual meals flattened from each plan (queryable rows) |
| `user_recipes` | Saved recipes — bookmarked AI meals (+ pgvector embedding column) |
| `pantry_items` | User's pantry |
| `shopping_lists` | Auto-generated "what's missing" lists |
| `user_signals` | Append-only behaviour event log (powers personalisation) |
| `user_taste_profiles` | Materialised taste profile rebuilt from signals; injected into every Claude prompt |

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

**Option B — Docker Compose (full stack)**

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
│   │   ├── layout.tsx                 # Root layout — fonts, providers
│   │   ├── page.tsx                   # Landing page
│   │   ├── (auth)/login/page.tsx      # Google sign-in
│   │   └── (app)/                     # Protected routes (auth required)
│   ├── components/                    # UI components by feature
│   ├── lib/
│   │   ├── firebase.ts                # Firebase client init
│   │   ├── api.ts                     # Typed fetch wrapper (attaches Bearer token)
│   │   └── utils.ts
│   └── package.json
│
├── backend/                           # FastAPI
│   ├── main.py                        # App entry — CORS, router registration, lifespan
│   ├── core/
│   │   ├── config.py                  # pydantic-settings — reads backend/.env
│   │   └── auth.py                    # Firebase token verification dependency
│   ├── models/                        # SQLAlchemy 2.0 ORM models (one file per domain)
│   │   ├── base.py
│   │   ├── user.py                    # User, UserPreferences
│   │   ├── meal_plan.py               # MealPlan, GeneratedMeal
│   │   ├── recipe.py                  # UserRecipe (+ Vector(768) embedding)
│   │   ├── pantry.py                  # PantryItem, ShoppingList
│   │   └── signals.py                 # UserSignal, UserTasteProfile
│   ├── schemas/                       # Pydantic v2 request/response schemas
│   │   ├── user.py
│   │   ├── meal_plan.py
│   │   ├── recipe.py
│   │   ├── pantry.py
│   │   └── signals.py
│   ├── routers/                       # FastAPI routers (one per feature)
│   │   └── auth.py                    # GET /auth/me
│   ├── db/
│   │   ├── session.py                 # Async session factory
│   │   └── migrations/                # Alembic — versioned schema migrations
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker-compose.yml
└── README.md
```

---

## Database Migrations

```bash
cd backend
source venv/bin/activate

# Apply all pending migrations
alembic upgrade head

# Generate a new migration after changing models
alembic revision --autogenerate -m "describe your change"

# Roll back one step
alembic downgrade -1

# Check for unapplied changes
alembic check
```

---

## API Overview

All endpoints require `Authorization: Bearer {firebase_id_token}`.

```
GET  /health                        → {"status": "ok"}
GET  /auth/me                       → User profile (creates user on first call)

GET  /users/preferences             → Current preferences
PUT  /users/preferences             → Update preferences

POST /meal-plans/generate           → Generate 7-day AI plan
GET  /meal-plans                    → List saved plans
POST /meal-plans/{id}/save          → Persist plan + flatten into generated_meals
GET  /meal-plans/{id}/meals         → All generated_meals rows for a plan

GET  /recipes                       → Saved recipe collection
POST /recipes/save-from-plan        → Bookmark a generated meal → user_recipes
GET  /recipes/search?q=             → pgvector semantic search

GET  /pantry                        → List pantry items
POST /pantry                        → Add item
PUT  /pantry/{id}                   → Update item
DELETE /pantry/{id}                 → Remove item

POST /shopping/generate             → Plan vs pantry diff → shopping list
GET  /shopping/{id}                 → Get list
PATCH /shopping/{id}/items/{item_id} → Toggle item checked
```

---

## Build Status

| Phase | Status |
|---|---|
| Phase 1 — Foundation (auth, health, DB, login page) | ✅ Done |
| Phase 2 — Data layer (all tables, migrations, preferences, pantry) | 🔄 In progress |
| Phase 3 — AI core (retrieval, generation, personalisation pipeline) | ⬜ Pending |
| Phase 4 — Meal plan UI (cards, tabs, bookmark flow) | ⬜ Pending |
| Phase 5 — Recipes, shopping, full signal coverage | ⬜ Pending |
| Phase 6 — Production deploy (Cloud Run, Cloud SQL, Firebase Hosting) | ⬜ Pending |
