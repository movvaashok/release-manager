from typing import List

from fastapi import APIRouter, HTTPException

from app.models import CreateUserRequest, LoginRequest, LoginResponse, UpdateUserProjectsRequest, UserSummary
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest):
    try:
        return auth_service.login(req)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


@router.get("/users", response_model=List[UserSummary])
def list_users():
    return auth_service.get_all_users()


@router.post("/users", response_model=UserSummary, status_code=201)
def create_user(req: CreateUserRequest):
    try:
        return auth_service.create_user(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/users/{username}/projects", response_model=UserSummary)
def update_user_projects(username: str, req: UpdateUserProjectsRequest):
    try:
        return auth_service.update_user_projects(username, req.projects)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/users/{username}", status_code=204)
def delete_user(username: str):
    try:
        auth_service.delete_user(username)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
