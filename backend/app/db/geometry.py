from sqlalchemy import String
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.functions import FunctionElement
from sqlalchemy.types import UserDefinedType


class _GeometryFromText(FunctionElement):
    type = String()
    inherit_cache = True


class _GeometryAsText(FunctionElement):
    type = String()
    inherit_cache = True


@compiles(_GeometryFromText, "postgresql")
def _compile_geometry_from_text_postgresql(element, compiler, **kw) -> str:
    value, srid = list(element.clauses)
    return f"ST_GeomFromText({compiler.process(value, **kw)}, {compiler.process(srid, **kw)})"


@compiles(_GeometryFromText, "sqlite")
def _compile_geometry_from_text_sqlite(element, compiler, **kw) -> str:
    value, _ = list(element.clauses)
    return compiler.process(value, **kw)


@compiles(_GeometryAsText, "postgresql")
def _compile_geometry_as_text_postgresql(element, compiler, **kw) -> str:
    return f"ST_AsText({compiler.process(list(element.clauses)[0], **kw)})"


@compiles(_GeometryAsText, "sqlite")
def _compile_geometry_as_text_sqlite(element, compiler, **kw) -> str:
    return compiler.process(list(element.clauses)[0], **kw)


class Geometry(UserDefinedType[str]):
    """PostGIS geometry in production and WKT text in SQLite tests."""

    cache_ok = True

    def __init__(self, geometry_type: str, srid: int = 25832) -> None:
        self.geometry_type = geometry_type.upper()
        self.srid = srid

    def get_col_spec(self, **kw) -> str:
        return f"geometry({self.geometry_type},{self.srid})"

    def bind_expression(self, bindvalue: ColumnElement) -> ColumnElement:
        return _GeometryFromText(bindvalue, self.srid)

    def column_expression(self, column: ColumnElement) -> ColumnElement:
        return _GeometryAsText(column)


@compiles(Geometry, "sqlite")
def _compile_geometry_sqlite(type_, compiler, **kw) -> str:
    return "TEXT"
