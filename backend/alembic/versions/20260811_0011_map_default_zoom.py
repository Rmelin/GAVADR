"""Add configurable default map zoom.

Revision ID: 20260811_0011
Revises: 20260810_0010
"""

from alembic import op
import sqlalchemy as sa

revision = "20260811_0011"
down_revision = "20260810_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("map_default_zoom", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("map_default_zoom")
