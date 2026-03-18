import base64
import logging
from typing import List

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _auth_header() -> str:
    credentials = f"{settings.jira_email}:{settings.jira_api_token}"
    return "Basic " + base64.b64encode(credentials.encode()).decode()


async def get_tickets_by_fix_version(version: str, project: str) -> List[dict]:
    jql = f'project = "{project}" AND fixVersion = "{version}" ORDER BY created DESC'
    print(f"[JIRA DEBUG] JQL: {jql}", flush=True)
    headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
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
        data = response.json()
        print(f"[JIRA DEBUG] status={response.status_code} total={data.get('total')} "
              f"issues={len(data.get('issues', []))} keys={list(data.keys())}", flush=True)
        return data.get("issues", [])
