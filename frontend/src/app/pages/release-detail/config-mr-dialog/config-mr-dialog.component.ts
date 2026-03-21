import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';

import { ReleaseService } from '../../../core/services/release.service';
import { ConfigMR, ConfigMrsResponse, OpenMR } from '../../../core/models/release.model';

export interface ConfigMrDialogData {
  version: string;
  mainRepo: string;
  configRepo: string | null;
}

@Component({
  selector: 'app-config-mr-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  styles: [`
    .section-label {
      font-size: 13px;
      font-weight: 600;
      color: rgba(0,0,0,0.6);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 16px 0 8px;
    }
    .mr-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 6px;
      margin-bottom: 8px;
      background: #fafafa;
    }
    .mr-card-info { flex: 1; min-width: 0; }
    .mr-title {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mr-meta { font-size: 11px; color: rgba(0,0,0,0.5); margin-top: 2px; }
    .mr-meta a { color: #1565c0; text-decoration: none; }
    .mr-meta a:hover { text-decoration: underline; }
    .branch-pill {
      display: inline-block;
      background: #e8f0fe;
      color: #1565c0;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 11px;
      font-family: monospace;
    }
    .empty-msg { color: rgba(0,0,0,0.4); font-size: 13px; text-align: center; padding: 12px; }
  `],
  template: `
<h2 mat-dialog-title style="display:flex;align-items:center;gap:8px;">
  <mat-icon>merge</mat-icon>
  Config Repo MRs
  <span style="font-size:14px;font-weight:400;color:rgba(0,0,0,0.5);margin-left:4px;">{{ data.configRepo }}</span>
</h2>

<mat-dialog-content style="min-width:640px;max-height:70vh;overflow-y:auto;">

  <div *ngIf="loading" style="text-align:center;padding:24px;">
    <mat-spinner diameter="32"></mat-spinner>
  </div>

  <div *ngIf="errorMessage" style="color:#c62828;font-size:13px;padding:8px 0;">{{ errorMessage }}</div>

  <ng-container *ngIf="!loading && !errorMessage">

    <!-- Tracked MRs -->
    <div class="section-label">Tracked for this release</div>

    <div *ngIf="response!.tracked.length === 0" class="empty-msg">
      No MRs tracked yet. Track one from the open MRs below.
    </div>

    <div *ngFor="let mr of response!.tracked" class="mr-card">
      <div class="mr-card-info">
        <div class="mr-title">
          <a [href]="mr.mr_url" target="_blank" rel="noopener">!{{ mr.mr_iid }} {{ mr.title }}</a>
        </div>
        <div class="mr-meta">
          <span class="branch-pill">{{ mr.source_branch }}</span>
          → <span class="branch-pill">{{ mr.target_branch }}</span>
          &nbsp;·&nbsp; by {{ mr.state }}
          &nbsp;·&nbsp; tracked {{ mr.tracked_at | date:'short' }}
        </div>
      </div>
      <button mat-stroked-button color="warn" style="flex-shrink:0;"
              [disabled]="removing === mr.mr_iid"
              (click)="untrack(mr)">
        <mat-spinner *ngIf="removing === mr.mr_iid" diameter="16" style="display:inline-block;margin-right:4px;"></mat-spinner>
        <mat-icon *ngIf="removing !== mr.mr_iid">remove_circle_outline</mat-icon>
        Remove
      </button>
    </div>

    <mat-divider style="margin:16px 0;"></mat-divider>

    <!-- Open MRs from GitLab -->
    <div class="section-label">Open MRs in {{ data.configRepo }}</div>

    <div *ngIf="response!.open_mrs.length === 0" class="empty-msg">
      No open merge requests found in this config repo.
    </div>

    <div *ngFor="let mr of response!.open_mrs" class="mr-card">
      <div class="mr-card-info">
        <div class="mr-title">
          <a [href]="mr.mr_url" target="_blank" rel="noopener">!{{ mr.mr_iid }} {{ mr.title }}</a>
        </div>
        <div class="mr-meta">
          <span class="branch-pill">{{ mr.source_branch }}</span>
          → <span class="branch-pill">{{ mr.target_branch }}</span>
          &nbsp;·&nbsp; by {{ mr.author }}
        </div>
      </div>
      <button mat-stroked-button color="primary" style="flex-shrink:0;"
              [disabled]="isAlreadyTracked(mr) || tracking === mr.mr_iid"
              (click)="track(mr)">
        <mat-spinner *ngIf="tracking === mr.mr_iid" diameter="16" style="display:inline-block;margin-right:4px;"></mat-spinner>
        <mat-icon *ngIf="tracking !== mr.mr_iid">add_circle_outline</mat-icon>
        {{ isAlreadyTracked(mr) ? 'Tracked' : 'Track' }}
      </button>
    </div>

  </ng-container>

</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-button (click)="close()">Close</button>
</mat-dialog-actions>
  `,
})
export class ConfigMrDialogComponent implements OnInit {
  loading = true;
  errorMessage = '';
  response: ConfigMrsResponse | null = null;

  tracking: number | null = null;
  removing: number | null = null;

  constructor(
    private dialogRef: MatDialogRef<ConfigMrDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfigMrDialogData,
    private releaseService: ReleaseService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.releaseService.getConfigMrs(this.data.version, this.data.mainRepo).subscribe({
      next: (r) => {
        this.response = r;
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMessage = err?.error?.detail ?? 'Failed to load config MRs.';
      },
    });
  }

  isAlreadyTracked(mr: OpenMR): boolean {
    return this.response?.tracked.some(t => t.mr_iid === mr.mr_iid) ?? false;
  }

  track(mr: OpenMR): void {
    if (!this.data.configRepo) return;
    this.tracking = mr.mr_iid;
    this.releaseService.trackConfigMr(this.data.version, {
      main_repo: this.data.mainRepo,
      config_repo: this.data.configRepo,
      mr_iid: mr.mr_iid,
      mr_url: mr.mr_url,
      title: mr.title,
      source_branch: mr.source_branch,
      target_branch: mr.target_branch,
      state: mr.state,
    }).subscribe({
      next: (tracked) => {
        if (this.response) this.response.tracked = tracked;
        this.tracking = null;
      },
      error: (err: any) => {
        this.tracking = null;
        this.errorMessage = err?.error?.detail ?? 'Failed to track MR.';
      },
    });
  }

  untrack(mr: ConfigMR): void {
    this.removing = mr.mr_iid;
    this.releaseService.untrackConfigMr(this.data.version, mr.config_repo, mr.mr_iid).subscribe({
      next: (tracked) => {
        if (this.response) this.response.tracked = tracked;
        this.removing = null;
      },
      error: (err: any) => {
        this.removing = null;
        this.errorMessage = err?.error?.detail ?? 'Failed to remove MR.';
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
