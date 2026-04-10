import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';

import { ReleaseService } from '../../../core/services/release.service';
import { ProjectService } from '../../../core/services/project.service';
import { GitLabProjectInfo, RepoReference, Project } from '../../../core/models/release.model';

@Component({
  selector: 'app-manage-repositories-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatIconModule, MatTableModule,
    MatTooltipModule, MatProgressSpinnerModule, MatDividerModule, MatSelectModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="goBack()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span class="toolbar-spacer"></span>
      <h1>Manage Repositories</h1>
      <span class="toolbar-spacer"></span>
    </mat-toolbar>

    <div class="container">
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
        <div *ngIf="loading" style="text-align:center;padding:24px;"><mat-spinner diameter="32"></mat-spinner></div>

        <ng-container *ngIf="!loading">
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;">
            <button mat-stroked-button (click)="fetchGitLabRepos()" [disabled]="loadingGitlab">
              <mat-icon>cloud_download</mat-icon> Browse GitLab Repos
            </button>
            <button mat-raised-button color="primary" (click)="showAddForm=!showAddForm; editingName=null">
              <mat-icon>add</mat-icon> Add Repository
            </button>
          </div>

          <!-- Add form -->
          <div *ngIf="showAddForm" class="edit-form" style="margin-bottom:16px;">
            <div class="section-title">New Repository</div>
            <form [formGroup]="addForm">
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Name</mat-label>
                  <input matInput formControlName="name" placeholder="my-service" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Project ID</mat-label>
                  <input matInput type="number" formControlName="project_id" />
                </mat-form-field>
              </div>
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Path with namespace</mat-label>
                  <input matInput formControlName="path_with_namespace" placeholder="myorg/my-service" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Web URL</mat-label>
                  <input matInput formControlName="web_url" placeholder="https://gitlab.com/myorg/my-service" />
                </mat-form-field>
              </div>
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Default Branch</mat-label>
                  <input matInput formControlName="default_branch" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Develop Branch</mat-label>
                  <input matInput formControlName="develop_branch" />
                </mat-form-field>
              </div>
              <div class="form-actions">
                <button mat-button (click)="showAddForm=false">Cancel</button>
                <button mat-raised-button color="primary" [disabled]="addForm.invalid || saving" (click)="addRepo()">
                  <mat-spinner *ngIf="saving" diameter="16" style="display:inline-block;margin-right:6px;"></mat-spinner>
                  Save
                </button>
              </div>
            </form>
          </div>

          <!-- Repos list header -->
          <div *ngIf="repos.length > 0" class="repo-list-header repo-grid-row">
            <span class="col">Name</span>
            <span class="col">Default</span>
            <span class="col">Develop</span>
            <span class="col">Config Repo</span>
            <span class="col-actions"></span>
          </div>

          <!-- Repos list -->
          <div *ngFor="let r of sortedRepos" class="repo-list-item-wrapper" [class.is-config-repo]="isConfigRepo(r.name)">
            <!-- Main row -->
            <div class="repo-list-row repo-grid-row">
              <span class="col" style="display:flex;align-items:center;gap:6px;overflow:hidden;">
                <a class="repo-name-link" [href]="r.web_url" target="_blank" rel="noopener" [title]="r.path_with_namespace"
                   style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  {{ toTitleCase(r.name) }}
                </a>
                <span *ngIf="isConfigRepo(r.name)" class="config-repo-self-badge">
                  <mat-icon style="font-size:11px;width:11px;height:11px;">settings</mat-icon> Config
                </span>
              </span>
              <span class="col" style="color:rgba(0,0,0,0.65);" [title]="r.default_branch">{{ r.default_branch }}</span>
              <span class="col" style="color:rgba(0,0,0,0.65);" [title]="r.develop_branch">{{ r.develop_branch }}</span>
              <span class="col">
                <span *ngIf="r.config_repo" class="config-repo-badge" [title]="r.config_repo">
                  <mat-icon style="font-size:13px;width:13px;height:13px;vertical-align:middle;margin-right:3px;">link</mat-icon>
                  {{ toTitleCase(r.config_repo) }}
                </span>
              </span>
              <span class="col-actions">
                <button mat-icon-button (click)="startEdit(r)" matTooltip="Edit"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button color="warn" (click)="deleteRepo(r.name)" matTooltip="Delete"><mat-icon>delete</mat-icon></button>
              </span>
            </div>

            <!-- Inline edit form -->
            <div *ngIf="editingName === r.name" class="edit-form" style="margin:4px 0 8px 0;">
              <div class="section-title">Edit: {{ r.name }}</div>
              <form [formGroup]="editForm">
                <div class="form-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Project ID</mat-label>
                    <input matInput type="number" formControlName="project_id" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Path with namespace</mat-label>
                    <input matInput formControlName="path_with_namespace" />
                  </mat-form-field>
                </div>
                <div class="form-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Web URL</mat-label>
                    <input matInput formControlName="web_url" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Default Branch</mat-label>
                    <input matInput formControlName="default_branch" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Develop Branch</mat-label>
                    <input matInput formControlName="develop_branch" />
                  </mat-form-field>
                </div>
                <div class="form-row">
                  <mat-form-field appearance="outline" style="min-width:260px;">
                    <mat-label>Config Repo (optional)</mat-label>
                    <mat-select formControlName="config_repo">
                      <mat-option [value]="null">— None —</mat-option>
                      <mat-option *ngFor="let other of otherRepos(r.name)" [value]="other.name">
                        {{ other.name }}
                      </mat-option>
                    </mat-select>
                    <mat-hint>Link a config repository that should be updated alongside this repo</mat-hint>
                  </mat-form-field>
                </div>
                <div class="form-actions">
                  <button mat-button (click)="cancelEdit()">Cancel</button>
                  <button mat-raised-button color="primary" [disabled]="editForm.invalid || saving" (click)="saveEdit(r.name)">
                    <mat-spinner *ngIf="saving" diameter="16" style="display:inline-block;margin-right:6px;"></mat-spinner>
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div *ngIf="repos.length === 0" style="text-align:center;color:rgba(0,0,0,0.4);padding:24px;">
            No repositories configured yet.
          </div>

          <div *ngIf="errorMessage" class="error-msg">{{ errorMessage }}</div>

          <!-- ── GitLab Browser ── -->
          <div *ngIf="showGitlabBrowser" class="gitlab-browser">
            <div class="gitlab-browser-header">
              <mat-icon style="color:#fc6d26; font-size:18px; width:18px; height:18px;">cloud</mat-icon>
              <span class="title">GitLab Repositories</span>
              <span *ngIf="!loadingGitlab && !gitlabError" style="font-size:12px; color:rgba(0,0,0,0.45);">
                {{ gitlabRepos.length }} repos · direct members only, archived excluded
              </span>
              <button mat-icon-button (click)="closeGitlabBrowser()" matTooltip="Close">
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <!-- Loading -->
            <div *ngIf="loadingGitlab" style="padding:32px; text-align:center;">
              <mat-spinner diameter="32"></mat-spinner>
              <p style="margin-top:10px; font-size:13px; color:rgba(0,0,0,0.5);">Fetching GitLab repos…</p>
            </div>

            <!-- Error -->
            <div *ngIf="gitlabError" style="padding:16px; color:#c62828; font-size:13px;">{{ gitlabError }}</div>

            <!-- Repo list -->
            <ng-container *ngIf="!loadingGitlab && !gitlabError">
              <div class="gl-search">
                <input [(ngModel)]="gitlabFilter" placeholder="Search repositories…" />
              </div>

              <div class="gl-repo-list">
                <div *ngIf="filteredGitlabRepos.length === 0" class="gl-empty">No repositories match your search.</div>

                <div *ngFor="let gl of filteredGitlabRepos" class="gl-repo-row">
                  <div class="gl-repo-info">
                    <div class="gl-repo-name">{{ gl.name }}</div>
                    <div class="gl-repo-path">{{ gl.path_with_namespace }}</div>
                  </div>

                  <!-- Already in registry -->
                  <ng-container *ngIf="isInRegistry(gl.id)">
                    <span class="in-registry-badge">
                      <mat-icon style="font-size:13px; width:13px; height:13px;">check_circle</mat-icon>
                      In Registry
                    </span>
                    <button mat-icon-button color="warn" (click)="deleteFromGitlab(gl.id)" matTooltip="Remove from registry">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </ng-container>

                  <!-- Not yet in registry -->
                  <ng-container *ngIf="!isInRegistry(gl.id)">
                    <button mat-stroked-button style="font-size:12px; height:30px; line-height:30px;"
                      [disabled]="addingFromGitlab.has(gl.id)"
                      (click)="quickAddFromGitlab(gl)">
                      <mat-spinner *ngIf="addingFromGitlab.has(gl.id)" diameter="14" style="display:inline-block; margin-right:4px;"></mat-spinner>
                      <mat-icon *ngIf="!addingFromGitlab.has(gl.id)" style="font-size:16px; width:16px; height:16px; margin-right:4px;">add</mat-icon>
                      Add
                    </button>
                  </ng-container>
                </div>
              </div>
            </ng-container>
          </div>

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
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px;
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

    .section-title { font-size: 14px; font-weight: 500; margin-bottom: 12px; color: rgba(0,0,0,0.7); }
    .repo-table { width: 100%; }
    .link-cell a { color: #1565c0; text-decoration: none; }
    .link-cell a:hover { text-decoration: underline; }
    .error-msg { color: #c62828; font-size: 13px; margin-top: 8px; }
    .edit-form { background: #f5f7ff; border-radius: 8px; padding: 16px; margin: 8px 0; }
    .form-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .form-row mat-form-field { flex: 1; min-width: 180px; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
    .config-repo-badge {
      display: inline-flex; align-items: center;
      background: #e8f0fe; color: #1565c0;
      border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 500;
    }
    .repo-grid-row {
      display: grid;
      grid-template-columns: minmax(0,1fr) 110px 110px 160px 80px;
      align-items: center;
      gap: 0;
    }
    .repo-list-header {
      padding: 7px 0;
      background: #f5f5f5; border-radius: 6px 6px 0 0;
      border: 1px solid #e0e0e0; border-bottom: none;
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.04em; color: rgba(0,0,0,0.5);
    }
    .repo-list-header .col { padding: 0 10px; }
    .repo-list-header .col-actions { padding: 0; }
    .repo-list-item-wrapper {
      border-left: 1px solid #e0e0e0;
      border-right: 1px solid #e0e0e0;
      border-bottom: 1px solid #f0f0f0;
    }
    .repo-list-item-wrapper:last-child {
      border-bottom: 1px solid #e0e0e0;
      border-radius: 0 0 6px 6px;
    }
    .repo-list-row { padding: 9px 0; background: #fff; }
    .repo-list-row:hover { background: #fafafa; }
    .repo-list-row .col {
      padding: 0 10px; font-size: 13px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .repo-list-row .col-actions { padding: 0; display: flex; align-items: center; justify-content: flex-end; padding-right: 4px; }
    .repo-name-link { color: #1565c0; text-decoration: none; font-weight: 600; font-size: 13px; }
    .repo-name-link:hover { text-decoration: underline; }
    .repo-list-item-wrapper.is-config-repo { border-left: 3px solid #7c4dff; }
    .repo-list-item-wrapper.is-config-repo .repo-list-row { background: #f5f0ff; }
    .repo-list-item-wrapper.is-config-repo .repo-list-row:hover { background: #ede7f6; }
    .config-repo-self-badge {
      display: inline-flex; align-items: center; gap: 3px;
      background: #ede7f6; color: #5e35b1;
      border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 600; margin-left: 6px;
    }
    .gitlab-browser { margin-top: 20px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
    .gitlab-browser-header {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      background: #f5f7ff; border-bottom: 1px solid #e0e0e0;
    }
    .gitlab-browser-header .title { font-size: 13px; font-weight: 600; color: #1565c0; flex: 1; }
    .gl-search { width: 100%; padding: 10px 14px; border-bottom: 1px solid #e0e0e0; }
    .gl-search input {
      width: 100%; border: 1px solid #ddd; border-radius: 6px;
      padding: 6px 10px; font-size: 13px; outline: none; box-sizing: border-box;
    }
    .gl-search input:focus { border-color: #1565c0; }
    .gl-repo-list { max-height: 340px; overflow-y: auto; }
    .gl-repo-row {
      display: flex; align-items: center; padding: 8px 14px;
      border-bottom: 1px solid #f5f5f5; gap: 10px;
    }
    .gl-repo-row:last-child { border-bottom: none; }
    .gl-repo-info { flex: 1; min-width: 0; }
    .gl-repo-name { font-size: 13px; font-weight: 600; color: rgba(0,0,0,0.85); }
    .gl-repo-path { font-size: 12px; color: rgba(0,0,0,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .in-registry-badge {
      display: inline-flex; align-items: center; gap: 3px;
      background: #e8f5e9; color: #2e7d32;
      border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 600; flex-shrink: 0;
    }
    .gl-empty { padding: 24px; text-align: center; color: rgba(0,0,0,0.4); font-size: 13px; }
  `]
})
export class ManageRepositoriesPageComponent implements OnInit {
  repos: RepoReference[] = [];
  displayedColumns = ['name', 'path', 'branches', 'config_repo', 'actions'];
  loading = true;
  editingName: string | null = null;
  showAddForm = false;
  saving = false;
  errorMessage = '';

  // GitLab browser state
  showGitlabBrowser = false;
  gitlabRepos: GitLabProjectInfo[] = [];
  gitlabFilter = '';
  loadingGitlab = false;
  gitlabError = '';
  addingFromGitlab: Set<number> = new Set();

  editForm: FormGroup;
  addForm: FormGroup;

  selectedProjectId: string = '';
  availableProjects: Project[] = [];

  constructor(
    private fb: FormBuilder,
    private releaseService: ReleaseService,
    private projectService: ProjectService,
    private router: Router,
  ) {
    this.editForm = this.fb.group({
      project_id: [null, Validators.required],
      path_with_namespace: ['', Validators.required],
      web_url: ['', Validators.required],
      default_branch: ['master', Validators.required],
      develop_branch: ['develop', Validators.required],
      config_repo: [null],
    });
    this.addForm = this.fb.group({
      name: ['', Validators.required],
      project_id: [null, [Validators.required, Validators.min(1)]],
      path_with_namespace: ['', Validators.required],
      web_url: ['', Validators.required],
      default_branch: ['master', Validators.required],
      develop_branch: ['develop', Validators.required],
    });
  }

  ngOnInit(): void {
    this.availableProjects = this.projectService.projects;
    this.selectedProjectId = this.projectService.currentId;
    this.loadRepos();
  }

  onProjectChange(): void {
    this.projectService.setProject(this.projectService.projects.find(p => p.id === this.selectedProjectId)!);
    this.loadRepos();
  }

  goBack(): void {
    this.router.navigate(['/releases']);
  }

  loadRepos(): void {
    this.releaseService.getReferences().subscribe({
      next: (repos) => { this.repos = repos; this.loading = false; },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load repositories.'; },
    });
  }

  startEdit(repo: RepoReference): void {
    this.editingName = repo.name;
    this.showAddForm = false;
    this.editForm.patchValue({
      project_id: repo.project_id,
      path_with_namespace: repo.path_with_namespace,
      web_url: repo.web_url,
      default_branch: repo.default_branch,
      develop_branch: repo.develop_branch,
      config_repo: repo.config_repo ?? null,
    });
  }

  saveEdit(name: string): void {
    if (this.editForm.invalid) return;
    this.saving = true;
    this.releaseService.updateReferenceRepo(name, this.editForm.value).subscribe({
      next: (repos) => { this.repos = repos; this.editingName = null; this.saving = false; },
      error: (err: any) => { this.saving = false; this.errorMessage = err?.error?.detail ?? 'Update failed.'; },
    });
  }

  cancelEdit(): void { this.editingName = null; }

  otherRepos(currentName: string): RepoReference[] {
    return this.repos.filter(r => r.name !== currentName);
  }

  deleteRepo(name: string): void {
    if (!confirm(`Delete repository "${name}"?`)) return;
    this.releaseService.deleteReferenceRepo(name).subscribe({
      next: (repos) => { this.repos = repos; },
      error: (err: any) => { this.errorMessage = err?.error?.detail ?? 'Delete failed.'; },
    });
  }

  addRepo(): void {
    if (this.addForm.invalid) return;
    this.saving = true;
    this.releaseService.addReferenceRepo(this.addForm.value).subscribe({
      next: (repos) => {
        this.repos = repos;
        this.addForm.reset({ default_branch: 'master', develop_branch: 'develop' });
        this.showAddForm = false;
        this.saving = false;
      },
      error: (err: any) => { this.saving = false; this.errorMessage = err?.error?.detail ?? 'Add failed.'; },
    });
  }

  fetchGitLabRepos(): void {
    this.showGitlabBrowser = true;
    this.loadingGitlab = true;
    this.gitlabError = '';
    this.gitlabFilter = '';
    this.releaseService.listGitLabRepos().subscribe({
      next: (repos) => { this.gitlabRepos = repos; this.loadingGitlab = false; },
      error: (err: any) => {
        this.loadingGitlab = false;
        this.gitlabError = err?.error?.detail ?? 'Failed to fetch GitLab repos.';
      },
    });
  }

  closeGitlabBrowser(): void {
    this.showGitlabBrowser = false;
    this.gitlabRepos = [];
    this.gitlabFilter = '';
    this.gitlabError = '';
  }

  get filteredGitlabRepos(): GitLabProjectInfo[] {
    const q = this.gitlabFilter.trim().toLowerCase();
    if (!q) return this.gitlabRepos;
    return this.gitlabRepos.filter(r =>
      r.name.toLowerCase().includes(q) || r.path_with_namespace.toLowerCase().includes(q)
    );
  }

  isInRegistry(glProjectId: number): boolean {
    return this.repos.some(r => r.project_id === glProjectId);
  }

  registryNameFor(glProjectId: number): string {
    return this.repos.find(r => r.project_id === glProjectId)?.name ?? '';
  }

  quickAddFromGitlab(gl: GitLabProjectInfo): void {
    if (this.addingFromGitlab.has(gl.id)) return;
    const name = gl.path_with_namespace.split('/').pop() ?? gl.name;
    const payload = {
      name,
      project_id: gl.id,
      path_with_namespace: gl.path_with_namespace,
      web_url: gl.web_url,
      default_branch: gl.default_branch || 'master',
      develop_branch: 'develop',
    };
    this.addingFromGitlab.add(gl.id);
    this.releaseService.addReferenceRepo(payload).subscribe({
      next: (repos) => { this.repos = repos; this.addingFromGitlab.delete(gl.id); },
      error: (err: any) => {
        this.addingFromGitlab.delete(gl.id);
        this.errorMessage = err?.error?.detail ?? 'Add failed.';
      },
    });
  }

  deleteFromGitlab(glProjectId: number): void {
    const name = this.registryNameFor(glProjectId);
    if (!name) return;
    if (!confirm(`Remove "${name}" from the registry?`)) return;
    this.releaseService.deleteReferenceRepo(name).subscribe({
      next: (repos) => { this.repos = repos; },
      error: (err: any) => { this.errorMessage = err?.error?.detail ?? 'Delete failed.'; },
    });
  }

  isConfigRepo(name: string): boolean {
    return /[-_]?config$/i.test(name);
  }

  get sortedRepos(): RepoReference[] {
    return [...this.repos].sort((a, b) => {
      const ac = this.isConfigRepo(a.name) ? 1 : 0;
      const bc = this.isConfigRepo(b.name) ? 1 : 0;
      return ac - bc || a.name.localeCompare(b.name);
    });
  }

  toTitleCase(name: string): string {
    return name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
