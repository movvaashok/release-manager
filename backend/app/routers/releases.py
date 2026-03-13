from typing import List

from fastapi import APIRouter, Header, HTTPException

from app.models import AddReposRequest, CreateReleaseRequest, ReleaseState, ReleaseSummary
from app.services import release_service

router = APIRouter(prefix="/releases", tags=["releases"])


# ---------------------------------------------------------------------------
# Release CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ReleaseSummary])
def list_releases():
    return release_service.list_releases()


@router.post("", response_model=ReleaseState, status_code=201)
def create_release(req: CreateReleaseRequest):
    try:
        return release_service.create_release(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{version}", response_model=ReleaseState)
def get_release(version: str):
    state = release_service.get_release(version)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Release {version} not found")
    return state


@router.post("/{version}/repos", response_model=ReleaseState)
def add_repos(version: str, req: AddReposRequest):
    try:
        return release_service.add_repos_to_release(version, req.repo_names)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{version}/repos/{repo_name}", response_model=ReleaseState)
async def remove_repo(version: str, repo_name: str, x_gitlab_token: str = Header(...)):
    try:
        return await release_service.remove_repo_from_release(version, repo_name, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Stage 2 – release branch management
# ---------------------------------------------------------------------------

@router.post("/{version}/stage2", response_model=ReleaseState)
async def run_stage2(version: str, x_gitlab_token: str = Header(...)):
    try:
        return await release_service.run_stage2(version, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage2/{repo_name}/retry", response_model=ReleaseState)
async def retry_stage2_repo(version: str, repo_name: str, x_gitlab_token: str = Header(...)):
    try:
        return await release_service.run_stage2_repo(version, repo_name, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# Stage 3 – merge request creation
# ---------------------------------------------------------------------------

@router.post("/{version}/stage3", response_model=ReleaseState)
async def run_stage3(version: str, x_gitlab_token: str = Header(...)):
    try:
        return await release_service.run_stage3(version, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage3/{repo_name}/retry", response_model=ReleaseState)
async def retry_stage3_repo(version: str, repo_name: str, x_gitlab_token: str = Header(...)):
    try:
        return await release_service.run_stage3_repo(version, repo_name, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
