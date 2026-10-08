"""Access checks for the warehouse viewer on the inbound operator page."""

from typing import Annotated, Callable

from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_user, require_permission
from app.modules.auth.auth_access import user_is_admin
from app.modules.auth.auth_model import User


def require_warehouse_view_permission(permission_code: str) -> Callable:
    """Let inbound staff view assigned warehouses, preserving existing map RBAC."""
    check_permission = require_permission(permission_code)

    def checker(
        warehouse_id: int,
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if user_is_admin(current_user):
            return current_user

        if any(role.name == "inbound" for role in (current_user.roles or [])):
            if not any(
                warehouse.id == warehouse_id
                for warehouse in (current_user.warehouses or [])
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Warehouse access denied",
                )
            return current_user

        return check_permission(current_user)

    return checker
