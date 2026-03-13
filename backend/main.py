from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, repos, releases

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
app.include_router(repos.router, prefix="/api")
app.include_router(releases.router, prefix="/api")
