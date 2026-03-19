"""
Confluence Cloud REST API client.

Uses the same Atlassian credentials as Jira (same base URL, same Basic Auth).
Confluence API lives under /wiki/rest/api/ on the same host.
"""
import base64
from typing import Optional

import httpx

from app.config import settings


def _auth_header() -> str:
    credentials = f"{settings.jira_email}:{settings.jira_api_token}"
    return "Basic " + base64.b64encode(credentials.encode()).decode()


def _wiki_base() -> str:
    return settings.jira_url.rstrip("/") + "/wiki"


async def find_page_by_title(title: str) -> Optional[dict]:
    """
    Search Confluence for a page whose title exactly matches *title*.

    Returns a dict with keys:
        id       – page ID
        title    – page title
        web_url  – full browser URL to the page

    Returns None if not found or Confluence is not configured.
    """
    if not (settings.jira_url and settings.jira_email and settings.jira_api_token):
        return None

    headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
    }

    params = {
        "title": title,
        "type": "page",
        "expand": "space",
        "limit": 5,
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{_wiki_base()}/rest/api/content",
                headers=headers,
                params=params,
                timeout=15.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return None

        data = resp.json()
        results = data.get("results", [])
        if not results:
            return None

        page = results[0]
        page_id = page["id"]
        page_title = page.get("title", title)

        # Build the canonical browser URL
        links = page.get("_links", {})
        base_url = links.get("base") or _wiki_base()
        web_ui = links.get("webui", f"/pages/{page_id}")
        web_url = base_url.rstrip("/") + web_ui

        return {"id": page_id, "title": page_title, "web_url": web_url}
