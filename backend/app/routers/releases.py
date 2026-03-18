from typing import List

from fastapi import APIRouter, Header, HTTPException, Query

from app.models import AddReposRequest, CreateReleaseRequest, ReleaseState, ReleaseSummary
from app.services import release_service

router = APIRouter(prefix="/releases", tags=["releases"])


@router.get("", response_model=List[ReleaseSummary])
def list_releases(project: str = Query("pioneer")):
    return release_service.list_releases(project)


@router.post("", response_model=ReleaseState, status_code=201)
def create_release(req: CreateReleaseRequest, project: str = Query("pioneer")):
    try:
        return release_service.create_release(project, req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{version}", response_model=ReleaseState)
def get_release(version: str, project: str = Query("pioneer")):
    state = release_service.get_release(project, version)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Release {version} not found")
    return state


@router.post("/{version}/repos", response_model=ReleaseState)
def add_repos(version: str, req: AddReposRequest, project: str = Query("pioneer")):
    try:
        return release_service.add_repos_to_release(project, version, req.repo_names)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{version}/repos/{repo_name}", response_model=ReleaseState)
async def remove_repo(version: str, repo_name: str, x_gitlab_token: str = Header(...), project: str = Query("pioneer")):
    try:
        return await release_service.remove_repo_from_release(project, version, repo_name, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{version}/stage2", response_model=ReleaseState)
async def run_stage2(version: str, x_gitlab_token: str = Header(...), project: str = Query("pioneer")):
    try:
        return await release_service.run_stage2(project, version, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage2/{repo_name}/retry", response_model=ReleaseState)
async def retry_stage2_repo(version: str, repo_name: str, x_gitlab_token: str = Header(...), project: str = Query("pioneer")):
    try:
        return await release_service.run_stage2_repo(project, version, repo_name, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage3", response_model=ReleaseState)
async def run_stage3(version: str, x_gitlab_token: str = Header(...), project: str = Query("pioneer")):
    try:
        return await release_service.run_stage3(project, version, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage3/{repo_name}/retry", response_model=ReleaseState)
async def retry_stage3_repo(version: str, repo_name: str, x_gitlab_token: str = Header(...), project: str = Query("pioneer")):
    try:
        return await release_service.run_stage3_repo(project, version, repo_name, x_gitlab_token)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
