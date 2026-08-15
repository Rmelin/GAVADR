from pathlib import Path

from sqlalchemy import CheckConstraint, inspect

from app.db.base import Base


def test_planned_shutdown_incident_metadata_has_real_keys_and_unique_pair():
    table = Base.metadata.tables["planned_shutdown_incidents"]
    foreign_keys = {(fk.parent.name, fk.target_fullname, fk.ondelete) for fk in table.foreign_keys}
    assert foreign_keys >= {
        ("shutdown_id", "planned_shutdowns.id", "CASCADE"),
        ("incident_id", "incidents.id", "CASCADE"),
    }
    assert any(
        index.unique and [column.name for column in index.columns] == ["shutdown_id", "incident_id"]
        for index in table.indexes
    )
    assert "activity_type" not in inspect(table).columns
    assert "activity_type" not in Base.metadata.tables["incidents"].columns
    assert "activity_type" not in Base.metadata.tables["planned_shutdowns"].columns


def test_network_migration_does_not_seed_synthetic_samples():
    migration = Path(__file__).parents[1] / "alembic/versions/20260807_0002_network_map_data.py"
    source = migration.read_text()
    assert "\n    _seed_synthetic_data()\n" not in source


def test_three_pipe_types_migration_uses_exact_constraint_name():
    migration = Path(__file__).parents[1] / "alembic/versions/20260813_0017_three_pipe_types.py"
    source = migration.read_text()
    assert source.count("ALTER TABLE pipes DROP CONSTRAINT ck_pipes_pipe_type") == 2
    assert "op.drop_constraint" not in source


def test_valve_network_level_is_nullable_and_constrained():
    table = Base.metadata.tables["valves"]
    assert table.columns["network_level"].nullable
    constraints = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert constraints["ck_valves_network_level_value"] == "network_level IS NULL OR network_level IN ('main', 'distribution', 'service')"

    migration = Path(__file__).parents[1] / "alembic/versions/20260815_0018_valve_network_levels.py"
    assert migration.read_text().count('op.f("ck_valves_network_level_value")') == 2
