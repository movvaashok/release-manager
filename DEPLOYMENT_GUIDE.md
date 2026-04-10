# Deployment & Startup Guide

## Quick Start

### Prerequisites
- Node.js 18+ (for frontend)
- Python 3.9+ (for backend)
- npm or yarn package manager

### 1. Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Verify projects.json exists with new fields
cat data/projects.json

# Run the backend server
python -m uvicorn app.main:app --reload --port 8000
```

Backend will be available at: `http://localhost:8000`
API docs: `http://localhost:8000/docs`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend will be available at: `http://localhost:4200`

### 3. Verify API Endpoints

Test the new endpoints:

```bash
# Get all projects
curl http://localhost:8000/projects

# Get specific project config
curl http://localhost:8000/projects/pioneer

# Update project config (requires admin in production)
curl -X PUT http://localhost:8000/projects/pioneer/configuration \
  -H "Content-Type: application/json" \
  -d '{
    "jira_base_url": "https://jira.yourcompany.com",
    "confluence_base_url": "https://confluence.yourcompany.com"
  }'
```

## Development Workflow

### Adding a New Feature to Admin Pages

1. **Create the component** in `frontend/src/app/pages/admin/<feature-name>/`
2. **Add the route** in `frontend/src/app/app.routes.ts`
3. **Add the service method** in `frontend/src/app/core/services/release.service.ts`
4. **Update dashboard menu** in `frontend/src/app/pages/dashboard/dashboard.component.html`

### Backend Endpoint Changes

1. **Update models** in `backend/app/models.py` if needed
2. **Update service** in `backend/app/services/`
3. **Add/update router** in `backend/app/routers/`
4. **Test with curl or Postman** before committing

### Database Changes

Projects configuration is stored in `backend/data/projects.json`

To add new configuration fields:
1. Update `ProjectConfig` model in `backend/app/models.py`
2. Add field to `backend/data/projects.json`
3. Update `UpdateProjectConfigRequest` model
4. Update service method to handle new field

## Configuration Files

### Frontend Environment Configuration
**File**: `frontend/src/environments/environment.ts`

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000'
};
```

### Backend Configuration
**File**: `backend/app/config.py`

Key paths:
- `DATA_DIR`: `backend/data/` (stores JSON files)
- `RELEASES_DIR`: `backend/data/releases/`

## Troubleshooting

### Backend Won't Start

```bash
# Check Python version
python --version  # Should be 3.9+

# Install missing dependencies
pip install -r requirements.txt --upgrade

# Check if port 8000 is available
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows
```

### Frontend Build Errors

```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Clear Angular cache
npm run ng -- cache clean
```

### API Connection Issues

1. **Check backend is running**: `curl http://localhost:8000/docs`
2. **Verify CORS is enabled** in backend (check `main.py`)
3. **Check frontend environment**: Verify `apiBaseUrl` points to correct backend
4. **Network tab**: Open browser DevTools → Network → check failed requests

### Login Issues

1. **Check auth service**: `backend/app/routers/auth.py`
2. **Verify user exists**: Check `backend/data/users.json`
3. **Clear browser storage**: DevTools → Application → Local Storage → Clear all

## File Permissions

Ensure write access to data directory:

```bash
# macOS/Linux
chmod -R 755 backend/data/

# Verify projects.json exists
ls -la backend/data/projects.json
```

## Monitoring

### Backend Logs
Watch terminal where backend is running. FastAPI will log all requests.

### Frontend Browser Console
Open DevTools (F12) → Console tab to see Angular errors and API responses.

### API Response Debugging

Use Firefox DevTools or Chrome DevTools Network tab to:
1. Inspect request/response headers
2. View request/response body
3. Check status codes
4. Monitor timing

## Performance Tuning

### Frontend
- Build for production: `npm run build`
- Enable compression in nginx/server
- Use CDN for static assets

### Backend
- Use `gunicorn` instead of dev server in production
- Enable database connection pooling (if using DB)
- Monitor memory usage with large data files
- Consider caching with Redis for frequently accessed data

## Production Deployment

### Frontend (Nginx Example)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/frontend/dist;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://backend:8000;
    }
}
```

### Backend (Docker Example)

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables (Production)

```bash
# .env
GITLAB_TOKEN=your_token
JIRA_USERNAME=username
JIRA_PASSWORD=password
DEBUG=false
```

## Backup & Recovery

### Backup Important Data

```bash
# Backup projects and releases
tar -czf backup-$(date +%Y%m%d).tar.gz backend/data/

# Store in safe location
cp backup-*.tar.gz /backup/location/
```

### Restore from Backup

```bash
tar -xzf backup-20240410.tar.gz
cp -r backend/data/* /path/to/production/data/
```

## Monitoring Checklist

- [ ] Backend processes running (check port 8000)
- [ ] Frontend builds successfully
- [ ] API endpoints responding (check `/docs`)
- [ ] Database files writable (check `data/` directory)
- [ ] Logs showing no errors
- [ ] UI admin pages accessible to admin users
- [ ] Project switching works
- [ ] Configuration saving persists
- [ ] No browser console errors

## Getting Help

1. **Check logs**: Terminal where backend/frontend are running
2. **Browser DevTools**: Check Network and Console tabs
3. **API Documentation**: Visit `http://localhost:8000/docs`
4. **Check error messages**: Copy exact error text and search codebase
5. **Git history**: Check recent changes that might have broken things

## Next: Run Tests

Once deployment guide steps are complete, consider:

```bash
# Backend tests
cd backend && python -m pytest

# Frontend tests
cd frontend && npm test
```

See respective `README.md` files in backend/ and frontend/ for testing details.
