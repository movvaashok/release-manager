"""
Confluence Cloud REST API client.

Uses the same Atlassian credentials as Jira (same base URL, same Basic Auth).
Confluence API lives under /wiki/rest/api/ on the same host.
"""
import base64
import logging
import re
from html.parser import HTMLParser
from typing import Dict, Optional

import httpx
from bs4 import BeautifulSoup

from app.config import settings
from app.services import token_service

logger = logging.getLogger(__name__)


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
    logger.info(f"Starting Confluence MR links update for page: {page_url}")
    logger.info(f"MR links to update: {mr_links}")

    jira_email, jira_api_token = token_service.get_jira_credentials()
    if not (settings.jira_url and jira_email and jira_api_token):
        logger.error("Missing Jira/Confluence credentials")
        return False

    page_id = _extract_page_id(page_url)
    if not page_id:
        logger.error(f"Failed to extract page ID from URL: {page_url}")
        return False

    logger.info(f"Extracted page ID: {page_id}")

    auth_headers = {
        "Authorization": _auth_header(),
        "Accept": "application/json",
    }

    # Step 1: Get current page content and version
    async with httpx.AsyncClient() as client:
        try:
            logger.info(f"Fetching page content from Confluence...")
            resp = await client.get(
                f"{_wiki_base()}/rest/api/content/{page_id}",
                headers=auth_headers,
                params={"expand": "body.storage,version"},
                timeout=20.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch page: {e}")
            return False

    page_data = resp.json()
    current_version = page_data.get("version", {}).get("number", 0)
    page_title = page_data.get("title", "")
    html_content = page_data.get("body", {}).get("storage", {}).get("value", "")

    logger.info(f"Page title: {page_title}, version: {current_version}, HTML content length: {len(html_content)}")

    if not html_content:
        logger.error("No HTML content found in page")
        return False

    if not page_title:
        logger.error("No page title found in page data")
        return False

    # Step 2: Parse HTML and find the right table (under "Release Packages" section)
    soup = BeautifulSoup(html_content, "html.parser")
    tables = soup.find_all("table")
    logger.info(f"Found {len(tables)} table(s) in page")

    # Try to find the table under "Release Packages" section first
    release_packages_heading = None
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        if "release package" in heading.get_text(strip=True).lower():
            release_packages_heading = heading
            logger.info(f"Found 'Release Packages' section heading")
            break

    # Start table search from Release Packages section if found, otherwise search all tables
    tables_to_search = []
    if release_packages_heading:
        # Find all tables after the Release Packages heading
        current = release_packages_heading.find_next()
        while current:
            if current.name == "table":
                tables_to_search.append(current)
            # Stop searching if we hit another heading at same or higher level
            if current.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                break
            current = current.find_next()
        logger.info(f"Found {len(tables_to_search)} table(s) under Release Packages section")
    else:
        logger.warning("'Release Packages' section not found, searching all tables")
        tables_to_search = tables

    for table_idx, table in enumerate(tables_to_search):
        rows = table.find_all("tr")
        if not rows:
            continue

        logger.debug(f"Table {table_idx}: {len(rows)} rows")

        # Parse header row
        header_cells = rows[0].find_all(["th", "td"])
        headers = [cell.get_text(strip=True) for cell in header_cells]
        headers_lower = [_normalise(h) for h in headers]

        logger.debug(f"Table {table_idx} headers: {headers}")

        # Find column indices
        comp_idx = next(
            (i for i, h in enumerate(headers_lower) if "component" in h),
            None,
        )
        mr_idx = next(
            (i for i, h in enumerate(headers_lower) if "gitlab" in h and "mr" in h),
            None,
        )

        logger.debug(f"Table {table_idx}: component_idx={comp_idx}, mr_idx={mr_idx}")

        if comp_idx is None or mr_idx is None:
            continue  # Not the right table

        # Step 3: Update MR links in data rows
        updated = False
        logger.info(f"Checking {len(rows) - 1} data rows in table {table_idx}")

        for row_idx, row in enumerate(rows[1:], 1):  # Skip header row
            cells = row.find_all(["td"])
            if len(cells) <= max(comp_idx, mr_idx):
                continue

            # Extract and normalize component name (handle multi-line text in cells)
            component_name = cells[comp_idx].get_text(strip=True)
            # Normalize whitespace: collapse multiple spaces/newlines into single space
            component_name = re.sub(r'\s+', ' ', component_name).strip()
            logger.debug(f"Row {row_idx}: component={component_name}")

            if component_name in mr_links:
                mr_url = mr_links[component_name]
                mr_cell = cells[mr_idx]

                logger.info(f"Updating row {row_idx}: {component_name} -> {mr_url}")

                # Clear the cell and add the MR link
                mr_cell.clear()
                link_tag = soup.new_tag("a", href=mr_url)
                link_tag.string = mr_url  # Show full MR URL
                mr_cell.append(link_tag)
                updated = True

        if not updated:
            logger.debug(f"Table {table_idx}: No rows updated, skipping")
            continue  # Not the right table if no updates made


        # Step 4: Update the page in Confluence
        new_html = str(soup)

        # Validate HTML - ensure it's not empty and contains the table
        if not new_html or len(new_html) < 100:
            logger.error(f"Generated HTML is too short or empty: {len(new_html)} chars")
            return False

        if "<table" not in new_html:
            logger.error("Generated HTML does not contain a table")
            return False

        logger.info(f"Generated HTML length: {len(new_html)} chars")
        logger.debug(f"Generated HTML preview: {new_html[:500]}...")

        update_body = {
            "title": page_title,
            "type": "page",
            "version": {"number": current_version + 1},
            "body": {"storage": {"value": new_html, "representation": "storage"}},
        }

        logger.info(f"Sending update to Confluence with new version: {current_version + 1}")
        logger.debug(f"Update request body keys: {list(update_body.keys())}")

        try:
            async with httpx.AsyncClient() as update_client:
                update_resp = await update_client.put(
                    f"{_wiki_base()}/rest/api/content/{page_id}",
                    headers=auth_headers,
                    json=update_body,
                    timeout=20.0,
                )

                if update_resp.status_code >= 400:
                    try:
                        error_detail = update_resp.json()
                        logger.error(f"Confluence API error {update_resp.status_code}: {error_detail}")
                    except:
                        logger.error(f"Confluence API error {update_resp.status_code}: {update_resp.text}")

                update_resp.raise_for_status()
                logger.info(f"Successfully updated Confluence page")
                return True
        except httpx.HTTPError as e:
            logger.error(f"Failed to update Confluence page: {e}")
            return False

    logger.warning(f"No matching table found with 'Component name' and 'Gitlab Merge Request (MR) Link' columns")
    return False
