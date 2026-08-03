from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

class RoleBrief(BaseModel):
    id: int
    name: str

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
    role_ids: list[int] = Field(default_factory=list)  # admin gán khi tạo; hoặc default operator

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v


class UserSignupResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    roles: list[RoleBrief]
    is_active: bool
    tokens: TokenResponse


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    password_confirm: Optional[str] = Field(None, min_length=8, max_length=128)
    role_ids: Optional[list[int]] = None
    is_active: Optional[bool] = None

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: Optional[str], info) -> Optional[str]:
        pwd = info.data.get("password")
        if pwd is not None and v != pwd:
            raise ValueError("Passwords do not match")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    roles: list[RoleBrief]
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
