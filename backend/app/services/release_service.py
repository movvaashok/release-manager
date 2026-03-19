"""
Business logic for the release workflow.

Storage layout:
    data/
        {project_id}/
            repositories.json     – reference repo list per project
            releases/
                2.15.0.json       – one file per release
"""
from __future__ import annotations

import json
import shutil
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
# One-time migration: move legacy flat data into pioneer/ subdirectory
# ---------------------------------------------------------------------------

def migrate_legacy_data() -> None:
    pioneer_releases = settings.data_dir / "pioneer" / "releases"
    legacy_releases = settings.data_dir / "releases"
    if legacy_releases.exists() and not pioneer_releases.exists():
        pioneer_releases.mkdir(parents=True, exist_ok=True)
        for f in legacy_releases.glob("*.json"):
            shutil.copy2(f, pioneer_releases / f.name)

    pioneer_repos = settings.data_dir / "pioneer" / "repositories.json"
    legacy_repos = settings.data_dir / "repositories.json"
    if legacy_repos.exists() and not pioneer_repos.exists():
        pioneer_repos.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_repos, pioneer_repos)


# ---------------------------------------------------------------------------
# Helpers – JSON persistence
# ---------------------------------------------------------------------------

def _releases_dir(project_id: str) -> Path:
    d = settings.data_dir / project_id / "releases"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _release_path(project_id: str, version: str) -> Path:
    return _releases_dir(project_id) / f"{version}.json"


def _load_release(project_id: str, version: str) -> Optional[ReleaseState]:
    path = _release_path(project_id, version)
    if not path.exists():
        return None
    return ReleaseState.model_validate_json(path.read_text())


def _save_release(project_id: str, state: ReleaseState) -> None:
    _release_path(project_id, state.version).write_text(
        state.model_dump_json(indent=2)
    )


def _load_references(project_id: str) -> List[RepoReference]:
    path = settings.data_dir / project_id / "repositories.json"
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

def get_references(project_id: str) -> List[RepoReference]:
    return _load_references(project_id)


def list_releases(project_id: str) -> List[ReleaseSummary]:
    summaries = []
    for path in sorted(_releases_dir(project_id).glob("*.json")):
        try:
            state = ReleaseState.model_validate_json(path.read_text())
            summaries.append(_to_summary(state))
        except Exception:
            pass
    return summaries


def get_release(project_id: str, version: str) -> Optional[ReleaseState]:
    return _load_release(project_id, version)


def create_release(project_id: str, req: CreateReleaseRequest) -> ReleaseState:
    if _release_path(project_id, req.version).exists():
        raise ValueError(f"Release {req.version} already exists")

    refs = {r.name: r for r in _load_references(project_id)}
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
    _save_release(project_id, state)
    return state


async def remove_repo_from_release(project_id: str, version: str, repo_name: str, gitlab_token: str) -> ReleaseState:
    state = _load_release(project_id, version)
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

    _save_release(project_id, state)
    return state


def add_repos_to_release(project_id: str, version: str, repo_names: list) -> ReleaseState:
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    refs = {r.name: r for r in _load_references(project_id)}
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

    _save_release(project_id, state)
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
        else:
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

        # Fetch latest pipeline for the release branch
        try:
            pipeline = await gitlab.get_latest_pipeline_for_branch(repo.project_id, release_branch)
            if pipeline:
                repo.pipeline_status = pipeline.get("status")
                repo.pipeline_url = pipeline.get("web_url")
        except Exception:
            pass  # Pipeline fetch failure should not block stage result

    except Exception as exc:
        repo.status = RepoStage2Status.FAILED
        repo.error = str(exc)

    return repo


async def run_stage2(project_id: str, version: str, gitlab_token: str) -> ReleaseState:
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    for i, repo in enumerate(state.stage2):
        if repo.status == RepoStage2Status.SUCCESS:
            continue
        state.stage2[i] = await _run_stage2_repo(version, repo, gitlab_token)

    _save_release(project_id, state)
    return state


async def run_stage2_repo(project_id: str, version: str, repo_name: str, gitlab_token: str) -> ReleaseState:
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    idx = next((i for i, r in enumerate(state.stage2) if r.name == repo_name), None)
    if idx is None:
        raise ValueError(f"Repository {repo_name!r} not in release {version}")

    repo = state.stage2[idx]
    repo.status = RepoStage2Status.PENDING
    repo.branch_created = False
    repo.branch_existed = False
    repo.merged = False
    repo.no_updates = False
    repo.error = None
    repo.pipeline_status = None
    repo.pipeline_url = None
    repo.has_new_commits = None
    repo.commits_ahead = None
    repo.compare_url = None

    state.stage2[idx] = await _run_stage2_repo(version, repo, gitlab_token)
    _save_release(project_id, state)
    return state


# ---------------------------------------------------------------------------
# Stage 2 – diff check (develop vs release branch)
# ---------------------------------------------------------------------------

