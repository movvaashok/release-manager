import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';

import { ReleaseService } from '../../core/services/release.service';
import { ReleaseSummary } from '../../core/models/release.model';
import { CreateReleaseDialogComponent } from './create-release-dialog/create-release-dialog.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatToolbarModule,
    MatTooltipModule,
    MatBadgeModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  releases: ReleaseSummary[] = [];
  loading = true;
  errorMessage = '';
  username = '';

  displayedColumns = [
    'version', 'created_at', 'total_repos',
    'stage2', 'stage3', 'actions',
  ];

  constructor(
    private releaseService: ReleaseService,
    private dialog: MatDialog,
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.username = this.auth.getUsername() ?? '';
    this.loadReleases();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
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
      error: () => {
        this.errorMessage = 'Failed to load releases.';
        this.loading = false;
      },
    });
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(CreateReleaseDialogComponent, {
      width: '560px',
      disableClose: true,
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.router.navigate(['/releases', result.version]);
      }
    });
  }

  viewRelease(version: string): void {
    this.router.navigate(['/releases', version]);
  }

  stage2Progress(r: ReleaseSummary): string {
    return `${r.stage2_success} ok · ${r.stage2_conflict} conflict · ${r.stage2_failed} failed · ${r.stage2_pending} pending`;
  }

  stage3Progress(r: ReleaseSummary): string {
    return `${r.stage3_success + r.stage3_already_exists} done · ${r.stage3_failed} failed · ${r.stage3_pending} pending`;
  }
}
