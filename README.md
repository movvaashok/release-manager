# GitLab Release Management Application

A comprehensive web application for managing GitLab releases with Angular 17 frontend and FastAPI backend. Features include multi-stage release workflows, deployment monitoring, pod log viewing, and integration with Jira and GitLab APIs.

## Table of Contents

- [Project Overview](#project-overview)
- [System Requirements](#system-requirements)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Running the Application](#running-the-application)
- [Features](#features)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)

## Project Overview

This application streamlines the GitLab release process by providing:

- **Multi-Stage Releases**: Manage repos through Stage 1 (Initialization), Stage 2 (Branch & Merge), and Stage 3 (Pull Requests)
- **Deployment Monitoring**: Real-time Kubernetes pod status and restart tracking
- **Pod Logs Viewer**: Access and download container logs directly from the UI
- **Jira Integration**: Track release-related tasks and Risk Assessment requirements
- **GitLab Integration**: Manage repositories, branches, merge requests, and pipelines

## System Requirements

### Global Requirements

- **Git**: For version control
- **Docker** (optional): For containerized deployment
- **kubectl** (optional): For Kubernetes monitoring features

### Backend Requirements

- **Python 3.9+**
- **pip**: Python package manager
- **FastAPI**: Web framework (installed via pip)
- **GitLab Account** with API token
- **Jira Account** with API token (optional)

### Frontend Requirements

- **Node.js 18+**
- **npm 9+** (comes with Node.js)
- **Angular CLI** (installed via npm)

## Backend Setup

### 1. Navigate to Backend Directory

```bash
cd backend
```

### 2. Create Virtual Environment (Recommended)

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the backend directory:

```env
# GitLab Configuration
GITLAB_TOKEN=your_gitlab_personal_access_token
GITLAB_BASE_URL=https://gitlab.com

# Jira Configuration (optional)
JIRA_URL=https://your-jira-instance.atlassian.net
JIRA_USERNAME=your_jira_email
JIRA_API_TOKEN=your_jira_api_token

# Database (if applicable)
DATABASE_URL=sqlite:///./releases.db

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=true
```

### 5. Initialize Database (if needed)

```bash
# Run migrations or initialization scripts
python app/main.py  # This will create tables if using SQLAlchemy
```

### 6. Run Backend Server

```bash
# Using uvicorn directly
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Or using the main file
python app/main.py
```

The backend will be available at: `http://localhost:8000`

API documentation will be at: `http://localhost:8000/docs`

## Frontend Setup

### 1. Navigate to Frontend Directory

```bash
cd frontend
```

### 2. Install Dependencies

```bash
npm install
```

If you encounter esbuild platform errors:

```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install
```

### 3. Configure API Base URL

Edit `frontend/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000/api'  // Adjust port if different
};
```

For production build, edit `frontend/src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiBaseUrl: 'https://your-production-api-url/api'
};
```

### 4. Run Frontend Development Server

```bash
npm start
# or
ng serve
```

The application will be available at: `http://localhost:4200`

**To use a different port:**

```bash
ng serve --port 4300
```

## Running the Application

### Full Stack (Recommended for Development)

**Terminal 1 - Backend:**

```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**

```bash
cd frontend
npm start
```

### Access the Application

- **Web UI**: http://localhost:4200
- **Backend API**: http://localhost:8000/api
- **API Documentation**: http://localhost:8000/docs

### Default Port Configuration

| Component | URL | Port |
|-----------|-----|------|
| Frontend | http://localhost:4200 | 4200 |
| Backend | http://localhost:8000 | 8000 |
| API Docs | http://localhost:8000/docs | 8000 |

## Features

### Release Management (Multi-Stage)

#### Stage 1: Repository Initialization
- Add repositories to a release
- View repository metadata
- Import repos via Jira components

#### Stage 2: Branch & Merge
- Create release branches from develop
- Sync develop changes to release branch
- Monitor branch pipeline status
- Detect new commits ahead in develop

#### Stage 3: Pull Request & Merge (Admin only)
- Create merge requests for release branches
- Monitor MR pipeline status
- Check merge readiness
- Track Risk Assessment requirements
- Create RA subtasks in Jira

### Jira Integration

- **Release Tickets**: Track release-related Jira issues
- **Risk Assessment**: Manage RA requirements per repository
  - Status tracking: Ready, In Progress, Completed, Abandoned
  - Subtask creation and management
  - Color-coded status indicators
- **Component Search**: Find all tickets linked to a component
- **Jira Status Page**: Summary of all release-related tickets

### Deployment Monitoring

- **Real-time Pod Status**: View all pods in dev namespace
- **Restart Detection**: Highlight services with unexpected restarts
- **Image Tags**: Monitor deployed container image versions
- **kubectl Integration**: Check deployment health
- **Auto-refresh**: Updates every 3 minutes

### Pod Logs Viewer

- **Per-Service Logs**: Expand any service to view pod logs
- **Pod Grouping**: Logs organized by pod name
- **Download Capability**: Export logs as timestamped files
  - Format: `{service}-logs-{timestamp}.txt`
  - Includes timestamps and pod names
- **Loading States**: Visual feedback while fetching logs
- **Error Handling**: Clear error messages if retrieval fails

### Deployment Status Tracking

- **Namespace Monitoring**: View dev environment status
- **Replica Status**: See desired vs ready replicas
- **Restart Counts**: Track pod restarts with visual highlighting
- **Image Information**: Display deployed image tags
- **kubectl Availability**: Graceful handling if kubectl not installed

## Architecture

### Backend Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app initialization
│   ├── models.py            # Pydantic data models
│   ├── routers/
│   │   ├── releases.py      # Release endpoints
│   │   ├── repos.py         # Repository endpoints
│   │   └── jira.py          # Jira integration endpoints
│   ├── services/
│   │   ├── release_service.py         # Release business logic
│   │   ├── gitlab_client.py           # GitLab API client
│   │   ├── jira_client.py             # Jira API client
│   │   ├── deployment_status.py       # kubectl monitoring
│   │   ├── pod_logs.py                # Pod logs retrieval
│   │   ├── config_mr_service.py       # Config MR handling
│   │   └── audit_service.py           # Audit logging
│   └── config/
│       └── settings.py      # Configuration management
└── requirements.txt         # Python dependencies
```

### Frontend Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── services/
│   │   │   │   ├── release.service.ts       # Release API calls
│   │   │   │   ├── auth.service.ts          # Authentication
│   │   │   │   ├── project.service.ts       # Project management
│   │   │   │   └── jira.service.ts          # Jira API calls
│   │   │   └── models/
│   │   │       └── release.model.ts         # TypeScript interfaces
│   │   ├── pages/
│   │   │   ├── release-list/                # List all releases
│   │   │   ├── release-detail/              # Release management
│   │   │   │   ├── release-detail.component.ts
│   │   │   │   ├── release-detail.component.html
│   │   │   │   └── release-detail.component.scss
│   │   │   └── jira-status/                 # Jira integration page
│   │   └── shared/
│   │       └── components/
│   │           └── status-chip/             # Status badge component
│   ├── environments/
│   │   ├── environment.ts                   # Development config
│   │   └── environment.prod.ts              # Production config
│   └── main.ts                              # Application entry point
└── package.json                             # Node dependencies
```

### Key API Endpoints

#### Releases

```
GET    /api/releases                          List all releases
POST   /api/releases                          Create new release
GET    /api/releases/{version}                Get release details
DELETE /api/releases/{version}                Delete release

GET    /api/releases/{version}/stage1         Get Stage 1 repos
POST   /api/releases/{version}/stage1/run     Run Stage 1
GET    /api/releases/{version}/stage2         Get Stage 2 repos
POST   /api/releases/{version}/stage2/run     Run Stage 2
POST   /api/releases/{version}/stage2/{repo}/retry  Retry Stage 2 repo
GET    /api/releases/{version}/stage3         Get Stage 3 repos
POST   /api/releases/{version}/stage3/run     Run Stage 3

GET    /api/releases/{version}/deployment-status      Get pod status
GET    /api/releases/{version}/deployment-logs/{service}  Get pod logs
GET    /api/releases/{version}/jira-status   Get Jira ticket status
```

## Troubleshooting

### Backend Issues

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError` | Run `pip install -r requirements.txt` |
| `GITLAB_TOKEN not found` | Create `.env` file with GitLab credentials |
| Port 8000 already in use | Use `--port 9000` flag with uvicorn |
| GitLab API 404 errors | Check GITLAB_TOKEN permissions and GITLAB_BASE_URL |
| kubectl not found | Install kubectl: see [kubectl installation guide](https://kubernetes.io/docs/tasks/tools/) |

### Frontend Issues

| Problem | Solution |
|---------|----------|
| `npm ERR! code ENOENT` | Run `npm install` |
| esbuild platform errors | Delete `node_modules` and `package-lock.json`, then `npm install` |
| Port 4200 already in use | Use `ng serve --port 4300` |
| API connection refused | Ensure backend is running on port 8000 |
| Changes not showing | Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac) |
| `Can't find module` errors | Run `npm install` and restart dev server |

### Common Issues

**"Failed to load release" message**

- Check backend is running: `http://localhost:8000/docs`
- Verify API base URL in `environment.ts`
- Check browser console for errors (F12)

**"kubectl not installed" message in Deployment Status tab**

- Install kubectl to enable pod monitoring
- Or ignore if not using Kubernetes features

**Logs not loading**

- Ensure kubectl is installed and has access to your cluster
- Check backend logs for errors
- Verify pod names match service deployment labels

**GitLab API errors**

- Verify GITLAB_TOKEN is valid and not expired
- Check token has API scope permissions
- Ensure repositories are accessible to the token

### Debug Mode

**Backend debug logging:**

```bash
# In .env
DEBUG=true
LOG_LEVEL=DEBUG
```

**Frontend debug:**

- Open browser DevTools (F12)
- Check Console tab for errors
- Check Network tab for API calls
- Use Angular DevTools extension

## Environment Variables Reference

### Backend (.env)

```env
# Required
GITLAB_TOKEN=glpat-xxxxx
GITLAB_BASE_URL=https://gitlab.com

# Optional
JIRA_URL=https://your-instance.atlassian.net
JIRA_USERNAME=your@email.com
JIRA_API_TOKEN=atcxxxx
DATABASE_URL=sqlite:///./releases.db
HOST=0.0.0.0
PORT=8000
DEBUG=true
LOG_LEVEL=INFO
```

### Frontend (environment.ts)

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000/api',
  // Add other config as needed
};
```

## Contributing

When making changes:

1. **Backend**: Ensure all Python files follow PEP 8 style
2. **Frontend**: Follow Angular style guide and use TypeScript strict mode
3. **Testing**: Add tests for new features
4. **Git**: Commit messages should be descriptive

## License

[Add your license information here]

## Support

For issues or questions:
- Check the Troubleshooting section above
- Review API documentation at `/docs` endpoint
- Check browser console (F12) for error details
- Review backend logs for server-side errors
