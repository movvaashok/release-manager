import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService, LoginResponse } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-container">
      <div class="login-card">
        <mat-icon class="logo-icon">rocket_launch</mat-icon>
        <h1>Pioneer Release Manager</h1>

        <!-- Step 1: credentials -->
        <form *ngIf="step === 1" [formGroup]="credForm" (ngSubmit)="submitCredentials()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Username</mat-label>
            <input matInput formControlName="username" autocomplete="username" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Password</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="current-password" />
          </mat-form-field>

          <div *ngIf="errorMessage" class="error-msg">{{ errorMessage }}</div>

          <button mat-raised-button color="primary" class="full-width submit-btn"
                  type="submit" [disabled]="credForm.invalid || submitting">
            <mat-spinner *ngIf="submitting" diameter="18" style="display:inline-block;margin-right:8px;"></mat-spinner>
            Sign In
          </button>
        </form>

        <!-- Step 2: GitLab token (first login) -->
        <form *ngIf="step === 2" [formGroup]="tokenForm" (ngSubmit)="submitToken()">
          <p class="token-hint">
            Welcome, <strong>{{ pendingUsername }}</strong>! This is your first sign-in.<br>
            Please enter your GitLab personal access token.
          </p>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>GitLab Personal Access Token</mat-label>
            <input matInput formControlName="gitlab_token" placeholder="glpat-xxxxxxxxxxxx" />
            <mat-hint>Requires api scope in GitLab</mat-hint>
          </mat-form-field>

          <div *ngIf="errorMessage" class="error-msg">{{ errorMessage }}</div>

          <button mat-raised-button color="primary" class="full-width submit-btn"
                  type="submit" [disabled]="tokenForm.invalid || submitting">
            <mat-spinner *ngIf="submitting" diameter="18" style="display:inline-block;margin-right:8px;"></mat-spinner>
            Save & Continue
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);
    }
    .login-card {
      background: white;
      border-radius: 16px;
      padding: 48px 56px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      text-align: center;
    }
    .logo-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: #1565c0;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      color: #1a237e;
      margin: 0 0 28px;
    }
    .full-width { width: 100%; }
    .submit-btn { margin-top: 16px; padding: 8px; font-size: 15px; }
    .error-msg { color: #c62828; font-size: 13px; margin-bottom: 8px; }
    .token-hint { font-size: 14px; color: rgba(0,0,0,0.7); margin-bottom: 16px; text-align: left; line-height: 1.6; }
  `],
})
export class LoginComponent {
  step = 1;
  pendingUsername = '';
  submitting = false;
  errorMessage = '';

  credForm: FormGroup;
  tokenForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {
    this.credForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
    });
    this.tokenForm = this.fb.group({
      gitlab_token: ['', Validators.required],
    });
  }

  submitCredentials(): void {
    if (this.credForm.invalid) return;
    this.submitting = true;
    this.errorMessage = '';

    this.auth.login(this.credForm.value).subscribe({
      next: (res: LoginResponse) => {
        this.submitting = false;
        if (res.has_token) {
          this.auth.saveSession(res.username, res.gitlab_token!, res.role);
          this.router.navigate(['/']);
        } else {
          this.pendingUsername = res.username;
          this.step = 2;
        }
      },
      error: (err: any) => {
        this.submitting = false;
        this.errorMessage = err?.error?.detail ?? 'Login failed.';
      },
    });
  }

  submitToken(): void {
    if (this.tokenForm.invalid) return;
    this.submitting = true;
    this.errorMessage = '';

    this.auth.login({
      username: this.credForm.value.username,
      password: this.credForm.value.password,
      gitlab_token: this.tokenForm.value.gitlab_token,
    }).subscribe({
      next: () => {
        this.submitting = false;
        this.router.navigate(['/']);
      },
      error: (err: any) => {
        this.submitting = false;
        this.errorMessage = err?.error?.detail ?? 'Failed to save token.';
      },
    });
  }
}
