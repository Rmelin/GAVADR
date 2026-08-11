"""Add database defaults and timestamps for direct QGIS editing.

Revision ID: 20260807_0003
Revises: 20260807_0002
"""

from alembic import op
import sqlalchemy as sa

revision = "20260807_0003"
down_revision = "20260807_0002"
branch_labels = None
depends_on = None

tables = (
    "addresses",
    "pipes",
    "valves",
    "closure_areas",
    "closure_area_valves",
    "closure_area_addresses",
)


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table in tables:
        op.alter_column(table, "id", server_default=sa.text("gen_random_uuid()"))

    op.execute("""
        CREATE FUNCTION gavadr_set_updated_at() RETURNS trigger AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    for table in tables:
        op.execute(f"""
            CREATE TRIGGER trg_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()
        """)


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table in tables:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
        op.alter_column(table, "id", server_default=None)
    op.execute("DROP FUNCTION IF EXISTS gavadr_set_updated_at()")
