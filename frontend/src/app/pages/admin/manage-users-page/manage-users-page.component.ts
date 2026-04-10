import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthService, UserSummary } from '../../../core/services/auth.service';
import { ProjectService } from '../../../core/services/project.service';
import { Project } from '../../../core/models/release.model';

@Component({
  selector: 'app-manage-users-page',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule,
    MatTableModule, MatChipsModule, MatTooltipModule, MatProgressSpinnerModule, MatDividerModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="goBack()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span class="toolbar-spacer"></span>
      <h1>Manage Users</h1>
      <span class="toolbar-spacer"></span>
    </mat-toolbar>

    <div class="container">
      <!-- Add user form -->
      <div class="add-form">
        <div style="font-size:14px;font-weight:500;margin-bottom:12px;color:rgba(0,0,0,0.7);">Create New User</div>
        <form [formGroup]="form">
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Username</mat-label>
              <input matInput formControlName="username" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Password</mat-label>
              <input matInput type="password" formControlName="password" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Role</mat-label>
              <mat-select formControlName="role">
                <mat-option value="user">User</mat-option>
                <mat-option value="admin">Admin</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button mat-raised-button color="primary" [disabled]="form.invalid || saving" (click)="createUser()">
              <mat-spinner *ngIf="saving" diameter="16" style="display:inline-block;margin-right:6px;"></mat-spinner>
              Create User
            </button>
          </div>
        </form>
      </div>

      <mat-divider style="margin-bottom:16px;"></mat-divider>

      <div *ngIf="loading" style="text-align:center;padding:24px;"><mat-spinner diameter="32"></mat-spinner></div>

      <table *ngIf="!loading" mat-table [dataSource]="users" style="width:100%;">

        <ng-container matColumnDef="username">
          <th mat-header-cell *matHeaderCellDef>Username</th>
          <td mat-cell *matCellDef="let u"><strong>{{ u.username }}</strong></td>
        </ng-container>

        <ng-container matColumnDef="role">
          <th mat-header-cell *matHeaderCellDef>Role</th>
          <td mat-cell *matCellDef="let u">
            <span [class]="u.role === 'admin' ? 'chip-admin' : 'chip-user'">{{ u.role }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="has_token">
          <th mat-header-cell *matHeaderCellDef>GitLab Token</th>
          <td mat-cell *matCellDef="let u">
            <mat-icon *ngIf="u.has_token" style="color:#2e7d32;font-size:18px;">check_circle</mat-icon>
            <mat-icon *ngIf="!u.has_token" style="color:#bdbdbd;font-size:18px;">radio_button_unchecked</mat-icon>
          </td>
        </ng-container>

        <ng-container matColumnDef="projects">
          <th mat-header-cell *matHeaderCellDef>Projects</th>
          <td mat-cell *matCellDef="let u">
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button *ngFor="let p of allProjects"
                      mat-stroked-button
                      (click)="toggleProject(u, p.id)"
                      [style.border-color]="hasProject(u, p.id) ? '#1565c0' : '#bdbdbd'"
                      [style.color]="hasProject(u, p.id) ? '#1565c0' : '#9e9e9e'"
                      [style.background]="hasProject(u, p.id) ? '#e3f2fd' : 'transparent'"
                      style="min-width:0;padding:0 10px;height:28px;font-size:12px;line-height:28px;">
                <mat-icon *ngIf="hasProject(u, p.id)" style="font-size:14px;height:14px;width:14px;margin-right:2px;">check</mat-icon>
                {{ p.display_name }}
              </button>
              <span *ngIf="allProjects.length === 0" style="font-size:12px;color:#9e9e9e;">All</span>
            </div>
          </td>
        </ng-container>

        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let u" style="text-align:right;">
            <button mat-icon-button color="warn" (click)="deleteUser(u.username)" matTooltip="Delete user">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
      </table>

      <div *ngIf="errorMessage" class="error-msg">{{ errorMessage }}</div>
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
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }

    .add-form { background: #f5f7ff; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .form-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .form-row mat-form-field { flex: 1; min-width: 150px; }
    .error-msg { color: #c62828; font-size: 13px; margin-top: 8px; }
    .chip-admin { background: #e3f2fd; color: #1565c0; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .chip-user  { background: #f3e5f5; color: #6a1b9a; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  `]
})
export class ManageUsersPageComponent implements OnInit {
  users: UserSummary[] = [];
  allProjects: Project[] = [];
  displayedColumns = ['username', 'role', 'has_token', 'projects', 'actions'];
  loading = true;
  saving = false;
  errorMessage = '';

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private projectService: ProjectService,
    private router: Router,
  ) {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      role: ['user', Validators.required],
    });
  }

  ngOnInit(): void {
    this.allProjects = this.projectService.projects;
    // Note: Users are global, not project-specific, but we still load them here
    this.loadUsers();
  }

  goBack(): void {
    this.router.navigate(['/releases']);
  }

  loadUsers(): void {
    this.auth.getUsers().subscribe({
      next: (users) => { this.users = users; this.loading = false; },
      error: () => { this.loading = false; this.errorMessage = 'Failed to load users.'; },
    });
  }

  createUser(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.auth.createUser(this.form.value).subscribe({
      next: (user) => {
        this.users = [...this.users, user];
        this.form.reset({ role: 'user' });
        this.saving = false;
      },
      error: (err: any) => { this.saving = false; this.errorMessage = err?.error?.detail ?? 'Create failed.'; },
    });
  }

  deleteUser(username: string): void {
    if (!confirm(`Delete user "${username}"?`)) return;
    this.auth.deleteUser(username).subscribe({
      next: () => { this.users = this.users.filter(u => u.username !== username); },
      error: (err: any) => { this.errorMessage = err?.error?.detail ?? 'Delete failed.'; },
    });
  }

  hasProject(user: UserSummary, projectId: string): boolean {
    return user.projects?.includes(projectId) ?? false;
  }

  toggleProject(user: UserSummary, projectId: string): void {
    const current = user.projects ?? [];
    const updated = current.includes(projectId)
      ? current.filter(p => p !== projectId)
      : [...current, projectId];
    this.auth.updateUserProjects(user.username, updated).subscribe({
      next: (u) => {
        const idx = this.users.findIndex(x => x.username === u.username);
        if (idx >= 0) this.users = [...this.users.slice(0, idx), u, ...this.users.slice(idx + 1)];
      },
      error: (err: any) => { this.errorMessage = err?.error?.detail ?? 'Update failed.'; },
    });
  }

  projectLabel(projectId: string): string {
    return this.allProjects.find(p => p.id === projectId)?.display_name ?? projectId;
  }
}
