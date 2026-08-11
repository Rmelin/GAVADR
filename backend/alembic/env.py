from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.db.base import Base
from app.models import (  # noqa: F401
    Address, AppSetting, Attachment, AuditLog, ClosureArea, ClosureAreaAddress, ClosureAreaValve, ClosureScenario, ClosureScenarioArea, ClosureScenarioValve,
    Incident, IncidentUpdate, InquiryAttachment, MapCorrectionAttachment, Notification, Pipe, PlannedShutdown, PlannedShutdownAddress,
    PlannedShutdownClosureArea, PlannedShutdownIncident, PlannedShutdownValve, PublicStatus, Role, User, Valve,
)

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url)
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(object_, name: str | None, type_: str, reflected: bool, compare_to) -> bool:
    # PostGIS owns this reference table; it is not part of the application schema.
    return not (type_ == "table" and name == "spatial_ref_sys")


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    import asyncio

    asyncio.run(run_async_migrations())
