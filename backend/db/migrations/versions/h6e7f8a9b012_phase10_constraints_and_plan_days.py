"""phase10 constraints and plan_days

Revision ID: h6e7f8a9b012
Revises: g5d2a3b4c678
Create Date: 2026-06-18 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h6e7f8a9b012"
down_revision: Union[str, Sequence[str], None] = "g5d2a3b4c678"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meal_plans",
        sa.Column("plan_days", sa.Integer(), server_default="7", nullable=False),
    )

    op.create_check_constraint(
        "ck_meal_plans_status",
        "meal_plans",
        "status IN ('draft', 'reviewing', 'approved')",
    )
    op.create_check_constraint(
        "ck_generated_meals_approval_status",
        "generated_meals",
        "approval_status IN ('pending', 'accepted', 'swapped')",
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_user_recipes_origin_slot
        ON user_recipes (user_id, origin_plan_id, origin_day, origin_meal)
        WHERE deleted_at IS NULL
          AND origin_plan_id IS NOT NULL
          AND origin_day IS NOT NULL
          AND origin_meal IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_user_recipes_origin_slot")
    op.drop_constraint("ck_generated_meals_approval_status", "generated_meals", type_="check")
    op.drop_constraint("ck_meal_plans_status", "meal_plans", type_="check")
    op.drop_column("meal_plans", "plan_days")
