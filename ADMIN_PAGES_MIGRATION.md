# Admin Pages Migration - Architectural Changes

## Overview
Converted all management dialogs to full-page components with project-specific customization capabilities. This provides better UX for admin-only features and allows per-project configuration.

## Changes Made

### 1. Projects Configuration Extended
**File**: `backend/data/projects.json`
- Added `jira_base_url` field to each project
- Added `confluence_base_url` field to each project
- Example:
  ```json
  {
    "id": "pioneer",
    "display_name": "Pioneer",
    "jira_project_key": "TSSA",
    "gitlab_group_path": "truata/products/pioneer",
    "jira_base_url": "https://jira.example.com",
    "confluence_base_url": "https://confluence.example.com"
  }
  ```

### 2. Frontend Models Updated
**File**: `frontend/src/app/core/models/release.model.ts`
- Extended `Project` interface with:
  - `gitlab_group_path?: string`
  - `jira_base_url?: string`
  - `confluence_base_url?: string`

### 3. New Routing Structure
**File**: `frontend/src/app/app.routes.ts`
- Added `/admin/manage-documentation` route
- Added `/admin/manage-repositories` route
- Added `/admin/manage-users` route
- Added `/admin/jira-configuration` route

All routes are protected by `authGuard` and require authentication.

### 4. New Page Components Created

#### ManageDocumentationPageComponent
**File**: `frontend/src/app/pages/admin/manage-documentation-page/manage-documentation-page.component.ts`
- Converted from ManageDocumentationDialogComponent
- Features:
  - Project dropdown selector
  - Fetch components from Confluence template
  - Add/edit/delete repo-to-component mappings
  - Full page layout with toolbar

#### ManageRepositoriesPageComponent
**File**: `frontend/src/app/pages/admin/manage-repositories-page/manage-repositories-page.component.ts`
- Converted from ManageReposDialogComponent
- Features:
  - Project dropdown selector
  - Browse and manage repositories
  - GitLab integration for quick repository addition
  - Edit repository configuration
  - Full page layout with toolbar

#### ManageUsersPageComponent
**File**: `frontend/src/app/pages/admin/manage-users-page/manage-users-page.component.ts`
- Converted from ManageUsersDialogComponent
- Features:
  - Create users with role selection
  - Manage user-to-project assignments
  - Delete users
  - Full page layout with toolbar

#### JiraConfigurationPageComponent
**File**: `frontend/src/app/pages/admin/jira-configuration-page/jira-configuration-page.component.ts`
- New admin-only page
- Features:
  - Project dropdown selector (admin only)
  - Configure Jira base URL per project
  - Configure Confluence base URL per project
  - Security validation and error handling
  - Full page layout with admin-only warning card

### 5. Dashboard Navigation Updated
**File**: `frontend/src/app/pages/dashboard/dashboard.component.ts` & `.html`

Changes:
- Removed `MatDialog` imports and references
- Updated navigation methods to use `router.navigate()`
- Methods changed:
  - `openManageRepos()` → routes to `/admin/manage-repositories`
  - `openManageUsers()` → routes to `/admin/manage-users`
  - `openManageDocumentation()` → routes to `/admin/manage-documentation`
  - Added `openJiraConfiguration()` → routes to `/admin/jira-configuration`

User Menu Updates:
- "Manage Documentation" available to all users
- Admin section added with divider:
  - "Manage Repositories"
  - "Manage Users"
  - "Jira & Confluence" (new)

## Benefits

1. **Better UX**: Full-page experience instead of constrained dialogs
2. **Project-Specific Settings**: Each project can have its own configuration
3. **Scalability**: Easier to add more project-level settings in the future
4. **Admin Controls**: Jira configuration page is admin-only with proper safeguards
5. **Maintainability**: Cleaner separation of concerns with dedicated page components

## Legacy Components

The following dialog components are no longer actively used:
- `ManageDocumentationDialogComponent` (kept for now, can be removed later)
- `ManageReposDialogComponent` (kept for now, can be removed later)
- `ManageUsersDialogComponent` (kept for now, can be removed later)

These can be safely removed in a future cleanup phase.

## TODO - Backend Implementation

The following backend endpoints need to be created to fully support the new architecture:

1. **GET** `/projects/{project_id}/configuration`
   - Fetch project-specific configuration (jira_base_url, confluence_base_url)

2. **PUT** `/projects/{project_id}/configuration`
   - Update project-specific configuration
   - Admin only

3. **Extend** `/projects` endpoint
   - Return configuration fields in project data

These endpoints should be added to `backend/app/routers/projects.py` (or similar).

## Testing Recommendations

1. Test project switching in each admin page
2. Verify navigation returns to dashboard correctly
3. Test Jira configuration page is admin-only
4. Verify project-specific settings are properly loaded
5. Test all CRUD operations in each management page
