"""phase7_review_approval_lifecycle

Adds plan review & approval lifecycle columns (Phase 7).
All statements are purely additive — no existing columns are touched.

Revision ID: f3b8d1c2e945
Revises: e7c3b9f1a054
Create Date: 2026-06-06 23:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "f3b8d1c2e945"
down_revision: Union[str, Sequence[str], None] = "e7c3b9f1a054"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── meal_plans ─────────────────────────────────────────────────────────────
    # status:         'draft' | 'reviewing' | 'approved'
    # name:           user-defined label, e.g. "Juice Week March"
    # scheduled_week: Monday of the calendar week this plan is assigned to
    # approved_at:    timestamp when status transitions to 'approved'
    op.add_column(
        "meal_plans",
        sa.Column("status", sa.Text(), nullable=False, server_default="draft"),
    )
    op.add_column(
        "meal_plans",
        sa.Column("name", sa.Text(), nullable=True),
    )
    op.add_column(
        "meal_plans",
        sa.Column("scheduled_week", sa.Date(), nullable=True),
    )
    op.add_column(
        "meal_plans",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── generated_meals ────────────────────────────────────────────────────────
    # approval_status:      'pending' | 'accepted' | 'swapped'
    # swapped_from_meal_id: FK to the meal this row replaced (audit trail)
    # edited_manually:      true when user edited name/description inline
    op.add_column(
        "generated_meals",
        sa.Column(
            "approval_status", sa.Text(), nullable=False, server_default="pending"
        ),
    )
    op.add_column(
        "generated_meals",
        sa.Column("swapped_from_meal_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "generated_meals",
        sa.Column(
            "edited_manually", sa.Boolean(), nullable=False, server_default="false"
        ),
    )
    op.create_foreign_key(
        "fk_generated_meals_swapped_from",
        "generated_meals",
        "generated_meals",
        ["swapped_from_meal_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── user_recipes ───────────────────────────────────────────────────────────
    # deleted_at: soft-delete — NULL = active, non-NULL = deleted
    op.add_column(
        "user_recipes",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── shopping_lists ─────────────────────────────────────────────────────────
    # plan_snapshot: preserves plan name/week for display after the plan is deleted
    # e.g. {"plan_name": "Juice Week March", "week_start": "2026-03-16", "diet_type": "..."}
    op.add_column(
        "shopping_lists",
        sa.Column("plan_snapshot", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("shopping_lists", "plan_snapshot")
    op.drop_column("user_recipes", "deleted_at")
    op.drop_constraint(
        "fk_generated_meals_swapped_from", "generated_meals", type_="foreignkey"
    )
    op.drop_column("generated_meals", "edited_manually")
    op.drop_column("generated_meals", "swapped_from_meal_id")
    op.drop_column("generated_meals", "approval_status")
    op.drop_column("meal_plans", "approved_at")
    op.drop_column("meal_plans", "scheduled_week")
    op.drop_column("meal_plans", "name")
    op.drop_column("meal_plans", "status")
