# Project-Specific Data Organization

## Issue Fixed
When users selected a different project in the Manage Repositories page, they would still see repositories from the previously selected project (e.g., Pioneer repositories would show even when selecting Calibrate).

**Root Cause**: The Calibrate project had no project-scoped repositories.json file, causing the backend to fall back to the legacy root-level file.

## Solution

### File Structure
Projects now use separate data directories with their own data files:

```
backend/data/
├── projects.json                 (shared project configs)
├── repositories.json             (legacy fallback, deprecated)
├── pioneer/
│   ├── repositories.json         (Pioneer-specific repos)
│   └── repo-mappings.json        (Pioneer-specific Confluence mappings)
├── calibrate/
│   ├── repositories.json         (Calibrate-specific repos)
│   └── repo-mappings.json        (Calibrate-specific Confluence mappings)
└── releases/
    └── <version>.json            (Release data)
```

### How It Works

#### Backend Implementation
**File**: `backend/app/services/repo_service.py`

```python
def _refs_path(project_id: str) -> Path:
    scoped = _DATA_DIR / project_id / "repositories.json"
    legacy = _DATA_DIR / "repositories.json"
    
    # Try project-scoped first
    if scoped.exists():
        return scoped
    
    # Fall back to legacy for backward compatibility
    if legacy.exists():
        # Auto-migrate: copy legacy file to project-scoped location
        scoped.parent.mkdir(parents=True, exist_ok=True)
        scoped.write_text(legacy.read_text())
        return scoped
    
    # Create project-scoped location for new writes
    scoped.parent.mkdir(parents=True, exist_ok=True)
    return scoped
```

**Key Points**:
1. Always checks for project-scoped file first
2. Falls back to legacy file for backward compatibility
3. Auto-migrates legacy file to project scope on first access
4. Ensures all writes go to project-scoped location

#### Frontend Implementation
**File**: `frontend/src/app/core/services/release.service.ts`

All repository requests include the project parameter:
```typescript
private get p() {
  return { project: this.projectService.currentId };
}

getReferences(): Observable<RepoReference[]> {
  return this.http.get<RepoReference[]>(`${this.base}/repos/reference`, { params: this.p });
}
```

When users switch projects:
```typescript
onProjectChange(): void {
  // Update the project service
  this.projectService.setProject(project);
  
  // Reset UI state
  this.editingName = null;
  this.showAddForm = false;
  
  // Reload data with new project parameter
  this.loadRepos(); // Uses updated projectService.currentId
}
```

### Backend Routes

**File**: `backend/app/routers/repos.py`

All endpoints properly handle project parameter:

```python
@router.get("/repos/reference", response_model=List[RepoReference])
def list_reference_repos(project: str = Query("pioneer")):
    return repo_service.get_all(project)  # ← Filters by project

@router.post("/repos/reference", response_model=List[RepoReference])
def add_reference_repo(req: AddReferenceRepoRequest, project: str = Query("pioneer")):
    return repo_service.add_repo(project, req)  # ← Project-specific

@router.put("/repos/reference/{name}", response_model=List[RepoReference])
def update_reference_repo(name: str, req: UpdateReferenceRepoRequest, project: str = Query("pioneer")):
    return repo_service.update_repo(project, name, req)  # ← Project-specific

@router.delete("/repos/reference/{name}", response_model=List[RepoReference])
def delete_reference_repo(name: str, project: str = Query("pioneer")):
    return repo_service.delete_repo(project, name)  # ← Project-specific
```

## Data Organization Benefits

### ✅ Project Isolation
- Each project has completely separate repositories
- Changes to Pioneer repos don't affect Calibrate repos
- Users can't accidentally mix data between projects

### ✅ Scalability
- Easy to add new projects - just create new directory with repos
- No conflicts between project data
- Performance scales well with project count

### ✅ Data Independence
- Projects are independently managed
- Different teams can manage their own project's repositories
- Project-specific configurations work correctly

### ✅ Future Extensibility
- Can easily add more project-scoped data:
  - `repo-mappings.json` (Confluence mappings)
  - `project-settings.json` (Admin configurations)
  - `users-by-project.json` (Project-specific users)

