"""
Append-only JSON-lines audit log — one file per release.

Storage layout:
  data/{project}/releases/{version}/audit.jsonl

Each line is a JSON object:
{
  "id": "uuid",
  "timestamp": "2024-01-01T12:00:00Z",
  "username": "alice",
  "action": "stage2_run",
  "repo_name": null,     # set for per-repo actions
  "details": { ... }    # optional extra context
}

Keeping the log inside the release subfolder means:
- No cross-release file contention when multiple users act on different releases.
- Reads scan only the relevant file (never grows with unrelated data).
- Deleting a release can cleanly remove its audit log too.
"""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings


def _log_path(project: str, release_version: str) -> Path:
    """Return the path for a release-scoped audit log file, creating dirs as needed."""
    path = settings.data_dir / project / "releases" / release_version / "audit.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def record(
    *,
    username: str,
    action: str,
    project: str,
    release_version: str,
    repo_name: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Append a single audit entry to the release-scoped log file."""
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "username": username,
        "action": action,
        "repo_name": repo_name,
        "details": details or {},
    }
    with _log_path(project, release_version).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")


def get_logs(
    project: str,
    release_version: str,
    username_filter: Optional[str] = None,
    from_ts: Optional[str] = None,   # ISO-8601
    to_ts: Optional[str] = None,     # ISO-8601
) -> List[Dict[str, Any]]:
    """Return all audit entries for a release, newest first, with optional filters."""
    path = _log_path(project, release_version)
    if not path.exists():
        return []

    results: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if username_filter and entry.get("username") != username_filter:
                continue
            if from_ts and entry.get("timestamp", "") < from_ts:
                continue
            if to_ts and entry.get("timestamp", "") > to_ts:
                continue

            results.append(entry)

    results.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return results


def get_all_usernames(project: str, release_version: str) -> List[str]:
    """Return distinct usernames who have entries in this release's audit log."""
    path = _log_path(project, release_version)
    if not path.exists():
        return []
    seen: set[str] = set()
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if u := entry.get("username"):
                seen.add(u)
    return sorted(seen)
