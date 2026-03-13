from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gitlab_url: str = "https://gitlab.com"
    gitlab_token: str
    data_dir: Path = Path("data")

    class Config:
        env_file = ".env"


settings = Settings()
