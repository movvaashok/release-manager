import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';

import { ReleaseService } from '../../core/services/release.service';
import { ReleaseState, Stage2Repo, Stage3Repo } from '../../core/models/release.model';
import { StatusChipComponent } from '../../shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-release-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatChipsModule,
    MatDividerModule,
    StatusChipComponent,
  ],
  templateUrl: './release-detail.component.html',
  styleUrls: ['./release-detail.component.scss'],
})
export class ReleaseDetailComponent implements OnInit {
  version = '';
  release: ReleaseState | null = null;
  loading = true;
  runningStage2 = false;
  runningStage3 = false;
  retryingRepo: string | null = null;

  stage1Columns = ['name', 'path'];
  stage2Columns = ['name', 'status', 'branch_info', 'error', 'actions'];
  stage3Columns = ['name', 'status', 'mr', 'error', 'actions'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private releaseService: ReleaseService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.version = this.route.snapshot.paramMap.get('version') ?? '';
    this.loadRelease();
  }

  loadRelease(): void {
    this.loading = true;
    this.releaseService.getRelease(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Failed to load release.', 'Close', { duration: 4000 });
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  // -----------------------------------------------------------------------
  // Stage 2
  // -----------------------------------------------------------------------

  runStage2(): void {
    this.runningStage2 = true;
    this.releaseService.runStage2(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.runningStage2 = false;
        this.snackBar.open('Stage 2 completed.', 'Close', { duration: 3000 });
      },
      error: () => {
        this.runningStage2 = false;
        this.snackBar.open('Stage 2 failed. Check individual statuses.', 'Close', { duration: 4000 });
      },
    });
  }

  retryStage2Repo(repo: Stage2Repo): void {
    this.retryingRepo = `stage2-${repo.name}`;
    this.releaseService.retryStage2Repo(this.version, repo.name).subscribe({
      next: (r) => {
        this.release = r;
        this.retryingRepo = null;
        this.snackBar.open(`Retry complete for ${repo.name}.`, 'Close', { duration: 3000 });
      },
      error: () => {
        this.retryingRepo = null;
        this.snackBar.open(`Retry failed for ${repo.name}.`, 'Close', { duration: 4000 });
      },
    });
  }

  get stage2HasPendingOrFailed(): boolean {
    return !!this.release?.stage2.some(r => r.status === 'pending' || r.status === 'failed' || r.status === 'conflict');
  }

  // -----------------------------------------------------------------------
  // Stage 3
  // -----------------------------------------------------------------------

  runStage3(): void {
    this.runningStage3 = true;
    this.releaseService.runStage3(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.runningStage3 = false;
        this.snackBar.open('Stage 3 completed.', 'Close', { duration: 3000 });
      },
      error: () => {
        this.runningStage3 = false;
        this.snackBar.open('Stage 3 failed. Check individual statuses.', 'Close', { duration: 4000 });
      },
    });
  }

  retryStage3Repo(repo: Stage3Repo): void {
    this.retryingRepo = `stage3-${repo.name}`;
    this.releaseService.retryStage3Repo(this.version, repo.name).subscribe({
      next: (r) => {
        this.release = r;
        this.retryingRepo = null;
        this.snackBar.open(`Retry complete for ${repo.name}.`, 'Close', { duration: 3000 });
      },
      error: () => {
        this.retryingRepo = null;
        this.snackBar.open(`Retry failed for ${repo.name}.`, 'Close', { duration: 4000 });
      },
    });
  }

  get stage3HasPendingOrFailed(): boolean {
    return !!this.release?.stage3.some(r => r.status === 'pending' || r.status === 'failed');
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  branchInfo(repo: Stage2Repo): string {
    if (repo.no_updates) return 'Up to date';
    if (repo.merged) return 'develop merged';
    if (repo.branch_created) return 'Branch created';
    if (repo.branch_existed) return 'Branch existed';
    return '–';
  }

  isRetrying(prefix: string, name: string): boolean {
    return this.retryingRepo === `${prefix}-${name}`;
  }
}