async def run_diff_check(project_id: str, version: str, gitlab_token: str) -> ReleaseState:
    """For every stage-2 repo that has a release branch, compare develop against
    it and record whether develop is ahead (has new commits)."""
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    gitlab = get_gitlab_client(gitlab_token)
    release_branch = f"release/{version}"

    # Build a lookup of web_url from stage1 so we can construct compare links
    web_urls = {r.name: r.web_url for r in state.stage1 if r.web_url}

    for i, repo in enumerate(state.stage2):
        # Only check repos that already have a release branch
        if not (repo.branch_created or repo.branch_existed or repo.status == RepoStage2Status.SUCCESS):
            continue
        try:
            comparison = await gitlab.compare_branches(repo.project_id, release_branch, "develop")
            commits = comparison.get("commits", [])
            repo.commits_ahead = len(commits)
            repo.has_new_commits = len(commits) > 0

            # Build GitLab web compare URL: shows what develop has that release doesn't
            web_url = web_urls.get(repo.name, "")
            if web_url:
                from urllib.parse import quote
                encoded_release = quote(release_branch, safe="")
                repo.compare_url = f"{web_url}/-/compare/{encoded_release}...develop"
            else:
                repo.compare_url = None
        except Exception as exc:
            # Non-blocking: mark as unchecked and surface error in compare_url field
            repo.has_new_commits = None
            repo.commits_ahead = None
            repo.compare_url = None

        state.stage2[i] = repo

    _save_release(project_id, state)
    return state


# ---------------------------------------------------------------------------
# Pipeline status refresh (called on page load to get live statuses)
# ---------------------------------------------------------------------------

ACTIVE_PIPELINE_STATUSES = {"created", "waiting_for_resource", "preparing", "pending", "running"}


async def refresh_pipeline_statuses(project_id: str, version: str, gitlab_token: str) -> ReleaseState:
    """Re-fetch the latest pipeline status from GitLab for every repo in
    stage 2 (by branch) and stage 3 (by MR). Persists and returns the updated state."""
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    gitlab = get_gitlab_client(gitlab_token)
    release_branch = f"release/{version}"
    changed = False

    # Stage 2 – fetch pipeline for the release branch on each repo that has one
    for i, repo in enumerate(state.stage2):
        if not (repo.branch_created or repo.branch_existed or repo.status == RepoStage2Status.SUCCESS):
            continue
        try:
            pipeline = await gitlab.get_latest_pipeline_for_branch(repo.project_id, release_branch)
            new_status = pipeline.get("status") if pipeline else None
            new_url = pipeline.get("web_url") if pipeline else None
            if repo.pipeline_status != new_status or repo.pipeline_url != new_url:
                repo.pipeline_status = new_status
                repo.pipeline_url = new_url
                state.stage2[i] = repo
                changed = True
        except Exception:
            pass  # Non-blocking

    # Stage 3 – fetch pipeline for each MR
    for i, repo in enumerate(state.stage3):
        if repo.mr_iid is None:
            continue
        try:
            pipeline = await gitlab.get_latest_pipeline_for_mr(repo.project_id, repo.mr_iid)
            new_status = pipeline.get("status") if pipeline else None
            new_url = pipeline.get("web_url") if pipeline else None
            if repo.pipeline_status != new_status or repo.pipeline_url != new_url:
                repo.pipeline_status = new_status
                repo.pipeline_url = new_url
                state.stage3[i] = repo
                changed = True
        except Exception:
            pass  # Non-blocking

    if changed:
        _save_release(project_id, state)
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

        # Fetch latest pipeline for this MR
        if repo.mr_iid is not None:
            try:
                pipeline = await gitlab.get_latest_pipeline_for_mr(repo.project_id, repo.mr_iid)
                if pipeline:
                    repo.pipeline_status = pipeline.get("status")
                    repo.pipeline_url = pipeline.get("web_url")
            except Exception:
                pass  # Pipeline fetch failure should not block stage result

    except Exception as exc:
        repo.status = RepoStage3Status.FAILED
        repo.error = str(exc)

    return repo


async def run_stage3(project_id: str, version: str, gitlab_token: str) -> ReleaseState:
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    for i, repo in enumerate(state.stage3):
        if repo.status in (RepoStage3Status.SUCCESS, RepoStage3Status.ALREADY_EXISTS):
            continue
        state.stage3[i] = await _run_stage3_repo(version, repo, gitlab_token)

    _save_release(project_id, state)
    return state


async def run_stage3_repo(project_id: str, version: str, repo_name: str, gitlab_token: str) -> ReleaseState:
    state = _load_release(project_id, version)
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
    repo.pipeline_status = None
    repo.pipeline_url = None

    state.stage3[idx] = await _run_stage3_repo(version, repo, gitlab_token)
    _save_release(project_id, state)
    return state
