"""Resolve aggregated user access for FE (no raw permission codes)."""

from typing import Literal

from sqlalchemy.orm import Session

from app.modules.auth.auth_model import User
from app.modules.auth.auth_schema import (
    MODULE_NAMES,
    ModuleName,
    UserAccessSummary,
    UserResponse,
    WarehouseBrief,
    RoleBrief,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse


WarehouseScope = Literal["all", "assigned"]


def user_is_admin(user: User) -> bool:
    for role in user.roles or []:
        if role.name == "admin":
            return True
        for perm in role.permissions or []:
            if perm.code == "*":
                return True
    return False


def resolve_user_modules(user: User, *, is_admin: bool) -> list[ModuleName]:
    """Tablet/work modules derived from module roles (not permission codes)."""
    if is_admin:
        return list(MODULE_NAMES)
    assigned = {role.name for role in (user.roles or [])}
    return [m for m in MODULE_NAMES if m in assigned]


def resolve_warehouse_scope(is_admin: bool) -> WarehouseScope:
    return "all" if is_admin else "assigned"


def resolve_accessible_warehouses(
    db: Session,
    user: User,
    *,
    is_admin: bool,
) -> list[WarehouseBrief]:
    if is_admin:
        rows = db.query(Warehouse).order_by(Warehouse.id).all()
        return [WarehouseBrief.model_validate(w) for w in rows]
    return [WarehouseBrief.model_validate(w) for w in (user.warehouses or [])]


def build_user_access_summary(db: Session, user: User) -> UserAccessSummary:
    is_admin = user_is_admin(user)
    return UserAccessSummary(
        is_admin=is_admin,
        warehouse_scope=resolve_warehouse_scope(is_admin),
        warehouses=resolve_accessible_warehouses(db, user, is_admin=is_admin),
        modules=resolve_user_modules(user, is_admin=is_admin),
    )


def user_to_response(db: Session, user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        roles=[RoleBrief.model_validate(r) for r in (user.roles or [])],
        warehouses=[WarehouseBrief.model_validate(w) for w in (user.warehouses or [])],
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        access=build_user_access_summary(db, user),
    )
