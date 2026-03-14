import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
import { AuthService, UserSummary } from '../../../core/services/auth.service';

@Component({
  selector: 'app-manage-users-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule,
    MatTableModule, MatChipsModule, MatTooltipModule, MatProgressSpinnerModule, MatDividerModule,
  ],
  templateUrl: './manage-users-dialog.component.html',
  styles: [`
    .add-form { background: #f5f7ff; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .form-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .form-row mat-form-field { flex: 1; min-width: 150px; }
    .error-msg { color: #c62828; font-size: 13px; margin-top: 8px; }
    .chip-admin { background: #e3f2fd; color: #1565c0; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .chip-user  { background: #f3e5f5; color: #6a1b9a; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }
  `],
})
export class ManageUsersDialogComponent implements OnInit {
  users: UserSummary[] = [];
  displayedColumns = ['username', 'role', 'has_token', 'actions'];
  loading = true;
  saving = false;
  errorMessage = '';

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<ManageUsersDialogComponent>,
    private auth: AuthService
  ) {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      role: ['user', Validators.required],
    });
  }

  ngOnInit(): void {
    this.loadUsers();
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

  close(): void { this.dialogRef.close(); }
}
