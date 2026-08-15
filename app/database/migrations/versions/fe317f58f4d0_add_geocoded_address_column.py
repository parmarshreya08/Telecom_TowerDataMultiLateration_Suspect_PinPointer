"""add geocoded_address column

Revision ID: fe317f58f4d0
Revises: ccebfe6c7494
Create Date: 2026-08-15 01:10:29.017116

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fe317f58f4d0'
down_revision: Union[str, Sequence[str], None] = 'ccebfe6c7494'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('localization_fixes', sa.Column('geocoded_address', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('localization_fixes', 'geocoded_address')
