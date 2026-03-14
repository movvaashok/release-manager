import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { ReleaseService } from '../../../core/services/release.service';
import { RepoReference } from '../../../core/models/release.model';

@Component({
  selector: 'app-manage-repos-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatIconModule, MatTableModule,
    MatTooltipModule, MatProgressSpinnerModule, MatDividerModule,
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
  `],
})
export class ManageReposDialogComponent implements OnInit {
  repos: RepoReference[] = [];
  displayedColumns = ['name', 'path', 'web_url', 'branches', 'actions'];
  loading = true;
  editingName: string | null = null;
  showAddForm = false;
  saving = false;
  errorMessage = '';

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

  close(): void { this.dialogRef.close(); }
}
