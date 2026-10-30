from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.auth.auth_access import user_is_admin
from app.modules.auth.auth_model import User
from app.modules.masan import masan_inbound_dispatch_service as service
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse

router = APIRouter(prefix="/masan/inbound-orders/auto-dispatch", tags=["Inbound dispatch"])
Db = Annotated[Session, Depends(get_db)]
ReadUser = Annotated[User, Depends(require_permission("inbound:read"))]
WriteUser = Annotated[User, Depends(require_permission("inbound:update"))]


class Scope(BaseModel):
    warehouse_id: int = Field(gt=0)


class VerifyUnsent(Scope):
    note: str = Field(min_length=1, max_length=2000)


class Problem(BaseModel):
    command_id: int
    order_id: str | None
    detail_id: int
    state: str
    message: str | None


class DispatchStatus(Scope):
    enabled: bool
    state: Literal["idle", "running", "paused", "needs_review"]
    batch_id: int | None
    batch_code: str | None
    waiting_count: int
    issued_count: int
    review_count: int
    assign_robot_id: str | None
    sorting_persons: str | None
    changed_by_id: int | None
    changed_at: datetime | None
    message: str | None
    problems: list[Problem]


def check_access(db, user, warehouse_id):
    if not db.get(Warehouse, warehouse_id):
        raise HTTPException(404, "Warehouse not found")
    if not user_is_admin(user) and not any(w.id == warehouse_id for w in (user.warehouses or [])):
        raise HTTPException(403, "Warehouse access denied")


def invoke(operation, *args):
    try:
        return operation(*args)
    except service.DispatchConflict as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/status", response_model=DispatchStatus)
def status(db: Db, user: ReadUser, warehouse_id: int = Query(gt=0)):
    check_access(db, user, warehouse_id)
    return invoke(service.status, db, warehouse_id)


@router.post("/pause", response_model=DispatchStatus)
def pause(body: Scope, db: Db, user: WriteUser):
    check_access(db, user, body.warehouse_id)
    return invoke(service.pause, db, body.warehouse_id, user.id)


@router.post("/resume", response_model=DispatchStatus)
def resume(body: Scope, db: Db, user: WriteUser):
    check_access(db, user, body.warehouse_id)
    return invoke(service.resume, db, body.warehouse_id, user.id)


@router.post("/commands/{command_id}/verify-unsent", response_model=DispatchStatus)
def verify_unsent(command_id: int, body: VerifyUnsent, db: Db, user: WriteUser):
    check_access(db, user, body.warehouse_id)
    return invoke(service.verify_unsent, db, body.warehouse_id, command_id, user.id, body.note)
