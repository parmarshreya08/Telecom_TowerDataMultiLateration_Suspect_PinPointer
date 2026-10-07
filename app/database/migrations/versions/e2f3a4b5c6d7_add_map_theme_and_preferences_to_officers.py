"""add map_theme and preferences to officers

Revision ID: e2f3a4b5c6d7
Revises: 43ca790e09c7
Create Date: 2026-10-05 22:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, Sequence[str], None] = '43ca790e09c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add map_theme and preferences columns to officers table
    op.add_column(
        'officers',
        sa.Column('map_theme', sa.String(50), nullable=False, server_default='dark')
    )
    op.add_column(
        'officers',
        sa.Column('preferences', sa.JSON(), nullable=True, server_default='{}')
    )


def downgrade() -> None:
    op.drop_column('officers', 'preferences')
    op.drop_column('officers', 'map_theme')
