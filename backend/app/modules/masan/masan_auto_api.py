from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.auth.auth_model import User
from app.modules.auth.auth_access import user_is_admin
from app.modules.masan import masan_auto_service as service
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse

router = APIRouter(prefix="/masan/outbound-orders/auto-dispatch", tags=["Automatic outbound"])
Db = Annotated[Session, Depends(get_db)]
ReadUser = Annotated[User, Depends(require_permission("outbound:read"))]
WriteUser = Annotated[User, Depends(require_permission("outbound:update"))]


class AutoScope(BaseModel):
    warehouse_id: int = Field(gt=0)
    display_zone_id: Literal[8, 9]


class AutoVtStatus(BaseModel):
    location_id: int
    name: str
    location_status: str
    cycle_id: int | None = None
    execution_mode: str | None = None
    phase: str
    message: str | None = None
    pick_order_id: str | None = None
    return_order_id: str | None = None
    remaining_quantity: int = 0


class ReturnCandidate(BaseModel):
    task_id: int
    order_id: str
    location_id: int
    name: str
    quantity: int
    state: str
    message: str
    can_verify: bool
    business_ready: bool


class AutoStatus(AutoScope):
    enabled: bool
    state: str
    message: str | None = None
    vts: list[AutoVtStatus]
    return_candidates: list[ReturnCandidate] = Field(default_factory=list)


class VerifyUnsent(AutoScope):
    note: str = Field(min_length=1, max_length=2000)


def check_access(db, user, warehouse_id):
    if not db.get(Warehouse, warehouse_id):
        raise HTTPException(404, "Warehouse not found")
    if not user_is_admin(user) and not any(w.id == warehouse_id for w in (user.warehouses or [])):
        raise HTTPException(403, "Warehouse access denied")


def invoke(operation, *args):
    try:
        return operation(*args)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/start", response_model=AutoStatus)
def start_auto(body: AutoScope, db: Db, user: WriteUser):
    check_access(db, user, body.warehouse_id)
    return invoke(service.start, db, body.warehouse_id, body.display_zone_id, user.id)


@router.post("/stop", response_model=AutoStatus)
def stop_auto(body: AutoScope, db: Db, user: WriteUser):
    check_access(db, user, body.warehouse_id)
    return invoke(service.stop, db, body.warehouse_id, body.display_zone_id)


@router.get("/status", response_model=AutoStatus)
def auto_status(db: Db, user: ReadUser, warehouse_id: int = Query(gt=0), display_zone_id: int = Query(ge=8, le=9)):
    check_access(db, user, warehouse_id)
    return invoke(service.status, db, warehouse_id, display_zone_id)


@router.post("/cycles/{cycle_id}/return", response_model=AutoStatus)
def return_cycle(cycle_id: int, body: AutoScope, db: Db, user: WriteUser):
    check_access(db, user, body.warehouse_id)
    return invoke(service.manual_return, db, body.warehouse_id, body.display_zone_id, cycle_id)


@router.post("/returns/{task_id}/verify-unsent", response_model=AutoStatus)
def verify_unsent(task_id: int, body: VerifyUnsent, db: Db, user: WriteUser):
    check_access(db, user, body.warehouse_id)
    from app.modules.masan.masan_return_adoption_service import verify_unsent as verify
    return invoke(verify, db, body.warehouse_id, body.display_zone_id, task_id, user.id, body.note)
