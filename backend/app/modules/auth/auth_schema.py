from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

ModuleName = Literal["inbound", "outbound", "stocktake"]
MODULE_NAMES: tuple[ModuleName, ...] = ("inbound", "outbound", "stocktake")


class RoleBrief(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class WarehouseBrief(BaseModel):
    id: int
    code: str
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None  # signup/login có; refresh-only có thể chỉ access
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    password_confirm: str = Field(..., min_length=8, max_length=128)
    role_ids: list[int] = Field(default_factory=list)
    is_admin: bool = False
    warehouse_ids: list[int] = Field(default_factory=list)
    modules: list[ModuleName] = Field(default_factory=list)

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v

    @field_validator("modules")
    @classmethod
    def unique_modules(cls, v: list[ModuleName]) -> list[ModuleName]:
        # Preserve order, drop duplicates
        seen: set[str] = set()
        result: list[ModuleName] = []
        for m in v:
            if m not in seen:
                seen.add(m)
                result.append(m)
        return result


class UserSignupResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    roles: list[RoleBrief]
    warehouses: list[WarehouseBrief] = Field(default_factory=list)
    is_active: bool
    tokens: TokenResponse


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    password_confirm: Optional[str] = Field(None, min_length=8, max_length=128)
    role_ids: Optional[list[int]] = None
    is_admin: Optional[bool] = None
    warehouse_ids: Optional[list[int]] = None
    modules: Optional[list[ModuleName]] = None

    @field_validator("password", "password_confirm", mode="before")
    @classmethod
    def empty_password_to_none(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: Optional[str], info) -> Optional[str]:
        pwd = info.data.get("password")
        if pwd is not None and v != pwd:
            raise ValueError("Passwords do not match")
        return v

    @field_validator("modules")
    @classmethod
    def unique_modules(cls, v: Optional[list[ModuleName]]) -> Optional[list[ModuleName]]:
        if v is None:
            return None
        seen: set[str] = set()
        result: list[ModuleName] = []
        for m in v:
            if m not in seen:
                seen.add(m)
                result.append(m)
        return result


class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    roles: list[RoleBrief]
    warehouses: list[WarehouseBrief] = Field(default_factory=list)
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    user: UserResponse
    tokens: TokenResponse


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
