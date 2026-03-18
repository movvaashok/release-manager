from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gitlab_url: str = "https://gitlab.com"
    gitlab_token: str
    data_dir: Path = Path("data")

    # Jira Cloud (optional)
    jira_url: Optional[str] = None
    jira_email: Optional[str] = None
    jira_api_token: Optional[str] = None
    jira_default_project: str = "TSSA"

    class Config:
        env_file = ".env"


settings = Settings()
