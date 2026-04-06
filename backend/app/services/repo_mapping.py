"""Service for managing repo-to-component name mappings.

Stores mappings in a JSON file to link GitLab repositories to Confluence component names.
Used for updating Confluence release plan pages with MR links.
"""

import json
from pathlib import Path
from typing import Dict, Optional

# Store mappings in data directory
MAPPINGS_FILE = Path(__file__).parent.parent / "data" / "repo_component_mapping.json"


def _ensure_file_exists() -> None:
    """Ensure the mappings file exists."""
    MAPPINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not MAPPINGS_FILE.exists():
        MAPPINGS_FILE.write_text(json.dumps({}))


def get_all_mappings() -> Dict[str, str]:
    """Get all repo-to-component mappings.

    Returns:
        Dict mapping repo name → component name
        Example: {"service-a": "Service A", "config-repo": "Config"}
    """
    _ensure_file_exists()
    try:
        return json.loads(MAPPINGS_FILE.read_text())
    except (json.JSONDecodeError, FileNotFoundError):
        return {}


def get_component_name(repo_name: str) -> Optional[str]:
    """Get the component name for a given repo.

    Args:
        repo_name: The GitLab repository name

    Returns:
        The Confluence component name, or None if not mapped
    """
    mappings = get_all_mappings()
    return mappings.get(repo_name)


def set_mapping(repo_name: str, component_name: str) -> None:
    """Create or update a repo-to-component mapping.

    Args:
        repo_name: The GitLab repository name
        component_name: The Confluence component name
    """
    _ensure_file_exists()
    mappings = get_all_mappings()
    mappings[repo_name] = component_name
    MAPPINGS_FILE.write_text(json.dumps(mappings, indent=2))


def delete_mapping(repo_name: str) -> None:
    """Delete a repo-to-component mapping.

    Args:
        repo_name: The GitLab repository name to remove
    """
    _ensure_file_exists()
    mappings = get_all_mappings()
    if repo_name in mappings:
        del mappings[repo_name]
        MAPPINGS_FILE.write_text(json.dumps(mappings, indent=2))


def set_bulk_mappings(mappings: Dict[str, str]) -> None:
    """Replace all mappings with new ones.

    Args:
        mappings: Dict of repo_name → component_name
    """
    _ensure_file_exists()
    MAPPINGS_FILE.write_text(json.dumps(mappings, indent=2))
