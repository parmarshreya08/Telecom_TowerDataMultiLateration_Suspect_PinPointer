"""Keep PostGIS geometry columns populated via triggers and backfill NULLs.

Revision ID: 7f3a9c2d4e5b
Revises: 6e2f36194c1f
Create Date: 2026-10-08

The d5e8f2a1c3b4 migration added ``geometry`` columns but nothing maintains
them: every tower row inserted afterwards has NULL geometry, so the
ST_DWithin queries silently return nothing. This revision adds
BEFORE INSERT OR UPDATE triggers that derive geometry from lat/lon, and
backfills existing NULL rows.
"""

from alembic import op

revision = "7f3a9c2d4e5b"
down_revision = "6e2f36194c1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_tower_geometry()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
                NEW.geometry := ST_SetSRID(
                    ST_MakePoint(NEW.longitude, NEW.latitude), 4326
                );
            ELSE
                NEW.geometry := NULL;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_tower_records_geometry ON tower_records;
        CREATE TRIGGER trg_tower_records_geometry
        BEFORE INSERT OR UPDATE OF latitude, longitude ON tower_records
        FOR EACH ROW EXECUTE FUNCTION set_tower_geometry()
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_fix_geometry()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
                NEW.geometry := ST_SetSRID(
                    ST_MakePoint(NEW.longitude, NEW.latitude), 4326
                );
            ELSE
                NEW.geometry := NULL;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_localization_fixes_geometry ON localization_fixes;
        CREATE TRIGGER trg_localization_fixes_geometry
        BEFORE INSERT OR UPDATE OF latitude, longitude ON localization_fixes
        FOR EACH ROW EXECUTE FUNCTION set_fix_geometry()
        """
    )

    # Expression indexes on the geography cast so ST_DWithin / KNN
    # queries use an index instead of seq-scanning.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tower_records_geog "
        "ON tower_records USING GIST ((geometry::geography))"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_localization_fixes_geog "
        "ON localization_fixes USING GIST ((geometry::geography))"
    )

    # Backfill rows inserted while no trigger existed.
    op.execute(
        "UPDATE tower_records "
        "SET geometry = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) "
        "WHERE geometry IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL"
    )
    op.execute(
        "UPDATE localization_fixes "
        "SET geometry = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) "
        "WHERE geometry IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_localization_fixes_geog")
    op.execute("DROP INDEX IF EXISTS ix_tower_records_geog")
    op.execute("DROP TRIGGER IF EXISTS trg_localization_fixes_geometry ON localization_fixes")
    op.execute("DROP FUNCTION IF EXISTS set_fix_geometry()")
    op.execute("DROP TRIGGER IF EXISTS trg_tower_records_geometry ON tower_records")
    op.execute("DROP FUNCTION IF EXISTS set_tower_geometry()")
