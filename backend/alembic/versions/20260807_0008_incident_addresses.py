"""Link incidents to their selected address.

Revision ID: 20260807_0008
Revises: 20260807_0007
"""

from alembic import op
import sqlalchemy as sa

revision = "20260807_0008"
down_revision = "20260807_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("incidents") as batch_op:
        batch_op.add_column(sa.Column("address_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_incidents_address_id_addresses", "addresses",
            ["address_id"], ["id"], ondelete="SET NULL",
        )
    op.create_index("ix_incidents_address_id", "incidents", ["address_id"])


def downgrade() -> None:
    op.drop_index("ix_incidents_address_id", table_name="incidents")
    with op.batch_alter_table("incidents") as batch_op:
        batch_op.drop_constraint("fk_incidents_address_id_addresses", type_="foreignkey")
        batch_op.drop_column("address_id")
