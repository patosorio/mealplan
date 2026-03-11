"""drop_unused_taste_profile_columns

Drops favourite_cuisines, favourite_ingredients, and avg_weekly_plans from
user_taste_profiles. None of these are populated by rebuild_taste_profile().
They will be reintroduced in v2 when cuisine-inference signals are built.

Revision ID: e7c3b9f1a054
Revises: d4a1f8b2c903
Create Date: 2026-02-22 13:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e7c3b9f1a054"
down_revision: Union[str, Sequence[str], None] = "d4a1f8b2c903"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("user_taste_profiles", "favourite_cuisines")
    op.drop_column("user_taste_profiles", "favourite_ingredients")
    op.drop_column("user_taste_profiles", "avg_weekly_plans")


def downgrade() -> None:
    op.add_column(
        "user_taste_profiles",
        sa.Column("avg_weekly_plans", sa.Float(), nullable=True),
    )
    op.add_column(
        "user_taste_profiles",
        sa.Column(
            "favourite_ingredients", postgresql.ARRAY(sa.Text()), nullable=True
        ),
    )
    op.add_column(
        "user_taste_profiles",
        sa.Column(
            "favourite_cuisines", postgresql.ARRAY(sa.Text()), nullable=True
        ),
    )
