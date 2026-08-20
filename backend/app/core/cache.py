import json
from typing import Any, Optional

import redis

from app.core.config import settings

_redis: Optional[redis.Redis] = None

def _prefixed_key(key: str) -> str:
    prefix = settings.redis_key_prefix.strip(":")
    key = key.strip(":")
    if not prefix:
        return key
    return f"{prefix}:{key}"


def _prefixed_pattern(pattern: str) -> str:
    prefix = settings.redis_key_prefix.strip(":")
    pattern = pattern.strip(":")
    if not prefix:
        return pattern
    return f"{prefix}:{pattern}"


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
        )
    return _redis

def close_redis() -> None:
    global _redis
    if _redis is not None:
        _redis.close()
        _redis = None


def cache_get(key: str) -> Optional[Any]:
    raw = get_redis().get(_prefixed_key(key))
    return json.loads(raw) if raw else None


def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    payload = json.dumps(value, default=str)
    prefixed = _prefixed_key(key)
    if ttl == -1:
        get_redis().set(prefixed, payload)
        return

    get_redis().setex(
        _prefixed_key(key),
        ttl or settings.redis_cache_ttl,
        json.dumps(value, default=str),
    )


def cache_delete(key: str) -> None:
    get_redis().delete(_prefixed_key(key))


def cache_exists(key: str) -> bool:
    return bool(get_redis().exists(_prefixed_key(key)))

def cache_scan_keys(pattern: str) -> list[str]:
    r = get_redis()
    return list(r.scan_iter(match=_prefixed_pattern(pattern)))

def cache_delete_pattern(pattern: str) -> int:
    r = get_redis()
    keys = list(r.scan_iter(match=_prefixed_pattern(pattern)))
    if not keys:
        return 0
    return r.delete(*keys)