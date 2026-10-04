from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Settings read from environment variables (DATABASE_URL, ...)."""

    database_url: str = "postgresql+psycopg://budget:budget@localhost:5432/budget"
    # True only in the demo stack (.env.demo), whose database holds mock data.
    demo: bool = False


settings = Settings()
