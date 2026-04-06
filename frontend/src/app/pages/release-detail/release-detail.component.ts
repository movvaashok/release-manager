import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

import { ReleaseService } from '../../core/services/release.service';
import { JiraStatusSummary, JiraTicketStatus, ReleaseState, Stage2Repo, Stage3Repo } from '../../core/models/release.model';
import { StatusChipComponent } from '../../shared/components/status-chip/status-chip.component';
import { AddReposDialogComponent } from './add-repos-dialog/add-repos-dialog.component';
import { AddViaJiraDialogComponent } from './add-via-jira-dialog/add-via-jira-dialog.component';
import { RaAbandonConfirmDialogComponent } from './ra-abandon-confirm-dialog/ra-abandon-confirm-dialog.component';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';

const ACTIVE_PIPELINE_STATUSES = new Set([
  'created', 'waiting_for_resource', 'preparing', 'pending', 'running',
]);
const POLL_INTERVAL_MS = 30_000;

@Component({
  selector: 'app-release-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatNativeDateModule,
    StatusChipComponent,
    AddReposDialogComponent,
    AddViaJiraDialogComponent,
    RaAbandonConfirmDialogComponent,
  ],
  templateUrl: './release-detail.component.html',
  styleUrls: ['./release-detail.component.scss'],
})
export class ReleaseDetailComponent implements OnInit, OnDestroy {
  version = '';
  release: ReleaseState | null = null;
  loading = true;
  username = '';
  runningStage2 = false;
  runningStage3 = false;
  runningDiffCheck = false;
  retryingRepo: string | null = null;
  creatingRaSubtask: Set<string> = new Set();
  activeTabIndex: number = 0;

  // Jira Status tab
  jiraStatus: JiraStatusSummary | null = null;
  loadingJiraStatus = false;
  jiraStatusError = '';
  collapsedJiraGroups = new Set<string>(['done', 'testing', 'other']); // all collapsed by default
  expandedJiraTickets = new Set<string>();
  componentSearch = '';
  raCollapsed = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  stage1Columns = ['name', 'actions'];
  stage2Columns = ['name', 'status', 'branch_info', 'diff', 'pipeline', 'error', 'actions'];
  stage3Columns = ['name', 'status', 'mr', 'mr_readiness', 'pipeline3', 'error', 'actions'];
  deploymentStatusColumns = ['name', 'replicas', 'restarts', 'image'];
  refreshingMrStatus = false;
  removingRepo: string | null = null;

  // Deployment Status tab
  deploymentStatus: any = null;
  loadingDeploymentStatus = false;
  deploymentStatusNextRefresh: Date | null = null;
  private deploymentStatusRefreshInterval: any = null;
  expandedDeployments = new Set<string>();
  deploymentLogs = new Map<string, any>();
  loadingDeploymentLogs = new Map<string, boolean>();

  // Config MRs
  configMrs: any = null;

  // Documentation tab
  editingDocs = false;
  savingDocs = false;
  docsError = '';
  docsForm: { cab_date_obj: Date | null; cab_ticket_url: string; confluence_url: string; risk_assessment_url: string } = {
    cab_date_obj: null,
    cab_ticket_url: '',
    confluence_url: '',
    risk_assessment_url: '',
  };
  confluenceSearching = false;
  confluenceFound: boolean | null = null; // null = not yet searched
  cabTicketSearching = false;
  cabTicketFound: boolean | null = null; // null = not yet searched
  messageCopied = false;
  refreshingRa = false;

  get raRepoCount(): number {
    return this.release?.stage3.filter(r => r.requires_ra).length ?? 0;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private releaseService: ReleaseService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private auth: AuthService,
    private projectService: ProjectService,
  ) {}

