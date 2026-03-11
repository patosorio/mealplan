"""add_missing_query_indexes

Note: ix_user_recipes_user_id, ix_shopping_lists_user_id, and
ix_generated_meals_meal_plan_id already exist from b263a8a2a052.
This migration adds the composite index on generated_meals used by the
bookmark lookup (WHERE meal_plan_id = X AND day = Y AND meal_type = Z).

Revision ID: d4a1f8b2c903
Revises: c1f4e9d2b371
Create Date: 2026-02-22 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "d4a1f8b2c903"
down_revision: Union[str, Sequence[str], None] = "c1f4e9d2b371"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_generated_meals_plan_day_type",
        "generated_meals",
        ["meal_plan_id", "day", "meal_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_generated_meals_plan_day_type", table_name="generated_meals")
