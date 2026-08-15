"""add rbac, case assignments, and audit logs tables

Revision ID: a1b2c3d4e5f6
Revises: ccebfe6c7494
Create Date: 2026-08-15 18:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'ccebfe6c7494'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add role and is_active columns to officers table
    op.add_column('officers', sa.Column('role', sa.String(length=50), nullable=False, server_default='INSPECTOR'))
    op.add_column('officers', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))

    # 2. Create case_assignments table
    op.create_table(
        'case_assignments',
        sa.Column('assignment_id', sa.Uuid(), nullable=False),
        sa.Column('case_id', sa.String(length=50), nullable=False),
        sa.Column('officer_id', sa.Uuid(), nullable=False),
        sa.Column('assigned_by', sa.String(length=255), nullable=False, server_default='System'),
        sa.Column('assigned_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.case_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['officer_id'], ['officers.officer_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('assignment_id')
    )
    op.create_index(op.f('ix_case_assignments_case_id'), 'case_assignments', ['case_id'], unique=False)
    op.create_index(op.f('ix_case_assignments_officer_id'), 'case_assignments', ['officer_id'], unique=False)

    # 3. Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('log_id', sa.Uuid(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('actor_id', sa.Uuid(), nullable=True),
        sa.Column('actor_name', sa.String(length=255), nullable=False, server_default='System'),
        sa.Column('actor_email', sa.String(length=255), nullable=True),
        sa.Column('actor_role', sa.String(length=50), nullable=False, server_default='UNKNOWN'),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('case_id', sa.String(length=50), nullable=True),
        sa.Column('target_resource', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='SUCCESS'),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.ForeignKeyConstraint(['actor_id'], ['officers.officer_id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('log_id')
    )
    op.create_index(op.f('ix_audit_logs_timestamp'), 'audit_logs', ['timestamp'], unique=False)
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_actor_id'), 'audit_logs', ['actor_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_case_id'), 'audit_logs', ['case_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_audit_logs_case_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_actor_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_timestamp'), table_name='audit_logs')
    op.drop_table('audit_logs')

    op.drop_index(op.f('ix_case_assignments_officer_id'), table_name='case_assignments')
    op.drop_index(op.f('ix_case_assignments_case_id'), table_name='case_assignments')
    op.drop_table('case_assignments')

    op.drop_column('officers', 'is_active')
    op.drop_column('officers', 'role')
