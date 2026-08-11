import csv
import hashlib
import io
import math
import re
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Request, Response, UploadFile, status
from pyproj import Transformer
from sqlalchemy import select

from app.api.deps import AdminUser, DbSession
from app.core.config import get_settings
from app.models import Address, AppSetting, AuditLog
from app.schemas.app_setting import (
    AddressImportError,
    AddressImportReport,
    AppSettingResponse,
    AppSettingUpdate,
)

router = APIRouter(prefix="/app-settings", tags=["app settings"])
settings = get_settings()
to_utm32 = Transformer.from_crs(4326, 25832, always_xy=True)

ALIASES = {
    "external_address_id": "external_address_id", "eksternt_adresse_id": "external_address_id", "dar_id": "external_address_id",
    "street_name": "street_name", "vejnavn": "street_name", "vej": "street_name",
    "house_number": "house_number", "husnummer": "house_number", "husnr": "house_number",
    "address": "address", "adresse": "address",
    "postal_code": "postal_code", "postnummer": "postal_code", "postnr": "postal_code",
    "city": "city", "by": "city", "lokalitet": "city",
    "x": "x", "easting": "x", "oest": "x", "ost": "x",
    "y": "y", "northing": "y", "nord": "y",
    "longitude": "x", "lng": "x", "lon": "x", "laengdegrad": "x",
    "latitude": "y", "lat": "y", "breddegrad": "y",
    "active": "active", "aktiv": "active",
    "notes": "notes", "noter": "notes", "note": "notes",
}


def _response(row: AppSetting | None) -> AppSettingResponse:
    return AppSettingResponse(
        organization_name=row.organization_name if row and row.organization_name is not None else settings.organization_name,
        organization_address=row.organization_address if row and row.organization_address is not None else settings.organization_address,
        organization_locality=row.organization_locality if row and row.organization_locality is not None else settings.organization_locality,
        map_default_longitude=row.map_default_longitude if row and row.map_default_longitude is not None else settings.map_default_longitude,
        map_default_latitude=row.map_default_latitude if row and row.map_default_latitude is not None else settings.map_default_latitude,
        map_default_zoom=row.map_default_zoom if row and row.map_default_zoom is not None else settings.map_default_zoom,
        updated_at=row.updated_at if row else None,
    )


async def _row(db: DbSession) -> AppSetting | None:
    return await db.scalar(select(AppSetting).where(AppSetting.setting_key == "default"))


@router.get("/public", response_model=AppSettingResponse)
async def public_settings(response: Response, db: DbSession) -> AppSettingResponse:
    response.headers["Cache-Control"] = "no-cache, must-revalidate"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return _response(await _row(db))


@router.get("", response_model=AppSettingResponse)
async def get_app_settings(db: DbSession, admin: AdminUser) -> AppSettingResponse:
    return _response(await _row(db))


