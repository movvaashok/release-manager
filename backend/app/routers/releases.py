from typing import List

from fastapi import APIRouter, Header, HTTPException, Query

from app.models import (
    AddReposRequest,
    ConfigMrsResponse,
    CreateReleaseRequest,
    JiraStatusSummary,
    ReleaseState,
    ReleaseSummary,
    TrackConfigMrRequest,
    UpdateDocsRequest,
)
from app.services import release_service
from app.services import audit_service
from app.services import confluence_client
from app.services import jira_client
from app.services import config_mr_service

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


@router.delete("/{version}", status_code=200)
def delete_release(
    version: str,
    project: str = Query("pioneer"),
    x_role: str | None = Header(default=None),
    x_username: str | None = Header(default=None),
):
    """
    Admin-only: archive a release by moving its folder to releases/archive/.
    The archived folder is named {version}_{YYYYMMDD_HHMMSS} to preserve history.
    """
    if x_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        archive_name = release_service.archive_release(project, version)
        audit_service.record(
            username=_u(x_username),
            action="release_archived",
            project=project,
            release_version=version,
            details={"archive_folder": archive_name},
        )
        return {"detail": f"Release {version} archived as {archive_name}"}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


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
        # Build ticket_map from the richer `repos` list if provided, else fall back to plain names
        if req.repos:
            repo_names = [r.name for r in req.repos]
            ticket_map = {r.name: r.jira_tickets for r in req.repos}
        else:
            repo_names = req.repo_names
            ticket_map = None
        state = release_service.add_repos_to_release(project, version, repo_names, ticket_map)
        audit_service.record(
            username=_u(x_username),
            action="repos_added",
            project=project,
            release_version=version,
            details={"repos": repo_names},
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


@router.post("/{version}/stage3/{repo_name}/ra-subtask", response_model=ReleaseState)
async def create_ra_subtask(
    version: str,
    repo_name: str,
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    try:
        state = await release_service.create_ra_subtask(project, version, repo_name)
        audit_service.record(
            username=_u(x_username),
            action="ra_subtask_created",
            project=project,
            release_version=version,
            repo_name=repo_name,
        )
        return state
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/{version}/jira-status", response_model=JiraStatusSummary)
async def get_jira_status(
    version: str,
    project: str = Query("pioneer"),
):
    try:
        return await release_service.get_jira_status_summary(project, version)
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
    If found:
      1. Saves the confluence_url to the release (if not already set).
      2. Fetches the page content, parses the Release description table,
         and applies requires_ra flags to all Stage 3 repos.
    Always returns the up-to-date ReleaseState.
    """
    state = release_service.get_release(project, version)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Release {version} not found")

    # Determine the page URL — use existing if already linked, else search
    # Page title uses the "Pioneer <version>" naming convention
    confluence_url = state.confluence_url
    if not confluence_url:
        page_title = f"Pioneer {version}"
        page = await confluence_client.find_page_by_title(page_title)
        if page:
            from app.models import UpdateDocsRequest as _UDR
            req = _UDR(confluence_url=page["web_url"])
            state = release_service.update_docs(project, version, req)
            confluence_url = page["web_url"]
            audit_service.record(
                username=_u(x_username),
                action="confluence_auto_linked",
                project=project,
                release_version=version,
                details={"confluence_url": page["web_url"], "page_title": page["title"]},
            )

    # RA requirements are specific to the Pioneer project —
    # other projects (e.g. Calibrate) do not use the RA column.
    if confluence_url and project == "pioneer":
        ra_map = await confluence_client.get_ra_requirements(confluence_url)
        if ra_map:
            state = release_service.apply_ra_requirements(project, version, ra_map)
            audit_service.record(
                username=_u(x_username),
                action="ra_requirements_applied",
                project=project,
                release_version=version,
                details={"ra_map": ra_map},
            )

    return state


@router.post("/{version}/docs/cab-ticket-search", response_model=ReleaseState)
async def cab_ticket_search(
    version: str,
    project: str = Query("pioneer"),
    x_role: str | None = Header(default=None),
    x_username: str | None = Header(default=None),
):
    """
    Search Jira TSD project for a CAB ticket matching '<Project> v<version>'.
    If found:
      - Saves cab_ticket_url if not already set.
      - Reads the ticket's issue links to find an RA blocker
        (CAB ticket 'is blocked by' RA-XXX) and saves risk_assessment_url if found.
    Always returns the up-to-date ReleaseState.
    """
    state = release_service.get_release(project, version)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Release {version} not found")

    need_cab = not state.cab_ticket_url
    need_ra = not state.risk_assessment_url

    # Only call Jira if we're missing CAB ticket or RA links
    if need_cab or need_ra:
        ticket = await jira_client.find_cab_ticket(project, version)
        if ticket:
            updates: dict = {}
            if need_cab:
                updates["cab_ticket_url"] = ticket["url"]
            if need_ra and ticket.get("ra_url"):
                updates["risk_assessment_url"] = ticket["ra_url"]

            if updates:
                state = release_service.update_docs(project, version, UpdateDocsRequest(**updates))
                if "cab_ticket_url" in updates:
                    audit_service.record(
                        username=_u(x_username),
                        action="cab_ticket_auto_linked",
                        project=project,
                        release_version=version,
                        details={
                            "cab_ticket_key": ticket["key"],
                            "cab_ticket_url": ticket["url"],
                            "summary": ticket["summary"],
                        },
                    )
                if "risk_assessment_url" in updates:
                    audit_service.record(
                        username=_u(x_username),
                        action="ra_auto_linked",
                        project=project,
                        release_version=version,
                        details={"ra_url": ticket["ra_url"], "cab_ticket_key": ticket["key"]},
                    )

    return state


@router.post("/{version}/docs/refresh-ra", response_model=ReleaseState)
async def refresh_ra_requirements(
    version: str,
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    """
    Re-fetch the Confluence page and re-apply RA requirements to Stage 3 repos.
    Only applies to the Pioneer project — other projects do not use RA requirements.
    """
    if project != "pioneer":
        raise HTTPException(status_code=400, detail="RA requirements only apply to the Pioneer project")

    state = release_service.get_release(project, version)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Release {version} not found")
    if not state.confluence_url:
        raise HTTPException(status_code=400, detail="No Confluence page linked to this release")

    ra_map = await confluence_client.get_ra_requirements(state.confluence_url)
    state = release_service.apply_ra_requirements(project, version, ra_map)
    audit_service.record(
        username=_u(x_username),
        action="ra_requirements_refreshed",
        project=project,
        release_version=version,
        details={"ra_map": ra_map},
    )
    return state


# ── Config repo MR tracking ──────────────────────────────────────────────────────────

@router.get("/{version}/config-mrs", response_model=ConfigMrsResponse)
async def get_config_mrs(
    version: str,
    main_repo: str = Query(...),
    x_gitlab_token: str = Header(...),
    project: str = Query("pioneer"),
):
    """
    Return tracked config MRs for *main_repo* plus live open MRs from its linked config repo.
    """
    refs = release_service.get_references(project)
    main = next((r for r in refs if r.name == main_repo), None)
    if main is None:
        raise HTTPException(status_code=404, detail=f"Repository {main_repo!r} not found in registry")
    if not main.config_repo:
        raise HTTPException(status_code=400, detail=f"Repository {main_repo!r} has no linked config repo")
    config_ref = next((r for r in refs if r.name == main.config_repo), None)
    if config_ref is None:
        raise HTTPException(status_code=404, detail=f"Config repo {main.config_repo!r} not found in registry")

    try:
        return await config_mr_service.get_config_mrs_response(
            project_id=project,
            version=version,
            main_repo=main_repo,
            config_repo_project_id=config_ref.project_id,
            gitlab_token=x_gitlab_token,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GitLab error: {exc}")


@router.post("/{version}/config-mrs", response_model=List)
def track_config_mr(
    version: str,
    req: TrackConfigMrRequest,
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    """Track a config repo MR as part of this release."""
    tracked = config_mr_service.track_mr(
        project_id=project,
        version=version,
        main_repo=req.main_repo,
        config_repo=req.config_repo,
        mr_iid=req.mr_iid,
        mr_url=req.mr_url,
        title=req.title,
        source_branch=req.source_branch,
        target_branch=req.target_branch,
        state=req.state,
    )
    audit_service.record(
        username=_u(x_username),
        action="config_mr_tracked",
        project=project,
        release_version=version,
        details={"config_repo": req.config_repo, "mr_iid": req.mr_iid, "title": req.title},
    )
    return tracked


@router.delete("/{version}/config-mrs/{mr_iid}", response_model=List)
def untrack_config_mr(
    version: str,
    mr_iid: int,
    config_repo: str = Query(...),
    project: str = Query("pioneer"),
    x_username: str | None = Header(default=None),
):
    """Remove a config repo MR from tracking."""
    remaining = config_mr_service.untrack_mr(
        project_id=project,
        version=version,
        config_repo=config_repo,
        mr_iid=mr_iid,
    )
    audit_service.record(
        username=_u(x_username),
        action="config_mr_untracked",
        project=project,
        release_version=version,
        details={"config_repo": config_repo, "mr_iid": mr_iid},
    )
    return remaining


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
