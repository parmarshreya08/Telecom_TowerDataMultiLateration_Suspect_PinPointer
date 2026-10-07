"""add live tracking tables stub

Revision ID: 43ca790e09c7
Revises: 1d95be6a3bfa
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '43ca790e09c7'
down_revision: Union[str, Sequence[str], None] = '1d95be6a3bfa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tables live_tracking_sessions, live_location_events, live_alerts, movement_state_history
    # already exist in live database
    pass


def downgrade() -> None:
    pass
