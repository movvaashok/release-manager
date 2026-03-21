import base64
from typing import List, Optional

import httpx

from app.config import settings
from app.services import token_service


def _auth_header() -> str:
    jira_email, jira_api_token = token_service.get_jira_credentials()
    credentials = f"{jira_email}:{jira_api_token}"
    return "Basic " + base64.b64encode(credentials.encode()).decode()


def _jira_configured() -> bool:
    jira_email, jira_api_token = token_service.get_jira_credentials()
    return bool(settings.jira_url and jira_email and jira_api_token)


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


async def find_cab_ticket(project: str, version: str) -> Optional[dict]:
    """
    Search the TSD Jira project for a CAB ticket whose summary matches
    '<Project> v<version>'  e.g. 'Pioneer v2.14.0' or 'Calibrate v2.14.0'.

    Returns a dict with:
        key     – issue key  (e.g. 'TSD-123')
        summary – issue summary
        url     – full browser URL to the Jira ticket
        status  – issue status name

    Returns None if Jira is not configured or no matching ticket is found.
    """
    if not _jira_configured():
        return None

    # Title format: "Pioneer v2.14.0" / "Calibrate v2.14.0"
    project_label = project.capitalize()
    summary_search = f"{project_label} v{version}"

    headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    # Use JQL text search on summary within the TSD project.
    # Also fetch issuelinks so we can detect RA blockers in one round-trip.
    jql = f'project = "TSD" AND summary ~ "{summary_search}" ORDER BY created DESC'

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{settings.jira_url.rstrip('/')}/rest/api/3/search/jql",
                headers=headers,
                json={
                    "jql": jql,
                    "fields": ["summary", "status", "issuelinks"],
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
        matched = None
        for issue in issues:
            summary = issue.get("fields", {}).get("summary", "")
            if target in summary.lower():
                matched = issue
                break

        if matched is None:
            matched = issues[0]  # Fallback to first result

        key = matched["key"]
        summary = matched.get("fields", {}).get("summary", "")
        status = matched.get("fields", {}).get("status", {}).get("name", "")
        url = f"{settings.jira_url.rstrip('/')}/browse/{key}"

        # Extract RA ticket from issue links:
        # TSD "is blocked by" RA-XXX  →  link.type.inward == "is blocked by"
        #                                 and link.inwardIssue.key starts with "RA-"
        ra_url = _extract_ra_from_links(matched.get("fields", {}).get("issuelinks", []))

        return {"key": key, "summary": summary, "url": url, "status": status, "ra_url": ra_url}


def _extract_ra_from_links(issue_links: list) -> Optional[str]:
    """
    Scan Jira issue links on a CAB ticket for an RA blocker.

    Jira link types for "CAB ticket is blocked by RA-XXX":
      - link["type"]["inward"]  == "is blocked by"   AND link["inwardIssue"]["key"] starts with "RA"
    Also handles the reverse direction in case the link was created the other way:
      - link["type"]["outward"] == "blocks"           AND link["outwardIssue"]["key"] starts with "RA"
    """
    base = settings.jira_url.rstrip("/") if settings.jira_url else ""
    for link in issue_links:
        link_type = link.get("type", {})
        # "is blocked by" direction — inward issue is the RA ticket
        if "is blocked by" in link_type.get("inward", "").lower():
            inward = link.get("inwardIssue", {})
            key = inward.get("key", "")
            if key.upper().startswith("RA"):
                return f"{base}/browse/{key}"
        # "blocks" direction — outward issue is the RA ticket
        if "blocks" in link_type.get("outward", "").lower():
            outward = link.get("outwardIssue", {})
            key = outward.get("key", "")
            if key.upper().startswith("RA"):
                return f"{base}/browse/{key}"
    return None
