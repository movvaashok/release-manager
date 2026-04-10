from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, field_validator
import re


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

class ProjectConfig(BaseModel):
    id: str
    display_name: str
    jira_project_key: str
    gitlab_group_path: Optional[str] = None  # e.g. "truata/products/pioneer"
    jira_base_url: Optional[str] = None
    confluence_base_url: Optional[str] = None
    release_branch_source: Optional[str] = None  # e.g. "develop", "master"
    release_branch_pattern: Optional[str] = None  # e.g. "release/{version}", "Release/{version}"


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class RepoStage2Status(str, Enum):
    PENDING = "pending"
    SUCCESS = "success"
    CONFLICT = "conflict"
    FAILED = "failed"


class RepoStage3Status(str, Enum):
    PENDING = "pending"
    SUCCESS = "success"
    ALREADY_EXISTS = "already_exists"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# Reference data (repositories.json)
# ---------------------------------------------------------------------------

class RepoReference(BaseModel):
    name: str
    project_id: int
    path_with_namespace: str
    web_url: str
    default_branch: str
    develop_branch: str
    config_repo: Optional[str] = None   # name of the linked config repository, if any


# ---------------------------------------------------------------------------
# Release state models (stored in releases/<version>.json)
# ---------------------------------------------------------------------------

class Stage1Repo(BaseModel):
    name: str
    project_id: int
    path_with_namespace: str
    web_url: Optional[str] = None
    jira_tickets: List[str] = []    # ticket keys that brought this repo into the release


class Stage2Repo(BaseModel):
    name: str
    project_id: int
    web_url: Optional[str] = None
    status: RepoStage2Status = RepoStage2Status.PENDING
    branch_created: bool = False
    branch_existed: bool = False
    merged: bool = False
    no_updates: bool = False
    error: Optional[str] = None
    pipeline_status: Optional[str] = None
    pipeline_url: Optional[str] = None
    has_new_commits: Optional[bool] = None
    commits_ahead: Optional[int] = None
    compare_url: Optional[str] = None


class Stage3Repo(BaseModel):
    name: str
    project_id: int
    status: RepoStage3Status = RepoStage3Status.PENDING
    mr_url: Optional[str] = None
    mr_iid: Optional[int] = None
    already_existed: bool = False
    error: Optional[str] = None
    pipeline_status: Optional[str] = None
    pipeline_url: Optional[str] = None
    requires_ra: bool = False           # Populated from Confluence release plan table
    ra_subtask_url: Optional[str] = None  # Jira subtask created under RA ticket after MR creation
    config_repo: Optional[str] = None  # Linked config repo name (from repo registry) — ephemeral
    config_repo_in_release: bool = False  # True if the config repo is already in this release — ephemeral
    mr_state: Optional[str] = None        # GitLab MR state: opened / merged / closed
    mr_merge_status: Optional[str] = None # GitLab merge_status: can_be_merged / cannot_be_merged / checking / unchecked


class ReleaseState(BaseModel):
    version: str
    created_at: datetime
    project_id: Optional[str] = None           # Project this release belongs to
    stage1: List[Stage1Repo] = []
    stage2: List[Stage2Repo] = []
    stage3: List[Stage3Repo] = []
    # Documentation links
    cab_date: Optional[str] = None             # ISO date string e.g. "2024-06-15"
    cab_ticket_url: Optional[str] = None       # CAB ticket (set at creation time)
    confluence_url: Optional[str] = None       # Added after release is created
    risk_assessment_url: Optional[str] = None  # Added after release is created


# ---------------------------------------------------------------------------
# Jira status dashboard models
# ---------------------------------------------------------------------------

class JiraTicketStatus(BaseModel):
    key: str
    summary: str
    status: str
    url: str
    issue_type: str = ""
    repos: List[str] = []       # repo names that reference this ticket in the release
    components: List[str] = []  # Jira components on this ticket


