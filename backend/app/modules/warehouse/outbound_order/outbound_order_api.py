from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.outbound_order import outbound_order_model  # noqa: F401

# Use on each endpoint when implemented:
# dependencies=[Depends(require_permission("outbound:read|create|update|delete"))]
_OUTBOUND_READ = require_permission("outbound:read")
_OUTBOUND_CREATE = require_permission("outbound:create")
_OUTBOUND_UPDATE = require_permission("outbound:update")
_OUTBOUND_DELETE = require_permission("outbound:delete")

router = APIRouter(tags=["Outbound Order"])

DbSession = Annotated[Session, Depends(get_db)]

__all__ = [
    "router",
    "DbSession",
    "_OUTBOUND_READ",
    "_OUTBOUND_CREATE",
    "_OUTBOUND_UPDATE",
    "_OUTBOUND_DELETE",
]