"""
Business logic for the release workflow.

Storage layout:
    data/
        repositories.json         – reference repo list (manually maintained)
        releases/
            2.15.0.json           – one file per release
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from app.config import settings
from app.models import (
    AddReposRequest,
    CreateReleaseRequest,
    ReleaseState,
    ReleaseSummary,
    RepoReference,
    RepoStage2Status,
    RepoStage3Status,
    Stage1Repo,
    Stage2Repo,
    Stage3Repo,
)
from app.services.gitlab_client import get_gitlab_client


# ---------------------------------------------------------------------------
# Helpers – JSON persistence
# ---------------------------------------------------------------------------

def _releases_dir() -> Path:
    d = settings.data_dir / "releases"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _release_path(version: str) -> Path:
    return _releases_dir() / f"{version}.json"


def _load_release(version: str) -> Optional[ReleaseState]:
    path = _release_path(version)
    if not path.exists():
        return None
    return ReleaseState.model_validate_json(path.read_text())


def _save_release(state: ReleaseState) -> None:
    _release_path(state.version).write_text(
        state.model_dump_json(indent=2)
    )


def _load_references() -> List[RepoReference]:
    path = settings.data_dir / "repositories.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [RepoReference.model_validate(r) for r in data]


def _to_summary(state: ReleaseState) -> ReleaseSummary:
    def _count(items, status):
        return sum(1 for r in items if r.status == status)

    return ReleaseSummary(
        version=state.version,
        created_at=state.created_at,
        total_repos=len(state.stage1),
        stage2_success=_count(state.stage2, RepoStage2Status.SUCCESS),
        stage2_conflict=_count(state.stage2, RepoStage2Status.CONFLICT),
        stage2_failed=_count(state.stage2, RepoStage2Status.FAILED),
        stage2_pending=_count(state.stage2, RepoStage2Status.PENDING),
        stage3_success=_count(state.stage3, RepoStage3Status.SUCCESS),
        stage3_already_exists=_count(state.stage3, RepoStage3Status.ALREADY_EXISTS),
        stage3_failed=_count(state.stage3, RepoStage3Status.FAILED),
        stage3_pending=_count(state.stage3, RepoStage3Status.PENDING),
    )


# ---------------------------------------------------------------------------
# Public API consumed by routers
# ---------------------------------------------------------------------------

def get_references() -> List[RepoReference]:
    return _load_references()


def list_releases() -> List[ReleaseSummary]:
    summaries = []
    for path in sorted(_releases_dir().glob("*.json")):
        try:
            state = ReleaseState.model_validate_json(path.read_text())
            summaries.append(_to_summary(state))
        except Exception:
            pass
    return summaries


def get_release(version: str) -> Optional[ReleaseState]:
    return _load_release(version)


def create_release(req: CreateReleaseRequest) -> ReleaseState:
    if _release_path(req.version).exists():
        raise ValueError(f"Release {req.version} already exists")

    refs = {r.name: r for r in _load_references()}
    unknown = [n for n in req.repo_names if n not in refs]
    if unknown:
        raise ValueError(f"Unknown repositories: {', '.join(unknown)}")

    stage1 = [
        Stage1Repo(
            name=refs[n].name,
            project_id=refs[n].project_id,
            path_with_namespace=refs[n].path_with_namespace,
            web_url=refs[n].web_url,
        )
        for n in req.repo_names
    ]
    stage2 = [Stage2Repo(name=r.name, project_id=r.project_id) for r in stage1]
    stage3 = [Stage3Repo(name=r.name, project_id=r.project_id) for r in stage1]

    state = ReleaseState(
        version=req.version,
        created_at=datetime.now(timezone.utc),
        stage1=stage1,
        stage2=stage2,
        stage3=stage3,
    )
    _save_release(state)
    return state


async def remove_repo_from_release(version: str, repo_name: str, gitlab_token: str) -> ReleaseState:
    """Delete the release branch in GitLab and remove the repo from all stages."""
    state = _load_release(version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    repo = next((r for r in state.stage1 if r.name == repo_name), None)
    if repo is None:
        raise ValueError(f"Repository {repo_name!r} not in release {version}")

    gitlab = get_gitlab_client(gitlab_token)
    release_branch = f"release/{version}"
    branch = await gitlab.get_branch(repo.project_id, release_branch)
    if branch is not None:
        await gitlab.delete_branch(repo.project_id, release_branch)

    state.stage1 = [r for r in state.stage1 if r.name != repo_name]
    state.stage2 = [r for r in state.stage2 if r.name != repo_name]
    state.stage3 = [r for r in state.stage3 if r.name != repo_name]

    _save_release(state)
    return state


def add_repos_to_release(version: str, repo_names: list) -> ReleaseState:
    """Add new repositories to an existing release."""
    state = _load_release(version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    refs = {r.name: r for r in _load_references()}
    unknown = [n for n in repo_names if n not in refs]
    if unknown:
        raise ValueError(f"Unknown repositories: {', '.join(unknown)}")

    existing_names = {r.name for r in state.stage1}
    for n in repo_names:
        if n in existing_names:
            continue
        ref = refs[n]
        state.stage1.append(Stage1Repo(name=ref.name, project_id=ref.project_id, path_with_namespace=ref.path_with_namespace, web_url=ref.web_url))
        state.stage2.append(Stage2Repo(name=ref.name, project_id=ref.project_id))
        state.stage3.append(Stage3Repo(name=ref.name, project_id=ref.project_id))

    _save_release(state)
    return state


# ---------------------------------------------------------------------------
# Stage 2 – branch management
# ---------------------------------------------------------------------------

async def _run_stage2_repo(version: str, repo: Stage2Repo, gitlab_token: str) -> Stage2Repo:
    """Execute stage-2 logic for a single repository and return updated model."""
    gitlab = get_gitlab_client(gitlab_token)
    release_branch = f"release/{version}"

    try:
        existing = await gitlab.get_branch(repo.project_id, release_branch)
        if existing is None:
            await gitlab.create_branch(repo.project_id, release_branch, "develop")
            repo.branch_created = True
        else:
            repo.branch_existed = True

        comparison = await gitlab.compare_branches(
            repo.project_id, release_branch, "develop"
        )
        if not comparison.get("commits"):
            repo.no_updates = True
            repo.status = RepoStage2Status.SUCCESS
            return repo

        result = await gitlab.merge_branches(
            repo.project_id,
            "develop",
            release_branch,
            f"Merge develop into release/{version}",
        )
        if result.get("conflict"):
            repo.status = RepoStage2Status.CONFLICT
        else:
            repo.merged = True
            repo.status = RepoStage2Status.SUCCESS

    except Exception as exc:
        repo.status = RepoStage2Status.FAILED
        repo.error = str(exc)

    return repo


async def run_stage2(version: str, gitlab_token: str) -> ReleaseState:
    """Run stage-2 for all repos that are not yet successful (sequential)."""
    state = _load_release(version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    for i, repo in enumerate(state.stage2):
        if repo.status == RepoStage2Status.SUCCESS:
            continue
        state.stage2[i] = await _run_stage2_repo(version, repo, gitlab_token)

    _save_release(state)
    return state


async def run_stage2_repo(version: str, repo_name: str, gitlab_token: str) -> ReleaseState:
    """Retry stage-2 for a single repository."""
    state = _load_release(version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    idx = next((i for i, r in enumerate(state.stage2) if r.name == repo_name), None)
    if idx is None:
        raise ValueError(f"Repository {repo_name!r} not in release {version}")

    repo = state.stage2[idx]
    # Reset before retrying
    repo.status = RepoStage2Status.PENDING
    repo.branch_created = False
    repo.branch_existed = False
    repo.merged = False
    repo.no_updates = False
    repo.error = None

    state.stage2[idx] = await _run_stage2_repo(version, repo, gitlab_token)
    _save_release(state)
    return state


# ---------------------------------------------------------------------------
# Stage 3 – merge request creation
# ---------------------------------------------------------------------------

async def _run_stage3_repo(version: str, repo: Stage3Repo, gitlab_token: str) -> Stage3Repo:
    """Execute stage-3 logic for a single repository and return updated model."""
    gitlab = get_gitlab_client(gitlab_token)
    release_branch = f"release/{version}"

    try:
        existing_mrs = await gitlab.list_merge_requests(
            repo.project_id, release_branch, "master"
        )
        if existing_mrs:
            mr = existing_mrs[0]
            repo.already_existed = True
            repo.mr_url = mr["web_url"]
            repo.mr_iid = mr["iid"]
            repo.status = RepoStage3Status.ALREADY_EXISTS
        else:
            mr = await gitlab.create_merge_request(
                project_id=repo.project_id,
                source_branch=release_branch,
                target_branch="master",
                title=f"Release {version} - {repo.name}",
                description=f"Automated release MR for version {version}.",
            )
            repo.mr_url = mr["web_url"]
            repo.mr_iid = mr["iid"]
            repo.status = RepoStage3Status.SUCCESS

    except Exception as exc:
        repo.status = RepoStage3Status.FAILED
        repo.error = str(exc)

    return repo


async def run_stage3(version: str, gitlab_token: str) -> ReleaseState:
    """Run stage-3 for all repos that are not yet successful (sequential)."""
    state = _load_release(version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    for i, repo in enumerate(state.stage3):
        if repo.status in (RepoStage3Status.SUCCESS, RepoStage3Status.ALREADY_EXISTS):
            continue
        state.stage3[i] = await _run_stage3_repo(version, repo, gitlab_token)

    _save_release(state)
    return state


async def run_stage3_repo(version: str, repo_name: str, gitlab_token: str) -> ReleaseState:
    """Retry stage-3 for a single repository."""
    state = _load_release(version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    idx = next((i for i, r in enumerate(state.stage3) if r.name == repo_name), None)
    if idx is None:
        raise ValueError(f"Repository {repo_name!r} not in release {version}")

    repo = state.stage3[idx]
    repo.status = RepoStage3Status.PENDING
    repo.mr_url = None
    repo.mr_iid = None
    repo.already_existed = False
    repo.error = None

    state.stage3[idx] = await _run_stage3_repo(version, repo, gitlab_token)
    _save_release(state)
    return state
