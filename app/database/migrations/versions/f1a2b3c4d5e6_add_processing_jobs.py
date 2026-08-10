"""add processing_jobs table

Revision ID: f1a2b3c4d5e6
Revises: e1a2b3c4d5e6
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

revision = "f1a2b3c4d5e6"
down_revision = "e1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processing_jobs",
        sa.Column("job_id", PG_UUID(as_uuid=True), primary_key=True),
        sa.Column("upload_id", PG_UUID(as_uuid=True), sa.ForeignKey("upload_metadata.upload_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("case_id", sa.String(50), sa.ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("records_processed", sa.Integer, server_default="0"),
        sa.Column("records_valid", sa.Integer, server_default="0"),
        sa.Column("records_rejected", sa.Integer, server_default="0"),
        sa.Column("frames_created", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("processing_jobs")
