"""Create phase 4 planned shutdown workflow.

Revision ID: 20260807_0005
Revises: 20260807_0004
"""

from alembic import op
import sqlalchemy as sa

revision = "20260807_0005"
down_revision = "20260807_0004"
branch_labels = None
depends_on = None


def _entity_columns() -> list[sa.Column]:
    return [
        sa.Column(
            "id", sa.Uuid(),
            server_default=sa.text("gen_random_uuid()") if op.get_bind().dialect.name == "postgresql" else None,
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    ]


def upgrade() -> None:
    op.create_table(
        "planned_shutdowns",
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expected_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_to_id", sa.Uuid(), nullable=True),
        sa.Column("contractor", sa.String(200), nullable=True),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("length(trim(title)) > 0", name="title_not_blank"),
        sa.CheckConstraint(
            "status IN ('draft', 'planned', 'in_progress', 'completed', 'cancelled')",
            name="status_value",
        ),
    )
    op.create_table(
        "planned_shutdown_valves",
        sa.Column("shutdown_id", sa.Uuid(), nullable=False),
        sa.Column("valve_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["shutdown_id"], ["planned_shutdowns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["valve_id"], ["valves.id"], ondelete="RESTRICT"),
    )
    op.create_table(
        "planned_shutdown_closure_areas",
        sa.Column("shutdown_id", sa.Uuid(), nullable=False),
        sa.Column("closure_area_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["shutdown_id"], ["planned_shutdowns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["closure_area_id"], ["closure_areas.id"], ondelete="RESTRICT"),
    )
    op.create_table(
        "planned_shutdown_addresses",
        sa.Column("shutdown_id", sa.Uuid(), nullable=False),
        sa.Column("address_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("included", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("informed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("informed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("informed_by_id", sa.Uuid(), nullable=True),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["shutdown_id"], ["planned_shutdowns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["address_id"], ["addresses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["informed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("source IN ('derived', 'manual')", name="source_value"),
    )

    indexes = {
        "planned_shutdowns": (
            "number", "status", "starts_at", "created_by_id", "assigned_to_id", "updated_by",
        ),
        "planned_shutdown_valves": ("shutdown_id", "valve_id", "updated_by"),
        "planned_shutdown_closure_areas": ("shutdown_id", "closure_area_id", "updated_by"),
        "planned_shutdown_addresses": (
            "shutdown_id", "address_id", "included", "informed_by_id", "updated_by",
        ),
    }
    for table, columns in indexes.items():
        for column in columns:
            op.create_index(
                f"ix_{table}_{column}", table, [column],
                unique=table == "planned_shutdowns" and column == "number",
            )
    op.create_index(
        "uq_planned_shutdown_valve", "planned_shutdown_valves", ["shutdown_id", "valve_id"], unique=True
    )
    op.create_index(
        "uq_planned_shutdown_area", "planned_shutdown_closure_areas",
        ["shutdown_id", "closure_area_id"], unique=True,
    )
    op.create_index(
        "uq_planned_shutdown_address", "planned_shutdown_addresses",
        ["shutdown_id", "address_id"], unique=True,
    )

    if op.get_bind().dialect.name == "postgresql":
        for table in (
            "planned_shutdowns", "planned_shutdown_valves",
            "planned_shutdown_closure_areas", "planned_shutdown_addresses",
        ):
            op.execute(f"""
                CREATE TRIGGER trg_{table}_updated_at
                BEFORE UPDATE ON {table}
                FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()
            """)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in (
            "planned_shutdown_addresses", "planned_shutdown_closure_areas",
            "planned_shutdown_valves", "planned_shutdowns",
        ):
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    op.drop_table("planned_shutdown_addresses")
    op.drop_table("planned_shutdown_closure_areas")
    op.drop_table("planned_shutdown_valves")
    op.drop_table("planned_shutdowns")
