"""Add closure area isolation scenarios.

Revision ID: 20260811_0012
Revises: 20260811_0011
"""

from alembic import op
import sqlalchemy as sa

revision = "20260811_0012"
down_revision = "20260811_0011"
branch_labels = None
depends_on = None


def _entity_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    ]


def upgrade() -> None:
    op.create_table(
        "closure_area_scenarios",
        sa.Column("closure_area_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["closure_area_id"], ["closure_areas.id"], ondelete="CASCADE"),
        sa.CheckConstraint("length(trim(name)) > 0", name="name_not_blank"),
    )
    op.create_table(
        "closure_area_scenario_valves",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("valve_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["scenario_id"], ["closure_area_scenarios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["valve_id"], ["valves.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_closure_area_scenarios_closure_area_id", "closure_area_scenarios", ["closure_area_id"])
    op.create_index("ix_closure_area_scenarios_active", "closure_area_scenarios", ["active"])
    op.create_index("ix_closure_area_scenarios_updated_by", "closure_area_scenarios", ["updated_by"])
    op.create_index("ix_closure_area_scenario_valves_scenario_id", "closure_area_scenario_valves", ["scenario_id"])
    op.create_index("ix_closure_area_scenario_valves_valve_id", "closure_area_scenario_valves", ["valve_id"])
    op.create_index("ix_closure_area_scenario_valves_updated_by", "closure_area_scenario_valves", ["updated_by"])
    op.create_index("uq_closure_area_scenario_valves_active", "closure_area_scenario_valves", ["scenario_id", "valve_id"], unique=True)

    if op.get_bind().dialect.name == "postgresql":
        op.execute("""
            INSERT INTO closure_area_scenarios
                (id, closure_area_id, name, active, created_at, updated_at, deleted_at, updated_by)
            SELECT cav.id, cav.closure_area_id, 'Luk ' || v.code, true,
                   cav.created_at, cav.updated_at, cav.deleted_at, cav.updated_by
            FROM closure_area_valves cav
            JOIN valves v ON v.id = cav.valve_id
        """)
        op.execute("""
            INSERT INTO closure_area_scenario_valves
                (id, scenario_id, valve_id, created_at, updated_at, deleted_at, updated_by)
            SELECT gen_random_uuid(), cav.id, cav.valve_id,
                   cav.created_at, cav.updated_at, cav.deleted_at, cav.updated_by
            FROM closure_area_valves cav
        """)
        for table in ("closure_area_scenarios", "closure_area_scenario_valves"):
            op.alter_column(table, "id", server_default=sa.text("gen_random_uuid()"))
            op.execute(f"""
                CREATE TRIGGER trg_{table}_updated_at
                BEFORE UPDATE ON {table}
                FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()
            """)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in ("closure_area_scenario_valves", "closure_area_scenarios"):
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    op.drop_table("closure_area_scenario_valves")
    op.drop_table("closure_area_scenarios")
