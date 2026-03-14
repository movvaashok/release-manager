import json
from pathlib import Path
from typing import List

from app.config import settings
from app.models import CreateUserRequest, LoginRequest, LoginResponse, UserSummary


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
        role=user.get("role", "user"),
    )


def get_all_users() -> List[UserSummary]:
    users = _load_users()
    return [
        UserSummary(
            username=u["username"],
            role=u.get("role", "user"),
            has_token=bool(u.get("gitlab_token")),
        )
        for u in users
    ]


def create_user(req: CreateUserRequest) -> UserSummary:
    users = _load_users()
    if any(u["username"] == req.username for u in users):
        raise ValueError(f"User '{req.username}' already exists")
    new_user = {"username": req.username, "password": req.password, "gitlab_token": None, "role": req.role}
    users.append(new_user)
    _save_users(users)
    return UserSummary(username=req.username, role=req.role, has_token=False)


def delete_user(username: str) -> None:
    users = _load_users()
    new_users = [u for u in users if u["username"] != username]
    if len(new_users) == len(users):
        raise ValueError(f"User '{username}' not found")
    _save_users(new_users)
