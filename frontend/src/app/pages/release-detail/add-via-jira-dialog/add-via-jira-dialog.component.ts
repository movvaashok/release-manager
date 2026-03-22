import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';

import { JiraService } from '../../../core/services/jira.service';
import { ReleaseService } from '../../../core/services/release.service';
import { JiraTicket, RepoReference, RepoWithTickets } from '../../../core/models/release.model';

type Step = 'tickets' | 'repos';

function normalize(s: string): string {
  return s.toLowerCase().replace(/_/g, ' ').trim();
}

@Component({
  selector: 'app-add-via-jira-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDividerModule,
    MatListModule,
    MatTooltipModule,
  ],
  templateUrl: './add-via-jira-dialog.component.html',
})
export class AddViaJiraDialogComponent implements OnInit {
  step: Step = 'tickets';

  tickets: JiraTicket[] = [];
  selectedTicketKeys = new Set<string>();
  expandedTickets = new Set<string>();
  collapsedGroups = new Set<string>();
  loadingTickets = true;
  ticketError = '';

  matchedRepos: RepoReference[] = [];
  otherRepos: RepoReference[] = [];
  selectedRepos = new Set<string>();
  loadingRepos = false;

  submitting = false;
  errorMessage = '';

  constructor(
    private dialogRef: MatDialogRef<AddViaJiraDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { version: string; existingRepoNames: string[] },
    private jiraService: JiraService,
    private releaseService: ReleaseService,
  ) {}

  ngOnInit(): void {
    this.jiraService.getTickets(this.data.version).subscribe({
      next: (tickets) => {
        this.tickets = tickets;
        this.loadingTickets = false;
      },
      error: (err) => {
        this.loadingTickets = false;
        this.ticketError = err?.error?.detail ?? 'Failed to fetch Jira tickets.';
      },
    });
  }

  toggleTicket(key: string): void {
    if (this.selectedTicketKeys.has(key)) this.selectedTicketKeys.delete(key);
    else this.selectedTicketKeys.add(key);
  }

  toggleExpand(key: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedTickets.has(key)) this.expandedTickets.delete(key);
    else this.expandedTickets.add(key);
  }

  toggleAllTickets(): void {
    if (this.selectedTicketKeys.size === this.tickets.length) this.selectedTicketKeys.clear();
    else this.tickets.forEach((t) => this.selectedTicketKeys.add(t.key));
  }

  get allTicketsSelected(): boolean {
    return this.tickets.length > 0 && this.selectedTicketKeys.size === this.tickets.length;
  }

  // ── Status grouping ──────────────────────────────────────────────────────
  // Known statuses: Done | Ready for QA, IN TESTING | In Progress, Selected for development, Abandoned
  private statusGroup(status: string): 0 | 1 | 2 {
    const s = status.toLowerCase().trim();
    // Group 0 — Done
    if (s === 'done' || s === 'resolved' || s === 'closed' || s === 'fixed' ||
        s.includes('done') || s.includes('resolved') || s.includes('closed') || s.includes('fixed')) return 0;
    // Group 1 — Testing / QA
    if (s.includes('testing') || s.includes('ready for qa') || s.includes('ready to test') ||
        s.includes('in qa') || /\bqa\b/.test(s)) return 1;
    // Group 2 — In Progress, Selected for development, Abandoned, and anything else
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

  isGroupCollapsed(group: string): boolean {
    return this.collapsedGroups.has(group);
  }

  toggleGroup(group: string): void {
    if (this.collapsedGroups.has(group)) this.collapsedGroups.delete(group);
    else this.collapsedGroups.add(group);
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

  get uniqueComponents(): string[] {
    const selected = this.tickets.filter(t => this.selectedTicketKeys.has(t.key));
    const set = new Set<string>(selected.flatMap(t => t.components));
    set.delete('NO_CODE_CHANGE');
    return Array.from(set).filter(c => c.toUpperCase() !== 'NO_CODE_CHANGE').sort((a, b) => a.localeCompare(b));
  }

  filteredComponents(components: string[]): string[] {
    return components.filter(c => c.toUpperCase() !== 'NO_CODE_CHANGE');
  }

  statusClass(status: string): string {
    const group = this.statusGroup(status);
    if (group === 0) return 'status-done';
    if (group === 1) return 'status-testing';
    return 'status-inprogress';
  }

  proceedToRepos(): void {
    if (this.selectedTicketKeys.size === 0) return;
    this.loadingRepos = true;
    this.errorMessage = '';

    const selected = this.tickets.filter((t) => this.selectedTicketKeys.has(t.key));
    const componentNames = new Set(selected.flatMap((t) => t.components.map((c) => normalize(c))));
    const existingSet = new Set(this.data.existingRepoNames.map((n) => n.toLowerCase()));

    this.releaseService.getReferences().subscribe({
      next: (repos) => {
        const available = repos.filter((r) => !existingSet.has(r.name.toLowerCase()));
        this.matchedRepos = available.filter((r) => componentNames.has(normalize(r.name)));
        this.otherRepos = available.filter((r) => !componentNames.has(normalize(r.name)));
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

  toggleRepo(name: string): void {
    if (this.selectedRepos.has(name)) this.selectedRepos.delete(name);
    else this.selectedRepos.add(name);
  }

  /** Build a per-repo ticket list from the selected tickets. */
  private buildReposWithTickets(): RepoWithTickets[] {
    const selectedTickets = this.tickets.filter(t => this.selectedTicketKeys.has(t.key));
    return Array.from(this.selectedRepos).map(repoName => {
      // A ticket is associated with this repo if the repo name appears in the
      // ticket's components (case-insensitive, underscore-normalised match)
      const tickets = selectedTickets
        .filter(t => t.components.some(c => normalize(c) === normalize(repoName)))
        .map(t => t.key);
      return { name: repoName, jira_tickets: tickets };
    });
  }

  submit(): void {
    if (this.selectedRepos.size === 0) return;
    this.submitting = true;
    this.errorMessage = '';
    const repos = this.buildReposWithTickets();
    this.releaseService.addReposWithTickets(this.data.version, repos).subscribe({
      next: (state) => this.dialogRef.close(state),
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err?.error?.detail ?? 'Failed to add repositories.';
      },
    });
  }

  back(): void {
    this.errorMessage = '';
    this.step = 'tickets';
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
