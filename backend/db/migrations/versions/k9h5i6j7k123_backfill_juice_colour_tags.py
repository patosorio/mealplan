"""backfill juice colour tags on user_recipes

Revision ID: k9h5i6j7k123
Revises: j8g4h5i6j012
Create Date: 2026-06-18 22:00:00.000000

For every user_recipes row that has 'juice' in tags but no colour tag yet,
infer a colour from the name using keyword matching and append it to the tags
array.  The keyword lists mirror infer_juice_colour() in services/recipe_service.py.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "k9h5i6j7k123"
down_revision: Union[str, Sequence[str], None] = "j8g4h5i6j012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Colour tags we know about — used to skip rows that already have one.
_KNOWN_COLOURS = ("green", "orange", "red", "yellow", "purple", "pink")

# (colour, keywords) in priority order — first match wins.
_COLOUR_RULES: list[tuple[str, list[str]]] = [
    ("green",  ["spinach", "kale", "celery", "cucumber", "wheatgrass", "matcha", "parsley", "mint"]),
    ("orange", ["carrot", "orange", "turmeric", "mango", "papaya", "peach"]),
    ("red",    ["beet", "beetroot", "pomegranate", "cherry", "raspberry", "strawberry", "watermelon", "red pepper"]),
    ("yellow", ["pineapple", "lemon", "ginger", "banana", "apple", "pear", "yellow pepper"]),
    ("purple", ["blueberry", "blackberry", "purple cabbage", "acai", "grape", "plum"]),
    ("pink",   ["dragonfruit", "pink grapefruit", "rose", "hibiscus", "guava"]),
]

# PostgreSQL array literal for the known-colours check
_COLOUR_ARRAY = "ARRAY[" + ", ".join(f"'{c}'" for c in _KNOWN_COLOURS) + "]"


def upgrade() -> None:
    # Target: juice rows that don't already carry any colour tag.
    # We work through colours in priority order; once a row is updated it gains
    # a colour tag and will no longer match subsequent UPDATE statements.
    base_where = f"""
        'juice' = ANY(tags)
        AND deleted_at IS NULL
        AND NOT (tags && {_COLOUR_ARRAY})
    """

    for colour, keywords in _COLOUR_RULES:
        # Build a keyword match against the name column (lower-cased).
        kw_conditions = " OR ".join(
            f"lower(name) LIKE '%{kw}%'" for kw in keywords
        )
        op.execute(
            f"""
            UPDATE user_recipes
            SET tags = array_append(tags, '{colour}')
            WHERE {base_where}
              AND ({kw_conditions})
            """
        )


def downgrade() -> None:
    # Remove any colour tags that were added by this migration.
    colours_array = _COLOUR_ARRAY
    op.execute(
        f"""
        UPDATE user_recipes
        SET tags = ARRAY(
            SELECT unnest(tags)
            EXCEPT
            SELECT unnest({colours_array})
        )
        WHERE 'juice' = ANY(tags)
        """
    )
