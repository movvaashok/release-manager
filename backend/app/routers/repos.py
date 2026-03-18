from typing import List

from fastapi import APIRouter, HTTPException, Query

from app.models import AddReferenceRepoRequest, RepoReference, UpdateReferenceRepoRequest
from app.services import repo_service

router = APIRouter(tags=["repositories"])


@router.get("/repos/reference", response_model=List[RepoReference])
def list_reference_repos(project: str = Query("pioneer")):
    return repo_service.get_all(project)


@router.post("/repos/reference", response_model=List[RepoReference], status_code=201)
def add_reference_repo(req: AddReferenceRepoRequest, project: str = Query("pioneer")):
    try:
        return repo_service.add_repo(project, req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/repos/reference/{name}", response_model=List[RepoReference])
def update_reference_repo(name: str, req: UpdateReferenceRepoRequest, project: str = Query("pioneer")):
    try:
        return repo_service.update_repo(project, name, req)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/repos/reference/{name}", response_model=List[RepoReference])
def delete_reference_repo(name: str, project: str = Query("pioneer")):
    try:
        return repo_service.delete_repo(project, name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
