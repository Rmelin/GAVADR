"""Create phase 2 network map data and synthetic development samples.

Revision ID: 20260807_0002
Revises: 20260807_0001
"""

from uuid import UUID

from alembic import op
import sqlalchemy as sa

from app.db.geometry import Geometry

revision = "20260807_0002"
down_revision = "20260807_0001"
branch_labels = None
depends_on = None


def _entity_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    ]


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "addresses",
        sa.Column("external_address_id", sa.String(100), nullable=True),
        sa.Column("street_name", sa.String(120), nullable=False),
        sa.Column("house_number", sa.String(20), nullable=False),
        sa.Column("postal_code", sa.String(4), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("geometry", Geometry("POINT", 25832), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        *_entity_columns(),
        sa.CheckConstraint("length(trim(street_name)) > 0", name="street_name_not_blank"),
        sa.CheckConstraint("length(trim(house_number)) > 0", name="house_number_not_blank"),
        sa.CheckConstraint("length(postal_code) = 4", name="postal_code_length"),
        sa.UniqueConstraint("external_address_id"),
    )
    op.create_table(
        "pipes",
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("geometry", Geometry("LINESTRING", 25832), nullable=False),
        sa.Column("pipe_type", sa.String(50), nullable=False),
        sa.Column("material", sa.String(50), nullable=True),
        sa.Column("diameter_mm", sa.Integer(), nullable=True),
        sa.Column("installation_year", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(30), server_default="in_service", nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("condition", sa.String(30), nullable=True),
        sa.Column("risk_probability", sa.Float(), nullable=True),
        sa.Column("risk_consequence", sa.Float(), nullable=True),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("quality", sa.String(30), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        *_entity_columns(),
        sa.CheckConstraint("length(trim(code)) > 0", name="code_not_blank"),
        sa.CheckConstraint("diameter_mm IS NULL OR diameter_mm > 0", name="diameter_positive"),
        sa.CheckConstraint("installation_year IS NULL OR installation_year BETWEEN 1800 AND 2200", name="installation_year_range"),
        sa.CheckConstraint("risk_probability IS NULL OR risk_probability BETWEEN 0 AND 5", name="risk_probability_range"),
        sa.CheckConstraint("risk_consequence IS NULL OR risk_consequence BETWEEN 0 AND 5", name="risk_consequence_range"),
    )
    op.create_table(
        "valves",
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("geometry", Geometry("POINT", 25832), nullable=False),
        sa.Column("valve_type", sa.String(50), nullable=False),
        sa.Column("normal_position", sa.String(10), server_default="open", nullable=False),
        sa.Column("current_position", sa.String(10), server_default="open", nullable=False),
        sa.Column("status", sa.String(30), server_default="operational", nullable=False),
        sa.Column("last_operated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_inspected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accessibility", sa.String(30), nullable=True),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("quality", sa.String(30), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        *_entity_columns(),
        sa.CheckConstraint("length(trim(code)) > 0", name="code_not_blank"),
        sa.CheckConstraint("normal_position IN ('open', 'closed', 'unknown')", name="normal_position_value"),
        sa.CheckConstraint("current_position IN ('open', 'closed', 'unknown')", name="current_position_value"),
    )
    op.create_table(
        "closure_areas",
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("geometry", Geometry("MULTIPOLYGON", 25832), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_entity_columns(),
        sa.CheckConstraint("length(trim(name)) > 0", name="name_not_blank"),
        sa.CheckConstraint("confidence IS NULL OR confidence BETWEEN 0 AND 1", name="confidence_range"),
    )
    op.create_table(
        "closure_area_valves",
        sa.Column("closure_area_id", sa.Uuid(), nullable=False),
        sa.Column("valve_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["closure_area_id"], ["closure_areas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["valve_id"], ["valves.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "closure_area_addresses",
        sa.Column("closure_area_id", sa.Uuid(), nullable=False),
        sa.Column("address_id", sa.Uuid(), nullable=False),
        *_entity_columns(),
        sa.ForeignKeyConstraint(["closure_area_id"], ["closure_areas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["address_id"], ["addresses.id"], ondelete="CASCADE"),
    )

    for table, columns in {
        "addresses": ["street_name", "postal_code", "city", "active", "updated_by"],
        "pipes": ["pipe_type", "material", "status", "active", "updated_by"],
        "valves": ["valve_type", "status", "updated_by"],
        "closure_areas": ["active", "updated_by"],
        "closure_area_valves": ["closure_area_id", "valve_id", "updated_by"],
        "closure_area_addresses": ["closure_area_id", "address_id", "updated_by"],
    }.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])
    op.create_index("ix_addresses_street_house", "addresses", ["street_name", "house_number"])
    op.create_index("ix_pipes_code", "pipes", ["code"], unique=True)
    op.create_index("ix_valves_code", "valves", ["code"], unique=True)
    op.create_index("ix_closure_areas_name", "closure_areas", ["name"], unique=True)
    op.create_index("uq_closure_area_valves_active", "closure_area_valves", ["closure_area_id", "valve_id"], unique=True)
    op.create_index("uq_closure_area_addresses_active", "closure_area_addresses", ["closure_area_id", "address_id"], unique=True)
    for table in ("addresses", "pipes", "valves", "closure_areas"):
        op.create_index(f"ix_{table}_geometry", table, ["geometry"], postgresql_using="gist")

    _seed_synthetic_data()

    if op.get_bind().dialect.name == "postgresql":
        op.execute("""
            CREATE VIEW qgis_active_valves AS
            SELECT * FROM valves WHERE deleted_at IS NULL
        """)
        op.execute("""
            CREATE VIEW qgis_active_pipes AS
            SELECT * FROM pipes WHERE active = true AND deleted_at IS NULL
        """)
        op.execute("COMMENT ON VIEW qgis_active_valves IS 'Aktive haner til read-only brug i QGIS'")
        op.execute("COMMENT ON VIEW qgis_active_pipes IS 'Aktive ledninger til read-only brug i QGIS'")


def _seed_synthetic_data() -> None:
    # Coordinates and records are invented for development and do not describe the actual network.
    addresses = sa.table(
        "addresses",
        sa.column("id", sa.Uuid()), sa.column("external_address_id", sa.String()),
        sa.column("street_name", sa.String()), sa.column("house_number", sa.String()),
        sa.column("postal_code", sa.String()), sa.column("city", sa.String()),
        sa.column("geometry", Geometry("POINT", 25832)), sa.column("active", sa.Boolean()),
        sa.column("notes", sa.Text()),
    )
    pipes = sa.table(
        "pipes", sa.column("id", sa.Uuid()), sa.column("code", sa.String()),
        sa.column("geometry", Geometry("LINESTRING", 25832)), sa.column("pipe_type", sa.String()),
        sa.column("material", sa.String()), sa.column("diameter_mm", sa.Integer()),
        sa.column("installation_year", sa.Integer()), sa.column("status", sa.String()),
        sa.column("active", sa.Boolean()), sa.column("condition", sa.String()),
        sa.column("risk_probability", sa.Float()), sa.column("risk_consequence", sa.Float()),
        sa.column("source", sa.String()), sa.column("quality", sa.String()), sa.column("notes", sa.Text()),
    )
    valves = sa.table(
        "valves", sa.column("id", sa.Uuid()), sa.column("code", sa.String()),
        sa.column("geometry", Geometry("POINT", 25832)), sa.column("valve_type", sa.String()),
        sa.column("normal_position", sa.String()), sa.column("current_position", sa.String()),
        sa.column("status", sa.String()), sa.column("accessibility", sa.String()),
        sa.column("source", sa.String()), sa.column("quality", sa.String()), sa.column("notes", sa.Text()),
    )
    areas = sa.table(
        "closure_areas", sa.column("id", sa.Uuid()), sa.column("name", sa.String()),
        sa.column("geometry", Geometry("MULTIPOLYGON", 25832)), sa.column("description", sa.Text()),
        sa.column("confidence", sa.Float()), sa.column("active", sa.Boolean()),
    )

    address_ids = [UUID(f"20000000-0000-0000-0000-00000000000{i}") for i in range(1, 6)]
    pipe_ids = [UUID(f"21000000-0000-0000-0000-00000000000{i}") for i in range(1, 5)]
    valve_ids = [UUID(f"22000000-0000-0000-0000-00000000000{i}") for i in range(1, 5)]
    area_ids = [UUID(f"23000000-0000-0000-0000-00000000000{i}") for i in range(1, 3)]

    op.bulk_insert(addresses, [
        {"id": address_ids[0], "external_address_id": "SYN-GAV-001", "street_name": "Gavad Byvej", "house_number": "2", "postal_code": "4293", "city": "Dianalund", "geometry": "POINT (654930 6169200)", "active": True, "notes": "Syntetisk udviklingsdata"},
        {"id": address_ids[1], "external_address_id": "SYN-GAV-002", "street_name": "Gavad Byvej", "house_number": "4", "postal_code": "4293", "city": "Dianalund", "geometry": "POINT (654985 6169218)", "active": True, "notes": "Syntetisk udviklingsdata"},
        {"id": address_ids[2], "external_address_id": "SYN-GAV-003", "street_name": "Kildeengen", "house_number": "1", "postal_code": "4293", "city": "Dianalund", "geometry": "POINT (655055 6169272)", "active": True, "notes": "Syntetisk udviklingsdata"},
        {"id": address_ids[3], "external_address_id": "SYN-GAV-004", "street_name": "Kildeengen", "house_number": "3", "postal_code": "4293", "city": "Dianalund", "geometry": "POINT (655105 6169300)", "active": True, "notes": "Syntetisk udviklingsdata"},
        {"id": address_ids[4], "external_address_id": "SYN-GAV-005", "street_name": "Møllebakken", "house_number": "7", "postal_code": "4293", "city": "Dianalund", "geometry": "POINT (654860 6169280)", "active": True, "notes": "Syntetisk udviklingsdata"},
    ])
    op.bulk_insert(pipes, [
        {"id": pipe_ids[0], "code": "SYN-HL-001", "geometry": "LINESTRING (654800 6169180, 654940 6169210, 655080 6169270)", "pipe_type": "distribution", "material": "PE", "diameter_mm": 110, "installation_year": 2008, "status": "in_service", "active": True, "condition": "good", "risk_probability": 1.0, "risk_consequence": 3.0, "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
        {"id": pipe_ids[1], "code": "SYN-FL-002", "geometry": "LINESTRING (654940 6169210, 654980 6169320)", "pipe_type": "service", "material": "PVC", "diameter_mm": 63, "installation_year": 1998, "status": "in_service", "active": True, "condition": "fair", "risk_probability": 2.0, "risk_consequence": 2.0, "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
        {"id": pipe_ids[2], "code": "SYN-FL-003", "geometry": "LINESTRING (655080 6169270, 655145 6169335)", "pipe_type": "distribution", "material": "PE", "diameter_mm": 90, "installation_year": 2014, "status": "in_service", "active": True, "condition": "good", "risk_probability": 1.0, "risk_consequence": 2.0, "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
        {"id": pipe_ids[3], "code": "SYN-FL-004", "geometry": "LINESTRING (654940 6169210, 654845 6169295)", "pipe_type": "distribution", "material": "cast_iron", "diameter_mm": 80, "installation_year": 1976, "status": "in_service", "active": True, "condition": "monitor", "risk_probability": 3.0, "risk_consequence": 3.0, "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
    ])
    op.bulk_insert(valves, [
        {"id": valve_ids[0], "code": "SYN-V-001", "geometry": "POINT (654940 6169210)", "valve_type": "gate", "normal_position": "open", "current_position": "open", "status": "operational", "accessibility": "roadside", "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
        {"id": valve_ids[1], "code": "SYN-V-002", "geometry": "POINT (655080 6169270)", "valve_type": "gate", "normal_position": "open", "current_position": "open", "status": "operational", "accessibility": "verge", "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
        {"id": valve_ids[2], "code": "SYN-V-003", "geometry": "POINT (654845 6169295)", "valve_type": "gate", "normal_position": "open", "current_position": "open", "status": "inspection_due", "accessibility": "verge", "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
        {"id": valve_ids[3], "code": "SYN-V-004", "geometry": "POINT (655145 6169335)", "valve_type": "section", "normal_position": "open", "current_position": "open", "status": "operational", "accessibility": "roadside", "source": "synthetic", "quality": "illustrative", "notes": "Syntetisk udviklingsdata"},
    ])
    op.bulk_insert(areas, [
        {"id": area_ids[0], "name": "Syntetisk område øst", "geometry": "MULTIPOLYGON (((654920 6169180, 655175 6169180, 655175 6169360, 654920 6169360, 654920 6169180)))", "description": "Illustrativt lukkeområde, ikke baseret på driftsdata", "confidence": 0.75, "active": True},
        {"id": area_ids[1], "name": "Syntetisk område vest", "geometry": "MULTIPOLYGON (((654780 6169160, 654955 6169160, 654955 6169340, 654780 6169340, 654780 6169160)))", "description": "Illustrativt lukkeområde, ikke baseret på driftsdata", "confidence": 0.65, "active": True},
    ])

    area_valves = sa.table("closure_area_valves", sa.column("id", sa.Uuid()), sa.column("closure_area_id", sa.Uuid()), sa.column("valve_id", sa.Uuid()))
    area_addresses = sa.table("closure_area_addresses", sa.column("id", sa.Uuid()), sa.column("closure_area_id", sa.Uuid()), sa.column("address_id", sa.Uuid()))
    op.bulk_insert(area_valves, [
        {"id": UUID("24000000-0000-0000-0000-000000000001"), "closure_area_id": area_ids[0], "valve_id": valve_ids[0]},
        {"id": UUID("24000000-0000-0000-0000-000000000002"), "closure_area_id": area_ids[0], "valve_id": valve_ids[1]},
        {"id": UUID("24000000-0000-0000-0000-000000000003"), "closure_area_id": area_ids[1], "valve_id": valve_ids[0]},
        {"id": UUID("24000000-0000-0000-0000-000000000004"), "closure_area_id": area_ids[1], "valve_id": valve_ids[2]},
    ])
    op.bulk_insert(area_addresses, [
        {"id": UUID("25000000-0000-0000-0000-000000000001"), "closure_area_id": area_ids[0], "address_id": address_ids[1]},
        {"id": UUID("25000000-0000-0000-0000-000000000002"), "closure_area_id": area_ids[0], "address_id": address_ids[2]},
        {"id": UUID("25000000-0000-0000-0000-000000000003"), "closure_area_id": area_ids[0], "address_id": address_ids[3]},
        {"id": UUID("25000000-0000-0000-0000-000000000004"), "closure_area_id": area_ids[1], "address_id": address_ids[0]},
        {"id": UUID("25000000-0000-0000-0000-000000000005"), "closure_area_id": area_ids[1], "address_id": address_ids[4]},
    ])


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP VIEW IF EXISTS qgis_active_pipes")
        op.execute("DROP VIEW IF EXISTS qgis_active_valves")
    op.drop_table("closure_area_addresses")
    op.drop_table("closure_area_valves")
    op.drop_table("closure_areas")
    op.drop_table("valves")
    op.drop_table("pipes")
    op.drop_table("addresses")
