from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, jira, projects, repos, releases
from app.services.release_service import migrate_legacy_data
from app.services.token_service import migrate_tokens

app = FastAPI(
    title="GitLab Release Manager",
    description="Automates release branch management and MR creation across GitLab repositories.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(repos.router, prefix="/api")
app.include_router(releases.router, prefix="/api")
app.include_router(jira.router, prefix="/api")


@app.on_event("startup")
def startup():
    migrate_tokens()        # move tokens from .env / users.json → data/tokens.json
    migrate_legacy_data()   # move release data to per-version subfolders
