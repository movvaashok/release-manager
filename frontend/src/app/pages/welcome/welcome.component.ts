import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="welcome-container">
      <div class="welcome-card">
        <mat-icon class="logo-icon">rocket_launch</mat-icon>
        <h1>Pioneer Release Manager</h1>
        <p class="subtitle">
          Automate release branch management and merge request creation
          across your GitLab repositories.
        </p>
        <button mat-raised-button color="primary" class="start-btn" (click)="start()">
          <mat-icon>arrow_forward</mat-icon>
          Get Started
        </button>
      </div>
    </div>
  `,
  styles: [`
    .welcome-container {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%);
    }
    .welcome-card {
      background: white;
      border-radius: 16px;
      padding: 56px 64px;
      text-align: center;
      max-width: 480px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }
    .logo-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #1565c0;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: #1a237e;
      margin: 0 0 16px;
    }
    .subtitle {
      font-size: 15px;
      color: rgba(0,0,0,0.6);
      line-height: 1.6;
      margin-bottom: 36px;
    }
    .start-btn {
      padding: 8px 32px;
      font-size: 15px;
    }
  `],
})
export class WelcomeComponent {
  constructor(private router: Router) {}

  start(): void {
    this.router.navigate(['/releases']);
  }
}
