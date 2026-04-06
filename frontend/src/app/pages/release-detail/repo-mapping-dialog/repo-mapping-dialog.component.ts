import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';

import { ReleaseService } from '../../../core/services/release.service';

@Component({
  selector: 'app-repo-mapping-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  styles: [`
    .mapping-container {
      min-width: 500px;
      padding: 0;
    }
    .mapping-table {
      width: 100%;
      margin-top: 16px;
    }
    .add-mapping {
      display: flex;
      gap: 8px;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    .add-mapping mat-form-field {
      flex: 1;
    }
    .mapping-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .mapping-row:last-child {
      border-bottom: none;
    }
    .repo-name {
      font-weight: 500;
      min-width: 200px;
    }
    .component-name {
      flex: 1;
      margin-left: 16px;
    }
    .action-buttons {
      display: flex;
      gap: 4px;
    }
    .empty-state {
      padding: 32px 16px;
      text-align: center;
      color: rgba(0,0,0,0.54);
      font-size: 13px;
    }
  `],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px;">
      <mat-icon>settings</mat-icon>
      Repo to Component Mapping
    </h2>

    <mat-dialog-content class="mapping-container">
      <p style="color:rgba(0,0,0,0.6);font-size:13px;margin-bottom:16px;">
        Map GitLab repository names to Confluence component names.
        These mappings are used to update the Confluence release page with MR links.
      </p>

      <div class="add-mapping">
        <mat-form-field appearance="outline">
          <mat-label>Repo Name</mat-label>
          <input matInput [(ngModel)]="newRepoName" placeholder="e.g., service-a">
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Component Name</mat-label>
          <input matInput [(ngModel)]="newComponentName" placeholder="e.g., Service A">
        </mat-form-field>
        <button mat-raised-button color="primary" (click)="addMapping()" [disabled]="!newRepoName || !newComponentName || savingMapping">
          <mat-spinner *ngIf="savingMapping" diameter="18" style="display:inline-block;margin-right:6px;"></mat-spinner>
          Add
        </button>
      </div>

      <div *ngIf="loadingMappings" style="text-align:center;padding:32px;">
        <mat-spinner diameter="32"></mat-spinner>
      </div>

      <div *ngIf="!loadingMappings && mappings.length === 0" class="empty-state">
        No mappings yet. Add your first mapping above.
      </div>

      <div *ngIf="!loadingMappings && mappings.length > 0">
        <div *ngFor="let mapping of mappings" class="mapping-row">
          <div class="repo-name">{{ mapping.repo }}</div>
          <div class="component-name">{{ mapping.component }}</div>
          <div class="action-buttons">
            <button mat-icon-button (click)="deleteMapping(mapping.repo)" [disabled]="deletingRepo === mapping.repo" matTooltip="Delete mapping">
              <mat-spinner *ngIf="deletingRepo === mapping.repo" diameter="18"></mat-spinner>
              <mat-icon *ngIf="deletingRepo !== mapping.repo">delete</mat-icon>
            </button>
          </div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onClose()">Close</button>
    </mat-dialog-actions>
  `
})
export class RepoMappingDialogComponent implements OnInit {
  mappings: Array<{ repo: string; component: string }> = [];
  loadingMappings = false;
  savingMapping = false;
  deletingRepo: string | null = null;

  newRepoName = '';
  newComponentName = '';

  constructor(
    private releaseService: ReleaseService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<RepoMappingDialogComponent>,
  ) {}

  ngOnInit(): void {
    this.loadMappings();
  }

  loadMappings(): void {
    this.loadingMappings = true;
    this.releaseService.getRepoMappings().subscribe({
      next: (mappings) => {
        this.mappings = Object.entries(mappings).map(([repo, component]) => ({
          repo,
          component: component as string,
        }));
        this.loadingMappings = false;
      },
      error: () => {
        this.loadingMappings = false;
        this.snackBar.open('Failed to load mappings.', 'Close', { duration: 3000 });
      },
    });
  }

  addMapping(): void {
    if (!this.newRepoName || !this.newComponentName) {
      return;
    }

    this.savingMapping = true;
    this.releaseService.setRepoMapping(this.newRepoName, this.newComponentName).subscribe({
      next: () => {
        this.mappings.push({ repo: this.newRepoName, component: this.newComponentName });
        this.newRepoName = '';
        this.newComponentName = '';
        this.savingMapping = false;
        this.snackBar.open(`✅ Mapping created: ${this.newRepoName} → ${this.newComponentName}`, 'Close', { duration: 3000 });
      },
      error: () => {
        this.savingMapping = false;
        this.snackBar.open('Failed to create mapping.', 'Close', { duration: 3000 });
      },
    });
  }

  deleteMapping(repoName: string): void {
    if (!confirm(`Delete mapping for "${repoName}"?`)) {
      return;
    }

    this.deletingRepo = repoName;
    this.releaseService.deleteRepoMapping(repoName).subscribe({
      next: () => {
        this.mappings = this.mappings.filter(m => m.repo !== repoName);
        this.deletingRepo = null;
        this.snackBar.open(`✅ Mapping deleted: ${repoName}`, 'Close', { duration: 3000 });
      },
      error: () => {
        this.deletingRepo = null;
        this.snackBar.open('Failed to delete mapping.', 'Close', { duration: 3000 });
      },
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
