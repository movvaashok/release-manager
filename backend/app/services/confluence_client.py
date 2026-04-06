"""
Confluence Cloud REST API client.

Uses the same Atlassian credentials as Jira (same base URL, same Basic Auth).
Confluence API lives under /wiki/rest/api/ on the same host.
"""
import base64
import re
from html.parser import HTMLParser
from typing import Dict, Optional

import httpx

from app.config import settings
from app.services import token_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _auth_header() -> str:
    jira_email, jira_api_token = token_service.get_jira_credentials()
    credentials = f"{jira_email}:{jira_api_token}"
    return "Basic " + base64.b64encode(credentials.encode()).decode()


def _wiki_base() -> str:
    return settings.jira_url.rstrip("/") + "/wiki"


def _normalise(text: str) -> str:
    """Lowercase and replace underscores/multiple spaces with a single space."""
    return re.sub(r"[\s_]+", " ", text.strip().lower())


def _extract_page_id(url: str) -> Optional[str]:
    """Extract the numeric page ID from a Confluence page URL.

    Handles both:
      .../wiki/spaces/SPACE/pages/12345678/Page+Title
      .../wiki/pages/12345678
    """
    m = re.search(r"/pages/(\d+)", url)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# Table parser (stdlib html.parser — no extra dependencies)
# ---------------------------------------------------------------------------

class _TableParser(HTMLParser):
    """Parses all <table> blocks from an HTML fragment into a list of 2-D lists."""

    def __init__(self) -> None:
        super().__init__()
        self.tables: list[list[list[str]]] = []
        self._cur_table: list[list[str]] = []
        self._cur_row: list[str] = []
        self._cur_cell: str = ""
        self._in_table = False
        self._in_cell = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag == "table":
            self._in_table = True
            self._cur_table = []
        elif tag == "tr" and self._in_table:
            self._cur_row = []
        elif tag in ("td", "th") and self._in_table:
            self._in_cell = True
            self._cur_cell = ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "table":
            self._in_table = False
            self.tables.append(self._cur_table)
        elif tag == "tr" and self._in_table:
            if self._cur_row:
                self._cur_table.append(self._cur_row)
        elif tag in ("td", "th") and self._in_table:
            self._in_cell = False
            self._cur_row.append(re.sub(r"\s+", " ", self._cur_cell).strip())

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cur_cell += data

    def handle_entityref(self, name: str) -> None:
        if self._in_cell:
            import html as _html
            self._cur_cell += _html.unescape(f"&{name};")

    def handle_charref(self, name: str) -> None:
        if self._in_cell:
            import html as _html
            self._cur_cell += _html.unescape(f"&#{name};")