class RaSubtaskInfo(BaseModel):
    key: str
    summary: str
    status: str
    url: str
    repo_name: str              # which stage3 repo owns this subtask


class JiraStatusSummary(BaseModel):
    release_tickets: List[JiraTicketStatus] = []
    ra_ticket: Optional[JiraTicketStatus] = None
    ra_subtasks: List[RaSubtaskInfo] = []
    cab_ticket: Optional[JiraTicketStatus] = None


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CreateReleaseRequest(BaseModel):
    version: str
    repo_names: List[str]
    cab_date: Optional[str] = None
    cab_ticket_url: Optional[str] = None

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: str) -> str:
        if not re.match(r"^\d+\.\d+\.\d+$", v):
            raise ValueError("Version must follow format X.Y.Z (e.g. 2.15.0)")
        return v


class UpdateDocsRequest(BaseModel):
    confluence_url: Optional[str] = None
    risk_assessment_url: Optional[str] = None
    cab_date: Optional[str] = None
    cab_ticket_url: Optional[str] = None


class RepoWithTickets(BaseModel):
    name: str
    jira_tickets: List[str] = []


class AddReposRequest(BaseModel):
    repo_names: List[str]           # kept for backward-compat (simple add)
    repos: List[RepoWithTickets] = []  # preferred: carries ticket associations


class ConfigMR(BaseModel):
    main_repo: str
    config_repo: str
    mr_iid: int
    mr_url: str
    title: str
    source_branch: str
    target_branch: str
    state: str
    tracked_at: str


class TrackConfigMrRequest(BaseModel):
    main_repo: str
    config_repo: str
    mr_iid: int
    mr_url: str
    title: str
    source_branch: str
    target_branch: str
    state: str


class OpenMR(BaseModel):
    mr_iid: int
    mr_url: str
    title: str
    source_branch: str
    target_branch: str
    state: str
    author: str


class ConfigMrsResponse(BaseModel):
    tracked: List[ConfigMR]
    open_mrs: List[OpenMR]


class LoginRequest(BaseModel):
    username: str
    password: str
    gitlab_token: Optional[str] = None


class LoginResponse(BaseModel):
    username: str
    gitlab_token: Optional[str] = None
    has_token: bool
    role: str = "user"
    projects: List[str] = []


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    projects: List[str] = []


class UserSummary(BaseModel):
    username: str
    role: str
    has_token: bool
    projects: List[str] = []


class UpdateUserProjectsRequest(BaseModel):
    projects: List[str]


class GitLabProjectInfo(BaseModel):
    id: int
    name: str
    path_with_namespace: str
    web_url: str
    default_branch: str = "master"
    namespace_name: str = ""


class AddReferenceRepoRequest(BaseModel):
    name: str
    project_id: int
    path_with_namespace: str
    web_url: str
    default_branch: str = "master"
    develop_branch: str = "develop"


class UpdateReferenceRepoRequest(BaseModel):
    project_id: Optional[int] = None
    path_with_namespace: Optional[str] = None
    web_url: Optional[str] = None
    default_branch: Optional[str] = None
    develop_branch: Optional[str] = None
    config_repo: Optional[str] = None   # set to "" to clear the link


class ReleaseSummary(BaseModel):
    version: str
    created_at: datetime
    project_id: Optional[str] = None           # Project this release belongs to
    total_repos: int
    stage2_success: int
    stage2_conflict: int
    stage2_failed: int
    stage2_pending: int
    stage3_success: int
    stage3_already_exists: int
    stage3_failed: int
    stage3_pending: int
    # Documentation links — included so dashboard can copy without an extra fetch
    cab_date: Optional[str] = None
    cab_ticket_url: Optional[str] = None
    confluence_url: Optional[str] = None
    risk_assessment_url: Optional[str] = None


class UpdateProjectConfigRequest(BaseModel):
    jira_base_url: Optional[str] = None
    confluence_base_url: Optional[str] = None
    release_branch_source: Optional[str] = None
    release_branch_pattern: Optional[str] = None
