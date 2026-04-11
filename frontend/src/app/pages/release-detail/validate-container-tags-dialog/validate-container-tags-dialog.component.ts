import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { ReleaseService } from '../../../core/services/release.service';

@Component({
  selector: 'app-validate-container-tags-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatCardModule,
  ],
  template: `
    <div class="dialog-container">
      <h2 mat-dialog-title>Validate Release Container Tags</h2>

      <mat-dialog-content>
        <div *ngIf="loading" style="text-align: center; padding: 32px;">
          <mat-spinner diameter="32"></mat-spinner>
          <p style="margin-top: 16px;">Fetching container registry tags...</p>
        </div>

        <div *ngIf="!loading && !errorMessage">
          <div class="gitlab-token-input" *ngIf="!gitlabTokenProvided">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>GitLab Token (optional)</mat-label>
              <input matInput type="password" [(ngModel)]="gitlabToken" placeholder="Leave empty for public registries" />
              <mat-hint>Provide a token to access private container registries</mat-hint>
            </mat-form-field>
            <button mat-raised-button color="primary" (click)="loadValidationData()">
              <mat-icon>refresh</mat-icon> Validate Tags
            </button>
          </div>

          <div *ngIf="validationData" class="validation-content">
            <mat-card class="info-card">
              <mat-card-content>
                <p><strong>Release Version:</strong> {{ validationData.version }}</p>
                <p><strong>Status:</strong>
                  <span *ngIf="validationData.all_match" style="color: green;">✓ All tags match</span>
                  <span *ngIf="!validationData.all_match" style="color: red;">✗ Some tags differ</span>
                </p>
              </mat-card-content>
            </mat-card>

            <h3 style="margin-top: 24px;">Repository Tags</h3>
            <div class="table-container">
              <table mat-table [dataSource]="validationData.repositories" class="full-width">
                <!-- Service Name Column -->
                <ng-container matColumnDef="service">
                  <th mat-header-cell *matHeaderCellDef>Service</th>
                  <td mat-cell *matCellDef="let element">{{ element.service_name }}</td>
                </ng-container>

                <!-- GitLab Tag Column -->
                <ng-container matColumnDef="gitlab">
                  <th mat-header-cell *matHeaderCellDef>GitLab Tag</th>
                  <td mat-cell *matCellDef="let element">
                    <span *ngIf="element.gitlab_tag" class="tag-badge gitlab-tag">
                      {{ element.gitlab_tag }}
                    </span>
                    <span *ngIf="!element.gitlab_tag" style="color: #999;">Not found</span>
                  </td>
                </ng-container>

                <!-- Confluence Tag Column -->
                <ng-container matColumnDef="confluence">
                  <th mat-header-cell *matHeaderCellDef>Confluence Tag</th>
                  <td mat-cell *matCellDef="let element">
                    <span *ngIf="element.confluence_tag" class="tag-badge confluence-tag">
                      {{ element.confluence_tag }}
                    </span>
                    <span *ngIf="!element.confluence_tag" style="color: #999;">Not found</span>
                  </td>
                </ng-container>

                <!-- Status Column -->
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Match</th>
                  <td mat-cell *matCellDef="let element">
                    <span *ngIf="element.matches" style="color: green;">✓</span>
                    <span *ngIf="!element.matches && (element.gitlab_tag || element.confluence_tag)" style="color: red;">✗</span>
                    <span *ngIf="!element.matches && !element.gitlab_tag && !element.confluence_tag" style="color: #999;">—</span>
                  </td>
                </ng-container>

                <!-- Link Column -->
                <ng-container matColumnDef="link">
                  <th mat-header-cell *matHeaderCellDef>Links</th>
                  <td mat-cell *matCellDef="let element">
                    <a *ngIf="element.gitlab_link" [href]="element.gitlab_link" target="_blank" mat-icon-button matTooltip="View in GitLab Registry">
                      <mat-icon>open_in_new</mat-icon>
                    </a>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>

            <div class="action-buttons" *ngIf="!validationData.all_match && validationData.can_update">
              <p style="color: #d32f2f; font-weight: 500; margin-bottom: 16px;">
                Some tags differ. Update Confluence with latest tags?
              </p>
              <button mat-raised-button color="accent" (click)="updateTags()" [disabled]="updating">
                <mat-spinner *ngIf="updating" diameter="16" style="display: inline-block; margin-right: 6px;"></mat-spinner>
                Update Confluence
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="errorMessage" class="error-message">
          <mat-icon>error</mat-icon>
          <p>{{ errorMessage }}</p>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions>
        <button mat-button (click)="dialogRef.close()">Close</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-container {
      min-width: 600px;
      max-width: 900px;
    }

    mat-dialog-content {
      padding: 24px;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid #e0e0e0;
    }

    .full-width {
      width: 100%;
    }

    .gitlab-token-input {
      display: flex;
      gap: 16px;
      align-items: flex-end;
      margin-bottom: 24px;
    }

    .gitlab-token-input mat-form-field {
      flex: 1;
    }

    .gitlab-token-input button {
      height: 56px;
    }

    .info-card {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
    }

    .info-card mat-card-content {
      padding: 16px;
    }

    .info-card p {
      margin: 8px 0;
      font-size: 14px;
    }

    .table-container {
      overflow-x: auto;
      margin: 16px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      background: #f5f5f5;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 1px solid #e0e0e0;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
    }

    .tag-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      font-weight: 500;
    }

    .gitlab-tag {
      background: #bbdefb;
      color: #1565c0;
    }

    .confluence-tag {
      background: #c8e6c9;
      color: #2e7d32;
    }

    .action-buttons {
      margin-top: 24px;
      padding: 16px;
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      border-radius: 4px;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #ffebee;
      border-left: 4px solid #c62828;
      border-radius: 4px;
      color: #c62828;
    }

    .error-message mat-icon {
      flex-shrink: 0;
    }

    .error-message p {
      margin: 0;
    }

    h3 {
      margin-top: 24px;
      margin-bottom: 12px;
      font-size: 16px;
    }
  `]
})
export class ValidateContainerTagsDialogComponent implements OnInit {
  loading = true;
  updating = false;
  errorMessage = '';
  gitlabToken = '';
  gitlabTokenProvided = false;
  validationData: any = null;
  displayedColumns = ['service', 'gitlab', 'confluence', 'status', 'link'];

