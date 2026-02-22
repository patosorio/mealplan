from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.rate_limit import RateLimitMiddleware
from db.session import engine
from models import Base
from routers import auth, internal, meal_plans, pantry, preferences, recipe_import, recipes, shopping

_IS_PRODUCTION = settings.environment == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="PatriEats API",
    lifespan=lifespan,
    docs_url=None if _IS_PRODUCTION else "/docs",
    redoc_url=None if _IS_PRODUCTION else "/redoc",
    openapi_url=None if _IS_PRODUCTION else "/openapi.json",
)

_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
_ALLOWED_HEADERS = ["Authorization", "Content-Type", "Accept"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=_ALLOWED_METHODS if _IS_PRODUCTION else ["*"],
    allow_headers=_ALLOWED_HEADERS if _IS_PRODUCTION else ["*"],
)
app.add_middleware(RateLimitMiddleware)

app.include_router(auth.router)
app.include_router(preferences.router)
app.include_router(meal_plans.router)
app.include_router(meal_plans.generated_router)
app.include_router(recipe_import.router)
app.include_router(recipes.router)
app.include_router(pantry.router)
app.include_router(shopping.router)
app.include_router(internal.router)


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
