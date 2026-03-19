import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

import { ReleaseService } from '../../core/services/release.service';
import { AuthService } from '../../core/services/auth.service';
import { AuditLog } from '../../core/models/release.model';

const ACTION_LABELS: Record<string, string> = {
  release_created:    'Release Created',
  repos_added:        'Repos Added',
  repo_removed:       'Repo Removed',
  stage2_run:         'Stage 2 – Run',
  stage2_repo_retry:  'Stage 2 – Retry Repo',
  diff_check:         'Diff Check',
  stage3_run:         'Stage 3 – Run',
  stage3_repo_retry:  'Stage 3 – Retry Repo',
  pipeline_refresh:   'Pipeline Refresh',
};

const ACTION_COLORS: Record<string, string> = {
  release_created:   '#e8f5e9',
  repos_added:       '#e3f2fd',
  repo_removed:      '#fff3e0',
  stage2_run:        '#f3e5f5',
  stage2_repo_retry: '#fce4ec',
  diff_check:        '#e0f7fa',
  stage3_run:        '#f3e5f5',
  stage3_repo_retry: '#fce4ec',
  pipeline_refresh:  '#f1f8e9',
};

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCardModule,
    MatDividerModule,
  ],
  templateUrl: './audit-logs.component.html',
  styleUrls: ['./audit-logs.component.scss'],
})
export class AuditLogsComponent implements OnInit {
  version = '';
  loading = false;
  errorMessage = '';

  logs: AuditLog[] = [];
  allUsers: string[] = [];

  // Filters
  selectedUser = '';
  fromDate: Date | null = null;
  toDate: Date | null = null;

  displayedColumns = ['timestamp', 'username', 'action', 'repo', 'details'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private releaseService: ReleaseService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.version = this.route.snapshot.paramMap.get('version') ?? '';
    this.loadLogs();
  }

  loadLogs(): void {
    this.loading = true;
    this.errorMessage = '';

    const fromTs = this.fromDate
      ? new Date(this.fromDate.setHours(0, 0, 0, 0)).toISOString()
      : undefined;
    const toTs = this.toDate
      ? new Date(this.toDate.setHours(23, 59, 59, 999)).toISOString()
      : undefined;

    this.releaseService
      .getAuditLogs(this.version, this.selectedUser || undefined, fromTs, toTs)
      .subscribe({
        next: (res) => {
          this.logs = res.logs;
          this.allUsers = res.users;
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err?.error?.detail ?? 'Failed to load audit logs';
          this.loading = false;
        },
      });
  }

  applyFilters(): void {
    this.loadLogs();
  }

  clearFilters(): void {
    this.selectedUser = '';
    this.fromDate = null;
    this.toDate = null;
    this.loadLogs();
  }

  goBack(): void {
    this.router.navigate(['/releases', this.version]);
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  actionColor(action: string): string {
    return ACTION_COLORS[action] ?? '#f5f5f5';
  }

  formatDetails(log: AuditLog): string {
    const d = log.details;
    if (!d || Object.keys(d).length === 0) return '—';
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as string[]).join(', ') : v}`)
      .join(' | ');
  }
}
