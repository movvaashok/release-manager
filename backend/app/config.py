from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Non-sensitive config — safe to keep in .env
    gitlab_url: str = "https://gitlab.com"
    data_dir: Path = Path("data")

    # Jira Cloud base config (non-sensitive)
    jira_url: Optional[str] = None
    jira_default_project: str = "TSSA"

    # ---------------------------------------------------------------------------
    # The fields below are DEPRECATED in .env — they are only read here so that
    # the startup migration in token_service.migrate_tokens() can seed
    # data/tokens.json on first run after upgrade.  Once tokens.json is
    # populated these env vars are no longer needed and can be removed from .env.
    # ---------------------------------------------------------------------------
    gitlab_token: Optional[str] = None
    jira_email: Optional[str] = None
    jira_api_token: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()
