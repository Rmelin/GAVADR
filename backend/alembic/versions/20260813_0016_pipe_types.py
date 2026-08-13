"""Standardize pipe types used by QGIS and the web map.

Revision ID: 20260813_0016
Revises: 20260812_0015
"""

from alembic import op


revision = "20260813_0016"
down_revision = "20260812_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE pipes
        SET pipe_type = CASE
            WHEN LOWER(TRIM(pipe_type)) IN ('distribution', 'main', 'main_pipe', 'hovedledning') THEN 'distribution'
            WHEN LOWER(TRIM(pipe_type)) IN ('service', 'service_pipe', 'stikledning') THEN 'service'
            ELSE pipe_type
        END
        """
    )
    # Existing unknown values remain available for manual review, while all new edits are constrained.
    op.execute(
        """
        ALTER TABLE pipes
        ADD CONSTRAINT ck_pipes_pipe_type
        CHECK (pipe_type IN ('distribution', 'service')) NOT VALID
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_pipes_pipe_type", "pipes", type_="check")
