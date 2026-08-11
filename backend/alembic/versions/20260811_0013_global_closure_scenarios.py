"""Add global multi-area closure scenarios.

Revision ID: 20260811_0013
Revises: 20260811_0012
"""

from alembic import op
import sqlalchemy as sa

revision = "20260811_0013"
down_revision = "20260811_0012"
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
        "closure_scenarios",
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_entity_columns(),
        sa.CheckConstraint("length(trim(name)) > 0", name="name_not_blank"),
    )
    op.create_table(
        "closure_scenario_areas",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("closure_area_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["scenario_id"], ["closure_scenarios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["closure_area_id"], ["closure_areas.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "closure_scenario_valves",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("valve_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["scenario_id"], ["closure_scenarios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["valve_id"], ["valves.id"], ondelete="CASCADE"),
    )
    for table, columns in {
        "closure_scenarios": ("active", "updated_by"),
        "closure_scenario_areas": ("scenario_id", "closure_area_id", "updated_by"),
        "closure_scenario_valves": ("scenario_id", "valve_id", "updated_by"),
    }.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])
    op.create_index("uq_closure_scenario_areas_active", "closure_scenario_areas", ["scenario_id", "closure_area_id"], unique=True)
    op.create_index("uq_closure_scenario_valves_active", "closure_scenario_valves", ["scenario_id", "valve_id"], unique=True)

    if op.get_bind().dialect.name == "postgresql":
        op.execute("""
            INSERT INTO closure_scenarios (id, name, active, created_at, updated_at, deleted_at, updated_by)
            SELECT id, name, active, created_at, updated_at, deleted_at, updated_by
            FROM closure_area_scenarios
        """)
        op.execute("""
            INSERT INTO closure_scenario_areas
                (id, scenario_id, closure_area_id, created_at, updated_at, deleted_at, updated_by)
            SELECT id, id, closure_area_id, created_at, updated_at, deleted_at, updated_by
            FROM closure_area_scenarios
        """)
        op.execute("""
            INSERT INTO closure_scenario_valves
                (id, scenario_id, valve_id, created_at, updated_at, deleted_at, updated_by)
            SELECT id, scenario_id, valve_id, created_at, updated_at, deleted_at, updated_by
            FROM closure_area_scenario_valves
        """)
        for table in ("closure_scenarios", "closure_scenario_areas", "closure_scenario_valves"):
            op.alter_column(table, "id", server_default=sa.text("gen_random_uuid()"))
            op.execute(f"""
                CREATE TRIGGER trg_{table}_updated_at
                BEFORE UPDATE ON {table}
                FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()
            """)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in ("closure_scenario_valves", "closure_scenario_areas", "closure_scenarios"):
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    op.drop_table("closure_scenario_valves")
    op.drop_table("closure_scenario_areas")
    op.drop_table("closure_scenarios")
