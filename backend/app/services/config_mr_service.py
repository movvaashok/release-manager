"""
Service for tracking config-repo merge requests associated with a release.

Storage layout:
    data/{project_id}/releases/{version}/config_mrs.json
    [
      {
        "main_repo":      "my-service",
        "config_repo":    "my-service-config",
        "mr_iid":         42,
        "mr_url":         "https://gitlab.com/.../merge_requests/42",
        "title":          "feature/TSSA-1234-prod",
        "source_branch":  "feature/TSSA-1234-prod",
        "target_branch":  "master",
        "state":          "opened",
        "tracked_at":     "2024-06-15T10:23:00Z"
      },
      ...
    ]
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from app.config import settings
from app.models import ConfigMR, OpenMR, ConfigMrsResponse
from app.services.gitlab_client import get_gitlab_client


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _config_mrs_path(project_id: str, version: str) -> Path:
    return settings.data_dir / project_id / "releases" / version / "config_mrs.json"


def _load_tracked(project_id: str, version: str) -> List[ConfigMR]:
    path = _config_mrs_path(project_id, version)
    if not path.exists():
        return []
    with open(path) as f:
        data = json.load(f)
    return [ConfigMR(**item) for item in data]


def _save_tracked(project_id: str, version: str, mrs: List[ConfigMR]) -> None:
    path = _config_mrs_path(project_id, version)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump([mr.model_dump() for mr in mrs], f, indent=2, default=str)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_tracked_mrs(project_id: str, version: str) -> List[ConfigMR]:
    """Return all tracked config MRs for a release."""
    return _load_tracked(project_id, version)


async def get_config_mrs_response(
    project_id: str,
    version: str,
    main_repo: str,
    config_repo_project_id: int,
    gitlab_token: str,
) -> ConfigMrsResponse:
    """
    Return both:
    - tracked MRs stored in config_mrs.json (filtered by main_repo)
    - live open MRs from the config repo on GitLab
    """
    tracked = [mr for mr in _load_tracked(project_id, version) if mr.main_repo == main_repo]

    client = get_gitlab_client(gitlab_token)
    raw_mrs = await client.get_open_mrs(config_repo_project_id)

    open_mrs: List[OpenMR] = []
    for mr in raw_mrs:
        open_mrs.append(
            OpenMR(
                mr_iid=mr["iid"],
                mr_url=mr["web_url"],
                title=mr["title"],
                source_branch=mr["source_branch"],
                target_branch=mr["target_branch"],
                state=mr["state"],
                author=mr.get("author", {}).get("name", "unknown"),
            )
        )

    return ConfigMrsResponse(tracked=tracked, open_mrs=open_mrs)


def track_mr(
    project_id: str,
    version: str,
    main_repo: str,
    config_repo: str,
    mr_iid: int,
    mr_url: str,
    title: str,
    source_branch: str,
    target_branch: str,
    state: str,
) -> List[ConfigMR]:
    """Add an MR to the tracked list. Idempotent (deduplicates by config_repo + mr_iid)."""
    mrs = _load_tracked(project_id, version)

    # Avoid duplicates
    existing = next(
        (m for m in mrs if m.config_repo == config_repo and m.mr_iid == mr_iid), None
    )
    if existing is None:
        mrs.append(
            ConfigMR(
                main_repo=main_repo,
                config_repo=config_repo,
                mr_iid=mr_iid,
                mr_url=mr_url,
                title=title,
                source_branch=source_branch,
                target_branch=target_branch,
                state=state,
                tracked_at=datetime.now(timezone.utc).isoformat(),
            )
        )
        _save_tracked(project_id, version, mrs)

    return _load_tracked(project_id, version)


def untrack_mr(project_id: str, version: str, config_repo: str, mr_iid: int) -> List[ConfigMR]:
    """Remove an MR from tracking. No-op if it was never tracked."""
    mrs = _load_tracked(project_id, version)
    updated = [m for m in mrs if not (m.config_repo == config_repo and m.mr_iid == mr_iid)]
    _save_tracked(project_id, version, updated)
    return updated
