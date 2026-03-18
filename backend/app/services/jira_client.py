import base64
from typing import List

import httpx

from app.config import settings


def _auth_header() -> str:
    credentials = f"{settings.jira_email}:{settings.jira_api_token}"
    return "Basic " + base64.b64encode(credentials.encode()).decode()


async def get_tickets_by_fix_version(version: str, project: str) -> List[dict]:
    jql = f'project = "{project}" AND fixVersion = "{version}" ORDER BY created DESC'
    headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
    }
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{settings.jira_url.rstrip('/')}/rest/api/3/search",
            headers=headers,
            params={
                "jql": jql,
                "fields": "summary,status,priority,components,issuetype",
                "maxResults": 100,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json().get("issues", [])
