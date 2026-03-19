from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.services import jira_client, project_service

router = APIRouter(prefix="/jira", tags=["jira"])


class JiraTicket(BaseModel):
    key: str
    summary: str
    status: str
    issue_type: str
    priority: Optional[str] = None
    components: List[str]
    url: Optional[str] = None


class JiraTicketsResponse(BaseModel):
    tickets: List[JiraTicket]
    total: int


def _check_configured() -> None:
    if not all([settings.jira_url, settings.jira_email, settings.jira_api_token]):
        raise HTTPException(
            status_code=503,
            detail="Jira integration is not configured. Set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env.",
        )


@router.get("/tickets", response_model=JiraTicketsResponse)
async def get_tickets(
    version: str = Query(..., description="Fix version to search for (e.g. 2.15.0)"),
    project: str = Query("pioneer", description="Project ID (pioneer, calibrate, …)"),
) -> JiraTicketsResponse:
    _check_configured()
    proj = project_service.get_project(project)
    jira_key = proj.jira_project_key if proj else settings.jira_default_project

    try:
        raw_issues = await jira_client.get_tickets_by_fix_version(version, jira_key)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Jira API error: {exc}")

    tickets = []
    for issue in raw_issues:
        fields = issue.get("fields", {})
        ticket_key = issue["key"]
        ticket_url = f"{settings.jira_url.rstrip('/')}/browse/{ticket_key}" if settings.jira_url else None
        tickets.append(
            JiraTicket(
                key=ticket_key,
                summary=fields.get("summary", ""),
                status=(fields.get("status") or {}).get("name", ""),
                issue_type=(fields.get("issuetype") or {}).get("name", ""),
                priority=(fields.get("priority") or {}).get("name"),
                components=[c["name"] for c in fields.get("components", [])],
                url=ticket_url,
            )
        )

    return JiraTicketsResponse(tickets=tickets, total=len(tickets))
