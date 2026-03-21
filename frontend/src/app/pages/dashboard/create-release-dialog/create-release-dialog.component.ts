import { Component } from '@angular/core';
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
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ReleaseService } from '../../../core/services/release.service';
import { JiraService } from '../../../core/services/jira.service';
import { JiraTicket, RepoReference } from '../../../core/models/release.model';

type DialogStep = 'version' | 'tickets' | 'repos';

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
    MatChipsModule,
    MatCheckboxModule,
  ],
  templateUrl: './create-release-dialog.component.html',
})
export class CreateReleaseDialogComponent {
  form: FormGroup;
  step: DialogStep = 'version';

  // Jira state
  tickets: JiraTicket[] = [];
  selectedTicketKeys = new Set<string>();
  loadingTickets = false;

  // Repo state
  repos: RepoReference[] = [];
  selectedRepos = new Set<string>();
  loadingRepos = false;

  submitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateReleaseDialogComponent>,
    private releaseService: ReleaseService,
    private jiraService: JiraService,
  ) {
    this.form = this.fb.group({
      version: ['', [Validators.required, Validators.pattern(/^\d+\.\d+\.\d+$/)]],
    });
  }

  fetchTickets(): void {
    if (!this.form.valid) return;
    this.loadingTickets = true;
    this.errorMessage = '';
    this.tickets = [];
    this.selectedTicketKeys.clear();

    this.jiraService.getTickets(this.form.value.version).subscribe({
      next: (tickets) => {
        this.tickets = tickets;
        this.loadingTickets = false;
        this.step = 'tickets';
      },
      error: (err) => {
        this.loadingTickets = false;
        this.errorMessage = err?.error?.detail ?? 'Failed to fetch Jira tickets.';
      },
    });
  }

  // ── Status grouping ──────────────────────────────────────────────────────
  // Known statuses: Done | Ready for QA, IN TESTING | In Progress, Selected for development, Abandoned
  private statusGroup(status: string): 0 | 1 | 2 {
    const s = status.toLowerCase().trim();
    if (s === 'done' || s === 'resolved' || s === 'closed' || s === 'fixed' ||
        s.includes('done') || s.includes('resolved') || s.includes('closed') || s.includes('fixed')) return 0;
    if (s.includes('testing') || s.includes('ready for qa') || s.includes('ready to test') ||
        s.includes('in qa') || /\bqa\b/.test(s)) return 1;
    return 2;
  }

  get doneTickets(): JiraTicket[] {
    return this.tickets.filter(t => this.statusGroup(t.status) === 0);
  }

  get testingTickets(): JiraTicket[] {
    return this.tickets.filter(t => this.statusGroup(t.status) === 1);
  }

  get otherTickets(): JiraTicket[] {
    return this.tickets.filter(t => this.statusGroup(t.status) === 2);
  }

  allInGroupSelected(group: JiraTicket[]): boolean {
    return group.length > 0 && group.every(t => this.selectedTicketKeys.has(t.key));
  }

  toggleGroupSelection(group: JiraTicket[]): void {
    if (this.allInGroupSelected(group)) {
      group.forEach(t => this.selectedTicketKeys.delete(t.key));
    } else {
      group.forEach(t => this.selectedTicketKeys.add(t.key));
    }
  }

  statusClass(status: string): string {
    const group = this.statusGroup(status);
    if (group === 0) return 'status-done';
    if (group === 1) return 'status-testing';
    return 'status-inprogress';
  }

  toggleTicket(key: string): void {
    if (this.selectedTicketKeys.has(key)) {
      this.selectedTicketKeys.delete(key);
    } else {
      this.selectedTicketKeys.add(key);
    }
  }

  toggleAllTickets(): void {
    if (this.selectedTicketKeys.size === this.tickets.length) {
      this.selectedTicketKeys.clear();
    } else {
      this.tickets.forEach((t) => this.selectedTicketKeys.add(t.key));
    }
  }

  useSelectedTickets(): void {
    if (this.selectedTicketKeys.size === 0) return;
    this.loadingRepos = true;
    this.errorMessage = '';

    const selectedTickets = this.tickets.filter((t) => this.selectedTicketKeys.has(t.key));
    const componentNames = new Set<string>();
    selectedTickets.forEach((t) => t.components.forEach((c) => componentNames.add(c)));

    this.releaseService.getReferences().subscribe({
      next: (repos) => {
        this.repos = repos;
        this.selectedRepos.clear();
        const lowerComponents = new Set([...componentNames].map((c) => c.toLowerCase()));
        repos.forEach((r) => {
          if (lowerComponents.has(r.name.toLowerCase())) {
            this.selectedRepos.add(r.name);
          }
        });
        this.loadingRepos = false;
        this.step = 'repos';
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

  toggleAllRepos(): void {
    if (this.selectedRepos.size === this.repos.length) {
      this.selectedRepos.clear();
    } else {
      this.repos.forEach((r) => this.selectedRepos.add(r.name));
    }
  }

  get allTicketsSelected(): boolean {
    return this.tickets.length > 0 && this.selectedTicketKeys.size === this.tickets.length;
  }

  get allReposSelected(): boolean {
    return this.repos.length > 0 && this.selectedRepos.size === this.repos.length;
  }

  get canSubmit(): boolean {
    return this.step === 'repos' && this.form.valid && this.selectedRepos.size > 0 && !this.submitting;
  }

  get stepLabel(): string {
    const labels: Record<DialogStep, string> = {
      version: 'Step 1 of 3 — Enter Version',
      tickets: 'Step 2 of 3 — Select Jira Tickets',
      repos: 'Step 3 of 3 — Confirm Repositories',
    };
    return labels[this.step];
  }

  back(): void {
    this.errorMessage = '';
    if (this.step === 'tickets') this.step = 'version';
    else if (this.step === 'repos') this.step = 'tickets';
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitting = true;
    this.errorMessage = '';
    this.releaseService
      .createRelease({ version: this.form.value.version, repo_names: Array.from(this.selectedRepos) })
      .subscribe({
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
