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


    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

