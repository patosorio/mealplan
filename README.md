# Meal Planner

A personalised AI meal planner for plant-based eaters. You set your diet, goals, and preferences; the app generates a 7-day meal plan, keeps track of your pantry, and spits out a shopping list for what you’re missing. You can save your own recipes and one-click save any AI-generated meal so future plans get smarter.

**Status:** Not built yet — implementation about to start.

---

## MVP scope

- **Auth** — Sign in with Google (Firebase)
- **Preferences** — Diet type, calorie target, exclusions, notes
- **Meal plan generator** — 7-day plan from Claude, with a tabbed day view
- **My recipes** — Add recipes manually or save any AI meal with one click
- **Pantry + shopping list** — Pantry list + auto-generated “what’s missing” list
- **Save AI meals** — Bookmark any generated meal into your recipe collection

---

## Stack

| Layer   | Tech |
|--------|------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind v4, ShadCN/UI, TanStack Query, Firebase Auth, React Hook Form + Zod |
| Backend  | FastAPI, Pydantic v2, SQLAlchemy 2 async, Alembic, Firebase Admin |
| AI       | Claude (plan generation), Gemini (retrieval + embeddings), no LangChain/LlamaIndex |
| Data     | PostgreSQL 16 + pgvector, Redis (Upstash) |
| Infra    | Firebase Hosting, Cloud Run, Cloud SQL, GCS, Secret Manager |

---

