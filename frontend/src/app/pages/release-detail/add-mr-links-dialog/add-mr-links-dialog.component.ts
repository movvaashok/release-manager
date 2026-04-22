import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ReleaseService } from '../../../core/services/release.service';

interface MRLink {
  repo_name: string;
  mr_url: string;
}

@Component({
  selector: 'app-add-mr-links-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './add-mr-links-dialog.component.html',
  styleUrls: ['./add-mr-links-dialog.component.scss'],
})
export class AddMrLinksDialogComponent implements OnInit {
  // Bulk add mode
  bulkText = '';
  bulkMRs: MRLink[] = [];
  bulkError = '';

  // Single add mode
  selectedRepo = '';
  singleMrUrl = '';
  singleError = '';

  saving = false;

  constructor(
    public dialogRef: MatDialogRef<AddMrLinksDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { version: string; stage3Repos: any[]; releaseService: ReleaseService },
  ) {}

  ngOnInit(): void {
    // Pre-populate with first repo if available
    if (this.data.stage3Repos && this.data.stage3Repos.length > 0) {
      this.selectedRepo = this.data.stage3Repos[0].name;
    }
  }

  /**
   * Parse bulk input (paste multiple URLs, one per line, with optional repo name before URL)
   * Formats accepted:
   * - https://gitlab.com/.../-/merge_requests/123
   * - repo-name https://gitlab.com/.../-/merge_requests/123
   * - repo-name: https://gitlab.com/.../-/merge_requests/123
   */
  parseBulkInput(): void {
    this.bulkError = '';
    this.bulkMRs = [];

    const lines = this.bulkText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    for (const line of lines) {
      // Try to extract URL
      const urlMatch = line.match(/(https:\/\/[^\s]+\/-\/merge_requests\/\d+)/);
      if (!urlMatch) {
        this.bulkError = `Invalid URL in line: "${line}". Expected format: https://gitlab.com/.../-/merge_requests/123`;
        return;
      }

      const mrUrl = urlMatch[1];

      // Try to extract repo name from the line before the URL
      let repoName = '';
      const beforeUrl = line.substring(0, line.indexOf(mrUrl)).trim();
      if (beforeUrl) {
        repoName = beforeUrl.replace(/[:]/g, '').trim();
      }

      // If no repo name provided, try to extract from URL
      if (!repoName) {
        // Extract project path from URL
        // URL format: https://gitlab.com/project-path/-/merge_requests/123
        const pathMatch = mrUrl.match(/gitlab\.com\/(.+?)\/-\/merge_requests/);
        if (pathMatch) {
          repoName = pathMatch[1].split('/').pop() || '';
        }
      }

      if (!repoName) {
        this.bulkError = `Could not determine repository name for: ${mrUrl}`;
        return;
      }

      this.bulkMRs.push({ repo_name: repoName, mr_url: mrUrl });
    }

    if (this.bulkMRs.length === 0) {
      this.bulkError = 'No valid MR links found';
    }
  }

  addBulkMRs(): void {
    this.parseBulkInput();
    if (this.bulkError || this.bulkMRs.length === 0) return;

    this.saving = true;
    this.data.releaseService.addMrLinks(this.data.version, this.bulkMRs).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err: any) => {
        this.saving = false;
        this.bulkError = err?.error?.detail || 'Failed to add MR links';
      },
    });
  }

  addSingleMR(): void {
    this.singleError = '';

    if (!this.selectedRepo) {
      this.singleError = 'Please select a repository';
      return;
    }

    if (!this.singleMrUrl) {
      this.singleError = 'Please enter an MR URL';
      return;
    }

    // Validate URL format
    if (!this.singleMrUrl.match(/https:\/\/[^\s]+\/-\/merge_requests\/\d+/)) {
      this.singleError = 'Invalid MR URL format. Expected: https://gitlab.com/.../-/merge_requests/123';
      return;
    }

    this.saving = true;
    const mrLinks: MRLink[] = [{ repo_name: this.selectedRepo, mr_url: this.singleMrUrl }];
    this.data.releaseService.addMrLinks(this.data.version, mrLinks).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (err: any) => {
        this.saving = false;
        this.singleError = err?.error?.detail || 'Failed to add MR link';
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
