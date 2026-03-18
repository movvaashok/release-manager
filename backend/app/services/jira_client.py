import base64
from typing import List

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
