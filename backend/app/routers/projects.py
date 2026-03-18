from typing import List

from fastapi import APIRouter

from app.models import ProjectConfig
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectConfig])
def list_projects():
    return project_service.get_all()
