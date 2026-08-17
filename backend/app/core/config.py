from pydantic_settings import BaseSettings
from pydantic import field_validator

class Settings(BaseSettings):
    #App
    app_name: str = "Warehouse Management System"
    debug: bool = False

    #Database
    database_url: str = "postgresql://postgres:thado123@localhost:5432/WMS_db"

    #JWT
    secret_key: str = "no_secret_key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_minutes: int = 10080

    #ICS
    ics_base_url: str = "Your RCS Server path"
    inbound_process_code: str = "to_storage"
    outbound_process_code: str = "out_storage"

    # Zone
    zone_inbound: list[str] = ["Zone_1.1", "Zone_2.2"]
    zone_outbound: list[str] = ["Zone_7"]
    zone_storage: list[str] = ["Zone_3"]

    # Redis (cache)
    redis_url: str = "redis://10.73.231.5:6379/0"
    redis_cache_ttl: int = 300
    redis_key_prefix: str = "wms"

    # Redis Celery
    celery_broker_url: str = "redis://10.73.231.5:6379/1"
    celery_broker_result_url: str = "redis://10.73.231.5:6379/2"


    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

