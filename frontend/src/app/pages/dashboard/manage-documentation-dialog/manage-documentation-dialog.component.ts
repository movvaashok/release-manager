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
  selector: 'app-manage-documentation-dialog',
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
    .component-list {
      margin-bottom: 16px;
      background: #f9f9f9;
      padding: 12px;
      border-radius: 4px;
    }
    .component-list-header {
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 8px;
      color: rgba(0,0,0,0.7);
    }
    .component-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
  `],
  template: `
    <h2 mat-dialog-title style="display:flex;align-items:center;gap:8px;">
      <mat-icon>article</mat-icon>
      Manage Documentation
    </h2>

    <mat-dialog-content class="mapping-container">
      <p style="color:rgba(0,0,0,0.6);font-size:13px;margin-bottom:16px;">
        Configure component name mappings from the Pioneer release plan template.
        These mappings are used to update Confluence release pages with MR links.
      </p>

      <div style="margin-bottom:16px;">
        <button mat-raised-button
          (click)="fetchComponentsFromTemplate()"
          [disabled]="loadingComponents"
          style="width:100%;">
          <mat-spinner *ngIf="loadingComponents" diameter="18" style="display:inline-block;margin-right:6px;"></mat-spinner>
          Fetch Components from Template
        </button>
      </div>

      <div *ngIf="showComponentList && availableComponents.length > 0" class="component-list">
        <div class="component-list-header">
          📋 Available Components:
        </div>
        <div class="component-buttons">
          <button *ngFor="let component of availableComponents"
            mat-stroked-button
            (click)="selectComponentName(component)"
            style="font-size:12px;padding:6px 12px;">
            {{ component }}
          </button>
        </div>
      </div>

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
        No mappings configured. Add your first mapping above.
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
export class ManageDocumentationDialogComponent implements OnInit {
  mappings: Array<{ repo: string; component: string }> = [];
  loadingMappings = false;
  savingMapping = false;
  deletingRepo: string | null = null;
  loadingComponents = false;

  availableComponents: string[] = [];
  showComponentList = false;

  newRepoName = '';
  newComponentName = '';

  // Template page URL - will be fetched from Pioneer release plan template
  templatePageUrl = '';

  constructor(
    private releaseService: ReleaseService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<ManageDocumentationDialogComponent>,
  ) {}

  ngOnInit(): void {
    this.loadMappings();
  }

  loadMappings(): void {
    this.loadingMappings = true;
    this.releaseService.getRepoMappings().subscribe({
      next: (mappings) => {
        console.log('Loaded repo mappings:', mappings);
        if (mappings && typeof mappings === 'object') {
          this.mappings = Object.entries(mappings).map(([repo, component]) => ({
            repo,
            component: component as string,
          }));
        } else {
          this.mappings = [];
          console.warn('Unexpected mappings format:', mappings);
        }
        this.loadingMappings = false;
      },
      error: (error) => {
        this.loadingMappings = false;
        console.error('Failed to load mappings:', error);
        this.snackBar.open('Failed to load mappings. Check browser console for details.', 'Close', { duration: 3000 });
      },
    });
  }

  fetchComponentsFromTemplate(): void {
    this.loadingComponents = true;
    this.showComponentList = false;
    this.availableComponents = [];

    // Fetch components from template page
    this.releaseService.extractComponentsFromTemplatePageUrl().subscribe({
      next: (result) => {
        this.loadingComponents = false;

        if (result.success) {
          this.availableComponents = result.components || [];
          this.showComponentList = true;
          this.templatePageUrl = result.template_url || '';

          if (this.availableComponents.length === 0) {
            this.snackBar.open('No components found in template', 'Close', { duration: 3000 });
          } else {
            this.snackBar.open(
              `✅ Found ${this.availableComponents.length} components`,
              'Close',
              { duration: 3000 }
            );
          }
        } else {
          this.snackBar.open(
            `❌ ${result.error || result.message}`,
            'Close',
            { duration: 4000 }
          );
          console.error('Failed to extract components:', result);
        }
      },
      error: (error) => {
        this.loadingComponents = false;
        console.error('Failed to extract components:', error);
        this.snackBar.open('Failed to extract components. Check console.', 'Close', { duration: 4000 });
      },
    });
  }

  addMapping(): void {
    if (!this.newRepoName || !this.newComponentName) {
      return;
    }

    this.savingMapping = true;
    const repoName = this.newRepoName;
    const componentName = this.newComponentName;

    this.releaseService.setRepoMapping(repoName, componentName).subscribe({
      next: () => {
        this.mappings.push({ repo: repoName, component: componentName });
        this.newRepoName = '';
        this.newComponentName = '';
        this.savingMapping = false;
        this.snackBar.open(`✅ Mapping created: ${repoName} → ${componentName}`, 'Close', { duration: 3000 });
      },
      error: (error) => {
        this.savingMapping = false;
        console.error('Failed to create mapping:', error);
        this.snackBar.open('Failed to create mapping. Check browser console for details.', 'Close', { duration: 3000 });
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

  selectComponentName(component: string): void {
    this.newComponentName = component;
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