  constructor(
    public dialogRef: MatDialogRef<ValidateContainerTagsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private releaseService: ReleaseService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    // If GitLab token is available in the browser, use it
    const storedToken = localStorage.getItem('gitlab_token');
    if (storedToken) {
      this.gitlabToken = storedToken;
      this.gitlabTokenProvided = true;
      this.loadValidationData();
    } else {
      this.loading = false;
    }
  }

  loadValidationData(): void {
    if (!this.gitlabToken) {
      this.errorMessage = 'GitLab token is required to fetch container registry tags.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.gitlabTokenProvided = true;

    this.releaseService.validateContainerTags(this.data.version, this.gitlabToken).subscribe({
      next: (data) => {
        this.validationData = data;
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMessage = err?.error?.detail || 'Failed to validate container tags. Check your GitLab token.';
      }
    });
  }

  updateTags(): void {
    this.updating = true;
    this.releaseService.updateContainerTagsInConfluence(this.data.version).subscribe({
      next: () => {
        this.updating = false;
        this.snackBar.open('Confluence updated with latest container tags', 'Close', { duration: 3000 });
        // Reload validation data to show updated status
        this.loadValidationData();
      },
      error: (err: any) => {
        this.updating = false;
        this.errorMessage = err?.error?.detail || 'Failed to update Confluence page';
        this.snackBar.open('Failed to update Confluence', 'Close', { duration: 4000 });
      }
    });
  }
}
