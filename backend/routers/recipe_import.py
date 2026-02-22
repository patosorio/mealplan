from __future__ import annotations

"""
Recipe import router — two-step AI-powered import flow.

  POST /recipes/import/extract  → returns RecipeDraft, saves nothing
  POST /recipes/import/confirm  → saves confirmed draft, returns RecipeRead
"""

import base64
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_db_user
from db.session import get_db
from models import User, UserRecipe
from schemas import RecipeDraft, RecipeImportConfirmRequest, RecipeRead
from services.ai import recipe_importer
from services.ai.gemini_embedder import embed_text
from services.profile_service import rebuild_taste_profile
from services.signal_service import log_signal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recipes/import", tags=["recipe import"])

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/extract", response_model=RecipeDraft)
async def extract_recipe(
    text: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    user: User = Depends(get_current_db_user),
) -> RecipeDraft:
    """
    Phase 1 — Extract a structured recipe draft from text, image, or both.
    Nothing is saved to the database. Returns a RecipeDraft for user review.
    """
    if not text and image is None:
        raise HTTPException(
            status_code=422,
            detail="Provide text, an image, or both.",
        )

    image_base64: str | None = None
    image_media_type: str | None = None

    if image is not None:
        if image.content_type not in _ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported image type '{image.content_type}'. "
                       f"Allowed: jpeg, png, gif, webp.",
            )

        raw_bytes = await image.read()
        if len(raw_bytes) > _MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Image exceeds the 5 MB limit.",
            )

        image_base64 = base64.b64encode(raw_bytes).decode()
        image_media_type = image.content_type

    try:
        draft = await recipe_importer.extract_recipe_from_input(
            text=text or None,
            image_base64=image_base64,
            image_media_type=image_media_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Claude API error during recipe extraction: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Recipe extraction temporarily unavailable.",
        ) from exc

    return draft


@router.post("/confirm", response_model=RecipeRead, status_code=201)
async def confirm_recipe(
    body: RecipeImportConfirmRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_db_user),
    db: AsyncSession = Depends(get_db),
) -> UserRecipe:
    """
    Phase 2 — Save the user-reviewed draft as a permanent recipe.
    Triggers taste-profile rebuild and embedding generation in the background.
    """
    recipe = UserRecipe(
        user_id=user.id,
        name=body.name,
        description=body.description,
        ingredients=[ing.model_dump() for ing in body.ingredients],
        steps=[step.model_dump() for step in body.steps],
        tags=body.tags,
        diet_type=body.diet_type,
        prep_minutes=body.prep_minutes,
        source="user",
        origin_plan_id=None,
        origin_day=None,
        origin_meal=None,
    )
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)

    await log_signal(db, user.id, "added_recipe", {
        "meal_name": recipe.name,
        "tags": recipe.tags,
        "source": "user",
    })

    background_tasks.add_task(rebuild_taste_profile, db, user.id)
    background_tasks.add_task(_embed_and_store, db, recipe.id, recipe.name, recipe.description)

    return recipe


async def _embed_and_store(
    db: AsyncSession,
    recipe_id: object,
    name: str,
    description: str | None,
) -> None:
    """Background task: generate pgvector embedding and persist it."""
    from sqlalchemy import select

    from models import UserRecipe as _UserRecipe

    try:
        text = f"{name}. {description or ''}".strip()
        embedding = await embed_text(text)

        result = await db.execute(
            select(_UserRecipe).where(_UserRecipe.id == recipe_id)
        )
        recipe = result.scalar_one_or_none()
        if recipe is None:
            return

        recipe.embedding = embedding
        await db.commit()
    except Exception:
        logger.exception("Embedding failed for imported recipe %s", recipe_id)
