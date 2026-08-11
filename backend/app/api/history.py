import csv
import io
from datetime import date, datetime, time, timezone
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import case, exists, func, literal, or_, select, union_all

from app.activity import incident_activity_type_expression
from app.api.deps import CurrentUser, DbSession
from app.models import Address, Incident, PlannedShutdown, PlannedShutdownAddress
from app.schemas.history import HistoryCategory, HistoryItem, HistoryResponse, HistorySummary


router = APIRouter(prefix="/history", tags=["history"])
LOCAL_TIMEZONE = ZoneInfo("Europe/Copenhagen")


def _bounds(from_date: date | None, to_date: date | None) -> tuple[datetime | None, datetime | None]:
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="Fra-dato skal være før eller lig med til-dato.")
    start = datetime.combine(from_date, time.min, LOCAL_TIMEZONE).astimezone(timezone.utc) if from_date else None
    end = datetime.combine(to_date, time.max, LOCAL_TIMEZONE).astimezone(timezone.utc) if to_date else None
    return start, end


def _location_condition(columns: tuple, query: str):
    pattern = f"%{query.strip()}%"
    return or_(*(func.lower(column).like(func.lower(pattern)) for column in columns))


def _history_query(
    from_date: date | None,
    to_date: date | None,
    categories: list[HistoryCategory],
    location: str | None,
):
    start, end = _bounds(from_date, to_date)
    incident_category = incident_activity_type_expression(Incident.type)
    incidents = select(
        Incident.id.label("id"),
        literal("incident").label("source"),
        incident_category.label("category"),
        Incident.number.label("number"),
        Incident.title.label("title"),
        Incident.status.label("status"),
        Incident.registered_at.label("occurred_at"),
        Incident.expected_end_at.label("expected_end_at"),
    ).where(Incident.deleted_at.is_(None))
    shutdowns = select(
        PlannedShutdown.id.label("id"),
        literal("planned_shutdown").label("source"),
        literal("shutdown").label("category"),
        PlannedShutdown.number.label("number"),
        PlannedShutdown.title.label("title"),
        PlannedShutdown.status.label("status"),
        PlannedShutdown.starts_at.label("occurred_at"),
        PlannedShutdown.expected_end_at.label("expected_end_at"),
    ).where(PlannedShutdown.deleted_at.is_(None))

    if start:
        incidents = incidents.where(Incident.registered_at >= start)
        shutdowns = shutdowns.where(PlannedShutdown.starts_at >= start)
    if end:
        incidents = incidents.where(Incident.registered_at <= end)
        shutdowns = shutdowns.where(PlannedShutdown.starts_at <= end)
    if location and location.strip():
        incident_location = exists(
            select(Address.id).where(
                Address.id == Incident.address_id,
                _location_condition(
                    (Address.street_name, Address.house_number, Address.postal_code, Address.city), location
                ),
            )
        )
        shutdown_location = exists(
            select(PlannedShutdownAddress.id)
            .join(Address, Address.id == PlannedShutdownAddress.address_id)
            .where(
                PlannedShutdownAddress.shutdown_id == PlannedShutdown.id,
                PlannedShutdownAddress.deleted_at.is_(None),
                PlannedShutdownAddress.included.is_(True),
                _location_condition(
                    (Address.street_name, Address.house_number, Address.postal_code, Address.city), location
                ),
            )
        )
        incidents = incidents.where(incident_location)
        shutdowns = shutdowns.where(shutdown_location)

    combined = union_all(incidents, shutdowns).subquery()
    query = select(combined)
    if categories:
        query = query.where(combined.c.category.in_(categories))
    return query, combined


def _shutdown_status(status: str, starts_at: datetime, expected_end_at: datetime | None, now: datetime) -> str:
    if status in ("draft", "completed", "cancelled"):
        return status
    starts_at = starts_at.replace(tzinfo=timezone.utc) if starts_at.tzinfo is None else starts_at.astimezone(timezone.utc)
    if expected_end_at:
        expected_end_at = expected_end_at.replace(tzinfo=timezone.utc) if expected_end_at.tzinfo is None else expected_end_at.astimezone(timezone.utc)
        if expected_end_at <= now:
            return "completed"
    return "in_progress" if starts_at <= now else "planned"


def _address_label(street: str, house_number: str, postal_code: str, city: str) -> str:
    return f"{street} {house_number}, {postal_code} {city}"


