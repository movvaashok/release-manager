import json
from pathlib import Path

from app.config import settings
from app.models import LoginRequest, LoginResponse


def _users_path() -> Path:
    return settings.data_dir / "users.json"


def _load_users() -> list:
    path = _users_path()
    if not path.exists():
        return []
    return json.loads(path.read_text())


def _save_users(users: list) -> None:
    _users_path().write_text(json.dumps(users, indent=2))


def login(req: LoginRequest) -> LoginResponse:
    users = _load_users()
    user = next(
        (u for u in users if u["username"] == req.username and u["password"] == req.password),
        None,
    )
    if user is None:
        raise ValueError("Invalid username or password")

    if req.gitlab_token:
        user["gitlab_token"] = req.gitlab_token
        _save_users(users)

    return LoginResponse(
        username=user["username"],
        gitlab_token=user.get("gitlab_token"),
        has_token=bool(user.get("gitlab_token")),
    )
