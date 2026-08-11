"""Create phase 5 inquiries, corrections, suppliers, and tasks.

Revision ID: 20260807_0006
Revises: 20260807_0005
"""

from alembic import op
import sqlalchemy as sa

from app.db.geometry import Geometry

revision = "20260807_0006"
down_revision = "20260807_0005"
branch_labels = None
depends_on = None


def _entity_columns(soft_delete: bool = True) -> list[sa.Column]:
    columns = [
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()") if op.get_bind().dialect.name == "postgresql" else None, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]
    if soft_delete:
        columns.extend([
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_by", sa.Uuid(), nullable=True),
            sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        ])
    columns.append(sa.PrimaryKeyConstraint("id"))
    return columns


def upgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_name", sa.String(200), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        *_entity_columns(),
    )
    op.create_table(
        "inquiries",
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("contact_name", sa.String(200), nullable=False),
        sa.Column("contact_email", sa.String(320), nullable=True),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        sa.Column("address_id", sa.Uuid(), nullable=True),
        sa.Column("address_text", sa.String(300), nullable=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("status", sa.String(20), server_default="new", nullable=False),
        sa.Column("assigned_to_id", sa.Uuid(), nullable=True),
        sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("incident_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["address_id"], ["addresses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"),
        sa.CheckConstraint("status IN ('new', 'in_progress', 'waiting', 'resolved', 'closed')", name="status_value"),
        sa.CheckConstraint("channel IN ('phone', 'email', 'web', 'in_person', 'other')", name="channel_value"),
    )
    op.create_table(
        "inquiry_updates",
        sa.Column("inquiry_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("previous_status", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=True),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_table(
        "inquiry_attachments",
        sa.Column("inquiry_id", sa.Uuid(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_filename", sa.String(100), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("storage_filename"),
    )
    op.create_table(
        "map_corrections",
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("status", sa.String(30), server_default="new", nullable=False),
        sa.Column("geometry", Geometry("POINT", 25832), nullable=False),
        sa.Column("inquiry_id", sa.Uuid(), nullable=True),
        sa.Column("pipe_id", sa.Uuid(), nullable=True),
        sa.Column("valve_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_to_id", sa.Uuid(), nullable=True),
        sa.Column("supplier_id", sa.Uuid(), nullable=True),
        sa.Column("supplier_reference", sa.String(100), nullable=True),
        sa.Column("supplier_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pipe_id"], ["pipes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["valve_id"], ["valves.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"),
        sa.CheckConstraint("status IN ('new', 'assessed', 'assigned', 'sent_to_supplier', 'supplier_accepted', 'work_scheduled', 'work_completed', 'verified', 'closed')", name="status_value"),
    )
    op.create_table(
        "map_correction_history",
        sa.Column("correction_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("previous_status", sa.String(30), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        *_entity_columns(soft_delete=False),
        sa.ForeignKeyConstraint(["correction_id"], ["map_corrections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_table(
        "map_correction_attachments",
        sa.Column("correction_id", sa.Uuid(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_filename", sa.String(100), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["correction_id"], ["map_corrections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("storage_filename"),
    )
    op.create_table(
        "tasks",
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("assigned_to_id", sa.Uuid(), nullable=True),
        sa.Column("incident_id", sa.Uuid(), nullable=True),
        sa.Column("inquiry_id", sa.Uuid(), nullable=True),
        sa.Column("correction_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["correction_id"], ["map_corrections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"),
        sa.CheckConstraint("status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')", name="status_value"),
        sa.CheckConstraint("(CASE WHEN incident_id IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN inquiry_id IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN correction_id IS NOT NULL THEN 1 ELSE 0 END) <= 1", name="single_relation"),
    )
    op.create_table(
        "task_comments",
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="RESTRICT"),
    )

    indexes = {
        "suppliers": ("name", "active", "updated_by"),
        "inquiries": ("number", "address_id", "channel", "category", "priority", "status", "assigned_to_id", "follow_up_at", "incident_id", "created_by_id", "updated_by"),
        "inquiry_updates": ("inquiry_id", "author_id", "updated_by"),
        "inquiry_attachments": ("inquiry_id", "uploaded_by_id", "updated_by"),
        "map_corrections": ("number", "category", "priority", "status", "inquiry_id", "pipe_id", "valve_id", "assigned_to_id", "supplier_id", "created_by_id", "updated_by"),
        "map_correction_history": ("correction_id", "author_id"),
        "map_correction_attachments": ("correction_id", "uploaded_by_id", "updated_by"),
        "tasks": ("priority", "status", "due_date", "assigned_to_id", "incident_id", "inquiry_id", "correction_id", "created_by_id", "updated_by"),
        "task_comments": ("task_id", "author_id", "updated_by"),
    }
    for table, columns in indexes.items():
        for column in columns:
            unique = (table, column) in {("suppliers", "name"), ("inquiries", "number"), ("map_corrections", "number")}
            op.create_index(f"ix_{table}_{column}", table, [column], unique=unique)
    op.create_index("ix_map_corrections_geometry", "map_corrections", ["geometry"], postgresql_using="gist")

    if op.get_bind().dialect.name == "postgresql":
        for table in ("suppliers", "inquiries", "inquiry_updates", "inquiry_attachments", "map_corrections", "map_correction_history", "map_correction_attachments", "tasks", "task_comments"):
            op.execute(f"CREATE TRIGGER trg_{table}_updated_at BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()")
        op.execute("CREATE VIEW qgis_map_corrections AS SELECT * FROM map_corrections WHERE deleted_at IS NULL")
        op.execute("COMMENT ON VIEW qgis_map_corrections IS 'Aktuelle kortrettelser til read-only brug i QGIS'")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP VIEW IF EXISTS qgis_map_corrections")
        for table in ("task_comments", "tasks", "map_correction_attachments", "map_correction_history", "map_corrections", "inquiry_attachments", "inquiry_updates", "inquiries", "suppliers"):
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
    for table in ("task_comments", "tasks", "map_correction_attachments", "map_correction_history", "map_corrections", "inquiry_attachments", "inquiry_updates", "inquiries", "suppliers"):
        op.drop_table(table)
