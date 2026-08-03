"""add localization_fixes

Revision ID: 8f3d5c1a7e2b
Revises: b26a74944e68
Create Date: 2026-08-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f3d5c1a7e2b'
down_revision: Union[str, Sequence[str], None] = 'b26a74944e68'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add localization_fixes table."""
    op.create_table(
        'localization_fixes',
        sa.Column('fix_id', sa.Uuid(), nullable=False),
        sa.Column('case_id', sa.String(length=50), nullable=False),
        sa.Column('frame_id', sa.Uuid(), nullable=True),
        sa.Column('subscriber_identifier', sa.String(length=50), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('velocity_east', sa.Float(), nullable=True),
        sa.Column('velocity_north', sa.Float(), nullable=True),
        sa.Column('confidence_radius_meters', sa.Float(), nullable=False),
        sa.Column('gdop', sa.Float(), nullable=True),
        sa.Column('residual_rms', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['frame_id'], ['measurement_frames.frame_id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('fix_id'),
    )
    op.create_index('ix_localization_fixes_case_id', 'localization_fixes', ['case_id'])
    op.create_index('ix_localization_fixes_subscriber_identifier', 'localization_fixes', ['subscriber_identifier'])
    op.create_index('ix_localization_fixes_timestamp', 'localization_fixes', ['timestamp'])


def downgrade() -> None:
    """Drop localization_fixes table."""
    op.drop_index('ix_localization_fixes_timestamp', table_name='localization_fixes')
    op.drop_index('ix_localization_fixes_subscriber_identifier', table_name='localization_fixes')
    op.drop_index('ix_localization_fixes_case_id', table_name='localization_fixes')
    op.drop_table('localization_fixes')
