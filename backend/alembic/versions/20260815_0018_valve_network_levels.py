"""Add network levels to valves.

Revision ID: 20260815_0018
Revises: 20260813_0017
"""

from alembic import op
import sqlalchemy as sa


revision = "20260815_0018"
down_revision = "20260813_0017"
branch_labels = None
depends_on = None


def _recreate_qgis_view_without_network_level() -> None:
    op.execute("DROP VIEW IF EXISTS qgis_active_valves")
    op.execute("CREATE VIEW qgis_active_valves AS SELECT * FROM valves WHERE deleted_at IS NULL")
    op.execute("COMMENT ON VIEW qgis_active_valves IS 'Aktive haner til read-only brug i QGIS'")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qgis_editor') THEN
                GRANT SELECT ON qgis_active_valves TO qgis_editor;
            END IF;
        END $$
        """
    )


def upgrade() -> None:
    op.add_column("valves", sa.Column("network_level", sa.String(50), nullable=True))
    op.create_index("ix_valves_network_level", "valves", ["network_level"])
    op.create_check_constraint(
        op.f("ck_valves_network_level_value"),
        "valves",
        "network_level IS NULL OR network_level IN ('main', 'distribution', 'service')",
    )
    if op.get_bind().dialect.name == "postgresql":
        # The new table column is appended to the view without dropping its existing grants.
        op.execute("CREATE OR REPLACE VIEW qgis_active_valves AS SELECT * FROM valves WHERE deleted_at IS NULL")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP VIEW IF EXISTS qgis_active_valves")
    op.drop_constraint(op.f("ck_valves_network_level_value"), "valves", type_="check")
    op.drop_index("ix_valves_network_level", table_name="valves")
    op.drop_column("valves", "network_level")
    if op.get_bind().dialect.name == "postgresql":
        _recreate_qgis_view_without_network_level()
