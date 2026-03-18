from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.services import jira_client

router = APIRouter(prefix="/jira", tags=["jira"])


class JiraTicket(BaseModel):
    key: str
    summary: str
    status: str
    issue_type: str
    priority: Optional[str] = None
    components: List[str]


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
    project: Optional[str] = Query(None, description="Jira project key (defaults to JIRA_DEFAULT_PROJECT)"),
) -> JiraTicketsResponse:
    _check_configured()
    project = project or settings.jira_default_project

    try:
        raw_issues = await jira_client.get_tickets_by_fix_version(version, project)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Jira API error: {exc}")

    tickets = []
    for issue in raw_issues:
        fields = issue.get("fields", {})
        tickets.append(
            JiraTicket(
                key=issue["key"],
                summary=fields.get("summary", ""),
                status=(fields.get("status") or {}).get("name", ""),
                issue_type=(fields.get("issuetype") or {}).get("name", ""),
                priority=(fields.get("priority") or {}).get("name"),
                components=[c["name"] for c in fields.get("components", [])],
            )
        )

    return JiraTicketsResponse(tickets=tickets, total=len(tickets))
