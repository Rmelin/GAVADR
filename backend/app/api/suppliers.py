from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, require_roles
from app.models import AuditLog, Supplier, User
from app.schemas.phase5 import SupplierCreate, SupplierOption, SupplierPatch, SupplierResponse

router = APIRouter(prefix="/suppliers", tags=["suppliers"])
EditorUser = Annotated[User, Depends(require_roles("admin", "map_manager"))]


async def _get(db: DbSession, supplier_id: UUID) -> Supplier:
    row = await db.scalar(select(Supplier).where(Supplier.id == supplier_id, Supplier.deleted_at.is_(None)))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplier not found")
    return row


async def _unique(db: DbSession, name: str, exclude_id: UUID | None = None) -> None:
    query = select(Supplier.id).where(func.lower(Supplier.name) == name.casefold(), Supplier.deleted_at.is_(None))
    if exclude_id:
        query = query.where(Supplier.id != exclude_id)
    if await db.scalar(query):
        raise HTTPException(status.HTTP_409_CONFLICT, "Supplier name already exists")


def _audit(db: DbSession, request: Request, user: User, action: str, row: Supplier, fields: list[str]) -> None:
    db.add(AuditLog(actor_user_id=user.id, action=action, object_type="supplier", object_id=row.id,
                    new_data={"changed_fields": fields, "active": row.active},
                    ip_address=request.client.host if request.client else None))


@router.get("/options", response_model=list[SupplierOption])
async def options(db: DbSession, user: CurrentUser) -> list[SupplierOption]:
    rows = (await db.scalars(select(Supplier).where(Supplier.active.is_(True), Supplier.deleted_at.is_(None)).order_by(Supplier.name))).all()
    return [SupplierOption(id=row.id, name=row.name) for row in rows]


@router.get("", response_model=list[SupplierResponse])
async def list_suppliers(db: DbSession, user: CurrentUser) -> list[Supplier]:
    return list((await db.scalars(select(Supplier).where(Supplier.deleted_at.is_(None)).order_by(Supplier.name))).all())


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(payload: SupplierCreate, request: Request, db: DbSession, user: EditorUser) -> Supplier:
    await _unique(db, payload.name)
    row = Supplier(**payload.model_dump(), updated_by=user.id)
    db.add(row)
    await db.flush()
    _audit(db, request, user, "create", row, ["name", "contact_name", "email", "phone", "active"])
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: UUID, db: DbSession, user: CurrentUser) -> Supplier:
    return await _get(db, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierResponse)
async def patch_supplier(supplier_id: UUID, payload: SupplierPatch, request: Request,
                         db: DbSession, user: EditorUser) -> Supplier:
    row = await _get(db, supplier_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        await _unique(db, payload.name, row.id)
    for field, value in changes.items():
        setattr(row, field, value)
    row.updated_by = user.id
    _audit(db, request, user, "update", row, sorted(changes))
    await db.commit()
    await db.refresh(row)
    return row
