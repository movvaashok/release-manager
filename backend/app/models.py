from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, field_validator
import re


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


# ---------------------------------------------------------------------------
# Release state models (stored in releases/<version>.json)
# ---------------------------------------------------------------------------

class Stage1Repo(BaseModel):
    name: str
    project_id: int
    path_with_namespace: str


class Stage2Repo(BaseModel):
    name: str
    project_id: int
    status: RepoStage2Status = RepoStage2Status.PENDING
    branch_created: bool = False
    branch_existed: bool = False
    merged: bool = False
    no_updates: bool = False
    error: Optional[str] = None


class Stage3Repo(BaseModel):
    name: str
    project_id: int
    status: RepoStage3Status = RepoStage3Status.PENDING
    mr_url: Optional[str] = None
    mr_iid: Optional[int] = None
    already_existed: bool = False
    error: Optional[str] = None


class ReleaseState(BaseModel):
    version: str
    created_at: datetime
    stage1: List[Stage1Repo] = []
    stage2: List[Stage2Repo] = []
    stage3: List[Stage3Repo] = []


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CreateReleaseRequest(BaseModel):
    version: str
    repo_names: List[str]

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: str) -> str:
        if not re.match(r"^\d+\.\d+\.\d+$", v):
            raise ValueError("Version must follow format X.Y.Z (e.g. 2.15.0)")
        return v


class ReleaseSummary(BaseModel):
    version: str
    created_at: datetime
    total_repos: int
    stage2_success: int
    stage2_conflict: int
    stage2_failed: int
    stage2_pending: int
    stage3_success: int
    stage3_already_exists: int
    stage3_failed: int
    stage3_pending: int
