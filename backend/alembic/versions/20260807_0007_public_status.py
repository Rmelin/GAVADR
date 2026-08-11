"""Create phase 6 public status workflow.

Revision ID: 20260807_0007
Revises: 20260807_0006
"""

from alembic import op
import sqlalchemy as sa

revision = "20260807_0007"
down_revision = "20260807_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "public_statuses",
        sa.Column(
            "id", sa.Uuid(),
            server_default=sa.text("gen_random_uuid()") if op.get_bind().dialect.name == "postgresql" else None,
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("incident_id", sa.Uuid(), nullable=True),
        sa.Column("planned_shutdown_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("draft_title", sa.String(200), nullable=False),
        sa.Column("draft_message", sa.Text(), nullable=False),
        sa.Column("draft_areas", sa.JSON(), nullable=False),
        sa.Column("draft_start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("draft_expected_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("draft_severity", sa.String(20), nullable=False),
        sa.Column("approved_payload", sa.JSON(), nullable=True),
        sa.Column("approved_by_id", sa.Uuid(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_updated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("close_message", sa.Text(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("display_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["incident_id"], ["incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["planned_shutdown_id"], ["planned_shutdowns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("incident_id"),
        sa.UniqueConstraint("planned_shutdown_id"),
        sa.CheckConstraint(
            "(incident_id IS NOT NULL AND planned_shutdown_id IS NULL) OR "
            "(incident_id IS NULL AND planned_shutdown_id IS NOT NULL)",
            name="exactly_one_source",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'closed', 'withdrawn')", name="status_value"
        ),
        sa.CheckConstraint(
            "draft_severity IN ('low', 'medium', 'high', 'critical')", name="severity_value"
        ),
    )
    for column in (
        "incident_id", "planned_shutdown_id", "status", "approved_by_id", "approved_at",
        "closed_at", "display_until", "withdrawn_at", "updated_by",
    ):
        op.create_index(f"ix_public_statuses_{column}", "public_statuses", [column])
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "CREATE TRIGGER trg_public_statuses_updated_at BEFORE UPDATE ON public_statuses "
            "FOR EACH ROW EXECUTE FUNCTION gavadr_set_updated_at()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS trg_public_statuses_updated_at ON public_statuses")
    op.drop_table("public_statuses")