async def _locations(db: DbSession, rows) -> dict[tuple[str, UUID], list[str]]:
    incident_ids = [row.id for row in rows if row.source == "incident"]
    shutdown_ids = [row.id for row in rows if row.source == "planned_shutdown"]
    result: dict[tuple[str, UUID], list[str]] = {}
    if incident_ids:
        address_rows = (await db.execute(
            select(Incident.id, Address.street_name, Address.house_number, Address.postal_code, Address.city)
            .outerjoin(Address, Address.id == Incident.address_id)
            .where(Incident.id.in_(incident_ids))
        )).all()
        for row in address_rows:
            result[("incident", row.id)] = (
                [_address_label(row.street_name, row.house_number, row.postal_code, row.city)]
                if row.street_name else []
            )
    if shutdown_ids:
        address_rows = (await db.execute(
            select(
                PlannedShutdownAddress.shutdown_id,
                Address.street_name,
                Address.house_number,
                Address.postal_code,
                Address.city,
            )
            .join(Address, Address.id == PlannedShutdownAddress.address_id)
            .where(
                PlannedShutdownAddress.shutdown_id.in_(shutdown_ids),
                PlannedShutdownAddress.deleted_at.is_(None),
                PlannedShutdownAddress.included.is_(True),
            )
            .order_by(Address.street_name, Address.house_number)
        )).all()
        for row in address_rows:
            result.setdefault(("planned_shutdown", row.shutdown_id), []).append(
                _address_label(row.street_name, row.house_number, row.postal_code, row.city)
            )
    return result


async def _items(db: DbSession, rows) -> list[HistoryItem]:
    locations = await _locations(db, rows)
    now = datetime.now(timezone.utc)
    return [
        HistoryItem(
            id=row.id,
            source=row.source,
            category=row.category,
            activity_type=row.category,
            number=row.number,
            title=row.title,
            status=(
                _shutdown_status(row.status, row.occurred_at, row.expected_end_at, now)
                if row.source == "planned_shutdown" else row.status
            ),
            occurred_at=row.occurred_at,
            expected_end_at=row.expected_end_at,
            locations=locations.get((row.source, row.id), []),
            affected_address_count=(len(locations.get((row.source, row.id), [])) if row.source == "planned_shutdown" else None),
            href=(f"/vandlukninger/{row.id}" if row.source == "planned_shutdown" else f"/haendelser/{row.id}"),
        )
        for row in rows
    ]


async def _filtered_rows(
    db: DbSession,
    from_date: date | None,
    to_date: date | None,
    categories: list[HistoryCategory],
    location: str | None,
):
    query, combined = _history_query(from_date, to_date, categories, location)
    if categories:
        summary_source = select(combined).where(combined.c.category.in_(categories)).subquery()
    else:
        summary_source = combined
    counts = dict((await db.execute(
        select(summary_source.c.category, func.count()).group_by(summary_source.c.category)
    )).all())
    return query, HistorySummary(
        total=sum(counts.values()),
        breaks=counts.get("break", 0),
        shutdowns=counts.get("shutdown", 0),
        excavations=counts.get("excavation", 0),
        other_incidents=counts.get("other_incident", 0),
    )


@router.get("", response_model=HistoryResponse)
async def list_history(
    db: DbSession,
    user: CurrentUser,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    category: Annotated[list[HistoryCategory], Query()] = [],
    location: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> HistoryResponse:
    query, summary = await _filtered_rows(db, from_date, to_date, category, location)
    rows = (await db.execute(
        query.order_by(query.selected_columns.occurred_at.desc(), query.selected_columns.source, query.selected_columns.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()
    total_pages = (summary.total + page_size - 1) // page_size
    return HistoryResponse(
        items=await _items(db, rows), summary=summary, page=page, page_size=page_size, total_pages=total_pages
    )


def _csv_cell(value: object) -> str:
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(("=", "+", "-", "@")) else text


@router.get("/export.csv")
async def export_history(
    db: DbSession,
    user: CurrentUser,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    category: Annotated[list[HistoryCategory], Query()] = [],
    location: Annotated[str | None, Query(max_length=120)] = None,
) -> Response:
    query, _ = await _filtered_rows(db, from_date, to_date, category, location)
    rows = (await db.execute(
        query.order_by(query.selected_columns.occurred_at.desc(), query.selected_columns.source, query.selected_columns.id)
    )).all()
    items = await _items(db, rows)
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    writer.writerow(["Dato", "Type", "Nummer", "Titel", "Status", "Sted", "Berørte adresser"])
    labels = {
        "break": "Brud",
        "shutdown": "Vandlukning",
        "excavation": "Andet gravearbejde",
        "other_incident": "Andre hændelser",
    }
    for item in items:
        writer.writerow([
            item.occurred_at.isoformat(), labels[item.category], _csv_cell(item.number), _csv_cell(item.title),
            item.status, _csv_cell(" | ".join(item.locations)), item.affected_address_count or "",
        ])
    filename = f"historik-{date.today().isoformat()}.csv"
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
