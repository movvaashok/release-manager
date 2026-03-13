import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { ReleaseService } from '../../../core/services/release.service';
import { RepoReference, ReleaseState } from '../../../core/models/release.model';

@Component({
  selector: 'app-add-repos-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './add-repos-dialog.component.html',
})
export class AddReposDialogComponent implements OnInit {
  availableRepos: RepoReference[] = [];
  selectedRepos = new Set<string>();
  loadingRepos = true;
  submitting = false;
  errorMessage = '';

  constructor(
    private dialogRef: MatDialogRef<AddReposDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { version: string; existingRepoNames: string[] },
    private releaseService: ReleaseService
  ) {}

  ngOnInit(): void {
    this.releaseService.getReferences().subscribe({
      next: (repos) => {
        this.availableRepos = repos.filter(r => !this.data.existingRepoNames.includes(r.name));
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

  get canSubmit(): boolean {
    return this.selectedRepos.size > 0 && !this.submitting;
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitting = true;
    this.errorMessage = '';

    this.releaseService.addRepos(this.data.version, Array.from(this.selectedRepos)).subscribe({
      next: (state: ReleaseState) => this.dialogRef.close(state),
      error: (err: any) => {
        this.submitting = false;
        this.errorMessage = err?.error?.detail ?? 'Failed to add repositories.';
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
