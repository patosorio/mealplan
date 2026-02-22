from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    firebase_project_id: str = ""
    firebase_service_account_path: str = ""
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/mealplanner"
    environment: str = "development"
    cors_origins: List[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"

settings = Settings()