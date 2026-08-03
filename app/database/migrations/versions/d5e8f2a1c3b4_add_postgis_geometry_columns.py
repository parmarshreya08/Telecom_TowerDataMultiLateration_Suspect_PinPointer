"""Add PostGIS extension and geometry columns for spatial queries.

Revision ID: d5e8f2a1c3b4
Revises: c4a2b8d9f0e1
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa

revision = "d5e8f2a1c3b4"
down_revision = "c4a2b8d9f0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable PostGIS extension
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Add geometry column to tower_records
    op.execute(
        "ALTER TABLE tower_records "
        "ADD COLUMN IF NOT EXISTS geometry GEOMETRY(Point, 4326)"
    )
    op.execute(
        "UPDATE tower_records "
        "SET geometry = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) "
        "WHERE geometry IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tower_records_geometry "
        "ON tower_records USING GIST (geometry)"
    )

    # Add geometry column to localization_fixes
    op.execute(
        "ALTER TABLE localization_fixes "
        "ADD COLUMN IF NOT EXISTS geometry GEOMETRY(Point, 4326)"
    )
    op.execute(
        "UPDATE localization_fixes "
        "SET geometry = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) "
        "WHERE geometry IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_localization_fixes_geometry "
        "ON localization_fixes USING GIST (geometry)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_localization_fixes_geometry")
    op.execute("ALTER TABLE localization_fixes DROP COLUMN IF EXISTS geometry")
    op.execute("DROP INDEX IF EXISTS ix_tower_records_geometry")
    op.execute("ALTER TABLE tower_records DROP COLUMN IF EXISTS geometry")
    op.execute("DROP EXTENSION IF EXISTS postgis")
