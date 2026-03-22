import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { ReleaseService } from '../../../core/services/release.service';
import { GitLabProjectInfo, RepoReference } from '../../../core/models/release.model';

@Component({
  selector: 'app-manage-repos-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatIconModule, MatTableModule,
    MatTooltipModule, MatProgressSpinnerModule, MatDividerModule, MatSelectModule,
  ],
  templateUrl: './manage-repos-dialog.component.html',
  styles: [`
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
    /* Repos list — CSS grid keeps header & rows perfectly aligned */
    :host { --col-name: 160px; --col-path: minmax(0,1fr); --col-branch: 110px; --col-config: 120px; --col-actions: 80px; }
    .repo-grid-row {
      display: grid;
      grid-template-columns: var(--col-name) var(--col-path) var(--col-branch) var(--col-branch) var(--col-config) var(--col-actions);
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

    /* GitLab browser */
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
  `],
})
export class ManageReposDialogComponent implements OnInit {
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

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<ManageReposDialogComponent>,
    private releaseService: ReleaseService
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
    this.loadRepos();
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

  // ── GitLab browser ──────────────────────────────────────────────

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

  close(): void { this.dialogRef.close(); }
}
