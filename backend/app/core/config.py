from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def sqlalchemy_database_url(url: str) -> str:
    """Render fournit postgres:// ou postgresql:// ; SQLAlchemy + psycopg3 attend postgresql+psycopg://."""
    raw = url.strip()
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://") :]
    return raw


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Riding Factory API"
    database_url: str = "postgresql+psycopg://riding:riding@localhost:5433/ridingfactory"
    secret_key: str = "dev-secret-change-me"
    access_token_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    cors_origin_regex: str = r"https://.*\.onrender\.com"
    seed_on_startup: bool = True

    # Intégrations externes (optionnelles)
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    stripe_secret_key: str | None = None
    worldtides_api_key: str | None = None

    # Identité de l'entreprise pour les documents (devis / factures)
    company_name: str = "Riding Factory"
    company_address: str = "Saint-Hilaire-de-Riez, Vendée"
    company_siret: str = "000 000 000 00000"
    company_vat_number: str = "FR00000000000"

    @property
    def sqlalchemy_database_url(self) -> str:
        return sqlalchemy_database_url(self.database_url)

    @property
    def cors_origin_list(self) -> list[str]:
        origins: list[str] = []
        for raw in self.cors_origins.split(","):
            origin = raw.strip().rstrip("/")
            if not origin:
                continue
            if origin.startswith("http://") or origin.startswith("https://"):
                origins.append(origin)
            else:
                origins.append(f"https://{origin}")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
