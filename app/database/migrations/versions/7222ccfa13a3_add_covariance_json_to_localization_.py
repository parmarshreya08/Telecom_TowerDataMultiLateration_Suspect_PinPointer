"""add covariance_json to localization_fixes

Revision ID: 7222ccfa13a3
Revises: f1a2b3c4d5e6
Create Date: 2026-08-10 23:06:02.870858

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7222ccfa13a3'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('localization_fixes', sa.Column('covariance_json', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('localization_fixes', 'covariance_json')
