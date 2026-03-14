import json
from typing import List

from app.config import settings
from app.models import AddReferenceRepoRequest, RepoReference, UpdateReferenceRepoRequest


def _refs_path():
    return settings.data_dir / "repositories.json"


def _load() -> List[RepoReference]:
    path = _refs_path()
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [RepoReference.model_validate(r) for r in data]


def _save(repos: List[RepoReference]) -> None:
    _refs_path().write_text(
        json.dumps([r.model_dump() for r in repos], indent=2)
    )


def get_all() -> List[RepoReference]:
    return _load()


def add_repo(req: AddReferenceRepoRequest) -> List[RepoReference]:
    repos = _load()
    if any(r.name == req.name for r in repos):
        raise ValueError(f"Repository '{req.name}' already exists")
    repos.append(RepoReference(**req.model_dump()))
    _save(repos)
    return repos


def update_repo(name: str, req: UpdateReferenceRepoRequest) -> List[RepoReference]:
    repos = _load()
    idx = next((i for i, r in enumerate(repos) if r.name == name), None)
    if idx is None:
        raise ValueError(f"Repository '{name}' not found")
    existing = repos[idx].model_dump()
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    existing.update(updates)
    repos[idx] = RepoReference.model_validate(existing)
    _save(repos)
    return repos


def delete_repo(name: str) -> List[RepoReference]:
    repos = _load()
    new_repos = [r for r in repos if r.name != name]
    if len(new_repos) == len(repos):
        raise ValueError(f"Repository '{name}' not found")
    _save(new_repos)
    return new_repos
