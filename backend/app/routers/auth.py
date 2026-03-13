from fastapi import APIRouter, HTTPException

from app.models import LoginRequest, LoginResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest):
    """Authenticate a user and return their GitLab token if set."""
    try:
        return auth_service.login(req)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
