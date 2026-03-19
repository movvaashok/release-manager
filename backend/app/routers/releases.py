from typing import List

from fastapi import APIRouter, Header, HTTPException, Query

from app.models import AddReposRequest, CreateReleaseRequest, ReleaseState, ReleaseSummary, UpdateDocsRequest
from app.services import release_service
from app.services import audit_service
from app.services import confluence_client

router = APIRouter(prefix="/releases", tags=["releases"])

_ANON = "unknown"


def _u(x_username: str | None) -> str:
    return x_username or _ANON


@router.get("", response_model=List[ReleaseSummary])
def list_releases(project: str = Query("pioneer")):
    return release_service.list_releases(project)


@router.post("", response_model=ReleaseState, status_code=201)
def create_release(
    req: CreateReleaseRequest,
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = release_service.create_release(project, req)
        audit_service.record(
            username=_u(x_username),
            action="release_created",
            project=project,
            release_version=req.version,
            details={"repo_count": len(req.repo_names)},
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{version}", response_model=ReleaseState)
def get_release(version: str, project: str = Query("pioneer")):
    state = release_service.get_release(project, version)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Release {version} not found")
    return state


@router.post("/{version}/repos", response_model=ReleaseState)
def add_repos(
    version: str,
    req: AddReposRequest,
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = release_service.add_repos_to_release(project, version, req.repo_names)
        audit_service.record(
            username=_u(x_username),
            action="repos_added",
            project=project,
            release_version=version,
            details={"repos": req.repo_names},
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{version}/repos/{repo_name}", response_model=ReleaseState)
async def remove_repo(
    version: str,
    repo_name: str,
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.remove_repo_from_release(project, version, repo_name, x_gitlab_token)
        audit_service.record(
            username=_u(x_username),
            action="repo_removed",
            project=project,
            release_version=version,
            repo_name=repo_name,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{version}/stage2", response_model=ReleaseState)
async def run_stage2(
    version: str,
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.run_stage2(project, version, x_gitlab_token)
        audit_service.record(
            username=_u(x_username),
            action="stage2_run",
            project=project,
            release_version=version,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# NOTE: this specific route must be declared BEFORE the /{repo_name}/retry wildcard
@router.post("/{version}/stage2/diff-check", response_model=ReleaseState)
async def diff_check_stage2(
    version: str,
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.run_diff_check(project, version, x_gitlab_token)
        audit_service.record(
            username=_u(x_username),
            action="diff_check",
            project=project,
            release_version=version,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage2/{repo_name}/retry", response_model=ReleaseState)
async def retry_stage2_repo(
    version: str,
    repo_name: str,
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.run_stage2_repo(project, version, repo_name, x_gitlab_token)
        audit_service.record(
            username=_u(x_username),
            action="stage2_repo_retry",
            project=project,
            release_version=version,
            repo_name=repo_name,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage3", response_model=ReleaseState)
async def run_stage3(
    version: str,
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.run_stage3(project, version, x_gitlab_token)
        audit_service.record(
            username=_u(x_username),
            action="stage3_run",
            project=project,
            release_version=version,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/{version}/stage3/{repo_name}/retry", response_model=ReleaseState)
async def retry_stage3_repo(
    version: str,
    repo_name: str,
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.run_stage3_repo(project, version, repo_name, x_gitlab_token)
        audit_service.record(
            username=_u(x_username),
            action="stage3_repo_retry",
            project=project,
            release_version=version,
            repo_name=repo_name,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# NOTE: declared after all stage2/stage3 sub-routes to avoid wildcard shadowing
@router.post("/{version}/pipelines/refresh", response_model=ReleaseState)
async def refresh_pipelines(
    version: str,
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.refresh_pipeline_statuses(project, version, x_gitlab_token)
        audit_service.record(
            username=_u(x_username),
            action="pipeline_refresh",
            project=project,
            release_version=version,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ── Documentation links ──────────────────────────────────────────────────────────────

@router.patch("/{version}/docs", response_model=ReleaseState)
def update_docs(
    version: str,
    req: UpdateDocsRequest,
    project: str = Query("pioneer"),
    x_role: str | None = Header(default=None),
    x_username: str | None = Header(default=None),
):
    if x_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        state = release_service.update_docs(project, version, req)
        audit_service.record(
            username=_u(x_username),
            action="docs_updated",
            project=project,
            release_version=version,
            details={k: v for k, v in req.model_dump().items() if v is not None},
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ── Confluence auto-populate ─────────────────────────────────────────────────────────

@router.post("/{version}/docs/confluence-search", response_model=ReleaseState)
async def confluence_search(
    version: str,
    project: str = Query("pioneer"),
    x_role: str | None = Header(default=None),
    x_username: str | None = Header(default=None),
):
    """
    Search Confluence for a page titled 'Pioneer {version}'.
    If found and the release doesn't already have a confluence_url, save it automatically.
    Always returns the up-to-date ReleaseState.
    """
    state = release_service.get_release(project, version)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Release {version} not found")

    # Already set — nothing to do
    if state.confluence_url:
        return state

    page_title = f"Pioneer {version}"
    page = await confluence_client.find_page_by_title(page_title)

    if page:
        from app.models import UpdateDocsRequest as _UDR
        req = _UDR(confluence_url=page["web_url"])
        state = release_service.update_docs(project, version, req)
        audit_service.record(
            username=_u(x_username),
            action="confluence_auto_linked",
            project=project,
            release_version=version,
            details={"confluence_url": page["web_url"], "page_title": page["title"]},
        )

    return state


# ── Audit logs (admin-only enforced on frontend; backend validates role via header) ──

@router.get("/{version}/audit-logs")
def get_audit_logs(
    version: str,
    project: str = Query("pioneer"),
    username: str | None = Query(default=None),
    from_ts: str | None = Query(default=None),
    to_ts: str | None = Query(default=None),
    x_username: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
):
    if x_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    logs = audit_service.get_logs(
        project=project,
        release_version=version,
        username_filter=username,
        from_ts=from_ts,
        to_ts=to_ts,
    )
    users = audit_service.get_all_usernames(project, version)
    return {"logs": logs, "users": users}
