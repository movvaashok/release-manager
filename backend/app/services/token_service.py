"""
Centralised token storage — single source of truth for all secrets.

File: data/tokens.json
Structure:
{
    "system": {
        "gitlab_token":   "<string | null>",
        "jira_email":     "<string | null>",
        "jira_api_token": "<string | null>"
    },
    "users": {
        "<username>": "<gitlab_token | null>",
        ...
    }
}

The .env file intentionally contains NO secrets after this refactor;
it only carries non-sensitive config such as GITLAB_URL, JIRA_URL, and
JIRA_DEFAULT_PROJECT.
"""

import json
from pathlib import Path
from typing import Optional, Tuple

from app.config import settings


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _tokens_path() -> Path:
    return settings.data_dir / "tokens.json"


def _empty() -> dict:
    return {"system": {"gitlab_token": None, "jira_email": None, "jira_api_token": None}, "users": {}}


def _load() -> dict:
    path = _tokens_path()
    if not path.exists():
        return _empty()
    try:
        data = json.loads(path.read_text())
        # Ensure expected top-level keys exist (forward-compat)
        data.setdefault("system", {})
        data["system"].setdefault("gitlab_token", None)
        data["system"].setdefault("jira_email", None)
        data["system"].setdefault("jira_api_token", None)
        data.setdefault("users", {})
        return data
    except (json.JSONDecodeError, OSError):
        return _empty()


def _save(data: dict) -> None:
    _tokens_path().write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# System token accessors
# ---------------------------------------------------------------------------

def get_system_gitlab_token() -> Optional[str]:
    """Return the system-level GitLab personal access token, or None."""
    return _load()["system"].get("gitlab_token")


def get_jira_credentials() -> Tuple[Optional[str], Optional[str]]:
    """Return (jira_email, jira_api_token) for the shared Jira integration."""
    sys = _load()["system"]
    return sys.get("jira_email"), sys.get("jira_api_token")


def set_system_tokens(
    *,
    gitlab_token: Optional[str] = None,
    jira_email: Optional[str] = None,
    jira_api_token: Optional[str] = None,
) -> None:
    """Update any non-None system token values and persist."""
    data = _load()
    if gitlab_token is not None:
        data["system"]["gitlab_token"] = gitlab_token
    if jira_email is not None:
        data["system"]["jira_email"] = jira_email
    if jira_api_token is not None:
        data["system"]["jira_api_token"] = jira_api_token
    _save(data)


# ---------------------------------------------------------------------------
# Per-user token accessors
# ---------------------------------------------------------------------------

def get_user_token(username: str) -> Optional[str]:
    """Return the stored GitLab token for *username*, or None."""
    return _load()["users"].get(username)


def set_user_token(username: str, token: Optional[str]) -> None:
    """Persist the GitLab token for *username*."""
    data = _load()
    data["users"][username] = token
    _save(data)


def has_user_token(username: str) -> bool:
    return bool(get_user_token(username))


# ---------------------------------------------------------------------------
# Startup migration
# ---------------------------------------------------------------------------

def migrate_tokens() -> None:
    """
    One-time migration: if users.json still contains 'gitlab_token' fields,
    move them into tokens.json and strip the field from users.json.

    Also seeds system tokens from .env values if the token file is empty
    (handles first-run after upgrade from the old .env-based setup).
    """
    tokens_path = _tokens_path()
    users_path = settings.data_dir / "users.json"

    data = _load()
    changed = False

    # ── Seed system tokens from env if present and not yet in file ──────────
    # (env values are now optional; this is only for backward-compat on first run)
    env_gitlab = getattr(settings, "gitlab_token", None)
    if env_gitlab and not data["system"]["gitlab_token"]:
        data["system"]["gitlab_token"] = env_gitlab
        changed = True

    env_jira_email = getattr(settings, "jira_email", None)
    if env_jira_email and not data["system"]["jira_email"]:
        data["system"]["jira_email"] = env_jira_email
        changed = True

    env_jira_token = getattr(settings, "jira_api_token", None)
    if env_jira_token and not data["system"]["jira_api_token"]:
        data["system"]["jira_api_token"] = env_jira_token
        changed = True

    # ── Move per-user gitlab_token from users.json → tokens.json ────────────
    if users_path.exists():
        try:
            users = json.loads(users_path.read_text())
            users_changed = False
            for user in users:
                username = user.get("username")
                token = user.get("gitlab_token")
                if token and username and not data["users"].get(username):
                    data["users"][username] = token
                    changed = True
                if "gitlab_token" in user:
                    del user["gitlab_token"]
                    users_changed = True
            if users_changed:
                users_path.write_text(json.dumps(users, indent=2))
        except (json.JSONDecodeError, OSError):
            pass

    if changed or not tokens_path.exists():
        _save(data)
