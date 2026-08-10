"""Add cases table and upload metadata enhancements

Revision ID: e1a2b3c4d5e6
Revises: d5e8f2a1c3b4
Create Date: 2026-08-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5e6'
down_revision: Union[str, None] = 'd5e8f2a1c3b4'
branch_labels: Union[str, None, None] = None
depends_on: Union[str, None, None] = None


def upgrade() -> None:
    # Enhance upload_metadata first (no FK yet)
    op.add_column('upload_metadata', sa.Column('supabase_path', sa.String(500), nullable=True))
    op.add_column('upload_metadata', sa.Column('supabase_url', sa.Text, nullable=True))
    op.add_column('upload_metadata', sa.Column('display_name', sa.String(255), nullable=True))
    op.add_column('upload_metadata', sa.Column('upload_status', sa.String(50), default='pending'))
    op.add_column('upload_metadata', sa.Column('error_message', sa.Text, nullable=True))
    op.add_column('upload_metadata', sa.Column('file_source', sa.String(50), default='local'))

    # Create cases table
    op.create_table(
        'cases',
        sa.Column('case_id', sa.String(50), primary_key=True),
        sa.Column('case_name', sa.String(255), nullable=False),
        sa.Column('case_number', sa.String(100), unique=True, nullable=False),
        sa.Column('suspect_name', sa.String(255), default=''),
        sa.Column('mobile_number', sa.String(20), default=''),
        sa.Column('description', sa.Text, default=''),
        sa.Column('officer_notes', sa.Text, default=''),
        sa.Column('status', sa.String(50), default='Active'),
        sa.Column('created_by', sa.String(100), default='Officer'),
        sa.Column('created_at', sa.DateTime, default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Seed cases from existing upload_metadata case_id values
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT DISTINCT case_id FROM upload_metadata"))
    for row in result:
        cid = row[0]
        if cid:
            conn.execute(
                sa.text(
                    "INSERT INTO cases (case_id, case_name, case_number, status, created_by, created_at, updated_at) "
                    "VALUES (:cid, :name, :number, 'Active', 'Officer', NOW(), NOW())"
                ),
                {"cid": cid, "name": f"Investigation {cid}", "number": cid},
            )

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_upload_case',
        'upload_metadata',
        'cases',
        ['case_id'],
        ['case_id'],
        ondelete='CASCADE'
    )

    # Index for status polling
    op.create_index('ix_upload_metadata_status', 'upload_metadata', ['upload_status'])


def downgrade() -> None:
    op.drop_index('ix_upload_metadata_status', table_name='upload_metadata')
    op.drop_constraint('fk_upload_case', 'upload_metadata', type_='foreignkey')
    op.drop_column('upload_metadata', 'file_source')
    op.drop_column('upload_metadata', 'error_message')
    op.drop_column('upload_metadata', 'upload_status')
    op.drop_column('upload_metadata', 'display_name')
    op.drop_column('upload_metadata', 'supabase_url')
    op.drop_column('upload_metadata', 'supabase_path')
    op.drop_table('cases')
