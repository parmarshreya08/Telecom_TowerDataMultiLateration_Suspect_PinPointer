"""live tracking sessions keyed by (case_id, imsi)

Revision ID: 8a9c0d1e2f3a
Revises: 7f3a9c2d4e5b

Same fugitive number can be tracked under several investigations, so the
imsi-only primary key collides. Rebuild both tables keyed by (case_id, imsi).
Live data is ephemeral; tables are recreated (same pattern as 6e2f36194c1f).

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a9c0d1e2f3a'
down_revision: Union[str, Sequence[str], None] = '7f3a9c2d4e5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS live_tracking_fixes CASCADE")
    op.execute("DROP TABLE IF EXISTS live_tracking_sessions CASCADE")

    op.create_table(
        'live_tracking_sessions',
        sa.Column('case_id', sa.String(length=50), primary_key=True),
        sa.Column('imsi', sa.String(length=50), primary_key=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('authorized_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_live_tracking_sessions_imsi', 'live_tracking_sessions', ['imsi'])

    op.create_table(
        'live_tracking_fixes',
        sa.Column('fix_id', sa.UUID(), primary_key=True),
        sa.Column('case_id', sa.String(length=50), nullable=False),
        sa.Column('imsi', sa.String(length=50), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('is_significant_anchor', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.ForeignKeyConstraint(
            ['case_id', 'imsi'],
            ['live_tracking_sessions.case_id', 'live_tracking_sessions.imsi'],
            ondelete='CASCADE',
        ),
    )
    op.create_index('ix_live_tracking_fixes_case_imsi', 'live_tracking_fixes', ['case_id', 'imsi'])
    op.create_index('ix_live_tracking_fixes_timestamp', 'live_tracking_fixes', ['timestamp'])


def downgrade() -> None:
    op.drop_table('live_tracking_fixes')
    op.drop_table('live_tracking_sessions')
