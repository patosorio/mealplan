"""add_servings_to_user_recipes

Revision ID: g5d2a3b4c678
Revises: f3b8d1c2e945
Create Date: 2026-06-07 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g5d2a3b4c678"
down_revision: Union[str, Sequence[str], None] = "f3b8d1c2e945"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_recipes",
        sa.Column("servings", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_recipes", "servings")
