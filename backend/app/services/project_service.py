import json
from typing import List, Optional

from app.config import settings
from app.models import ProjectConfig


def _projects_path():
    return settings.data_dir / "projects.json"


def get_all() -> List[ProjectConfig]:
    path = _projects_path()
    if not path.exists():
        return []
    return [ProjectConfig.model_validate(p) for p in json.loads(path.read_text())]


def get_project(project_id: str) -> Optional[ProjectConfig]:
    return next((p for p in get_all() if p.id == project_id), None)
