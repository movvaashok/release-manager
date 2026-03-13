import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { ReleaseService } from '../../../core/services/release.service';
import { RepoReference } from '../../../core/models/release.model';

@Component({
  selector: 'app-create-release-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatDividerModule,
  ],
  templateUrl: './create-release-dialog.component.html',
})
export class CreateReleaseDialogComponent implements OnInit {
  form: FormGroup;
  repos: RepoReference[] = [];
  selectedRepos = new Set<string>();
  loadingRepos = true;
  submitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateReleaseDialogComponent>,
    private releaseService: ReleaseService
  ) {
    this.form = this.fb.group({
      version: ['', [Validators.required, Validators.pattern(/^\d+\.\d+\.\d+$/)]],
    });
  }

  ngOnInit(): void {
    this.releaseService.getReferences().subscribe({
      next: (repos) => {
        this.repos = repos;
        this.loadingRepos = false;
      },
      error: () => {
        this.loadingRepos = false;
        this.errorMessage = 'Failed to load repositories.';
      },
    });
  }

  toggleRepo(name: string): void {
    if (this.selectedRepos.has(name)) {
      this.selectedRepos.delete(name);
    } else {
      this.selectedRepos.add(name);
    }
  }

  toggleAll(): void {
    if (this.selectedRepos.size === this.repos.length) {
      this.selectedRepos.clear();
    } else {
      this.repos.forEach(r => this.selectedRepos.add(r.name));
    }
  }

  get allSelected(): boolean {
    return this.repos.length > 0 && this.selectedRepos.size === this.repos.length;
  }

  get someSelected(): boolean {
    return this.selectedRepos.size > 0 && !this.allSelected;
  }

  get canSubmit(): boolean {
    return this.form.valid && this.selectedRepos.size > 0 && !this.submitting;
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitting = true;
    this.errorMessage = '';

    const req = {
      version: this.form.value.version,
      repo_names: Array.from(this.selectedRepos),
    };

    this.releaseService.createRelease(req).subscribe({
      next: (state) => this.dialogRef.close(state),
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err?.error?.detail ?? 'Failed to create release.';
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
