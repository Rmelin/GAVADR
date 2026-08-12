"""Hide synthetic network samples from existing installations.

Revision ID: 20260812_0015
Revises: 20260811_0014
"""

from alembic import op


revision = "20260812_0015"
down_revision = "20260811_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep rows for referential integrity, but remove every known sample from active views and calculations.
    for table, condition in (
        ("closure_scenario_valves", "CAST(scenario_id AS VARCHAR) LIKE '24000000-%'"),
        ("closure_scenario_areas", "CAST(scenario_id AS VARCHAR) LIKE '24000000-%'"),
        ("closure_scenarios", "CAST(id AS VARCHAR) LIKE '24000000-%'"),
        ("closure_area_scenario_valves", "CAST(scenario_id AS VARCHAR) LIKE '24000000-%'"),
        ("closure_area_scenarios", "CAST(id AS VARCHAR) LIKE '24000000-%'"),
        ("closure_area_addresses", "CAST(id AS VARCHAR) LIKE '25000000-%'"),
        ("closure_area_valves", "CAST(id AS VARCHAR) LIKE '24000000-%'"),
        ("closure_areas", "CAST(id AS VARCHAR) LIKE '23000000-%'"),
        ("valves", "CAST(id AS VARCHAR) LIKE '22000000-%'"),
        ("pipes", "CAST(id AS VARCHAR) LIKE '21000000-%'"),
        ("addresses", "CAST(id AS VARCHAR) LIKE '20000000-%'"),
    ):
        op.execute(
            f"UPDATE {table} SET deleted_at = CURRENT_TIMESTAMP "
            f"WHERE {condition} AND deleted_at IS NULL"
        )


def downgrade() -> None:
    # Production cleanup is intentionally not reversed; old sample data must not become active again.
    pass
