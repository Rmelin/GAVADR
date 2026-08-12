from pathlib import Path

from sqlalchemy import inspect

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
