"""
Business logic for the release workflow.

Storage layout:
    data/
        {project_id}/
            repositories.json     – reference repo list per project
            releases/
                {version}/
                    state.json    – release state
                    audit.jsonl   – append-only audit log (managed by audit_service)
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse

from app.config import settings
from app.models import (
    AddReposRequest,
    CreateReleaseRequest,
    JiraStatusSummary,
    JiraTicketStatus,
    RaSubtaskInfo,
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
from app.services import jira_client, project_service

# Resolve data_dir to absolute so it works regardless of the server's cwd.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent  # …/backend/
_DATA_DIR: Path = (
    settings.data_dir
    if settings.data_dir.is_absolute()
    else _BACKEND_ROOT / settings.data_dir
)


# ---------------------------------------------------------------------------
# Helper functions for project-specific configuration
# ---------------------------------------------------------------------------

def _get_release_branch_config(project_id: str) -> tuple[str, str]:
    """
    Get the release branch source and pattern for a project.
    Returns: (source_branch, branch_pattern)
    Example: ("develop", "release/{version}") or ("master", "Release/{version}")
    """
    proj = project_service.get_project(project_id)
    if proj:
        source = proj.release_branch_source or "develop"
        pattern = proj.release_branch_pattern or "release/{version}"
    else:
        # Fallback defaults
        source = "develop"
        pattern = "release/{version}"
    return source, pattern


def _build_release_branch_name(pattern: str, version: str) -> str:
    """Build the release branch name using the configured pattern."""
    return pattern.replace("{version}", version)


# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------

def migrate_legacy_data() -> None:
    """Run all one-time migrations in order."""
    _migrate_flat_to_pioneer()
    _migrate_flat_files_to_subfolders()


def _migrate_flat_to_pioneer() -> None:
    """Move legacy top-level data/ files into pioneer/ subdirectory."""
    pioneer_releases = _DATA_DIR / "pioneer" / "releases"
    legacy_releases = _DATA_DIR / "releases"
    if legacy_releases.exists() and not pioneer_releases.exists():
        pioneer_releases.mkdir(parents=True, exist_ok=True)
        for f in legacy_releases.glob("*.json"):
            shutil.copy2(f, pioneer_releases / f.name)

    pioneer_repos = _DATA_DIR / "pioneer" / "repositories.json"
    legacy_repos = _DATA_DIR / "repositories.json"
    if legacy_repos.exists() and not pioneer_repos.exists():
        pioneer_repos.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_repos, pioneer_repos)


def _migrate_flat_files_to_subfolders() -> None:
    """Move flat {version}.json and {version}_audit.jsonl into {version}/ subfolders."""
    for project_dir in _DATA_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        releases_dir = project_dir / "releases"
        if not releases_dir.exists():
            continue
        for state_file in list(releases_dir.glob("*.json")):
            version = state_file.stem  # e.g. "2.15.0"
            version_dir = releases_dir / version
            new_state = version_dir / "state.json"
            if not new_state.exists():
                version_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(state_file, new_state)
                state_file.unlink()
            else:
                state_file.unlink()  # already migrated, remove old file

        for audit_file in list(releases_dir.glob("*_audit.jsonl")):
            version = audit_file.stem.replace("_audit", "")  # e.g. "2.15.0"
            version_dir = releases_dir / version
            new_audit = version_dir / "audit.jsonl"
            if not new_audit.exists():
                version_dir.mkdir(parents=True, exist_ok=True)
                shutil.copy2(audit_file, new_audit)
                audit_file.unlink()
            else:
                audit_file.unlink()  # already migrated, remove old file


# ---------------------------------------------------------------------------
# Helpers – JSON persistence
# ---------------------------------------------------------------------------

def _releases_dir(project_id: str) -> Path:
    d = _DATA_DIR / project_id / "releases"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _release_dir(project_id: str, version: str) -> Path:
    """Return (and create) the per-release subfolder: data/{project}/releases/{version}/"""
    d = _releases_dir(project_id) / version
    d.mkdir(parents=True, exist_ok=True)
    return d


def _release_path(project_id: str, version: str) -> Path:
    return _release_dir(project_id, version) / "state.json"


def _load_release(project_id: str, version: str) -> Optional[ReleaseState]:
    path = _release_path(project_id, version)
    if not path.exists():
        return None
    state = ReleaseState.model_validate_json(path.read_text())
    _enrich_config_repos(state, project_id)
    return state


def _save_release(project_id: str, state: ReleaseState) -> None:
    # Exclude ephemeral config-repo fields — they are recomputed on every load
    data = state.model_dump()
    for repo in data.get("stage3", []):
        repo.pop("config_repo", None)
        repo.pop("config_repo_in_release", None)
    _release_path(project_id, state.version).write_text(
        json.dumps(data, indent=2, default=str)
    )


def _load_references(project_id: str) -> List[RepoReference]:
    path = _DATA_DIR / project_id / "repositories.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [RepoReference.model_validate(r) for r in data]


def _enrich_config_repos(state: ReleaseState, project_id: str) -> None:
    """
    For each Stage3 repo, look up its config_repo link from the reference list
    and determine whether that config repo is already in the release (stage1).

    This is computed on every load so it stays fresh even when the repo registry
    or the release composition changes.

    config_repo / config_repo_in_release are NOT persisted to state.json —
    they are ephemeral view-time fields.
    """
    refs = {r.name: r for r in _load_references(project_id)}
    stage1_names = {r.name for r in state.stage1}
    for repo in state.stage3:
        ref = refs.get(repo.name)
        linked = ref.config_repo if ref else None
        repo.config_repo = linked if linked else None
        repo.config_repo_in_release = bool(linked and linked in stage1_names)


def _to_summary(state: ReleaseState) -> ReleaseSummary:
    def _count(items, status):
        return sum(1 for r in items if r.status == status)

    return ReleaseSummary(
        version=state.version,
        created_at=state.created_at,
        project_id=state.project_id,
        total_repos=len(state.stage1),
        stage2_success=_count(state.stage2, RepoStage2Status.SUCCESS),
        stage2_conflict=_count(state.stage2, RepoStage2Status.CONFLICT),
        stage2_failed=_count(state.stage2, RepoStage2Status.FAILED),
        stage2_pending=_count(state.stage2, RepoStage2Status.PENDING),
        stage3_success=_count(state.stage3, RepoStage3Status.SUCCESS),
        stage3_already_exists=_count(state.stage3, RepoStage3Status.ALREADY_EXISTS),
        stage3_failed=_count(state.stage3, RepoStage3Status.FAILED),
        stage3_pending=_count(state.stage3, RepoStage3Status.PENDING),
        cab_date=state.cab_date,
        cab_ticket_url=state.cab_ticket_url,
        confluence_url=state.confluence_url,
        risk_assessment_url=state.risk_assessment_url,
    )


# ---------------------------------------------------------------------------
# Public API consumed by routers
# ---------------------------------------------------------------------------

def get_references(project_id: str) -> List[RepoReference]:
    return _load_references(project_id)


def list_releases(project_id: str) -> List[ReleaseSummary]:
    summaries = []
    releases_dir = _releases_dir(project_id)
    # Each release lives in its own subfolder: releases/{version}/state.json
    for version_dir in sorted(releases_dir.iterdir()):
        if not version_dir.is_dir():
            continue
        if version_dir.name == "archive":
            continue  # skip archived releases
        state_file = version_dir / "state.json"
        if not state_file.exists():
            continue
        try:
            state = ReleaseState.model_validate_json(state_file.read_text())
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
    stage2 = [Stage2Repo(name=r.name, project_id=r.project_id, web_url=r.web_url) for r in stage1]
    stage3 = [Stage3Repo(name=r.name, project_id=r.project_id) for r in stage1]

    state = ReleaseState(
        version=req.version,
        created_at=datetime.now(timezone.utc),
        project_id=project_id,
        stage1=stage1,
        stage2=stage2,
        stage3=stage3,
        cab_date=req.cab_date,
        cab_ticket_url=req.cab_ticket_url,
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

    # Block deletion if the repo has an RA subtask that is not yet ABANDONED
    stage3_entry = next((r for r in state.stage3 if r.name == repo_name), None)
    if stage3_entry and stage3_entry.ra_subtask_url:
        ra_key = _jira_key_from_url(stage3_entry.ra_subtask_url)
        if ra_key:
            status = await jira_client.get_issue_status(ra_key)
            if status is None or status.lower() != "abandoned":
                current = f" (current status: {status})" if status else ""
                raise ValueError(
                    f"RA_SUBTASK_NOT_ABANDONED:{stage3_entry.ra_subtask_url}"
                    f"|The RA subtask for {repo_name!r} must be set to Abandoned in Jira before "
                    f"this repository can be removed from the release{current}."
                )

    gitlab = get_gitlab_client(gitlab_token)
    _, branch_pattern = _get_release_branch_config(project_id)
    release_branch = _build_release_branch_name(branch_pattern, version)
    branch = await gitlab.get_branch(repo.project_id, release_branch)
    if branch is not None:
        await gitlab.delete_branch(repo.project_id, release_branch)

    state.stage1 = [r for r in state.stage1 if r.name != repo_name]
    state.stage2 = [r for r in state.stage2 if r.name != repo_name]
    state.stage3 = [r for r in state.stage3 if r.name != repo_name]

    _save_release(project_id, state)
    return state


def add_repos_to_release(
    project_id: str,
    version: str,
    repo_names: list,
    ticket_map: dict | None = None,
) -> ReleaseState:
    """
    Add repositories to a release.

    ticket_map: optional dict of {repo_name: [ticket_key, ...]} that records
                which Jira tickets brought each repo into the release.
    """
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
        tickets = (ticket_map or {}).get(n, [])
        state.stage1.append(Stage1Repo(
            name=ref.name,
            project_id=ref.project_id,
            path_with_namespace=ref.path_with_namespace,
            web_url=ref.web_url,
            jira_tickets=tickets,
        ))
        state.stage2.append(Stage2Repo(name=ref.name, project_id=ref.project_id, web_url=ref.web_url))
        state.stage3.append(Stage3Repo(name=ref.name, project_id=ref.project_id))

    _save_release(project_id, state)
    return state


# ---------------------------------------------------------------------------
# Stage 2 – git-based branch sync
# ---------------------------------------------------------------------------

def _git_sync_develop_to_release(
    web_url: str,
    gitlab_token: str,
    release_branch: str,
    source_branch: str,
    commit_message: str,
) -> dict:
    """
    Clone the repo locally, ensure *release_branch* exists, merge source_branch into
    it, then push.  All network I/O is done via authenticated HTTPS so no SSH
    keys are required.

    Returns a dict with boolean keys:
        branch_created, branch_existed, merged, no_updates, conflict
    """
    parsed = urlparse(web_url)
    path = parsed.path.rstrip("/")
    if not path.endswith(".git"):
        path += ".git"
    auth_url = f"{parsed.scheme}://oauth2:{gitlab_token}@{parsed.netloc}{path}"

    env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_ASKPASS": "echo",
    }

    with tempfile.TemporaryDirectory() as tmpdir:

        def git(*args: str) -> subprocess.CompletedProcess:
            r = subprocess.run(
                ["git", *args],
                cwd=tmpdir,
                capture_output=True,
                text=True,
                env=env,
            )
            if r.returncode != 0:
                raise subprocess.CalledProcessError(
                    r.returncode, ["git", *args],
                    output=r.stdout, stderr=r.stderr,
                )
            return r

        git("init", "-q")
        git("config", "user.email", "release-bot@local")
        git("config", "user.name", "Release Bot")
        git("remote", "add", "origin", auth_url)

        # Check if release branch already exists on remote (no fetch needed)
        ls = subprocess.run(
            ["git", "ls-remote", "--heads", "origin", release_branch],
            cwd=tmpdir, capture_output=True, text=True, env=env,
        )
        release_exists = bool(ls.stdout.strip())

        # Fetch source branch
        git("fetch", "-q", "origin", f"{source_branch}:refs/remotes/origin/{source_branch}")

        if not release_exists:
            # Create release branch from source branch tip and push
            git("checkout", "-q", "-b", release_branch, f"refs/remotes/origin/{source_branch}")
            git("push", "-q", "origin", f"HEAD:{release_branch}")
            return {
                "branch_created": True, "branch_existed": False,
                "merged": False, "no_updates": True, "conflict": False,
            }

        # Fetch existing release branch
        git("fetch", "-q", "origin", f"{release_branch}:refs/remotes/origin/{release_branch}")
        git("checkout", "-q", "-b", release_branch, f"refs/remotes/origin/{release_branch}")

        # Check if source branch has any commits not already in release branch
        merge_base = git(
            "merge-base",
            f"refs/remotes/origin/{release_branch}",
            f"refs/remotes/origin/{source_branch}",
        ).stdout.strip()
        source_sha = git("rev-parse", f"refs/remotes/origin/{source_branch}").stdout.strip()

        if merge_base == source_sha:
            # source branch is already fully contained in release branch
            return {
                "branch_created": False, "branch_existed": True,
                "merged": False, "no_updates": True, "conflict": False,
            }

        # Merge source branch into release branch
        try:
            git(
                "merge", f"refs/remotes/origin/{source_branch}",
                "--no-ff", "-m", commit_message,
            )
        except subprocess.CalledProcessError as exc:
            output = f"{exc.output or ''}\n{exc.stderr or ''}"
            if "CONFLICT" in output or "Automatic merge failed" in output:
                return {
                    "branch_created": False, "branch_existed": True,
                    "merged": False, "no_updates": False, "conflict": True,
                }
            raise Exception(f"Git merge failed: {exc.stderr or exc.output}")

        # Push merged result
        git("push", "-q", "origin", f"HEAD:{release_branch}")

        return {
            "branch_created": False, "branch_existed": True,
            "merged": True, "no_updates": False, "conflict": False,
        }


# ---------------------------------------------------------------------------
# Stage 2 – branch management
# ---------------------------------------------------------------------------

async def _run_stage2_repo(
    project_id: str,
    version: str,
    repo: Stage2Repo,
    gitlab_token: str,
) -> Stage2Repo:
    """Execute stage-2 logic for a single repository and return updated model."""
    gitlab = get_gitlab_client(gitlab_token)
    source_branch, branch_pattern = _get_release_branch_config(project_id)
    release_branch = _build_release_branch_name(branch_pattern, version)

    try:
        if not repo.web_url:
            raise Exception(
                f"Repository {repo.name!r} has no web_url — cannot perform git operations. "
                "Re-add the repository to populate the URL."
            )

        # Clone locally, merge source_branch → release branch, push
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            _git_sync_develop_to_release,
            repo.web_url,
            gitlab_token,
            release_branch,
            source_branch,
            f"Merge {source_branch} into {release_branch}",
        )

        repo.branch_created = result["branch_created"]
        repo.branch_existed = result["branch_existed"]
        repo.merged        = result["merged"]
        repo.no_updates    = result["no_updates"]

        if result["conflict"]:
            repo.status = RepoStage2Status.CONFLICT
        else:
            repo.status = RepoStage2Status.SUCCESS

        # Fetch latest pipeline for the release branch (via API)
        try:
            pipeline = await gitlab.get_latest_pipeline_for_branch(repo.project_id, release_branch)
            if pipeline:
                repo.pipeline_status = pipeline.get("status")
                repo.pipeline_url    = pipeline.get("web_url")
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
        state.stage2[i] = await _run_stage2_repo(project_id, version, repo, gitlab_token)

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

    state.stage2[idx] = await _run_stage2_repo(project_id, version, repo, gitlab_token)
    _save_release(project_id, state)
    return state


# ---------------------------------------------------------------------------
# Stage 2 – diff check (develop vs release branch)
# ---------------------------------------------------------------------------

async def run_diff_check(project_id: str, version: str, gitlab_token: str) -> ReleaseState:
    """For every stage-2 repo that has a release branch, compare source branch against
    it and record whether source branch is ahead (has new commits)."""
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    gitlab = get_gitlab_client(gitlab_token)
    source_branch, branch_pattern = _get_release_branch_config(project_id)
    release_branch = _build_release_branch_name(branch_pattern, version)

    # Build a lookup of web_url from stage1 so we can construct compare links
    web_urls = {r.name: r.web_url for r in state.stage1 if r.web_url}

    for i, repo in enumerate(state.stage2):
        # Only check repos that already have a release branch
        if not (repo.branch_created or repo.branch_existed or repo.status == RepoStage2Status.SUCCESS):
            continue
        try:
            comparison = await gitlab.compare_branches(repo.project_id, release_branch, source_branch)
            commits = comparison.get("commits", [])
            repo.commits_ahead = len(commits)
            repo.has_new_commits = len(commits) > 0

            # Build GitLab web compare URL: shows what source branch has that release doesn't
            web_url = web_urls.get(repo.name, "")
            if web_url:
                from urllib.parse import quote
                encoded_release = quote(release_branch, safe="")
                repo.compare_url = f"{web_url}/-/compare/{encoded_release}...{source_branch}"
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
    _, branch_pattern = _get_release_branch_config(project_id)
    release_branch = _build_release_branch_name(branch_pattern, version)
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

def _jira_key_from_url(url: Optional[str]) -> Optional[str]:
    """Extract a Jira issue key (e.g. 'RA-42') from a /browse/ URL."""
    if not url:
        return None
    import re
    m = re.search(r"/browse/([A-Z]+-\d+)", url)
    return m.group(1) if m else None


def _extract_jira_ticket_from_message(message: Optional[str]) -> Optional[str]:
    """Extract TSSA Jira ticket number (e.g. 'TSSA-6436') from a commit message.

    Looks for TSSA ticket patterns only (e.g., TSSA-6436).
    Ignores other ticket types like RA, TSD, etc.
    Returns the first TSSA match found.
    """
    if not message:
        return None
    import re
    # Match only TSSA ticket pattern: TSSA followed by hyphen and digits
    # e.g., TSSA-6436
    m = re.search(r"\b(TSSA\-\d+)\b", message)
    return m.group(1) if m else None


async def _run_stage3_repo(
    project_id: str,
    version: str,
    repo: Stage3Repo,
    gitlab_token: str,
) -> Stage3Repo:
    """Execute stage-3 logic for a single repository and return updated model."""
    gitlab = get_gitlab_client(gitlab_token)
    _, branch_pattern = _get_release_branch_config(project_id)
    release_branch = _build_release_branch_name(branch_pattern, version)

    # Get project info to determine display name
    proj = project_service.get_project(project_id)
    project_display_name = proj.display_name if proj else project_id

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
            # Extract Jira ticket from latest commit on release branch (if configured for this project)
            jira_ticket = None
            if proj and proj.mr_include_jira_ticket:
                try:
                    commit = await gitlab.get_latest_commit(repo.project_id, release_branch)
                    if commit:
                        commit_message = commit.get("message", "")
                        jira_ticket = _extract_jira_ticket_from_message(commit_message)
                except Exception:
                    pass  # Continue without ticket if fetch fails

            # Build MR title with Jira ticket if available, otherwise use project name
            if jira_ticket:
                mr_title = f"{jira_ticket} - {project_display_name} v{version}"
            else:
                mr_title = f"{project_display_name} v{version}"

            mr = await gitlab.create_merge_request(
                project_id=repo.project_id,
                source_branch=release_branch,
                target_branch="master",
                title=mr_title,
                description=f"Automated release MR for version {version}.",
            )
            repo.mr_url = mr["web_url"]
            repo.mr_iid = mr["iid"]
            repo.status = RepoStage3Status.SUCCESS

        # Fetch MR details (state + merge_status) and latest pipeline
        if repo.mr_iid is not None:
            try:
                mr_detail = await gitlab.get_merge_request(repo.project_id, repo.mr_iid)
                repo.mr_state = mr_detail.get("state")
                repo.mr_merge_status = mr_detail.get("merge_status")
            except Exception:
                pass
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


async def refresh_mr_statuses(project_id: str, version: str, gitlab_token: str) -> ReleaseState:
    """Re-fetch MR state, merge_status, and pipeline for every stage-3 repo that has an MR."""
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    gitlab = get_gitlab_client(gitlab_token)

    for repo in state.stage3:
        if repo.mr_iid is None:
            continue
        try:
            mr_detail = await gitlab.get_merge_request(repo.project_id, repo.mr_iid)
            repo.mr_state = mr_detail.get("state")
            repo.mr_merge_status = mr_detail.get("merge_status")
        except Exception:
            pass
        try:
            pipeline = await gitlab.get_latest_pipeline_for_mr(repo.project_id, repo.mr_iid)
            if pipeline:
                repo.pipeline_status = pipeline.get("status")
                repo.pipeline_url = pipeline.get("web_url")
        except Exception:
            pass

    _save_release(project_id, state)
    return state


async def run_stage3(project_id: str, version: str, gitlab_token: str) -> ReleaseState:
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    for i, repo in enumerate(state.stage3):
        if repo.status in (RepoStage3Status.SUCCESS, RepoStage3Status.ALREADY_EXISTS):
            continue
        state.stage3[i] = await _run_stage3_repo(project_id, version, repo, gitlab_token)

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
    state.stage3[idx] = await _run_stage3_repo(project_id, version, repo, gitlab_token)
    _save_release(project_id, state)
    return state


async def create_ra_subtask(project_id: str, version: str, repo_name: str) -> ReleaseState:
    """Manually create a Jira subtask under the RA ticket for a specific repo."""
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    idx = next((i for i, r in enumerate(state.stage3) if r.name == repo_name), None)
    if idx is None:
        raise ValueError(f"Repository {repo_name!r} not in release {version}")

    repo = state.stage3[idx]
    if not repo.requires_ra:
        raise ValueError(f"Repository {repo_name!r} does not require RA")

    ra_ticket_key = _jira_key_from_url(state.risk_assessment_url)
    if not ra_ticket_key:
        raise ValueError("No Risk Assessment ticket linked to this release")

    mr_url = repo.mr_url or ""
    subtask_summary = f"MR created: {repo_name} — Release {version}"
    subtask_desc = (
        f"A merge request has been created for {repo_name} as part of "
        f"Release {version} and requires Risk Assessment sign-off.\n\n"
        f"Merge Request: {mr_url}"
    )

    url = await jira_client.create_subtask(
        parent_key=ra_ticket_key,
        summary=subtask_summary,
        description=subtask_desc,
    )
    if not url:
        raise RuntimeError("Failed to create Jira subtask — check Jira configuration")

    repo.ra_subtask_url = url
    state.stage3[idx] = repo
    _save_release(project_id, state)
    return state


async def get_jira_status_summary(project_id: str, version: str) -> JiraStatusSummary:
    """Return live Jira statuses for all tickets, RA ticket, RA subtasks, and CAB ticket."""
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    # ── Build repo association map from stored keys (key → [repo_name, ...]) ──
    ticket_to_repos: dict[str, list[str]] = {}
    for repo in state.stage1:
        for key in repo.jira_tickets:
            ticket_to_repos.setdefault(key, []).append(repo.name)

    # ── Collect RA subtask entries from stage3 ──
    subtask_entries: list[tuple[str, str]] = []  # (url, repo_name)
    for repo in state.stage3:
        if repo.ra_subtask_url:
            subtask_entries.append((repo.ra_subtask_url, repo.name))

    # ── Batch-fetch RA/CAB/subtask keys ──
    extra_keys: list[str] = []
    for url, _ in subtask_entries:
        k = _jira_key_from_url(url)
        if k:
            extra_keys.append(k)
    ra_key = _jira_key_from_url(state.risk_assessment_url)
    if ra_key:
        extra_keys.append(ra_key)
    cab_key = _jira_key_from_url(state.cab_ticket_url)
    if cab_key:
        extra_keys.append(cab_key)

    unique_extra = list(dict.fromkeys(extra_keys))
    fetched = {i["key"]: i for i in await jira_client.get_issues_by_keys(unique_extra)}

    # ── Fetch ALL release tickets by fix version (always reliable) ──
    proj = project_service.get_project(project_id)
    jira_project_key = proj.jira_project_key if proj else project_id.upper()
    raw_tickets = await jira_client.get_tickets_by_fix_version(version, jira_project_key)

    release_tickets: list[JiraTicketStatus] = []
    for issue in raw_tickets:
        fields = issue.get("fields", {})
        key = issue["key"]
        repos = ticket_to_repos.get(key, [])
        raw_components = [
            c.get("name", "") for c in fields.get("components", [])
            if c.get("name") and c.get("name", "").upper() != "NO_CODE_CHANGE"
        ]
        release_tickets.append(JiraTicketStatus(
            key=key,
            summary=fields.get("summary", ""),
            status=fields.get("status", {}).get("name", ""),
            url=f"{jira_client._jira_url()}/browse/{key}",
            issue_type=fields.get("issuetype", {}).get("name", ""),
            repos=repos,
            components=raw_components,
        ))

    # ── RA ticket ──
    ra_ticket: Optional[JiraTicketStatus] = None
    if ra_key and ra_key in fetched:
        i = fetched[ra_key]
        ra_ticket = JiraTicketStatus(
            key=i["key"], summary=i["summary"], status=i["status"],
            url=i["url"], issue_type=i.get("issue_type", ""), repos=[],
        )

    # ── RA subtasks — fetch directly from Jira so ALL subtasks appear ──
    # Build a key→repo_name map from stage3 stored ra_subtask_url entries
    subtask_key_to_repo: dict[str, str] = {}
    for url, repo_name in subtask_entries:
        k = _jira_key_from_url(url)
        if k:
            subtask_key_to_repo[k] = repo_name

    ra_subtasks: list[RaSubtaskInfo] = []
    if ra_key:
        jira_subtasks = await jira_client.get_issue_subtasks(ra_key)
        for sub in jira_subtasks:
            ra_subtasks.append(RaSubtaskInfo(
                key=sub["key"],
                summary=sub["summary"],
                status=sub["status"],
                url=sub["url"],
                repo_name=subtask_key_to_repo.get(sub["key"], ""),
            ))

    # ── CAB ticket ──
    cab_ticket: Optional[JiraTicketStatus] = None
    if cab_key and cab_key in fetched:
        i = fetched[cab_key]
        cab_ticket = JiraTicketStatus(
            key=i["key"], summary=i["summary"], status=i["status"],
            url=i["url"], issue_type=i.get("issue_type", ""), repos=[],
        )

    return JiraStatusSummary(
        release_tickets=release_tickets,
        ra_ticket=ra_ticket,
        ra_subtasks=ra_subtasks,
        cab_ticket=cab_ticket,
    )


def update_docs(project_id: str, version: str, req) -> ReleaseState:
    """Update documentation links for a release (admin only)."""
    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    if req.cab_date is not None:
        state.cab_date = req.cab_date
    if req.cab_ticket_url is not None:
        state.cab_ticket_url = req.cab_ticket_url
    if req.confluence_url is not None:
        state.confluence_url = req.confluence_url
    if req.risk_assessment_url is not None:
        state.risk_assessment_url = req.risk_assessment_url

    _save_release(project_id, state)
    return state


def apply_ra_requirements(project_id: str, version: str, ra_map: dict) -> ReleaseState:
    """
    Apply RA requirements from the Confluence release plan table to Stage 3 repos.

    ra_map: {normalised_component_name -> ra_value}  (e.g. {"my service": "Y"})

    Comparison: repo.name is normalised (underscores → space, lowercased)
    and matched against the normalised component names from the table.
    A repo gets requires_ra=True when the RA value starts with 'Y' (case-insensitive).
    """
    import re as _re

    def _normalise(s: str) -> str:
        return _re.sub(r"[\s_]+", " ", s.strip().lower())

    state = _load_release(project_id, version)
    if state is None:
        raise ValueError(f"Release {version} not found")

    for repo in state.stage3:
        key = _normalise(repo.name)
        ra_value = ra_map.get(key, "")
        repo.requires_ra = ra_value.strip().upper().startswith("Y")

    _save_release(project_id, state)
    return state


def archive_release(project_id: str, version: str) -> str:
    """
    Move the release subfolder into an archive directory.

    Source:      data/{project}/releases/{version}/
    Destination: data/{project}/releases/archive/{version}_{YYYYMMDD_HHMMSS}/

    Returns the archive folder name so it can be logged.
    Raises ValueError if the release does not exist.
    """
    src = _releases_dir(project_id) / version
    if not src.exists() or not (src / "state.json").exists():
        raise ValueError(f"Release {version} not found")

    archive_dir = _releases_dir(project_id) / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest_name = f"{version}_{timestamp}"
    dest = archive_dir / dest_name

    shutil.move(str(src), str(dest))
    return dest_name
