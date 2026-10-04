from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Settings read from environment variables (DATABASE_URL, ...)."""

    database_url: str = "postgresql+psycopg://budget:budget@localhost:5432/budget"


settings = Settings()
