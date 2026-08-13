"""add officers and auth_sessions tables

Revision ID: ccebfe6c7494
Revises: 7222ccfa13a3
Create Date: 2026-08-12 20:52:42.750645

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ccebfe6c7494'
down_revision: Union[str, Sequence[str], None] = '7222ccfa13a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('officers',
    sa.Column('officer_id', sa.Uuid(), nullable=False),
    sa.Column('officer_name', sa.String(length=255), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('officer_id')
    )
    op.create_index(op.f('ix_officers_email'), 'officers', ['email'], unique=True)
    op.create_table('auth_sessions',
    sa.Column('session_id', sa.Uuid(), nullable=False),
    sa.Column('officer_id', sa.Uuid(), nullable=False),
    sa.Column('jti', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['officer_id'], ['officers.officer_id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('session_id')
    )
    op.create_index(op.f('ix_auth_sessions_jti'), 'auth_sessions', ['jti'], unique=True)
    op.create_index(op.f('ix_auth_sessions_officer_id'), 'auth_sessions', ['officer_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_auth_sessions_officer_id'), table_name='auth_sessions')
    op.drop_index(op.f('ix_auth_sessions_jti'), table_name='auth_sessions')
    op.drop_table('auth_sessions')
    op.drop_index(op.f('ix_officers_email'), table_name='officers')
    op.drop_table('officers')