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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ReleaseService } from '../../core/services/release.service';
import { ReleaseState, Stage2Repo, Stage3Repo } from '../../core/models/release.model';
import { StatusChipComponent } from '../../shared/components/status-chip/status-chip.component';
import { AddReposDialogComponent } from './add-repos-dialog/add-repos-dialog.component';

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
    MatDialogModule,
    StatusChipComponent,
    AddReposDialogComponent,
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

  stage1Columns = ['name', 'path', 'actions'];
  stage2Columns = ['name', 'status', 'branch_info', 'error', 'actions'];
  stage3Columns = ['name', 'status', 'mr', 'error', 'actions'];
  removingRepo: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private releaseService: ReleaseService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
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
    this.router.navigate(['/releases']);
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
  // Add repos
  // -----------------------------------------------------------------------

  removeRepo(repoName: string): void {
    if (!confirm(`Remove "${repoName}" from this release? This will also delete the release branch in GitLab.`)) return;
    this.removingRepo = repoName;
    this.releaseService.removeRepo(this.version, repoName).subscribe({
      next: (r) => {
        this.release = r;
        this.removingRepo = null;
        this.snackBar.open(`${repoName} removed from release.`, 'Close', { duration: 3000 });
      },
      error: () => {
        this.removingRepo = null;
        this.snackBar.open(`Failed to remove ${repoName}.`, 'Close', { duration: 4000 });
      },
    });
  }

  openAddReposDialog(): void {
    const existingRepoNames = this.release?.stage1.map(r => r.name) ?? [];
    const ref = this.dialog.open(AddReposDialogComponent, {
      width: '560px',
      disableClose: true,
      data: { version: this.version, existingRepoNames },
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.release = result;
        this.snackBar.open('Repositories added successfully.', 'Close', { duration: 3000 });
      }
    });
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
