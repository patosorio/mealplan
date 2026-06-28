"""add nutrition and quality_score columns (FH-1, FH-2)

Revision ID: l0i6j7k8l234
Revises: k9h5i6j7k123
Create Date: 2026-06-28 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "l0i6j7k8l234"
down_revision: Union[str, Sequence[str], None] = "k9h5i6j7k123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_recipes",
        sa.Column("nutrition", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "meal_plans",
        sa.Column("quality_score", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_recipes", "nutrition")
    op.drop_column("meal_plans", "quality_score")
