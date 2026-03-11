from __future__ import annotations

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
    )

    anthropic_api_key: str = ""
    # Override with a newer model once your API key has access, e.g.:
    # CLAUDE_MODEL=claude-3-5-haiku-20241022
    claude_model: str = "claude-3-haiku-20240307"
    # Accepts GEMINI_API_KEY (canonical) or GOOGLE_API_KEY (Google AI Studio default)
    gemini_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    )
    firebase_project_id: str = ""
    firebase_service_account_json: str = ""
    database_url: str = (
        "postgresql+asyncpg://postgres:password@localhost:5432/mealplanner"
    )
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3000"]
    # Cloud Run service URL — used to validate OIDC token audience in prod
    cloud_run_url: str = ""
    # Upstash Redis URL for rate limiting (optional — rate limiting disabled if unset)
    upstash_redis_url: str = ""
    # Shared secret for POST /internal/* endpoints — set via Secret Manager in prod
    internal_secret: str = ""

    @model_validator(mode="after")
    def _require_ai_keys_in_production(self) -> "Settings":
        """Fail fast at startup if AI keys are missing outside development."""
        if self.environment != "development":
            missing: list[str] = []
            if not self.anthropic_api_key:
                missing.append("ANTHROPIC_API_KEY")
            if not self.gemini_api_key:
                missing.append("GEMINI_API_KEY")
            if missing:
                raise ValueError(
                    f"Required environment variables not set: {', '.join(missing)}"
                )
        return self


settings = Settings()