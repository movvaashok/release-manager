from typing import List

from fastapi import APIRouter

from app.models import RepoReference
from app.services.release_service import get_references

router = APIRouter(tags=["repositories"])


@router.get("/repos/reference", response_model=List[RepoReference])
def list_reference_repos():
    """Return all repositories from the reference JSON file."""
    return get_references()