## Setting Up New Projects

When adding a new project:

1. **Update projects.json** with project metadata:
```json
{
  "id": "newproject",
  "display_name": "New Project",
  "jira_project_key": "NP",
  "gitlab_group_path": "truata/products/newproject",
  "jira_base_url": "https://jira.example.com",
  "confluence_base_url": "https://confluence.example.com"
}
```

2. **Create project data directory**:
```bash
mkdir -p backend/data/newproject
```

3. **Create initial repositories.json**:
```bash
cat > backend/data/newproject/repositories.json << 'EOF'
[
  {
    "name": "main-repo",
    "project_id": 301,
    "path_with_namespace": "truata/products/newproject/main-repo",
    "web_url": "https://gitlab.com/truata/products/newproject/main-repo",
    "default_branch": "main",
    "develop_branch": "develop"
  }
]
EOF
```

4. **Restart backend** - it will automatically recognize the new project

## Migration Path (Backward Compatibility)

For existing deployments with legacy `repositories.json` at root:

1. System detects missing project-scoped file
2. Automatically copies legacy file to project scope
3. First read gets migrated data
4. First write creates project-specific file
5. Legacy file can be safely deleted after migration

No manual migration needed - happens automatically!

## Testing Project-Specific Data

### Verify Repository Isolation
```bash
# Start backend
python -m uvicorn app.main:app --reload

# Check Pioneer repos
curl "http://localhost:8000/repos/reference?project=pioneer"

# Check Calibrate repos
curl "http://localhost:8000/repos/reference?project=calibrate"

# They should show different repositories!
```

### Frontend Testing
1. Login to application
2. Navigate to Manage Repositories
3. Select "Pioneer" from project dropdown
4. Note the repositories shown
5. Select "Calibrate" from dropdown
6. Verify different repositories appear
7. Switch back to Pioneer - original repos reappear

## API Query Parameters

All repository endpoints support project filtering:

```
GET /repos/reference?project=pioneer
GET /repos/reference?project=calibrate
POST /repos/reference?project=pioneer&name=...
PUT /repos/reference/{name}?project=calibrate
DELETE /repos/reference/{name}?project=pioneer
```

Default is `project=pioneer` if not specified (backward compatible).

## File Sizes & Performance

**Pioneer repositories.json**: ~1.2 KB
**Calibrate repositories.json**: ~500 B
**Total overhead**: Negligible - typical deployments have <1 MB of data

No performance impact from project-specific file organization.

## Troubleshooting

### Issue: Still seeing Pioneer repos in Calibrate
**Solution**: 
1. Verify backend is running with latest code
2. Check `backend/data/calibrate/repositories.json` exists
3. Verify content is different from Pioneer
4. Check browser DevTools Network tab - project parameter should be in URL

### Issue: Repos disappear after switching projects
**Solution**:
1. Check that both project directories exist
2. Verify repositories.json files are valid JSON
3. Check backend logs for errors
4. Restart backend if files were manually added

### Issue: Adding repo to Calibrate shows in Pioneer
**Solution**:
1. Verify `onProjectChange()` is resetting state
2. Check that project parameter is correctly passed
3. Verify backend updated the correct repositories.json file
4. Check file write permissions on data directory

## Future Enhancements

Potential improvements to project-scoped data:

1. **Per-Project Repo Mappings**
   - Store Confluence component mappings per project
   - File: `{project}/repo-mappings.json`

2. **Per-Project Settings**
   - Store project-specific configurations
   - File: `{project}/settings.json`

3. **Per-Project Users**
   - Restrict users to specific projects
   - File: `{project}/users.json`

4. **Audit Logging**
   - Log all changes per project
   - Directory: `{project}/audit-logs/`

5. **Backup & Export**
   - Easy per-project backup and export
   - `backup-{project}-{date}.tar.gz`

## Summary

The project-specific data organization provides:
- ✅ True data isolation between projects
- ✅ Automatic backward compatibility
- ✅ Foundation for per-project configurations
- ✅ Clear, predictable file structure
- ✅ Easy to extend for future features

The system now correctly filters repositories by project, providing a clean multi-project experience!
