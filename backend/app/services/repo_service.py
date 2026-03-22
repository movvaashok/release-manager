import json
from pathlib import Path
from typing import List

from app.config import settings
from app.models import AddReferenceRepoRequest, RepoReference, UpdateReferenceRepoRequest

# Resolve data_dir to absolute so it works regardless of the server's cwd.
# settings.data_dir may be relative (e.g. Path("data")); anchor it to the
# backend package root when it isn't already absolute.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent  # …/backend/
_DATA_DIR: Path = (
    settings.data_dir
    if settings.data_dir.is_absolute()
    else _BACKEND_ROOT / settings.data_dir
)


def _refs_path(project_id: str) -> Path:
    """Return the absolute path to repositories.json for the given project.

    Checks (in order):
      1. <data_dir>/<project_id>/repositories.json  (project-scoped, preferred)
      2. <data_dir>/repositories.json               (legacy root-level fallback)

    The project-scoped file is created (empty list) on first write if it doesn't
    exist, so reads that find nothing fall back gracefully.
    """
    scoped = _DATA_DIR / project_id / "repositories.json"
    legacy = _DATA_DIR / "repositories.json"
    if not scoped.exists() and legacy.exists():
        # Auto-migrate: copy legacy file into the project-scoped location once.
        scoped.parent.mkdir(parents=True, exist_ok=True)
        scoped.write_text(legacy.read_text())
        return scoped
    scoped.parent.mkdir(parents=True, exist_ok=True)
    return scoped


def _load(project_id: str) -> List[RepoReference]:
    path = _refs_path(project_id)
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [RepoReference.model_validate(r) for r in data]


def _save(project_id: str, repos: List[RepoReference]) -> None:
    _refs_path(project_id).write_text(
        json.dumps([r.model_dump() for r in repos], indent=2)
    )


def get_all(project_id: str) -> List[RepoReference]:
    return _load(project_id)


def add_repo(project_id: str, req: AddReferenceRepoRequest) -> List[RepoReference]:
    repos = _load(project_id)
    if any(r.name == req.name for r in repos):
        raise ValueError(f"Repository '{req.name}' already exists")
    repos.append(RepoReference(**req.model_dump()))
    _save(project_id, repos)
    return repos


def update_repo(project_id: str, name: str, req: UpdateReferenceRepoRequest) -> List[RepoReference]:
    repos = _load(project_id)
    idx = next((i for i, r in enumerate(repos) if r.name == name), None)
    if idx is None:
        raise ValueError(f"Repository '{name}' not found")
    existing = repos[idx].model_dump()
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    existing.update(updates)
    repos[idx] = RepoReference.model_validate(existing)
    _save(project_id, repos)
    return repos


def delete_repo(project_id: str, name: str) -> List[RepoReference]:
    repos = _load(project_id)
    new_repos = [r for r in repos if r.name != name]
    if len(new_repos) == len(repos):
        raise ValueError(f"Repository '{name}' not found")
    _save(project_id, new_repos)
    return new_repos
