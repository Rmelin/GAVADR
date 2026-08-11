"""Add persistent application settings.

Revision ID: 20260810_0009
Revises: 20260807_0008
"""

from uuid import UUID

from alembic import op
import sqlalchemy as sa

revision = "20260810_0009"
down_revision = "20260807_0008"
branch_labels = None
depends_on = None

SETTINGS_ID = UUID("99000000-0000-0000-0000-000000000001")


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("setting_key", sa.String(30), nullable=False),
        sa.Column("organization_name", sa.String(120), nullable=True),
        sa.Column("organization_address", sa.String(200), nullable=True),
        sa.Column("organization_locality", sa.String(120), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("setting_key"),
    )
    op.create_index("ix_app_settings_setting_key", "app_settings", ["setting_key"], unique=True)
    op.create_index("ix_app_settings_updated_by", "app_settings", ["updated_by"])
    table = sa.table(
        "app_settings",
        sa.column("id", sa.Uuid()),
        sa.column("setting_key", sa.String()),
    )
    op.bulk_insert(table, [{"id": SETTINGS_ID, "setting_key": "default"}])

    if op.get_bind().dialect.name == "postgresql":
        op.alter_column("app_settings", "id", server_default=sa.text("gen_random_uuid()"))
        op.execute("""
            CREATE TRIGGER trg_app_settings_updated_at
            BEFORE UPDATE ON app_settings
            FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()
        """)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON app_settings")
    op.drop_index("ix_app_settings_updated_by", table_name="app_settings")
    op.drop_index("ix_app_settings_setting_key", table_name="app_settings")
    op.drop_table("app_settings")
