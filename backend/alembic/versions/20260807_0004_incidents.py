"""Create phase 3 incidents, timeline, attachments, and notifications.

Revision ID: 20260807_0004
Revises: 20260807_0003
"""

from alembic import op
import sqlalchemy as sa

from app.db.geometry import Geometry

revision = "20260807_0004"
down_revision = "20260807_0003"
branch_labels = None
depends_on = None


def _entity_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()") if op.get_bind().dialect.name == "postgresql" else None, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    ]


def upgrade() -> None:
    op.create_table(
        "incidents",
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), server_default="new", nullable=False),
        sa.Column("geometry", Geometry("POINT", 25832), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_to_id", sa.Uuid(), nullable=True),
        sa.Column("expected_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("water_restored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("public_text", sa.Text(), nullable=True),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("length(trim(title)) > 0", name="title_not_blank"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"),
        sa.CheckConstraint("status IN ('new', 'assessing', 'active', 'monitoring', 'resolved', 'closed', 'cancelled')", name="status_value"),
        sa.CheckConstraint("type IN ('suspected_leak', 'confirmed_leak', 'pressure_drop', 'no_water', 'discolored_water', 'planned_work', 'defective_valve', 'map_error', 'other_operational_disruption')", name="type_value"),
    )
    op.create_table(
        "incident_updates",
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("previous_status", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=True),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_table(
        "attachments",
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_filename", sa.String(100), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("storage_filename"),
    )
    op.create_table(
        "notifications",
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("channel", sa.String(20), server_default="email", nullable=False),
        sa.Column("recipients", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.CheckConstraint("status IN ('sent', 'failed', 'skipped')", name="status_value"),
    )

    indexes = {
        "incidents": ("number", "type", "priority", "status", "created_by_id", "assigned_to_id", "updated_by"),
        "incident_updates": ("incident_id", "author_id", "updated_by"),
        "attachments": ("incident_id", "uploaded_by_id", "updated_by"),
        "notifications": ("incident_id", "status", "updated_by"),
    }
    for table, columns in indexes.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column], unique=table == "incidents" and column == "number")
    op.create_index("ix_incidents_geometry", "incidents", ["geometry"], postgresql_using="gist")

    if op.get_bind().dialect.name == "postgresql":
        for table in ("incidents", "incident_updates", "attachments", "notifications"):
            op.execute(f"""
                CREATE TRIGGER trg_{table}_updated_at
                BEFORE UPDATE ON {table}
                FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()
            """)
        op.execute("""
            CREATE VIEW qgis_incidents AS
            SELECT * FROM incidents WHERE deleted_at IS NULL
        """)
        op.execute("COMMENT ON VIEW qgis_incidents IS 'Aktuelle hændelser til read-only brug i QGIS'")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP VIEW IF EXISTS qgis_incidents")
        for table in ("notifications", "attachments", "incident_updates", "incidents"):
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    op.drop_table("notifications")
    op.drop_table("attachments")
    op.drop_table("incident_updates")
    op.drop_table("incidents")
