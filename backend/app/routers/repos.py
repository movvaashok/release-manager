from typing import List

from fastapi import APIRouter, HTTPException

from app.models import AddReferenceRepoRequest, RepoReference, UpdateReferenceRepoRequest
from app.services import repo_service

router = APIRouter(tags=["repositories"])


@router.get("/repos/reference", response_model=List[RepoReference])
def list_reference_repos():
    return repo_service.get_all()


@router.post("/repos/reference", response_model=List[RepoReference], status_code=201)
def add_reference_repo(req: AddReferenceRepoRequest):
    try:
        return repo_service.add_repo(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/repos/reference/{name}", response_model=List[RepoReference])
def update_reference_repo(name: str, req: UpdateReferenceRepoRequest):
    try:
        return repo_service.update_repo(name, req)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/repos/reference/{name}", response_model=List[RepoReference])
def delete_reference_repo(name: str):
    try:
        return repo_service.delete_repo(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
