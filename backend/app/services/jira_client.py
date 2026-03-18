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
    jql_project_only = f'project = "{project}" ORDER BY created DESC'
    print(f"[JIRA DEBUG] JQL (full): {jql}", flush=True)
    print(f"[JIRA DEBUG] JQL (project only): {jql_project_only}", flush=True)
    headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        # Test 0: list all versions in the project
        r0 = await client.get(
            f"{settings.jira_url.rstrip('/')}/rest/api/3/project/{project}/versions",
            headers=headers,
            timeout=30.0,
        )
        versions = [v.get("name") for v in r0.json()] if r0.status_code == 200 else []
        print(f"[JIRA DEBUG] versions in {project}: {versions}", flush=True)

        # Test 1: project only (to check access)
        r1 = await client.post(
            f"{settings.jira_url.rstrip('/')}/rest/api/3/search/jql",
            headers=headers,
            json={"jql": jql_project_only, "fields": ["summary"], "maxResults": 1},
            timeout=30.0,
        )
        d1 = r1.json()
        print(f"[JIRA DEBUG] project-only → status={r1.status_code} issues={len(d1.get('issues', []))} isLast={d1.get('isLast')}", flush=True)
        if d1.get("issues"):
            print(f"[JIRA DEBUG] sample key: {d1['issues'][0].get('key')}", flush=True)

        # Test 2: full JQL with fixVersion
        r2 = await client.post(
            f"{settings.jira_url.rstrip('/')}/rest/api/3/search/jql",
            headers=headers,
            json={"jql": jql, "fields": ["summary", "status", "priority", "components", "issuetype"], "maxResults": 100},
            timeout=30.0,
        )
        r2.raise_for_status()
        data = r2.json()
        issues = data.get("issues", [])
        print(f"[JIRA DEBUG] full JQL → status={r2.status_code} issues={len(issues)}", flush=True)
        if not issues:
            print("[JIRA DEBUG] NO ISSUES — fixVersion name likely doesn't match exactly", flush=True)
        return issues
