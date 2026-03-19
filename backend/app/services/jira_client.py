import base64
from typing import List, Optional

import httpx

from app.config import settings


def _auth_header() -> str:
    credentials = f"{settings.jira_email}:{settings.jira_api_token}"
    return "Basic " + base64.b64encode(credentials.encode()).decode()


async def _resolve_fix_version(client: httpx.AsyncClient, project: str, version: str, headers: dict) -> str:
    """Return the exact Jira fixVersion name that ends with the given version string (e.g. 'Pioneer v2.14.0')."""
    response = await client.get(
        f"{settings.jira_url.rstrip('/')}/rest/api/3/project/{project}/versions",
        headers=headers,
        timeout=30.0,
    )
    response.raise_for_status()
    for v in response.json():
        name = v.get("name", "").strip()
        if name.endswith(version):
            return name
    # Fallback to the raw version string if no match found
    return version


async def get_tickets_by_fix_version(version: str, project: str) -> List[dict]:
    headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resolved_version = await _resolve_fix_version(client, project, version, headers)
        jql = f'project = "{project}" AND fixVersion = "{resolved_version}" ORDER BY created DESC'

        response = await client.post(
            f"{settings.jira_url.rstrip('/')}/rest/api/3/search/jql",
            headers=headers,
            json={
                "jql": jql,
                "fields": ["summary", "status", "priority", "components", "issuetype"],
                "maxResults": 100,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json().get("issues", [])


async def find_tsd_ticket(project: str, version: str) -> Optional[dict]:
    """
    Search the TSD Jira project for a ticket whose summary matches
    '<Project> v<version>'  e.g. 'Pioneer v2.14.0' or 'Calibrate v2.14.0'.

    Returns a dict with:
        key     – issue key  (e.g. 'TSD-123')
        summary – issue summary
        url     – full browser URL to the Jira ticket
        status  – issue status name

    Returns None if Jira is not configured or no matching ticket is found.
    """
    if not (settings.jira_url and settings.jira_email and settings.jira_api_token):
        return None

    # Title format: "Pioneer v2.14.0" / "Calibrate v2.14.0"
    project_label = project.capitalize()
    summary_search = f"{project_label} v{version}"

    headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    # Use JQL text search on summary within the TSD project
    jql = f'project = "TSD" AND summary ~ "{summary_search}" ORDER BY created DESC'

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{settings.jira_url.rstrip('/')}/rest/api/3/search/jql",
                headers=headers,
                json={
                    "jql": jql,
                    "fields": ["summary", "status"],
                    "maxResults": 5,
                },
                timeout=15.0,
            )
            response.raise_for_status()
        except httpx.HTTPError:
            return None

        issues = response.json().get("issues", [])
        if not issues:
            return None

        # Pick the first issue whose summary contains the expected string (case-insensitive)
        target = summary_search.lower()
        for issue in issues:
            summary = issue.get("fields", {}).get("summary", "")
            if target in summary.lower():
                key = issue["key"]
                status = issue.get("fields", {}).get("status", {}).get("name", "")
                url = f"{settings.jira_url.rstrip('/')}/browse/{key}"
                return {"key": key, "summary": summary, "url": url, "status": status}

        # Fallback to first result if no exact substring match
        issue = issues[0]
        key = issue["key"]
        summary = issue.get("fields", {}).get("summary", "")
        status = issue.get("fields", {}).get("status", {}).get("name", "")
        url = f"{settings.jira_url.rstrip('/')}/browse/{key}"
        return {"key": key, "summary": summary, "url": url, "status": status}
