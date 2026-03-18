import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';
import { AuthService } from './auth.service';

const TIMEOUT_MS = 10 * 60 * 1000;   // 10 minutes
const WARN_BEFORE_MS = 2 * 60 * 1000; // warn at 8 minutes

@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private lastActivity = Date.now();
  private warningShown = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private snackBarRef: MatSnackBarRef<TextOnlySnackBar> | null = null;

  constructor(
    private auth: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
  ) {}

  start(): void {
    this.resetActivity();
    (['click', 'keydown', 'mousemove', 'touchstart'] as const).forEach((event) => {
      document.addEventListener(event, () => this.resetActivity(), { passive: true });
    });
    this.checkInterval = setInterval(() => this._check(), 30_000);
  }

  resetActivity(): void {
    this.lastActivity = Date.now();
    if (this.warningShown) {
      this.warningShown = false;
      this.snackBarRef?.dismiss();
      this.snackBarRef = null;
    }
  }

  private _check(): void {
    if (!this.auth.isLoggedIn()) return;
    const idle = Date.now() - this.lastActivity;

    if (idle >= TIMEOUT_MS) {
      this.snackBarRef?.dismiss();
      if (this.checkInterval) clearInterval(this.checkInterval);
      this.auth.logout();
      this.router.navigate(['/login'], { queryParams: { reason: 'timeout' } });
    } else if (idle >= TIMEOUT_MS - WARN_BEFORE_MS && !this.warningShown) {
      this.warningShown = true;
      this.snackBarRef = this.snackBar.open(
        'You will be logged out in 2 minutes due to inactivity.',
        'Stay Logged In',
        { duration: 120_000, panelClass: 'timeout-snackbar' },
      );
      this.snackBarRef.onAction().subscribe(() => this.resetActivity());
    }
  }
}