  get isPioneerProject(): boolean {
    return this.projectService.currentId === 'pioneer';
  }

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
    // Only show the full-page spinner on the very first load.
    // On toolbar refreshes the data is already present, so keeping loading=true
    // would destroy the tab group and reset the active tab to 0.
    if (!this.release) this.loading = true;
    this.releaseService.getRelease(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.loading = false;
        // Immediately fetch live pipeline statuses from GitLab
        this.refreshPipelinesQuiet();
        // Load config MRs for copy functionality
        this.loadConfigMrs();
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Failed to load release.', 'Close', { duration: 4000 });
      },
    });
  }

  private loadConfigMrs(): void {
    this.releaseService.getTrackedConfigMrs(this.version).subscribe({
      next: (data) => {
        this.configMrs = data;
      },
      error: () => {
        // Silent error - config MRs are optional
        this.configMrs = { tracked: [], open_mrs: [] };
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
    if (this.deploymentStatusRefreshInterval) {
      clearInterval(this.deploymentStatusRefreshInterval);
      this.deploymentStatusRefreshInterval = null;
    }
  }

  goBack(): void {
    this.router.navigate(['/releases']);
  }

  openAuditLogs(): void {
    this.router.navigate(['/releases', this.version, 'audit-logs']);
  }

  confirmDeleteRelease(): void {
    const confirmed = window.confirm(
      `Are you sure you want to delete release v${this.version}?\n\nThe release folder will be moved to the archive. This cannot be undone from the UI.`
    );
    if (!confirmed) return;

    this.releaseService.deleteRelease(this.version).subscribe({
      next: () => {
        this.snackBar.open(`Release v${this.version} archived successfully.`, 'Close', { duration: 4000 });
        this.router.navigate(['/releases']);
      },
      error: () => {
        this.snackBar.open('Failed to archive release. Please try again.', 'Close', { duration: 4000 });
      },
    });
  }

  // -----------------------------------------------------------------------
  // Documentation tab
  // -----------------------------------------------------------------------

  startEditDocs(): void {
    if (!this.release) return;
    this.docsError = '';
    // Pre-populate form from current release state
    this.docsForm = {
      cab_date_obj: this.release.cab_date ? new Date(this.release.cab_date + 'T12:00:00') : null,
      cab_ticket_url: this.release.cab_ticket_url ?? '',
      confluence_url: this.release.confluence_url ?? '',
      risk_assessment_url: this.release.risk_assessment_url ?? '',
    };
    this.editingDocs = true;
  }

  cancelEditDocs(): void {
    this.editingDocs = false;
    this.docsError = '';
  }

  saveDocs(): void {
    this.savingDocs = true;
    this.docsError = '';

    const cabDateRaw = this.docsForm.cab_date_obj;
    const cabDateStr = cabDateRaw
      ? `${cabDateRaw.getFullYear()}-${String(cabDateRaw.getMonth() + 1).padStart(2, '0')}-${String(cabDateRaw.getDate()).padStart(2, '0')}`
      : null;

    this.releaseService.updateDocs(this.version, {
      cab_date: cabDateStr,
      cab_ticket_url: this.docsForm.cab_ticket_url || null,
      confluence_url: this.docsForm.confluence_url || null,
      risk_assessment_url: this.docsForm.risk_assessment_url || null,
    }).subscribe({
      next: (r) => {
        this.release = r;
        this.editingDocs = false;
        this.savingDocs = false;
        this.snackBar.open('Documentation links saved.', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.docsError = err?.error?.detail ?? 'Failed to save documentation links.';
        this.savingDocs = false;
      },
    });
  }

  // -----------------------------------------------------------------------
  // Documentation – Confluence auto-populate
  // -----------------------------------------------------------------------

  tryPopulateConfluence(): void {
    if (!this.release || this.release.confluence_url || this.confluenceSearching) return;
    this.confluenceSearching = true;
    this.releaseService.confluenceSearch(this.version).subscribe({
      next: (r) => {
        const found = !!r.confluence_url && !this.release?.confluence_url;
        this.release = r;
        this.confluenceSearching = false;
        this.confluenceFound = !!r.confluence_url;
        if (found) {
          this.snackBar.open('Confluence page found and linked automatically.', 'Close', { duration: 4000 });
        }
      },
      error: () => {
        this.confluenceSearching = false;
        this.confluenceFound = false;
      },
    });
  }

  tryPopulateCabTicket(): void {
    if (!this.release || this.release.cab_ticket_url || this.cabTicketSearching) return;
    this.cabTicketSearching = true;
    this.releaseService.cabTicketSearch(this.version).subscribe({
      next: (r) => {
        const found = !!r.cab_ticket_url && !this.release?.cab_ticket_url;
        this.release = r;
        this.cabTicketSearching = false;
        this.cabTicketFound = !!r.cab_ticket_url;
        if (found) {
          this.snackBar.open('CAB ticket found and linked automatically.', 'Close', { duration: 4000 });
        }
      },
      error: () => {
        this.cabTicketSearching = false;
        this.cabTicketFound = false;
      },
    });
  }

  onTabChanged(index: number): void {
    // Tab order: 0=Jira Status, 1=Stage1, 2=Stage2, 3=Stage3(admin), 4=Deployment Status, 5=Documentation(admin)
    // (when not admin, Stage3 is hidden so Deployment Status shifts to 3, Documentation to 4)
    if (index === 0) {
      if (!this.jiraStatus && !this.loadingJiraStatus) this.loadJiraStatus();
    }
    const deploymentStatusIndex = this.isAdmin ? 4 : 3;
    if (index === deploymentStatusIndex) {
      if (!this.deploymentStatus && !this.loadingDeploymentStatus) this.refreshDeploymentStatus();
      this.setDeploymentStatusRefreshTimer();
    }
    const docIndex = this.isAdmin ? 5 : 4;
    if (index === docIndex) this.onDocTabSelected();
  }

  onDocTabSelected(): void {
    this.tryPopulateConfluence();
    this.tryPopulateCabTicket();
  }

  refreshRaRequirements(): void {
    this.refreshingRa = true;
    this.releaseService.refreshRa(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.refreshingRa = false;
        const count = r.stage3.filter(x => x.requires_ra).length;
        this.snackBar.open(
          count > 0
            ? `RA requirements updated — ${count} repo${count === 1 ? '' : 's'} require Risk Assessment.`
            : 'RA requirements updated — no repos require Risk Assessment.',
          'Close',
          { duration: 4000 },
        );
      },
      error: () => {
        this.refreshingRa = false;
        this.snackBar.open('Failed to refresh RA requirements.', 'Close', { duration: 4000 });
      },
    });
  }

  // -----------------------------------------------------------------------
  // Documentation – Copy message
  // -----------------------------------------------------------------------

  copyDocMessage(): void {
    if (!this.release) return;
    const r = this.release;

    const cabLine = r.cab_date
      ? `📅 CAB Meeting Date: ${new Date(r.cab_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : '📅 CAB Meeting Date: Not set';

    const cabTicketLine = r.cab_ticket_url
      ? `🎫 CAB Ticket: ${r.cab_ticket_url}`
      : '🎫 CAB Ticket: Not set';

    const confluenceLine = r.confluence_url
      ? `📄 Confluence Page: ${r.confluence_url}`
      : '📄 Confluence Page: Not set';

    const raLine = r.risk_assessment_url
      ? `🛡️ Risk Assessment: ${r.risk_assessment_url}`
      : '🛡️ Risk Assessment: Not set';

    const message = [
      `📦 Release v${r.version} — Documentation Links`,
      '',
      cabLine,
      cabTicketLine,
      confluenceLine,
      raLine,
    ].join('\n');

    navigator.clipboard.writeText(message).then(() => {
      this.messageCopied = true;
      setTimeout(() => (this.messageCopied = false), 3000);
    });
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
      error: (err: any) => {
        this.retryingRepo = null;
        const detail = err?.error?.detail ?? `Retry failed for ${repo.name}.`;
        this.snackBar.open(detail, 'Close', { duration: 8000 });
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

  refreshMrStatuses(): void {
    this.refreshingMrStatus = true;
    this.releaseService.refreshMrStatuses(this.version).subscribe({
      next: (r) => {
        this.release = r;
        this.refreshingMrStatus = false;
        this.snackBar.open('MR statuses refreshed.', 'Close', { duration: 3000 });
      },
      error: () => {
        this.refreshingMrStatus = false;
        this.snackBar.open('Failed to refresh MR statuses.', 'Close', { duration: 4000 });
      },
    });
  }

  refreshDeploymentStatus(): void {
    this.loadingDeploymentStatus = true;
    this.releaseService.getDeploymentStatus(this.version).subscribe({
      next: (r) => {
        this.deploymentStatus = r;
        this.loadingDeploymentStatus = false;
        this.setDeploymentStatusRefreshTimer();
      },
      error: () => {
        this.loadingDeploymentStatus = false;
        this.snackBar.open('Failed to load deployment status.', 'Close', { duration: 4000 });
      },
    });
  }

  private setDeploymentStatusRefreshTimer(): void {
    // Clear existing timer if any
    if (this.deploymentStatusRefreshInterval) {
      clearInterval(this.deploymentStatusRefreshInterval);
      this.deploymentStatusRefreshInterval = null;
    }
    // Set next refresh time to 3 minutes from now
    this.deploymentStatusNextRefresh = new Date(Date.now() + 3 * 60 * 1000);
    // Start auto-refresh every 3 minutes
    this.deploymentStatusRefreshInterval = setInterval(() => {
      this.releaseService.getDeploymentStatus(this.version).subscribe({
        next: (r) => {
          this.deploymentStatus = r;
          this.deploymentStatusNextRefresh = new Date(Date.now() + 3 * 60 * 1000);
        },
        error: () => { /* silent */ },
      });
    }, 3 * 60 * 1000);
  }

  toggleDeploymentExpansion(deploymentName: string): void {
    if (this.expandedDeployments.has(deploymentName)) {
      this.expandedDeployments.delete(deploymentName);
    } else {
      this.expandedDeployments.add(deploymentName);
      // Load logs when expanding
      this.loadDeploymentLogs(deploymentName);
    }
  }

  isDeploymentExpanded(deploymentName: string): boolean {
    return this.expandedDeployments.has(deploymentName);
  }

  hasDeploymentLogs(deploymentName: string): boolean {
    return this.deploymentLogs.has(deploymentName);
  }

  hasServiceMrs(): boolean {
    return (this.release?.stage3 ?? []).some(r => r.mr_url);
  }

  loadDeploymentLogs(serviceName: string): void {
    // Don't reload if already loaded
    if (this.deploymentLogs.has(serviceName)) {
      return;
    }

    this.loadingDeploymentLogs.set(serviceName, true);
    this.releaseService.getPodLogs(this.version, serviceName).subscribe({
      next: (data) => {
        this.deploymentLogs.set(serviceName, data);
        this.loadingDeploymentLogs.set(serviceName, false);
      },
      error: () => {
        this.deploymentLogs.set(serviceName, {
          success: false,
          message: 'Failed to load logs',
          error: 'Unable to retrieve logs for this service'
        });
        this.loadingDeploymentLogs.set(serviceName, false);
      },
    });
  }

  downloadDeploymentLogs(serviceName: string): void {
    const logsData = this.deploymentLogs.get(serviceName);
    if (!logsData || !logsData.logs) {
      this.snackBar.open('No logs available for download.', 'Close', { duration: 3000 });
      return;
    }

    // Create a formatted log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${serviceName}-logs-${timestamp}.txt`;

    let content = `Service: ${serviceName}\n`;
    content += `Retrieved: ${new Date().toISOString()}\n`;
    content += `${'='.repeat(80)}\n\n`;

    // Add logs from each pod
    for (const [podName, podLogs] of Object.entries(logsData.logs as any)) {
      content += `\n${'─'.repeat(80)}\n`;
      content += `Pod: ${podName}\n`;
      content += `Timestamp: ${(podLogs as any).timestamp}\n`;
      content += `${'─'.repeat(80)}\n`;
      content += (podLogs as any).logs + '\n';
    }

    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    this.snackBar.open(`Logs downloaded as ${filename}`, 'Close', { duration: 3000 });
  }

  mrReadiness(r: Stage3Repo): { icon: string; color: string; label: string } {
    if (!r.mr_iid) return { icon: 'remove', color: '#bdbdbd', label: '–' };
    if (r.mr_state === 'merged') return { icon: 'check_circle', color: '#2e7d32', label: 'Merged' };
    if (r.mr_state === 'closed') return { icon: 'cancel', color: '#757575', label: 'Closed' };
    const ms = r.mr_merge_status;
    const pipe = r.pipeline_status;
    if (ms === 'can_be_merged' && (pipe === 'success' || pipe === null))
      return { icon: 'check_circle', color: '#2e7d32', label: 'Ready to merge' };
    if (ms === 'can_be_merged' && (pipe === 'running' || pipe === 'pending'))
      return { icon: 'hourglass_top', color: '#f57c00', label: 'Pipeline running' };
    if (ms === 'can_be_merged' && pipe === 'failed')
      return { icon: 'warning', color: '#c62828', label: 'Pipeline failed' };
    if (ms === 'cannot_be_merged')
      return { icon: 'error', color: '#c62828', label: 'Has conflicts' };
    if (ms === 'checking' || ms === 'unchecked' || !ms)
      return { icon: 'pending', color: '#9e9e9e', label: 'Checking…' };
    return { icon: 'help_outline', color: '#9e9e9e', label: ms };
  }

  createRaSubtask(repo: Stage3Repo): void {
    this.creatingRaSubtask.add(repo.name);
    this.releaseService.createRaSubtask(this.version, repo.name).subscribe({
      next: (r) => {
        this.release = r;
        this.creatingRaSubtask.delete(repo.name);
        this.snackBar.open(`RA subtask created for ${repo.name}.`, 'Close', { duration: 3000 });
      },
      error: (err: any) => {
        this.creatingRaSubtask.delete(repo.name);
        const msg = err?.error?.detail ?? 'Failed to create RA subtask.';
        this.snackBar.open(msg, 'Close', { duration: 5000 });
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
    const stage3Entry = this.release?.stage3.find(r => r.name === repoName);
    const subtaskUrl = stage3Entry?.ra_subtask_url ?? null;

    if (subtaskUrl) {
      // Has an RA subtask — require it to be ABANDONED before deleting
      const ref = this.dialog.open(RaAbandonConfirmDialogComponent, {
        width: '520px',
        disableClose: true,
        data: { repoName, subtaskUrl },
      });
      ref.afterClosed().subscribe((confirmed: boolean) => {
        if (!confirmed) return;
        this._doRemoveRepo(repoName, subtaskUrl);
      });
    } else {
      if (!confirm(`Remove "${repoName}" from this release? This will also delete the release branch in GitLab.`)) return;
      this._doRemoveRepo(repoName, null);
    }
  }

  private _doRemoveRepo(repoName: string, subtaskUrl: string | null): void {
    this.removingRepo = repoName;
    this.releaseService.removeRepo(this.version, repoName).subscribe({
      next: (r) => {
        this.release = r;
        this.removingRepo = null;
        this.snackBar.open(`${repoName} removed from release.`, 'Close', { duration: 3000 });
      },
      error: (err: any) => {
        this.removingRepo = null;
        const detail: string = err?.error?.detail ?? '';
        // Backend sends RA_SUBTASK_NOT_ABANDONED:<url>|<message>
        if (detail.startsWith('RA_SUBTASK_NOT_ABANDONED:') && subtaskUrl) {
          const message = detail.includes('|') ? detail.split('|')[1] : detail;
          this.snackBar.open(message, 'Open Jira', { duration: 10000 })
            .onAction().subscribe(() => window.open(subtaskUrl, '_blank'));
        } else {
          this.snackBar.open(`Failed to remove ${repoName}.`, 'Close', { duration: 4000 });
        }
      },
    });
  }

  addConfigRepo(configRepoName: string): void {
    if (!confirm(`Add config repo "${configRepoName}" to this release?`)) return;
    this.releaseService.addRepos(this.version, [configRepoName]).subscribe({
      next: (r) => {
        this.release = r;
        this.snackBar.open(`"${configRepoName}" added to release.`, 'Close', { duration: 3000 });
      },
      error: (err: any) => {
        this.snackBar.open(err?.error?.detail ?? `Failed to add "${configRepoName}".`, 'Close', { duration: 4000 });
      },
    });
  }

  openConfigMrDialog(repo: Stage3Repo): void {
    import('./config-mr-dialog/config-mr-dialog.component').then(m => {
      const ref = this.dialog.open(m.ConfigMrDialogComponent, {
        width: '720px',
        disableClose: false,
        data: { version: this.version, mainRepo: repo.name, configRepo: repo.config_repo },
      });
      ref.afterClosed().subscribe();
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
      width: '860px',
      maxWidth: '95vw',
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

  openAllServiceMrs(): void {
    console.log('[DEBUG] openAllServiceMrs() called');
    if (!this.release) {
      console.log('[DEBUG] No release data');
      return;
    }

    const mrUrls = this.release.stage3
      .filter(r => r.mr_url)
      .map(r => r.mr_url!);

    console.log('[DEBUG] Found service MR URLs:', mrUrls.length, mrUrls);

    if (mrUrls.length === 0) {
      this.snackBar.open('No service MR links available to open.', 'Close', { duration: 3000 });
      return;
    }

    this.openUrlsInTabs(mrUrls, `service MR${mrUrls.length !== 1 ? 's' : ''}`);
  }

  openAllMrs(): void {
    if (!this.release) return;

    // Collect all service MRs
    const serviceMrUrls = this.release.stage3
      .filter(r => r.mr_url)
      .map(r => r.mr_url!);

    // Collect all tracked config MRs
    const trackedConfigMrs = this.configMrs?.tracked ?? [];
    const configMrUrls = trackedConfigMrs.map((mr: any) => mr.mr_url);

    const allUrls = [...serviceMrUrls, ...configMrUrls];

    if (allUrls.length === 0) {
      this.snackBar.open('No MR links available to open.', 'Close', { duration: 3000 });
      return;
    }

    this.openUrlsInTabs(allUrls, `MR${allUrls.length !== 1 ? 's' : ''}`);
  }

  private openUrlsInTabs(urls: string[], label: string): void {
    console.log(`[MR Opener] Starting to open ${urls.length} URLs...`);

    let openedCount = 0;
    const failedUrls: string[] = [];

    // Try opening all without setTimeout first (user gesture intact)
    urls.forEach((url, index) => {
      console.log(`[MR Opener] Opening URL ${index + 1}/${urls.length}: ${url}`);
      try {
        const opened = window.open(url, '_blank');
        if (opened) {
          openedCount++;
          console.log(`[MR Opener] Successfully opened tab ${index + 1}`);
        } else {
          failedUrls.push(url);
          console.warn(`[MR Opener] Tab ${index + 1} blocked (window.open returned null)`);
        }
      } catch (error) {
        failedUrls.push(url);
        console.error(`[MR Opener] Error opening tab ${index + 1}:`, error);
      }
    });

    // Show success message immediately
    console.log(`[MR Opener] Completed. Opened: ${openedCount}/${urls.length}`);

    if (openedCount === urls.length) {
      const message = `✅ Opened ${urls.length} ${label} in new tab${urls.length !== 1 ? 's' : ''}.`;
      this.snackBar.open(message, 'Close', { duration: 4000 });
    } else if (openedCount === 0) {
      const message = `❌ All tabs blocked by pop-up blocker.\n\nSafari Fix:\n1. Safari Menu → Preferences\n2. Security Tab\n3. Uncheck "Block pop-ups"\n4. Try again`;
      this.snackBar.open(message, 'Close', { duration: 6000 });
    } else {
      const message = `⚠️ Opened ${openedCount} of ${urls.length} ${label}. ${failedUrls.length} blocked.`;
      this.snackBar.open(message, 'Close', { duration: 4000 });
    }
  }

  copyMRLinks(): void {
    if (!this.release) return;

    // Collect regular repo MRs (from stage3)
    const regularMrLines = this.release.stage3
      .filter(r => r.mr_url)
      .map(r => `<a href="${r.mr_url!}">🔗 ${r.name} (!${this.getMrIid(r.mr_url!)})</a>`)
      .join('<br>');

    // Collect tracked config repo MRs
    const trackedConfigMrs = this.configMrs?.tracked ?? [];
    const configMrLines = trackedConfigMrs
      .map((mr: any) => `<a href="${mr.mr_url}">🔗 ${mr.config_repo} (!${mr.mr_iid})</a>`)
      .join('<br>');

    // Build HTML message with separate sections
    let message = `<div style="font-family: Arial, sans-serif;">
      <p>👋 Hi Everyone,</p>
      <p><strong>🚀 Pioneer ${this.version}</strong></p>
      <p>Please review below MRs before CAB meeting.</p>`;

    if (regularMrLines) {
      message += `<p><strong>📋 Service MRs:</strong></p><div style="margin-left: 20px;">${regularMrLines}</div>`;
    }

    if (configMrLines) {
      message += `<p><strong>⚙️ Config MRs:</strong></p><div style="margin-left: 20px;">${configMrLines}</div>`;
    }

    message += '</div>';

    if (!regularMrLines && !configMrLines) {
      this.snackBar.open('No MR links available to copy.', 'Close', { duration: 3000 });
      return;
    }

    this.copyHtmlToClipboard(message);
  }

  private getMrIid(url: string): string {
    // Extract MR IID from URL (e.g., /merge_requests/123)
    const match = url.match(/\/merge_requests\/(\d+)/);
    return match ? match[1] : 'N/A';
  }

  private copyHtmlToClipboard(html: string): void {
    const blob = new Blob([html], { type: 'text/html' });
    const data = [new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([this.extractPlainText(html)], { type: 'text/plain' }) })];

    navigator.clipboard.write(data).then(() => {
      this.snackBar.open('MR message copied to clipboard. Visited links will appear in a different color.', 'Close', { duration: 4000 });
    }).catch(() => {
      // Fallback to plain text if HTML copy fails
      this.snackBar.open('MR message copied to clipboard.', 'Close', { duration: 3000 });
    });
  }

  private extractPlainText(html: string): string {
    // Extract plain text version for fallback
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  get mrLinkCount(): number {
    if (!this.release) return 0;
    const regularCount = this.release.stage3.filter(r => r.mr_url).length;
    const trackedConfigMrs = this.configMrs?.tracked ?? [];
    const configCount = trackedConfigMrs.length;
    return regularCount + configCount;
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

  // ── Jira Status tab ──────────────────────────────────────────────────────

  private jiraTicketGroup(status: string): 0 | 1 | 2 {
    const s = status.toLowerCase().trim();
    if (s === 'done' || s.includes('done') || s.includes('resolved') ||
        s.includes('closed') || s.includes('fixed')) return 0;
    if (s.includes('testing') || s.includes('ready for qa') || s.includes('ready to test') ||
        s.includes('in qa') || /\bqa\b/.test(s)) return 1;
    return 2;
  }

  get jiraDoneTickets() {
    return this.jiraStatus?.release_tickets.filter(t => this.jiraTicketGroup(t.status) === 0) ?? [];
  }
  get jiraTestingTickets() {
    return this.jiraStatus?.release_tickets.filter(t => this.jiraTicketGroup(t.status) === 1) ?? [];
  }
  get jiraOtherTickets() {
    return this.jiraStatus?.release_tickets.filter(t => this.jiraTicketGroup(t.status) === 2) ?? [];
  }

  isJiraGroupCollapsed(group: string): boolean { return this.collapsedJiraGroups.has(group); }
  toggleJiraGroup(group: string): void {
    if (this.collapsedJiraGroups.has(group)) this.collapsedJiraGroups.delete(group);
    else this.collapsedJiraGroups.add(group);
  }

  isJiraTicketExpanded(key: string): boolean { return this.expandedJiraTickets.has(key); }
  toggleJiraTicket(key: string): void {
    if (this.expandedJiraTickets.has(key)) this.expandedJiraTickets.delete(key);
    else this.expandedJiraTickets.add(key);
  }

  // ── Component search ──────────────────────────────────────────────────────

  /** All unique component names from Jira tickets + release repo names, sorted. */
  get allComponentSuggestions(): string[] {
    const set = new Set<string>();
    // Jira ticket components (primary source)
    for (const t of (this.jiraStatus?.release_tickets ?? [])) {
      for (const c of t.components) set.add(c);
    }
    // Repo names from stage1 as secondary suggestions
    for (const r of (this.release?.stage1 ?? [])) set.add(r.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /** Autocomplete suggestions filtered by current search text. */
  get componentSuggestions(): string[] {
    const q = this.componentSearch.trim().toLowerCase();
    if (!q) return this.allComponentSuggestions;
    return this.allComponentSuggestions.filter(c => c.toLowerCase().includes(q));
  }

  /** Tickets matching the current search (component name or key/summary substring). */
  get jiraTicketsForComponent(): JiraTicketStatus[] {
    const q = this.componentSearch.trim().toLowerCase();
    if (!q || !this.jiraStatus) return [];
    return this.jiraStatus.release_tickets.filter(t =>
      t.components.some(c => c.toLowerCase().includes(q)) ||
      t.key.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q)
    );
  }

  get isComponentSearchActive(): boolean { return this.componentSearch.trim().length > 0; }

  clearComponentSearch(): void { this.componentSearch = ''; }

  loadJiraStatus(): void {
    this.loadingJiraStatus = true;
    this.jiraStatusError = '';
    this.releaseService.getJiraStatus(this.version).subscribe({
      next: (s) => { this.jiraStatus = s; this.loadingJiraStatus = false; },
      error: (err: any) => {
        this.loadingJiraStatus = false;
        this.jiraStatusError = err?.error?.detail ?? 'Failed to load Jira status.';
      },
    });
  }

  jiraStatusColor(status: string): string {
    const s = status.toLowerCase();
    // RA-specific statuses
    if (s.includes('privacy signoff')) return '#2e7d32';          // RA complete
    if (s.includes('risk assessing')) return '#1565c0';           // RA in progress
    if (s.includes('ready for risk assessment')) return '#e65100'; // RA pending
    if (s.includes('abandoned')) return '#757575';                 // abandoned → grey
    // General statuses
    if (['done', 'resolved', 'closed', 'complete', 'completed', 'fixed'].some(v => s.includes(v))) return '#2e7d32';
    if (['in progress', 'in review', 'review', 'in development'].some(v => s.includes(v))) return '#1565c0';
    if (['blocked', 'rejected', 'cancelled', 'canceled'].some(v => s.includes(v))) return '#c62828';
    if (['testing', 'qa', 'verification'].some(v => s.includes(v))) return '#e65100';
    return '#757575';
  }

  jiraStatusBg(status: string): string {
    const s = status.toLowerCase();
    // RA-specific statuses
    if (s.includes('privacy signoff')) return '#e8f5e9';
    if (s.includes('risk assessing')) return '#e3f2fd';
    if (s.includes('ready for risk assessment')) return '#fff3e0';
    if (s.includes('abandoned')) return '#f5f5f5';
    // General statuses
    if (['done', 'resolved', 'closed', 'complete', 'completed', 'fixed'].some(v => s.includes(v))) return '#e8f5e9';
    if (['in progress', 'in review', 'review', 'in development'].some(v => s.includes(v))) return '#e3f2fd';
    if (['blocked', 'rejected', 'cancelled', 'canceled'].some(v => s.includes(v))) return '#ffebee';
    if (['testing', 'qa', 'verification'].some(v => s.includes(v))) return '#fff3e0';
    return '#f5f5f5';
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
