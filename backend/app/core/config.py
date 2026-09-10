from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Riding Factory API"
    database_url: str = "postgresql+psycopg://riding:riding@localhost:5433/ridingfactory"
    secret_key: str = "dev-secret-change-me"
    access_token_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
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
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
