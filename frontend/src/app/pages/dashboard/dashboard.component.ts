import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';

import { ReleaseService } from '../../core/services/release.service';
import { ReleaseSummary } from '../../core/models/release.model';
import { AuthService } from '../../core/services/auth.service';
import { CreateReleaseDialogComponent } from './create-release-dialog/create-release-dialog.component';
import { ManageReposDialogComponent } from './manage-repos-dialog/manage-repos-dialog.component';
import { ManageUsersDialogComponent } from './manage-users-dialog/manage-users-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, MatButtonModule, MatIconModule, MatCardModule,
    MatProgressSpinnerModule, MatDialogModule, MatToolbarModule,
    MatTooltipModule, MatMenuModule, MatDividerModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  releases: ReleaseSummary[] = [];
  loading = true;
  errorMessage = '';
  username = '';
  isAdmin = false;

  constructor(
    private releaseService: ReleaseService,
    private dialog: MatDialog,
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.username = this.auth.getUsername() ?? '';
    this.isAdmin = this.auth.isAdmin();
    this.loadReleases();
  }

  loadReleases(): void {
    this.loading = true;
    this.releaseService.listReleases().subscribe({
      next: (releases) => {
        this.releases = releases.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        this.loading = false;
      },
      error: () => { this.errorMessage = 'Failed to load releases.'; this.loading = false; },
    });
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(CreateReleaseDialogComponent, { width: '560px', disableClose: true });
    ref.afterClosed().subscribe(result => {
      if (result) this.router.navigate(['/releases', result.version]);
    });
  }

  openManageRepos(): void {
    this.dialog.open(ManageReposDialogComponent, { width: '820px', disableClose: false });
  }

  openManageUsers(): void {
    this.dialog.open(ManageUsersDialogComponent, { width: '640px', disableClose: false });
  }

  viewRelease(version: string): void {
    this.router.navigate(['/releases', version]);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  stage2StatusClass(r: ReleaseSummary): string {
    if (r.stage2_failed > 0 || r.stage2_conflict > 0) return 'status-warn';
    if (r.stage2_pending > 0) return 'status-pending';
    return 'status-done';
  }

  stage3StatusClass(r: ReleaseSummary): string {
    if (r.stage3_failed > 0) return 'status-warn';
    if (r.stage3_pending > 0) return 'status-pending';
    return 'status-done';
  }

  get totalReleases(): number { return this.releases.length; }
  get pendingReleases(): number {
    return this.releases.filter(r => r.stage2_pending > 0 || r.stage3_pending > 0).length;
  }
  get completedReleases(): number {
    return this.releases.filter(r =>
      r.stage2_pending === 0 && r.stage2_failed === 0 &&
      r.stage3_pending === 0 && r.stage3_failed === 0
    ).length;
  }
}
