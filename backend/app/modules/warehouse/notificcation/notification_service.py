"""Notification CRUD service."""

from datetime import date, datetime, timedelta, timezone
import re
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.modules.warehouse.item_stock.item_stock_model import (
    ItemStock,
    countable_stock_level_criterion,
    positive_stock_quantity_criterion,
)
from app.modules.warehouse.notificcation.notification_model import Notification
from app.modules.warehouse.notificcation.notification_schema import (
    NotificationCreate,
    NotificationListResponse,
    NotificationResponse,
    NotificationUpdate,
)


def list_notifications(
    db: Session,
    *,
    warehouse_id: int,
    page: int = 1,
    page_size: int = 20,
    q: Optional[str] = None,
) -> NotificationListResponse:
    query = db.query(Notification).filter(
        Notification.warehouse_id == warehouse_id,
        Notification.status == "unsolved",
    )
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            Notification.title.ilike(like) | Notification.message.ilike(like)
        )
    total = query.count()
    items = (
        query.order_by(Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def get_notification_by_id(db: Session, notification_id: int) -> Optional[Notification]:
    return db.query(Notification).filter(Notification.id == notification_id).first()


def create_notification(db: Session, body: NotificationCreate) -> Notification:
    notification = Notification(
        warehouse_id=body.warehouse_id,
        title=body.title.strip(),
        message=body.message.strip(),
        action=body.action.strip(),
        notification_type=body.notification_type,
        status=body.status,
    )
    try:
        db.add(notification)
        db.commit()
        db.refresh(notification)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return notification


def update_notification(
    db: Session, notification_id: int, body: NotificationUpdate
) -> Optional[Notification]:
    notification = get_notification_by_id(db, notification_id)
    if not notification:
        return None
    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        notification.title = data["title"].strip()
    if "message" in data:
        notification.message = data["message"].strip()
    if "action" in data:
        notification.action = data["action"].strip()
    if "notification_type" in data:
        notification.notification_type = data["notification_type"]
    if "status" in data:
        notification.status = data["status"]
    try:
        db.commit()
        db.refresh(notification)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return notification


def delete_notification(db: Session, notification_id: int) -> bool:
    notification = get_notification_by_id(db, notification_id)
    if not notification:
        return False
    try:
        db.delete(notification)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return True


def _effective_holding_date(lot_col, fallback_ts):
    return case(
        (
            lot_col.op("~")(r"^\d{2}/\d{2}/\d{2}$"),
            func.to_date(lot_col, "DD/MM/YY"),
        ),
        (
            lot_col.op("~")(r"^\d{6}$"),
            func.to_date(lot_col, "DDMMYY"),
        ),
        else_=func.date(fallback_ts),
    )


def _resolve_holding_date(stock: ItemStock) -> date:
    lot = stock.lot_number_from
    if lot and re.fullmatch(r"^\d{2}/\d{2}/\d{2}$", lot):
        return datetime.strptime(lot, "%d/%m/%y").date()
    if lot and re.fullmatch(r"^\d{6}$", lot):
        return datetime.strptime(lot, "%d%m%y").date()
    return stock.created_at.date()


def check_long_holding_stock(db: Session) -> list[Notification]:
    cutoff_date = (
        datetime.now(timezone.utc).date()
        - timedelta(days=settings.manual_expired_days)
    )
    holding_date = _effective_holding_date(
        ItemStock.lot_number_from,
        ItemStock.created_at,
    )
    stocks = (
        db.query(ItemStock)
        .options(
            joinedload(ItemStock.item),
            joinedload(ItemStock.location),
        )
        .filter(
            ItemStock.is_active.is_(True),
            ItemStock.status.in_(["available", "split"]),
            positive_stock_quantity_criterion(),
            countable_stock_level_criterion(),
            holding_date < cutoff_date,
        )
        .all()
    )

    notifications: list[Notification] = []
    fresh_cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    for stock in stocks:
        if not stock.location:
            continue

        title = f"Hàng {stock.id} đang quá hạn lưu trữ."
        existing = (
            db.query(Notification.id)
            .filter(
                Notification.title == title,
                Notification.updated_at >= fresh_cutoff,
            )
            .first()
        )
        if existing:
            continue

        effective_date = _resolve_holding_date(stock)
        overdue_days = (cutoff_date - effective_date).days
        sku = stock.item.sku if stock.item else "N/A"
        location_name = stock.location.location_name or stock.location.location_code
        notification = Notification(
            warehouse_id=stock.location.warehouse_id,
            title=title,
            message=(
                f"{stock.id} với loại hàng {sku} đang nằm ở vị trí {location_name} "
                f"đã quá hạn {overdue_days} ngày."
            ),
            action="Cần xử lý",
            notification_type="alert",
            status="unsolved",
        )
        db.add(notification)
        notifications.append(notification)
    try:
        db.commit()
        for n in notifications:
            db.refresh(n)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return notifications


def resolve_notification(
    db: Session, notification_id: int
) -> Optional[Notification]:
    notification = get_notification_by_id(db, notification_id)
    if not notification:
        return None
    if notification.notification_type != "alert":
        raise ValueError("Only alert notifications can be resolved")
    if notification.status != "unsolved":
        raise ValueError("Notification is already resolved")
    notification.status = "resolved"
    try:
        db.commit()
        db.refresh(notification)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return notification
