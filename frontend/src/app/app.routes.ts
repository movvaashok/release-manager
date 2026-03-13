import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/welcome/welcome.component').then(m => m.WelcomeComponent),
  },
  {
    path: 'releases',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'releases/:version',
    loadComponent: () =>
      import('./pages/release-detail/release-detail.component').then(m => m.ReleaseDetailComponent),
  },
  { path: '**', redirectTo: '' },
];
