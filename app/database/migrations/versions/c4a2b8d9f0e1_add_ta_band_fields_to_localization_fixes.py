"""add ta band fields to localization_fixes

Revision ID: c4a2b8d9f0e1
Revises: 8f3d5c1a7e2b
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4a2b8d9f0e1"
down_revision: Union[str, Sequence[str], None] = "8f3d5c1a7e2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "localization_fixes",
        sa.Column("ta_inner_m", sa.Float(), nullable=True),
    )
    op.add_column(
        "localization_fixes",
        sa.Column("ta_outer_m", sa.Float(), nullable=True),
    )
    op.add_column(
        "localization_fixes",
        sa.Column("rss_i_dbm", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("localization_fixes", "rss_i_dbm")
    op.drop_column("localization_fixes", "ta_outer_m")
    op.drop_column("localization_fixes", "ta_inner_m")