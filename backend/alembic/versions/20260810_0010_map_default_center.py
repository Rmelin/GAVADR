"""Add configurable default map center.

Revision ID: 20260810_0010
Revises: 20260810_0009
"""

from alembic import op
import sqlalchemy as sa

revision = "20260810_0010"
down_revision = "20260810_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.add_column(sa.Column("map_default_longitude", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("map_default_latitude", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("map_default_latitude")
        batch_op.drop_column("map_default_longitude")
