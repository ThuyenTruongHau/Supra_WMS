from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

NotificationStatus = Literal["unsolved", "resolved"]
NotificationType = Literal["alert", "info"]


class NotificationCreate(BaseModel):
    warehouse_id: int
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    action: str = Field(..., min_length=1, max_length=255)
    notification_type: NotificationType = "alert"
    status: NotificationStatus = "unsolved"


class NotificationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    message: Optional[str] = Field(None, min_length=1)
    action: Optional[str] = Field(None, min_length=1, max_length=255)
    notification_type: Optional[NotificationType] = None
    status: Optional[NotificationStatus] = None


class NotificationResponse(BaseModel):
    id: int
    warehouse_id: int
    title: str
    message: str
    action: str
    notification_type: str
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int
