"""Make inquiry contact name optional for address-first registration.

Revision ID: 20260909_0020
Revises: 20260909_0019
"""

from alembic import op
import sqlalchemy as sa


revision = "20260909_0020"
down_revision = "20260909_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("inquiries", "contact_name", existing_type=sa.String(200), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE inquiries SET contact_name = 'Ikke angivet' WHERE contact_name IS NULL")
    op.alter_column("inquiries", "contact_name", existing_type=sa.String(200), nullable=False)
