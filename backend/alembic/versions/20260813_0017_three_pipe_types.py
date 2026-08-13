"""Add main, distribution, and service pipe types.

Revision ID: 20260813_0017
Revises: 20260813_0016
"""

from alembic import op


revision = "20260813_0017"
down_revision = "20260813_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE pipes DROP CONSTRAINT ck_pipes_pipe_type")
    op.execute(
        """
        UPDATE pipes
        SET pipe_type = CASE
            WHEN LOWER(TRIM(pipe_type)) IN ('distribution', 'main', 'main_pipe', 'hovedledning', 'hovedforsyningsledning') THEN 'main'
            WHEN LOWER(TRIM(pipe_type)) IN ('distribution_pipe', 'fordelingsledning', 'forgreningsledning') THEN 'distribution'
            WHEN LOWER(TRIM(pipe_type)) IN ('service', 'service_pipe', 'stikledning', 'tilslutningsledning') THEN 'service'
            ELSE pipe_type
        END
        """
    )
    op.execute(
        """
        ALTER TABLE pipes
        ADD CONSTRAINT ck_pipes_pipe_type
        CHECK (pipe_type IN ('main', 'distribution', 'service')) NOT VALID
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE pipes DROP CONSTRAINT ck_pipes_pipe_type")
    op.execute("UPDATE pipes SET pipe_type = 'distribution' WHERE pipe_type IN ('main', 'distribution')")
    op.execute(
        """
        ALTER TABLE pipes
        ADD CONSTRAINT ck_pipes_pipe_type
        CHECK (pipe_type IN ('distribution', 'service')) NOT VALID
        """
    )
