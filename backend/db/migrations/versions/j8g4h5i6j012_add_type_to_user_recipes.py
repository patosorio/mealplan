"""add type to user_recipes

Revision ID: j8g4h5i6j012
Revises: i7f3b2c1d456
Create Date: 2026-06-18 21:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j8g4h5i6j012"
down_revision: Union[str, Sequence[str], None] = "i7f3b2c1d456"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_recipes",
        sa.Column("type", sa.Text(), nullable=True),
    )
    # Backfill existing rows using reliable signals
    op.execute(
        """
        UPDATE user_recipes
        SET type = 'juice'
        WHERE origin_meal LIKE 'juice_%'
           OR 'juice' = ANY(tags)
        """
    )
    # Remaining nulls stay null — will be set on next bookmark save


def downgrade() -> None:
    op.drop_column("user_recipes", "type")
