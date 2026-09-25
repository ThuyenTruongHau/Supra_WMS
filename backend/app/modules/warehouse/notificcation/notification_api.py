"""Notification CRUD API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.notificcation import notification_service
from app.modules.warehouse.notificcation.notification_schema import (
    NotificationCreate,
    NotificationListResponse,
    NotificationResponse,
    NotificationUpdate,
)

router = APIRouter(tags=["Notification"])

DbSession = Annotated[Session, Depends(get_db)]

_NOTIFICATION_READ = require_permission("notification:read")
_NOTIFICATION_CREATE = require_permission("notification:create")
_NOTIFICATION_UPDATE = require_permission("notification:update")
_NOTIFICATION_DELETE = require_permission("notification:delete")


@router.get(
    "/notifications",
    response_model=NotificationListResponse,
    dependencies=[Depends(_NOTIFICATION_READ)],
)
def list_notifications(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search in title or message"),
):
    return notification_service.list_notifications(
        db,
        warehouse_id=warehouse_id,
        page=page,
        page_size=page_size,
        q=q,
    )


@router.post(
    "/notifications",
    response_model=NotificationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_NOTIFICATION_CREATE)],
)
def create_notification(body: NotificationCreate, db: DbSession):
    try:
        notification = notification_service.create_notification(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return NotificationResponse.model_validate(notification)


@router.get(
    "/notifications/{notification_id}",
    response_model=NotificationResponse,
    dependencies=[Depends(_NOTIFICATION_READ)],
)
def get_notification(notification_id: int, db: DbSession):
    notification = notification_service.get_notification_by_id(db, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationResponse.model_validate(notification)


@router.patch(
    "/notifications/{notification_id}",
    response_model=NotificationResponse,
    dependencies=[Depends(_NOTIFICATION_UPDATE)],
)
def update_notification(
    notification_id: int, body: NotificationUpdate, db: DbSession
):
    try:
        notification = notification_service.update_notification(
            db, notification_id, body
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationResponse.model_validate(notification)


@router.post(
    "/notifications/{notification_id}/resolve",
    response_model=NotificationResponse,
    dependencies=[Depends(_NOTIFICATION_UPDATE)],
)
def resolve_notification(notification_id: int, db: DbSession):
    try:
        notification = notification_service.resolve_notification(db, notification_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationResponse.model_validate(notification)


@router.delete(
    "/notifications/{notification_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_NOTIFICATION_DELETE)],
)
def delete_notification(notification_id: int, db: DbSession):
    try:
        deleted = notification_service.delete_notification(db, notification_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")
    return None