@router.put("", response_model=AppSettingResponse)
async def update_app_settings(
    payload: AppSettingUpdate, request: Request, db: DbSession, admin: AdminUser
) -> AppSettingResponse:
    row = await _row(db)
    if row is None:
        row = AppSetting(setting_key="default")
        db.add(row)
    previous = _response(row).model_dump(mode="json")
    row.organization_name = payload.organization_name
    row.organization_address = payload.organization_address
    row.organization_locality = payload.organization_locality
    row.map_default_longitude = payload.map_default_longitude
    row.map_default_latitude = payload.map_default_latitude
    row.map_default_zoom = payload.map_default_zoom
    row.updated_by = admin.id
    await db.flush()
    db.add(AuditLog(
        actor_user_id=admin.id,
        action="app_settings.update",
        object_type="app_settings",
        object_id=row.id,
        old_data=previous,
        new_data=payload.model_dump(),
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    await db.refresh(row)
    return _response(row)


def _header(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]+", "_", value.strip().lower().replace("æ", "ae").replace("ø", "o").replace("å", "a")).strip("_")
    return ALIASES.get(normalized, normalized)


def _boolean(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized in ("", "true", "1", "ja", "yes"): return True
    if normalized in ("false", "0", "nej", "no"): return False
    raise ValueError("Aktiv skal være ja/nej, true/false eller 1/0.")


def _split_address(value: str) -> tuple[str, str]:
    match = re.fullmatch(r"(.+?)\s+(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)", value.strip())
    if not match:
        raise ValueError("Adresse skal slutte med et husnummer, fx Gadeledsvej 66A.")
    return match.group(1).strip(), match.group(2).strip()


@router.post("/address-import", response_model=AddressImportReport)
async def import_addresses(
    request: Request,
    db: DbSession,
    admin: AdminUser,
    file: UploadFile = File(...),
    crs: Annotated[Literal["EPSG:25832", "EPSG:4326"], Form()] = "EPSG:25832",
    commit: Annotated[bool, Form()] = False,
) -> AddressImportReport:
    content = await file.read(settings.address_import_max_bytes + 1)
    if len(content) > settings.address_import_max_bytes:
        return AddressImportReport(filename=Path(file.filename or "adresser.csv").name, rows=0, new_rows=0, skipped_rows=0, created_rows=0, committed=False, errors=[AddressImportError(row=0, message="Filen er større end den tilladte grænse.")])
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return AddressImportReport(filename=Path(file.filename or "adresser.csv").name, rows=0, new_rows=0, skipped_rows=0, created_rows=0, committed=False, errors=[AddressImportError(row=0, message="Filen skal være UTF-8-kodet.")])

    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=";,")
        raw_reader = csv.reader(io.StringIO(text), dialect)
        raw_headers = next(raw_reader)
    except (csv.Error, StopIteration):
        return AddressImportReport(filename=Path(file.filename or "adresser.csv").name, rows=0, new_rows=0, skipped_rows=0, created_rows=0, committed=False, errors=[AddressImportError(row=1, message="CSV-headeren kunne ikke læses.")])

    headers = [_header(value) for value in raw_headers]
    if len(headers) != len(set(headers)):
        return AddressImportReport(filename=Path(file.filename or "adresser.csv").name, rows=0, new_rows=0, skipped_rows=0, created_rows=0, committed=False, errors=[AddressImportError(row=1, message="CSV-filen indeholder dublerede kolonner.")])
    required = {"postal_code", "city", "x", "y"}
    if not required.issubset(headers) or not ({"street_name", "house_number"}.issubset(headers) or "address" in headers):
        return AddressImportReport(filename=Path(file.filename or "adresser.csv").name, rows=0, new_rows=0, skipped_rows=0, created_rows=0, committed=False, errors=[AddressImportError(row=1, message="Krævede kolonner: adresse eller vejnavn+husnummer, postnummer, lokalitet, x og y.")])

    reader = csv.DictReader(io.StringIO(text), fieldnames=headers, dialect=dialect)
    next(reader, None)
    existing = (await db.scalars(select(Address))).all()
    external_ids = {row.external_address_id for row in existing if row.external_address_id}
    natural_keys = {(row.street_name.strip().casefold(), row.house_number.strip().casefold(), row.postal_code) for row in existing if row.deleted_at is None}
    file_external_ids: set[str] = set()
    file_natural_keys: set[tuple[str, str, str]] = set()
    prepared: list[dict[str, object]] = []
    errors: list[AddressImportError] = []
    skipped = 0
    rows = 0

    for row_number, raw in enumerate(reader, start=2):
        if not any((value or "").strip() for value in raw.values()):
            continue
        rows += 1
        if rows > settings.address_import_max_rows:
            errors.append(AddressImportError(row=row_number, message=f"Filen må højst indeholde {settings.address_import_max_rows} adresser."))
            break
        try:
            values = {key: (value or "").strip() for key, value in raw.items()}
            if values.get("address"):
                street_name, house_number = _split_address(values["address"])
            else:
                street_name, house_number = values.get("street_name", ""), values.get("house_number", "")
            postal_code, city = values.get("postal_code", ""), values.get("city", "")
            external_id = values.get("external_address_id") or None
            if not street_name or len(street_name) > 120: raise ValueError("Vejnavn mangler eller er længere end 120 tegn.")
            if not house_number or len(house_number) > 20: raise ValueError("Husnummer mangler eller er længere end 20 tegn.")
            if len(postal_code) != 4 or not postal_code.isdigit(): raise ValueError("Postnummer skal bestå af fire cifre.")
            if not city or len(city) > 100: raise ValueError("Lokalitet mangler eller er længere end 100 tegn.")
            if external_id and len(external_id) > 100: raise ValueError("Eksternt adresse-ID er længere end 100 tegn.")
            x, y = float(values.get("x", "")), float(values.get("y", ""))
            if not math.isfinite(x) or not math.isfinite(y): raise ValueError("Koordinaterne skal være gyldige tal.")
            if crs == "EPSG:4326":
                if not (7 <= x <= 16 and 54 <= y <= 58): raise ValueError("Længde-/breddegrad ligger uden for Danmark.")
                x, y = to_utm32.transform(x, y)
            if not (100_000 <= x <= 1_000_000 and 6_000_000 <= y <= 6_500_000): raise ValueError("Koordinaterne ligger uden for det forventede danske område i EPSG:25832.")
            natural_key = (street_name.casefold(), house_number.casefold(), postal_code)
            if external_id in file_external_ids or natural_key in file_natural_keys: raise ValueError("Adressen forekommer flere gange i CSV-filen.")
            file_external_ids.add(external_id) if external_id else None
            file_natural_keys.add(natural_key)
            if (external_id and external_id in external_ids) or natural_key in natural_keys:
                skipped += 1
                continue
            prepared.append({
                "external_address_id": external_id, "street_name": street_name, "house_number": house_number,
                "postal_code": postal_code, "city": city, "geometry": f"POINT ({x:.3f} {y:.3f})",
                "active": _boolean(values.get("active", "")), "notes": values.get("notes") or None,
            })
        except (ValueError, TypeError) as exc:
            errors.append(AddressImportError(row=row_number, message=str(exc)))

    filename = Path(file.filename or "adresser.csv").name
    total_skipped = skipped + len(errors)
    if not commit or not prepared:
        return AddressImportReport(filename=filename, rows=rows, new_rows=len(prepared), skipped_rows=total_skipped, created_rows=0, errors=errors, committed=False)

    for values in prepared:
        db.add(Address(**values, updated_by=admin.id))
    db.add(AuditLog(
        actor_user_id=admin.id,
        action="address.import",
        object_type="address_import",
        new_data={"filename": filename, "sha256": hashlib.sha256(content).hexdigest(), "created": len(prepared), "skipped": total_skipped, "errors": len(errors), "crs": crs},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return AddressImportReport(filename=filename, rows=rows, new_rows=len(prepared), skipped_rows=total_skipped, created_rows=len(prepared), errors=errors, committed=True)
