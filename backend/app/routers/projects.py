from typing import List

from fastapi import APIRouter, HTTPException

from app.models import ProjectConfig, UpdateProjectConfigRequest
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectConfig])
def list_projects():
    return project_service.get_all()


@router.get("/{project_id}", response_model=ProjectConfig)
def get_project(project_id: str):
    project = project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return project


@router.put("/{project_id}/configuration", response_model=ProjectConfig)
def update_project_configuration(project_id: str, request: UpdateProjectConfigRequest):
    """Update project-specific configuration (Jira and Confluence base URLs)."""
    # Verify project exists
    project = project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    updated_project = project_service.update_project_config(
        project_id,
        jira_base_url=request.jira_base_url,
        confluence_base_url=request.confluence_base_url
    )

    if not updated_project:
        raise HTTPException(status_code=500, detail="Failed to update project configuration")

    return updated_project
