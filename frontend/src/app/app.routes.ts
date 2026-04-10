import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/welcome/welcome.component').then(m => m.WelcomeComponent),
  },
  {
    path: 'releases',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'releases/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/new-release/new-release.component').then(m => m.NewReleaseComponent),
  },
  {
    path: 'releases/:version/audit-logs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/audit-logs/audit-logs.component').then(m => m.AuditLogsComponent),
  },
  {
    path: 'releases/:version',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/release-detail/release-detail.component').then(m => m.ReleaseDetailComponent),
  },
  {
    path: 'admin/manage-documentation',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/admin/manage-documentation-page/manage-documentation-page.component').then(m => m.ManageDocumentationPageComponent),
  },
  {
    path: 'admin/manage-repositories',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/admin/manage-repositories-page/manage-repositories-page.component').then(m => m.ManageRepositoriesPageComponent),
  },
  {
    path: 'admin/manage-users',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/admin/manage-users-page/manage-users-page.component').then(m => m.ManageUsersPageComponent),
  },
  {
    path: 'admin/jira-configuration',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/admin/jira-configuration-page/jira-configuration-page.component').then(m => m.JiraConfigurationPageComponent),
  },
  { path: '**', redirectTo: '' },
];
