import json
from typing import List, Optional

from app.config import settings
from app.models import ProjectConfig


def _projects_path():
    return settings.data_dir / "projects.json"


def get_all() -> List[ProjectConfig]:
    path = _projects_path()
    if not path.exists():
        return []
    return [ProjectConfig.model_validate(p) for p in json.loads(path.read_text())]


def get_project(project_id: str) -> Optional[ProjectConfig]:
    return next((p for p in get_all() if p.id == project_id), None)


def update_project_config(
    project_id: str,
    jira_base_url: Optional[str] = None,
    confluence_base_url: Optional[str] = None,
    release_branch_source: Optional[str] = None,
    release_branch_pattern: Optional[str] = None,
    mr_include_jira_ticket: Optional[bool] = None,
) -> Optional[ProjectConfig]:
    """Update project configuration (URLs, release branch settings, and MR options)."""
    path = _projects_path()
    if not path.exists():
        return None

    projects = json.loads(path.read_text())
    updated = False

    for project in projects:
        if project.get("id") == project_id:
            if jira_base_url is not None:
                project["jira_base_url"] = jira_base_url
            if confluence_base_url is not None:
                project["confluence_base_url"] = confluence_base_url
            if release_branch_source is not None:
                project["release_branch_source"] = release_branch_source
            if release_branch_pattern is not None:
                project["release_branch_pattern"] = release_branch_pattern
            if mr_include_jira_ticket is not None:
                project["mr_include_jira_ticket"] = mr_include_jira_ticket
            updated = True
            break

    if updated:
        path.write_text(json.dumps(projects, indent=2))
        return get_project(project_id)

    return None
