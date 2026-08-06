from datetime import date, datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, Field


class LocationCreate(BaseModel):
    location_code: str = Field(..., min_length=1, max_length=50)
    location_name: str = Field(..., min_length=1, max_length=100)
    row: Optional[str] = Field(None, max_length=10)
    column: Optional[str] = Field(None, max_length=10)
    level: Optional[str] = Field(None, max_length=10)
    node_name: Optional[str] = Field(None, max_length=50)
    warehouse_id: int
    zone_id: Optional[int] = None


class LocationUpdate(BaseModel):
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    location_name: Optional[str] = Field(None, min_length=1, max_length=100)
    row: Optional[str] = Field(None, max_length=10)
    column: Optional[str] = Field(None, max_length=10)
    level: Optional[str] = Field(None, max_length=10)
    node_name: Optional[str] = Field(None, max_length=50)
    warehouse_id: Optional[int] = None
    zone_id: Optional[int] = None
    is_active: Optional[bool] = None


class LocationResponse(BaseModel):
    id: int
    location_code: str
    location_name: str
    row: Optional[str] = None
    column: Optional[str] = None
    level: Optional[str] = None
    node_name: Optional[str] = None
    warehouse_id: int
    zone_id: Optional[int] = None
    is_active: bool
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LocationListResponse(BaseModel):
    items: list[LocationResponse]
    total: int
    page: int
    page_size: int


class MapCreate(BaseModel):
    source: str = Field(..., min_length=1, max_length=255)
    warehouse_id: int
    zone_id: Optional[int] = None
    is_active: bool = Field(default=True)


class MapDataResponse(BaseModel):
    width: int
    height: int
    node_keys: list[str] = Field(..., alias="nodeKeys")
    line_keys: list[str] = Field(..., alias="lineKeys")
    node_arr: list[list[Any]] = Field(..., alias="nodeArr")
    line_arr: list[list[Any]] = Field(..., alias="lineArr")
    type: Optional[str] = None
    x_attr_min: Optional[int] = Field(None, alias="xAttrMin")
    y_attr_min: Optional[int] = Field(None, alias="yAttrMin")
    model_config = ConfigDict(populate_by_name=True)


class MapLocationStockItem(BaseModel):
    sku: str
    lot_number: Optional[str] = None
    quantity: str


class MapLocationItem(BaseModel):
    id: int
    location_code: str
    location_name: Optional[str] = None
    row: Optional[str] = None
    column: Optional[str] = None
    level: Optional[str] = None
    status: str
    item_stock: list[MapLocationStockItem] = []


class LocationsForMapResponse(BaseModel):
    warehouse_id: int
    location_codes: list[str]
    locations: list[MapLocationItem]


class LocationDetailStockItem(BaseModel):
    id: int
    item_id: int
    sku: str
    lot_number: Optional[str] = None
    expiry_date: Optional[date] = None
    quantity: str
    status: str


class LocationDetailSummary(BaseModel):
    item_stock_count: int
    total_quantity: str


class LocationDetailResponse(BaseModel):
    location: LocationResponse
    item_stock: list[LocationDetailStockItem]
    summary: LocationDetailSummary
