"""Index the audit log timeline.

Revision ID: 20260909_0019
Revises: 20260815_0018
"""

from alembic import op


revision = "20260909_0019"
down_revision = "20260815_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
