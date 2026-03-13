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
    path: 'releases/:version',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/release-detail/release-detail.component').then(m => m.ReleaseDetailComponent),
  },
  { path: '**', redirectTo: '' },
];
