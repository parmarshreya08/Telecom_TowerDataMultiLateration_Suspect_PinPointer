"""merge geocoded_address and rbac branches

Revision ID: 1d95be6a3bfa
Revises: fe317f58f4d0, a1b2c3d4e5f6
Create Date: 2026-08-15 19:34:27.040374

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1d95be6a3bfa'
down_revision: Union[str, Sequence[str], None] = ('fe317f58f4d0', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
