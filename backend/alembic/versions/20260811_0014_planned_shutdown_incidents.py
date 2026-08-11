"""Link planned shutdowns and incidents.

Revision ID: 20260811_0014
Revises: 20260811_0013
"""

from alembic import op
import sqlalchemy as sa


revision = "20260811_0014"
down_revision = "20260811_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "planned_shutdown_incidents",
        sa.Column("shutdown_id", sa.Uuid(), nullable=False),
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["shutdown_id"], ["planned_shutdowns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_planned_shutdown_incidents_shutdown_id", "planned_shutdown_incidents", ["shutdown_id"])
    op.create_index("ix_planned_shutdown_incidents_incident_id", "planned_shutdown_incidents", ["incident_id"])
    op.create_index("ix_planned_shutdown_incidents_updated_by", "planned_shutdown_incidents", ["updated_by"])
    op.create_index(
        "uq_planned_shutdown_incident",
        "planned_shutdown_incidents",
        ["shutdown_id", "incident_id"],
        unique=True,
    )
    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("planned_shutdown_incidents", "id", server_default=sa.text("gen_random_uuid()"))
        op.execute("""
            CREATE TRIGGER trg_planned_shutdown_incidents_updated_at
            BEFORE UPDATE ON planned_shutdown_incidents
            FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()
        """)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_planned_shutdown_incidents_updated_at ON planned_shutdown_incidents")
    op.drop_table("planned_shutdown_incidents")
