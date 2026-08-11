# GAVADR backend

Phase 2 map entities are stored internally in ETRS89 / UTM zone 32N (`EPSG:25832`).
PostgreSQL migrations create constrained PostGIS `POINT`, `LINESTRING`, and
`MULTIPOLYGON` columns with GiST indexes. SQLite compiles the same model columns to
WKT text so the test suite does not require SpatiaLite. Authenticated read endpoints
return standard GeoJSON transformed to `EPSG:4326`.

Migration `20260807_0002` includes deterministic records marked as synthetic for
development. They are illustrative only and must not be treated as actual Gavad
Vandværk network or address data.

Run tests with `pytest`. Apply all migrations with `alembic upgrade head`.
