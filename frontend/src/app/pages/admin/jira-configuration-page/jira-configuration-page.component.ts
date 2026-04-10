import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';

import { ReleaseService } from '../../../core/services/release.service';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { Project } from '../../../core/models/release.model';

@Component({
  selector: 'app-jira-configuration-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatCardModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="goBack()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span class="toolbar-spacer"></span>
      <h1>Jira & Confluence Configuration</h1>
      <span class="toolbar-spacer"></span>
    </mat-toolbar>

    <div class="container">
      <!-- Admin only warning -->
      <mat-card class="admin-warning">
        <mat-card-content>
          <mat-icon>security</mat-icon>
          <p>This page allows you to configure project-specific Jira and Confluence base URLs. These settings are used globally for the selected project.</p>
        </mat-card-content>
      </mat-card>

      <div class="project-selector">
        <mat-form-field appearance="outline">
          <mat-label>Select Project</mat-label>
          <mat-select [(ngModel)]="selectedProjectId" (selectionChange)="onProjectChange()">
            <mat-option *ngFor="let project of availableProjects" [value]="project.id">
              {{ project.display_name }}
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="content">
        <div *ngIf="loading" style="text-align:center;padding:32px;">
          <mat-spinner diameter="32"></mat-spinner>
        </div>

        <ng-container *ngIf="!loading">
          <!-- Jira Configuration -->
          <mat-card class="config-card">
            <mat-card-header>
              <div mat-card-avatar class="card-icon">
                <mat-icon>bug_report</mat-icon>
              </div>
              <mat-card-title>Jira Configuration</mat-card-title>
              <mat-card-subtitle>Configure Jira base URL for {{ currentProject?.display_name }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="jiraForm">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Jira Base URL</mat-label>
                  <input matInput formControlName="jira_base_url" placeholder="https://jira.example.com" />
                  <mat-hint>Base URL for Jira API calls (e.g., https://jira.example.com)</mat-hint>
                </mat-form-field>
              </form>
            </mat-card-content>
            <mat-card-actions>
              <button mat-raised-button color="primary" [disabled]="jiraForm.invalid || savingJira" (click)="saveJiraConfig()">
                <mat-spinner *ngIf="savingJira" diameter="16" style="display:inline-block;margin-right:6px;"></mat-spinner>
                Save Jira Config
              </button>
            </mat-card-actions>
          </mat-card>

          <!-- Confluence Configuration -->
          <mat-card class="config-card">
            <mat-card-header>
              <div mat-card-avatar class="card-icon">
                <mat-icon>article</mat-icon>
              </div>
              <mat-card-title>Confluence Configuration</mat-card-title>
              <mat-card-subtitle>Configure Confluence base URL for {{ currentProject?.display_name }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="confluenceForm">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Confluence Base URL</mat-label>
                  <input matInput formControlName="confluence_base_url" placeholder="https://confluence.example.com" />
                  <mat-hint>Base URL for Confluence API calls (e.g., https://confluence.example.com)</mat-hint>
                </mat-form-field>
              </form>
            </mat-card-content>
            <mat-card-actions>
              <button mat-raised-button color="primary" [disabled]="confluenceForm.invalid || savingConfluence" (click)="saveConfluenceConfig()">
                <mat-spinner *ngIf="savingConfluence" diameter="16" style="display:inline-block;margin-right:6px;"></mat-spinner>
                Save Confluence Config
              </button>
            </mat-card-actions>
          </mat-card>

          <div *ngIf="errorMessage" class="error-msg">{{ errorMessage }}</div>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    mat-toolbar {
      display: flex;
      align-items: center;
      margin-bottom: 24px;
    }

    .toolbar-spacer {
      flex: 1 1 auto;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 24px;
    }

    .admin-warning {
      margin-bottom: 24px;
      background: #e3f2fd;
      border-left: 4px solid #1565c0;
    }

    .admin-warning mat-card-content {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      padding: 16px !important;
    }

    .admin-warning mat-icon {
      color: #1565c0;
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .admin-warning p {
      margin: 0;
      color: rgba(0,0,0,0.7);
      font-size: 13px;
      line-height: 1.5;
    }

    .project-selector {
      margin-bottom: 24px;
    }

    .project-selector mat-form-field {
      width: 300px;
    }

    .content {
      background: #f9f9f9;
      padding: 24px;
      border-radius: 4px;
    }

    .config-card {
      margin-bottom: 24px;
      border-radius: 8px;
    }

    .config-card mat-card-header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .card-icon {
      background: #f5f5f5;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .card-icon mat-icon {
      color: #1565c0;
    }

    .full-width {
      width: 100%;
    }

    mat-card-actions {
      display: flex;
      justify-content: flex-end;
      padding: 16px !important;
    }

    .error-msg {
      color: #c62828;
      font-size: 13px;
      margin-top: 16px;
      padding: 12px;
      background: #ffebee;
      border-radius: 4px;
    }
  `]
})
export class JiraConfigurationPageComponent implements OnInit {
  jiraForm: FormGroup;
  confluenceForm: FormGroup;

  selectedProjectId: string = '';
  availableProjects: Project[] = [];
  currentProject: Project | null = null;

  loading = true;
  savingJira = false;
  savingConfluence = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private releaseService: ReleaseService,
    private projectService: ProjectService,
    private auth: AuthService,
    private snackBar: MatSnackBar,
    private router: Router,
  ) {
    this.jiraForm = this.fb.group({
      jira_base_url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    });
    this.confluenceForm = this.fb.group({
      confluence_base_url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    });
  }

  ngOnInit(): void {
    // Check if user is admin
    if (!this.auth.isAdmin()) {
      this.router.navigate(['/releases']);
      return;
    }

    this.availableProjects = this.projectService.projects;
    this.selectedProjectId = this.projectService.currentId;
    this.onProjectChange();
  }

  onProjectChange(): void {
    const project = this.projectService.projects.find(p => p.id === this.selectedProjectId);
    if (project) {
      this.projectService.setProject(project);
      this.currentProject = project;
      this.loadProjectConfig();
    }
  }

  goBack(): void {
    this.router.navigate(['/releases']);
  }

  loadProjectConfig(): void {
    this.loading = true;
    this.releaseService.getProjectConfiguration(this.selectedProjectId).subscribe({
      next: (project: any) => {
        this.jiraForm.patchValue({
          jira_base_url: project.jira_base_url || 'https://jira.example.com',
        });
        this.confluenceForm.patchValue({
          confluence_base_url: project.confluence_base_url || 'https://confluence.example.com',
        });
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        console.error('Failed to load project config:', err);
        // Set default values on error
        this.jiraForm.patchValue({
          jira_base_url: 'https://jira.example.com',
        });
        this.confluenceForm.patchValue({
          confluence_base_url: 'https://confluence.example.com',
        });
      }
    });
  }

  saveJiraConfig(): void {
    if (this.jiraForm.invalid) return;

    this.savingJira = true;
    const payload = {
      jira_base_url: this.jiraForm.get('jira_base_url')?.value,
    };

    this.releaseService.updateProjectConfiguration(this.selectedProjectId, payload).subscribe({
      next: () => {
        this.savingJira = false;
        this.snackBar.open('✅ Jira configuration saved', 'Close', { duration: 3000 });
      },
      error: (err: any) => {
        this.savingJira = false;
        this.errorMessage = err?.error?.detail || 'Failed to save Jira configuration';
        this.snackBar.open('❌ Failed to save configuration', 'Close', { duration: 4000 });
      }
    });
  }

  saveConfluenceConfig(): void {
    if (this.confluenceForm.invalid) return;

    this.savingConfluence = true;
    const payload = {
      confluence_base_url: this.confluenceForm.get('confluence_base_url')?.value,
    };

    this.releaseService.updateProjectConfiguration(this.selectedProjectId, payload).subscribe({
      next: () => {
        this.savingConfluence = false;
        this.snackBar.open('✅ Confluence configuration saved', 'Close', { duration: 3000 });
      },
      error: (err: any) => {
        this.savingConfluence = false;
        this.errorMessage = err?.error?.detail || 'Failed to save Confluence configuration';
        this.snackBar.open('❌ Failed to save configuration', 'Close', { duration: 4000 });
      }
    });
  }
}
