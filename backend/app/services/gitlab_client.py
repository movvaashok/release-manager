"""
Thin async wrapper around the GitLab API v4.
All branch names that appear as URL *path* segments are percent-encoded so that
names like "release/2.15.0" are transmitted correctly.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

from app.config import settings


def _encode_branch(branch: str) -> str:
    """Encode a branch name for use as a URL path segment."""
    return quote(branch, safe="")


class GitLabClient:
    def __init__(self, token: str) -> None:
        self._base = f"{settings.gitlab_url}/api/v4"
        self._headers = {
            "PRIVATE-TOKEN": token,
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Branch operations
    # ------------------------------------------------------------------

    async def get_branch(self, project_id: int, branch: str) -> Optional[Dict[str, Any]]:
        """Return branch info dict or None if the branch does not exist."""
        url = f"{self._base}/projects/{project_id}/repository/branches/{_encode_branch(branch)}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=self._headers, timeout=30)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()

    async def create_branch(
        self, project_id: int, branch: str, ref: str
    ) -> Dict[str, Any]:
        """Create *branch* from *ref*. Returns the created branch object."""
        url = f"{self._base}/projects/{project_id}/repository/branches"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers=self._headers,
                json={"branch": branch, "ref": ref},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def delete_branch(self, project_id: int, branch: str) -> None:
        url = f"{self._base}/projects/{project_id}/repository/branches/{_encode_branch(branch)}"
        async with httpx.AsyncClient() as client:
            resp = await client.delete(url, headers=self._headers, timeout=30)
            resp.raise_for_status()

    # ------------------------------------------------------------------
    # Compare / merge
    # ------------------------------------------------------------------

    async def compare_branches(
        self, project_id: int, from_branch: str, to_branch: str
    ) -> Dict[str, Any]:
        """
        Compare *from_branch*...*to_branch*.
        Returns GitLab compare object; check ``result["commits"]`` for pending commits.
        """
        url = f"{self._base}/projects/{project_id}/repository/compare"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=self._headers,
                params={"from": from_branch, "to": to_branch},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    # merge_branches is no longer used — Stage 2 merges via local git clone in release_service.py

    # ------------------------------------------------------------------
    # Merge requests
    # ------------------------------------------------------------------

    async def list_merge_requests(
        self,
        project_id: int,
        source_branch: str,
        target_branch: str,
        state: str = "opened",
    ) -> List[Dict[str, Any]]:
        url = f"{self._base}/projects/{project_id}/merge_requests"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=self._headers,
                params={
                    "state": state,
                    "source_branch": source_branch,
                    "target_branch": target_branch,
                },
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def create_merge_request(
        self,
        project_id: int,
        source_branch: str,
        target_branch: str,
        title: str,
        description: str = "",
    ) -> Dict[str, Any]:
        url = f"{self._base}/projects/{project_id}/merge_requests"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                headers=self._headers,
                json={
                    "source_branch": source_branch,
                    "target_branch": target_branch,
                    "title": title,
                    "description": description,
                },
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def get_merge_request(self, project_id: int, mr_iid: int) -> Dict[str, Any]:
        """Fetch a single MR by IID — includes state and merge_status fields."""
        url = f"{self._base}/projects/{project_id}/merge_requests/{mr_iid}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=self._headers, timeout=30)
            resp.raise_for_status()
            return resp.json()

    async def get_open_mrs(self, project_id: int) -> List[Dict[str, Any]]:
        """Return all open merge requests for a project (paginated, up to 100)."""
        url = f"{self._base}/projects/{project_id}/merge_requests"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=self._headers,
                params={"state": "opened", "per_page": 100, "order_by": "updated_at", "sort": "desc"},
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    # ------------------------------------------------------------------
    # Pipelines
    # ------------------------------------------------------------------

    async def get_latest_pipeline_for_branch(
        self, project_id: int, branch: str
    ) -> Optional[Dict[str, Any]]:
        """Return the most recent *branch* pipeline for *branch* (source != merge_request_event).

        Fetches the last 20 pipelines for the ref and returns the first one that
        was triggered by a push/web/api/schedule — not an MR event — so Stage 2
        always shows the release-branch pipeline, not an MR pipeline that happened
        to run on the same ref.
        """
        url = f"{self._base}/projects/{project_id}/pipelines"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=self._headers,
                params={"ref": branch, "per_page": 20, "order_by": "id", "sort": "desc"},
                timeout=30,
            )
            resp.raise_for_status()
            for pipeline in resp.json():
                if pipeline.get("source") != "merge_request_event":
                    return pipeline
            return None

    async def get_latest_pipeline_for_mr(
        self, project_id: int, mr_iid: int
    ) -> Optional[Dict[str, Any]]:
        """Return the most recent MR pipeline for a merge request, or None."""
        url = f"{self._base}/projects/{project_id}/merge_requests/{mr_iid}/pipelines"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                headers=self._headers,
                params={"per_page": 1, "order_by": "id", "sort": "desc"},
                timeout=30,
            )
            resp.raise_for_status()
            pipelines = resp.json()
            return pipelines[0] if pipelines else None


    async def list_group_projects(self, group_path: str) -> List[Dict[str, Any]]:
        """Return all non-archived direct projects in the given GitLab group.

        Uses /groups/{group_path}/projects which returns only direct members
        of the group — subgroups (e.g. pioneer/archive) are excluded via
        include_subgroups=false. Archived projects are excluded via archived=false.
        Results are sorted by name and paginated automatically.
        """
        encoded_group = quote(group_path, safe="")
        url = f"{self._base}/groups/{encoded_group}/projects"
        params = {
            "archived": "false",
            "include_subgroups": "false",
            "order_by": "name",
            "sort": "asc",
            "per_page": "100",
        }
        results: List[Dict[str, Any]] = []
        page = 1
        async with httpx.AsyncClient() as client:
            while True:
                resp = await client.get(
                    url,
                    headers=self._headers,
                    params={**params, "page": str(page)},
                    timeout=30,
                )
                resp.raise_for_status()
                batch = resp.json()
                if not batch:
                    break
                for proj in batch:
                    ns = proj.get("namespace") or {}
                    results.append({
                        "id": proj["id"],
                        "name": proj["name"],
                        "path_with_namespace": proj["path_with_namespace"],
                        "web_url": proj["web_url"],
                        "default_branch": proj.get("default_branch") or "master",
                        "namespace_name": ns.get("name") or "",
                    })
                if len(batch) < 100:
                    break
                page += 1
        return results


def get_gitlab_client(token: str) -> GitLabClient:
    return GitLabClient(token)
