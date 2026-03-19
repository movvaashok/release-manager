import { Component, OnDestroy, OnInit } from '@angular/core';
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
import { MatMenuModule } from '@angular/material/menu';

import { ReleaseService } from '../../core/services/release.service';
import { ReleaseState, Stage2Repo, Stage3Repo } from '../../core/models/release.model';
import { StatusChipComponent } from '../../shared/components/status-chip/status-chip.component';
import { AddReposDialogComponent } from './add-repos-dialog/add-repos-dialog.component';
import { AddViaJiraDialogComponent } from './add-via-jira-dialog/add-via-jira-dialog.component';
import { AuthService } from '../../core/services/auth.service';

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
    MatMenuModule,
    StatusChipComponent,
    AddReposDialogComponent,
    AddViaJiraDialogComponent,
  ],
  templateUrl: './release-detail.component.html',
  styleUrls: ['./release-detail.component.scss'],
})
const ACTIVE_PIPELINE_STATUSES = new Set([
  'created', 'waiting_for_resource', 'preparing', 'pending', 'running',
]);
const POLL_INTERVAL_MS = 30_000;

export class ReleaseDetailComponent implements OnInit, OnDestroy {
  version = '';
  release: ReleaseState | null = null;
  loading = true;
  username = '';
  runningStage2 = false;
  runningStage3 = false;
  runningDiffCheck = false;
  retryingRepo: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  stage1Columns = ['name', 'path', 'actions'];
  stage2Columns = ['name', 'status', 'branch_info', 'diff', 'pipeline', 'error', 'actions'];
  stage3Columns = ['name', 'status', 'mr', 'pipeline3', 'error', 'actions'];
  removingRepo: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private releaseService: ReleaseService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private auth: AuthService
  ) {}

  isAdmin = false;

  ngOnInit(): void {
    this.version = this.route.snapshot.paramMap.get('version') ?? '';
    this.username = this.auth.getUsername() ?? '';
    this.isAdmin = this.auth.isAdmin();
    this.loadRelease();
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  loadRelease(): void {
    this.loading = true;
    this.releaseService.getRelease(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.loading = false;
        // Immediately fetch live pipeline statuses from GitLab
        this.refreshPipelinesQuiet();
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Failed to load release.', 'Close', { duration: 4000 });
      },
    });
  }

  /** Refresh pipeline statuses silently (no spinner, no snackbar). */
  private refreshPipelinesQuiet(): void {
    this.releaseService.refreshPipelines(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.managePollTimer();
      },
      error: () => { /* silent — don't disrupt the page */ },
    });
  }

  /** Start polling if any pipeline is still active; stop it if all are done. */
  private managePollTimer(): void {
    const hasActive = this.hasActivePipelines();
    if (hasActive && !this.pollTimer) {
      this.pollTimer = setInterval(() => this.refreshPipelinesQuiet(), POLL_INTERVAL_MS);
    } else if (!hasActive && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private hasActivePipelines(): boolean {
    if (!this.release) return false;
    return (
      this.release.stage2.some(r => ACTIVE_PIPELINE_STATUSES.has(r.pipeline_status ?? '')) ||
      this.release.stage3.some(r => ACTIVE_PIPELINE_STATUSES.has(r.pipeline_status ?? ''))
    );
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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
        this.managePollTimer();
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
        this.managePollTimer();
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

  get stage2HasBranches(): boolean {
    return !!this.release?.stage2.some(r => r.branch_created || r.branch_existed || r.status === 'success');
  }

  runDiffCheck(): void {
    this.runningDiffCheck = true;
    this.releaseService.diffCheckStage2(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.runningDiffCheck = false;
        const ahead = r.stage2.filter(x => x.has_new_commits).length;
        const msg = ahead > 0
          ? `${ahead} repo${ahead > 1 ? 's have' : ' has'} new commits in develop.`
          : 'All branches are up to date with develop.';
        this.snackBar.open(msg, 'Close', { duration: 4000 });
      },
      error: () => {
        this.runningDiffCheck = false;
        this.snackBar.open('Diff check failed.', 'Close', { duration: 4000 });
      },
    });
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
        this.managePollTimer();
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
        this.managePollTimer();
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

  openAddViaJiraDialog(): void {
    const existingRepoNames = this.release?.stage1.map(r => r.name) ?? [];
    const ref = this.dialog.open(AddViaJiraDialogComponent, {
      width: '600px',
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

  copyMRLinks(): void {
    const urls = this.release?.stage3
      .filter(r => r.mr_url)
      .map(r => r.mr_url!)
      .join('\n') ?? '';
    navigator.clipboard.writeText(urls).then(() => {
      this.snackBar.open('MR links copied to clipboard.', 'Close', { duration: 3000 });
    });
  }

  get mrLinkCount(): number {
    return this.release?.stage3.filter(r => r.mr_url).length ?? 0;
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

  pipelineIcon(status: string | null): string {
    switch (status) {
      case 'success':   return 'check_circle';
      case 'failed':    return 'cancel';
      case 'running':   return 'sync';
      case 'pending':
      case 'created':
      case 'waiting_for_resource':
      case 'preparing': return 'schedule';
      case 'canceled':
      case 'skipped':   return 'remove_circle_outline';
      case 'manual':    return 'play_circle_outline';
      default:          return 'help_outline';
    }
  }

  pipelineColor(status: string | null): string {
    switch (status) {
      case 'success':   return '#2e7d32';
      case 'failed':    return '#c62828';
      case 'running':   return '#1565c0';
      case 'pending':
      case 'created':
      case 'waiting_for_resource':
      case 'preparing': return '#e65100';
      case 'canceled':
      case 'skipped':   return '#757575';
      default:          return '#9e9e9e';
    }
  }
}
