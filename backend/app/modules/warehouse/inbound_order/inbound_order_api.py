from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.inbound_order import inbound_order_model  # noqa: F401

_INBOUND_READ = require_permission("inbound:read")
_INBOUND_CREATE = require_permission("inbound:create")
_INBOUND_UPDATE = require_permission("inbound:update")
_INBOUND_DELETE = require_permission("inbound:delete")

router = APIRouter(tags=["Inbound Order"])

DbSession = Annotated[Session, Depends(get_db)]

__all__ = [
    "router",
    "DbSession",
    "_INBOUND_READ",
    "_INBOUND_CREATE",
    "_INBOUND_UPDATE",
    "_INBOUND_DELETE",
]