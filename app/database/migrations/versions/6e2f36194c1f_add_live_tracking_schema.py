"""add_live_tracking_schema

Revision ID: 6e2f36194c1f
Revises: e2f3a4b5c6d7
Create Date: 2026-10-08 13:33:20.436467

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e2f36194c1f'
down_revision: Union[str, Sequence[str], None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop existing prototypes
    op.execute("DROP TABLE IF EXISTS live_tracking_fixes CASCADE")
    op.execute("DROP TABLE IF EXISTS live_tracking_sessions CASCADE")
    op.execute("DROP TABLE IF EXISTS live_location_events CASCADE")
    op.execute("DROP TABLE IF EXISTS live_alerts CASCADE")
    op.execute("DROP TABLE IF EXISTS movement_state_history CASCADE")

    # Create live_tracking_sessions
    op.create_table(
        'live_tracking_sessions',
        sa.Column('imsi', sa.String(length=50), primary_key=True, index=True),
        sa.Column('case_id', sa.String(length=50), index=True, nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('authorized_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )

    # Create live_tracking_fixes
    op.create_table(
        'live_tracking_fixes',
        sa.Column('fix_id', sa.UUID(), primary_key=True),
        sa.Column('imsi', sa.String(length=50), nullable=False),
        sa.Column('timestamp', sa.DateTime(), index=True, nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('is_significant_anchor', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.ForeignKeyConstraint(['imsi'], ['live_tracking_sessions.imsi'], ondelete='CASCADE'),
    )
    op.create_index('ix_live_tracking_fixes_imsi', 'live_tracking_fixes', ['imsi'])

def downgrade() -> None:
    op.drop_table('live_tracking_fixes')
    op.drop_table('live_tracking_sessions')
