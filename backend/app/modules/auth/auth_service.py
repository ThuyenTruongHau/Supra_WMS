"""Authentication service."""

from datetime import timedelta, datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError
from app.core.config import settings
from app.modules.auth.auth_model import User, Role
from app.modules.auth.auth_schema import LoginRequest, LoginResponse, TokenResponse, UserCreate, UserSignupResponse, UserResponse, UserUpdate, UserListResponse
from app.core.security import verify_password, decode_refresh_token, create_access_token, create_refresh_token, get_password_hash

def _user_query(db: Session, *, include_inactive: bool = False):
    q = db.query(User).options(selectinload(User.roles))
    if not include_inactive:
        q = q.filter(User.is_active.is_(True))
    return q

def _get_roles_by_ids(db: Session, role_ids: list[int]) -> list[Role]:
    if not role_ids:
        return []
    roles = db.query(Role).filter(Role.id.in_(role_ids)).all()
    missing = set(role_ids) - {r.id for r in roles}
    if missing:
        raise ValueError(f"Role ids not found: {sorted(missing)}")
    return roles

def _assign_roles(db: Session, user: User, role_ids: list[int]) -> None:
    user.roles = _get_roles_by_ids(db, role_ids)

def login(db: Session, body: LoginRequest) -> LoginResponse:
    user = authenticate_user(db, body.username, body.password)
    if not user:
        raise ValueError("Invalid username or password")
    return LoginResponse(
        user=UserResponse.model_validate(user),
        tokens=TokenResponse(
            access_token=create_access_token({"sub": user.username}),
            refresh_token=create_refresh_token({"sub": user.username}),
            token_type="bearer",
        ),
    )

def sign_up(db: Session, user_in: UserCreate)->UserSignupResponse:
    if db.query(User).filter(User.username == user_in.username).first():
        raise ValueError("User with this username already exists")

    if db.query(User).filter(User.email == user_in.email).first():
        raise ValueError("User with this email already exists")

    new_user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        is_active=True,
    )
    # add into db
    try:
        db.add(new_user)
        db.flush()  # có id trước khi gán role
        if user_in.role_ids:
            _assign_roles(db, new_user, user_in.role_ids)

        db.commit()
        new_user = _user_query(db, include_inactive=True).filter(User.id == new_user.id).one()
    except ValueError:
        db.rollback()
        raise
    except IntegrityError as e:
        db.rollback()
        # error from pgsql
        raise ValueError(f"Database conflict: {str(e.orig)}")
    #generate accessToken
    access_token= create_access_token({"sub": new_user.username})
    refresh_access_token= create_refresh_token({"sub": new_user.username})
    
    # define Response to this function
    tokens=TokenResponse(
        access_token=access_token,
        refresh_token=refresh_access_token,
        token_type="bearer"
    )
    
    return UserSignupResponse(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        roles=new_user.roles,
        is_active=new_user.is_active,
        tokens=tokens
    )


def refresh_access_token(db: Session, refresh_token: str) -> Optional[str]:
    payload = decode_refresh_token(refresh_token)
    if not payload:
        return None

    username = payload.get("sub")
    if not username:
        return None

    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        return None

    return create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )

def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    user = _user_query(db).filter(User.username == username).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user

def list_users(db: Session, page: int = 1, page_size: int = 20) -> UserListResponse:
    query = _user_query(db)
    total = query.count()
    users = (
        query.order_by(User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return UserListResponse(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return _user_query(db).filter(User.id == user_id).first()

def update_user(db: Session, user_id: int, body: UserUpdate) -> Optional[User]:
    user = _user_query(db).filter(User.id == user_id).first()
    if not user:
        return None
    data = body.model_dump(exclude_unset=True)
    if "email" in data:
        existing = (
            db.query(User)
            .filter(User.email == data["email"], User.id != user_id)
            .first()
        )
        if existing:
            raise ValueError("Email already in use")
        user.email = data["email"]
    if "password" in data:
        user.hashed_password = get_password_hash(data["password"])
    if "is_active" in data:
        user.is_active = data["is_active"]
    if "role_ids" in data:
        _assign_roles(db, user, data["role_ids"])
    try:
        db.commit()
        db.refresh(user)
        user = _user_query(db).filter(User.id == user_id).one()
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return user

def delete_user(db: Session, user_id: int) -> bool:
    user = (
        db.query(User)
        .filter(User.id == user_id, User.is_active.is_(True))
        .first()
    )
    if not user:
        return False
    user.is_active = False
    db.commit()
    return True


