import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { JiraService } from '../../core/services/jira.service';
import { ReleaseService } from '../../core/services/release.service';
import { JiraTicket, RepoReference } from '../../core/models/release.model';

type Step = 'version' | 'tickets' | 'repos';

@Component({
  selector: 'app-new-release',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './new-release.component.html',
  styleUrls: ['./new-release.component.scss'],
})
export class NewReleaseComponent {
  form: FormGroup;
  step: Step = 'version';

  // Step 2 — Jira tickets
  tickets: JiraTicket[] = [];
  selectedTicketKeys = new Set<string>();
  loadingTickets = false;

  // Step 3 — Repos
  matchedRepos: RepoReference[] = [];
  otherRepos: RepoReference[] = [];
  selectedRepos = new Set<string>();
  loadingRepos = false;

  submitting = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private jiraService: JiraService,
    private releaseService: ReleaseService,
  ) {
    this.form = this.fb.group({
      version: ['', [Validators.required, Validators.pattern(/^\d+\.\d+\.\d+$/)]],
    });
  }

  get stepIndex(): number {
    return { version: 1, tickets: 2, repos: 3 }[this.step];
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────────

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

  // ── Step 2 ──────────────────────────────────────────────────────────────────

  toggleTicket(key: string): void {
    if (this.selectedTicketKeys.has(key)) this.selectedTicketKeys.delete(key);
    else this.selectedTicketKeys.add(key);
  }

  toggleAllTickets(): void {
    if (this.selectedTicketKeys.size === this.tickets.length) this.selectedTicketKeys.clear();
    else this.tickets.forEach((t) => this.selectedTicketKeys.add(t.key));
  }

  get allTicketsSelected(): boolean {
    return this.tickets.length > 0 && this.selectedTicketKeys.size === this.tickets.length;
  }

  proceedToRepos(): void {
    if (this.selectedTicketKeys.size === 0) return;
    this.loadingRepos = true;
    this.errorMessage = '';

    const selectedTickets = this.tickets.filter((t) => this.selectedTicketKeys.has(t.key));
    const componentNames = new Set<string>();
    selectedTickets.forEach((t) => t.components.forEach((c) => componentNames.add(c)));
    const lowerComponents = new Set([...componentNames].map((c) => c.toLowerCase()));

    this.releaseService.getReferences().subscribe({
      next: (repos) => {
        this.matchedRepos = repos.filter((r) => lowerComponents.has(r.name.toLowerCase()));
        this.otherRepos = repos.filter((r) => !lowerComponents.has(r.name.toLowerCase()));
        this.selectedRepos = new Set(this.matchedRepos.map((r) => r.name));
        this.loadingRepos = false;
        this.step = 'repos';
      },
      error: () => {
        this.loadingRepos = false;
        this.errorMessage = 'Failed to load repositories.';
      },
    });
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────────

  toggleRepo(name: string): void {
    if (this.selectedRepos.has(name)) this.selectedRepos.delete(name);
    else this.selectedRepos.add(name);
  }

  get canCreate(): boolean {
    return this.selectedRepos.size > 0 && !this.submitting;
  }

  createRelease(): void {
    if (!this.canCreate) return;
    this.submitting = true;
    this.errorMessage = '';

    this.releaseService
      .createRelease({ version: this.form.value.version, repo_names: Array.from(this.selectedRepos) })
      .subscribe({
        next: (state) => this.router.navigate(['/releases', state.version]),
        error: (err) => {
          this.submitting = false;
          this.errorMessage = err?.error?.detail ?? 'Failed to create release.';
        },
      });
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  back(): void {
    this.errorMessage = '';
    if (this.step === 'tickets') this.step = 'version';
    else if (this.step === 'repos') this.step = 'tickets';
  }

  goToDashboard(): void {
    this.router.navigate(['/releases']);
  }
}
