import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface RaAbandonConfirmData {
  repoName: string;
  subtaskUrl: string;
}

@Component({
  selector: 'app-ra-abandon-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px;">
      <mat-icon style="color:#e65100;">warning</mat-icon>
      RA Subtask Required
    </h2>

    <mat-dialog-content style="max-width:480px;">
      <p style="margin:0 0 12px;font-size:14px;color:rgba(0,0,0,0.75);">
        <strong>{{ data.repoName }}</strong> has an open Risk Assessment subtask.
        Before removing this repository from the release, you must set the subtask
        status to <strong>Abandoned</strong> in Jira.
      </p>

      <a [href]="data.subtaskUrl" target="_blank" rel="noopener"
         style="display:inline-flex;align-items:center;gap:6px;font-size:13px;
                color:#1565c0;text-decoration:none;padding:8px 12px;
                border:1px solid #bbdefb;border-radius:6px;background:#e3f2fd;">
        <mat-icon style="font-size:16px;width:16px;height:16px;">open_in_new</mat-icon>
        Open RA Subtask in Jira
      </a>

      <p style="margin:14px 0 0;font-size:12px;color:rgba(0,0,0,0.5);">
        Once you have set the subtask to <em>Abandoned</em>, click
        <strong>Verify &amp; Delete</strong> — the status will be confirmed before deletion proceeds.
      </p>

      <div *ngIf="errorMsg" style="margin-top:12px;padding:8px 12px;background:#ffebee;
           border-radius:6px;font-size:13px;color:#c62828;display:flex;align-items:center;gap:6px;">
        <mat-icon style="font-size:16px;width:16px;height:16px;">error</mat-icon>
        {{ errorMsg }}
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end" style="gap:8px;">
      <button mat-button mat-dialog-close [disabled]="verifying">Cancel</button>
      <button mat-raised-button color="warn" [disabled]="verifying" (click)="confirm()">
        <mat-spinner *ngIf="verifying" diameter="16" style="display:inline-block;margin-right:6px;"></mat-spinner>
        Verify &amp; Delete
      </button>
    </mat-dialog-actions>
  `,
})
export class RaAbandonConfirmDialogComponent {
  verifying = false;
  errorMsg = '';

  constructor(
    public dialogRef: MatDialogRef<RaAbandonConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RaAbandonConfirmData,
  ) {}

  confirm(): void {
    // Close with true — the caller performs the DELETE and handles the 400 error
    this.dialogRef.close(true);
  }
}
