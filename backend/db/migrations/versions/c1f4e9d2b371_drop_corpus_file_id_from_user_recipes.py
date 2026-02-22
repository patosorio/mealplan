"""drop_corpus_file_id_from_user_recipes

Revision ID: c1f4e9d2b371
Revises: b263a8a2a052
Create Date: 2026-02-22 12:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1f4e9d2b371"
down_revision: Union[str, Sequence[str], None] = "b263a8a2a052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("user_recipes", "corpus_file_id")


def downgrade() -> None:
    op.add_column(
        "user_recipes",
        sa.Column("corpus_file_id", sa.Text(), nullable=True),
    )
