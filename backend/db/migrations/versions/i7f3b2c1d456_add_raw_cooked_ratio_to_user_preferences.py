"""add raw_cooked_ratio to user_preferences

Revision ID: i7f3b2c1d456
Revises: h6e7f8a9b012
Create Date: 2026-06-18 19:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i7f3b2c1d456"
down_revision: Union[str, Sequence[str], None] = "h6e7f8a9b012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "raw_cooked_ratio",
            sa.Text(),
            server_default="80_20",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "raw_cooked_ratio")