def _parse_ra_from_html(html_content: str) -> Dict[str, str]:
    """
    Parse the release plan HTML and return a mapping of:
        normalised_component_name -> RA value ('Y', 'N', or free text)

    Looks for tables that have both a 'component' column and a 'requires ra'
    column (case-insensitive, partial match).  Only the first matching table is
    used.
    """
    parser = _TableParser()
    parser.feed(html_content)

    for table in parser.tables:
        if not table:
            continue

        # First row is headers
        headers = [_normalise(h) for h in table[0]]

        # Find column indices
        comp_idx = next(
            (i for i, h in enumerate(headers) if "component" in h), None
        )
        ra_idx = next(
            (i for i, h in enumerate(headers) if "requires ra" in h or "ra?" in h or "requires ra?" in h), None
        )

        if comp_idx is None or ra_idx is None:
            continue  # Not the right table

        ra_map: Dict[str, str] = {}
        for row in table[1:]:          # Skip header row
            if len(row) <= max(comp_idx, ra_idx):
                continue
            component = _normalise(row[comp_idx])
            ra_value = row[ra_idx].strip()
            if component:
                ra_map[component] = ra_value

        return ra_map   # Return first matching table

    return {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def find_page_by_title(title: str) -> Optional[dict]:
    """
    Search Confluence for a page whose title exactly matches *title*.

    Returns a dict with keys:
        id       – page ID
        title    – page title
        web_url  – full browser URL to the page

    Returns None if not found or Confluence is not configured.
    """
    jira_email, jira_api_token = token_service.get_jira_credentials()
    if not (settings.jira_url and jira_email and jira_api_token):
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


async def get_ra_requirements(page_url: str) -> Dict[str, str]:
    """
    Fetch a Confluence page by URL and extract RA requirements from the
    'Release description' table.

    The table must have:
      - A column whose header contains 'component'
      - A column whose header contains 'requires ra' (or 'ra?')

    Component names are normalised (lowercase, underscores → space) before
    being used as dictionary keys so they can be compared against repo names
    that have also been normalised.

    Returns: {normalised_component -> ra_value}   e.g. {"my service": "Y"}
    Returns an empty dict if not configured, page not found, or table not found.
    """
    jira_email, jira_api_token = token_service.get_jira_credentials()
    if not (settings.jira_url and jira_email and jira_api_token):
        return {}

    page_id = _extract_page_id(page_url)
    if not page_id:
        return {}

    auth_headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{_wiki_base()}/rest/api/content/{page_id}",
                headers=auth_headers,
                params={"expand": "body.view"},
                timeout=20.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return {}

    html_content = resp.json().get("body", {}).get("view", {}).get("value", "")
    if not html_content:
        return {}

    return _parse_ra_from_html(html_content)


async def update_mr_links(
    page_url: str,
    mr_links: Dict[str, str],  # component_name -> mr_url mapping
) -> bool:
    """
    Update the 'Gitlab Merge Request (MR) Link' column in a Confluence page table.

    Finds the table with 'Component name' and 'Gitlab Merge Request (MR) Link' columns,
    then updates the MR Link cells for matching components.

    Args:
        page_url: URL to the Confluence page
        mr_links: Dict mapping component name → MR URL
                 Example: {"Service A": "https://gitlab.com/.../merge_requests/123"}

    Returns:
        True if successfully updated, False otherwise
    """
    from bs4 import BeautifulSoup

    jira_email, jira_api_token = token_service.get_jira_credentials()
    if not (settings.jira_url and jira_email and jira_api_token):
        return False

    page_id = _extract_page_id(page_url)
    if not page_id:
        return False

    auth_headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
    }

    # Step 1: Get current page content and version
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{_wiki_base()}/rest/api/content/{page_id}",
                headers=auth_headers,
                params={"expand": "body.storage,version"},
                timeout=20.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError:
            return False

    page_data = resp.json()
    current_version = page_data.get("version", {}).get("number", 0)
    html_content = page_data.get("body", {}).get("storage", {}).get("value", "")

    if not html_content:
        return False

    # Step 2: Parse HTML and find the right table
    soup = BeautifulSoup(html_content, "html.parser")
    tables = soup.find_all("table")

    for table in tables:
        rows = table.find_all("tr")
        if not rows:
            continue

        # Parse header row
        header_cells = rows[0].find_all(["th", "td"])
        headers = [cell.get_text(strip=True) for cell in header_cells]
        headers_lower = [_normalise(h) for h in headers]

        # Find column indices
        comp_idx = next(
            (i for i, h in enumerate(headers_lower) if "component" in h),
            None,
        )
        mr_idx = next(
            (i for i, h in enumerate(headers_lower) if "gitlab" in h and "mr" in h),
            None,
        )

        if comp_idx is None or mr_idx is None:
            continue  # Not the right table

        # Step 3: Update MR links in data rows
        updated = False
        for row in rows[1:]:  # Skip header row
            cells = row.find_all(["td"])
            if len(cells) <= max(comp_idx, mr_idx):
                continue

            component_name = cells[comp_idx].get_text(strip=True)
            if component_name in mr_links:
                mr_url = mr_links[component_name]
                mr_cell = cells[mr_idx]

                # Clear the cell and add the MR link
                mr_cell.clear()
                link_tag = soup.new_tag("a", href=mr_url)
                link_tag.string = mr_url.split("/")[-1]  # Show MR number
                mr_cell.append(link_tag)
                updated = True

        if not updated:
            continue  # Not the right table if no updates made

        # Step 4: Update the page in Confluence
        new_html = str(soup)
        update_body = {
            "version": {"number": current_version + 1},
            "type": "page",
            "body": {"storage": {"value": new_html, "representation": "storage"}},
        }

        try:
            async with httpx.AsyncClient() as update_client:
                update_resp = await update_client.put(
                    f"{_wiki_base()}/rest/api/content/{page_id}",
                    headers=auth_headers,
                    json=update_body,
                    timeout=20.0,
                )
                update_resp.raise_for_status()
                return True
        except httpx.HTTPError:
            return False

    return False
